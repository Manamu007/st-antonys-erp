import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface DedupRecord {
  key: string;
  recipient: string;
  contentHash: string;
  timestamp: number;
  date: string;
  category: 'absent' | 'permission' | 'outing' | 'fee' | 'exam' | 'broadcast' | 'general';
  studentId?: string;
  extra?: string;
}

// Persistent storage path
const DEDUP_CACHE_FILE = path.join(process.cwd(), '.cache', 'whatsapp_dedup_cache.json');

// In-memory lookup maps
const keyTimestampMap = new Map<string, number>();
const queuedKeysMap = new Map<string, number>();

// Load persisted cache on startup
try {
  const dir = path.dirname(DEDUP_CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(DEDUP_CACHE_FILE)) {
    const raw = fs.readFileSync(DEDUP_CACHE_FILE, 'utf8');
    const records: DedupRecord[] = JSON.parse(raw);
    const now = Date.now();
    const twoDaysAgo = now - 48 * 60 * 60 * 1000;
    if (Array.isArray(records)) {
      for (const rec of records) {
        if (rec.timestamp && rec.timestamp > twoDaysAgo && rec.key) {
          keyTimestampMap.set(rec.key, rec.timestamp);
        }
      }
    }
  }
} catch (_) {}

let persistScheduled = false;
function schedulePersist(): void {
  if (persistScheduled) return;
  persistScheduled = true;
  const timer = setTimeout(() => {
    persistScheduled = false;
    try {
      const now = Date.now();
      const twoDaysAgo = now - 48 * 60 * 60 * 1000;
      const records: Array<{ key: string; timestamp: number }> = [];
      for (const [key, timestamp] of keyTimestampMap.entries()) {
        if (timestamp > twoDaysAgo) {
          records.push({ key, timestamp });
        } else {
          keyTimestampMap.delete(key);
        }
      }
      fs.writeFileSync(DEDUP_CACHE_FILE, JSON.stringify(records), 'utf8');
    } catch (_) {}
  }, 2000);
  if (timer && typeof timer.unref === 'function') timer.unref();
}

// Periodic cleanup every 15 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const twoDaysAgo = now - 48 * 60 * 60 * 1000;
  for (const [key, timestamp] of keyTimestampMap.entries()) {
    if (timestamp <= twoDaysAgo) {
      keyTimestampMap.delete(key);
    }
  }
  // Clear queued keys older than 30 minutes
  for (const [k, ts] of queuedKeysMap.entries()) {
    if (now - ts > 30 * 60 * 1000) {
      queuedKeysMap.delete(k);
    }
  }
}, 15 * 60 * 1000);
if (cleanupInterval && typeof cleanupInterval.unref === 'function') cleanupInterval.unref();

