import { getMongoDb } from './mongoSession.js';

// Simple in-memory cache for queries to ensure sub-5ms responses
interface CacheEntry {
  data: any;
  timestamp: number;
}
const queryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20000; // 20 seconds

// In-memory ring buffer for audit and activity tracking collections to prevent remote timeout errors
const telemetryStore = new Map<string, Map<string, any>>();

function isTelemetryOrLog(colPath: string): boolean {
  if (!colPath) return false;
  const p = colPath.toLowerCase();
  return (
    p === 'whatsapp_audit_logs' ||
    p === 'user_activities' ||
    p === 'audit_logs' ||
    p === 'audit_trails' ||
    p === 'login_logs' ||
    p === 'whatsapp_logs' ||
    p === 'activity_logs' ||
    p.includes('audit') ||
    p.includes('log') ||
    p.includes('activit')
  );
}

function recordTelemetry(colPath: string, docId: string, doc: any) {
  if (!telemetryStore.has(colPath)) {
    telemetryStore.set(colPath, new Map());
  }
  const store = telemetryStore.get(colPath)!;
  store.set(docId, doc);
  if (store.size > 200) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
}

export function invalidateCollectionCache(colPath: string) {
  for (const key of queryCache.keys()) {
    if (key.startsWith(`${colPath}:`)) {
      queryCache.delete(key);
    }
  }
}

