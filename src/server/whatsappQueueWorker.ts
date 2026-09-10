import { getWASocket, checkSocketAlive, ensureWhatsAppConnected } from './whatsapp.js';
import { fetchNextPendingItem, updateQueueItem, resetStalledItems, IWhatsAppQueue } from './models/WhatsAppQueue.js';

let isWorkerRunning = false;
let isProcessingBatch = false;
let workerIntervalId: NodeJS.Timeout | null = null;
let lastUnreadyLog = 0;

/**
 * Helper to generate delay between 1.5s to 2.5s (1500ms - 2500ms)
 * to prevent WhatsApp rate-limiting or number flagging
 */
const getAntiBanDelay = (): number => {
  return Math.floor(Math.random() * 1000) + 1500; // 1500 to 2500 ms
};

/**
 * Process a single queue item
 */
async function processNextQueueItem(): Promise<boolean> {
  // 1. Verify WhatsApp socket is alive and authenticated before pulling from queue
  // This completely prevents 1006 (abnormal closure) and unready socket errors
  const isAlive = typeof checkSocketAlive === 'function' ? checkSocketAlive() : false;
  if (!isAlive) {
    const sock = getWASocket();
    if (!sock) {
      return false; // Socket not initialized yet
    }
    const now = Date.now();
    if (now - lastUnreadyLog > 45000) {
      console.log('[WhatsApp Queue Worker] WhatsApp connection not ready or reconnecting. Pausing queue dispatch until socket opens...');
      lastUnreadyLog = now;
    }
    return false;
  }

  const sock = getWASocket();
  if (!sock) {
    return false;
  }

  const item = await fetchNextPendingItem();
  if (!item) {
    return false; // No pending items
  }

  let targetJid = String(item.recipient || item.to || '').trim();
  if (targetJid.includes('@g.us') || targetJid.includes('@newsletter') || targetJid.includes('@lid')) {
    // Keep group / newsletter JID
  } else {
    const cleanDigits = targetJid.replace(/\D/g, '');
    if (!cleanDigits) {
      console.warn(`[WhatsApp Queue Worker] Invalid recipient: ${targetJid}`);
      await updateQueueItem(item._id, {
        status: 'failed',
        error: 'Invalid recipient phone number'
      });
      return true;
    }
    // Ensure Indian mobile numbers have 91 country prefix if 10 digits
    const formattedPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
    targetJid = `${formattedPhone}@s.whatsapp.net`;
  }

  const rawText = String(item.message || item.text || '');
  const options = item.options || {};
  const mediaUrl = item.mediaUrl || options.imageUrl || options.documentUrl || options.videoUrl;

  try {
    console.log(`[WhatsApp Queue Worker] Dispatching message to ${targetJid} (queueId: ${item._id}, priority: ${item.priority ?? 3})`);

    // Prepare payload
    let msgPayload: any = null;

    if (mediaUrl) {
      if (mediaUrl.match(/\.(jpeg|jpg|png|webp)($|\?)/i) || options.imageUrl) {
        msgPayload = {
          image: { url: mediaUrl },
          caption: rawText
        };
      } else if (mediaUrl.match(/\.(mp4|mov|avi)($|\?)/i) || options.videoUrl) {
        msgPayload = {
          video: { url: mediaUrl },
          caption: rawText,
          gifPlayback: options.asGif || false
        };
      } else {
        msgPayload = {
          document: { url: mediaUrl },
          fileName: options.fileName || 'document.pdf',
          caption: rawText,
          mimetype: options.mimetype || 'application/pdf'
        };
      }
    } else if (options.buttons || options.templateButtons || options.sections) {
      const buttons = options.buttons || options.templateButtons || [];
      let formattedText = rawText;
      if (buttons.length > 0 && !formattedText.includes('1.') && !formattedText.toLowerCase().includes('option')) {
        const optionsList = buttons.map((b: any, i: number) => {
          const label = b.buttonText?.displayText || b.text || b.title || "Option";
          return `${i + 1}. ${label}`;
        }).join('\n');
        formattedText += `\n\n📌 *Options:*\n${optionsList}\n\n_Reply with option number or keyword_`;
      }
      msgPayload = { text: formattedText };
    } else {
      msgPayload = { text: rawText };
    }

    const SEND_TIMEOUT_MS = 25000;
    const sendPromise = sock.sendMessage(targetJid, msgPayload);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('WhatsApp dispatch timed out after 25 seconds')), SEND_TIMEOUT_MS)
    );

    const result = await Promise.race([sendPromise, timeoutPromise]);
    const waMessageId = (result as any)?.key?.id;

    // On success, update status to 'sent' and record waMessageId and sentAt in MongoDB whatsapp_queue
    await updateQueueItem(item._id, {
      status: 'sent',
      sentAt: new Date(),
      waMessageId,
      error: undefined
    });

    console.log(`[WhatsApp Queue Worker] Successfully sent message to ${targetJid} (waMessageId: ${waMessageId || 'ok'})`);
  } catch (error: any) {
    const rawMsg = String(error?.message || error?.toString?.() || error || '');
    const statusCode = error?.statusCode || error?.output?.statusCode || error?.status;
    const isConnErr = 
      statusCode === 1006 ||
      statusCode === 408 ||
      statusCode === 428 ||
      statusCode === 515 ||
      rawMsg.includes('1006') ||
      rawMsg.includes('Connection Closed') ||
      rawMsg.includes('connection closed') ||
      rawMsg.includes('connection lost') ||
      rawMsg.includes('timed out') ||
      rawMsg.includes('timeout') ||
      rawMsg.includes('socket') ||
      rawMsg.includes('stream closed') ||
      rawMsg.includes('closed') ||
      rawMsg.includes('econnreset') ||
      rawMsg.includes('not connected');

    if (isConnErr) {
      console.warn(`[WhatsApp Queue Worker] Connection issue delivering to ${targetJid} (${statusCode || rawMsg}). Re-queuing message for automatic redelivery upon reconnection.`);
      // Do not penalize attempt count for transient socket drops (1006/close)
      const currentAttempts = Math.max(0, (item.attempts || 1) - 1);
      await updateQueueItem(item._id, {
        status: 'pending',
        error: `Awaiting WhatsApp reconnection (${statusCode || 1006})`,
        attempts: currentAttempts
      });

      // Background connection refresh
      if (typeof ensureWhatsAppConnected === 'function') {
        ensureWhatsAppConnected(12000).catch(() => {});
      }
    } else {
      console.error(`[WhatsApp Queue Worker] Failed to send message to ${targetJid}:`, rawMsg);
      const attempts = (item.attempts || 1);
      await updateQueueItem(item._id, {
        status: attempts >= 3 ? 'failed' : 'pending',
        error: rawMsg,
        attempts
      });
    }
  }

  // Add delay between dispatches for normal messages to prevent WhatsApp rate-limiting or number flagging
  // Emergency P0 items (such as OTP, outpass, security codes) dispatch immediately with 0 delay
  const delayMs = item.priority === 0 ? 0 : getAntiBanDelay();
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return true;
}

