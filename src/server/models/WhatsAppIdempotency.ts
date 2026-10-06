import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';
import { WhatsAppQueue } from './WhatsAppQueue.js';
import { checkWhatsAppDeduplication, markWhatsAppMessageSent } from '../whatsappDeduplication.js';

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

  // 0. Universal Deduplication Check (in-memory + disk cache)
  const universalCheck = checkWhatsAppDeduplication({
    recipient: params.recipient,
    text: params.text,
    options: {
      templateType: params.templateType,
      messageType: params.messageType,
      studentId: params.studentId,
      forceSend: params.forceSend
    },
    idempotencyKey: params.idempotencyKey,
    forceSend: params.forceSend
  });

  if (universalCheck.isDuplicate) {
    return {
      isDuplicate: true,
      reason: universalCheck.reason,
      existingIdempotencyKey: params.idempotencyKey
    };
  }

  const cleanPhone = cleanPhoneNumber(params.recipient);
  const contentHash = generateContentHash(params.text);
  const isMongoConnected = mongoose.connection.readyState === 1;

  if (!cleanPhone || !params.text?.trim()) {
    return { isDuplicate: false };
  }

  const phone10 = cleanPhone.slice(-10);
  const phoneVariants = Array.from(new Set([
    cleanPhone,
    `+${cleanPhone}`,
    `${cleanPhone}@s.whatsapp.net`,
    phone10,
    `+91${phone10}`,
    `91${phone10}`,
    `91${phone10}@s.whatsapp.net`
  ].filter(Boolean)));

  const phoneQuery = {
    $or: [
      { recipient: { $in: phoneVariants } },
      { to: { $in: phoneVariants } }
    ]
  };

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
        ...phoneQuery,
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

      // 3. Absent alert student-level deduplication (strictly 1 absent alert per student per day)
      const isAbsentNotice = 
        params.templateType === 'absent' || 
        params.messageType === 'attendance_absent' ||
        params.text?.toLowerCase().includes('marked *absent*') ||
        params.text?.toLowerCase().includes('marked absent');

      const deduplicationWindowMs = 24 * 60 * 60 * 1000; // 24-hour deduplication window
      const windowStart = new Date(Date.now() - deduplicationWindowMs);

      if (isAbsentNotice && params.studentId && params.studentId !== 'none') {
        const studentAbsentSent = await WhatsAppQueue.findOne({
          $or: [
            { 'options.studentId': params.studentId },
            { studentId: params.studentId }
          ],
          status: 'sent',
          sentAt: { $gte: windowStart }
        }).sort({ sentAt: -1 });

        if (studentAbsentSent) {
          return {
            isDuplicate: true,
            reason: `Attendance absent alert already delivered today for student ID ${params.studentId}`,
            existingStatus: 'sent',
            existingId: studentAbsentSent._id.toString()
          };
        }
      }

      // 4. Check MongoDB whatsapp_queue for identical message already SENT within 24 hours
      const recentSentDuplicate = await WhatsAppQueue.findOne({
        ...phoneQuery,
        status: 'sent',
        sentAt: { $gte: windowStart }
      }).sort({ sentAt: -1 });

      if (recentSentDuplicate) {
        const sentHash = generateContentHash(recentSentDuplicate.message || recentSentDuplicate.text || '');
        if (sentHash === contentHash) {
          const timeSinceSentMin = Math.round((Date.now() - new Date(recentSentDuplicate.sentAt || windowStart).getTime()) / 60000);
          return {
            isDuplicate: true,
            reason: isAbsentNotice 
              ? `Attendance absent alert already delivered today (${timeSinceSentMin} mins ago)`
              : `Identical message already sent to this recipient today (${timeSinceSentMin} mins ago)`,
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
  if (params.status === 'sent') {
    markWhatsAppMessageSent({
      recipient: params.recipient,
      text: params.text,
      options: {
        templateType: params.templateType,
        messageType: params.messageType,
        studentId: params.studentId
      },
      idempotencyKey: params.key
    });
  }

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
