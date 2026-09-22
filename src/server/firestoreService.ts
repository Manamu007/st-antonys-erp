import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  query,
  where as firestoreWhere,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  QueryConstraint
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let dbInstance: any = null;
let isInitialized = false;

// Simple in-memory cache for queries to ensure sub-5ms responses and avoid hitting rate limits
interface CacheEntry {
  data: any;
  timestamp: number;
}
const queryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20000; // 20 seconds

export function invalidateCollectionCache(colPath: string) {
  for (const key of queryCache.keys()) {
    if (key.startsWith(`${colPath}:`)) {
      queryCache.delete(key);
    }
  }
}

export function getFirestoreDb() {
  if (dbInstance) return dbInstance;
  if (isInitialized) return null;

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.warn('[FirestoreService] firebase-applet-config.json not found');
      return null;
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    // Explicitly use the default database '(default)'
    dbInstance = getFirestore(app);
    isInitialized = true;
    console.log('[FirestoreService] Successfully connected to Cloud Firestore (default database).');
    return dbInstance;
  } catch (err: any) {
    console.error('[FirestoreService] Initialization error:', err?.message || err);
    return null;
  }
}

function matchDocInMemory(item: any, constraint: any): boolean {
  if (!constraint || constraint.type !== 'where') return true;
  const { field, op, value } = constraint;
  const docVal = item[field];

  if (op === '==' || op === 'equal') {
    if (field === 'id' || field === 'uid') {
      return item.id === value || item.uid === value;
    }
    return docVal === value;
  }
  if (op === '!=') return docVal !== value;
  if (op === '>') return docVal > value;
  if (op === '>=') return docVal >= value;
  if (op === '<') return docVal < value;
  if (op === '<=') return docVal <= value;
  if (op === 'in' && Array.isArray(value)) return value.includes(docVal);
  if (op === 'array-contains') return Array.isArray(docVal) && docVal.includes(value);
  return true;
}

export async function listDocuments(colPath: string, constraints: any[] = []): Promise<any[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const cacheKey = `${colPath}:list:${JSON.stringify(constraints)}`;
  const cached = queryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const colRef = collection(db, colPath);
  let limitNum: number | null = null;
  let sortField: string | null = null;
  let sortDir: 'asc' | 'desc' = 'asc';

  // 1. Try standard Firestore Query with all compatible constraints
  try {
    const firestoreConstraints: QueryConstraint[] = [];
    for (const c of constraints) {
      if (!c) continue;
      if (c.type === 'where') {
        let op = c.op;
        if (op === 'equal') op = '==';
        if (['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'].includes(op)) {
          firestoreConstraints.push(firestoreWhere(c.field, op as any, c.value));
        }
      } else if (c.type === 'limit') {
        limitNum = Number(c.value);
        if (limitNum > 0) {
          // Cloud Firestore limits structured queries to a maximum of 10,000 documents
          const safeLimit = Math.min(limitNum, 10000);
          firestoreConstraints.push(firestoreLimit(safeLimit));
        }
      } else if (c.type === 'orderBy') {
        sortField = c.field;
        sortDir = c.direction === 'desc' ? 'desc' : 'asc';
        firestoreConstraints.push(firestoreOrderBy(sortField, sortDir));
      }
    }

    const q = query(colRef, ...firestoreConstraints);
    const snap = await getDocs(q);
    const results: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      results.push({
        id: d.id,
        uid: data.uid || d.id,
        ...data
      });
    });

    queryCache.set(cacheKey, { data: results, timestamp: Date.now() });
    return results;
  } catch (err: any) {
    // 2. Graceful Fallback if query failed (e.g. index error or composite order-by error)
    console.warn(`[FirestoreService] Query on ${colPath} failed (${err?.message}), falling back to in-memory filter:`);
    try {
      // Run with just equality where filters or entire collection
      const equalityConstraints: QueryConstraint[] = [];
      const whereFilters: any[] = [];

      for (const c of constraints) {
        if (!c) continue;
        if (c.type === 'where') {
          whereFilters.push(c);
          if (c.op === '==' || c.op === 'equal') {
            equalityConstraints.push(firestoreWhere(c.field, '==', c.value));
          }
        }
      }

      const safeFallbackLimit = Math.min(limitNum || 10000, 10000);
      let fallbackQuery = equalityConstraints.length > 0
        ? query(colRef, ...equalityConstraints, firestoreLimit(safeFallbackLimit))
        : query(colRef, firestoreLimit(Math.min(safeFallbackLimit, 2500)));
      const snap = await getDocs(fallbackQuery).catch(async () => getDocs(colRef));

      let results: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const item = { id: d.id, uid: data.uid || d.id, ...data };
        let match = true;
        for (const wf of whereFilters) {
          if (!matchDocInMemory(item, wf)) {
            match = false;
            break;
          }
        }
        if (match) {
          results.push(item);
        }
      });

      if (sortField) {
        results.sort((a, b) => {
          const vA = a[sortField!] ?? '';
          const vB = b[sortField!] ?? '';
          const cmp = typeof vA === 'number' && typeof vB === 'number' ? vA - vB : String(vA).localeCompare(String(vB));
          return sortDir === 'desc' ? -cmp : cmp;
        });
      }

      if (limitNum && limitNum > 0) {
        results = results.slice(0, limitNum);
      }

      queryCache.set(cacheKey, { data: results, timestamp: Date.now() });
      return results;
    } catch (fallbackErr) {
      console.error(`[FirestoreService] Fallback query failed on ${colPath}:`, fallbackErr);
      return [];
    }
  }
}

