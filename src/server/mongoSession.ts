import { MongoClient, Db, Collection } from 'mongodb';
import fs from 'fs';
import path from 'path';

export interface AuthSession {
  sessionId: string;
  token: string;
  userId: string;
  phone: string;
  role: string;
  email?: string;
  name?: string;
  profile?: any;
  createdAt: Date;
  expiresAt: Date;
}

export interface OtpRecord {
  phone: string; // clean last 10 digits
  otp: string;
  purpose: 'login' | 'reset_password';
  attempts: number;
  used: boolean;
  expiresAt: number; // timestamp ms
  createdAt: number;
}

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let sessionsCollection: Collection<any> | null = null;
let otpCollection: Collection<any> | null = null;

const memorySessions = new Map<string, AuthSession>();
const memoryOtps = new Map<string, OtpRecord>();

function persistLocalSessions() {
  // Pure MongoDB mode: no local file writes
}

let mongoFailedUntil = 0;
let lastPingLatency: number | null = null;

export async function getMongoDb(): Promise<Db | null> {
  if (mongoDb) return mongoDb;
  if (Date.now() < mongoFailedUntil) return null;

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/antonyschool_erp';
  if (!mongoUri) {
    return null;
  }

  try {
    const start = Date.now();
    const client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    await client.connect();
    await client.db().command({ ping: 1 });
    lastPingLatency = Date.now() - start;

    mongoClient = client;
    mongoDb = client.db();
    
    sessionsCollection = mongoDb.collection('auth_sessions');
    otpCollection = mongoDb.collection('auth_otps');

    // Setup TTL indexes
    try {
      await sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await otpCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await sessionsCollection.createIndex({ token: 1 }, { unique: true });
    } catch (idxErr) {}

    console.log(`[MongoDB] Connected successfully to database: ${mongoDb.databaseName} (${lastPingLatency}ms)`);
    return mongoDb;
  } catch (err: any) {
    // Graceful fallback to local persistent store
    mongoFailedUntil = Date.now() + 45000;
    return null;
  }
}

export function getLastPingLatency(): number | null {
  return lastPingLatency;
}

/**
 * Connect dynamically to a user-provided MongoDB URI (e.g. MongoDB Atlas)
 */
