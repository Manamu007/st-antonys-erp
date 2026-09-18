import { getWASocket, checkSocketAlive, ensureWhatsAppConnected } from './whatsapp.js';
import { fetchNextPendingItem, updateQueueItem, resetStalledItems, IWhatsAppQueue } from './models/WhatsAppQueue.js';
import { applyAntiBanVariation } from './whatsappUtils.js';

let isWorkerRunning = false;
let isProcessingItem = false;
let wakeUpResolver: (() => void) | null = null;
let lastUnreadyLog = 0;

// Rolling window rate limiter: strictly 3 to 4 messages per minute
const MAX_MESSAGES_PER_MINUTE = 4;
const WINDOW_DURATION_MS = 60000;
let recentSentTimestamps: number[] = [];

// Consecutive burst tracking for human cooling breaks
let consecutiveMessagesCount = 0;
const BATCH_COOLING_THRESHOLD = 12; // Pause after 12 continuous messages
const BATCH_COOLING_DURATION_MS = 45000; // 45-60s cooling rest

// In-memory cache for attendance absent alerts & daily notices deduplication
// Stores keys like `absent_student_${studentId}_${date}`, `absent_phone_${phone}_${date}`, `idemp_${key}`
const recentSentAlertsCache = new Map<string, number>();

function cleanOldSentAlertsCache(): void {
  const now = Date.now();
  for (const [k, ts] of recentSentAlertsCache.entries()) {
    if (now - ts > 24 * 60 * 60 * 1000) {
      recentSentAlertsCache.delete(k);
    }
  }
}

/**
 * Helper to generate delay strictly complying with Meta rate limits:
 * 3 to 4 messages per minute = 15,000ms to 20,000ms delay between messages
 * with natural human-like jitter.
 */
export const getAntiBanDelay = (priority: number = 3): number => {
  if (priority === 0) {
    // P0 emergency (OTP, security verification, gate pass) - fast with slight jitter
    return Math.floor(Math.random() * 1000) + 1500; // 1.5s to 2.5s
  }
  // Standard P1 Attendance, P2 Fees/Results, P3 Broadcasts:
  // 3 to 4 messages per minute = 15s to 20s (15,000 to 20,000 ms)
  const min = 15000;
  const max = 20000;
  return Math.floor(min + Math.random() * (max - min));
};

/**
 * Meta Anti-Ban Rate Limiter & Human Simulation:
 * 1. Enforces strict sliding 60-second window (max 4 msgs/min).
 * 2. Implements batch cooling breaks after consecutive dispatches.
 * 3. Simulates human presence (typing/composing) before sending.
 */
async function enforceMetaAntiBanRateLimit(priority: number, targetJid: string, sock: any, textLength: number): Promise<void> {
  const isEmergency = priority === 0;

  if (!isEmergency) {
    // 1. Sliding 60-second window check (maximum 4 messages per 60 seconds)
    const now = Date.now();
    recentSentTimestamps = recentSentTimestamps.filter(t => now - t < WINDOW_DURATION_MS);

    if (recentSentTimestamps.length >= MAX_MESSAGES_PER_MINUTE) {
      const oldest = recentSentTimestamps[0];
      const timeToWait = Math.max(1000, (WINDOW_DURATION_MS - (now - oldest)) + Math.floor(Math.random() * 2500) + 1000);
      console.log(`[WhatsApp Anti-Ban Rate Limiter] 4 messages sent in last 60s. Throttling for ${(timeToWait / 1000).toFixed(1)}s to strictly maintain 3-4 msgs/min Meta guidelines...`);
      await new Promise(resolve => setTimeout(resolve, timeToWait));
      // Refresh timestamps after waiting
      const updatedNow = Date.now();
      recentSentTimestamps = recentSentTimestamps.filter(t => updatedNow - t < WINDOW_DURATION_MS);
    }

    // 2. Batch cooling break check (after every 12 messages sent in bulk)
    if (consecutiveMessagesCount >= BATCH_COOLING_THRESHOLD) {
      const coolTime = Math.floor(BATCH_COOLING_DURATION_MS + Math.random() * 15000); // 45s - 60s
      console.log(`[WhatsApp Anti-Ban] Cooling break active: Dispatched ${consecutiveMessagesCount} messages. Resting for ${(coolTime / 1000).toFixed(1)}s to simulate natural human activity and prevent Meta velocity flagging.`);
      await new Promise(resolve => setTimeout(resolve, coolTime));
      consecutiveMessagesCount = 0;
    }
  }

  // 3. Human Presence Simulation: Send composing/typing indicator
  if (sock && typeof sock.sendPresenceUpdate === 'function') {
    try {
      await sock.sendPresenceUpdate('composing', targetJid);
      // Realistic human typing duration based on message length (1.8s - 3.5s)
      const typingDuration = isEmergency 
        ? 1000 
        : Math.min(3500, Math.max(1800, textLength * 20));
      await new Promise(resolve => setTimeout(resolve, typingDuration));
      await sock.sendPresenceUpdate('paused', targetJid);
    } catch (presenceErr: any) {
      // Non-fatal, proceed with message sending
    }
  }
}

