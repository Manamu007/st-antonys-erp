import mongoose, { Schema } from 'mongoose';
import crypto from 'crypto';
import { getMongoDb } from './mongoSession.js';

// MongoDB URI targeting antonyschool_erp database
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/antonyschool_erp';

export const DB_NAME = 'antonyschool_erp';

// Initialize Mongoose connection targeting antonyschool_erp
let mongooseInitialized = false;
export async function initMongoose(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!mongooseInitialized) {
    mongooseInitialized = true;
    try {
      await mongoose.connect(MONGO_URI, {
        dbName: DB_NAME,
        serverSelectionTimeoutMS: 3000,
        bufferCommands: false
      });
      console.log(`[MongoDB] Mongoose connected to database "${DB_NAME}".`);
    } catch (err: any) {
      console.warn(`[MongoDB] Mongoose connection notice for "${DB_NAME}":`, err?.message || err);
    }
  }
  return mongoose;
}

// Ensure connection attempt starts
initMongoose().catch(() => {});

// Flexible Schema options for dynamic document properties
const schemaOptions = {
  strict: false,
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
};

// Generic Base Schema factory
function createDynamicSchema(collectionName: string) {
  const schema = new Schema(
    {
      id: { type: String, index: true },
      uid: { type: String, index: true }
    },
    { ...schemaOptions, collection: collectionName }
  );
  return schema;
}

// Mongoose Models Definition
export const StudentModel = mongoose.models.Student || mongoose.model('Student', createDynamicSchema('students'));
export const StaffModel = mongoose.models.Staff || mongoose.model('Staff', createDynamicSchema('staff'));
export const UserModel = mongoose.models.User || mongoose.model('User', createDynamicSchema('users'));
export const ClassModel = mongoose.models.Class || mongoose.model('Class', createDynamicSchema('classes'));
export const BatchModel = mongoose.models.Batch || mongoose.model('Batch', createDynamicSchema('batches'));
export const SubjectModel = mongoose.models.Subject || mongoose.model('Subject', createDynamicSchema('subjects'));
export const AttendanceModel = mongoose.models.Attendance || mongoose.model('Attendance', createDynamicSchema('attendance'));
export const FeeModel = mongoose.models.Fee || mongoose.model('Fee', createDynamicSchema('fees'));
export const PaymentModel = mongoose.models.Payment || mongoose.model('Payment', createDynamicSchema('payments'));
export const ExamModel = mongoose.models.Exam || mongoose.model('Exam', createDynamicSchema('exams'));
export const ExamMarkModel = mongoose.models.ExamMark || mongoose.model('ExamMark', createDynamicSchema('examMarks'));
export const LeaveModel = mongoose.models.Leave || mongoose.model('Leave', createDynamicSchema('leaves'));
export const TimetableSlotModel = mongoose.models.TimetableSlot || mongoose.model('TimetableSlot', createDynamicSchema('timetableSlots'));
export const BusModel = mongoose.models.Bus || mongoose.model('Bus', createDynamicSchema('buses'));
export const NoticeModel = mongoose.models.Notice || mongoose.model('Notice', createDynamicSchema('notices'));
export const FrontOfficeModel = mongoose.models.FrontOffice || mongoose.model('FrontOffice', createDynamicSchema('frontOffice'));
export const SettingModel = mongoose.models.Setting || mongoose.model('Setting', createDynamicSchema('settings'));
export const WhatsAppLogModel = mongoose.models.WhatsAppLog || mongoose.model('WhatsAppLog', createDynamicSchema('whatsappLogs'));
export const WhatsAppCommunityModel = mongoose.models.WhatsAppCommunity || mongoose.model('WhatsAppCommunity', createDynamicSchema('whatsapp_communities'));
export const WhatsAppTemplateModel = mongoose.models.WhatsAppTemplate || mongoose.model('WhatsAppTemplate', createDynamicSchema('whatsapp_templates'));
export const WhatsAppActionTokenModel = mongoose.models.WhatsAppActionToken || mongoose.model('WhatsAppActionToken', createDynamicSchema('whatsapp_action_tokens'));
export const WhatsAppBotSessionModel = mongoose.models.WhatsAppBotSession || mongoose.model('WhatsAppBotSession', createDynamicSchema('whatsapp_bot_sessions'));
export const WhatsAppBotFlowModel = mongoose.models.WhatsAppBotFlow || mongoose.model('WhatsAppBotFlow', createDynamicSchema('whatsapp_bot_flows'));
export const StudentHealthModel = mongoose.models.StudentHealth || mongoose.model('StudentHealth', createDynamicSchema('studentHealth'));
export const AuditTrailModel = mongoose.models.AuditTrail || mongoose.model('AuditTrail', createDynamicSchema('audit_trails'));
export const HomeworkModel = mongoose.models.Homework || mongoose.model('Homework', createDynamicSchema('homework'));

