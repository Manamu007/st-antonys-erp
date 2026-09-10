import './env.js';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import admin from 'firebase-admin';
import { getFirestore, DocumentReference, FieldPath } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Monkey-patch DocumentReference.prototype.get to seamlessly fall back to RunQuery (where documentId == id)
// if GCP Firestore restricts BatchGetDocuments due to named database billing flags.
const origDocGet = DocumentReference.prototype.get;
DocumentReference.prototype.get = async function() {
  try {
    return await origDocGet.apply(this, arguments as any);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('billing') || msg.includes('PERMISSION_DENIED') || msg.includes('requires billing')) {
      try {
        const snap = await this.parent.where(FieldPath.documentId(), '==', this.id).limit(1).get();
        if (!snap.empty) {
          return snap.docs[0];
        }
        return {
          exists: false,
          id: this.id,
          ref: this,
          data: () => undefined
        } as any;
      } catch (innerErr) {
        throw e;
      }
    }
    throw e;
  }
};

const isPlaceholder = (id?: string) => !id || id.includes('your-project-id') || id === 'project-id' || id.includes('ENTER_YOUR');

export let dbAdmin: admin.firestore.Firestore;
export let isNamedDatabaseDenied = false;
export let databaseId: string | undefined;
export let lastInitError: string | null = null;

export const initializationPromise = (async () => {
  console.log(`[FirebaseAdmin Init] Starting... PID=${process.pid}`);
  const configProjectId = firebaseConfig.projectId;
  databaseId = '(default)';
  const configProjectIsPlaceholder = isPlaceholder(configProjectId);

  const tryInit = async (projectId: string) => {
    if (isPlaceholder(projectId)) return null;
    try {
      console.log(`[FirebaseAdmin] Initializing: project=${projectId}, database=(default)`);
      
      if (admin.apps.length > 0) {
        console.log(`[FirebaseAdmin] Deleting ${admin.apps.length} existing apps...`);
        await Promise.all(admin.apps.map(app => app.delete().catch(() => {})));
      }

      let credential: any;
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          credential = admin.credential.cert(parsed);
          console.log('[FirebaseAdmin] Loaded credentials from FIREBASE_SERVICE_ACCOUNT environment variable.');
        } catch (e: any) {
          console.warn('[FirebaseAdmin] Could not parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
        }
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
          credential = admin.credential.cert(parsed);
          console.log(`[FirebaseAdmin] Loaded credentials from ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
        } catch (e: any) {
          console.warn('[FirebaseAdmin] Failed to load GOOGLE_APPLICATION_CREDENTIALS file:', e.message);
        }
      } else if (fs.existsSync(path.join(process.cwd(), 'serviceAccountKey.json'))) {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'serviceAccountKey.json'), 'utf8'));
          credential = admin.credential.cert(parsed);
          console.log('[FirebaseAdmin] Loaded credentials from ./serviceAccountKey.json');
        } catch (e: any) {
          console.warn('[FirebaseAdmin] Failed to load ./serviceAccountKey.json:', e.message);
        }
      }

      const initOptions: admin.AppOptions = {
        projectId,
        storageBucket: firebaseConfig.storageBucket
      };
      if (credential) {
        initOptions.credential = credential;
      }

      admin.initializeApp(initOptions);

      const tempDb = getFirestore(admin.app());

      // Quick connectivity verification (with timeout) to detect database availability
      try {
        const probe = tempDb.collection('_admin_init').limit(1).get();
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('probe_timeout')), 3000));
        await Promise.race([probe, timeout]);
        console.log(`[FirebaseAdmin] Connectivity check verified.`);
        isNamedDatabaseDenied = false;
        return tempDb;
      } catch (err: any) {
        const errText = (err.message || '').toLowerCase();
        lastInitError = err.message;
        if (errText === 'probe_timeout') {
          console.log(`[FirebaseAdmin] Connectivity probe timed out; assuming ambient database connection.`);
          isNamedDatabaseDenied = false;
          return tempDb;
        }

        // Catch default credentials missing, permission denied, quota, disabled, billing issues
        console.warn(`[FirebaseAdmin] Database is unavailable or credentials missing on project ${projectId}: ${err.message}. System will run smoothly in local-storage mode.`);
        isNamedDatabaseDenied = true;
        return null;
      }
    } catch (err: any) {
      console.warn(`[FirebaseAdmin] Init error (project=${projectId}, db=(default)): ${err.message}`);
      lastInitError = err.message;
      isNamedDatabaseDenied = true;
      return null;
    }
  };

  if (configProjectId && !configProjectIsPlaceholder) {
    dbAdmin = await tryInit(configProjectId) as any;
    console.log(`[FirebaseAdmin Init] Finished. dbAdmin initialized? ${!!dbAdmin}`);
  }

  if (!dbAdmin) {
    const dbString = `${configProjectId} / (default)`;
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

let quotaCooldownTimer: NodeJS.Timeout | null = null;

export function isQuotaOrPermissionError(err: any): boolean {
  if (!err) return false;
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource exhausted') ||
    msg.includes('8 resource_exhausted') ||
    msg.includes('billing') ||
    msg.includes('permission_denied') ||
    msg.includes('permission denied') ||
    msg.includes('requires billing') ||
    msg.includes('deadline_exceeded') ||
    msg.includes('not_found') ||
    msg.includes('5 not_found')
  );
}

export function handleFirestoreError(err: any, contextTag: string): boolean {
  if (!isQuotaOrPermissionError(err)) {
    return false;
  }
  const msg = (err?.message || String(err)).toLowerCase();
  const isQuota = msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('resource exhausted');
  
  setDatabaseDenied(true);

  if (isQuota) {
    console.warn(`[${contextTag}] Firestore free-tier quota reached or resource exhausted: ${err?.message || err}. Database operations gracefully paused to prevent failures and allow quota recovery.`);
    if (!quotaCooldownTimer) {
      // Gentle cooldown: after 5 minutes, allow retrying in case quota has reset
      quotaCooldownTimer = setTimeout(() => {
        quotaCooldownTimer = null;
        console.log('[FirebaseAdmin] Quota cooldown elapsed; re-enabling database operations check...');
        setDatabaseDenied(false);
      }, 5 * 60 * 1000);
    }
  } else {
    console.warn(`[${contextTag}] Firestore database notice: ${err?.message || err}. Database operations paused.`);
  }
  return true;
}

export const isDbInitialized = () => !!dbAdmin;
export const getDbAdminInstance = () => dbAdmin;
export const setDatabaseDenied = (denied = true) => {
  isNamedDatabaseDenied = denied;
};
export const getDbAdmin = (): admin.firestore.Firestore => {
  return (dbAdmin || null) as any;
};
export const isDatabaseDenied = () => {
  return !dbAdmin || isNamedDatabaseDenied;
};
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
