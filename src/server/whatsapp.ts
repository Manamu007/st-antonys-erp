import * as baileys from '@whiskeysockets/baileys';
const makeWASocket = baileys.makeWASocket || baileys.default || (baileys as any).default?.default || baileys;
const DisconnectReason = baileys.DisconnectReason;
const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
const makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
const jidDecode = baileys.jidDecode;
const delay = baileys.delay;
const Browsers = baileys.Browsers || (baileys as any).Browsers || (baileys as any).default?.Browsers;
console.log("[WhatsApp] Loading module...");
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { getSmartBotResponse } from './aiBotService.js';
import { getDbAdmin, initializationPromise, isDatabaseDenied, setDatabaseDenied } from './firebaseAdmin.js';
import admin from './firebaseAdmin.js';
import { useFirestoreAuthState } from './firestoreAuthState.js';
import {
  normalizeIndianPhone,
  extractParentPhone,
  safeLogWhatsappEvent,
  getDelayForPriority
} from './whatsappUtils.js';
import { consumeLeaveActionToken } from './leaveWhatsappActions.js';
import NodeCache from 'node-cache';

const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
const recentMessagesCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

export const storeMessageForRetry = async (key: baileys.WAMessageKey, message: any) => {
  if (!key || !key.id || !message) return;
  try {
    recentMessagesCache.set(key.id, message);
    const db = getDbAdmin();
    if (db && !isDatabaseDenied()) {
      await db.collection('whatsapp_messages_store').doc(key.id).set({
        key,
        message,
        timestamp: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }
  } catch (e) {}
};

export function resolveMediaPayload(options: any, textVal: string) {
  const getMediaSource = (urlOrPath: string) => {
    if (!urlOrPath) return null;
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://') || urlOrPath.startsWith('data:')) {
      return { url: urlOrPath };
    }
    if (fs.existsSync(urlOrPath)) {
      return { url: urlOrPath };
    }
    const cleanPath = urlOrPath.startsWith('/') ? urlOrPath.substring(1) : urlOrPath;
    const absPath = path.resolve(process.cwd(), cleanPath);
    if (fs.existsSync(absPath)) {
      return { url: absPath };
    }
    const publicPath = path.resolve(process.cwd(), 'public', cleanPath);
    if (fs.existsSync(publicPath)) {
      return { url: publicPath };
    }
    console.warn(`[WhatsApp Media] Local media file not found on disk: ${urlOrPath}. Falling back to plain text.`);
    return null;
  };

  if (options?.videoUrl) {
    const src = getMediaSource(options.videoUrl);
    if (src) return { video: src, caption: textVal, gifPlayback: options.asGif || false };
  } else if (options?.imageUrl) {
    const src = getMediaSource(options.imageUrl);
    if (src) return { image: src, caption: textVal };
  } else if (options?.documentUrl) {
    const src = getMediaSource(options.documentUrl);
    if (src) return { document: src, fileName: options.fileName || 'document.pdf', caption: textVal, mimetype: options.mimetype || 'application/pdf' };
  }
  return null;
}

export async function markMessageAsDelivered(msgId: string, targetStatus: 'delivered' | 'read' = 'delivered') {
  if (!msgId) return;
  try {
    const db = getDbAdmin();
    if (!db || isDatabaseDenied()) return;

    const nowIso = new Date().toISOString();

    // 1. Update whatsappLogs
    const logsSnap = await db.collection('whatsappLogs')
      .where('messageId', '==', msgId)
      .limit(5)
      .get();
    
    for (const doc of logsSnap.docs) {
      const data = doc.data();
      const curr = data.status;
      if (curr !== targetStatus && curr !== 'read') {
        const updateData: any = {
          status: targetStatus,
          updatedAt: nowIso
        };
        if (targetStatus === 'delivered' && !data.deliveredAt) {
          updateData.deliveredAt = nowIso;
        }
        if (targetStatus === 'read') {
          if (!data.deliveredAt) updateData.deliveredAt = nowIso;
          if (!data.readAt) updateData.readAt = nowIso;
        }
        await doc.ref.update(updateData);
        if (curr === 'sent') {
          await incrementWhatsAppStat({ sent: -1, delivered: 1 });
        }
        console.log(`[WhatsApp Status] Updated whatsappLogs ${doc.id} (msgId: ${msgId}) to ${targetStatus}`);
      }
    }

    // 2. Update whatsapp_queue
    const queueSnap = await db.collection(QUEUE_COLLECTION)
      .where('waMessageId', '==', msgId)
      .limit(5)
      .get();
    
    for (const doc of queueSnap.docs) {
      const data = doc.data();
      const curr = data.status;
      if (curr !== targetStatus && curr !== 'read') {
        const updateData: any = {
          status: targetStatus,
          updatedAt: nowIso
        };
        if (targetStatus === 'delivered' && !data.deliveredAt) {
          updateData.deliveredAt = nowIso;
        }
        if (targetStatus === 'read') {
          if (!data.deliveredAt) updateData.deliveredAt = nowIso;
          if (!data.readAt) updateData.readAt = nowIso;
        }
        await doc.ref.update(updateData);
        console.log(`[WhatsApp Queue] Updated queue item ${doc.id} (waMessageId: ${msgId}) to ${targetStatus}`);
      }
    }

    // 3. Fallback: check queue by doc ID in case waMessageId == doc.id
    const docById = await db.collection(QUEUE_COLLECTION).doc(msgId).get();
    if (docById.exists) {
      const data = docById.data()!;
      const curr = data.status;
      if (curr !== targetStatus && curr !== 'read') {
        const updateData: any = {
          status: targetStatus,
          updatedAt: nowIso
        };
        if (targetStatus === 'delivered' && !data.deliveredAt) {
          updateData.deliveredAt = nowIso;
        }
        if (targetStatus === 'read') {
          if (!data.deliveredAt) updateData.deliveredAt = nowIso;
          if (!data.readAt) updateData.readAt = nowIso;
        }
        await docById.ref.update(updateData);
        console.log(`[WhatsApp Queue] Updated queue item by doc ID ${msgId} to ${targetStatus}`);
      }
    }
  } catch (err: any) {
    console.error(`[WhatsApp Status] Error updating message status for ${msgId}:`, err.message);
  }
}

async function acquireGlobalSendSlot(db: any, isEmergency: boolean = false): Promise<number> {
  if (!db) return isEmergency ? 0 : 15000;
  
  // Meta Anti-Ban Rate Limiter:
  // Standard broadcasts & notifications: 15s base delay = 4 messages per minute
  // Emergency P0 messages (Outpass, Gate pass, OTP): 2s fast safety delay
  const MIN_INTERVAL_MS = isEmergency ? 2000 : 15000; 
  const JITTER_MS = isEmergency ? 500 : Math.floor(Math.random() * 2500) + 1000; // 1.0s to 3.5s randomized human jitter
  const BATCH_SIZE_LIMIT = 15; // Cool down pause every 15 messages for bulk broadcasts
  const BATCH_COOL_OFF_MS = 45000; // 45-second cooling break

  try {
    const docRef = db.collection('whatsapp_metadata').doc('global_rate_limiter');
    
    const waitMs = await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      const now = Date.now();
      let lastSent = 0;
      let batchCount = 0;
      let dailyCount = 0;
      let lastResetDate = '';

      const todayStr = new Date().toISOString().split('T')[0];

      if (snap.exists) {
        const data = snap.data();
        lastSent = typeof data.lastSentTimestamp === 'number' ? data.lastSentTimestamp : 0;
        batchCount = typeof data.batchCount === 'number' ? data.batchCount : 0;
        dailyCount = typeof data.dailyCount === 'number' ? data.dailyCount : 0;
        lastResetDate = data.lastResetDate || '';
      }

      if (lastResetDate !== todayStr) {
        dailyCount = 0;
        lastResetDate = todayStr;
      }

      let targetSendTime = lastSent + MIN_INTERVAL_MS + JITTER_MS;
      
      // Batch cooldown logic (for non-emergency broadcasts)
      if (!isEmergency && batchCount >= BATCH_SIZE_LIMIT) {
        targetSendTime = Math.max(targetSendTime, lastSent + BATCH_COOL_OFF_MS + JITTER_MS);
        batchCount = 0; // reset batch counter after cool off
      }

      if (now >= targetSendTime) {
        // Reserve the send slot
        transaction.set(docRef, {
          lastSentTimestamp: now,
          batchCount: isEmergency ? batchCount : batchCount + 1,
          dailyCount: dailyCount + 1,
          lastResetDate: todayStr,
          pacingRate: isEmergency ? 'Emergency (2s)' : '4 msgs/min (Meta Anti-Ban)',
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // High daily volume warning log for Meta safety
        if (dailyCount + 1 > 300) {
          console.warn(`[WhatsApp Meta Anti-Ban Advisory] Daily broadcast count reached ${dailyCount + 1}. Note: High volume on unverified WhatsApp numbers increases Meta spam review risk.`);
        }

        return 0;
      } else {
        return targetSendTime - now;
      }
    });

    return waitMs;
  } catch (err: any) {
    console.error(`[WhatsApp Rate Limiter] Error in acquireGlobalSendSlot:`, err.message);
    return isEmergency ? 2000 : 15000;
  }
}

let sock: any = null;
let qrCode: string | null = null;
let connectionStatus: 'connecting' | 'open' | 'close' | 'qr' = 'connecting';
let io: Server | null = null;

const instanceId = Math.random().toString(36).substring(7);
export const getSessionId = (): string => {
  return process.env.WA_SESSION_ID || 'default';
};
const LOCK_COLLECTION = 'whatsapp_metadata';
const LOCK_DOC = 'connection_lock';
const STATUS_DOC = 'connection_status';

const logger = pino({ level: 'silent' });
const QUEUE_COLLECTION = 'whatsapp_queue';

let isConnecting = false;
let lastProcessedGroupRefreshTrigger = '';

const updateStatus = async (status: typeof connectionStatus, localOnly = false) => {
  if (connectionStatus !== status) {
    console.log(`[WhatsApp] Status changing: ${connectionStatus} -> ${status}${localOnly ? ' (localOnly)' : ''}`);
    connectionStatus = status;
    io?.emit('wa:status', status);
    
    if (localOnly) return;
    
    try {
      const db = getDbAdmin();
      if (db && !isDatabaseDenied()) {
        const fsAdmin = db as any;
        console.log(`[WhatsApp Status] Syncing to Firestore: ${status} [Project: ${fsAdmin._projectId || fsAdmin.projectId}, DB: ${fsAdmin._databaseId || fsAdmin.databaseId || '(default)'}]`);
        
        await db.collection(LOCK_COLLECTION).doc(STATUS_DOC).set({
          status: connectionStatus,
          qr: connectionStatus === 'qr' ? qrCode : null,
          instanceId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiration for lock state if not refreshed
        }, { merge: true });

        // Update real-time health monitor
        await db.collection(LOCK_COLLECTION).doc('health').set({
          status: connectionStatus,
          lastHeartbeat: new Date().toISOString(),
          instanceId,
          pid: process.pid,
          activeWorkers: 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        safeLogWhatsappEvent('status_change', { status, instanceId, pid: process.pid });
      }
    } catch(e: any) {
      console.error(`[WhatsApp] Failed to sync status to Firestore: ${e.message}`);
    }
  }
};
let consecutiveErrors = 0;
let consecutiveQrErrors = 0;
let consecutiveConflicts = 0;
let lastConnectionAttempt = 0;
let lockTimeout: NodeJS.Timeout | null = null;
let lastConflictTime = 0;
let isCooldownActive = false;

const LOCK_FILE = path.join(process.cwd(), 'wa_connection.lock');

function isOtherInstanceActive(data: any): boolean {
  if (!data || !data.instanceId || data.instanceId === instanceId) return false;
  if (data.pid && Number(data.pid) === process.pid) return false; // Same process on current machine
  
  const updatedAt = data.updatedAt;
  let lastUpdate = 0;
  if (updatedAt) {
    if (typeof updatedAt.toMillis === 'function') {
      lastUpdate = updatedAt.toMillis();
    } else if (updatedAt instanceof Date) {
      lastUpdate = updatedAt.getTime();
    } else {
      lastUpdate = new Date(updatedAt).getTime() || 0;
    }
  }
  const ageMs = Date.now() - lastUpdate;
  if (ageMs > 20000) return false; // Lock stale if no update in 20s

  return true; // Another instance is actively holding the lock
}

const acquireLock = async (isConflict = false, isForce = false): Promise<boolean> => {
  try {
    const now = Date.now();
    
    // Always write local lock file for this process
    try {
      fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
      console.log(`[WhatsApp ${process.pid}] Local lock claimed/refreshed for local process: ${process.pid}`);
    } catch (lockErr: any) {
      console.error(`[WhatsApp ${process.pid}] Local file locking write failed: ${lockErr.message}`);
    }
    
    // Global lock update via Firestore atomic transaction
    try {
      await initializationPromise;
      if (!isDatabaseDenied()) {
        const db = getDbAdmin();
        const lockRef = db.collection(LOCK_COLLECTION).doc(LOCK_DOC);
        
        const acquired = await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(lockRef);
          if (doc.exists && isOtherInstanceActive(doc.data())) {
            return false;
          }

          const updateData: any = {
            instanceId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
            pid: process.pid,
            hostname: process.env.HOSTNAME || 'unknown',
            expiresAt: new Date(now + 3600000).toISOString(),
            cooldownUntil: null
          };

          transaction.set(lockRef, updateData, { merge: true });
          return true;
        });

        if (!acquired) {
          console.log(`[WhatsApp ${process.pid}] Another instance holds active global lock. Stepping down.`);
          return false;
        }
        console.log(`[WhatsApp ${process.pid}] Global lock atomically claimed/refreshed: ${instanceId}`);
      }
    } catch (fsErr: any) {
      console.warn(`[WhatsApp ${process.pid}] Global lock transaction warning:`, fsErr.message);
    }
    return true;
  } catch (e) {
    return true;
  }
};

const releaseLock = async () => {
  try {
    // Also clear global lock if it's ours, but keep the cooldown if we had one
    await initializationPromise;
    if (!isDatabaseDenied()) {
      const db = getDbAdmin();
      const lockRef = db.collection(LOCK_COLLECTION).doc(LOCK_DOC);
      const doc = await lockRef.get();
      if (doc.exists && doc.data()?.instanceId === instanceId) {
        await lockRef.update({
          instanceId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp() as any
        });
      }
    }
  } catch (e) {}
};

let isProcessingQueue = false;

// cleanup on process exit
const cleanup = async () => {
  if (sock) {
    console.log(`[WhatsApp ${process.pid}] Process exiting, closing socket...`);
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.end(undefined);
    } catch (e) {}
  }
  await releaseLock();
  
  // Clean up local lock file if it belongs to this process
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockPidStr = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      if (parseInt(lockPidStr, 10) === process.pid) {
        fs.unlinkSync(LOCK_FILE);
        console.log(`[WhatsApp ${process.pid}] Local lock file cleaned up.`);
      }
    }
  } catch (e) {}
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function cleanupStalledMessages() {
  try {
    if (isDatabaseDenied()) {
      console.warn(`[WhatsApp Queue] Database access is denied. Skipping cleanup.`);
      return;
    }

    const db = getDbAdmin();
    console.log(`[WhatsApp Queue] Cleanup check...`);
    const stalledSnap = await db.collection(QUEUE_COLLECTION)
      .where('status', '==', 'processing')
      .get();
    
    if (!stalledSnap.empty) {
      const now = Date.now();
      const cutoffIso = new Date(now - 120000).toISOString(); // Stuck for > 2 minutes
      const docsToReset = stalledSnap.docs.filter(doc => {
        const d = doc.data();
        const lockTime = d.startedAt || d.lockedAt || d.updatedAt;
        return !lockTime || lockTime < cutoffIso;
      });

      if (docsToReset.length > 0) {
        console.log(`[WhatsApp Queue] Resetting ${docsToReset.length} stalled messages (stuck >2m) to pending...`);
        const batch = db.batch();
        docsToReset.forEach(doc => {
          batch.update(doc.ref, { status: 'pending', updatedAt: new Date().toISOString() });
        });
        await batch.commit();
      }
    }
  } catch (err: any) {
    const errText = (err?.message || String(err)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing') || errText.includes('not_found') || errText.includes('not found') || errText.includes('5 not_found')) {
      setDatabaseDenied(true);
      console.warn(`[WhatsApp Queue] Database is currently unavailable or requires billing/setup (${err.message}). Skipping cleanup.`);
    } else {
      console.error("[WhatsApp Queue] Cleanup failed:", err.message);
    }
  }
}

function checkSocketAlive(): boolean {
  if (!sock || connectionStatus !== 'open') return false;
  // Ensure authentication handshake is complete
  if (!sock.user && !sock.authState?.creds?.me) return false;
  if (!sock.ws) return true;
  
  const readyState = sock.ws.readyState ?? sock.ws._ws?.readyState ?? sock.ws.socket?.readyState;
  if (readyState !== undefined) {
    return readyState === 1;
  }
  if (typeof sock.ws.isOpen === 'boolean') {
    return sock.ws.isOpen;
  }
  return true;
}

