import { 
  AuthenticationState, 
  AuthenticationCreds, 
  SignalDataTypeMap, 
  initAuthCreds, 
  BufferJSON, 
  proto,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';
import { getDbAdmin, isDatabaseDenied, setDatabaseDenied } from './firebaseAdmin.js';

// Global in-memory cache for ultra-fast, non-blocking Baileys authentication handshake
const keysCache: { [sessionId: string]: { [key: string]: any } } = {};
const credsCache: { [sessionId: string]: AuthenticationCreds } = {};
const cacheInitialized: { [sessionId: string]: boolean } = {};

export const useFirestoreAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void>, clearState: () => Promise<void>, clearKeys: () => Promise<void> }> => {
  let db: any;
  let useFallback = false;

  try {
    if (isDatabaseDenied()) {
      console.warn("[FirestoreAuthState] Database is marked as denied. Falling back to local multi-file auth state.");
      useFallback = true;
    } else {
      db = getDbAdmin();
    }
  } catch (err: any) {
    console.warn(`[FirestoreAuthState] Failed to get database: ${err.message}. Falling back to local multi-file auth state.`);
    useFallback = true;
  }

  const getLocalAuth = async () => {
    const authFolder = path.join(process.cwd(), 'wa_auth', sessionId);
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }
    const localAuth = await useMultiFileAuthState(authFolder);
    return {
      state: localAuth.state,
      saveCreds: localAuth.saveCreds,
      clearState: async () => {
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
        }
      },
      clearKeys: async () => {
        if (fs.existsSync(authFolder)) {
          try {
            const files = fs.readdirSync(authFolder);
            for (const file of files) {
              if (file !== 'creds.json') {
                fs.rmSync(path.join(authFolder, file), { force: true });
              }
            }
          } catch (_) {}
        }
      }
    };
  };

  if (useFallback) {
    return await getLocalAuth();
  }

  try {
    const collection = db.collection('whatsapp_sessions').doc(sessionId);
    const keysCollection = collection.collection('keys');

    // Initialize in-memory cache on demand; avoid loading tens of thousands of device-list keys
    // at boot to prevent memory exhaustion, slow start, and Firestore deadline timeouts.
    if (!cacheInitialized[sessionId]) {
      keysCache[sessionId] = {};
      cacheInitialized[sessionId] = true;
      console.log(`[FirestoreAuthState] Initialized in-memory on-demand key cache for session ${sessionId}.`);
    }

    // Load creds directly from Firestore to prevent multi-instance stale credentials
    let creds: AuthenticationCreds;
    const credsDoc = await collection.get();
    if (credsDoc.exists && credsDoc.data()?.creds) {
      creds = JSON.parse(credsDoc.data()?.creds, BufferJSON.reviver);
      if (creds && creds.me && !creds.registered) {
        creds.registered = true;
      }
    } else {
      creds = initAuthCreds();
    }

    const saveCreds = async () => {
      try {
        const authFolder = path.join(process.cwd(), 'wa_auth', sessionId);
        if (!fs.existsSync(authFolder)) {
          fs.mkdirSync(authFolder, { recursive: true });
        }
        fs.writeFileSync(path.join(authFolder, 'creds.json'), JSON.stringify(creds, BufferJSON.replacer));
      } catch (_) {}

      if (isDatabaseDenied()) return;

      try {
        await collection.set({ 
          creds: JSON.stringify(creds, BufferJSON.replacer),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('billing') || msg.includes('PERMISSION_DENIED') || msg.includes('requires billing')) {
          setDatabaseDenied(true);
          console.warn(`[FirestoreAuthState] Cloud billing required on project. WhatsApp credentials preserved locally in wa_auth.`);
        } else {
          console.error(`[FirestoreAuthState] Creds write error:`, err);
        }
      }
    };

  const deleteDocsInChunks = async (docs: any[]) => {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  };

  const clearState = async () => {
    keysCache[sessionId] = {};
    delete credsCache[sessionId];
    cacheInitialized[sessionId] = false;
    try {
      if (typeof (db as any).recursiveDelete === 'function') {
        console.log(`[FirestoreAuthState] Rapidly wiping session keys via recursiveDelete...`);
        await (db as any).recursiveDelete(keysCollection);
      } else {
        const keys = await keysCollection.get();
        await deleteDocsInChunks(keys.docs);
      }
    } catch (err: any) {
      console.warn(`[FirestoreAuthState] Error during keys wipe: ${err.message}. Falling back to batch chunking.`);
      try {
        const keys = await keysCollection.limit(500).get();
        await deleteDocsInChunks(keys.docs);
      } catch (_) {}
    }
    await collection.delete().catch(() => {});
  };

  const clearKeys = async () => {
    keysCache[sessionId] = {};
    cacheInitialized[sessionId] = false;
    try {
      if (typeof (db as any).recursiveDelete === 'function') {
        await (db as any).recursiveDelete(keysCollection);
      } else {
        const keys = await keysCollection.get();
        await deleteDocsInChunks(keys.docs);
      }
    } catch (err: any) {
      console.warn(`[FirestoreAuthState] Error clearing keys: ${err.message}`);
    }
    console.log(`[FirestoreAuthState] Successfully cleared keys subcollection for session ${sessionId} in Firestore.`);
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          if (ids.length === 0) return data;

          const missingIds: string[] = [];
          const isSessionOrSenderKey = type === 'session' || type === 'sender-key' || type === 'pre-key' || type === 'sender-key-memory';

          // 1. Try reading from cache first
          for (const id of ids) {
            const key = `${type}-${id}`;
            if (keysCache[sessionId] && keysCache[sessionId][key] !== undefined) {
              let value = keysCache[sessionId][key];
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            } else {
              missingIds.push(id);
            }
          }

          // 2. Fetch missing keys from Firestore if any are not in cache (lazy loading)
          if (missingIds.length > 0) {
            try {
              const refs = missingIds.map(id => keysCollection.doc(`${type}-${id}`));
              const docs = await db.getAll(...refs);

              docs.forEach((doc: any) => {
                if (doc.exists) {
                  try {
                    const rawData = doc.data()?.data;
                    if (rawData) {
                      let value = JSON.parse(rawData, BufferJSON.reviver);
                      const key = doc.id;
                      if (!keysCache[sessionId]) keysCache[sessionId] = {};
                      keysCache[sessionId][key] = value;

                      if (type === 'app-state-sync-key' && value) {
                        value = proto.Message.AppStateSyncKeyData.fromObject(value);
                      }
                      const prefix = `${type}-`;
                      const id = doc.id.startsWith(prefix) ? doc.id.substring(prefix.length) : doc.id;
                      data[id] = value;
                    }
                  } catch (parseErr) {
                    console.error(`[FirestoreAuthState] Parse error for key ${doc.id}:`, parseErr);
                  }
                }
              });
            } catch (err) {
              console.error(`[FirestoreAuthState] Error in get (${type}) for missing IDs:`, err);
            }
          }
          return data;
        },
        set: async (data) => {
          if (!keysCache[sessionId]) keysCache[sessionId] = {};
          const promises: Promise<any>[] = [];

          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
              const key = `${category}-${id}`;

              // Update in-memory cache synchronously
              if (value) {
                keysCache[sessionId][key] = value;
                
                // Add write promise to array
                if (!isDatabaseDenied()) {
                  promises.push(
                    keysCollection.doc(key).set({ 
                      data: JSON.stringify(value, BufferJSON.replacer), 
                      updatedAt: new Date().toISOString() 
                    }).catch((err: any) => {
                      const msg = String(err?.message || err);
                      if (msg.includes('billing') || msg.includes('PERMISSION_DENIED') || msg.includes('requires billing')) {
                        setDatabaseDenied(true);
                      } else {
                        console.error(`[FirestoreAuthState] Write error for ${key}:`, err);
                      }
                    })
                  );
                }
              } else {
                delete keysCache[sessionId][key];
                
                // Add delete promise to array
                if (!isDatabaseDenied()) {
                  promises.push(
                    keysCollection.doc(key).delete().catch((err: any) => {
                      const msg = String(err?.message || err);
                      if (msg.includes('billing') || msg.includes('PERMISSION_DENIED') || msg.includes('requires billing')) {
                        setDatabaseDenied(true);
                      } else {
                        console.error(`[FirestoreAuthState] Delete error for ${key}:`, err);
                      }
                    })
                  );
                }
              }
            }
          }
          // Wait for all Firestore I/O tasks to complete in parallel to prevent decryption/session race conditions
          await Promise.all(promises);
        },
      },
    },
    saveCreds,
    clearState,
    clearKeys
  };
  } catch (err: any) {
    console.warn(`[FirestoreAuthState] Firestore connection failed: ${err?.message}. Falling back to multi-file local storage.`);
    return await getLocalAuth();
  }
};