async function forwardToLiveMongo(
  operation: string,
  colPath: string,
  payload: { id?: string; data?: any; constraints?: any[]; ids?: string[]; items?: any[] } = {}
): Promise<any> {
  const isProdVPS = (process.env.APP_URL || '').includes('antonyschool.in');
  if (isProdVPS) {
    if (operation === 'list') return [];
    if (operation === 'count') return 0;
    return null;
  }

  const isLogCol = isTelemetryOrLog(colPath);
  if (isLogCol) {
    if (operation === 'list') {
      if (telemetryStore.has(colPath)) return Array.from(telemetryStore.get(colPath)!.values());
      return [];
    }
    if (operation === 'count') {
      if (telemetryStore.has(colPath)) return telemetryStore.get(colPath)!.size;
      return 0;
    }
    if (operation === 'get' && payload.id) {
      if (telemetryStore.has(colPath)) return telemetryStore.get(colPath)!.get(payload.id) || null;
      return null;
    }
    return { success: true, id: payload.id || 'ok' };
  }

  const timeoutMs = 12000;

  try {
    const vpsRes = await fetch('https://antonyschool.in/api/maintenance/db-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        operation,
        path: colPath,
        ...payload
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (vpsRes.ok) {
      const vpsData = await vpsRes.json();
      if (operation === 'list') return Array.isArray(vpsData.data) ? vpsData.data : [];
      if (operation === 'count') return typeof vpsData.count === 'number' ? vpsData.count : (Array.isArray(vpsData.data) ? vpsData.data.length : 0);
      if (operation === 'get') return vpsData.data || null;
      return vpsData;
    }
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('abort') || String(err?.message || '').toLowerCase().includes('timeout');
    if (!isLogCol && !isAbort) {
      console.warn(`[MongoDocService] Live VPS proxy error for ${colPath} (${operation}):`, err?.message || err);
    }
  }

  if (operation === 'list') {
    if (isLogCol && telemetryStore.has(colPath)) {
      return Array.from(telemetryStore.get(colPath)!.values());
    }
    return [];
  }
  if (operation === 'count') {
    if (isLogCol && telemetryStore.has(colPath)) {
      return telemetryStore.get(colPath)!.size;
    }
    return 0;
  }
  if (operation === 'get' && payload.id && isLogCol && telemetryStore.has(colPath)) {
    return telemetryStore.get(colPath)!.get(payload.id) || null;
  }
  return null;
}

function buildMongoQuery(constraints: any[] = []): { filter: any; sort: any; limitVal: number | null } {
  const filter: any = {};
  let sort: any = null;
  let limitVal: number | null = null;

  for (const c of constraints) {
    if (!c) continue;
    if (c.type === 'where') {
      const op = c.op;
      if (c.field === 'id' && (op === 'equal' || op === '==')) {
        filter.$or = [{ id: c.value }, { uid: c.value }];
      } else if (op === 'equal' || op === '==') {
        filter[c.field] = c.value;
      } else if (op === '>') {
        filter[c.field] = { $gt: c.value };
      } else if (op === '>=') {
        filter[c.field] = { $gte: c.value };
      } else if (op === '<') {
        filter[c.field] = { $lt: c.value };
      } else if (op === '<=') {
        filter[c.field] = { $lte: c.value };
      } else if (op === '!=') {
        filter[c.field] = { $ne: c.value };
      } else if (op === 'in' && Array.isArray(c.value)) {
        filter[c.field] = { $in: c.value };
      } else if (op === 'array-contains') {
        filter[c.field] = c.value;
      }
    } else if (c.type === 'limit') {
      limitVal = Number(c.value) || null;
    } else if (c.type === 'orderBy') {
      if (!sort) sort = {};
      sort[c.field] = c.direction === 'desc' ? -1 : 1;
    }
  }

  return { filter, sort, limitVal };
}

export async function listDocuments(colPath: string, constraints: any[] = []): Promise<any[]> {
  const cacheKey = `${colPath}:list:${JSON.stringify(constraints)}`;
  const cached = queryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const mongo = await getMongoDb().catch(() => null);
  if (mongo) {
    try {
      const col = mongo.collection(colPath);
      const { filter, sort, limitVal } = buildMongoQuery(constraints);
      let cursor = col.find(filter);
      if (sort) cursor = cursor.sort(sort);
      if (limitVal) cursor = cursor.limit(limitVal);
      const docs = await cursor.toArray();
      const results = docs.map((d: any) => {
        const { _id, ...rest } = d;
        const docId = rest.id || rest.uid || String(_id);
        return { id: docId, uid: docId, ...rest };
      });
      queryCache.set(cacheKey, { data: results, timestamp: Date.now() });
      return results;
    } catch (err: any) {
      console.warn(`[MongoDocService] Local list query failed for ${colPath}:`, err?.message || err);
    }
  }

  // Forward to live MongoDB proxy on antonyschool.in
  const liveResults = await forwardToLiveMongo('list', colPath, { constraints });
  if (Array.isArray(liveResults)) {
    queryCache.set(cacheKey, { data: liveResults, timestamp: Date.now() });
    return liveResults;
  }

  return [];
}

export async function getDocument(colPath: string, id: string): Promise<any | null> {
  if (!id) return null;

  const mongo = await getMongoDb().catch(() => null);
  if (mongo) {
    try {
      const col = mongo.collection(colPath);
      const doc = await col.findOne({ $or: [{ id }, { uid: id }] });
      if (doc) {
        const { _id, ...rest } = doc;
        const docId = rest.id || rest.uid || id;
        return { id: docId, uid: docId, ...rest };
      }
    } catch (err: any) {
      console.warn(`[MongoDocService] Local get query failed for ${colPath}/${id}:`, err?.message || err);
    }
  }

  return forwardToLiveMongo('get', colPath, { id });
}

export async function countDocuments(colPath: string, constraints: any[] = []): Promise<number> {
  const mongo = await getMongoDb().catch(() => null);
  if (mongo) {
    try {
      const col = mongo.collection(colPath);
      const { filter } = buildMongoQuery(constraints);
      return await col.countDocuments(filter);
    } catch (err: any) {
      console.warn(`[MongoDocService] Local count query failed for ${colPath}:`, err?.message || err);
    }
  }

  const liveCount = await forwardToLiveMongo('count', colPath, { constraints });
  return typeof liveCount === 'number' ? liveCount : 0;
}

export async function setDocument(
  colPath: string,
  id: string,
  data: any,
  _options: { merge?: boolean } = { merge: true }
): Promise<{ id: string }> {
  const docId = String(id || data?.id || data?.uid);
  const cleaned = {
    ...data,
    id: docId,
    uid: data?.uid || docId,
    updatedAt: new Date().toISOString()
  };

  const mongo = await getMongoDb().catch(() => null);
  if (mongo) {
    try {
      const col = mongo.collection(colPath);
      await col.updateOne(
        { $or: [{ id: docId }, { uid: docId }] },
        { $set: cleaned },
        { upsert: true }
      );
    } catch (err: any) {
      console.warn(`[MongoDocService] Local set error for ${colPath}/${docId}:`, err?.message || err);
    }
  }

  if (isTelemetryOrLog(colPath)) {
    recordTelemetry(colPath, docId, cleaned);
  }

  invalidateCollectionCache(colPath);
  forwardToLiveMongo('set', colPath, { id: docId, data: cleaned }).catch(() => {});
  return { id: docId };
}

export async function addDocument(colPath: string, data: any): Promise<{ id: string }> {
  const docId = String(data?.id || data?.uid || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'id_' + Date.now()));
  const cleaned = {
    ...data,
    id: docId,
    uid: docId,
    createdAt: data?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mongo = await getMongoDb().catch(() => null);
  if (mongo) {
    try {
      const col = mongo.collection(colPath);
      await col.insertOne(cleaned);
    } catch (err: any) {
      console.warn(`[MongoDocService] Local add error for ${colPath}:`, err?.message || err);
    }
  }

  if (isTelemetryOrLog(colPath)) {
    recordTelemetry(colPath, docId, cleaned);
  }

  invalidateCollectionCache(colPath);
  forwardToLiveMongo('add', colPath, { id: docId, data: cleaned }).catch(() => {});
  return { id: docId };
}

export async function updateDocument(colPath: string, id: string, data: any): Promise<{ id: string }> {
  const docId = String(id);
  const cleaned = {
    ...data,
    id: docId,
    uid: data?.uid || docId,
    updatedAt: new Date().toISOString()
  };

  const mongo = await getMongoDb().catch(() => null);
  if (mongo) {
    try {
      const col = mongo.collection(colPath);
      await col.updateOne(
        { $or: [{ id: docId }, { uid: docId }] },
        { $set: cleaned }
      );
    } catch (err: any) {
      console.warn(`[MongoDocService] Local update error for ${colPath}/${docId}:`, err?.message || err);
    }
  }

  if (isTelemetryOrLog(colPath)) {
    recordTelemetry(colPath, docId, cleaned);
  }

  invalidateCollectionCache(colPath);
  forwardToLiveMongo('update', colPath, { id: docId, data: cleaned }).catch(() => {});
  return { id: docId };
}

export async function deleteDocument(colPath: string, id: string): Promise<boolean> {
  const docId = String(id);

  const mongo = await getMongoDb().catch(() => null);
  if (mongo) {
    try {
      const col = mongo.collection(colPath);
      await col.deleteOne({ $or: [{ id: docId }, { uid: docId }] });
    } catch (err: any) {
      console.warn(`[MongoDocService] Local delete error for ${colPath}/${docId}:`, err?.message || err);
    }
  }

  invalidateCollectionCache(colPath);
  forwardToLiveMongo('delete', colPath, { id: docId }).catch(() => {});
  return true;
}

export async function deleteBatchDocuments(colPath: string, ids: string[]): Promise<boolean> {
  const mongo = await getMongoDb().catch(() => null);
  if (mongo && ids.length > 0) {
    try {
      const col = mongo.collection(colPath);
      await col.deleteMany({ $or: [{ id: { $in: ids } }, { uid: { $in: ids } }] });
    } catch (err: any) {
      console.warn(`[MongoDocService] Local deleteBatch error for ${colPath}:`, err?.message || err);
    }
  }

  invalidateCollectionCache(colPath);
  forwardToLiveMongo('deleteBatch', colPath, { ids }).catch(() => {});
  return true;
}

export async function setBatchDocuments(colPath: string, items: Array<{ id: string; data: any }>): Promise<boolean> {
  const mongo = await getMongoDb().catch(() => null);
  if (mongo && items.length > 0) {
    try {
      const col = mongo.collection(colPath);
      for (const item of items) {
        if (item && item.id && item.data) {
          const docId = String(item.id);
          const cleaned = {
            ...item.data,
            id: docId,
            uid: item.data?.uid || docId,
            updatedAt: new Date().toISOString()
          };
          await col.updateOne(
            { $or: [{ id: docId }, { uid: docId }] },
            { $set: cleaned },
            { upsert: true }
          );
        }
      }
    } catch (err: any) {
      console.warn(`[MongoDocService] Local setBatch error for ${colPath}:`, err?.message || err);
    }
  }

  invalidateCollectionCache(colPath);
  await forwardToLiveMongo('updateBatch', colPath, { items }).catch(() => {});
  return true;
}

export async function updateBatchDocuments(colPath: string, items: Array<{ id: string; data: any }>): Promise<boolean> {
  return setBatchDocuments(colPath, items);
}