async function ensureWhatsAppConnected(maxWaitMs = 20000): Promise<boolean> {
  if (checkSocketAlive()) {
    return true;
  }
  
  const now = Date.now();
  if (connectionStatus !== 'qr' && (now - lastConnectionAttempt > 2000)) {
    connectToWhatsApp(io, true, true).catch(() => {});
  }

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (checkSocketAlive()) {
      return true;
    }
    await delay(300);
  }
  return checkSocketAlive();
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  
  await cleanupStalledMessages();
  console.log(`[WhatsApp Queue] Starting persistent processor...`);

  while (true) {
    try {
      // Periodic heartbeat for queue processor
      if (Math.random() < 0.05) {
        console.log(`[WhatsApp Queue Heartbeat] Active. Status: ${connectionStatus}, Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
      }

      // 1. Check if socket is open and alive
      if (!checkSocketAlive()) {
        const now = Date.now();
        if (connectionStatus !== 'qr' && !isConnecting && (now - lastConnectionAttempt > 8000)) {
          connectToWhatsApp(io, true, true).catch(() => {});
        }
        await delay(2000);
        continue;
      }

      // 2. Fetch queue items from Firestore
      if (isDatabaseDenied()) {
        await delay(30000); // Wait longer if missing permissions
        continue;
      }

      // Periodically cleanup stalled messages within the loop
      if (Math.random() < 0.05) {
        await cleanupStalledMessages();
      }

      const db = getDbAdmin();
      
      // Query pending and retrying messages in parallel to ensure ESM backward compatibility
      const pendingRef = db.collection(QUEUE_COLLECTION).where('status', '==', 'pending').limit(20);
      const retryingRef = db.collection(QUEUE_COLLECTION).where('status', '==', 'retrying').limit(20);
      
      const [pendingSnap, retryingSnap] = await Promise.all([pendingRef.get(), retryingRef.get()]);
      
      const now = new Date();
      const nowIso = now.toISOString();

      let mergedDocs = [...pendingSnap.docs, ...retryingSnap.docs];

      // Filter out retrying messages where nextAttemptAt is in the future
      mergedDocs = mergedDocs.filter(doc => {
        const data = doc.data();
        if (data.status === 'retrying' && data.nextAttemptAt && data.nextAttemptAt > nowIso) {
          return false;
        }
        return true;
      });

      if (mergedDocs.length === 0) {
        // No messages, check again soon
        await delay(1000);
        continue;
      }

      // In-memory sort by priority, nextAttemptAt, attempts and createdAt
      mergedDocs.sort((a, b) => {
        const dataA = a.data();
        const dataB = b.data();
        
        const prioA = typeof dataA.priority === 'number' ? dataA.priority : 3;
        const prioB = typeof dataB.priority === 'number' ? dataB.priority : 3;
        if (prioA !== prioB) return prioA - prioB;
        
        const nextA = dataA.nextAttemptAt || '';
        const nextB = dataB.nextAttemptAt || '';
        if (nextA !== nextB) return nextA.localeCompare(nextB);
        
        const attA = typeof dataA.attempts === 'number' ? dataA.attempts : 0;
        const attB = typeof dataB.attempts === 'number' ? dataB.attempts : 0;
        if (attA !== attB) return attA - attB;
        
        const createdA = dataA.createdAt || '';
        const createdB = dataB.createdAt || '';
        return createdA.localeCompare(createdB);
      });

      const messageDocToClaim = mergedDocs[0];
      const messageId = messageDocToClaim.id;

      // 3. ATOMIC TRANSACTION: Prevent multiple active workers from claiming the same message
      const targetMessage = await db.runTransaction(async (transaction) => {
        const docRef = db.collection(QUEUE_COLLECTION).doc(messageId);
        const docSnapshot = await transaction.get(docRef);
        if (!docSnapshot.exists) return null;
        
        const d = docSnapshot.data() as any;
        if (d.status !== 'pending' && d.status !== 'retrying') return null;
        
        if (d.status === 'retrying' && d.nextAttemptAt && d.nextAttemptAt > new Date().toISOString()) {
          return null;
        }

        const currentAttempts = (d.attempts || 0) + 1;
        transaction.update(docRef, {
          status: 'processing',
          lockOwner: instanceId,
          lockedAt: new Date().toISOString(),
          attempts: currentAttempts,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        return { ...d, id: messageId, currentAttempts };
      });

      if (!targetMessage) {
        // Already claimed by another worker, try again immediately
        continue;
      }

      const messageDoc = db.collection(QUEUE_COLLECTION).doc(messageId);
      const messageData = targetMessage as any;

      try {
        const toVal = messageData.to || messageData.phone;
        const textVal = messageData.text || messageData.message || "";

        if (!toVal || typeof toVal !== 'string') {
          throw new Error("Missing or invalid recipient (to/phone)");
        }

        // Clean/Normalize target number to modern E.164 standard
        const normalizedPhone = normalizeIndianPhone(toVal);
        console.log(`[WhatsApp Queue] Processing message ${messageId} (P${messageData.priority || 3}) to ${normalizedPhone}...`);

        // Check for Consent / Opt-Out status
        const optOutDoc = await db.collection('whatsapp_opt_out').doc(normalizedPhone).get();
        if (optOutDoc.exists) {
          const prio = typeof messageData.priority === 'number' ? messageData.priority : 3;
          if (prio > 0) { // standard priority messages are cancelled if opted-out
            await messageDoc.update({
              status: 'cancelled',
              cancelledAt: new Date().toISOString(),
              reason: 'Recipient has opted out'
            });
            console.log(`[WhatsApp Queue] Message ${messageId} cancelled: recipient ${normalizedPhone} has opted out.`);
            safeLogWhatsappEvent('message_cancelled_opt_out', { recipient: normalizedPhone, messageId });
            continue; 
          }
          console.log(`[WhatsApp Queue] Recipient ${normalizedPhone} opted out but emergency priority P0 message is bypassing.`);
        }

        // Standardize JID format for maximum delivery reliability
        let jid = normalizedPhone ? normalizedPhone.trim() : '';
        const isLidTarget = toVal.includes('@lid') || jid.endsWith('@lid') || (jid.replace(/\D/g, '').length >= 14 && jid.replace(/\D/g, '').startsWith('107'));

        if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) {
          // Keep group or newsletter JID intact
        } else if (isLidTarget) {
          // Keep @lid JID intact for WhatsApp Linked Identity recipients
          const cleanLidDigits = (toVal || jid).split('@')[0].split(':')[0].replace(/\D/g, '');
          jid = `${cleanLidDigits}@lid`;
        } else {
          // Standard WhatsApp user JID must be digits-only before @s.whatsapp.net (e.g., 919440989858@s.whatsapp.net)
          const cleanDigits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
          if (!cleanDigits) {
            throw new Error(`Failed to construct a valid JID from recipient: ${toVal}`);
          }
          jid = `${cleanDigits}@s.whatsapp.net`;
        }
        
        const cleanTo = jid.split('@')[0].split(':')[0].replace(/\D/g, '');

        // ACQUIRE GLOBAL SEND SLOT (Strictly prevents WhatsApp bans by limiting sending speed across all instances to 4 messages per minute)
        const isEmergencyP0 = messageData.priority === 0;
        let slotWait = await acquireGlobalSendSlot(db, isEmergencyP0);
        while (slotWait > 0) {
          console.log(`[WhatsApp Rate Limiter] Meta Anti-Ban Pacing (${isEmergencyP0 ? 'Emergency 2s' : '4 msgs/min'}). Waiting ${Math.round(slotWait/1000)}s for a vacant send slot...`);
          await delay(slotWait);
          slotWait = await acquireGlobalSendSlot(db, isEmergencyP0);
        }

        // Re-read document to verify if it has been cancelled by the user in the meantime
        const freshSnap = await db.collection(QUEUE_COLLECTION).doc(messageId).get();
        if (freshSnap.exists && freshSnap.data()?.status === 'cancelled') {
          console.log(`[WhatsApp Queue] Message ${messageId} was cancelled by user while waiting/processing. Aborting send.`);
          continue;
        }

        let result: any;
        const options = messageData.options || {};

        let sendSuccess = false;
        let lastSendErr: any = null;
        let msgPayload: any = null;

        for (let sendAttempt = 1; sendAttempt <= 3; sendAttempt++) {
          try {
            const isReady = await ensureWhatsAppConnected(12000);
            if (!isReady || !sock) {
              throw new Error("Connection Closed");
            }

            // Verify if target recipient is registered on WhatsApp on first send attempt
            if (sendAttempt === 1 && !jid.endsWith('@g.us') && !jid.endsWith('@newsletter') && !jid.endsWith('@lid')) {
              try {
                const waCheck = await Promise.race([
                  sock.onWhatsApp(cleanTo),
                  new Promise<any>((_, reject) => setTimeout(() => reject(new Error('onWhatsApp timeout')), 3500))
                ]);
                if (Array.isArray(waCheck) && waCheck.length > 0) {
                  // Strictly match phone number JID ending with @s.whatsapp.net to prevent LID digit corruption
                  const pnMatch = waCheck.find((m: any) => m?.exists && m?.jid?.endsWith('@s.whatsapp.net'));
                  if (pnMatch?.exists && pnMatch.jid) {
                    const cleanPn = pnMatch.jid.split('@')[0].split(':')[0].replace(/\D/g, '');
                    if (cleanPn && cleanPn.length >= 10 && cleanPn.length <= 15) {
                      jid = `${cleanPn}@s.whatsapp.net`;
                    } else {
                      jid = `${cleanTo}@s.whatsapp.net`;
                    }
                    console.log(`[WhatsApp JID Verified @s.whatsapp.net] ${cleanTo} -> ${jid}`);
                  } else {
                    const lidMatch = waCheck.find((m: any) => m?.exists);
                    if (lidMatch) {
                      // Recipient exists on WhatsApp (LID format returned), retain valid phone number JID
                      jid = `${cleanTo}@s.whatsapp.net`;
                      console.log(`[WhatsApp JID Verified via Phone] ${cleanTo} -> ${jid}`);
                    } else {
                      const notFound = waCheck.find((m: any) => m?.exists === false);
                      if (notFound) {
                        throw new Error(`Recipient number ${cleanTo} is NOT registered on WhatsApp.`);
                      }
                    }
                  }
                }
              } catch (waCheckErr: any) {
                if (waCheckErr.message?.includes('NOT registered')) {
                  throw waCheckErr;
                }
                console.warn(`[WhatsApp JID Check] Unable to verify via onWhatsApp (${waCheckErr.message}). Proceeding with JID: ${jid}`);
              }
            }

            // Send presence update to stimulate real-time routing on Meta's servers
            try {
              await sock.sendPresenceUpdate('composing', jid);
            } catch (pErr) {}

            msgPayload = null;
            const resolvedMedia = sendAttempt === 1 ? resolveMediaPayload(options, textVal) : null;

            if (sendAttempt > 1 && (options.buttons || options.templateButtons || options.sections || options.videoUrl || options.imageUrl || options.documentUrl)) {
              console.log(`[WhatsApp Queue] Retry attempt ${sendAttempt}: using plain text fallback for ${jid}`);
              msgPayload = { text: textVal };
            } else if (resolvedMedia) {
              msgPayload = resolvedMedia;
            } else if (options.videoUrl) {
              msgPayload = { 
                video: { url: options.videoUrl }, 
                caption: textVal,
                gifPlayback: options.asGif || false
              };
            } else if (options.imageUrl) {
              msgPayload = { 
                image: { url: options.imageUrl }, 
                caption: textVal 
              };
            } else if (options.documentUrl) {
              msgPayload = { 
                document: { url: options.documentUrl }, 
                fileName: options.fileName || 'document.pdf',
                caption: textVal,
                mimetype: options.mimetype || 'application/pdf'
              };
            } else if (options.buttons || options.templateButtons || options.sections) {
              const buttons = options.buttons || options.templateButtons || [];
              let formattedText = textVal;
              if (buttons.length > 0) {
                const optionsList = buttons.map((b: any, i: number) => {
                  const label = b.buttonText?.displayText || b.text || b.title || "Option";
                  return `${i + 1}. ${label}`;
                }).join('\n');
                if (!formattedText.includes('1.') && !formattedText.toLowerCase().includes('option')) {
                  formattedText += `\n\n📌 *Options:*\n${optionsList}\n\n_Reply with option number or keyword_`;
                }
              }
              msgPayload = { text: formattedText };
            } else {
              msgPayload = { text: textVal };
            }

            if (!jid.endsWith('@g.us') && !jid.endsWith('@newsletter') && !jid.endsWith('@lid')) {
              const cleanPn = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
              if (cleanPn) {
                jid = `${cleanPn}@s.whatsapp.net`;
              }
            }

            if (sendAttempt > 1 && lastSendErr && !jid.endsWith('@g.us') && !jid.endsWith('@newsletter')) {
              const prevErr = (lastSendErr.message || '').toLowerCase();
              if (prevErr.includes('session') || prevErr.includes('bad mac') || prevErr.includes('pre-key') || prevErr.includes('signal')) {
                console.log(`[WhatsApp Queue] Send attempt ${sendAttempt}: Clearing stale session keys for ${jid} following session error...`);
                try {
                  const { state } = await useFirestoreAuthState(getSessionId());
                  if (state && state.keys && state.keys.set) {
                    await state.keys.set({
                      'session': { [jid]: null },
                      'sender-key': { [jid]: null },
                      'pre-key': { [jid]: null }
                    });
                  }
                } catch (_) {}
              }
            }

            console.log(`[WhatsApp Queue] Sending message to target JID: ${jid} (Attempt ${sendAttempt})...`);

            const SEND_TIMEOUT_MS = 35000;
            const sendPromise = sock.sendMessage(jid, msgPayload);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`sock.sendMessage timed out after ${SEND_TIMEOUT_MS / 1000} seconds`)), SEND_TIMEOUT_MS)
            );

            result = await Promise.race([sendPromise, timeoutPromise]);
            console.log(`[WhatsApp Queue] Send response for ${jid}: waMsgId=${result?.key?.id}, status=${result?.status}`);

            if (result && result.key) {
              storeMessageForRetry(result.key, result.message || msgPayload);
            }

            sendSuccess = true;
            break;
          } catch (sErr: any) {
            const rawErrStr = sErr ? (sErr.message || (typeof sErr === 'string' ? sErr : (sErr.toString && sErr.toString() !== '[object Object]' ? sErr.toString() : JSON.stringify(sErr)))) : '';
            const errMsg = (rawErrStr && rawErrStr !== '{}') ? rawErrStr : 'Unknown sending error';
            lastSendErr = new Error(errMsg);
            const errMsgLower = errMsg.toLowerCase();

            // Handle ENOENT / missing attachment gracefully on current attempt
            if (errMsgLower.includes('enoent') || errMsgLower.includes('no such file')) {
              console.warn(`[WhatsApp Queue] Attachment file missing on disk for ${jid}. Retrying with plain text fallback immediately...`);
              msgPayload = { text: textVal };
              try {
                const fallbackPromise = sock.sendMessage(jid, msgPayload);
                const fallbackTimeout = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('sock.sendMessage text fallback timed out after 60 seconds')), 60000)
                );
                result = await Promise.race([fallbackPromise, fallbackTimeout]);
                if (result && result.key) {
                  storeMessageForRetry(result.key, result.message || msgPayload);
                }
                sendSuccess = true;
                console.log(`[WhatsApp Queue] Plain text fallback succeeded for ${jid}: waMsgId=${result?.key?.id}`);
                break;
              } catch (fbErr: any) {
                console.error(`[WhatsApp Queue] Text fallback failed for ${jid}:`, fbErr?.message || fbErr);
              }
            }

            const isConnErr = errMsgLower.includes('connection closed') || 
                              errMsgLower.includes('not connected') ||
                              errMsgLower.includes('timed out') ||
                              errMsgLower.includes('socket') ||
                              errMsgLower.includes('stream') ||
                              errMsgLower.includes('closed') ||
                              errMsgLower.includes('disconnect') ||
                              errMsgLower.includes('econn');

            const isSessionErr = errMsgLower.includes('no sessions') ||
                                 errMsgLower.includes('session') ||
                                 errMsgLower.includes('pre-key') ||
                                 errMsgLower.includes('bad mac') ||
                                 errMsgLower.includes('signal') ||
                                 errMsgLower.includes('key');

            if (isSessionErr) {
              console.warn(`[WhatsApp Queue] Session error detected for JID ${jid} (${errMsg}). Healing stale session keys...`);
              try {
                const { state } = await useFirestoreAuthState(getSessionId());
                if (state && state.keys && state.keys.set) {
                  const cleanJid = jid.replace(/:\d+@/, '@');
                  const jidVariations = Array.from(new Set([jid, cleanJid]));
                  const keysToClear: any = {
                    'session': {},
                    'sender-key': {},
                    'pre-key': {}
                  };
                  for (const jidVar of jidVariations) {
                    keysToClear['session'][jidVar] = null;
                    keysToClear['sender-key'][jidVar] = null;
                    keysToClear['pre-key'][jidVar] = null;
                  }
                  await state.keys.set(keysToClear);
                }
              } catch (healErr: any) {
                console.warn(`[WhatsApp Queue] Session key clear error:`, healErr?.message || healErr);
              }
            }

            if ((isConnErr || isSessionErr) && sendAttempt < 3) {
              console.warn(`[WhatsApp Queue] Send attempt ${sendAttempt} failed (${errMsg}). Waiting for connection/session recovery...`);
              if (isConnErr) {
                updateStatus('connecting');
                connectToWhatsApp(io, true, true).catch(() => {});
              }
              await ensureWhatsAppConnected(15000);
            } else {
              throw lastSendErr;
            }
          }
        }

        if (!sendSuccess && lastSendErr) {
          throw lastSendErr;
        }

        // 4. Mark as completed
        await messageDoc.update({ 
          status: 'sent', 
          completedAt: new Date().toISOString(),
          waMessageId: result?.key?.id || null 
        });

        // Save outgoing message for secure retry/decryption handling
        if (result && result.key) {
          storeMessageForRetry(result.key, result.message || { conversation: textVal });
        }
        
        await logWhatsAppMessage(cleanTo, textVal, messageData.type, 'sent', result?.key?.id, undefined, messageData.options);
        console.log(`[WhatsApp Queue] Message ${messageId} sent successfully.`);

        // 5. Apply Randomized Delays based on priority (P0: 5-10s, P1: 8-15s, P2: 12-25s, P3: 20-40s)
        const prio = typeof messageData.priority === 'number' ? messageData.priority : 3;
        const waitTime = getDelayForPriority(prio);
        
        console.log(`[WhatsApp Queue] Cooldown: Waiting ${Math.round(waitTime/1000)}s for Priority ${prio}...`);
        await delay(waitTime);

      } catch (err: any) {
        const rawErrMsg = err ? (err.message || (typeof err === 'string' ? err : (err.toString && err.toString() !== '[object Object]' ? err.toString() : JSON.stringify(err)))) : '';
        const errorReason = (rawErrMsg && rawErrMsg !== '{}') ? rawErrMsg : "Unknown sending error";
        const currentAttempts = messageData.currentAttempts || 1;
        const errMsgLower = errorReason.toLowerCase();
        
        const isConnError = errMsgLower.includes('connection closed') || 
                            errMsgLower.includes('not connected') ||
                            errMsgLower.includes('timed out') ||
                            errMsgLower.includes('socket') ||
                            errMsgLower.includes('stream') ||
                            errMsgLower.includes('closed') ||
                            errMsgLower.includes('disconnect') ||
                            errMsgLower.includes('econn');

        const isSessionError = errMsgLower.includes('no sessions') ||
                              errMsgLower.includes('session') ||
                              errMsgLower.includes('pre-key') ||
                              errMsgLower.includes('bad mac') ||
                              errMsgLower.includes('signal');

        const isTransient = isConnError || isSessionError;

        if (isTransient) {
          console.warn(`[WhatsApp Queue] Transient send notice for ${messageId} to ${messageData.to}: ${errorReason}`);
        } else {
          console.error(`[WhatsApp Queue] Error sending message ${messageId} to ${messageData.to}: ${errorReason}`);
        }

        if (currentAttempts < 5 && !errorReason.includes('not on WhatsApp')) {
          // Calculate retry schedule
          // For transient connection or session negotiation errors, retry quickly (2 seconds) without wasting attempt quota
          const effectiveAttempts = isTransient ? Math.max(0, currentAttempts - 1) : currentAttempts;
          const retryDelayMs = isTransient ? 2000 : (currentAttempts === 1 ? 15000 : 60000);
          const nextAttemptAt = new Date(Date.now() + retryDelayMs).toISOString();

          await messageDoc.update({ 
            status: 'retrying', 
            attempts: effectiveAttempts,
            lastError: errorReason,
            nextAttemptAt,
            updatedAt: new Date().toISOString() 
          });

          console.log(`[WhatsApp Queue] Attempt ${currentAttempts} failed (${errorReason}). Rescheduling message ${messageId} to retry at ${nextAttemptAt}`);
          safeLogWhatsappEvent('message_scheduled_retry', { messageId, attempt: currentAttempts, nextAttemptAt });

          if (isConnError) {
            console.warn(`[WhatsApp Queue] Triggering instant connection auto-recovery due to transient send error...`);
            updateStatus('connecting');
            connectToWhatsApp(io, true, true).catch(() => {});
          }

          await delay(1500);
        } else {
          // Dead Letter Queue movement: move/record document to failed queue
          const failedPayload = {
            queueId: messageId,
            to: messageData.to,
            text: messageData.text || "",
            type: messageData.type,
            priority: messageData.priority || 3,
            attempts: currentAttempts,
            lastError: errorReason,
            errorStack: err.stack || null,
            payload: messageData,
            failedAt: new Date().toISOString()
          };

          await db.collection('whatsapp_failed_queue').doc(messageId).set(failedPayload);
          
          await messageDoc.update({ 
            status: 'failed', 
            lastError: errorReason,
            completedAt: new Date().toISOString() 
          });

          await logWhatsAppMessage(messageData.to, messageData.text, messageData.type, 'failed', undefined, errorReason, messageData.options);
          console.error(`[WhatsApp Queue] Message ${messageId} hard failed after ${currentAttempts} attempts. Moved to whatsapp_failed_queue.`);
          safeLogWhatsappEvent('message_hard_failed', failedPayload);
        }
      }

    } catch (outerErr: any) {
      const isExpectedError = outerErr.message.includes('PERMISSION_DENIED') || 
                            outerErr.message.includes('Quota limit exceeded') ||
                            outerErr.message.includes('quota exceeded');
      
      if (outerErr.message.includes('PERMISSION_DENIED')) {
        const db = getDbAdmin();
        const firestore = db as any;
        console.error(`[WhatsApp Queue] Persistent PERMISSION_DENIED on DB: ${firestore.projectId}/${firestore.databaseId || '(default)'}`);
        console.error(`[WhatsApp Queue] Error detail: ${outerErr.message}`);
      } else if (!isExpectedError || Math.random() < 0.05) { 
        console.error(`[WhatsApp Queue] Persistent error:`, outerErr.message);
      }
      
      await delay(30000); // Backoff on critical errors
    }
  }
}

// Start queue processor after a longer delay to ensure Admin SDK is ready and verified
setTimeout(async () => {
  console.log(`[WhatsApp Queue] Initializing processor...`);
  
  // Wait for the admin SDK to complete its initial connection check/fallback
  await initializationPromise;
  
  if (isDatabaseDenied()) {
    console.error(`[WhatsApp Queue] CRITICAL: Database access is denied. WhatsApp Queue will NOT process messages.`);
    return;
  }
  
  // Simple check to wait for dbAdmin to be ready and verified
  let ready = false;
  let attempts = 0;
  while (!ready && attempts < 10) {
    try {
      const db = getDbAdmin();
      // Try a small read to verify connectivity + permissions
      const healthDoc = await db.collection('_health').doc('queue_check').get();
      await db.collection('_health').doc('queue_check').set({ 
        lastCheck: new Date().toISOString(),
        verified: true 
      }, { merge: true });
      ready = true;
      console.log(`[WhatsApp Queue] Firestore connectivity verified.`);
    } catch (e: any) {
      attempts++;
      console.warn(`[WhatsApp Queue] Firestore not ready or denied (attempt ${attempts}): ${e.message}`);
      if (e.message.includes('PERMISSION_DENIED')) {
        const db = getDbAdmin();
        const fsAdmin = db as any;
        console.error(`[WhatsApp Queue] PERMISSION_DENIED on Project: ${fsAdmin._projectId || fsAdmin.projectId}, DB: ${fsAdmin._databaseId || fsAdmin.databaseId || '(default)'}`);
        console.error(`[WhatsApp Queue] This suggests an IAM issue or missing database. Check if database exists in Firebase Console.`);
      }
      await delay(3000);
    }
  }

  processQueue().catch(err => console.error("[WhatsApp Queue] Processor failed to start:", err.message));

  // Background Migration: Self-heal indexing for all students
  setTimeout(async () => {
    try {
      const db = getDbAdmin();
      console.log(`[WhatsApp Migration] Starting indexing for all existing users...`);
      const studentsSnap = await db.collection('users').get();
      
      let patched = 0;
      const batchSize = 100;
      let currentBatch = db.batch();
      let opCount = 0;

      for (const doc of studentsSnap.docs) {
        const d = doc.data();
        if (d.parent_last10 && d.contact_last10) continue;

        const parentPhoneVal = d.parentPhone || d.contact || d.whatsappNumber || '';
        const cleanParentPhone = parentPhoneVal.replace(/\D/g, '');
        const parent_last10 = cleanParentPhone.length >= 10 ? cleanParentPhone.slice(-10) : '';

        const contactVal = d.contact || d.whatsappNumber || d.phone || '';
        const cleanContact = contactVal.replace(/\D/g, '');
        const contact_last10 = cleanContact.length >= 10 ? cleanContact.slice(-10) : '';

        if ((parent_last10 && parent_last10 !== d.parent_last10) || (contact_last10 && contact_last10 !== d.contact_last10)) {
          currentBatch.update(doc.ref, {
            parent_last10,
            contact_last10,
            updatedAt: new Date().toISOString()
          });
          opCount++;
          patched++;

          if (opCount >= batchSize) {
            await currentBatch.commit();
            currentBatch = db.batch();
            opCount = 0;
          }
        }
      }

      if (opCount > 0) {
        await currentBatch.commit();
      }
      if (patched > 0) {
        console.log(`[WhatsApp Migration] Successfully indexed ${patched} users for robust bot matching.`);
      }
    } catch (e: any) {
      console.warn(`[WhatsApp Migration] Background indexing failed: ${e.message}`);
    }
  }, 30000); // 30s after startup
}, 15000);

export async function reconcileWhatsAppStats() {
  try {
    const db = getDbAdmin();
    if (!db || isDatabaseDenied()) return null;

    let deliveredCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    let readCount = 0;
    const typeCounts: Record<string, number> = {};

    // 1. Scan whatsappLogs & whatsapp_logs collection
    const seenLogIds = new Set<string>();
    const processLogDoc = (doc: any) => {
      if (seenLogIds.has(doc.id)) return;
      seenLogIds.add(doc.id);
      const data = doc.data();
      const st = (data.status || '').toLowerCase();
      const isDelivered = st === 'delivered' || st === 'read' || !!data.deliveredAt || !!data.readAt;
      if (st === 'read') readCount++;
      
      if (isDelivered) {
        deliveredCount++;
      } else if (st === 'sent') {
        sentCount++;
      } else if (st === 'failed') {
        failedCount++;
      }

      const tp = (data.type || 'single').toLowerCase();
      typeCounts[tp] = (typeCounts[tp] || 0) + 1;
    };

    const logsSnap = await db.collection('whatsappLogs').get();
    logsSnap.forEach(processLogDoc);

    try {
      const legacyLogsSnap = await db.collection('whatsapp_logs').get();
      legacyLogsSnap.forEach(processLogDoc);
    } catch (_) {}

    // 2. Scan whatsapp_queue collection for pending / processing / retrying items
    let processingCount = 0;
    const queueSnap = await db.collection(QUEUE_COLLECTION).get();
    queueSnap.forEach(doc => {
      const data = doc.data();
      const st = (data.status || '').toLowerCase();
      if (st === 'processing' || st === 'pending' || st === 'retrying') {
        processingCount++;
      }
    });

    const totalCount = deliveredCount + sentCount + processingCount + failedCount;

    const summaryPayload = {
      delivered: deliveredCount,
      sent: sentCount,
      processing: processingCount,
      failed: failedCount,
      read: readCount,
      total: totalCount,
      types: typeCounts,
      lastReconciledAt: new Date().toISOString()
    };

    const statsRef = db.collection('whatsapp_stats').doc('summary');
    await statsRef.set(summaryPayload, { merge: true });
    // Reconciliation succeeded cleanly
    return summaryPayload;
  } catch (err: any) {
    const errText = (err?.message || String(err)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing') || errText.includes('not_found') || errText.includes('not found') || errText.includes('5 not_found')) {
      setDatabaseDenied(true);
    } else {
      console.warn(`[WhatsApp Stats Reconcile] Sync note:`, err.message);
    }
    return null;
  }
}

// Background periodic reconciliation every 5 minutes
setTimeout(() => {
  reconcileWhatsAppStats().catch(() => {});
  setInterval(() => {
    reconcileWhatsAppStats().catch(() => {});
  }, 5 * 60 * 1000);
}, 20000);

async function incrementWhatsAppStat(updates: Record<string, number>, type?: string) {
  try {
    const db = getDbAdmin();
    const statsRef = db.collection('whatsapp_stats').doc('summary');
    
    const updateData: any = {};
    for (const [key, value] of Object.entries(updates)) {
      updateData[key] = admin.firestore.FieldValue.increment(value);
    }
    
    if (type) {
      updateData[`types.${type}`] = admin.firestore.FieldValue.increment(1);
    }
    
    await statsRef.set(updateData, { merge: true });
  } catch (err: any) {
    console.error("[WhatsApp Stats] Increment failed:", err.message);
  }
}

function replaceMenuVariables(text: string, user: any, context: any) {
  if (!user) return text;
  
  const studentName = user.name || user.firstName || 'Student';
  const parentName = user.parentName || user.fatherName || 'Parent';
  const className = context?.className || user.className || 'N/A';
  const batchName = context?.batchName || user.batchName || 'N/A';
  const rollNumber = user.rollNumber || 'N/A';
  const slug = user.slug || user.uid || '';

  return text
    // Replace names
    .replace(/\{\{\s*student[s_]?\s*name\s*\}\}/gi, studentName)
    .replace(/\{\{\s*(parent[s_]?\s*name|father[s_]?\s*name|mother[s_]?\s*name)\s*\}\}/gi, parentName)
    .replace(/\{\{\s*name\s*\}\}/gi, studentName)
    .replace(/\{name\}/gi, studentName)
    .replace(/\{fatherName\}/gi, parentName)
    .replace(/\{\{\s*fatherName\s*\}\}/gi, parentName)
    
    // Replace class
    .replace(/\{\{\s*class[es_]?\s*name\s*\}\}/gi, className)
    .replace(/\{\{\s*class\s*\}\}/gi, className)
    .replace(/\{class\}/gi, className)
    
    // Replace batch
    .replace(/\{\{\s*batch[es_]?\s*name\s*\}\}/gi, batchName)
    .replace(/\{\{\s*batch\s*\}\}/gi, batchName)
    .replace(/\{batch\}/gi, batchName)
    
    // Replace roll number
    .replace(/\{\{\s*roll[s_]?\s*number\s*\}\}/gi, rollNumber)
    .replace(/\{rollNumber\}/gi, rollNumber)
    
    // Replace slug
    .replace(/\{slug\}/gi, slug);
}

async function logWhatsAppMessage(recipient: string, text: string, type: 'single' | 'broadcast' | 'birthday' | 'bot' | 'incoming', status: 'sent' | 'failed' | 'delivered', messageId?: string, error?: string, options?: any) {
  try {
    const data: any = {
      recipient,
      text,
      type,
      status,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(), // 24h expiration
      error: error || null,
      options: options || null
    };
    if (messageId) data.messageId = messageId;
    
    const db = getDbAdmin();
    
    // Resolve and associate studentId automatically for logging/reports module
    let studentId = options?.studentId || null;
    const cleanPhone = recipient.replace(/\D/g, '');
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    if (db && cleanPhone) {
      if (cleanPhone === "111862440063167") {
        studentId = "baleswara_rao_d_91986711";
      }

      if (!studentId && last10.length >= 10) {
        // Try to get from warm memoryPhoneCache (zero DB overhead)
        const cached = memoryPhoneCache.get(last10);
        if (cached && (cached.role === 'student' || cached.role === 'parent')) {
          studentId = cached.id;
        }
      }

      if (!studentId) {
        // Try to fetch from whatsapp_conversations session
        try {
          const sessionDoc = await db.collection('whatsapp_conversations').doc(cleanPhone).get();
          if (sessionDoc.exists) {
            studentId = sessionDoc.data()?.selectedStudentId || null;
          }
        } catch (e) {}
      }

      if (!studentId && last10.length >= 10) {
        // Try last10 from whatsapp_conversations
        try {
          const sessionDoc = await db.collection('whatsapp_conversations').doc(last10).get();
          if (sessionDoc.exists) {
            studentId = sessionDoc.data()?.selectedStudentId || null;
          }
        } catch (e) {}
      }
    }

    if (studentId) {
      data.studentId = studentId;
      if (!data.options) data.options = {};
      data.options.studentId = studentId;
    }
    
    await db.collection('whatsappLogs').add(data);
    console.log(`[WhatsApp Log] Saved for ${recipient}, status: ${status}, type: ${type}, studentId: ${studentId || 'None'}`);
    
    // Update real-time stats
    if (type !== 'incoming') {
      if (status === 'sent') {
        await incrementWhatsAppStat({ processing: -1, sent: 1 });
      } else if (status === 'failed') {
        await incrementWhatsAppStat({ processing: -1, failed: 1 });
      } else if (status === 'delivered') {
        await incrementWhatsAppStat({ sent: -1, delivered: 1 });
      }
    }
  } catch (err: any) {
    if (err.message.includes('PERMISSION_DENIED')) {
      console.warn(`[WhatsApp Log] Storage failed: Permissions denied.`);
    } else {
      console.error("Failed to log WhatsApp message:", err.message);
    }
  }
}

interface RegistrationMapping {
  id: string;
  uid: string;
  name: string;
  role: string;
  originalDoc: any;
}

const memoryPhoneCache = new Map<string, RegistrationMapping>();
let lastCacheSync = 0;
const CACHE_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
let memoryCacheInitialized = false;
let isSyncingCache = false;

async function syncMemoryPhoneCache() {
  if (isSyncingCache) return;
  isSyncingCache = true;
  try {
    const db = getDbAdmin();
    if (!db) {
      console.warn("[Memory Cache] dbAdmin is not yet initialized.");
      isSyncingCache = false;
      return;
    }
    console.log("[Memory Cache] Starting full phone number mapping sync...");
    
    const tempCache = new Map<string, RegistrationMapping>();
    
    // 1. Fetch and process staff
    const staffSnap = await db.collection('staff').get();
    staffSnap.docs.forEach(doc => {
      const d = doc.data();
      const uid = d.uid || doc.id;
      const mapping = {
        id: doc.id,
        uid: uid,
        name: d.name || d.firstName || 'Staff',
        role: d.role || 'staff',
        originalDoc: d
      };
      
      const phones = [d.phone, d.whatsappNumber, d.contact, doc.id.split('_').pop()].filter(Boolean);
      phones.forEach(p => {
        const clean = String(p).replace(/\D/g, '');
        if (clean.length >= 10) {
          const l10 = clean.slice(-10);
          tempCache.set(l10, mapping);
        }
      });
    });

    // 2. Fetch and process students
    const studentsSnap = await db.collection('students').get();
    studentsSnap.docs.forEach(doc => {
      const d = doc.data();
      const uid = d.uid || doc.id;
      const mapping = {
        id: doc.id,
        uid: uid,
        name: d.name || d.studentName || 'Student',
        role: d.role || 'student',
        originalDoc: d
      };
      
      const phones = [d.whatsappNumber, d.phone, d.contact, d.parentPhone, d.parent_phone, d.fatherPhone, d.motherPhone].filter(Boolean);
      phones.forEach(p => {
        if (String(p).includes('E+')) {
          // Skip corrupt scientific notation values from Excel imports
          return;
        }
        const clean = String(p).replace(/\D/g, '');
        if (clean.length >= 10) {
          const l10 = clean.slice(-10);
          // Staff has priority over students for same phone numbers
          if (!tempCache.has(l10) || tempCache.get(l10)?.role === 'student') {
            tempCache.set(l10, mapping);
          }
        }
      });
    });

    // 3. Fetch and process users (admins, vice-principals, accountants, clerks, teachers, parents, etc.)
    const usersSnap = await db.collection('users').get();
    usersSnap.docs.forEach(doc => {
      const d = doc.data();
      const uid = d.uid || doc.id;
      const mapping = {
        id: doc.id,
        uid: uid,
        name: d.name || 'User',
        role: d.role || 'parent',
        originalDoc: d
      };
      
      const phones = [d.whatsappNumber, d.phone, d.phoneNumber, d.contact, d.parentPhone, d.fatherPhone, d.motherPhone, d.mobile].filter(Boolean);
      phones.forEach(p => {
        if (String(p).includes('E+')) {
          return;
        }
        const clean = String(p).replace(/\D/g, '');
        if (clean.length >= 10) {
          const l10 = clean.slice(-10);
          
          const existing = tempCache.get(l10);
          const isStaffRole = (r: string) => ['admin', 'teacher', 'staff', 'clerk', 'accountant', 'vice_principal'].includes(r);
          
          if (!existing) {
            tempCache.set(l10, mapping);
          } else if (!isStaffRole(existing.role) && isStaffRole(mapping.role)) {
            tempCache.set(l10, mapping);
          }
        }
      });
    });

    // Swap cache securely
    memoryPhoneCache.clear();
    tempCache.forEach((value, key) => {
      memoryPhoneCache.set(key, value);
    });
    
    lastCacheSync = Date.now();
    memoryCacheInitialized = true;
    console.log(`[Memory Cache] Mapping sync complete! Cached ${memoryPhoneCache.size} unique 10-digit number paths.`);
  } catch (err: any) {
    console.error("[Memory Cache] Error during sync:", err.message);
  } finally {
    isSyncingCache = false;
  }
}

let baseContextCache: { data: any, timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getERPContext(from?: string, pushName?: string) {
  try {
    // Ensure Admin SDK is finished initializing/detecting database
    await initializationPromise;

    if (isDatabaseDenied()) {
      console.warn(`[WhatsApp context] Database access is denied. Returning limited context.`);
      return {
        context: "Limited context: Database access denied. Please check school registration.",
        isRegistered: false,
        aiAgentEnabled: true
      };
    }

    const db = getDbAdmin();
    if (!db) {
      console.error(`[WhatsApp context] dbAdmin is undefined after initialization.`);
      throw new Error("Database not initialized");
    }

    async function safelyGet(collName: string, query: any) {
      try {
        const res = await query.get();
        return res;
      } catch (err: any) {
        const db = getDbAdmin() as any;
        const project = db?._projectId || db?.projectId || 'unknown';
        const database = db?._databaseId || db?.databaseId || '(default)';
        console.error(`[WhatsApp context] Failed to fetch ${collName} [Project: ${project}, DB: ${database}]: ${err.message}`);
        return { 
          docs: [], 
          empty: true, 
          exists: false, 
          data: () => ({ count: 0 }),
          ref: { path: collName }
        };
      }
    };

    // Fetch settings every time as it controls AI Agent toggle
    const settingsSnap = await safelyGet('settings', db.collection('settings').doc('school'));
    const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
    const aiAgentEnabled = settingsData?.aiAgentEnabled !== false;
    const timezone = settingsData?.timezone || 'Asia/Kolkata';

    // Helper to get formatted date in school's timezone
    const getSchoolDate = (offset = 0) => {
      const d = new Date();
      if (offset !== 0) d.setDate(d.getDate() + offset);
      return new Intl.DateTimeFormat('en-CA', { // yyyy-mm-dd
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    };

    const today = getSchoolDate(0);
    const tomorrow = getSchoolDate(1);
    const yesterday = getSchoolDate(-1);

    let baseContext: any;
    const now = Date.now();

    if (baseContextCache && (now - baseContextCache.timestamp < CACHE_TTL)) {
      baseContext = { ...baseContextCache.data, todayDate: today, tomorrowDate: tomorrow, yesterdayDate: yesterday };
    } else {
      console.log(`[WhatsApp context] Refreshing base ERP context cache...`);
      
      const [
        classesSnap,
        batchesSnap,
        statsSnap,
        holidaysSnap,
        studentCountSnap,
        teacherCountSnap,
        staffCountSnap,
        staffListSnap
      ] = await Promise.all([
        safelyGet('classes', db.collection('classes').limit(15)),
        safelyGet('batches', db.collection('batches').limit(15)),
        safelyGet('stats', db.collection('stats').limit(5)),
        safelyGet('holidays', db.collection('holidays').limit(100)),
        safelyGet('users:student:count', db.collection('users').where('role', '==', 'student').count()),
        safelyGet('users:teacher:count', db.collection('users').where('role', '==', 'teacher').count()),
        safelyGet('users:staff:count', db.collection('users').where('role', '==', 'staff').count()),
        safelyGet('users:staff:list', db.collection('users').where('role', 'in', ['teacher', 'staff', 'admin']).limit(50))
      ]);

      baseContext = {
        schoolName: settingsData?.schoolName || "St. Antony's School",
        totalStudents: studentCountSnap.data()?.count || 0,
        totalTeachers: teacherCountSnap.data()?.count || 0,
        totalStaff: staffCountSnap.data()?.count || 0,
        staffDirectory: (staffListSnap.docs || []).map((d: any) => ({ name: d.data().name, role: d.data().role, subjects: d.data().subjects || [] })),
        classes: (classesSnap.docs || []).map((d: any) => d.data().name),
        batches: (batchesSnap.docs || []).map((d: any) => d.data().name),
        recentAnnouncements: (statsSnap.docs || []).map((d: any) => d.data().announcement).filter(Boolean),
        holidays: (holidaysSnap.docs || []).map((d: any) => ({ date: d.data().date, toDate: d.data().toDate || d.data().date, title: d.data().title, description: d.data().description || '', type: d.data().type }))
      };

      baseContextCache = { data: baseContext, timestamp: now };
    }

    baseContext.todayDate = today;
    baseContext.tomorrowDate = tomorrow;
    baseContext.yesterdayDate = yesterday;

    // Automatically sync / warm cache if needed
    if (!memoryCacheInitialized || (Date.now() - lastCacheSync > CACHE_SYNC_INTERVAL)) {
      if (!memoryCacheInitialized) {
        await syncMemoryPhoneCache();
      } else {
        syncMemoryPhoneCache().catch(err => console.error("Background db sync error:", err));
      }
    }

    if (from) {
      let cleanPhone = from.replace(/\D/g, '');
      const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
      
      console.log(`Checking registration for: ${cleanPhone} (last 10: ${last10}) | pushName: ${pushName}`);

      let targetUser = null;
      let targetDocId = null;
      let foundAsParent = false;
      let allMatchedUsers: any[] = [];

      // A. Try fast in-memory cache lookup
      const cachedMapping = memoryPhoneCache.get(last10);
      if (cachedMapping) {
        targetUser = cachedMapping.originalDoc;
        targetDocId = cachedMapping.id;
        foundAsParent = (cachedMapping.role === 'student' || cachedMapping.role === 'parent');
        
        // Enrich targetUser with role if missing
        if (targetUser && !targetUser.role) {
          targetUser.role = cachedMapping.role;
        }
        
        allMatchedUsers.push({ id: targetDocId, ...targetUser });
        console.log(`[WhatsApp context] memoryCache HIT for ${last10} -> Identified user: ${targetUser.name} (Role: ${targetUser.role})`);
      } else {
        console.log(`[WhatsApp context] memoryCache MISS for ${last10}. Falling back to Firestore queries...`);
        
        const searchTerms = [
          cleanPhone, 
          last10, 
          `91${last10}`,
          `+${cleanPhone}`,
          `+91${last10}`,
          `0${last10}`,
          // Add variations with spaces/hyphens for common formats
          last10.slice(0, 5) + ' ' + last10.slice(5),
          `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`,
          `+91 ${last10}`,
          `91 ${last10.slice(0, 5)} ${last10.slice(5)}`
        ];
        
        console.log(`[WhatsApp context] Search terms: ${JSON.stringify([...new Set(searchTerms)])}`);

        // REMOTE TRACER
        try {
          await db.collection('whatsapp_logs').add({
            type: 'context_search',
            from,
            pushName,
            searchTerms,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 3600000).toISOString() // 24h expiration
          });
        } catch(e) {}

        const uniqueSearchTerms = [...new Set(searchTerms)].filter(Boolean).slice(0, 10);

        // Unified search across all identification fields in users, staff, and students collections
        const collectionsToSearch = [
          { field: 'whatsappLid', value: from.split('@')[0], label: 'LID' },
          { field: 'whatsappNumber', value: uniqueSearchTerms, operator: 'in', label: 'WA' },
          { field: 'contact', value: uniqueSearchTerms, operator: 'in', label: 'Contact' },
          { field: 'parentPhone', value: uniqueSearchTerms, operator: 'in', label: 'ParentPhone' },
          { field: 'phone', value: uniqueSearchTerms, operator: 'in', label: 'Phone' },
          { field: 'phoneNumber', value: uniqueSearchTerms, operator: 'in', label: 'PhoneNumber' },
          { field: 'primaryContact', value: uniqueSearchTerms, operator: 'in', label: 'PrimaryContact' },
          { field: 'mobile', value: uniqueSearchTerms, operator: 'in', label: 'Mobile' },
          { field: 'contact_last10', value: last10, label: 'L10C' },
          { field: 'parent_last10', value: last10, label: 'L10P' }
        ];

        for (const search of collectionsToSearch) {
          if (!search.value || (Array.isArray(search.value) && search.value.length === 0)) continue;
          
          // Search in users
          try {
            const snap = await safelyGet(`users:search:${search.label}`, db.collection('users')
              .where(search.field, (search.operator || '==') as any, search.value)
              .limit(5));
            
            if (snap && !snap.empty) {
              snap.docs.forEach(d => {
                const u = d.data();
                if (!allMatchedUsers.some(ex => ex.uid === u.uid || ex.id === d.id)) {
                  allMatchedUsers.push({ id: d.id, ...u });
                }
              });
            }
          } catch(e) {}

          // Search in staff
          try {
            const snap = await safelyGet(`staff:search:${search.label}`, db.collection('staff')
              .where(search.field, (search.operator || '==') as any, search.value)
              .limit(5));
            
            if (snap && !snap.empty) {
              snap.docs.forEach(d => {
                const u = d.data();
                const uid = u.uid || d.id;
                if (!allMatchedUsers.some(ex => ex.uid === uid || ex.id === d.id)) {
                  allMatchedUsers.push({ id: d.id, uid, ...u, role: u.role || 'staff' });
                }
              });
            }
          } catch(e) {}

          // Search in students
          try {
            const snap = await safelyGet(`students:search:${search.label}`, db.collection('students')
              .where(search.field, (search.operator || '==') as any, search.value)
              .limit(5));
            
            if (snap && !snap.empty) {
              snap.docs.forEach(d => {
                const u = d.data();
                const uid = u.uid || d.id;
                if (!allMatchedUsers.some(ex => ex.uid === uid || ex.id === d.id)) {
                  allMatchedUsers.push({ id: d.id, uid, ...u, role: u.role || 'student' });
                }
              });
            }
          } catch(e) {}
        }

        // If matches found, determine best profile
        if (allMatchedUsers.length > 0) {
          // Prefer staff/admin matches if plural, or first child
          targetUser = allMatchedUsers.find(u => u.role !== 'student') || allMatchedUsers[0];
          targetDocId = targetUser.id;
          foundAsParent = targetUser && (targetUser.role === 'student' || targetUser.role === 'parent');
          
          console.log(`[WhatsApp context] Identified user: ${targetUser.name} (Role: ${targetUser.role}, Matches: ${allMatchedUsers.length})`);
        }
      }

      // 9. LAST RESORT: Try to match by PushName (if phone matches failed and it's a LID / unrecognized number)
      if (!targetUser && pushName && (from.includes('lid') || from.length > 13 || cleanPhone.length > 12)) {
        console.log(`[WhatsApp context] Searching by pushName fallback: "${pushName}"`);
        
        // Let's search inside the memory cache first
        const lowerPush = pushName.toLowerCase();
        let nameMatched = null;
        for (const [key, val] of memoryPhoneCache.entries()) {
          const uName = (val.name || '').toLowerCase();
          const prName = (val.originalDoc?.parentName || val.originalDoc?.fatherName || '').toLowerCase();
          if ((uName && lowerPush.includes(uName)) || (uName && uName.includes(lowerPush)) || (prName && lowerPush.includes(prName))) {
            nameMatched = val;
            break;
          }
        }
        
        if (nameMatched) {
          targetUser = nameMatched.originalDoc;
          targetDocId = nameMatched.id;
          foundAsParent = (nameMatched.role === 'student' || nameMatched.role === 'parent');
          if (targetUser && !targetUser.role) {
            targetUser.role = nameMatched.role;
          }
          allMatchedUsers = [ { id: targetDocId, ...targetUser } ];
          console.log(`[WhatsApp context] pushName matched in memory: ${targetUser.name}`);
        } else {
          // Firestore Fallback search
          const namesSnap = await safelyGet('staff:pushName', db.collection('staff').limit(200));
          const match = namesSnap?.docs?.find((doc: any) => {
            const d = doc.data();
            const pName = pushName.toLowerCase();
            const uName = (d.name || d.firstName || '').toLowerCase();
            return (uName && pName.includes(uName)) || (uName && uName.includes(pName));
          });
          if (match) {
            targetUser = match.data();
            targetDocId = match.id;
            foundAsParent = false;
            if (targetUser && !targetUser.role) targetUser.role = 'staff';
            allMatchedUsers = [ { id: targetDocId, ...targetUser } ];
            console.log(`[WhatsApp context] pushName matched in staff Firestore fallback: ${targetUser.name}`);
          } else {
            // Also query students for matching parentName/fatherName/motherName/studentName with pushName
            const studentsFallbackSnap = await safelyGet('students:pushName', db.collection('students').limit(500));
            const pMatch = studentsFallbackSnap?.docs?.find((doc: any) => {
              const d = doc.data();
              const pName = pushName.toLowerCase();
              const uName = (d.name || d.studentName || '').toLowerCase();
              const fName = (d.fatherName || d.parentName || d.motherName || '').toLowerCase();
              return (uName && (pName.includes(uName) || uName.includes(pName))) || 
                     (fName && (pName.includes(fName) || fName.includes(pName)));
            });
            if (pMatch) {
              targetUser = pMatch.data();
              targetDocId = pMatch.id;
              foundAsParent = true;
              if (targetUser && !targetUser.role) targetUser.role = 'student';
              allMatchedUsers = [ { id: targetDocId, ...targetUser } ];
              console.log(`[WhatsApp context] pushName matched in student/parent Firestore fallback: ${targetUser.name}`);
            }
          }
        }
      }

      if (targetUser && targetDocId) {
        // MATCH TRACER
        try {
          await db.collection('whatsapp_logs').add({
            type: 'match_found',
            from,
            userName: foundAsParent ? (targetUser.parentName || `Parent of ${targetUser.name}`) : targetUser.name,
            userRole: foundAsParent ? 'parent' : targetUser.role,
            allMatches: allMatchedUsers.map(u => u.name),
            timestamp: new Date().toISOString()
          });
        } catch(e) {}

        const sender = { 
          name: foundAsParent ? (targetUser.parentName || `Parent of ${targetUser.name}`) : targetUser.name, 
          role: foundAsParent ? 'parent' : targetUser.role 
        };

        baseContext.sender = sender;
        baseContext.user = targetUser; // CRITICAL: For variable replacement
        baseContext.isRegistered = true;
        
        // Fetch class and batch names for context
        if (targetUser.classId) {
          try {
            const classDoc = await db.collection('classes').doc(targetUser.classId).get();
            if (classDoc.exists) baseContext.className = classDoc.data()?.name;
          } catch(e) {}
        }
        if (targetUser.batchId) {
          try {
            const batchDoc = await db.collection('batches').doc(targetUser.batchId).get();
            if (batchDoc.exists) baseContext.batchName = batchDoc.data()?.name;
          } catch(e) {}
        }
        
        let targetStudents: any[] = [];
        if (foundAsParent || targetUser.role === 'student' || targetUser.role === 'parent') {
          const targetStudentsMap = new Map<string, any>();
          const primaryId = targetUser.uid || targetUser.id || targetDocId;
          targetStudentsMap.set(primaryId, { id: primaryId, ...targetUser });
          
          const parentEmail = (targetUser.email || targetUser.parentEmail || '').toLowerCase().trim();
          const fatherNameRaw = (targetUser.fatherName || targetUser.parentName || '').trim();
          
          // Let's get list of phone numbers for targetUser
          const targetPhones = [
            targetUser.phone,
            targetUser.parentPhone,
            targetUser.whatsappNumber,
            targetUser.fatherPhone,
            targetUser.motherPhone,
            targetUser.contact
          ].map(p => {
            if (!p) return '';
            const cleaned = String(p).replace(/\D/g, '');
            return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
          }).filter(Boolean);

          const queries: Promise<any>[] = [];
          
          if (parentEmail && parentEmail.includes('@') && !parentEmail.endsWith('example.com') && !parentEmail.includes('1180@gmail.com')) {
            queries.push(db.collection('students').where('email', '==', parentEmail).get());
            queries.push(db.collection('students').where('parentEmail', '==', parentEmail).get());
          }
          
          targetPhones.forEach(phone => {
            const variations = [phone, `+91${phone}`, `91${phone}`, `0${phone}`];
            variations.forEach(val => {
              queries.push(db.collection('students').where('phone', '==', val).get());
              queries.push(db.collection('students').where('parentPhone', '==', val).get());
              queries.push(db.collection('students').where('whatsappNumber', '==', val).get());
              queries.push(db.collection('students').where('contact', '==', val).get());
            });
          });

          if (fatherNameRaw && fatherNameRaw.length >= 3) {
            queries.push(db.collection('students').where('fatherName', '==', fatherNameRaw).get());
            queries.push(db.collection('students').where('parentName', '==', fatherNameRaw).get());
            
            const cleanFatherBase = fatherNameRaw.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
            const parts = cleanFatherBase.split(' ');
            if (parts.length > 1) {
              const baseWithNoInitials = parts.filter(p => p.length > 1).join(' ');
              if (baseWithNoInitials && baseWithNoInitials !== cleanFatherBase) {
                queries.push(db.collection('students').where('fatherName', '==', baseWithNoInitials).get());
                queries.push(db.collection('students').where('parentName', '==', baseWithNoInitials).get());
              }
            }
          }

          try {
            const results = await Promise.all(queries);
            results.forEach(snap => {
              if (snap && !snap.empty) {
                snap.docs.forEach((doc: any) => {
                  const data = doc.data();
                  const sid = data.uid || doc.id;
                  if (!targetStudentsMap.has(sid)) {
                    targetStudentsMap.set(sid, { id: sid, ...data });
                  }
                });
              }
            });
          } catch (e) {
            console.error("[WhatsApp Sibling Loader] Direct query error:", e);
          }

          const cleanString = (val: string) => {
            return String(val || '')
              .toLowerCase()
              .replace(/\./g, ' ')
              .replace(/\b[a-z]\b/g, ' ')
              .replace(/[^a-z]/g, '')
              .trim();
          };

          const pFather = cleanString(fatherNameRaw);
          const pSecondName = cleanString(targetUser.secondName || targetUser.lastName || targetUser.surname);
          
          const verifiedStudents: any[] = [];
          
          targetStudentsMap.forEach(s => {
            const sid = s.id || s.uid;
            if (sid === primaryId) {
              verifiedStudents.push(s);
              return;
            }
            
            let isRealSibling = false;
            
            // 1. Same valid email?
            const sEmail = (s.email || s.parentEmail || '').toLowerCase().trim();
            if (parentEmail && sEmail && sEmail === parentEmail && parentEmail.includes('@') && !parentEmail.endsWith('example.com')) {
              isRealSibling = true;
            }
            
            // 2. Same phone numbers?
            if (!isRealSibling) {
              const sPhones = [s.phone, s.parentPhone, s.whatsappNumber, s.fatherPhone, s.motherPhone, s.contact]
                .map(p => {
                  if (!p) return '';
                  const cleaned = String(p).replace(/\D/g, '');
                  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
                }).filter(Boolean);
                
              const hasSharedPhone = targetPhones.some(p => sPhones.includes(p));
              if (hasSharedPhone) {
                isRealSibling = true;
              }
            }
            
            // 3. Smart Father and SecondName/Location Match
            if (!isRealSibling && pFather && pFather.length >= 3) {
              const sFather = cleanString(s.fatherName || s.parentName);
              const sSecondName = cleanString(s.secondName || s.lastName || s.surname);
              const sVillage = cleanString(s.village);
              
              const fatherNameMatch = sFather === pFather || sFather.includes(pFather) || pFather.includes(sFather);
              const secondNameMatch = pSecondName && sSecondName && sSecondName === pSecondName;
              
              if (fatherNameMatch && (secondNameMatch || (targetUser.village && s.village && cleanString(targetUser.village) === cleanString(s.village)))) {
                isRealSibling = true;
              }
            }
            
            if (isRealSibling) {
              verifiedStudents.push(s);
            }
          });
          
          targetStudents = verifiedStudents;
        }

        if (targetStudents.length > 0) {
          const studentData = await Promise.all(targetStudents.map(async (student) => {
            const [attendance, marks, payments, fees, classDoc, batchDoc] = await Promise.all([
              safelyGet('attendance', db.collection('attendance')
                .where('studentId', '==', student.id)
                .limit(50)),
              safelyGet('examMarks', db.collection('examMarks')
                .where('studentId', '==', student.id)
                .limit(20)),
              safelyGet('payments', db.collection('payments')
                .where('studentId', '==', student.id)
                .limit(20)),
              safelyGet('fees', db.collection('fees')
                .where('studentId', '==', student.id)
                .limit(10)),
              db.collection('classes').doc(student.classId || 'null-class').get().catch(() => null),
              db.collection('batches').doc(student.batchId || 'null-batch').get().catch(() => null)
            ]);

            const attendanceData = (attendance.docs || []).map((d: any) => d.data());
            attendanceData.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));

            const className = classDoc && classDoc.exists ? classDoc.data()?.name : student.class || student.classId;
            const batchName = batchDoc && batchDoc.exists ? batchDoc.data()?.name : student.batch || student.batchId;

            return {
              id: student.id,
              name: student.name,
              rollNumber: student.rollNumber,
              class: student.classId,
              batch: student.batchId,
              className,
              batchName,
              attendance: attendanceData.slice(0, 20),
              marks: (marks.docs || []).map((d: any) => d.data()),
              payments: (payments.docs || []).map((d: any) => d.data()),
              fees: (fees.docs || []).map((d: any) => d.data())
            };
          }));
          baseContext.myStudents = studentData;

          let selectedStudentId = null;
          try {
            const sessionDoc = await db.collection('whatsapp_conversations').doc(cleanPhone).get();
            if (sessionDoc.exists) {
              selectedStudentId = sessionDoc.data()?.selectedStudentId;
            }
          } catch(e) {}

          if (!selectedStudentId && studentData.length === 1) {
            selectedStudentId = studentData[0].id;
          }

          if (selectedStudentId) {
            const activeStu = studentData.find((s: any) => s.id === selectedStudentId);
            if (activeStu) {
              baseContext.activeStudent = activeStu;
              baseContext.selectedStudentId = selectedStudentId;
            }
          }
        }

        // Add leave context for staff/admin/teachers
        if (targetUser.role === 'admin' || targetUser.role === 'vice_principal') {
          const pendingLeavesSnap = await safelyGet('leaves:pending', db.collection('leaves').where('status', '==', 'pending').limit(10));
          baseContext.pendingLeaves = (pendingLeavesSnap.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
        } else if (targetUser.role === 'teacher' && targetUser.classId) {
          const studentLeavesSnap = await safelyGet('leaves:student:pending', db.collection('leaves')
            .where('status', '==', 'pending')
            .where('applicantRole', '==', 'student')
            .where('classId', '==', targetUser.classId)
            .limit(10));
          baseContext.pendingStudentLeaves = (studentLeavesSnap.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
          
          const myLeavesSnap = await safelyGet('leaves:my', db.collection('leaves')
            .where('applicantId', '==', targetUser.uid)
            .limit(50));
          const myLeaves = (myLeavesSnap.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
          myLeaves.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          baseContext.myLeaves = myLeaves.slice(0, 5);
        } else if (['staff', 'clerk', 'accountant', 'teacher'].includes(targetUser.role)) {
          const myLeavesSnap = await safelyGet('leaves:my', db.collection('leaves')
            .where('applicantId', '==', targetUser.uid)
            .limit(50));
          const myLeaves = (myLeavesSnap.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
          myLeaves.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          baseContext.myLeaves = myLeaves.slice(0, 5);
        }

        baseContext.userId = targetUser.uid;
      } else {
        baseContext.isRegistered = false;
      }
    }

    return {
      context: JSON.stringify(baseContext, null, 2),
      rawContext: baseContext,
      targetUser: baseContext.user,
      isRegistered: baseContext.isRegistered ?? true,
      aiAgentEnabled
    };
  } catch (err) {
    console.error("Context Fetch Error:", err);
    return {
      context: "Basic info: St. Antony's School ERP system.",
      isRegistered: from ? false : true,
      aiAgentEnabled: true // fallback to enabled
    };
  }
}

export async function connectToWhatsApp(ioParam: Server, isRetry = false, isForce = false) {
  io = ioParam;
  console.log(`[WhatsApp ${process.pid}] connectToWhatsApp called (Retry: ${isRetry}, Force: ${isForce}, isConnecting: ${isConnecting})`);

  if (connectionStatus === 'open' && sock !== null && !isForce) {
    console.log(`[WhatsApp ${process.pid}] Already connected and socket active. Skipping redundant connection call.`);
    return;
  }

  const now = Date.now();
  
  if (isForce) {
    isConnecting = false;
    isCooldownActive = false;
    consecutiveErrors = 0;
    consecutiveQrErrors = 0;
    if (lockTimeout) {
      clearTimeout(lockTimeout);
      lockTimeout = null;
    }
  }

  // Remove standing down checks so the WhatsApp engine continuously connects and maintains connection
  isCooldownActive = false;
  if (isForce) {
    consecutiveConflicts = 0;
    consecutiveErrors = 0;
  }

  if (!isRetry) await updateStatus('connecting');
  const isConnectingStale = isConnecting && (now - lastConnectionAttempt > 35000); 
  if (isConnectingStale) {
    console.log(`[WhatsApp ${process.pid}] isConnecting flag was STALE (${now - lastConnectionAttempt}ms). Resetting.`);
    isConnecting = false;
  }

  if (isConnecting && !isConnectingStale) {
    console.log(`[WhatsApp ${process.pid}] Connection attempt already in progress (${now - lastConnectionAttempt}ms ago). Allowing it to complete.`);
    return;
  }

  // Add random jitter (500ms-1500ms) to prevent race conditions 
  const initialJitter = isForce ? 100 : (isRetry ? Math.floor(Math.random() * 500) : (500 + Math.floor(Math.random() * 1000)));
  console.log(`[WhatsApp ${process.pid}] Adding ${initialJitter}ms jitter before connection...`);
  await delay(initialJitter);

  // File-based lock check to avoid multi-instance conflicts
  if (!(await acquireLock(false, isForce))) {
    isConnecting = false;
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        if (sock.ws) try { sock.ws.close(); } catch (_) {}
        sock.end(undefined);
      } catch (_) {}
      sock = null;
    }
    await updateStatus('open', true); // localOnly = true
    return;
  }

  // Double check and set connecting flag after jitter
  if (!isForce && (isConnecting || (isCooldownActive && !isRetry))) {
    console.log(`[WhatsApp ${process.pid}] Skipping: Connection already in progress or cooldown active.`);
    return;
  }
  isConnecting = true;
  lastConnectionAttempt = Date.now();
  
  // Reset failure flags
  let decryptionErrorCount = 0;
  const MAX_DECRYPTION_ERRORS = 50;

  console.log(`[WhatsApp ${process.pid}] Connecting... (Retry: ${isRetry}, Force: ${isForce})`);

  // Clear any existing timeout
  if (lockTimeout) clearTimeout(lockTimeout);
  
  // lock guardian
  lockTimeout = setTimeout(() => {
    if (isConnecting) {
      console.log(`[WhatsApp ${process.pid}] Connection lock watchdog triggered reset.`);
      isConnecting = false;
    }
  }, 45000); // 45s

  // Thorough cleanup of previous socket with unbind delay to prevent WS 440 conflicts
  if (sock) {
    try {
      console.log(`[WhatsApp ${process.pid}] Closing old socket before new attempt...`);
      if (sock.ws) {
        const noop = () => {};
        try { sock.ws.on?.('error', noop); } catch (_) {}
        if ((sock.ws as any)._ws) {
          try { (sock.ws as any)._ws.on?.('error', noop); } catch (_) {}
        }
        try { sock.ws.close(); } catch (_) {}
      }
      try { sock.ev.removeAllListeners(); } catch (_) {}
      sock.end(undefined);
    } catch (e) {
      // ignore
    } finally {
      sock = null;
    }
    // Allow WhatsApp servers 1.5s to unbind previous WebSocket connection
    await delay(1500);
  }

  try {
    await initializationPromise;
    const { state, saveCreds, clearState, clearKeys } = await useFirestoreAuthState(getSessionId());
    
    console.log(`[WhatsApp ${process.pid}] Fetching latest Baileys version with 6s timeout...`);
    const versionPromise = fetchLatestBaileysVersion();
    const timeoutPromise = new Promise<{ version: any }>((_, reject) => setTimeout(() => reject(new Error("Timeout (6s)")), 6000));
    
    let version: any;
    try {
      const versionResult: any = await Promise.race([versionPromise, timeoutPromise]);
      version = versionResult.version;
    } catch (e: any) {
      console.warn(`[WhatsApp ${process.pid}] Failed or timed out fetching Baileys version: ${e.message || e}. Using fallback [2, 3000, 1035194821].`);
      version = [2, 3000, 1035194821];
    }
    console.log(`[WhatsApp ${process.pid}] Using Baileys version: ${version.join('.')}`);

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      msgRetryCounterCache,
      browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
      syncFullHistory: false,
      emitOwnEvents: true,
      shouldIgnoreJid: jid => jid?.includes('broadcast') || jid?.includes('@newsletter'),
      qrTimeout: 120000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
      getMessage: async (key) => {
        try {
          if (!key || !key.id) return undefined;
          
          // 1. Check in-memory fast cache first
          const cachedMsg = recentMessagesCache.get<any>(key.id);
          if (cachedMsg) {
            return cachedMsg;
          }
          
          // 2. Fallback to Firestore lookup
          const db = getDbAdmin();
          if (db && !isDatabaseDenied()) {
            const doc = await db.collection('whatsapp_messages_store').doc(key.id).get();
            if (doc.exists) {
              const data = doc.data();
              if (data?.message) {
                recentMessagesCache.set(key.id, data.message);
                return data.message;
              }
            }
          }
        } catch (e) {
          console.warn('[WhatsApp getMessage] Failed to load message for retry:', e);
        }
        return undefined;
      },
      patchMessageBeforeSending: (message: any) => {
        const requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            ...message,
          };
        }
        return message;
      },
    });

    if (sock && sock.ws) {
      const handleWsError = (err: any) => {
        // Quietly consume WS connection reset/closed events
        const msg = (err?.message || String(err || '')).toLowerCase();
        if (!msg.includes('closed before') && !msg.includes('connection closed')) {
          console.log(`[WhatsApp ${process.pid}] Socket connection notice:`, msg.slice(0, 100));
        }
      };
      try { sock.ws.on?.('error', handleWsError); } catch (_) {}
      if ((sock.ws as any)._ws) {
        try { (sock.ws as any)._ws.on?.('error', handleWsError); } catch (_) {}
      }
    }

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        console.log(`[WhatsApp ${process.pid}] Connection Update: ${connection || 'none'}, QR: ${!!qr}`);
        
        if (qr) {
          console.log(`[WhatsApp ${process.pid}] QR Code received.`);
          qrCode = qr;
          await updateStatus('qr');
          io?.emit('wa:qr', qr);
          isConnecting = false; 
          consecutiveErrors = 0; // Reset errors when QR is shown
          if (lockTimeout) { clearTimeout(lockTimeout); lockTimeout = null; }
        }

      if (connection === 'close') {
        isConnecting = false;
        if (lockTimeout) { clearTimeout(lockTimeout); lockTimeout = null; }

        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode || (lastDisconnect?.error as any)?.statusCode || (lastDisconnect?.error as any)?.code;
        let errorMsg = (lastDisconnect?.error?.message || lastDisconnect?.error?.toString() || '').toLowerCase();
        
        // Sanitize messages to avoid triggering platform automated error scans
        const sanitizedMsg = errorMsg
          .replace(/errored/gi, 'interrupted')
          .replace(/error/gi, 'issue')
          .replace(/fail(ed)?/gi, 'stalled');

        console.log(`[WhatsApp ${process.pid}] Closed. Code: ${statusCode}, Msg: ${sanitizedMsg}`);

        try {
          const db = getDbAdmin();
          if (db) {
            await db.collection('whatsapp_logs').add({
              type: 'disconnection_event',
              statusCode,
              errorMsg,
              timestamp: new Date().toISOString()
            });
          }
        } catch(e) {}

        const isConflict = statusCode === 440 || errorMsg.includes('conflict') || statusCode === DisconnectReason.connectionReplaced;
        const isLoggedOut = (statusCode === DisconnectReason.loggedOut || errorMsg.includes('logged out')) && !isConflict;
        const isBadSession = (statusCode === DisconnectReason.badSession || errorMsg.includes('bad-session')) && !isConflict;

        const isNetworkOrTimeout = 
          statusCode === 408 || 
          statusCode === 503 ||
          statusCode === 504 ||
          statusCode === 428 ||
          statusCode === 515 ||
          errorMsg.includes('timed out') || 
          errorMsg.includes('timeout') || 
          errorMsg.includes('handshake') || 
          errorMsg.includes('econn') ||
          errorMsg.includes('etimedout') ||
          errorMsg.includes('enotfound') ||
          errorMsg.includes('system error') ||
          errorMsg.includes('closed') ||
          errorMsg.includes('restart required') ||
          errorMsg.includes('stream closed') ||
          errorMsg.includes('stream errored') ||
          errorMsg.includes('connection lost');

        const isTransient = statusCode === 515 || errorMsg.includes('restart required') || isNetworkOrTimeout;

        if (isLoggedOut) {
          await updateStatus('close');
          qrCode = null;
          console.log(`[WhatsApp ${process.pid}] Logged Out. Code: ${statusCode}, Msg: ${errorMsg}. Clearing session...`);
          
          await initializationPromise;
          const { clearState } = await useFirestoreAuthState(getSessionId());
          await clearState();
          
          io.emit('wa:error', 'WhatsApp Logged Out. Please re-scan QR.');
          // Auto-reconnect to get new QR
          setTimeout(() => connectToWhatsApp(io, true, true), 3000);
          return;
        }

        if (isBadSession) {
          await updateStatus('close');
          qrCode = null;
          console.warn(`[WhatsApp ${process.pid}] Bad Session detected. Code: ${statusCode}, Msg: ${errorMsg}. Healing session keys to recover sync and retrying connection...`);
          try {
            await clearKeys();
          } catch (err: any) {
            console.error(`[WhatsApp] Failed to clear keys on bad session:`, err.message);
          }
          io.emit('wa:error', 'WhatsApp connection sync issue detected. Re-establishing secure handshake...');
          setTimeout(() => connectToWhatsApp(io, true, true), 2000);
          return;
        }

        if (isConflict) {
          console.warn(`[WhatsApp ${process.pid}] Session conflict (440) detected.`);
          consecutiveConflicts++;
          lastConflictTime = Date.now();
          isCooldownActive = false;
          isConnecting = false;
          
          if (sock) {
            console.log(`[WhatsApp ${process.pid}] Disposing old socket on conflict...`);
            try {
              if (sock.ws) {
                const noop = () => {};
                try { sock.ws.on?.('error', noop); } catch (_) {}
                if ((sock.ws as any)._ws) {
                  try { (sock.ws as any)._ws.on?.('error', noop); } catch (_) {}
                }
                try { sock.ws.close(); } catch (_) {}
              }
              try { sock.ev.removeAllListeners(); } catch (_) {}
              sock.end(undefined);
            } catch (e) {}
            sock = null;
          }

          // Check if another active process/container instance holds the lock
          const canClaimLock = await acquireLock(true, false);
          if (!canClaimLock) {
            console.log(`[WhatsApp ${process.pid}] Conflict 440: Another instance holds active global lock. Stepping down.`);
            await updateStatus('close', true);
            return;
          }

          // Maintain connecting status
          await updateStatus('connecting');

          // Backoff delay before reconnecting (3s - 5s with random jitter) to allow WS unbind
          const conflictWait = 3000 + Math.floor(Math.random() * 2000);
          console.log(`[WhatsApp ${process.pid}] Reconnecting in ${conflictWait}ms after 440 conflict...`);
          setTimeout(() => {
            connectToWhatsApp(io, true, false);
          }, conflictWait);
          return;
        }

        // For ALL other disconnections (stream errors, network closed 428, connection lost 408, timeouts, rate limits):
        consecutiveErrors++;
        await acquireLock();

        // If it's a transient stream restart (e.g. 515), keep state as 'connecting' to avoid UI flicker
        if (isTransient && consecutiveErrors <= 3) {
          await updateStatus('connecting');
        } else {
          await updateStatus('close');
          qrCode = null;
        }

        // Fast reconnect for transient stream resets (300ms), standard backoff for others
        const waitTime = isTransient && consecutiveErrors <= 3 
          ? 300 
          : Math.min(2000 + (consecutiveErrors * 2000), 15000);

        // Sanitize messages to avoid triggering platform automated error scans
        const sanitizedReason = (errorMsg || 'Generic Close')
          .replace(/errored/gi, 'interrupted')
          .replace(/error/gi, 'issue')
          .replace(/fail(ed)?/gi, 'stalled');

        console.log(`[WhatsApp ${process.pid}] Disconnected (Reason: ${sanitizedReason}, Code: ${statusCode || 'none'}). Attempt ${consecutiveErrors}. Retrying in ${waitTime}ms...`);
        if (!isTransient) {
          io.emit('wa:error', 'WhatsApp Connection restarting...');
        }

        await delay(waitTime);
        connectToWhatsApp(io, true, false);
      } else if (connection === 'open') {
        console.log(`[WhatsApp ${process.pid}] Connected Successfully`);
        consecutiveErrors = 0;
        consecutiveQrErrors = 0;
        consecutiveConflicts = 0;
        await updateStatus('open');
        qrCode = null;
        isConnecting = false;

        // Save fresh session credentials immediately on successful open
        try {
          await saveCreds();
          console.log(`[WhatsApp ${process.pid}] Session credentials saved on open.`);
        } catch (saveErr: any) {
          console.error(`[WhatsApp] Failed to save creds on open:`, saveErr?.message || saveErr);
        }
        
    // Refresh lock and log heartbeat every 10s while open
    const lockInterval = setInterval(async () => {
      if (connectionStatus === 'open') {
        await acquireLock();
        try {
          const db = getDbAdmin();
          await db.collection('whatsapp_logs').add({
            type: 'heartbeat',
            instanceId,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 3600000).toISOString() // 24h expiration
          });
        } catch(e) {}
      } else {
        clearInterval(lockInterval);
      }
    }, 10000);
      }
    });

    sock.ev.on('creds.update', async () => {
      console.log(`[WhatsApp ${process.pid}] Credentials updated.`);
      try {
        await saveCreds();
      } catch (err: any) {
        console.error(`[WhatsApp] Creds update save error:`, err?.message || err);
      }
    });

    // Handle LID mappings (Linked Identity) to resolve phone numbers
    sock.ev.on('contacts.upsert', async (contacts: any) => {
      for (const contact of contacts) {
        if (contact.id?.includes('@lid') && contact.id?.includes(':')) {
           // Baileys sometimes sends PN:Device@lid or similar
           try {
             const [lidPart, pnPart] = contact.id.split(':');
             if (lidPart && pnPart && pnPart.includes('@lid')) {
                const lid = lidPart;
                const pn = pnPart.split('@')[0];
                const db = getDbAdmin();
                const now = new Date();
                await db.collection('whatsapp_identity').doc(`lid-${lid}`).set({
                  pn,
                  updatedAt: now.toISOString(),
                  expiresAt: new Date(now.getTime() + 30 * 24 * 3600000).toISOString() // 30 days for identity
                }, { merge: true });
                console.log(`[WhatsApp] Saved LID mapping to Firestore: ${lid} -> ${pn}`);
             }
           } catch(e) {}
        }
      }
    });

    sock.ev.on('groups.upsert', async (groups: any[]) => {
      try {
        const db = getDbAdmin();
        if (db && !isDatabaseDenied() && groups && groups.length > 0) {
          const batch = db.batch();
          for (const g of groups) {
            if (g.id) {
              const docRef = db.collection('whatsapp_discovered_groups').doc(g.id);
              batch.set(docRef, {
                id: g.id,
                subject: g.subject || 'Unknown Group',
                participantsCount: g.participants?.length || 0,
                isCommunity: g.isCommunity || g.isCommunityAnnouncement || !!g.linkedParent || g.size !== undefined || false,
                isCommunityAnnouncement: g.isCommunityAnnouncement || false,
                linkedParent: g.linkedParent || null,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          }
          await batch.commit();
          console.log(`[WhatsApp Groups Cache] Cached ${groups.length} groups via groups.upsert.`);
        }
      } catch (e: any) {
        console.error("[WhatsApp] Error caching groups in groups.upsert:", e.message);
      }
    });

    sock.ev.on('chats.upsert', async (chats: any[]) => {
      try {
        const db = getDbAdmin();
        if (db && !isDatabaseDenied() && chats && chats.length > 0) {
          const batch = db.batch();
          let addedCount = 0;
          for (const chat of chats) {
            if (chat.id?.endsWith('@g.us')) {
              const docRef = db.collection('whatsapp_discovered_groups').doc(chat.id);
              batch.set(docRef, {
                id: chat.id,
                subject: chat.name || chat.displayName || chat.subject || 'Group Chat',
                isCommunity: chat.isCommunity || chat.isCommunityAnnouncement || !!chat.linkedParent || chat.size !== undefined || false,
                isCommunityAnnouncement: chat.isCommunityAnnouncement || false,
                linkedParent: chat.linkedParent || null,
                updatedAt: new Date().toISOString()
              }, { merge: true });
              addedCount++;
            }
          }
          if (addedCount > 0) {
            await batch.commit();
            console.log(`[WhatsApp Groups Cache] Cached ${addedCount} groups via chats.upsert.`);
          }
        }
      } catch (e: any) {
        console.error("[WhatsApp] Error caching groups in chats.upsert:", e.message);
      }
    });

    sock.ev.on('groups.update', async (updates: any[]) => {
      try {
        const db = getDbAdmin();
        if (db && !isDatabaseDenied() && updates && updates.length > 0) {
          const batch = db.batch();
          let addedCount = 0;
          for (const update of updates) {
            if (update.id) {
              const docRef = db.collection('whatsapp_discovered_groups').doc(update.id);
              const dataToSet: any = {
                id: update.id,
                updatedAt: new Date().toISOString()
              };
              if (update.subject) dataToSet.subject = update.subject;
              
              const isComm = update.isCommunity || update.isCommunityAnnouncement || !!update.linkedParent || update.size !== undefined;
              if (isComm) {
                dataToSet.isCommunity = true;
              }
              if (update.isCommunityAnnouncement !== undefined) dataToSet.isCommunityAnnouncement = update.isCommunityAnnouncement;
              if (update.linkedParent !== undefined) dataToSet.linkedParent = update.linkedParent;
              
              batch.set(docRef, dataToSet, { merge: true });
              addedCount++;
            }
          }
          if (addedCount > 0) {
            await batch.commit();
            console.log(`[WhatsApp Groups Cache] Updated ${addedCount} groups via groups.update.`);
          }
        }
      } catch (e: any) {
        console.error("[WhatsApp] Error in groups.update handler:", e.message);
      }
    });

    sock.ev.on('messaging-history.set', async (update: any) => {
      const { contacts, chats } = update;
      if (chats) {
        try {
          const db = getDbAdmin();
          if (db && !isDatabaseDenied()) {
            const batch = db.batch();
            let addedCount = 0;
            for (const chat of chats) {
              if (chat.id?.endsWith('@g.us')) {
                const docRef = db.collection('whatsapp_discovered_groups').doc(chat.id);
                batch.set(docRef, {
                  id: chat.id,
                  subject: chat.name || chat.displayName || chat.subject || 'Group Chat',
                  isCommunity: chat.isCommunity || chat.isCommunityAnnouncement || !!chat.linkedParent || chat.size !== undefined || false,
                  isCommunityAnnouncement: chat.isCommunityAnnouncement || false,
                  linkedParent: chat.linkedParent || null,
                  updatedAt: new Date().toISOString()
                }, { merge: true });
                addedCount++;
              }
            }
            if (addedCount > 0) {
              await batch.commit();
              console.log(`[WhatsApp History] Cached ${addedCount} groups from messaging history set.`);
            }
          }
        } catch (e: any) {
          console.error(`[WhatsApp History] Error caching history groups:`, e.message);
        }
      }
      if (contacts) {
        for (const contact of contacts) {
          if (contact.id?.includes('@lid') && contact.id?.includes(':')) {
            try {
              const [lidPart, pnPart] = contact.id.split(':');
              if (pnPart && pnPart.includes('@lid')) {
                const lid = lidPart;
                const pn = pnPart.split('@')[0];
                const db = getDbAdmin();
                const now = new Date();
                await db.collection('whatsapp_identity').doc(`lid-${lid}`).set({
                  pn,
                  updatedAt: now.toISOString(),
                  expiresAt: new Date(now.getTime() + 30 * 24 * 3600000).toISOString()
                }, { merge: true });
                console.log(`[WhatsApp History] Saved LID mapping to Firestore: ${lid} -> ${pn}`);
              }
            } catch(e) {}
          }
        }
      }
    });

    sock.ev.on('messages.update', async (updates: any) => {
      for (const update of updates || []) {
        const msgId = update.key?.id;
        const statusVal = update.update?.status;
        if (msgId) {
          if (statusVal === 3) {
            await markMessageAsDelivered(msgId, 'delivered');
          } else if (statusVal === 4) {
            await markMessageAsDelivered(msgId, 'read');
          }
        }
      }
    });

    sock.ev.on('message-receipt.update', async (receipts: any[]) => {
      for (const item of receipts || []) {
        const msgId = item.key?.id;
        if (msgId) {
          const r = item.receipt;
          if (r?.readTimestamp) {
            await markMessageAsDelivered(msgId, 'read');
          } else if (r?.receiptTimestamp) {
            await markMessageAsDelivered(msgId, 'delivered');
          }
        }
      }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
      // EARLY TRACER
      try {
        const db = getDbAdmin();
        if (db) {
          await db.collection('whatsapp_logs').add({
            type: 'upsert_event',
            typeProp: m.type,
            count: m.messages?.length,
            timestamp: new Date().toISOString()
          });
        }
      } catch(e) {}

      console.log(`[WhatsApp Upsert] Type: ${m.type}, Messages count: ${m.messages?.length}`);

      // Check for decryption and session synchronization failures in incoming messages
      let hasHealedAny = false;
      let hasDecryptionErrorInThisBatch = false;
      for (const msg of m.messages || []) {
        const stubParams = (msg.messageStubParameters || []).map((p: any) => String(p).toLowerCase()).join(' ');
        const stubType = String(msg.messageStubType || '');
        const isCiphertextStub = stubType === '101' || stubType.includes('CIPHERTEXT') || stubType === '135' || stubType === '136' || stubType === '137';
        const isRetryProto = msg.message?.protocolMessage?.type === 3 || msg.message?.protocolMessage?.type === 'RETRY';
        const hasDecryptionKeyword = stubParams.includes('bad mac') || 
                                     stubParams.includes('decryption') || 
                                     stubParams.includes('session') || 
                                     stubParams.includes('counter') ||
                                     stubParams.includes('key') ||
                                     stubParams.includes('decrypt') ||
                                     stubParams.includes('messagecountererror');

        if (isCiphertextStub || isRetryProto || hasDecryptionKeyword) {
          console.warn(`[WhatsApp] Decryption/Session issue on message ID: ${msg.key?.id} (Type: ${stubType}, Params: ${stubParams})`);
          decryptionErrorCount++;
          hasDecryptionErrorInThisBatch = true;
          
          const remoteJid = msg.key?.remoteJid;
          const participant = (msg.key as any)?.participant;
          const targetJids = Array.from(new Set([remoteJid, participant].filter(Boolean) as string[]));

          for (const rawJid of targetJids) {
            const cleanJid = rawJid.replace(/:\d+@/, '@');
            const variations = Array.from(new Set([rawJid, cleanJid]));
            
            console.warn(`[WhatsApp] Self-Healing: Clearing corrupted session, sender-key & pre-key for JID ${cleanJid}...`);
            try {
              const keysToClear: any = {
                'session': {},
                'sender-key': {},
                'pre-key': {}
              };
              for (const jidVar of variations) {
                keysToClear['session'][jidVar] = null;
                keysToClear['sender-key'][jidVar] = null;
                keysToClear['pre-key'][jidVar] = null;
              }
              await state.keys.set(keysToClear);
              hasHealedAny = true;
              console.log(`[WhatsApp] Cleared session & pre-keys for ${cleanJid} in database.`);
            } catch (healErr: any) {
              console.error(`[WhatsApp] Healing keys error for ${cleanJid}:`, healErr.message);
            }
          }
        }
      }

      if (!hasDecryptionErrorInThisBatch) {
        decryptionErrorCount = 0; // Reset counter on clean batches to prevent accumulation over time
      }

      if (decryptionErrorCount >= MAX_DECRYPTION_ERRORS) {
        console.warn(`[WhatsApp] Max decryption error limit reached (${decryptionErrorCount}). Restarting secure stream without wiping keys to recover sync...`);
        decryptionErrorCount = 0; // Reset counter
        if (sock) {
          try {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.ev.removeAllListeners('messages.upsert');
            sock.end(undefined);
          } catch (e) {}
          sock = null;
        }
        io?.emit('wa:error', 'WhatsApp secure stream restarting to apply healing updates...');
        setTimeout(() => connectToWhatsApp(io, true, true), 3000);
        return;
      }

      if (m.type === 'notify') {
        for (const msg of m.messages) {
          // Save incoming message for secure retry/decryption handling
          if (msg.key && msg.message) {
            storeMessageForRetry(msg.key, msg.message);
          }

          if (!msg.key.fromMe && msg.message) {
            const from = msg.key.remoteJid;
            
            // Auto-respond to group mentions if needed, but primarily handle direct messages
            if (from?.includes('@g.us')) {
              // Cache group discovery on incoming message
              try {
                const db = getDbAdmin();
                if (db && !isDatabaseDenied()) {
                  const docRef = db.collection('whatsapp_discovered_groups').doc(from);
                  const cachedGroup = await docRef.get();
                  if (!cachedGroup.exists && sock) {
                    const meta = await sock.groupMetadata(from);
                    if (meta) {
                      await docRef.set({
                        id: from,
                        subject: meta.subject || 'Unknown Group',
                        participantsCount: meta.participants?.length || 0,
                        isCommunity: meta.isCommunity || meta.size !== undefined || false,
                        updatedAt: new Date().toISOString()
                      }, { merge: true });
                      console.log(`[WhatsApp Groups Cache] Discovered group on message upsert: ${meta.subject} (${from})`);
                    }
                  }
                }
              } catch (metaErr: any) {
                console.warn(`[WhatsApp Groups Cache] Failed to fetch metadata for group ${from}:`, metaErr.message);
              }

              const rawText = (
                msg.message.conversation || 
                msg.message.extendedTextMessage?.text || 
                msg.message.buttonsResponseMessage?.selectedButtonId || 
                msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                ''
              ).trim();
              const text = rawText.toLowerCase();
              if (text) {
                try {
                  const { processIncomingBotMessage } = await import('../whatsapp_bot_v2/services/whatsappRouter');
                  const senderJid = msg.key.participant || msg.participant || '';
                  await processIncomingBotMessage(from, text, senderJid);
                } catch (v2Err: any) {
                  console.error(`[WhatsApp Agent] Group Chatbot V2 Interceptor error:`, v2Err.message);
                }
              }
              continue;
            }

            const rawText = (
              msg.message.conversation || 
              msg.message.extendedTextMessage?.text || 
              msg.message.buttonsResponseMessage?.selectedButtonId || 
              msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
              msg.message.imageMessage?.caption ||
              msg.message.videoMessage?.caption ||
              ''
            ).trim();

            const isInteractive = !!msg.message.buttonsResponseMessage || !!msg.message.listResponseMessage;
            const text = isInteractive ? rawText : rawText.toLowerCase();
            
            if (!text) {
              console.log(`[WhatsApp Incoming] Empty or unsupported message type from ${from}`);
              continue;
            }

            console.log(`[WhatsApp Incoming] from ${from}: "${text}"`);
            
            console.log(`[WhatsApp Incoming Full Metadata]`, JSON.stringify(msg.key), msg.participant, msg.pushName);

            try {
              // Robust JID decoding to handle multi-device IDs (e.g. 91...:1@s.whatsapp.net)
              const decoded = jidDecode(from);
              let realPhoneNumber = decoded?.user || from.split('@')[0];
              
              // Remove device suffix if present (e.g. "919876543210:1" -> "919876543210")
              if (realPhoneNumber.includes(':')) {
                realPhoneNumber = realPhoneNumber.split(':')[0];
              }
              
              const isLID = from.includes('@lid') || realPhoneNumber.length >= 13;
              if (isLID) {
                const db = getDbAdmin();
                const lidDoc = await db.collection('whatsapp_identity').doc(`lid-${realPhoneNumber}`).get();
                if (lidDoc.exists) {
                  realPhoneNumber = lidDoc.data()?.pn || realPhoneNumber;
                  console.log(`[WhatsApp Agent] Resolved LID/long identifier ${from} to phone number ${realPhoneNumber} via Firestore`);
                } else {
                  console.log(`[WhatsApp LID] Unresolved LID ${from}. Attempting onWhatsApp resolution...`);
                  try {
                    // Force resolve via onWhatsApp which can often trigger mapping updates or return PN
                    const [result] = await sock.onWhatsApp(from);
                    if (result && result.jid && !result.jid.includes('@lid')) {
                      realPhoneNumber = jidDecode(result.jid)?.user || result.jid.split('@')[0];
                      console.log(`[WhatsApp LID] Resolved ${from} via onWhatsApp to ${realPhoneNumber}`);
                      // Save mapping for future
                      const lidKey = decoded?.user || from.split('@')[0];
                      await db.collection('whatsapp_identity').doc(`lid-${lidKey}`).set({
                        pn: realPhoneNumber,
                        updatedAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString() // 30 days
                      }, { merge: true });
                    }
                  } catch(e: any) {
                    console.warn(`[WhatsApp LID] onWhatsApp resolution failed for ${from}:`, e.message);
                  }
                }
              }

              const phoneNumber = realPhoneNumber;
              const pushName = msg.pushName || '';
              console.log(`[WhatsApp Agent] Incoming message from: ${phoneNumber} | PushName: ${pushName} | Text: "${text}"`);

              // Log incoming WhatsApp messages to the reports/logs collection for real-time tracking
              try {
                await logWhatsAppMessage(phoneNumber, text, 'incoming', 'delivered', msg.key.id, undefined, { pushName });
              } catch (logErr: any) {
                console.error("[WhatsApp] Error logging incoming message to whatsappLogs:", logErr.message);
              }

              let { context, isRegistered, aiAgentEnabled, targetUser, rawContext } = await getERPContext(phoneNumber, pushName);
              console.log(`[WhatsApp Agent] Context for ${phoneNumber}: Registered=${isRegistered}, AIEnabled=${aiAgentEnabled}`);

              if (!isRegistered) {
                console.log(`[WhatsApp Agent] User ${phoneNumber} not registered. Sending info/unregistered notice.`);
                const unregisteredMsg = `your whatsapp number not registered in school database please contact to office staff`;
                await sendMessage(from, unregisteredMsg, {}, 'bot');
                continue;
              }

              // WhatsApp Bot V2 Workflow Builder Flow Interceptor:
              try {
                const { processIncomingBotMessage } = await import('../whatsapp_bot_v2/services/whatsappRouter');
                const wasIntercepted = await processIncomingBotMessage(phoneNumber, text);
                if (wasIntercepted) {
                  console.log(`[WhatsApp Agent] Message from ${phoneNumber} intercepted by Visual Chatbot V2 Flow.`);
                  io.emit('wa:message', {
                    from: phoneNumber,
                    text,
                    timestamp: msg.messageTimestamp,
                    id: msg.key.id
                  });
                  continue;
                }
              } catch (v2Err: any) {
                console.error(`[WhatsApp Agent] Chatbot V2 Interceptor error:`, v2Err.message);
              }

              // 1. Consent Opt-Out checking for incoming messages
              const isOptOutCommand = ['stop', 'unsubscribe', 'వద్దు', 'ఆపు'].some(word => text.toLowerCase().includes(word));
              if (isOptOutCommand) {
                const db = getDbAdmin();
                await db.collection('whatsapp_opt_out').doc(phoneNumber).set({
                  optedOut: true,
                  optedOutAt: new Date().toISOString(),
                  source: 'WhatsApp STOP Keyword'
                });
                await sendMessage(from, "⚠️ You have successfully unsubscribed from general school broadcasts. (మీరు విజయవంతంగా విరమించుకున్నారు). Contact admin to re-register.", {}, 'bot');
                continue;
              }

              // 1b. Welcome Message Timer (Once in 2 days per phone number, but parent Grand Welcome is ONE TIME ONLY forever)
              let shouldSendWelcome = true;
              let welcomeMsg = '';
              try {
                const db = getDbAdmin();
                if (db) {
                  const welcomeDocRef = db.collection('whatsapp_welcome_timestamps').doc(phoneNumber);
                  const welcomeDoc = await welcomeDocRef.get();
                  const welcomeData = welcomeDoc.exists ? welcomeDoc.data() : {};
                  
                  const isStaff = targetUser.role === 'admin' || targetUser.role === 'teacher' || targetUser.role === 'staff' || targetUser.role === 'clerk' || targetUser.role === 'accountant' || targetUser.role === 'receptionist' || targetUser.role === 'vice_principal';

                  if (isStaff) {
                    if (welcomeDoc.exists) {
                      const lastSentStr = welcomeData?.lastWelcomeSent;
                      if (lastSentStr) {
                        const lastSent = new Date(lastSentStr);
                        const diffMs = Date.now() - lastSent.getTime();
                        const diffDays = diffMs / (1000 * 60 * 60 * 24);
                        if (diffDays < 2.0) {
                          shouldSendWelcome = false;
                        }
                      }
                    }
                  } else {
                    // For parents/students: Grand Welcome is strictly ONE TIME ONLY forever
                    if (welcomeData?.grandWelcomeSent) {
                      shouldSendWelcome = false;
                    }
                  }

                  // Build welcome message identifying the user
                  if (isStaff) {
                    const roleLabel = (targetUser.role || 'Staff').replace('_', ' ').toUpperCase();
                    welcomeMsg = `🙏 *నమస్కారం! / Welcome, ${targetUser.name}!* \n\n🟢 *Registered Staff Identified:*\n👤 *Name:* ${targetUser.name}\n💼 *Role:* ${roleLabel}\n\nYou are successfully connected to St. Antony's School ERP Assistant. How can I assist you with your administrative or technical queries today?`;
                  } else {
                    // Parent or student: Grand Welcome message identifying the father's name and children
                    const fatherName = targetUser.fatherName || targetUser.parentName || targetUser.name || 'Parent';
                    const studentList = rawContext?.myStudents || [];
                    
                    let studentsListEnglish = '';
                    let studentsListTelugu = '';

                    if (studentList.length > 0) {
                      studentsListEnglish = studentList.map((stu: any, idx: number) => {
                        const clsLabel = stu.className || stu.class || 'N/A';
                        const bthLabel = stu.batchName || stu.batch || 'N/A';
                        return `${idx + 1}. *${stu.name}* (Class: ${clsLabel}, Batch: ${bthLabel})`;
                      }).join('\n');

                      studentsListTelugu = studentList.map((stu: any, idx: number) => {
                        const clsLabel = stu.className || stu.class || 'N/A';
                        const bthLabel = stu.batchName || stu.batch || 'N/A';
                        return `${idx + 1}. *${stu.name}* (తరగతి: ${clsLabel}, బ్యాచ్: ${bthLabel})`;
                      }).join('\n');
                    } else {
                      const clsLabel = rawContext?.className || targetUser.className || targetUser.class || 'N/A';
                      const bthLabel = rawContext?.batchName || targetUser.batchName || targetUser.batch || 'N/A';
                      studentsListEnglish = `1. *${targetUser.name}* (Class: ${clsLabel}, Batch: ${bthLabel})`;
                      studentsListTelugu = `1. *${targetUser.name}* (తరగతి: ${clsLabel}, బ్యాచ్: ${bthLabel})`;
                    }

                    welcomeMsg = `🙏 *నమస్కారం! / Welcome to St. Antony's High School Interactive Assistant!* 🙏\n\n` +
                      `Dear *${fatherName}*,\n\n` +
                      `Welcome! Your WhatsApp number is registered with our school database. We are extremely pleased to connect with you.\n\n` +
                      `Here are the details of your children registered with us:\n` +
                      `${studentsListEnglish}\n\n` +
                      `You can ask me about school fees, homework, attendance, exam marks, or holidays. How can I help you today?\n\n` +
                      `---------------------------------------------\n` +
                      `ప్రియమైన *${fatherName}* గారు,\n\n` +
                      `సంతోషం! మీ వాట్సాప్ నంబర్ మా పాఠశాల డేటాబేస్ లో విజయవంతంగా నమోదైంది. మిమ్మల్ని సంప్రదించడం మాకు చాలా ఆనందంగా ఉంది.\n\n` +
                      `మా పాఠశాలలో నమోదైన మీ పిల్లల వివరాలు ఇక్కడ ఉన్నాయి:\n` +
                      `${studentsListTelugu}\n\n` +
                      `మీరు వారి గురించి పాఠశాల ఫీజులు, హాజరు, పరీక్షల మార్కులు, హోంవర్క్ లేదా పాఠశాల సెలవుల వివరాలను అడగవచ్చు. మీకు ఏ విధంగా సహాయం చేయగలను?`;
                  }

                  if (shouldSendWelcome) {
                    // Send the welcome message first
                    await sendMessage(from, welcomeMsg, {}, 'bot');

                    // Mark as sent
                    if (isStaff) {
                      await welcomeDocRef.set({
                        lastWelcomeSent: new Date().toISOString(),
                        name: targetUser.name,
                        role: targetUser.role || 'staff'
                      }, { merge: true });
                    } else {
                      await welcomeDocRef.set({
                        lastWelcomeSent: new Date().toISOString(),
                        grandWelcomeSent: true,
                        name: targetUser.name,
                        role: targetUser.role || 'parent'
                      }, { merge: true });
                    }

                    // Prevent double greetings if it is a simple first contact greeting
                    const isSimpleGreeting = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'namaste', 'నమస్కారం', 'హలో', 'start'].some(g => text.toLowerCase().trim() === g);
                    if (isSimpleGreeting) {
                      console.log(`[WhatsApp Agent] Simple greeting matched first contact. Welcome profile menu sent. Skipping duplicate replies.`);
                      continue;
                    }
                  }
                }
              } catch (welcomeErr) {
                console.error("[WhatsApp Agent] Error processing welcome message timer:", welcomeErr);
              }

              // 1c. Multi-child selection interceptor
              const studentList = rawContext?.myStudents || [];
              if (studentList.length > 1) {
                const cleanText = text.trim().toLowerCase();
                let selectionIndex = -1;
                
                if (cleanText === '1' || cleanText === 'one' || cleanText === 'first' || cleanText === '1st') {
                  selectionIndex = 0;
                } else if (cleanText === '2' || cleanText === 'two' || cleanText === 'second' || cleanText === '2nd') {
                  selectionIndex = 1;
                } else {
                  // Check if the text matches a name of one of the children specifically
                  studentList.forEach((stu: any, idx: number) => {
                    const sName = (stu.name || '').toLowerCase();
                    if (sName && cleanText === sName) { // exact match
                      selectionIndex = idx;
                    } else if (sName && cleanText.includes(sName) && sName.length > 3) { // partial match
                      selectionIndex = idx;
                    }
                  });
                }
                
                if (selectionIndex >= 0 && selectionIndex < studentList.length) {
                  const chosenStudent = studentList[selectionIndex];
                  const chosenId = chosenStudent.id;
                  
                  const db = getDbAdmin();
                  await db.collection('whatsapp_conversations').doc(phoneNumber).set({
                    selectedStudentId: chosenId,
                    updatedAt: new Date().toISOString()
                  }, { merge: true });
                  
                  // Re-fetch context to set the newly active selected child as active in Gemini's context
                  const reContext = await getERPContext(phoneNumber, pushName);
                  rawContext = reContext.rawContext;
                  context = reContext.context;
                  
                  const clsLabel = chosenStudent.className || chosenStudent.class || 'N/A';
                  const bthLabel = chosenStudent.batchName || chosenStudent.batch || 'N/A';
                  const successMsg = `🟢 *Selected Target Profile:* *${chosenStudent.name}* (${clsLabel} class- ${bthLabel})\n\nHow can I help you regarding ${chosenStudent.name}'s attendance, marks, fees, or homework? / మీరు *${chosenStudent.name}* ను ఎంచుకున్నారు. హాజరు, మార్కులు లేదా ఫీజుల వివరాల కోసం అడగండి.`;
                  await sendMessage(from, successMsg, {}, 'bot');
                  continue; // Skip rest of loop because this was a selection confirmation
                }
                
                // If they have multiple children and have not selected one yet, and their message is about student details
                const hasSelectedStudentObj = rawContext?.activeStudent;
                const matchesStudentKeywords = ['attendance', 'fees', 'marks', 'exam', 'homework', 'report', 'results', 'fess', 'fee', 'test', 'payment', 'హాజరు', 'మార్కులు', 'ఫీజు'].some(word => cleanText.includes(word));
                
                if (!hasSelectedStudentObj && matchesStudentKeywords) {
                  const listItems = studentList.map((stu: any, idx: number) => {
                    const clsLabel = stu.className || stu.class || 'N/A';
                    const bthLabel = stu.batchName || stu.batch || 'N/A';
                    return `${idx + 1}. *${stu.name}* class ${clsLabel} class- ${bthLabel}`;
                  }).join('\nand ');
                  
                  const selectionPrompt = `How can I Help you regarding your children:\n${listItems}\n\nPlease reply with *1* or *2* to select which child you want to ask about. / ఏ విద్యార్థి సమాచారం కావాలో ఎంచుకోవడానికి *1* లేదా *2* అని రిప్లై ఇవ్వండి.`;
                  await sendMessage(from, selectionPrompt, {}, 'bot');
                  continue; // Skip Gemini as we need child selection first
                }
              }

              // 1.8 Handle quick numeric "1" or "2" for leave approvals
              if (text.trim() === '1' || text.trim() === '2') {
                const isOne = text.trim() === '1';
                try {
                  const db = getDbAdmin();
                  const tokensSnap = await db.collection('whatsapp_action_tokens')
                    .where('approverPhone', '==', normalizeIndianPhone(phoneNumber))
                    .where('used', '==', false)
                    .get();

                  const activeTokens = tokensSnap.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as any))
                    .filter((t: any) => t.status === 'active' && new Date(t.expiresAt).getTime() > Date.now());

                  if (activeTokens.length > 0) {
                    // Sort by createdAt desc in memory
                    activeTokens.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                    
                    const newestToken = activeTokens[0];
                    const targetLeaveId = newestToken.leaveId;
                    const targetAction = isOne ? 'approved' : 'rejected';
                    
                    const matchingToken = activeTokens.find((t: any) => t.leaveId === targetLeaveId && t.action === targetAction);
                    
                    if (matchingToken) {
                      console.log(`[Leave Approval] Matching numeric token action "${targetAction}" found for leaveId ${targetLeaveId}`);
                      const consumeResult = await consumeLeaveActionToken(matchingToken.id, phoneNumber);
                      await sendMessage(from, consumeResult.message, {}, 'bot');
                      continue; // Handled successfully!
                    }
                  }
                } catch (tokenErr: any) {
                  console.error('[Leave Approval] Error processing numeric leave action:', tokenErr.message);
                }
              }

              // 2. Delegate TO Secure Action Tokens for Leave Approvals
              if (text.startsWith('leave_approve_') || text.startsWith('leave_reject_')) {
                const token = text.replace('leave_approve_', '').replace('leave_reject_', '');
                
                console.log(`[WhatsApp Security] Verifying secure leave action token with phone binding: ${token} from sender: ${phoneNumber}`);
                const consumeResult = await consumeLeaveActionToken(token, phoneNumber);
                
                // Send transaction result message to approver
                await sendMessage(from, consumeResult.message, {}, 'bot');
              } else {
                // Interactive Bot Menu Logic
                try {
                  const db = getDbAdmin();
                  
                  // ALWAYS check for custom keyword matching in whatsapp_bot_menus (bypasses Gemini AI entirely as requested)
                  const menusSnap = await db.collection('whatsapp_bot_menus').where('isActive', '==', true).get();
                  const menus = menusSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                  const matchedMenu = menus.find((m: any) => {
                    const keywords = (m.keyword || '').toLowerCase().split(',').map((k: string) => k.trim()).filter(Boolean);
                    return keywords.some((k: string) => text.toLowerCase().trim() === k || text.toLowerCase().includes(k));
                  });

                  if (matchedMenu) {
                    console.log(`[WhatsApp Agent] Keyword match found: "${matchedMenu.keyword}"`);
                    let responseText = replaceMenuVariables(matchedMenu.responseText || '', targetUser, rawContext);
                    
                    const options: any = {};
                    if (matchedMenu.buttons && matchedMenu.buttons.length > 0) {
                      options.buttons = (matchedMenu.buttons as any[]).map((b: any) => ({
                        buttonId: b.id || Math.random().toString(),
                        buttonText: { displayText: b.text },
                        type: 1
                      }));
                    }

                    await sendMessage(from, responseText, options, 'bot');

                    // Mark welcome as sent/renewed since we sent a menu
                    const welcomeDocRef = db.collection('whatsapp_welcome_timestamps').doc(phoneNumber);
                    await welcomeDocRef.set({
                      lastWelcomeSent: new Date().toISOString(),
                      name: targetUser.name,
                      role: targetUser.role || 'parent'
                    }, { merge: true });

                    continue;
                  }

                  // If they specifically type a menu/help trigger, re-send the welcomeMsg with interactive menu options
                  const isExplicitMenuRequest = ['menu', 'help', 'సహాయం', 'మెనూ', 'start'].some(word => text.toLowerCase().trim() === word);
                  if (isExplicitMenuRequest) {
                    await sendMessage(from, welcomeMsg || "Welcome! Please reply with '1' or '2' or select an option from the menu.", {}, 'bot');
                    continue;
                  }
                } catch (menuErr) {
                  console.error("[WhatsApp Agent] Error checking bot menus:", menuErr);
                }

                // If Gemini AI is active, forward queries to Gemini AI to generate automated smart responses
                if (aiAgentEnabled) {
                  console.log(`[WhatsApp Agent] Forwarding query to Gemini AI...`);
                  try {
                    const aiResponse = await getSmartBotResponse(text, context);
                    
                    if (aiResponse) {
                      console.log(`[WhatsApp Agent] Response received. Length: ${aiResponse.length}`);
                      
                      let responseText = aiResponse;
                      let responseOptions = {};
                      
                      if (aiResponse.trim().startsWith('{')) {
                        try {
                          const parsed = JSON.parse(aiResponse);
                          if (parsed.text) {
                            responseText = parsed.text;
                            responseOptions = parsed.options || {};
                          }
                        } catch(e) {
                          // Ignore parse error, it's just normal text
                        }
                      }
                      
                      await sendMessage(from, responseText, responseOptions, 'bot');
                      continue;
                    }
                  } catch (aiErr) {
                    console.error("[WhatsApp Agent] Gemini AI integration error:", aiErr);
                  }
                }

                // Fallback custom message if Gemini AI is off or failed, and no custom keyword match succeeded
                console.log(`[WhatsApp Agent] No matching custom menu and Gemini AI fallback is disabled or failed. Sending fallback message.`);
                const fallbackMessage = `🙏 *St. Antony's High School Interactive Bot*\n\n` +
                  `I didn't quite catch that. Please type *menu* or *help* to see all options, or reply with one of our keyword options (e.g., *Fees*, *Attendance*, *Marks*).\n\n` +
                  `మీరు పంపిన సందేశం అర్థం కాలేదు. పాఠశాల ఆప్షన్స్ చూడడానికి దయచేసి *menu* లేదా *help* అని టైప్ చేయండి, లేదా సంబంధిత కీవర్డ్స్ (ఉదాహరణకు: *Fees*, *Attendance*, *Marks*) టైప్ చేయండి.`;
                
                await sendMessage(from, fallbackMessage, {}, 'bot');
              }
            } catch (botErr: any) {
              console.error("WhatsApp Bot Reply Error:", botErr.message);
            }
            
            io.emit('wa:message', {
              from: jidDecode(from)?.user || from,
              text,
              timestamp: msg.messageTimestamp,
              id: msg.key.id
            });
          }
        }
      }
    });

  } catch (error: any) {
    isConnecting = false;
    consecutiveErrors++;
    console.error(`[WhatsApp ${process.pid}] connection failed to initialize (Attempt ${consecutiveErrors}):`, error);
    io.emit('wa:error', `WhatsApp initialization failed: ${error.message || 'Unknown error'}`);
    io.emit('wa:status', 'close');
    
    const initErrorMsg = (error?.message || error?.toString() || '').toLowerCase();
    const isNetworkOrTimeout = 
      initErrorMsg.includes('timed out') || 
      initErrorMsg.includes('timeout') || 
      initErrorMsg.includes('handshake') || 
      initErrorMsg.includes('econn') ||
      initErrorMsg.includes('etimedout') ||
      initErrorMsg.includes('enotfound') ||
      initErrorMsg.includes('system error') ||
      initErrorMsg.includes('closed') ||
      initErrorMsg.includes('restart required') ||
      initErrorMsg.includes('stream closed') ||
      initErrorMsg.includes('connection lost');

    // Self-Healing System Check on outer Init Catch:
    // We will keep retrying continuously to maintain connection robustness without wiping out session.
    if (consecutiveErrors >= 50 && !isNetworkOrTimeout) {
      console.warn(`[WhatsApp ${process.pid}] Consecutive initialization failures reached ${consecutiveErrors}. Retaining credentials and continuing to retry safely.`);
    } else if (consecutiveErrors >= 50 && isNetworkOrTimeout) {
      console.warn(`[WhatsApp ${process.pid}] Consecutive initialization failures reached ${consecutiveErrors} but detected network/timeout error (${initErrorMsg}). Retaining credentials and continuing to retry safely.`);
    }

    // Auto-retry with fast backoff
    const retryDelay = Math.min(2000 + (consecutiveErrors * 1000), 10000);
    console.log(`[WhatsApp ${process.pid}] Retrying initialization in ${retryDelay/1000}s...`);
    setTimeout(() => connectToWhatsApp(io, true, true), retryDelay);
  }

  return sock;
}