/**
 * Process a single queue item with full Meta Anti-Ban safeguards
 */
export async function processNextQueueItem(): Promise<boolean> {
  // Prevent concurrent execution of multiple queue items
  if (isProcessingItem) {
    return false;
  }
  isProcessingItem = true;

  try {
    // 1. Verify WhatsApp socket is alive and authenticated before pulling from queue
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
    let cleanDigits = '';
    if (targetJid.includes('@g.us') || targetJid.includes('@newsletter') || targetJid.includes('@lid')) {
      // Keep group / newsletter JID
    } else {
      cleanDigits = targetJid.replace(/\D/g, '');
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

    const options = item.options || {};
    const rawMessageText = String(item.message || item.text || '').trim();

    const isAbsentNotice = 
      options.templateType === 'absent' || 
      options.messageType === 'attendance_absent' || 
      options.eventType === 'absent' ||
      rawMessageText.toLowerCase().includes('marked *absent*') ||
      rawMessageText.toLowerCase().includes('marked absent');

    const cleanPhone = cleanDigits || targetJid.split('@')[0];
    const dateToday = options.date || new Date().toISOString().split('T')[0];

    // Pre-Dispatch Deduplication Safeguard:
    // If an identical or duplicate message was ALREADY sent, prevent sending it again!
    if (!options.forceSend) {
      cleanOldSentAlertsCache();

      // 1. Fast in-memory deduplication check (catches rapid duplicate dispatches)
      if (isAbsentNotice) {
        const studentId = options.studentId ? String(options.studentId).trim() : '';
        const absentKeysToCheck: string[] = [];
        if (studentId) {
          absentKeysToCheck.push(`absent_student_${studentId}_${dateToday}`);
        }
        absentKeysToCheck.push(`absent_phone_${cleanPhone.slice(-10)}_${dateToday}`);
        if (item.idempotencyKey) {
          absentKeysToCheck.push(`idemp_${item.idempotencyKey}`);
        }

        for (const k of absentKeysToCheck) {
          const lastSent = recentSentAlertsCache.get(k);
          if (lastSent && (Date.now() - lastSent) < 24 * 60 * 60 * 1000) {
            console.warn(`[WhatsApp Queue Worker Deduplication] Suppressed duplicate absent notice for ${k} (already delivered ${(Date.now() - lastSent) / 1000}s ago).`);
            await updateQueueItem(item._id, {
              status: 'sent',
              waMessageId: 'duplicate_suppressed',
              error: undefined
            });
            return true;
          }
        }
      }

      // 2. Persistent DB / Collection check
      try {
        const { WhatsAppQueue } = await import('./models/WhatsAppQueue.js');
        const isDailyNotice = isAbsentNotice ||
          options.templateType === 'exam_result' || 
          options.templateType === 'fee_receipt' ||
          options.messageType === 'marks_result' ||
          options.messageType === 'payment_receipt';
        
        const dedupTimeWindowMs = isDailyNotice ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
        const searchPhone = cleanDigits || targetJid.split('@')[0];

        // A. Deduplication by idempotencyKey
        if (item.idempotencyKey) {
          const sentWithKey = await WhatsAppQueue.findOne({
            _id: { $ne: item._id },
            idempotencyKey: item.idempotencyKey,
            status: 'sent'
          }).catch(() => null);

          if (sentWithKey) {
            console.warn(`[WhatsApp Queue Worker Deduplication] Blocked duplicate dispatch: idempotencyKey ${item.idempotencyKey} already delivered at ${sentWithKey.sentAt}`);
            await updateQueueItem(item._id, {
              status: 'sent',
              waMessageId: sentWithKey.waMessageId || 'duplicate_skipped',
              error: undefined
            });
            return true;
          }
        }

        // B. Absent notice student-level deduplication (one absent alert per student per day)
        if (isAbsentNotice && options.studentId) {
          const sentStudentNotice = await WhatsAppQueue.findOne({
            _id: { $ne: item._id },
            'options.studentId': options.studentId,
            status: 'sent',
            sentAt: { $gte: new Date(Date.now() - dedupTimeWindowMs) }
          }).catch(() => null);

          if (sentStudentNotice) {
            console.warn(`[WhatsApp Queue Worker Deduplication] Blocked duplicate absent notice for student ${options.studentId}: already sent at ${sentStudentNotice.sentAt}`);
            await updateQueueItem(item._id, {
              status: 'sent',
              waMessageId: sentStudentNotice.waMessageId || 'duplicate_skipped',
              error: undefined
            });
            return true;
          }
        }

        // C. Recipient + Content matching
        const alreadySent = await WhatsAppQueue.findOne({
          _id: { $ne: item._id },
          $and: [
            {
              $or: [
                { recipient: item.recipient },
                { recipient: searchPhone },
                { recipient: `91${searchPhone.replace(/^91/, '')}` },
                { to: item.recipient },
                { to: searchPhone }
              ]
            },
            {
              $or: [
                { message: rawMessageText },
                { text: rawMessageText }
              ]
            }
          ],
          status: 'sent',
          sentAt: { $gte: new Date(Date.now() - dedupTimeWindowMs) }
        }).catch(() => null);

        if (alreadySent) {
          console.warn(`[WhatsApp Queue Worker Deduplication] Blocked duplicate dispatch to ${targetJid}: identical message already delivered at ${alreadySent.sentAt}`);
          await updateQueueItem(item._id, {
            status: 'sent',
            waMessageId: alreadySent.waMessageId || 'duplicate_skipped',
            error: undefined
          });
          return true;
        }
      } catch (dedupCheckErr: any) {
        console.warn('[WhatsApp Queue Worker] Dedup check notice:', dedupCheckErr?.message);
      }
    }

    let rawText = rawMessageText;
    // Apply Anti-Ban variation to prevent duplicate text hash fingerprinting across recipients
    if (item.priority !== 0) {
      rawText = applyAntiBanVariation(rawText);
    }

    const mediaUrl = item.mediaUrl || options.imageUrl || options.documentUrl || options.videoUrl;

  try {
    const priorityVal = item.priority ?? 3;
    console.log(`[WhatsApp Queue Worker] Preparing dispatch to ${targetJid} (queueId: ${item._id}, priority: P${priorityVal})`);

    // Enforce Meta Anti-Ban Rate Limiter (3-4 msgs/min, sliding window, typing presence)
    await enforceMetaAntiBanRateLimit(priorityVal, targetJid, sock, rawText.length);

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

    // Track successfully sent timestamp in rolling 60s window
    recentSentTimestamps.push(Date.now());
    if (priorityVal !== 0) {
      consecutiveMessagesCount++;
    }

    // On success, update status to 'sent' and record waMessageId and sentAt in MongoDB whatsapp_queue
    await updateQueueItem(item._id, {
      status: 'sent',
      sentAt: new Date(),
      waMessageId,
      error: undefined
    });

    // Record in in-memory deduplication cache for absent alerts
    if (isAbsentNotice) {
      const studentId = options.studentId ? String(options.studentId).trim() : '';
      if (studentId) {
        recentSentAlertsCache.set(`absent_student_${studentId}_${dateToday}`, Date.now());
      }
      recentSentAlertsCache.set(`absent_phone_${cleanPhone.slice(-10)}_${dateToday}`, Date.now());
      if (item.idempotencyKey) {
        recentSentAlertsCache.set(`idemp_${item.idempotencyKey}`, Date.now());
      }
    }

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

  // Inter-message spacing: 15s - 20s for normal messages, ensuring strictly 3 to 4 messages per minute
  const delayMs = getAntiBanDelay(item.priority ?? 3);
  if (delayMs > 0) {
    console.log(`[WhatsApp Anti-Ban] Waiting ${(delayMs / 1000).toFixed(1)}s before next message (strictly pacing to 3-4 msgs/min)...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return true;
  } finally {
    isProcessingItem = false;
  }
}

/**
 * Trigger immediate queue processing when new items are enqueued
 */
export function triggerQueueProcessing(): void {
  if (wakeUpResolver) {
    wakeUpResolver();
    wakeUpResolver = null;
  }
}

/**
 * Continuous Meta Anti-Ban Queue Worker Loop.
 * Runs smoothly with 15-20s pacing per message (3-4 msgs/min) and interruptible idle sleep.
 */
export function startWhatsAppQueueWorker(): void {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  console.log('[WhatsApp Queue Worker] Background worker initialized with Meta Anti-Ban Engine (3-4 msgs/min)...');

  // Reset any stalled messages from previous runs
  resetStalledItems().catch(() => {});

  // Continuous pacing worker loop
  (async () => {
    while (isWorkerRunning) {
      try {
        const handled = await processNextQueueItem();
        if (!handled) {
          // If queue is empty or socket not ready, sleep with interruptible wait
          await new Promise<void>(resolve => {
            wakeUpResolver = resolve;
            setTimeout(() => {
              if (wakeUpResolver === resolve) {
                wakeUpResolver = null;
              }
              resolve();
            }, 3000);
          });
        }
      } catch (err: any) {
        console.warn('[WhatsApp Queue Worker] Loop notice:', err?.message || err);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  })();
}

export function stopWhatsAppQueueWorker(): void {
  isWorkerRunning = false;
  if (wakeUpResolver) {
    wakeUpResolver();
    wakeUpResolver = null;
  }
}

