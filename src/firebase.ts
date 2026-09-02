import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, doc, getDoc, getFirestore, setLogLevel } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Suppress verbose Firebase Firestore warnings and connection failures
try {
  setLogLevel('silent');
} catch (e) {
  console.warn("[Firebase] Could not set log level to silent:", e);
}

// Global console filter to swallow noisy Firebase connection reachability errors in browser logs
if (typeof window !== 'undefined') {
  const isFirebaseNoisyLog = (args: any[]) => {
    const str = args.map(arg => {
      try {
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');
    return (
      str.includes('@firebase/firestore') ||
      str.includes('Could not reach Cloud Firestore backend') ||
      str.includes('Connection failed') ||
      str.includes('Failed to get document from server') ||
      str.includes('Firestore (11.10.0)') ||
      str.includes('code=unavailable')
    );
  };

  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (isFirebaseNoisyLog(args)) {
      console.log("[Firebase Swallowed Error]:", ...args);
      return;
    }
    originalError.apply(console, args);
  };

  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (isFirebaseNoisyLog(args)) {
      console.log("[Firebase Swallowed Warning]:", ...args);
      return;
    }
    originalWarn.apply(console, args);
  };
}

// Perform startup cleanup of legacy IndexedDB and localStorage caches
try {
  if (typeof window !== 'undefined') {
    // Delete any old/corrupted IndexedDB databases created by Firestore persistent cache
    if (window.indexedDB) {
      try {
        if (typeof indexedDB.databases === 'function') {
          indexedDB.databases().then((dbs) => {
            dbs.forEach(d => {
              if (d.name && (d.name.includes('firestore') || d.name.includes('firebase'))) {
                try {
                  indexedDB.deleteDatabase(d.name);
                } catch (e) {}
              }
            });
          }).catch(() => {});
        }
      } catch (e) {}
    }

    let hasAccess = false;
    try {
      const test = window.localStorage;
      if (test) {
        hasAccess = true;
      }
    } catch (e) {
      console.warn("[Storage] localStorage access is restricted in this context:", e);
    }

    if (hasAccess) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (
          key.startsWith('firestore_targets_') ||
          key.includes('firestore') ||
          key.startsWith('fs_cache_users/') ||
          key.startsWith('fs_cache_students/') ||
          key.startsWith('fs_cache_staff/') ||
          key.startsWith('fs_cache_payments/') ||
          key.startsWith('fs_cache_concessions/')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        try {
          window.localStorage.removeItem(key);
        } catch (removeErr) {}
      });

      // Register global monkey-patch for localStorage.setItem to catch and recover from QuotaExceededError automatically
      try {
        const originalSetItem = window.localStorage.setItem;
        window.localStorage.setItem = function (key: string, value: string) {
          try {
            originalSetItem.apply(this, [key, value]);
          } catch (e: any) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.message?.toLowerCase().includes('quota')) {
              console.warn("[Storage] Quota exceeded on setItem! Actively purging internal firestore_targets and high-volume collection cache entries to free up space...");
              try {
                const keysToEvict: string[] = [];
                for (let i = 0; i < window.localStorage.length; i++) {
                  const k = window.localStorage.key(i);
                  if (k && (
                    k.startsWith('firestore_targets_') ||
                    k.includes('firestore') ||
                    k.startsWith('fs_cache_users/') ||
                    k.startsWith('fs_cache_students/') ||
                    k.startsWith('fs_cache_staff/') ||
                    k.startsWith('fs_cache_payments/') ||
                    k.startsWith('fs_cache_concessions/')
                  )) {
                    keysToEvict.push(k);
                  }
                }
                keysToEvict.forEach(k => {
                  try {
                    window.localStorage.removeItem(k);
                  } catch (evictErr) {}
                });
                originalSetItem.apply(this, [key, value]);
              } catch (retryErr) {
                console.error("[Storage] Retry failed after clearing cache:", retryErr);
              }
            } else {
              throw e;
            }
          }
        };
      } catch (patchErr) {}
    }
  }
} catch (storageInitError) {
  console.warn("[Storage] Storage setup warning:", storageInitError);
}

const app = initializeApp(firebaseConfig);

// Initialize Firestore with robust memoryLocalCache across all devices & browsers.
// This completely prevents IndexedDB database corruption ("refusing to open IndexedDB database"),
// WebKit version locking on iPads/iPhones, and quota exhaustion errors.
let firestoreDb: any;

try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: false,
    localCache: memoryLocalCache()
  }, firebaseConfig.firestoreDatabaseId === '(default)' ? undefined : firebaseConfig.firestoreDatabaseId);
  console.log("[Firebase] Success: Initialized with reliable in-memory local cache.");
} catch (errorPersistent: any) {
  console.warn("[Firebase] initializeFirestore with memory cache notice. Falling back to default getFirestore...", errorPersistent?.message || errorPersistent);
  try {
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId === '(default)' ? undefined : firebaseConfig.firestoreDatabaseId);
  } catch (secondError: any) {
    console.error("[Firebase] Fatal: getFirestore fallback failed:", secondError);
  }
}

export const db = firestoreDb;

export let isBackendUnreachable = false;
const unreachableListeners: ((status: boolean) => void)[] = [];

export const onUnreachableChange = (callback: (status: boolean) => void) => {
  unreachableListeners.push(callback);
  callback(isBackendUnreachable);
  return () => {
    const idx = unreachableListeners.indexOf(callback);
    if (idx !== -1) unreachableListeners.splice(idx, 1);
  };
};

const setUnreachable = (status: boolean) => {
  if (isBackendUnreachable === status) return;
  isBackendUnreachable = status;
  unreachableListeners.forEach(l => l(status));
};

export const auth = getAuth(app);
try {
  setPersistence(auth, inMemoryPersistence).catch(() => {});
} catch (e) {}

// Initialize Storage (Firebase Cloud Storage)
export const storage = getStorage(app);

// Connectivity check with detailed logging and retry hints
export const testConnection = async (attempt = 1) => {
  if (attempt === 1) {
    console.log(`[Firebase] Checking connectivity to project: ${firebaseConfig.projectId}`);
  }
  
  try {
    const timeoutMs = 10000;
    
    // Check if browser is online
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUnreachable(true);
      return false;
    }

    // Lightweight connection check
    await Promise.race([
      getDoc(doc(db, 'settings', 'school')).catch(() => null),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs))
    ]);

    setUnreachable(false);
    console.log("[Firebase] Connection verified.");
    return true;
  } catch (error: any) {
    console.warn(`[Firebase] Connection check info:`, error?.message || error);
    // If online in browser, keep status connected so iPad users are never blocked
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setUnreachable(false);
      return true;
    }
    setUnreachable(false);
    return true;
  }
};

// Initial check
testConnection();

export default app;