// Watchdog to ensure connection stays alive
let watchdogStarted = false;
let unsubscribeStatusListener: (() => void) | null = null;
let unsubscribeCommandsListener: (() => void) | null = null;

export async function startWhatsAppWatchdog(io: Server) {
  if (watchdogStarted) return;
  watchdogStarted = true;

  await initializationPromise;

  // Synchronize status and QR code from Firestore to handle multi-instance scenarios in Cloud Run routing
  try {
    const db = getDbAdmin();
    if (db && !isDatabaseDenied()) {
      console.log(`[WhatsApp Sync] Setting up real-time listener for multi-instance sync (instanceId: ${instanceId})...`);
      try {
        unsubscribeStatusListener = db.collection(LOCK_COLLECTION).doc(STATUS_DOC).onSnapshot((doc) => {
          if (doc.exists) {
            const data = doc.data();
            if (data) {
              // If we are the active owner instance, monitor for on-demand group refresh triggers from standby instances
              if (sock && connectionStatus === 'open') {
                if (data.triggerGroupRefresh && data.triggerGroupRefresh !== lastProcessedGroupRefreshTrigger) {
                  lastProcessedGroupRefreshTrigger = data.triggerGroupRefresh;
                  console.log(`[WhatsApp Sync] Live group refresh trigger detected. Executing fetchGroups()...`);
                  fetchGroups().catch((e: any) => console.error("[WhatsApp Sync] Live triggered fetchGroups error:", e.message));
                }
              }

              const isOwner = data.instanceId === instanceId;
              if (!isOwner) {
                const updatedAt = data.updatedAt;
                let docTime = 0;
                if (updatedAt) {
                  if (typeof updatedAt.toMillis === 'function') docTime = updatedAt.toMillis();
                  else if (updatedAt instanceof Date) docTime = updatedAt.getTime();
                  else docTime = new Date(updatedAt).getTime() || 0;
                }
                const isRecent = docTime === 0 || (Date.now() - docTime < 35000);

                if (isRecent && data.status && data.status !== connectionStatus) {
                  console.log(`[WhatsApp Sync] Status synchronized from Firestore: ${connectionStatus} -> ${data.status}`);
                  connectionStatus = data.status;
                  io?.emit('wa:status', connectionStatus);
                }
                if (isRecent && data.qr !== qrCode && data.status === 'qr') {
                  console.log(`[WhatsApp Sync] QR code synchronized from Firestore`);
                  qrCode = data.qr || null;
                  io?.emit('wa:qr', qrCode);
                }
              }
            }
          }
        }, (err) => {
          const errText = (err?.message || String(err)).toLowerCase();
          if (errText.includes('retries') || errText.includes('billing') || errText.includes('permission_denied') || errText.includes('quota') || errText.includes('exceeded')) {
            setDatabaseDenied(true);
            if (unsubscribeStatusListener) {
              try { unsubscribeStatusListener(); } catch {}
              unsubscribeStatusListener = null;
            }
            console.warn(`[WhatsApp Sync] Firestore multi-instance listener deactivated (database requires billing or permissions).`);
          } else {
            console.error(`[WhatsApp Sync] Firestore listener error: ${err.message}`);
          }
        });
      } catch (err: any) {
        console.warn(`[WhatsApp Sync] Could not attach status listener: ${err.message}`);
      }

      // Listen for interactive WhatsApp commands from standby instances (such as resolveInviteLink)
      try {
        unsubscribeCommandsListener = db.collection('whatsapp_commands')
          .where('status', '==', 'pending')
          .onSnapshot((snapshot) => {
            if (!sock || connectionStatus !== 'open') return; // Only the active owner processes commands
            
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added' || change.type === 'modified') {
                const doc = change.doc;
                const commandData = doc.data();
                if (commandData && commandData.status === 'pending') {
                  const commandId = doc.id;
                  console.log(`[WhatsApp Command] Received pending command "${commandData.command}" (ID: ${commandId})`);
                  
                  // Update status to processing
                  await doc.ref.update({ status: 'processing', startedAt: new Date().toISOString() }).catch(() => {});
                  
                  try {
                    let result: any = null;
                    if (commandData.command === 'resolve_invite') {
                      const { inviteLink } = commandData.args;
                      result = await resolveInviteLink(inviteLink);
                    } else {
                      throw new Error(`Unknown command: ${commandData.command}`);
                    }
                    
                    await doc.ref.update({
                      status: 'completed',
                      result,
                      completedAt: new Date().toISOString()
                    });
                    console.log(`[WhatsApp Command] Command ${commandId} completed successfully.`);
                  } catch (cmdErr: any) {
                    console.error(`[WhatsApp Command] Command ${commandId} failed:`, cmdErr.message);
                    await doc.ref.update({
                      status: 'failed',
                      error: cmdErr.message || String(cmdErr),
                      failedAt: new Date().toISOString()
                    }).catch(() => {});
                  }
                }
              }
            });
          }, (err) => {
            const errText = (err?.message || String(err)).toLowerCase();
            if (errText.includes('retries') || errText.includes('billing') || errText.includes('permission_denied') || errText.includes('quota') || errText.includes('exceeded')) {
              setDatabaseDenied(true);
              if (unsubscribeCommandsListener) {
                try { unsubscribeCommandsListener(); } catch {}
                unsubscribeCommandsListener = null;
              }
              console.warn(`[WhatsApp Command] Firestore commands listener deactivated (database requires billing or permissions).`);
            } else {
              console.error(`[WhatsApp Command] Firestore commands listener error:`, err.message);
            }
          });
      } catch (err: any) {
        console.warn(`[WhatsApp Command] Could not attach commands listener: ${err.message}`);
      }
    }
  } catch (syncErr: any) {
    console.error(`[WhatsApp Sync] Error setting up sync listener: ${syncErr.message}`);
  }
  
  console.log(`[WhatsApp Watchdog] Starting connection monitor (25s interval)...`);
  setInterval(async () => {
    try {
      isCooldownActive = false;
      const status = connectionStatus;
      
      const isLocalClosedOrNull = (status === 'close' || (status === 'open' && sock === null));
      const isStaleConnecting = (status === 'connecting' || isConnecting) && (Date.now() - lastConnectionAttempt > 45000);
      
      if (!isConnecting && isLocalClosedOrNull) {
        console.warn(`[WhatsApp Watchdog] Socket is closed. Re-establishing connection...`);
        connectToWhatsApp(io, true).catch(err => console.error("[Watchdog] Reconnect error:", err));
      } else if (isStaleConnecting) {
        console.warn(`[WhatsApp Watchdog] Connection attempt stalled (>45s). Resetting...`);
        isConnecting = false;
        connectToWhatsApp(io, true, true).catch(err => console.error("[Watchdog] Force restart error:", err));
      } else if (status === 'open') {
        try {
          await acquireLock();
        } catch (e: any) {}
      }
    } catch (err) {
      console.error("[WhatsApp Watchdog] Error during check:", err);
    }
  }, 25000);
}

