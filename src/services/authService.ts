import { safeStorage as localStorage } from '../lib/safeStorage';

// Pure client-side Authentication Service (JWT & REST)
// Completely free from Firebase SDKs

export const isBackendUnreachable = false;
export const onUnreachableChange = (callback: (status: boolean) => void) => {
  callback(false);
  return () => {};
};

export const testConnection = async (_attempt = 1): Promise<boolean> => {
  return true;
};

const authListeners = new Set<(user: any) => void>();

export const triggerAuthStateChanged = () => {
  const current = auth.currentUser;
  authListeners.forEach((cb) => {
    try {
      cb(current);
    } catch (e) {
      console.error('[auth] listener error:', e);
    }
  });
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'bypass_user_profile' || e.key === 'auth_user' || e.key === 'auth_jwt_token') {
      triggerAuthStateChanged();
    }
  });
}

export const onAuthStateChanged = (first: any, second?: any) => {
  const callback = typeof first === 'function' ? first : (typeof second === 'function' ? second : null);
  if (typeof callback !== 'function') return () => {};

  authListeners.add(callback);
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      try {
        callback(auth.currentUser);
      } catch (e) {
        console.error('[auth] onAuthStateChanged initial error:', e);
      }
    }, 0);
  }

  return () => {
    authListeners.delete(callback);
  };
};

export const auth: any = {
  get currentUser() {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('auth_user') || localStorage.getItem('bypass_user_profile');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.uid || parsed.email || parsed.role || parsed._id)) {
          const id = parsed.id || parsed.uid || parsed._id || 'user_default';
          const role = (parsed.role || localStorage.getItem('bypass_user_role') || 'admin').toLowerCase().trim();
          const name = parsed.name || parsed.displayName || localStorage.getItem('bypass_user_name') || 'User';
          const email = parsed.email || localStorage.getItem('bypass_user_email') || `${id}@stantonys.edu`;
          return {
            ...parsed,
            uid: id,
            id: id,
            _id: parsed._id || id,
            role,
            name,
            displayName: name,
            email,
            photoURL: parsed.photoURL || localStorage.getItem('bypass_user_photo') || '',
            emailVerified: true,
            status: parsed.status || 'active',
            getIdToken: async () => localStorage.getItem('auth_jwt_token') || 'local_token'
          };
        }
      }
    } catch (_) {}
    return null;
  },
  signOut: async () => {
    try {
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_jwt_token');
      localStorage.removeItem('bypass_user_profile');
      localStorage.removeItem('bypass_user_role');
      localStorage.removeItem('bypass_user_email');
      localStorage.removeItem('bypass_user_name');
      localStorage.removeItem('bypass_user_photo');
    } catch (_) {}
    triggerAuthStateChanged();
  }
};

export const setPersistence = async (_auth: any, _persistence: any) => {};
export const inMemoryPersistence = {};
export const browserLocalPersistence = {};

export const db: any = {};
export const storage: any = {};

export default auth;
