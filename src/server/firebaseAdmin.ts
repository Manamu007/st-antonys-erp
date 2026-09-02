import './env.js';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const isPlaceholder = (id?: string) => !id || id.includes('your-project-id') || id === 'project-id' || id.includes('ENTER_YOUR');

export let dbAdmin: admin.firestore.Firestore;
export let isNamedDatabaseDenied = false;
export let databaseId: string | undefined;
export let lastInitError: string | null = null;

export const initializationPromise = (async () => {
  console.log(`[FirebaseAdmin Init] Starting... PID=${process.pid}`);
  const configProjectId = firebaseConfig.projectId;
  const configDatabaseId = firebaseConfig.firestoreDatabaseId;
  const configProjectIsPlaceholder = isPlaceholder(configProjectId);
  databaseId = configDatabaseId;

  const tryInit = async (projectId: string, dbId?: string) => {
    if (isPlaceholder(projectId)) return null;
    try {
      console.log(`[FirebaseAdmin] Initializing: project=${projectId}, database=${dbId || '(default)'}`);
      
      if (admin.apps.length > 0) {
        console.log(`[FirebaseAdmin] Deleting ${admin.apps.length} existing apps...`);
        await Promise.all(admin.apps.map(app => app.delete().catch(() => {})));
      }

      admin.initializeApp({
        projectId,
        storageBucket: firebaseConfig.storageBucket
      });

      const tempDb = dbId && dbId !== '(default)' 
        ? getFirestore(admin.app(), dbId)
        : getFirestore(admin.app());

      // Attempt non-blocking / quick health check
      const healthDoc = tempDb.collection('_admin_init').doc('verify');
      healthDoc.get().then(() => {
        console.log(`[FirebaseAdmin] Connectivity check verified.`);
        healthDoc.set({ verified: true, at: new Date().toISOString() }, { merge: true }).catch(() => {});
      }).catch((err: any) => {
        const errText = (err.message || '').toLowerCase();
        if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('quota') || errText.includes('disabled') || errText.includes('requires billing') || errText.includes('not_found') || errText.includes('not found') || errText.includes('5 not_found')) {
          isNamedDatabaseDenied = true;
          console.warn(`[FirebaseAdmin] Database is unavailable or requires Google Cloud billing/creation on project ${projectId}. Background admin operations will be gracefully skipped.`);
        } else {
          console.warn(`[FirebaseAdmin] Background health check info: ${err.message}`);
        }
      });

      return tempDb;
    } catch (err: any) {
      console.warn(`[FirebaseAdmin] Init error (project=${projectId}, db=${dbId || '(default)'}): ${err.message}`);
      lastInitError = err.message;
      return null;
    }
  };

  if (configProjectId && !configProjectIsPlaceholder) {
    dbAdmin = await tryInit(configProjectId, configDatabaseId) as any;
    console.log(`[FirebaseAdmin Init] Finished. dbAdmin initialized? ${!!dbAdmin}`);
  }

  if (!dbAdmin) {
    const dbString = `${configProjectId} / ${configDatabaseId || '(default)'}`;
    console.error(`[FirebaseAdmin] FAILED to connect to specified database: ${dbString}`);
    const ambient = process.env.GOOGLE_CLOUD_PROJECT || 'none';
    console.error(`[FirebaseAdmin] Ambient Project: ${ambient}`);
    
    // Only mark as billing denied if error explicitly indicates permission/billing issue
    const errText = (lastInitError || '').toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('quota') || errText.includes('requires billing')) {
      isNamedDatabaseDenied = true;
    } else {
      isNamedDatabaseDenied = false;
    }
  } else {
    console.log(`[FirebaseAdmin] Initialized Firebase Admin for ${admin.app().options.projectId} / ${dbAdmin.databaseId || '(default)'}`);
  }
})();

export const isDbInitialized = () => !!dbAdmin;
export const getDbAdminInstance = () => dbAdmin;
export const setDatabaseDenied = (denied = true) => {
  isNamedDatabaseDenied = denied;
};
export const getDbAdmin = () => {
  if (!dbAdmin) {
    if (isNamedDatabaseDenied) {
      throw new Error("Google Cloud Billing Account is required to use Firestore Database for project antonyserp-cc9df. Please enable billing or upgrade to Blaze plan on Google Cloud Console.");
    }
    throw new Error(`Firestore Admin Database is unavailable: ${lastInitError || 'Initialization failed'}`);
  }
  return dbAdmin;
};
export const isDatabaseDenied = () => isNamedDatabaseDenied;
export const getAuthAdmin = () => {
  if (admin.apps.length === 0) return null;
  return admin.auth();
};

export const authAdmin: admin.auth.Auth = new Proxy({} as any, {
  get(_target, prop) {
    if (admin.apps.length > 0) {
      const auth = admin.auth();
      const value = (auth as any)[prop];
      if (typeof value === 'function') {
        return value.bind(auth);
      }
      return value;
    }
    throw new Error("Firebase authAdmin is not initialized - no active app.");
  }
});

export default admin;