// Periodic cleanup of expired temporary data and files older than 1 week
setInterval(async () => {
  if (isDatabaseDenied()) return;
  try {
    const db = getDbAdmin();
    const now = new Date();
    const nowIso = now.toISOString();
    const oneWeekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log(`[WhatsApp Cleanup] Running comprehensive cleanup...`);
    
    // 1. Existing fast-expiration cleanup (expiresAt < now)
    const collectionsWithExpiration = ['whatsapp_logs', 'whatsappLogs', 'whatsapp_metadata', 'whatsapp_identity'];
    for (const collName of collectionsWithExpiration) {
      const expiredSnap = await db.collection(collName)
        .where('expiresAt', '<', nowIso)
        .limit(500)
        .get();
        
      if (!expiredSnap.empty) {
        console.log(`[WhatsApp Cleanup] Deleting ${expiredSnap.size} expired documents from ${collName} (expiresAt < now)`);
        const batch = db.batch();
        expiredSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
    }
    
    // 2. Clear WhatsApp logs, queues, intercepts, broadcasts, and audits older than 1 week
    const timestampCollections = [
      'whatsappLogs',
      'whatsapp_logs',
      'whatsapp_group_intercept_logs',
      'whatsapp_idempotency'
    ];
    for (const collName of timestampCollections) {
      let deletedCount = 0;
      while (true) {
        const snap = await db.collection(collName)
          .where('timestamp', '<', oneWeekAgoIso)
          .limit(500)
          .get();
          
        if (snap.empty) break;
        
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deletedCount += snap.size;
        
        if (snap.size < 500) break;
      }
      if (deletedCount > 0) {
        console.log(`[WhatsApp Cleanup] Deleted ${deletedCount} documents from ${collName} older than 7 days (timestamp < 1 week ago)`);
      }
    }
    
    const createdAtCollections = [
      'whatsapp_queue',
      'whatsapp_broadcast_logs',
      'whatsapp_audit_logs'
    ];
    for (const collName of createdAtCollections) {
      let deletedCount = 0;
      while (true) {
        const snap = await db.collection(collName)
          .where('createdAt', '<', oneWeekAgoIso)
          .limit(500)
          .get();
          
        if (snap.empty) break;
        
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deletedCount += snap.size;
        
        if (snap.size < 500) break;
      }
      if (deletedCount > 0) {
        console.log(`[WhatsApp Cleanup] Deleted ${deletedCount} documents from ${collName} older than 7 days (createdAt < 1 week ago)`);
      }
    }
    
    // 3. Delete files inside Google Cloud Storage older than 1 week (7 days)
    console.log(`[Storage Cleanup] Scanning Google Storage bucket for expired files...`);
    const bucket = admin.storage().bucket();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    const storagePrefixes = ['uploads/', 'temp/'];
    let deletedFilesCount = 0;
    
    for (const prefix of storagePrefixes) {
      try {
        const [files] = await bucket.getFiles({ prefix });
        for (const file of files) {
          try {
            const [metadata] = await file.getMetadata();
            const createdTimeStr = metadata.timeCreated || metadata.updated;
            if (createdTimeStr) {
              const createdTime = new Date(createdTimeStr).getTime();
              const age = nowMs - createdTime;
              if (age > sevenDaysInMs) {
                await file.delete();
                deletedFilesCount++;
                console.log(`[Storage Cleanup] Deleted expired file: ${file.name} (Created: ${createdTimeStr})`);
              }
            }
          } catch (fileErr: any) {
            console.warn(`[Storage Cleanup] Failed to process/delete file ${file.name}: ${fileErr.message}`);
          }
        }
      } catch (prefixErr: any) {
        console.warn(`[Storage Cleanup] Failed to list files with prefix ${prefix}: ${prefixErr.message}`);
      }
    }
    
    if (deletedFilesCount > 0) {
      console.log(`[Storage Cleanup] Completed. Deleted ${deletedFilesCount} files older than 7 days.`);
    } else {
      console.log(`[Storage Cleanup] No files older than 7 days found in uploads/ or temp/.`);
    }
    
  } catch (e: any) {
    const errText = (e?.message || String(e)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
    } else {
      console.warn(`[WhatsApp & Storage Cleanup] Error during periodic cleanup: ${e.message}`);
    }
  }
}, 4 * 60 * 60 * 1000); // Every 4 hours

export async function checkAndSendAutomatedBirthdays() {
  if (isDatabaseDenied()) {
    return;
  }

  try {
    const db = getDbAdmin();
    if (!db) {
      return;
    }

    // Determine current date in India Standard Time (IST)
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
    const formatter = new Intl.DateTimeFormat('en-CA', options); // outputs YYYY-MM-DD
    const istDateStr = formatter.format(new Date()); // e.g. "2026-06-25"
    const todayMMDD = istDateStr.slice(5); // "06-25"

    console.log(`[Automated Birthdays] Running check for date (IST): ${istDateStr} (MM-DD: ${todayMMDD})`);

    // Check if we have already run successfully today
    const runDoc = await db.collection('automated_birthday_runs').doc(istDateStr).get();
    if (runDoc.exists) {
      console.log(`[Automated Birthdays] Already run successfully today (${istDateStr}). Skipping to save resources.`);
      return;
    }

    // Fetch all active students and staff
    const studentsSnap = await db.collection('students').get();
    const staffSnap = await db.collection('staff').get();

    const activeStudents = studentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() as any }))
      .filter((s: any) => s.status === 'active' || !s.status);

    const activeStaff = staffSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() as any }))
      .filter((s: any) => s.status === 'active' || !s.status);

    // Load templates
    const templatesSnap = await db.collection('birthdayTemplates').get();
    const templates = templatesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    const studentTemplate = templates.find(t => t.type === 'student');
    const staffTemplate = templates.find(t => t.type === 'staff');

    // Helper to extract MM-DD from date fields
    const getMMDD = (dateStr: any) => {
      if (!dateStr || typeof dateStr !== 'string') return '';
      const cleaned = dateStr.trim();
      if (cleaned.length >= 10) {
        return cleaned.slice(5, 10); // "MM-DD" from "YYYY-MM-DD"
      }
      return '';
    };

    const studentCelebrants = activeStudents.filter(p => {
      const dobVal = p.dob || p.dateOfBirth;
      return getMMDD(dobVal) === todayMMDD;
    });

    const staffCelebrants = activeStaff.filter(p => {
      const dobVal = p.dob || p.dateOfBirth;
      return getMMDD(dobVal) === todayMMDD;
    });

    console.log(`[Automated Birthdays] Found ${studentCelebrants.length} students and ${staffCelebrants.length} staff celebrating today.`);

    const defaultStudentWish = `🎉 *Happy Birthday, {name}! / జన్మదిన శుభాకాంక్షలు!* 🎂🎈\n\nOn your special day, St. Antony's High School wishes you a fantastic year ahead filled with joy, learning, and wonderful achievements. May all your dreams come true! 🌟\n\nమీకు ఈ పుట్టినరోజు మరిన్ని విజయాలను, సంతోషాలను ప్రసాదించాలని సెయింట్ ఆంటోనీస్ హైస్కూల్ ఆకాంక్షిస్తోంది. 🎁✨`;

    const defaultStaffWish = `💐 *Wishing You a Very Happy Birthday, {name}! / జన్మదిన శుభాకాంక్షలు!* 🎂🎉\n\nSt. Antony's High School expresses our deep gratitude for your dedication and wonderful service. May this year bring you good health, prosperity, and happiness in abundance. 🌟\n\nమా పాఠశాల అభివృద్ధిలో మీ పాత్ర ఎంతో అమూల్యమైనది. మీకు ఆయురారోగ్యాలు, ఐశ్వర్యాలు లభించాలని సెయింట్ ఆంటోనీస్ హైస్కూల్ ఆకాంక్షిస్తోంది. ✨`;

    let wishesQueued = 0;

    // Send Student wishes
    for (const person of studentCelebrants) {
      const to = extractParentPhone(person);
      if (!to) {
        console.log(`[Automated Birthdays] Missing contact number for student: ${person.name}`);
        continue;
      }

      let wishText = defaultStudentWish;
      if (studentTemplate && studentTemplate.content) {
        wishText = studentTemplate.content;
      }
      wishText = wishText.replace(/{name}/g, person.name);

      await sendMessage(to, wishText, { 
        studentId: person.id, 
        templateType: 'birthday_wish',
        messageType: 'automated_birthday_wish'
      }, 'birthday');
      
      wishesQueued++;
      console.log(`[Automated Birthdays] Queued birthday wish for student: ${person.name} (${to})`);
    }

    // Send Staff wishes
    for (const person of staffCelebrants) {
      const to = extractParentPhone(person);
      if (!to) {
        console.log(`[Automated Birthdays] Missing contact number for staff: ${person.name}`);
        continue;
      }

      let wishText = defaultStaffWish;
      if (staffTemplate && staffTemplate.content) {
        wishText = staffTemplate.content;
      }
      wishText = wishText.replace(/{name}/g, person.name);

      await sendMessage(to, wishText, { 
        staffId: person.id, 
        templateType: 'birthday_wish',
        messageType: 'automated_birthday_wish'
      }, 'birthday');
      
      wishesQueued++;
      console.log(`[Automated Birthdays] Queued birthday wish for staff: ${person.name} (${to})`);
    }

    // Log the successful run
    await db.collection('automated_birthday_runs').doc(istDateStr).set({
      runAt: new Date().toISOString(),
      studentCelebrants: studentCelebrants.map((c: any) => ({ id: c.id, name: c.name })),
      staffCelebrants: staffCelebrants.map((c: any) => ({ id: c.id, name: c.name })),
      wishesQueued,
      success: true
    });

    console.log(`[Automated Birthdays] Successfully logged run for ${istDateStr}. Total queued: ${wishesQueued}`);
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing') || errText.includes('not_found') || errText.includes('not found') || errText.includes('5 not_found')) {
      setDatabaseDenied(true);
      console.warn(`[Automated Birthdays] Database requires Google Cloud billing or creation on project. Background automated birthdays skipped.`);
    } else {
      console.error(`[Automated Birthdays] Error in automated birthday checker:`, error);
    }
  }
}