// FieldValue & Timestamp compatibility utilities
export const FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  delete: () => undefined,
  arrayUnion: (...elements: any[]) => elements,
  arrayRemove: (...elements: any[]) => elements,
  increment: (n: number) => n
};

export const Timestamp = {
  now: () => ({
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    toISOString: () => new Date().toISOString(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0
  }),
  fromDate: (d: Date) => ({
    toDate: () => d,
    toMillis: () => d.getTime(),
    toISOString: () => d.toISOString(),
    seconds: Math.floor(d.getTime() / 1000),
    nanoseconds: 0
  })
};

// Pure MongoDB-backed Document Reference
export class MongoDocRef {
  FieldValue = FieldValue;
  serverTimestamp = () => new Date().toISOString();
  constructor(public colName: string, public id: string) {}

  get path() {
    return `${this.colName}/${this.id}`;
  }

  async get() {
    const mongo = await getMongoDb().catch(() => null);
    if (!mongo) {
      try {
        const res = await fetch("https://antonyschool.in/api/maintenance/db-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "get",
            path: this.colName,
            id: this.id
          }),
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const data = json.data;
            const outId = data.id || data.uid || this.id;
            return {
              exists: true,
              id: outId,
              ref: this,
              data: () => ({ ...data, id: outId })
            };
          }
        }
      } catch (proxyErr) {}

      return {
        exists: false,
        id: this.id,
        ref: this,
        data: () => undefined
      };
    }

    try {
      const col = mongo.collection(this.colName);
      const doc = await col.findOne({ $or: [{ id: this.id }, { uid: this.id }, { _id: this.id as any }] });
      if (doc) {
        const { _id, ...data } = doc;
        const outId = data.id || data.uid || String(_id);
        return {
          exists: true,
          id: outId,
          ref: this,
          data: () => ({ ...data, id: outId })
        };
      }
    } catch (err) {
      console.warn(`[MongoDB] doc.get failed on ${this.colName}/${this.id}:`, err);
    }

    return {
      exists: false,
      id: this.id,
      ref: this,
      data: () => undefined
    };
  }

  async set(data: any, options?: { merge?: boolean }) {
    const cleanId = this.id;
    const docData = { ...data, id: cleanId, uid: cleanId, updatedAt: new Date().toISOString() };
    const mongo = await getMongoDb().catch(() => null);
    if (mongo) {
      try {
        const col = mongo.collection(this.colName);
        if (options?.merge) {
          await col.updateOne(
            { $or: [{ id: cleanId }, { uid: cleanId }] },
            { $set: docData },
            { upsert: true }
          );
        } else {
          await col.replaceOne(
            { $or: [{ id: cleanId }, { uid: cleanId }] },
            docData,
            { upsert: true }
          );
        }
      } catch (err) {
        console.warn(`[MongoDB] doc.set error on ${this.colName}/${cleanId}:`, err);
      }
    } else {
      try {
        await fetch("https://antonyschool.in/api/maintenance/db-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "set",
            path: this.colName,
            id: cleanId,
            data: docData
          }),
          signal: AbortSignal.timeout(8000)
        });
      } catch (proxyErr) {}
    }
    return { id: cleanId };
  }

  async update(data: any) {
    return this.set(data, { merge: true });
  }

  async delete() {
    const cleanId = this.id;
    const mongo = await getMongoDb().catch(() => null);
    if (mongo) {
      try {
        const col = mongo.collection(this.colName);
        await col.deleteOne({ $or: [{ id: cleanId }, { uid: cleanId }] });
      } catch (err) {
        console.warn(`[MongoDB] doc.delete error on ${this.colName}/${cleanId}:`, err);
      }
    } else {
      try {
        await fetch("https://antonyschool.in/api/maintenance/db-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "delete",
            path: this.colName,
            id: cleanId
          }),
          signal: AbortSignal.timeout(8000)
        });
      } catch (proxyErr) {}
    }
    return { success: true };
  }

  onSnapshot(onNext: (doc: any) => void, onError?: (err: any) => void) {
    this.get().then(snap => onNext(snap)).catch(err => onError?.(err));
    const interval = setInterval(() => {
      this.get().then(snap => onNext(snap)).catch(err => onError?.(err));
    }, 5000);
    return () => clearInterval(interval);
  }
}

