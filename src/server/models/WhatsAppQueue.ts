import mongoose, { Schema, Document, Model } from 'mongoose';
import fs from 'fs';
import path from 'path';

export interface IWhatsAppQueue extends Document {
  recipient: string;
  to?: string;
  message: string;
  text?: string;
  mediaUrl?: string;
  options?: any;
  priority?: number;
  type?: string;
  idempotencyKey?: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'retrying';
  attempts: number;
  waMessageId?: string;
  createdAt: Date;
  sentAt?: Date;
  startedAt?: Date;
  nextAttemptAt?: Date;
  error?: string;
}

// 1. MongoDB Queue Schema as requested - collection: 'whatsapp_queue'
export const WhatsAppQueueSchema: Schema = new Schema(
  {
    recipient: {
      type: String,
      required: true,
      trim: true
    },
    to: {
      type: String,
      trim: true
    },
    message: {
      type: String,
      default: ''
    },
    text: {
      type: String,
      default: ''
    },
    mediaUrl: {
      type: String,
      required: false
    },
    options: {
      type: Schema.Types.Mixed
    },
    priority: {
      type: Number,
      default: 3,
      index: true
    },
    type: {
      type: String,
      default: 'single'
    },
    idempotencyKey: {
      type: String,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'retrying'],
      default: 'pending',
      index: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    waMessageId: {
      type: String,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    sentAt: {
      type: Date
    },
    startedAt: {
      type: Date
    },
    nextAttemptAt: {
      type: Date
    },
    error: {
      type: String
    }
  },
  {
    collection: 'whatsapp_queue',
    strict: false
  }
);

// Prevent re-compilation in development HMR / tsx reload
export const WhatsAppQueue: Model<IWhatsAppQueue> =
  (mongoose.models.WhatsAppQueue as Model<IWhatsAppQueue>) ||
  mongoose.model<IWhatsAppQueue>('WhatsAppQueue', WhatsAppQueueSchema);

// Local fallback store for offline/local sandbox environments
const localDataDir = path.join(process.cwd(), '.local_db');
const localQueueFile = path.join(localDataDir, 'whatsapp_queue.json');

const memoryQueue = new Map<string, any>();

try {
  if (!fs.existsSync(localDataDir)) {
    fs.mkdirSync(localDataDir, { recursive: true });
  }
  if (fs.existsSync(localQueueFile)) {
    const raw = fs.readFileSync(localQueueFile, 'utf-8');
    const list: any[] = JSON.parse(raw);
    list.forEach(item => {
      memoryQueue.set(String(item._id), {
        ...item,
        createdAt: new Date(item.createdAt),
        sentAt: item.sentAt ? new Date(item.sentAt) : undefined
      });
    });
  }
} catch (err) {
  // Silent fallback initialization
}

function persistLocalQueue() {
  try {
    const items = Array.from(memoryQueue.values());
    fs.writeFileSync(localQueueFile, JSON.stringify(items, null, 2));
  } catch (err) {
    // Ignore file write error
  }
}

/**
 * Insert new outgoing message into MongoDB collection whatsapp_queue with status: 'pending'
 */
export async function createQueueItem(data: {
  recipient?: string;
  to?: string;
  message?: string;
  text?: string;
  mediaUrl?: string;
  options?: any;
  priority?: number;
  type?: string;
  idempotencyKey?: string;
  attempts?: number;
  status?: 'pending' | 'processing' | 'sent' | 'failed' | 'retrying';
}): Promise<{ _id: string; recipient: string; message: string; mediaUrl?: string; status: string; [key: string]: any }> {
  const isMongoConnected = mongoose.connection.readyState === 1;

  const targetRecipient = String(data.recipient || data.to || '').trim();
  const targetMessage = String(data.message || data.text || '');
  const targetMediaUrl = data.mediaUrl || data.options?.imageUrl || data.options?.documentUrl || data.options?.videoUrl || undefined;
  const targetPriority = typeof data.priority === 'number' ? data.priority : 3;
  const targetType = data.type || 'single';
  const targetStatus = data.status || 'pending';

  if (isMongoConnected) {
    try {
      const doc = await WhatsAppQueue.create({
        recipient: targetRecipient,
        to: targetRecipient,
        message: targetMessage,
        text: targetMessage,
        mediaUrl: targetMediaUrl,
        options: data.options || {},
        priority: targetPriority,
        type: targetType,
        idempotencyKey: data.idempotencyKey,
        status: targetStatus,
        attempts: 0,
        createdAt: new Date()
      });
      return {
        ...doc.toObject(),
        _id: doc._id.toString()
      };
    } catch (err) {
      console.warn('[WhatsAppQueue] Mongoose create failed, falling back to local store:', err);
    }
  }

  // Fallback to local store with valid ObjectId
  const fakeId = new mongoose.Types.ObjectId().toString();
  const item = {
    _id: fakeId,
    recipient: targetRecipient,
    to: targetRecipient,
    message: targetMessage,
    text: targetMessage,
    mediaUrl: targetMediaUrl,
    options: data.options || {},
    priority: targetPriority,
    type: targetType,
    idempotencyKey: data.idempotencyKey,
    status: targetStatus,
    attempts: 0,
    createdAt: new Date()
  };

  memoryQueue.set(fakeId, item);
  persistLocalQueue();
  return item;
}

/**
 * Fetch the next pending/retrying message, sorted by priority and oldest createdAt
 */
export async function fetchNextPendingItem(): Promise<any | null> {
  const isMongoConnected = mongoose.connection.readyState === 1;
  const now = new Date();

  if (isMongoConnected) {
    try {
      const item = await WhatsAppQueue.findOneAndUpdate(
        { 
          status: { $in: ['pending', 'retrying'] },
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: null },
            { nextAttemptAt: { $lte: now } }
          ]
        },
        { 
          $set: { 
            status: 'processing', 
            startedAt: new Date() 
          }, 
          $inc: { attempts: 1 } 
        },
        { sort: { priority: 1, createdAt: 1 }, new: true }
      );
      if (item) {
        return item.toObject();
      }
    } catch (err) {
      console.warn('[WhatsAppQueue] Mongoose fetchNextPendingItem error:', err);
    }
  }

  // Local fallback
  const nowMs = Date.now();
  const pendingItems = Array.from(memoryQueue.values())
    .filter(i => {
      if (i.status !== 'pending' && i.status !== 'retrying') return false;
      if (i.nextAttemptAt && new Date(i.nextAttemptAt).getTime() > nowMs) return false;
      return true;
    })
    .sort((a, b) => {
      const pA = typeof a.priority === 'number' ? a.priority : 3;
      const pB = typeof b.priority === 'number' ? b.priority : 3;
      if (pA !== pB) return pA - pB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  if (pendingItems.length === 0) return null;

  const next = pendingItems[0];
  next.status = 'processing';
  next.attempts = (next.attempts || 0) + 1;
  next.startedAt = new Date();
  memoryQueue.set(next._id, next);
  persistLocalQueue();
  return next;
}

/**
 * Update queue item status and metadata
 */
export async function updateQueueItem(
  id: string,
  updates: {
    status?: 'pending' | 'processing' | 'sent' | 'failed' | 'retrying';
    sentAt?: Date;
    error?: string;
    attempts?: number;
    waMessageId?: string;
    nextAttemptAt?: Date;
    [key: string]: any;
  }
): Promise<void> {
  const isMongoConnected = mongoose.connection.readyState === 1;

  if (isMongoConnected) {
    try {
      await WhatsAppQueue.findByIdAndUpdate(id, { $set: updates });
    } catch (err) {
      console.warn('[WhatsAppQueue] Mongoose updateQueueItem error:', err);
    }
  }

  // Local fallback update
  const localItem = memoryQueue.get(String(id));
  if (localItem) {
    Object.assign(localItem, updates);
    memoryQueue.set(String(id), localItem);
    persistLocalQueue();
  }
}

/**
 * Update queue item by waMessageId (e.g. status receipts: delivered, read)
 */
export async function updateQueueItemByWaMessageId(
  waMessageId: string,
  updates: {
    status?: 'pending' | 'processing' | 'sent' | 'failed' | 'retrying' | 'delivered' | 'read';
    deliveredAt?: Date | string;
    readAt?: Date | string;
    [key: string]: any;
  }
): Promise<void> {
  if (!waMessageId) return;
  const isMongoConnected = mongoose.connection.readyState === 1;

  if (isMongoConnected) {
    try {
      await WhatsAppQueue.updateMany({ waMessageId }, { $set: updates });
    } catch (err) {
      console.warn('[WhatsAppQueue] updateQueueItemByWaMessageId error:', err);
    }
  }

  for (const item of memoryQueue.values()) {
    if (item.waMessageId === waMessageId) {
      Object.assign(item, updates);
    }
  }
  persistLocalQueue();
}

/**
 * Reset any items that were left in 'processing' state during server restarts
 */
export async function resetStalledItems(): Promise<void> {
  const isMongoConnected = mongoose.connection.readyState === 1;
  if (isMongoConnected) {
    try {
      await WhatsAppQueue.updateMany(
        { status: 'processing' },
        { $set: { status: 'pending' } }
      );
    } catch (_) {}
  }

  for (const item of memoryQueue.values()) {
    if (item.status === 'processing') {
      item.status = 'pending';
    }
  }
  persistLocalQueue();
}