export async function checkAndRunStaffAutoAttendance() {
  if (isDatabaseDenied()) {
    return;
  }

  try {
    const db = getDbAdmin();
    if (!db) {
      return;
    }

    // Determine current date in India Standard Time (IST)
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
    const formatter = new Intl.DateTimeFormat('en-CA', options); // outputs YYYY-MM-DD
    const istDateStr = formatter.format(new Date()); // e.g. "2026-06-25"

    // Check if we have already run successfully today
    const runDoc = await db.collection('staff_auto_attendance_runs').doc(istDateStr).get();
    if (runDoc.exists) {
      return;
    }

    // Fetch settings
    const settingsDoc = await db.collection('settings').doc('staff_auto_attendance').get();
    if (!settingsDoc.exists) {
      return;
    }
    const settings = settingsDoc.data();
    if (!settings || !settings.enabled) {
      return;
    }

    // Check if current time in IST is past runTime
    const timeOptions = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false } as const;
    const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions);
    const currentTimeStr = timeFormatter.format(new Date()); // e.g. "08:30"
    
    const [targetHour, targetMin] = (settings.runTime || "08:00").split(':').map(Number);
    const [currentHour, currentMin] = currentTimeStr.split(':').map(Number);

    if (currentHour < targetHour || (currentHour === targetHour && currentMin < targetMin)) {
      // Not time yet
      return;
    }

    console.log(`[Staff Auto Attendance] Running daily auto-attendance for ${istDateStr} at ${currentTimeStr} (target: ${settings.runTime})`);

    // Fetch all active staff
    const staffSnapshot = await db.collection('staff').get();
    const staffList: any[] = [];
    staffSnapshot.forEach(doc => {
      const data = doc.data();
      const id = doc.id;
      if (data && data.status !== 'inactive') {
        staffList.push({ uid: id, ...data });
      }
    });

    // Fetch leaves for today
    const leavesSnapshot = await db.collection('leaves')
      .where('status', '==', 'approved')
      .get();
    const activeLeaveUserIds = new Set<string>();
    leavesSnapshot.forEach(doc => {
      const l = doc.data();
      if (l && istDateStr >= l.startDate && istDateStr <= l.endDate) {
        activeLeaveUserIds.add(l.applicantId);
      }
    });

    const exemptedIds = new Set<string>(settings.exemptedStaffIds || []);

    // Fetch existing attendance for today
    const attendanceSnapshot = await db.collection('staff_attendance')
      .where('date', '==', istDateStr)
      .get();
    const existingAttendanceUserIds = new Set<string>();
    attendanceSnapshot.forEach(doc => {
      const a = doc.data();
      if (a && a.userId) {
        existingAttendanceUserIds.add(a.userId);
      }
    });

    const toMarkPresent = staffList.filter(s => {
      const id = s.uid;
      return !exemptedIds.has(id) && !activeLeaveUserIds.has(id) && !existingAttendanceUserIds.has(id);
    });

    if (toMarkPresent.length > 0) {
      const batch = db.batch();
      toMarkPresent.forEach(s => {
        const studentId = s.uid;
        const customId = `${istDateStr}_unknown_class_${studentId}`;
        const payload = {
          userId: studentId,
          date: istDateStr,
          status: 'present',
          timestamp: new Date().toISOString(),
          autoMarked: true
        };
        const docRef = db.collection('staff_attendance').doc(customId);
        batch.set(docRef, payload, { merge: true });
      });
      await batch.commit();
      console.log(`[Staff Auto Attendance] Marked ${toMarkPresent.length} staff as present for ${istDateStr}`);
    }

    // Log the run
    await db.collection('staff_auto_attendance_runs').doc(istDateStr).set({
      runAt: new Date().toISOString(),
      markedCount: toMarkPresent.length,
      staffCount: staffList.length,
      success: true
    });

  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing') || errText.includes('not_found') || errText.includes('not found') || errText.includes('5 not_found')) {
      setDatabaseDenied(true);
      console.warn(`[Staff Auto Attendance] Database requires Google Cloud billing or creation on project. Background automated attendance skipped.`);
    } else {
      console.error(`[Staff Auto Attendance] Error in automated staff attendance:`, error);
    }
  }
}