export function cleanPhoneDigits(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function hashMessageContent(text: string): string {
  const normalized = (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

export interface WhatsAppCheckParams {
  recipient: string;
  text: string;
  options?: any;
  type?: 'single' | 'broadcast' | 'birthday' | 'bot';
  idempotencyKey?: string;
  forceSend?: boolean;
}

export interface WhatsAppCheckResult {
  isDuplicate: boolean;
  reason?: string;
  matchedKey?: string;
}

/**
 * Determine if a WhatsApp message is an attendance absent alert
 */
export function isAbsentAlert(text: string, options?: any): boolean {
  if (
    options?.templateType === 'absent' ||
    options?.messageType === 'attendance_absent' ||
    options?.eventType === 'absent'
  ) {
    return true;
  }
  const lower = (text || '').toLowerCase();
  return (
    lower.includes('marked *absent*') ||
    lower.includes('marked absent') ||
    (lower.includes('attendance alert') && lower.includes('absent'))
  );
}

/**
 * Extract all deduplication keys applicable for a message
 */
function extractDedupKeys(params: WhatsAppCheckParams): {
  keys: string[];
  isAbsent: boolean;
  category: 'absent' | 'permission' | 'outing' | 'fee' | 'exam' | 'broadcast' | 'general';
} {
  const phone10 = cleanPhoneDigits(params.recipient);
  const contentHash = hashMessageContent(params.text);
  const options = params.options || {};
  const dateToday = options.date || new Date().toISOString().split('T')[0];
  const studentId = options.studentId ? String(options.studentId).trim() : '';

  const isAbsent = isAbsentAlert(params.text, options);
  const isPermission = options.templateType === 'student_permission' || options.eventType === 'student_permission' || (params.text || '').toLowerCase().includes('marked for permission');
  const isOuting = options.templateType === 'hostel_outing_permission' || options.eventType === 'hostel_outing_permission' || (params.text || '').toLowerCase().includes('hostel outing');
  const isFee = options.templateType === 'fee_receipt' || options.messageType === 'payment_receipt' || options.eventType === 'fee_receipt' || (params.text || '').toLowerCase().includes('fee receipt') || (params.text || '').toLowerCase().includes('payment receipt');
  const isExam = options.templateType === 'exam_result' || options.messageType === 'marks_result' || options.eventType === 'exam_result' || (params.text || '').toLowerCase().includes('exam result');
  const isBroadcast = params.type === 'broadcast' || options.isBroadcast || options.broadcastTarget;

  const keys: string[] = [];

  // 1. Explicit idempotency key if provided
  if (params.idempotencyKey) {
    keys.push(`idemp_${params.idempotencyKey}`);
  }

  // 2. Attendance absent alert keys (strictly 1 absent alert per student per date)
  if (isAbsent) {
    if (studentId && studentId !== 'none') {
      keys.push(`absent_student_${studentId}_${dateToday}`);
      if (phone10) {
        keys.push(`absent_pair_${phone10}_${studentId}_${dateToday}`);
      }
    } else if (phone10) {
      keys.push(`absent_phone_${phone10}_${dateToday}`);
    }
    return { keys, isAbsent: true, category: 'absent' };
  }

  // 3. Permission / Outing keys
  if (isPermission) {
    const permId = options.permissionId || 'none';
    if (studentId && studentId !== 'none') {
      keys.push(`perm_${studentId}_${permId}_${dateToday}`);
    }
    if (phone10) {
      keys.push(`perm_${phone10}_${permId}_${dateToday}`);
    }
    return { keys, isAbsent: false, category: 'permission' };
  }

  if (isOuting) {
    const outingId = options.outingId || 'none';
    if (studentId && studentId !== 'none') {
      keys.push(`outing_${studentId}_${outingId}_${dateToday}`);
    }
    if (phone10) {
      keys.push(`outing_${phone10}_${outingId}_${dateToday}`);
    }
    return { keys, isAbsent: false, category: 'outing' };
  }

  // 4. Fee Receipts / Reminders
  if (isFee) {
    const receiptId = options.receiptId || options.receiptNumber || options.paymentId || 'none';
    if (studentId && studentId !== 'none') {
      keys.push(`fee_${studentId}_${receiptId}_${dateToday}`);
    }
    if (phone10) {
      keys.push(`fee_${phone10}_${receiptId}_${dateToday}`);
    }
    return { keys, isAbsent: false, category: 'fee' };
  }

  // 5. Exam Results
  if (isExam) {
    const examId = options.examId || 'none';
    if (studentId && studentId !== 'none') {
      keys.push(`exam_${studentId}_${examId}_${dateToday}`);
    }
    return { keys, isAbsent: false, category: 'exam' };
  }

  // 6. Broadcasts
  if (isBroadcast && phone10) {
    keys.push(`broadcast_${phone10}_${contentHash}_${dateToday}`);
    return { keys, isAbsent: false, category: 'broadcast' };
  }

  // 7. General identical message rule: Same recipient + same message text
  if (phone10) {
    keys.push(`general_${phone10}_${contentHash}_${dateToday}`);
    // Also add a sliding window hash for general messages
    keys.push(`exact_${phone10}_${contentHash}`);
  }

  return { keys, isAbsent: false, category: 'general' };
}

/**
 * Universal WhatsApp Deduplication Check:
 * Checks whether this message or alert was already sent or is currently queued.
 */
export function checkWhatsAppDeduplication(params: WhatsAppCheckParams): WhatsAppCheckResult {
  // If explicitly forced by admin, allow
  if (params.forceSend === true || params.options?.forceSend === true) {
    return { isDuplicate: false };
  }

  // Allow short bot conversation replies (e.g., '1', '2', 'Menu')
  if (
    (params.type === 'bot' || params.options?.messageType === 'bot') &&
    Boolean(params.options?.isChatbotReply || params.options?.replyToWaId) &&
    !params.options?.templateType &&
    !isAbsentAlert(params.text, params.options)
  ) {
    return { isDuplicate: false };
  }

  const { keys, isAbsent, category } = extractDedupKeys(params);
  const now = Date.now();

  // Deduplication windows:
  // - Absent attendance alerts: 24 hours (86,400,000 ms)
  // - Permission / Outing alerts: 24 hours
  // - Fee / Exam notices: 24 hours
  // - Broadcasts: 24 hours
  // - General messages with exact identical text: 24 hours (86,400,000 ms)
  const windowMs = 24 * 60 * 60 * 1000;

  for (const k of keys) {
    // 1. Check if already dispatched/sent
    const lastSent = keyTimestampMap.get(k);
    if (lastSent && (now - lastSent) < windowMs) {
      const minsAgo = Math.round((now - lastSent) / 60000);
      const secsAgo = Math.round((now - lastSent) / 1000);
      const timeStr = minsAgo > 0 ? `${minsAgo}m ago` : `${secsAgo}s ago`;

      let reason = `Duplicate message suppressed: identical message already sent to recipient ${timeStr}`;
      if (isAbsent) {
        reason = `Duplicate attendance alert suppressed: absent alert already sent for this student today (${timeStr})`;
      } else if (category === 'permission') {
        reason = `Duplicate permission notice suppressed: already sent today (${timeStr})`;
      } else if (category === 'fee') {
        reason = `Duplicate fee notice suppressed: already sent today (${timeStr})`;
      } else if (category === 'exam') {
        reason = `Duplicate exam marks notice suppressed: already sent today (${timeStr})`;
      } else if (category === 'broadcast') {
        reason = `Duplicate broadcast suppressed: recipient already received this broadcast today (${timeStr})`;
      }

      console.warn(`[WhatsApp Deduplication Guard] ${reason} [Key: ${k}]`);
      return {
        isDuplicate: true,
        reason,
        matchedKey: k
      };
    }

    // 2. Check if currently pending/queued in-flight (rapid double-click prevention)
    const queueTime = queuedKeysMap.get(k);
    if (queueTime && (now - queueTime) < 15 * 60 * 1000) {
      const secsAgo = Math.round((now - queueTime) / 1000);
      const minsAgo = Math.round((now - queueTime) / 60000);
      const timeStr = minsAgo > 0 ? `${minsAgo}m ago` : `${secsAgo}s ago`;
      const reason = `Duplicate message suppressed: identical message currently in queue waiting to be sent (${timeStr})`;
      console.warn(`[WhatsApp Deduplication Guard] ${reason} [Key: ${k}]`);
      return {
        isDuplicate: true,
        reason,
        matchedKey: k
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Register a message as queued in-flight to prevent immediate duplicate enqueuing
 */
export function markWhatsAppMessageQueued(params: WhatsAppCheckParams): void {
  const { keys } = extractDedupKeys(params);
  const now = Date.now();
  for (const k of keys) {
    queuedKeysMap.set(k, now);
  }
}

/**
 * Register a message as successfully sent to prevent any future duplicate sends
 */
export function markWhatsAppMessageSent(params: WhatsAppCheckParams): void {
  const { keys } = extractDedupKeys(params);
  const now = Date.now();
  for (const k of keys) {
    keyTimestampMap.set(k, now);
    queuedKeysMap.delete(k); // remove from queued since it has now been sent
  }
  schedulePersist();
}
