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

// Local persistent fallback for sessions and OTPs when MongoDB is offline or not configured
const localDataDir = path.join(process.cwd(), '.local_db');
const localSessionFile = path.join(localDataDir, 'sessions.json');
const localOtpFile = path.join(localDataDir, 'otps.json');

const memorySessions = new Map<string, AuthSession>();
const memoryOtps = new Map<string, OtpRecord>();

// Ensure local directory exists
try {
  if (!fs.existsSync(localDataDir)) {
    fs.mkdirSync(localDataDir, { recursive: true });
  }
  if (fs.existsSync(localSessionFile)) {
    const raw = fs.readFileSync(localSessionFile, 'utf-8');
    const list: AuthSession[] = JSON.parse(raw);
    const now = Date.now();
    list.forEach(s => {
      if (new Date(s.expiresAt).getTime() > now) {
        memorySessions.set(s.token, s);
      }
    });
  }
} catch (e) {
  // Silent fallback
}

function persistLocalSessions() {
  try {
    const active = Array.from(memorySessions.values()).filter(
      s => new Date(s.expiresAt).getTime() > Date.now()
    );
    fs.writeFileSync(localSessionFile, JSON.stringify(active, null, 2));
  } catch (e) {}
}

let mongoFailedUntil = 0;

export async function getMongoDb(): Promise<Db | null> {
  if (mongoDb) return mongoDb;
  if (Date.now() < mongoFailedUntil) return null;

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!mongoUri) {
    return null;
  }

  try {
    const client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 800,
      connectTimeoutMS: 800,
    });
    await client.connect();
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

    console.log('[MongoDB] Connected successfully to auth_sessions store.');
    return mongoDb;
  } catch (err: any) {
    // Graceful fallback to local in-memory/json store - prevent retry for 2 minutes
    mongoFailedUntil = Date.now() + 120000;
    return null;
  }
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