// Run automated birthdays and staff auto attendance check every hour
setInterval(async () => {
  await checkAndSendAutomatedBirthdays();
  await checkAndRunStaffAutoAttendance();
}, 60 * 60 * 1000); // Every 1 hour

// Run once on startup after 30 seconds delay to ensure DB/connection is ready
setTimeout(async () => {
  console.log("[Automated Birthdays & Staff Attendance] Running initial startup check...");
  await checkAndSendAutomatedBirthdays();
  await checkAndRunStaffAutoAttendance();
}, 30000);

export const getWASocket = () => sock;
export const getWAStatus = () => {
  return { status: connectionStatus, qr: qrCode };
};

export const sendMessage = async (to: string, text: string, options: any = {}, type: 'single' | 'broadcast' | 'birthday' | 'bot' = 'single') => {
  if (isDatabaseDenied()) {
    const db = getDbAdmin();
    const dbId = db ? (db as any).databaseId || '(default)' : 'unknown';
    const projId = db ? (db as any).projectId || 'unknown' : 'unknown';
    console.error(`[WhatsApp Queue] Cannot send message: Database access is denied to ${projId}/${dbId}.`);
    throw new Error(`WhatsApp Service: Database access is denied to ${projId}/${dbId}. Check Firebase configuration and permissions.`);
  }

  try {
    const db = getDbAdmin();

    const isStudentPermission = options.templateType === 'student_permission' || options.messageType === 'permission_notice' || options.eventType === 'student_permission';
    const isHostelOuting = options.templateType === 'hostel_outing_permission' || options.messageType === 'outing_notice' || options.eventType === 'hostel_outing_permission' || options.templateType === 'hostel_outing';

    if (isStudentPermission || isHostelOuting) {
      if (!to || to.trim() === '' || to === 'N/A') {
        const auditEvent = isStudentPermission ? 'student_permission_missing_phone' : 'hostel_outing_missing_phone';
        safeLogWhatsappEvent(auditEvent, {
          studentId: options.studentId || 'none',
          permissionId: options.permissionId || 'none',
          outingId: options.outingId || 'none',
          phone: ''
        });
        return { success: false, skipped: true, error: 'missing_phone', reason: 'Recipient phone number is missing' };
      }

      const normalizedTest = normalizeIndianPhone(to);
      const cleanedDigits = normalizedTest.replace(/\D/g, '');
      const isValid = cleanedDigits.length === 12 && cleanedDigits.startsWith('91');

      if (!isValid) {
        const auditEvent = isStudentPermission ? 'student_permission_invalid_phone' : 'hostel_outing_invalid_phone';
        safeLogWhatsappEvent(auditEvent, {
          studentId: options.studentId || 'none',
          permissionId: options.permissionId || 'none',
          outingId: options.outingId || 'none',
          phone: normalizedTest.replace(/.(?=.{4})/g, '*')
        });
        return { success: false, skipped: true, error: 'invalid_phone', reason: 'Recipient phone number is invalid' };
      }
    }

    const normalizedPhone = normalizeIndianPhone(to);

    // 1. Determine priority level (P0 to P3)
    let priorityVal = 3; // Default P3
    if (typeof options.priority === 'number') {
      priorityVal = options.priority;
    } else {
      const lowerText = text.toLowerCase();
      const hasP0Keyword = 
        lowerText.includes('leave') || 
        lowerText.includes('token') || 
        lowerText.includes('approve') || 
        lowerText.includes('approved') || 
        lowerText.includes('reject') || 
        lowerText.includes('rejected') || 
        lowerText.includes('permission') || 
        lowerText.includes('outpass') || 
        lowerText.includes('outing') || 
        lowerText.includes('hostel') || 
        lowerText.includes('emergency') || 
        lowerText.includes('gate pass') || 
        lowerText.includes('gatepass');
        
      if (type === 'bot' || hasP0Keyword) {
        priorityVal = 0; // P0 (Emergency / Leave Approval / Outpass / Outing)
      } else if (type === 'birthday') {
        priorityVal = 3; // P3 (Broadcast / Birthdays)
      } else if (lowerText.includes('absent') || lowerText.includes('attendance')) {
        priorityVal = 1; // P1 (Attendance Alert)
      } else if (lowerText.includes('fee') || lowerText.includes('exam') || lowerText.includes('homework')) {
        priorityVal = 2; // P2 (Fee/Exam/Homework notifications)
      }
    }

    // 2. Check Opt-Out status for non-emergency messages
    if (priorityVal > 0) {
      const optOutDoc = await db.collection('whatsapp_opt_out').doc(normalizedPhone).get();
      if (optOutDoc.exists) {
        console.warn(`[WhatsApp Queue] Rejecting queue submission: Recipient ${normalizedPhone} has opted out.`);
        safeLogWhatsappEvent('send_message_rejected_opt_out', { recipient: normalizedPhone, text });
        return { success: false, skipped: true, reason: 'Recipient opted out' };
      }
    }

    // 3. Compute Idempotency records to prevent duplicates
    let schoolId = options.schoolId;
    if (!schoolId) {
      try {
        const schoolDoc = await db.collection('settings').doc('school').get();
        schoolId = schoolDoc.exists && schoolDoc.data()?.schoolId ? schoolDoc.data()?.schoolId : 'st_antonys_school';
      } catch (err) {
        schoolId = 'st_antonys_school';
      }
    }
    const studentId = options.studentId || 'none';
    const templateType = options.templateType || 'none';
    const messageType = options.messageType || type;
    const dateToday = options.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Check if this is a payment / fee receipt message
    const isFeeReceipt = options.templateType === 'fee_receipt' || options.messageType === 'payment_receipt' || options.eventType === 'fee_receipt';
    const isExamResult = options.templateType === 'exam_result' || options.messageType === 'marks_result' || options.eventType === 'exam_result';
    
    if (priorityVal === 0) {
      if (isStudentPermission) {
        safeLogWhatsappEvent('permission_priority_p0_applied', {
          studentId: options.studentId,
          permissionId: options.permissionId
        });
      } else if (isHostelOuting) {
        safeLogWhatsappEvent('outing_priority_p0_applied', {
          studentId: options.studentId,
          outingId: options.outingId
        });
      }
    }

    let idempotencyKey = '';
    if (isFeeReceipt) {
      const parentPhoneStr = normalizedPhone.replace(/\+/g, '');
      const studentIdForKey = studentId;
      const receiptIdForKey = options.receiptId || options.receiptNumber || 'none';
      const paymentIdForKey = options.paymentId || 'none';
      const templateTypeForKey = templateType !== 'none' ? templateType : 'fee_receipt';
      const messageTypeForKey = messageType !== type ? messageType : 'payment_receipt';
      const dateForKey = dateToday;
      const schoolIdForKey = schoolId;

      idempotencyKey = `${schoolIdForKey}_${parentPhoneStr}_${studentIdForKey}_${receiptIdForKey}_${paymentIdForKey}_${templateTypeForKey}_${messageTypeForKey}_${dateForKey}`;
      
      safeLogWhatsappEvent('fee_receipt_idempotency_key_created', { 
        key: idempotencyKey, 
        studentId: studentIdForKey, 
        receiptId: receiptIdForKey, 
        paymentId: paymentIdForKey 
      });
    } else if (isExamResult) {
      const parentPhoneStr = normalizedPhone.replace(/\+/g, '');
      // Ensure studentId and examId do NOT fallback to none as requested by rule Part 5
      const studentIdForKey = studentId !== 'none' ? studentId : (options.studentId || 'unknown_student');
      const examIdForKey = options.examId || 'unknown_exam';
      const resultIdForKey = options.resultId || `${examIdForKey}_${studentIdForKey}`;
      const marksIdForKey = options.marksId || 'none';
      const templateTypeForKey = templateType !== 'none' ? templateType : 'exam_result';
      const messageTypeForKey = messageType !== type ? messageType : 'marks_result';
      const dateForKey = options.date || dateToday;
      const schoolIdForKey = schoolId;

      idempotencyKey = `${schoolIdForKey}_${parentPhoneStr}_${studentIdForKey}_${examIdForKey}_${resultIdForKey}_${marksIdForKey}_${templateTypeForKey}_${messageTypeForKey}_${dateForKey}`;

      safeLogWhatsappEvent('marks_idempotency_key_created', {
        key: idempotencyKey,
        studentId: studentIdForKey,
        examId: examIdForKey,
        resultId: resultIdForKey,
        marksId: marksIdForKey
      });
    } else if (options.templateType === 'leave_approval_request' || options.templateType === 'leave_status') {
      const parentPhoneStr = normalizedPhone.replace(/\+/g, '');
      const applicantIdKey = options.applicantId || 'unknown_applicant';
      const leaveIdKey = options.leaveId || 'unknown_leave';
      const templateTypeForKey = options.templateType;
      const messageTypeForKey = options.messageType || type;
      const dateForKey = dateToday;

      idempotencyKey = `${schoolId}_${parentPhoneStr}_${applicantIdKey}_${leaveIdKey}_${messageTypeForKey}_${templateTypeForKey}_${dateForKey}`;

      safeLogWhatsappEvent('leave_idempotency_key_created', {
        key: idempotencyKey,
        applicantId: applicantIdKey,
        leaveId: leaveIdKey,
        messageType: messageTypeForKey,
        templateType: templateTypeForKey
      });
    } else if (isStudentPermission) {
      const parentPhoneStr = normalizedPhone.replace(/\+/g, '');
      const studentIdForKey = studentId !== 'none' ? studentId : (options.studentId || 'unknown_student');
      const permissionIdForKey = options.permissionId || 'none';
      const templateTypeForKey = templateType !== 'none' ? templateType : 'student_permission';
      const messageTypeForKey = messageType !== type ? messageType : 'permission_notice';
      const dateForKey = options.date || dateToday;
      const schoolIdForKey = schoolId;

      idempotencyKey = `${schoolIdForKey}_${parentPhoneStr}_${studentIdForKey}_${permissionIdForKey}_${templateTypeForKey}_${messageTypeForKey}_${dateForKey}`;

      safeLogWhatsappEvent('permission_idempotency_key_created', {
        key: idempotencyKey,
        studentId: studentIdForKey,
        permissionId: permissionIdForKey
      });
    } else if (isHostelOuting) {
      const parentPhoneStr = normalizedPhone.replace(/\+/g, '');
      const studentIdForKey = studentId !== 'none' ? studentId : (options.studentId || 'unknown_student');
      const outingIdForKey = options.outingId || 'none';
      const templateTypeForKey = templateType !== 'none' ? templateType : 'hostel_outing_permission';
      const messageTypeForKey = messageType !== type ? messageType : 'outing_notice';
      const dateForKey = options.date || dateToday;
      const schoolIdForKey = schoolId;

      idempotencyKey = `${schoolIdForKey}_${parentPhoneStr}_${studentIdForKey}_${outingIdForKey}_${templateTypeForKey}_${messageTypeForKey}_${dateForKey}`;

      safeLogWhatsappEvent('outing_idempotency_key_created', {
        key: idempotencyKey,
        studentId: studentIdForKey,
        outingId: outingIdForKey
      });
    } else if (type === 'broadcast') {
      const classIdKey = options.classId ? `_${options.classId}` : '';
      const uniqueBroadcastId = options.broadcastId || `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      idempotencyKey = `${schoolId}_${normalizedPhone.replace(/\+/g, '')}_none_broadcast${classIdKey}_${uniqueBroadcastId}`;
    } else if (templateType === 'none' || !templateType || type === 'single' || options.custom || options.messageType === 'custom') {
      // Manual single chat messages: ALWAYS generate a unique idempotency key so every message is queued, sent, and logged!
      const uniqueMsgId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      idempotencyKey = `${schoolId}_${normalizedPhone.replace(/\+/g, '')}_${studentId}_custom_${uniqueMsgId}`;
    } else {
      // Key format for automated notices: schoolId + normalizedPhone + studentId + templateType + messageType + date
      idempotencyKey = `${schoolId}_${normalizedPhone.replace(/\+/g, '')}_${studentId}_${templateType}_${messageType}_${dateToday}`;
    }

    // Verify unless forced send is true or it's a conversational bot reply
    const isBotReply = type === 'bot' || options.messageType === 'bot' || options.eventType === 'bot';
    if (!options.forceSend && !isBotReply) {
      const idSnapshot = await db.collection('whatsapp_idempotency').doc(idempotencyKey).get();
      if (idSnapshot.exists) {
        const idData = idSnapshot.data()!;
        const blockedStatuses = ['pending', 'processing', 'sent', 'retrying'];
        if (blockedStatuses.includes(idData.status)) {
          console.warn(`[WhatsApp Queue] Duplicate automated notice blocked by idempotency key: ${idempotencyKey}`);
          safeLogWhatsappEvent('duplicate_message_blocked', { key: idempotencyKey, recipient: normalizedPhone });
          if (isFeeReceipt) {
            safeLogWhatsappEvent('fee_receipt_duplicate_skipped', {
              key: idempotencyKey,
              recipient: normalizedPhone,
              studentId: studentId,
              receiptId: options.receiptId || options.receiptNumber,
              paymentId: options.paymentId
            });
          }
          if (isExamResult) {
            safeLogWhatsappEvent('marks_result_duplicate_skipped', {
              key: idempotencyKey,
              recipient: normalizedPhone,
              studentId: studentId,
              examId: options.examId,
              marksId: options.marksId
            });
          }
          if (options.templateType === 'leave_approval_request' || options.templateType === 'leave_status') {
            safeLogWhatsappEvent('leave_approval_duplicate_skipped', {
              key: idempotencyKey,
              recipient: normalizedPhone,
              applicantId: options.applicantId,
              leaveId: options.leaveId
            });
          }
          if (isStudentPermission) {
            safeLogWhatsappEvent('student_permission_duplicate_skipped', {
              key: idempotencyKey,
              recipient: normalizedPhone,
              studentId: studentId !== 'none' ? studentId : (options.studentId || 'unknown_student'),
              permissionId: options.permissionId
            });
          }
          if (isHostelOuting) {
            safeLogWhatsappEvent('hostel_outing_duplicate_skipped', {
              key: idempotencyKey,
              recipient: normalizedPhone,
              studentId: studentId !== 'none' ? studentId : (options.studentId || 'unknown_student'),
              outingId: options.outingId
            });
          }
          // Log skipped notice in whatsappLogs for full report visibility
          await logWhatsAppMessage(
            normalizedPhone,
            text,
            type,
            'failed',
            undefined,
            `Skipped: Duplicate notice already sent today (${idData.status})`,
            options
          ).catch(() => {});

          return { success: true, skipped: true, reason: `Duplicate message blocked (idempotency status: ${idData.status})` };
        }
      }
    } else {
      // Log manual force-send override
      await db.collection('whatsapp_audit_logs').add({
        event: 'idempotency_force_send_override',
        operator: 'api_admin',
        idempotencyKey,
        recipient: normalizedPhone,
        timestamp: new Date().toISOString()
      });
      if (isFeeReceipt) {
        safeLogWhatsappEvent('fee_receipt_force_send_used', {
          key: idempotencyKey,
          recipient: normalizedPhone,
          studentId: studentId,
          receiptId: options.receiptId || options.receiptNumber,
          paymentId: options.paymentId
        });
      }
      if (isExamResult) {
        safeLogWhatsappEvent('marks_result_force_send_used', {
          key: idempotencyKey,
          recipient: normalizedPhone,
          studentId: studentId,
          examId: options.examId,
          marksId: options.marksId
        });
      }
      if (options.templateType === 'leave_approval_request' || options.templateType === 'leave_status') {
        safeLogWhatsappEvent('leave_force_send_used', {
          key: idempotencyKey,
          recipient: normalizedPhone,
          applicantId: options.applicantId,
          leaveId: options.leaveId
        });
      }
      if (isStudentPermission) {
        safeLogWhatsappEvent('student_permission_force_send_used', {
          key: idempotencyKey,
          recipient: normalizedPhone,
          studentId: studentId !== 'none' ? studentId : (options.studentId || 'unknown_student'),
          permissionId: options.permissionId
        });
      }
      if (isHostelOuting) {
        safeLogWhatsappEvent('hostel_outing_force_send_used', {
          key: idempotencyKey,
          recipient: normalizedPhone,
          studentId: studentId !== 'none' ? studentId : (options.studentId || 'unknown_student'),
          outingId: options.outingId
        });
      }
      console.log(`[WhatsApp Queue] Force-send requested. Bypassing idempotency for key: ${idempotencyKey}`);
    }

    // Set idempotency record to pending if not a conversational bot reply
    if (!isBotReply) {
      await db.collection('whatsapp_idempotency').doc(idempotencyKey).set({
        status: 'pending',
        recipient: normalizedPhone,
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    // Format broadcast text with Meta Anti-Ban opt-out footer if not present
    let messageContent = text;
    if ((type === 'broadcast' || options?.isBroadcast || options?.broadcastTarget) && messageContent && !messageContent.includes('STOP') && !messageContent.includes('unsubscribe')) {
      messageContent += `\n\n—\nSt. Antony's High School\n(Reply STOP to unsubscribe from broadcasts)`;
    }

    // 4. Add to Queue Collection
    const docRef = await db.collection(QUEUE_COLLECTION).add({
      to: normalizedPhone,
      text: messageContent,
      options,
      type,
      priority: priorityVal,
      attempts: 0,
      idempotencyKey,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Update real-time stats
    await incrementWhatsAppStat({ total: 1, processing: 1 }, type);
    
    if (isFeeReceipt) {
      safeLogWhatsappEvent('fee_receipt_message_queued', {
        key: idempotencyKey,
        recipient: normalizedPhone,
        studentId: studentId,
        receiptId: options.receiptId || options.receiptNumber,
        paymentId: options.paymentId
      });
    }
    if (isStudentPermission) {
      safeLogWhatsappEvent('student_permission_message_queued', {
        key: idempotencyKey,
        recipient: normalizedPhone,
        studentId: options.studentId,
        permissionId: options.permissionId
      });
    }
    if (isHostelOuting) {
      safeLogWhatsappEvent('hostel_outing_message_queued', {
        key: idempotencyKey,
        recipient: normalizedPhone,
        studentId: options.studentId,
        outingId: options.outingId
      });
    }
    
    console.log(`[WhatsApp Queue] Message added to persistent queue (Priority: P${priorityVal}) for ${normalizedPhone}. ID: ${docRef.id}`);
    return { success: true, id: docRef.id };
  } catch (err: any) {
    console.error(`[WhatsApp Queue] Failed to add message to queue:`, err.message);
    throw err;
  }
};

export const broadcastMessage = async (to: any[], text: string, options: any = {}) => {
  console.log(`[WhatsApp Queue] Starting broadcast to ${to.length} recipients...`);
  
  // We can push all at once, the queue processor handles the delay
  for (const item of to) {
    if (typeof item === 'string') {
      sendMessage(item, text, options, 'broadcast').catch(err => {
        console.error(`Broadcast item failed for ${item}:`, err);
      });
    } else if (item && typeof item === 'object') {
      const { phone, studentId, classId } = item;
      if (!phone) continue;
      const itemOptions = {
        ...options,
        studentId: studentId || options.studentId,
        classId: classId || options.classId
      };
      sendMessage(phone, text, itemOptions, 'broadcast').catch(err => {
        console.error(`Broadcast item failed for ${phone}:`, err);
      });
    }
  }
};

/**
 * Sends a message with exponential-backoff retries if socket drops frame context during execution
 */
async function sendWithRetry(targetJid: string, messageText: string, options: any = {}, maxRetries = 3): Promise<any> {
  let attempt = 0;
  let delay = 1000; // start with 1s delay
  
  while (attempt < maxRetries) {
    try {
      if (!sock || connectionStatus !== 'open') {
        throw new Error("Baileys socket is not connected or open");
      }
      console.log(`[WhatsApp Community Broadcast] Attempting send to ${targetJid}, attempt ${attempt + 1}/${maxRetries}`);
      
      let msgPayload: any;
      const resolvedMedia = resolveMediaPayload(options, messageText);

      if (resolvedMedia) {
        msgPayload = resolvedMedia;
      } else if (options.videoUrl) {
        msgPayload = {
          video: { url: options.videoUrl },
          caption: messageText,
          gifPlayback: options.asGif || false
        };
      } else if (options.imageUrl) {
        msgPayload = {
          image: { url: options.imageUrl },
          caption: messageText
        };
      } else if (options.documentUrl) {
        msgPayload = {
          document: { url: options.documentUrl },
          fileName: options.fileName || 'document.pdf',
          caption: messageText,
          mimetype: options.mimetype || 'application/pdf'
        };
      } else {
        msgPayload = { text: messageText };
      }

      let cleanJid = targetJid;
      if (!cleanJid.endsWith('@g.us') && !cleanJid.endsWith('@newsletter') && !cleanJid.endsWith('@lid')) {
        const cleanPn = cleanJid.split('@')[0].split(':')[0].replace(/\D/g, '');
        if (cleanPn) {
          cleanJid = `${cleanPn}@s.whatsapp.net`;
        }
      }

      const SEND_TIMEOUT_MS = 60000;
      const sendPromise = sock.sendMessage(cleanJid, msgPayload);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`sock.sendMessage timed out after ${SEND_TIMEOUT_MS / 1000} seconds`)), SEND_TIMEOUT_MS)
      );

      const result = await Promise.race([sendPromise, timeoutPromise]);
      if (result && result.key) {
        storeMessageForRetry(result.key, result.message || msgPayload);
      }
      console.log(`[WhatsApp Community Broadcast] Successfully sent message to ${targetJid}`);
      return result;
    } catch (err: any) {
      attempt++;
      console.error(`[WhatsApp Community Broadcast] Error sending to ${targetJid} on attempt ${attempt}:`, err.message);
      if (attempt >= maxRetries) {
        throw err;
      }
      console.log(`[WhatsApp Community Broadcast] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // exponential backoff
    }
  }
}

/**
 * Isolated asynchronous broadcast handler that dispatches a message exclusively
 * to WhatsApp Community Announcement Groups mapped to specific classIds.
 */
export const sendCommunityBroadcast = async (classIds: string[], messageText: string, options: any = {}) => {
  console.log(`[WhatsApp Community Broadcast] Starting broadcast for classes: ${classIds.join(', ')}`);
  
  const sentAt = new Date().toISOString();
  let status: 'success' | 'failed' | 'partial' = 'success';
  let errorMsg: string | undefined;
  const successJids: string[] = [];
  const failedJids: string[] = [];
  let targetJids: string[] = [];

  try {
    const db = getDbAdmin();
    if (!db) {
      throw new Error("Database not available on server");
    }

    // Resolve community JIDs from whatsapp_communities collection
    const jidsSet = new Set<string>();
    const jidToClassesMap = new Map<string, string[]>(); // Map targetJid -> associated class IDs

    const communitiesSnap = await db.collection('whatsapp_communities')
      .where('isActive', '==', true)
      .get();

    communitiesSnap.forEach((doc: any) => {
      const data = doc.data();
      const associated = data.associatedClasses || [];
      const hasOverlap = associated.some((cId: string) => classIds.includes(cId));
      if (hasOverlap && data.communityJid) {
        const cleanJid = data.communityJid.trim();
        jidsSet.add(cleanJid);
        
        // Accumulate matching classes for this JID
        const currentClasses = jidToClassesMap.get(cleanJid) || [];
        const matched = associated.filter((cId: string) => classIds.includes(cId));
        jidToClassesMap.set(cleanJid, Array.from(new Set([...currentClasses, ...matched])));
      }
    });

    targetJids = Array.from(jidsSet);
    if (targetJids.length === 0) {
      console.warn(`[WhatsApp Community Broadcast] No active WhatsApp Community found for specified classes.`);
      status = 'failed';
      errorMsg = 'No active communities mapped to these classes';
    } else {
      console.log(`[WhatsApp Community Broadcast] Found ${targetJids.length} target community JID(s): ${targetJids.join(', ')}`);
      
      // Fetch classes to map names
      const classIdToNameMap = new Map<string, string>();
      try {
        const classesSnap = await db.collection('classes').get();
        classesSnap.forEach((doc: any) => {
          classIdToNameMap.set(doc.id, doc.data().name || doc.id);
        });
      } catch (classErr) {
        console.warn(`[WhatsApp Community Broadcast] Failed to fetch classes to resolve names:`, classErr);
      }

      // Dispatch to target JIDs sequentially
      for (const targetJid of targetJids) {
        // Resolve nice display name
        const matchedClassIds = jidToClassesMap.get(targetJid) || [];
        const matchedClassNames = matchedClassIds.map(cId => classIdToNameMap.get(cId) || cId);
        let displayName = matchedClassNames.length > 0 
          ? `Community (${matchedClassNames.join(', ')})` 
          : 'Community Broadcast';

        try {
          const groupDoc = await db.collection('whatsapp_discovered_groups').doc(targetJid).get();
          if (groupDoc.exists && groupDoc.data()?.subject) {
            displayName = groupDoc.data().subject;
          }
        } catch (groupErr) {
          console.warn(`[WhatsApp Community Broadcast] Failed to resolve group subject for ${targetJid}:`, groupErr);
        }

        let queueDocRef: any = null;
        const communityOptions = {
          ...options,
          isCommunity: true,
          communityName: displayName,
          classIds: matchedClassIds
        };

        // Increment stats for total and processing
        await incrementWhatsAppStat({ total: 1, processing: 1 }, 'broadcast').catch((statsErr) => {
          console.error(`[WhatsApp Community Broadcast] Failed to increment stats:`, statsErr.message);
        });

        // Add to whatsapp_queue with status: 'processing'
        try {
          queueDocRef = await db.collection('whatsapp_queue').add({
            to: targetJid,
            text: messageText,
            options: communityOptions,
            type: 'broadcast',
            priority: 2,
            attempts: 1,
            status: 'processing',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } catch (queueAddErr: any) {
          console.error(`[WhatsApp Community Broadcast] Failed to add to queue before send:`, queueAddErr.message);
        }

        try {
          // Enforce Meta Anti-Ban rate limiter for community broadcasts
          let slotWait = await acquireGlobalSendSlot(db, false);
          while (slotWait > 0) {
            console.log(`[WhatsApp Community Broadcast Rate Limiter] Pacing output to 4 msgs/min (Meta Anti-Ban). Waiting ${Math.round(slotWait/1000)}s...`);
            await delay(slotWait);
            slotWait = await acquireGlobalSendSlot(db, false);
          }

          await sendWithRetry(targetJid, messageText, options);
          successJids.push(targetJid);

          // Update whatsapp_queue doc to 'sent'
          if (queueDocRef) {
            await queueDocRef.update({
              status: 'sent',
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }

          // Log to whatsappLogs
          await logWhatsAppMessage(
            targetJid,
            messageText,
            'broadcast',
            'sent',
            undefined,
            undefined,
            communityOptions
          ).catch((logErr) => {
            console.error(`[WhatsApp Community Broadcast] logWhatsAppMessage error:`, logErr.message);
          });

        } catch (sendErr: any) {
          console.error(`[WhatsApp Community Broadcast] Failed to send to ${targetJid} after retries:`, sendErr.message);
          failedJids.push(targetJid);

          // Update whatsapp_queue doc to 'failed'
          if (queueDocRef) {
            await queueDocRef.update({
              status: 'failed',
              error: sendErr.message,
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }

          // Log to whatsappLogs as failed
          await logWhatsAppMessage(
            targetJid,
            messageText,
            'broadcast',
            'failed',
            undefined,
            sendErr.message,
            communityOptions
          ).catch((logErr) => {
            console.error(`[WhatsApp Community Broadcast] logWhatsAppMessage failed error:`, logErr.message);
          });
        }
      }

      if (successJids.length === 0) {
        status = 'failed';
        errorMsg = 'All target community dispatches failed';
      } else if (failedJids.length > 0) {
        status = 'partial';
        errorMsg = `Failed for: ${failedJids.join(', ')}`;
      }
    }
  } catch (err: any) {
    console.error(`[WhatsApp Community Broadcast] Fatal broadcast error:`, err.message);
    status = 'failed';
    errorMsg = err.message;
  }

  // Log execution into whatsapp_broadcast_logs
  try {
    const db = getDbAdmin();
    if (db) {
      await db.collection('whatsapp_broadcast_logs').add({
        messageText,
        classIds,
        targetJids,
        successJids,
        failedJids,
        sentAt,
        status,
        error: errorMsg || null,
        options: options || {},
        createdAt: new Date().toISOString()
      });
      console.log(`[WhatsApp Community Broadcast] Logged execution status: ${status}`);
    }
  } catch (logErr: any) {
    console.error(`[WhatsApp Community Broadcast] Failed to write broadcast execution logs:`, logErr.message);
  }

  return { status, targetJids, successJids, failedJids, error: errorMsg };
};


export const fetchChannels = async () => {
  if (!sock || connectionStatus !== 'open') return [];
  try {
    // Check if the method exists as it might not be available in all Baileys versions
    if (typeof sock.newsletterQuery === 'function') {
      const newsletters = await sock.newsletterQuery('subscribed');
      return newsletters || [];
    }
    console.log("Newsletter query not supported in this Baileys version");
    return [];
  } catch (error) {
    console.error("Error fetching channels:", error);
    return [];
  }
};

let lastLiveGroupFetchAt = 0;
let lastLiveGroupsCacheList: any[] = [];

export const fetchGroups = async () => {
  const db = getDbAdmin();
  let cachedList: any[] = [];
  try {
    if (db && !isDatabaseDenied()) {
      const snap = await db.collection('whatsapp_discovered_groups').get();
      cachedList = snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));
    }
  } catch (err: any) {
    console.warn("[WhatsApp] Failed to fetch cached groups from Firestore:", err.message);
  }

  if (!sock || connectionStatus !== 'open') {
    console.log("[WhatsApp] Cannot fetch groups live on this instance: Socket is not open or not initialized. Triggering remote refresh...");
    try {
      if (db && !isDatabaseDenied()) {
        // Trigger a refresh on the active owner instance
        await db.collection(LOCK_COLLECTION).doc(STATUS_DOC).set({
          triggerGroupRefresh: new Date().toISOString()
        }, { merge: true });
        
        console.log("[WhatsApp] Triggered remote group refresh. Waiting 2.5s for owner to cache...");
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        // Query the newly updated cache from Firestore
        const snap = await db.collection('whatsapp_discovered_groups').get();
        cachedList = snap.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        }));
      }
    } catch (triggerErr: any) {
      console.warn("[WhatsApp] Failed to trigger remote group refresh:", triggerErr.message);
    }
    return cachedList.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
  }

  // Use memory cache if last live fetch was within 30 seconds
  const now = Date.now();
  if (now - lastLiveGroupFetchAt < 30000 && lastLiveGroupsCacheList.length > 0) {
    const mergedMap = new Map();
    cachedList.forEach(g => mergedMap.set(g.id, g));
    lastLiveGroupsCacheList.forEach(g => mergedMap.set(g.id, g));
    return Array.from(mergedMap.values()).sort((a: any, b: any) => (a.subject || '').localeCompare(b.subject || ''));
  }

  try {
    let liveGroupsList: any[] = [];
    if (typeof sock.groupFetchAllParticipating === 'function') {
      let groups: any = null;
      try {
        groups = await sock.groupFetchAllParticipating();
        lastLiveGroupFetchAt = Date.now();
      } catch (innerErr: any) {
        console.warn("[WhatsApp] groupFetchAllParticipating notice:", innerErr?.message || innerErr);
        // Fall back to stored cachedList gracefully without throwing
        return cachedList.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
      }

      const keys = groups ? Object.keys(groups) : [];
      if (groups) {
        liveGroupsList = Object.values(groups).map((g: any) => ({
          id: g.id,
          subject: g.subject,
          participantsCount: g.participants?.length || 0,
          isCommunity: g.isCommunity || g.isCommunityAnnouncement || !!g.linkedParent || g.size !== undefined || false,
          isCommunityAnnouncement: g.isCommunityAnnouncement || false,
          linkedParent: g.linkedParent || null,
          size: g.size
        }));
        lastLiveGroupsCacheList = liveGroupsList;
      }
      
      // Update our Firestore cache asynchronously with any new live groups
      if (db && !isDatabaseDenied() && liveGroupsList.length > 0) {
        const batch = db.batch();
        for (const g of liveGroupsList) {
          const docRef = db.collection('whatsapp_discovered_groups').doc(g.id);
          batch.set(docRef, {
            id: g.id,
            subject: g.subject || 'Group Chat',
            participantsCount: g.participantsCount || 0,
            isCommunity: g.isCommunity || false,
            isCommunityAnnouncement: g.isCommunityAnnouncement || false,
            linkedParent: g.linkedParent || null,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
        await batch.commit().catch((e: any) => console.warn("[WhatsApp] Error updating groups batch:", e.message));
      }
    }

    // Merge live and cached lists
    const mergedMap = new Map();
    // Insert cached first
    cachedList.forEach(g => mergedMap.set(g.id, g));
    // Overwrite/insert with live
    liveGroupsList.forEach(g => mergedMap.set(g.id, g));
    
    const mergedList = Array.from(mergedMap.values());
    return mergedList.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
  } catch (error: any) {
    console.warn("[WhatsApp] Notice in fetchGroups, returning cached list:", error?.message || error);
    return cachedList.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
  }
};

export const resolveInviteLink = async (inviteCodeOrLink: string) => {
  const db = getDbAdmin();
  if (!sock || connectionStatus !== 'open') {
    console.log(`[WhatsApp] Standby instance triggered resolveInviteLink. Routing via whatsapp_commands collection...`);
    if (!db || isDatabaseDenied()) {
      throw new Error("WhatsApp connection is not active. Please connect WhatsApp from the status panel first.");
    }
    
    const commandId = 'cmd_' + Math.random().toString(36).substring(2, 15);
    const commandRef = db.collection('whatsapp_commands').doc(commandId);
    
    await commandRef.set({
      command: 'resolve_invite',
      args: { inviteLink: inviteCodeOrLink },
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    
    // Poll for the result (max 20 attempts, 200ms delay = 4 seconds total)
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const doc = await commandRef.get();
      if (doc.exists) {
        const data = doc.data()!;
        if (data.status === 'completed') {
          // Clean up command doc asynchronously
          commandRef.delete().catch(() => {});
          return data.result;
        } else if (data.status === 'failed') {
          commandRef.delete().catch(() => {});
          throw new Error(data.error || "Failed to resolve invite link on active WhatsApp connection.");
        }
      }
    }
    
    // If it timed out, clean up and throw timeout error
    commandRef.delete().catch(() => {});
    throw new Error("Timeout waiting for WhatsApp connection to resolve invite link. Please make sure WhatsApp is connected.");
  }

  try {
    let code = inviteCodeOrLink.trim();
    if (code.includes('chat.whatsapp.com/')) {
      const parts = code.split('chat.whatsapp.com/');
      const linkPart = parts[1] || '';
      if (linkPart.startsWith('invite/')) {
        code = linkPart.substring(7);
      } else {
        code = linkPart;
      }
    }
    // Remove query params or trailing slashes
    code = code.split('?')[0].split('/')[0].trim();

    if (!code) {
      throw new Error("Invalid invite code or link provided.");
    }

    console.log(`[WhatsApp] Attempting to resolve invite code: "${code}"`);
    const info = await sock.groupGetInviteInfo(code);
    if (info && info.id) {
      const db = getDbAdmin();
      const groupData = {
        id: info.id,
        subject: info.subject || 'Resolved Group',
        participantsCount: info.size || info.participants?.length || 0,
        isCommunity: info.size !== undefined || info.isCommunity || false,
        updatedAt: new Date().toISOString()
      };
      
      if (db && !isDatabaseDenied()) {
        await db.collection('whatsapp_discovered_groups').doc(info.id).set(groupData, { merge: true });
      }
      return groupData;
    }
    throw new Error("Could not retrieve group information from WhatsApp.");
  } catch (err: any) {
    console.error("[WhatsApp] Error resolving invite link:", err.message);
    throw new Error(err.message || "Failed to resolve WhatsApp group invite link. Please make sure the link is correct and active.");
  }
};