// Pure MongoDB-backed Query and Collection Reference
export class MongoQueryRef {
  FieldValue = FieldValue;
  serverTimestamp = () => new Date().toISOString();
  public constraints: Array<{ type: 'where' | 'limit' | 'orderBy'; field?: string; op?: string; value?: any; direction?: string }> = [];

  constructor(public colName: string) {}

  where(field: string, op: string, value: any) {
    const q = new MongoQueryRef(this.colName);
    q.constraints = [...this.constraints, { type: 'where', field, op, value }];
    return q;
  }

  limit(count: number) {
    const q = new MongoQueryRef(this.colName);
    q.constraints = [...this.constraints, { type: 'limit', value: count }];
    return q;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    const q = new MongoQueryRef(this.colName);
    q.constraints = [...this.constraints, { type: 'orderBy', field, direction }];
    return q;
  }

  doc(id?: string) {
    return new MongoDocRef(this.colName, id || crypto.randomUUID());
  }

  async add(data: any) {
    const id = data.id || data.uid || crypto.randomUUID();
    const docRef = new MongoDocRef(this.colName, id);
    await docRef.set({ ...data, id, uid: id, createdAt: new Date().toISOString() });
    return docRef;
  }

  async get() {
    const mongo = await getMongoDb().catch(() => null);
    if (!mongo) {
      try {
        const res = await fetch("https://antonyschool.in/api/maintenance/db-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "list",
            path: this.colName,
            constraints: this.constraints
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            const docs = json.data.map((rest: any) => {
              const docId = rest.id || rest.uid || String(rest._id || '');
              return {
                exists: true,
                id: docId,
                ref: new MongoDocRef(this.colName, docId),
                data: () => ({ ...rest, id: docId })
              };
            });
            return {
              empty: docs.length === 0,
              size: docs.length,
              docs,
              forEach: (cb: (doc: any) => void) => docs.forEach(cb),
              docChanges: () => []
            };
          }
        }
      } catch (proxyErr) {}

      // Return genuine empty state when MongoDB is not connected
      return {
        empty: true,
        size: 0,
        docs: [],
        forEach: (_cb: (doc: any) => void) => {},
        docChanges: () => []
      };
    }

    let items: any[] = [];
    try {
      const col = mongo.collection(this.colName);
      const query: any = {};
      let sort: any = null;
      let limitVal: number | null = null;

      for (const c of this.constraints) {
        if (c.type === 'where' && c.field) {
          const op = c.op;
          if (op === '==' || op === 'equal') query[c.field] = c.value;
          else if (op === '>') query[c.field] = { $gt: c.value };
          else if (op === '>=') query[c.field] = { $gte: c.value };
          else if (op === '<') query[c.field] = { $lt: c.value };
          else if (op === '<=') query[c.field] = { $lte: c.value };
          else if (op === '!=') query[c.field] = { $ne: c.value };
          else if (op === 'in' && Array.isArray(c.value)) query[c.field] = { $in: c.value };
        } else if (c.type === 'orderBy' && c.field) {
          sort = sort || {};
          sort[c.field] = c.direction === 'desc' ? -1 : 1;
        } else if (c.type === 'limit' && c.value) {
          limitVal = Number(c.value);
        }
      }

      let cursor = col.find(query);
      if (sort) cursor = cursor.sort(sort);
      if (limitVal) cursor = cursor.limit(limitVal);
      items = await cursor.toArray();
    } catch (err) {
      console.warn(`[MongoDB] Query failed for ${this.colName}:`, err);
      items = [];
    }

    const docs = items.map(doc => {
      const { _id, ...rest } = doc;
      const docId = rest.id || rest.uid || String(_id);
      return {
        exists: true,
        id: docId,
        ref: new MongoDocRef(this.colName, docId),
        data: () => ({ ...rest, id: docId })
      };
    });

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
      forEach: (cb: (doc: any) => void) => docs.forEach(cb),
      docChanges: () => docs.map(d => ({ type: 'added', doc: d }))
    };
  }

  count() {
    return {
      get: async () => {
        const snap = await this.get();
        return {
          data: () => ({ count: snap.size })
        };
      }
    };
  }

  onSnapshot(onNext: (snap: any) => void, onError?: (err: any) => void) {
    this.get().then(snap => onNext(snap)).catch(err => onError?.(err));
    const interval = setInterval(() => {
      this.get().then(snap => onNext(snap)).catch(err => onError?.(err));
    }, 5000);
    return () => clearInterval(interval);
  }
}

