import { 
  AuthenticationState, 
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';
import { getDocument, setDocument, deleteDocument } from './mongoDocService.js';

const activeAuthMap = new Map<string, { 
  state: AuthenticationState; 
  saveCreds: () => Promise<void>; 
  clearState: () => Promise<void>; 
  clearKeys: () => Promise<void>; 
}>();

const SESSION_COLLECTION = 'whatsapp_sessions';

/**
 * Robust Multi-File Auth State with MongoDB Cloud Persistence
 * Ensures WhatsApp pairing session is permanently preserved across container restarts,
 * dev server reloads, and deployments.
 */
export const useWAAuthState = async (sessionId: string): Promise<{ 
  state: AuthenticationState; 
  saveCreds: () => Promise<void>; 
  clearState: () => Promise<void>; 
  clearKeys: () => Promise<void>; 
}> => {
  const cached = activeAuthMap.get(sessionId);
  if (cached) {
    return cached;
  }

  const authFolder = path.join(process.cwd(), 'wa_auth', sessionId);
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  const credsFile = path.join(authFolder, 'creds.json');
  let hasValidDiskCreds = false;
  if (fs.existsSync(credsFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
      if (parsed && (parsed.registered === true || parsed.me?.id || (parsed as any).account)) {
        hasValidDiskCreds = true;
      }
    } catch (_) {}
  }

  // If local disk has no registered credentials, restore from persistent MongoDB storage
  if (!hasValidDiskCreds) {
    try {
      console.log(`[WhatsApp Auth] Checking persistent MongoDB session for '${sessionId}'...`);
      const remoteSession = await getDocument(SESSION_COLLECTION, sessionId);
      if (remoteSession && remoteSession.creds) {
        console.log(`[WhatsApp Auth] Restoring permanent session from MongoDB for '${sessionId}'...`);
        fs.writeFileSync(credsFile, remoteSession.creds, 'utf8');
        
        let keysMap: Record<string, string> = {};
        if (remoteSession.keysJson && typeof remoteSession.keysJson === 'string') {
          try {
            keysMap = JSON.parse(remoteSession.keysJson);
          } catch (_) {}
        } else if (remoteSession.keys && typeof remoteSession.keys === 'object') {
          keysMap = remoteSession.keys;
        }

        for (const [filename, content] of Object.entries(keysMap)) {
          if (typeof content === 'string' && filename.endsWith('.json')) {
            try {
              fs.writeFileSync(path.join(authFolder, filename), content, 'utf8');
            } catch (_) {}
          }
        }
        console.log(`[WhatsApp Auth] Successfully restored credentials & keys from MongoDB!`);
      }
    } catch (err: any) {
      console.warn(`[WhatsApp Auth] Could not restore session from MongoDB:`, err?.message || err);
    }
  }

  const localAuth = await useMultiFileAuthState(authFolder);

  // Debounced cloud sync to avoid throttling during rapid key generation
  let syncTimer: any = null;
  const syncToCloud = () => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        if (!fs.existsSync(credsFile)) return;
        const credsRaw = fs.readFileSync(credsFile, 'utf8');
        const parsed = JSON.parse(credsRaw);
        
        // Only mirror to cloud if registered or actively paired
        if (!parsed || (!parsed.registered && !parsed.me?.id && !(parsed as any).account)) {
          return;
        }

        const keysMap: Record<string, string> = {};
        if (fs.existsSync(authFolder)) {
          const files = fs.readdirSync(authFolder);
          for (const file of files) {
            if (file !== 'creds.json' && file.endsWith('.json')) {
              try {
                keysMap[file] = fs.readFileSync(path.join(authFolder, file), 'utf8');
              } catch (_) {}
            }
          }
        }

        // Store keys safely as stringified JSON to prevent MongoDB dot-key BSON errors
        await setDocument(SESSION_COLLECTION, sessionId, {
          id: sessionId,
          creds: credsRaw,
          keysJson: JSON.stringify(keysMap),
          registered: true,
          me: parsed.me || null,
          updatedAt: new Date().toISOString()
        });
        console.log(`[WhatsApp Auth] Session permanently backed up to MongoDB for '${sessionId}'.`);
      } catch (err: any) {
        console.warn(`[WhatsApp Auth] Error saving session to MongoDB:`, err?.message || err);
      }
    }, 1500);
  };

  const instance = {
    state: localAuth.state,
    saveCreds: async () => {
      await localAuth.saveCreds();
      syncToCloud();
    },
    clearState: async () => {
      activeAuthMap.delete(sessionId);
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
      }
      try {
        await deleteDocument(SESSION_COLLECTION, sessionId);
        console.log(`[WhatsApp Auth] Session '${sessionId}' deleted from MongoDB.`);
      } catch (_) {}
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

  activeAuthMap.set(sessionId, instance);
  return instance;
};

export const useFirestoreAuthState = useWAAuthState;
