import { 
  AuthenticationState, 
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';

const activeAuthMap = new Map<string, { 
  state: AuthenticationState; 
  saveCreds: () => Promise<void>; 
  clearState: () => Promise<void>; 
  clearKeys: () => Promise<void>; 
}>();

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
  const localAuth = await useMultiFileAuthState(authFolder);
  // Ensure initial creds are persisted to disk so process restarts keep consistent keys
  const credsFile = path.join(authFolder, 'creds.json');
  if (!fs.existsSync(credsFile)) {
    try {
      await localAuth.saveCreds();
    } catch (_) {}
  }
  const instance = {
    state: localAuth.state,
    saveCreds: localAuth.saveCreds,
    clearState: async () => {
      activeAuthMap.delete(sessionId);
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
  activeAuthMap.set(sessionId, instance);
  return instance;
};

export const useFirestoreAuthState = useWAAuthState;
