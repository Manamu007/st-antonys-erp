import { 
  AuthenticationState, 
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';

export const useWAAuthState = async (sessionId: string): Promise<{ 
  state: AuthenticationState; 
  saveCreds: () => Promise<void>; 
  clearState: () => Promise<void>; 
  clearKeys: () => Promise<void>; 
}> => {
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

export const useFirestoreAuthState = useWAAuthState;