/**
 * Trigger immediate queue processing without waiting for interval
 */
export function triggerQueueProcessing(): void {
  if (isProcessingBatch) return;
  setImmediate(async () => {
    if (isProcessingBatch) return;
    isProcessingBatch = true;
    try {
      let hasMore = true;
      let count = 0;
      while (hasMore && count < 5) {
        hasMore = await processNextQueueItem();
        count++;
      }
    } catch (_) {
    } finally {
      isProcessingBatch = false;
    }
  });
}

/**
 * Automated background loop (every 1.5 - 2.5 seconds)
 */
export function startWhatsAppQueueWorker(): void {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  console.log('[WhatsApp Queue Worker] Background worker initialized...');

  // Reset any stalled messages from previous runs
  resetStalledItems().catch(() => {});

  workerIntervalId = setInterval(async () => {
    if (isProcessingBatch) return;
    isProcessingBatch = true;

    try {
      // Process pending items
      let hasMore = true;
      let count = 0;
      while (hasMore && count < 5) {
        hasMore = await processNextQueueItem();
        count++;
      }
    } catch (err: any) {
      console.warn('[WhatsApp Queue Worker] Loop notice:', err?.message || err);
    } finally {
      isProcessingBatch = false;
    }
  }, 1500);
}

export function stopWhatsAppQueueWorker(): void {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
  isWorkerRunning = false;
}