export async function getDocument(colPath: string, id: string): Promise<any | null> {
  const db = getFirestoreDb();
  if (!db || !id) return null;

  try {
    const docRef = doc(db, colPath, String(id));
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data();
    return {
      id: snap.id,
      uid: data.uid || snap.id,
      ...data
    };
  } catch (err) {
    console.error(`[FirestoreService] getDocument error (${colPath}/${id}):`, err);
    return null;
  }
}

export async function countDocuments(colPath: string, constraints: any[] = []): Promise<number> {
  const docs = await listDocuments(colPath, constraints);
  return docs.length;
}

export async function setDocument(colPath: string, id: string, data: any, options: { merge?: boolean } = { merge: true }): Promise<{ id: string }> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');

  const docId = String(id || data.id || data.uid);
  const docRef = doc(db, colPath, docId);
  const cleaned = {
    ...data,
    id: docId,
    uid: data.uid || docId,
    updatedAt: new Date().toISOString()
  };

  await setDoc(docRef, cleaned, options);
  invalidateCollectionCache(colPath);
  return { id: docId };
}

export async function addDocument(colPath: string, data: any): Promise<{ id: string }> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');

  const colRef = collection(db, colPath);
  const docRef = await addDoc(colRef, {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const docId = docRef.id;
  await setDoc(docRef, { id: docId, uid: docId }, { merge: true });
  invalidateCollectionCache(colPath);
  return { id: docId };
}

export async function updateDocument(colPath: string, id: string, data: any): Promise<{ id: string }> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');

  const docId = String(id);
  const docRef = doc(db, colPath, docId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: new Date().toISOString()
  });
  invalidateCollectionCache(colPath);
  return { id: docId };
}

export async function deleteDocument(colPath: string, id: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');

  const docId = String(id);
  const docRef = doc(db, colPath, docId);
  await deleteDoc(docRef);
  invalidateCollectionCache(colPath);
  return true;
}

export async function deleteBatchDocuments(colPath: string, ids: string[]): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');

  const batch = writeBatch(db);
  for (const id of ids) {
    if (id) {
      const docRef = doc(db, colPath, String(id));
      batch.delete(docRef);
    }
  }
  await batch.commit();
  invalidateCollectionCache(colPath);
  return true;
}

export async function setBatchDocuments(colPath: string, items: Array<{ id: string; data: any }>): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not initialized');

  const batch = writeBatch(db);
  for (const item of items) {
    if (item && item.id && item.data) {
      const docId = String(item.id);
      const docRef = doc(db, colPath, docId);
      const cleaned = {
        ...item.data,
        id: docId,
        uid: item.data.uid || docId,
        updatedAt: new Date().toISOString()
      };
      batch.set(docRef, cleaned, { merge: true });
    }
  }
  await batch.commit();
  invalidateCollectionCache(colPath);
  return true;
}

export async function updateBatchDocuments(colPath: string, items: Array<{ id: string; data: any }>): Promise<boolean> {
  return setBatchDocuments(colPath, items);
}
