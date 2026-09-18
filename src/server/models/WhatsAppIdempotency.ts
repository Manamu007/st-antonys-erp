import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';
import { WhatsAppQueue } from './WhatsAppQueue.js';

export interface IWhatsAppIdempotency extends Document {
  key: string;
  recipient: string;
  normalizedPhone: string;
  contentHash: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'retrying';
  templateType?: string;
  messageType?: string;
  studentId?: string;
  source?: string;
  waMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const WhatsAppIdempotencySchema: Schema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    recipient: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    normalizedPhone: {
      type: String,
      index: true,
      trim: true
    },
    contentHash: {
      type: String,
      index: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'retrying'],
      default: 'pending',
      index: true
    },
    templateType: {
      type: String,
      default: 'none'
    },
    messageType: {
      type: String,
      default: 'single'
    },
    studentId: {
      type: String,
      default: 'none'
    },
    source: {
      type: String
    },
    waMessageId: {
      type: String,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
      expires: '7d' // Auto-expire records after 7 days
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'whatsapp_idempotency',
    strict: false
  }
);

// Prevent re-compilation in development / hot reload
export const WhatsAppIdempotency: Model<IWhatsAppIdempotency> =
  (mongoose.models.WhatsAppIdempotency as Model<IWhatsAppIdempotency>) ||
  mongoose.model<IWhatsAppIdempotency>('WhatsAppIdempotency', WhatsAppIdempotencySchema);

/**
 * Generate a deterministic content hash for message deduplication
 */
export function generateContentHash(text: string): string {
  const normalized = (text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' '); // Normalize spaces and newlines
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Clean phone number to digits only (e.g., 919876543210)
 */
export function cleanPhoneNumber(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
  existingStatus?: string;
  existingId?: string;
  existingIdempotencyKey?: string;
}

/**
 * Robust duplicate check across MongoDB whatsapp_idempotency and whatsapp_queue collections.
 * Prevents identical messages from being sent twice to the same recipient.
 */
export async function checkWhatsAppDuplicate(params: {
  idempotencyKey?: string;
  recipient: string;
  text: string;
  templateType?: string;
  messageType?: string;
  studentId?: string;
  forceSend?: boolean;
}): Promise<DuplicateCheckResult> {
  // If forceSend is explicitly true, allow sending
  if (params.forceSend === true) {
    return { isDuplicate: false };
  }

  const cleanPhone = cleanPhoneNumber(params.recipient);
  const contentHash = generateContentHash(params.text);
  const isMongoConnected = mongoose.connection.readyState === 1;

  if (!cleanPhone || !params.text?.trim()) {
    return { isDuplicate: false };
  }

  if (isMongoConnected) {
    try {
      // 1. Check idempotencyKey in MongoDB whatsapp_idempotency collection
      if (params.idempotencyKey) {
        const idRecord = await WhatsAppIdempotency.findOne({ key: params.idempotencyKey });
        if (idRecord) {
          const blockedStatuses = ['pending', 'processing', 'sent', 'retrying'];
          const isStale = (idRecord.status === 'pending' || idRecord.status === 'processing') &&
            idRecord.updatedAt &&
            (Date.now() - new Date(idRecord.updatedAt).getTime() > 15 * 60 * 1000);

          if (blockedStatuses.includes(idRecord.status) && !isStale) {
            return {
              isDuplicate: true,
              reason: `Message already recorded with idempotency status: ${idRecord.status}`,
              existingStatus: idRecord.status,
              existingIdempotencyKey: idRecord.key
            };
          }
        }
      }

      // 2. Check MongoDB whatsapp_queue for identical message currently in pending or processing status
      const activeQueueDuplicate = await WhatsAppQueue.findOne({
        $or: [
          { recipient: cleanPhone },
          { recipient: `+${cleanPhone}` },
          { to: cleanPhone },
          { to: `+${cleanPhone}` }
        ],
        status: { $in: ['pending', 'processing'] }
      }).sort({ createdAt: -1 });

      if (activeQueueDuplicate) {
        const existingHash = generateContentHash(activeQueueDuplicate.message || activeQueueDuplicate.text || '');
        if (existingHash === contentHash) {
          return {
            isDuplicate: true,
            reason: `Identical message already in queue with status: ${activeQueueDuplicate.status}`,
            existingStatus: activeQueueDuplicate.status,
            existingId: activeQueueDuplicate._id.toString()
          };
        }
      }

      // 3. Check MongoDB whatsapp_queue for identical message already SENT
      const isDailyAutomated = 
        params.templateType === 'absent' || 
        params.templateType === 'exam_result' || 
        params.templateType === 'fee_receipt' || 
        params.messageType === 'attendance_absent' ||
        params.messageType === 'marks_result' ||
        params.messageType === 'payment_receipt';

      // Deduplication time window:
      // For automated daily notices: within 24 hours (86,400,000 ms)
      // For general / custom / broadcast messages: within 15 minutes (900,000 ms) to prevent double clicks & repeats
      const deduplicationWindowMs = isDailyAutomated ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
      const windowStart = new Date(Date.now() - deduplicationWindowMs);

      const recentSentDuplicate = await WhatsAppQueue.findOne({
        $or: [
          { recipient: cleanPhone },
          { recipient: `+${cleanPhone}` },
          { to: cleanPhone },
          { to: `+${cleanPhone}` }
        ],
        status: 'sent',
        sentAt: { $gte: windowStart }
      }).sort({ sentAt: -1 });

      if (recentSentDuplicate) {
        const sentHash = generateContentHash(recentSentDuplicate.message || recentSentDuplicate.text || '');
        if (sentHash === contentHash) {
          const timeSinceSentMin = Math.round((Date.now() - new Date(recentSentDuplicate.sentAt || windowStart).getTime()) / 60000);
          return {
            isDuplicate: true,
            reason: isDailyAutomated 
              ? `Identical automated notice already delivered today (${timeSinceSentMin} mins ago)`
              : `Identical message already sent to this recipient ${timeSinceSentMin} mins ago`,
            existingStatus: 'sent',
            existingId: recentSentDuplicate._id.toString()
          };
        }
      }
    } catch (err: any) {
      console.warn('[WhatsAppIdempotency] checkWhatsAppDuplicate error:', err?.message || err);
    }
  }

  return { isDuplicate: false };
}

/**
 * Record or update idempotency record in MongoDB whatsapp_idempotency collection
 */
export async function recordWhatsAppIdempotency(params: {
  key: string;
  recipient: string;
  text: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'retrying';
  templateType?: string;
  messageType?: string;
  studentId?: string;
  source?: string;
  waMessageId?: string;
}): Promise<void> {
  const isMongoConnected = mongoose.connection.readyState === 1;
  if (!isMongoConnected || !params.key) return;

  try {
    const cleanPhone = cleanPhoneNumber(params.recipient);
    const contentHash = generateContentHash(params.text);

    await WhatsAppIdempotency.findOneAndUpdate(
      { key: params.key },
      {
        $set: {
          key: params.key,
          recipient: cleanPhone,
          normalizedPhone: cleanPhone,
          contentHash,
          status: params.status,
          templateType: params.templateType || 'none',
          messageType: params.messageType || 'single',
          studentId: params.studentId || 'none',
          source: params.source || 'api',
          waMessageId: params.waMessageId,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true, new: true }
    );
  } catch (err: any) {
    console.warn('[WhatsAppIdempotency] recordWhatsAppIdempotency error:', err?.message || err);
  }
}