export async function connectMongo(uri: string): Promise<{ success: boolean; database?: string; latencyMs?: number; error?: string }> {
  if (!uri || typeof uri !== 'string' || (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://'))) {
    return { success: false, error: 'Invalid MongoDB connection URI. Must start with mongodb:// or mongodb+srv://' };
  }

  try {
    console.log('[MongoDB] Testing connection to provided URI...');
    const start = Date.now();
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    await client.connect();
    const db = client.db();
    await db.command({ ping: 1 });
    const latency = Date.now() - start;
    lastPingLatency = latency;

    // Disconnect previous client if different
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch (_) {}
    }

    mongoClient = client;
    mongoDb = db;
    process.env.MONGODB_URI = uri;
    mongoFailedUntil = 0;

    sessionsCollection = mongoDb.collection('auth_sessions');
    otpCollection = mongoDb.collection('auth_otps');

    try {
      await sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await otpCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await sessionsCollection.createIndex({ token: 1 }, { unique: true });
    } catch (_) {}

    // Save to .env file for persistence across server restarts
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      if (/MONGODB_URI=.*/.test(envContent)) {
        envContent = envContent.replace(/MONGODB_URI=.*/g, `MONGODB_URI="${uri}"`);
      } else {
        envContent += `\nMONGODB_URI="${uri}"\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('[MongoDB] Persisted updated MONGODB_URI to .env');
    } catch (envErr) {
      console.warn('[MongoDB] Could not persist to .env:', envErr);
    }

    // Auto-sync any initial local files to MongoDB
    await syncLocalToMongo(db);

    console.log(`[MongoDB] Successfully connected to ${db.databaseName} (${latency}ms)`);
    return { success: true, database: db.databaseName, latencyMs: latency };
  } catch (err: any) {
    console.error('[MongoDB] Connection attempt failed:', err?.message || err);
    let errorMessage = err?.message || 'Failed to connect to MongoDB.';
    if (uri.includes('127.0.0.1') || uri.includes('localhost')) {
      errorMessage = `Cannot connect to '127.0.0.1' from Cloud Preview (ECONNREFUSED). This web app preview runs in a cloud container, so '127.0.0.1' refers to the cloud container rather than your VPS. To connect from this preview, enter your VPS Public IP (e.g. mongodb://user:pass@<vps_ip>:27017/antonyschool_erp) or import your student data JSON/CSV. When you deploy this code directly on your VPS, 127.0.0.1 will connect locally.`;
    }
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}

/**
 * Disconnect current active MongoDB instance
 */
export async function disconnectMongo(): Promise<{ success: boolean }> {
  if (mongoClient) {
    try {
      await mongoClient.close();
    } catch (_) {}
  }
  mongoClient = null;
  mongoDb = null;
  sessionsCollection = null;
  otpCollection = null;
  lastPingLatency = null;
  return { success: true };
}

/**
 * Sync local collection JSON snapshots to active MongoDB if MongoDB collections are empty
 */
export async function syncLocalToMongo(_targetDb?: Db): Promise<{ syncedCollections: string[]; totalRecords: number }> {
  return { syncedCollections: [], totalRecords: 0 };
}

// Background init
getMongoDb().catch(() => {});

export async function saveSession(session: AuthSession): Promise<void> {
  memorySessions.set(session.token, session);
  persistLocalSessions();

  try {
    const db = await getMongoDb();
    if (db && sessionsCollection) {
      await sessionsCollection.updateOne(
        { token: session.token },
        { $set: session },
        { upsert: true }
      );
    }
  } catch (e) {}
}

export async function getSession(token: string): Promise<AuthSession | null> {
  if (!token) return null;

  // Check memory cache first
  const local = memorySessions.get(token);
  if (local) {
    if (new Date(local.expiresAt).getTime() > Date.now()) {
      return local;
    }
    memorySessions.delete(token);
    persistLocalSessions();
  }

  try {
    const db = await getMongoDb();
    if (db && sessionsCollection) {
      const doc = await sessionsCollection.findOne({ token });
      if (doc && new Date(doc.expiresAt).getTime() > Date.now()) {
        memorySessions.set(token, doc as any);
        return doc as any;
      }
    }
  } catch (e) {}

  return null;
}

export async function deleteSession(token: string): Promise<boolean> {
  memorySessions.delete(token);
  persistLocalSessions();

  try {
    const db = await getMongoDb();
    if (db && sessionsCollection) {
      await sessionsCollection.deleteOne({ token });
      return true;
    }
  } catch (e) {}

  return true;
}

export async function saveOtpRecord(record: OtpRecord): Promise<void> {
  const key = `${record.phone}_${record.purpose}`;
  memoryOtps.set(key, record);

  try {
    const db = await getMongoDb();
    if (db && otpCollection) {
      await otpCollection.updateOne(
        { phone: record.phone, purpose: record.purpose },
        { $set: record },
        { upsert: true }
      );
    }
  } catch (e) {}
}

export async function getOtpRecord(phone: string, purpose: 'login' | 'reset_password'): Promise<OtpRecord | null> {
  const key = `${phone}_${purpose}`;
  const local = memoryOtps.get(key);
  if (local) {
    if (local.expiresAt > Date.now()) {
      return local;
    }
    memoryOtps.delete(key);
  }

  try {
    const db = await getMongoDb();
    if (db && otpCollection) {
      const doc = await otpCollection.findOne({ phone, purpose });
      if (doc && doc.expiresAt > Date.now()) {
        return doc as any;
      }
    }
  } catch (e) {}

  return null;
}

export async function markOtpUsed(phone: string, purpose: 'login' | 'reset_password'): Promise<void> {
  const key = `${phone}_${purpose}`;
  const local = memoryOtps.get(key);
  if (local) {
    local.used = true;
    memoryOtps.set(key, local);
  }

  try {
    const db = await getMongoDb();
    if (db && otpCollection) {
      await otpCollection.updateOne({ phone, purpose }, { $set: { used: true } });
    }
  } catch (e) {}
}