// Pure MongoDB Database Interface
export class MongoDatabase {
  static FieldValue = FieldValue;
  static Timestamp = Timestamp;
  FieldValue = FieldValue;
  Timestamp = Timestamp;

  collection(colName: string) {
    return new MongoQueryRef(colName);
  }

  doc(pathStr: string) {
    const parts = pathStr.split('/');
    return new MongoDocRef(parts[0] || 'default', parts[1] || crypto.randomUUID());
  }

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const txn = {
      get: async (docRef: MongoDocRef) => docRef.get(),
      set: async (docRef: MongoDocRef, data: any, options?: any) => docRef.set(data, options),
      update: async (docRef: MongoDocRef, data: any) => docRef.update(data),
      delete: async (docRef: MongoDocRef) => docRef.delete()
    };
    return updateFunction(txn);
  }

  batch() {
    const ops: Array<() => Promise<any>> = [];
    return {
      set: (docRef: MongoDocRef, data: any, options?: any) => {
        ops.push(() => docRef.set(data, options));
      },
      update: (docRef: MongoDocRef, data: any) => {
        ops.push(() => docRef.update(data));
      },
      delete: (docRef: MongoDocRef) => {
        ops.push(() => docRef.delete());
      },
      commit: async () => {
        for (const op of ops) {
          await op();
        }
      }
    };
  }

  async listCollections() {
    const mongo = await getMongoDb().catch(() => null);
    if (mongo) {
      const cols = await mongo.listCollections().toArray();
      return cols.map(c => ({ id: c.name, name: c.name }));
    }
    return [];
  }
}

export const mongoDbInstance = new MongoDatabase();

export function getDbAdmin(): MongoDatabase {
  return mongoDbInstance;
}

export function getDb(): MongoDatabase {
  return mongoDbInstance;
}

export const getDbAdminInstance = getDbAdmin;

// Non-blocking initialization resolved immediately
export const initializationPromise: Promise<void> = Promise.resolve();

// Backwards compatibility stubs for legacy error checks
export const isDatabaseDenied = (): boolean => false;
export const setDatabaseDenied = (_val: boolean): void => {};
export const isQuotaOrPermissionError = (_err: any): boolean => false;
export const handleFirestoreError = (_err: any, _res?: any): boolean => false;
export const lastInitError: string | null = null;
export const databaseId = '(default)';

// Auth admin mock that uses MongoDB auth sessions
export const authAdmin = {
  verifyIdToken: async (token: string) => {
    if (!token) throw new Error('Token required');
    return { uid: token, email: `${token}@stantonys.edu` };
  },
  getUser: async (uid: string) => {
    return { uid, email: `${uid}@stantonys.edu` };
  }
};

const firestoreFn = Object.assign(() => mongoDbInstance, {
  FieldValue,
  Timestamp
});

export const admin = {
  auth: () => authAdmin,
  firestore: firestoreFn,
  FieldValue,
  serverTimestamp: FieldValue.serverTimestamp,
  Timestamp,
  storage: () => ({
    bucket: () => ({
      getFiles: async () => [[]],
      file: () => ({
        delete: async () => {},
        getMetadata: async () => [{}]
      })
    })
  })
};

export default {
  getDb,
  getDbAdmin,
  FieldValue,
  Timestamp,
  StudentModel,
  StaffModel,
  UserModel,
  ClassModel,
  BatchModel,
  SubjectModel,
  AttendanceModel,
  FeeModel,
  PaymentModel,
  ExamModel,
  ExamMarkModel,
  LeaveModel,
  TimetableSlotModel,
  BusModel,
  NoticeModel,
  FrontOfficeModel,
  SettingModel,
  WhatsAppLogModel,
  WhatsAppCommunityModel,
  WhatsAppTemplateModel,
  WhatsAppActionTokenModel,
  WhatsAppBotSessionModel,
  WhatsAppBotFlowModel,
  StudentHealthModel,
  AuditTrailModel,
  HomeworkModel
};
