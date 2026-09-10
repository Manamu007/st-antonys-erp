// Disconnected client-side Firebase SDK to exclusively use local Express backend + MongoDB API.
// No remote Firebase/Firestore SDK initializations, billing checks, or network calls are made from the frontend.

export const db: any = {};
export const storage: any = {};

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
    const raw = localStorage.getItem('auth_user') || localStorage.getItem('bypass_user_profile');
    if (!raw) return null;
    try {
      const p = JSON.parse(raw);
      const uid = p.id || p.uid || p._id || 'user';
      return {
        uid,
        id: uid,
        email: p.email || '',
        displayName: p.name || p.displayName || 'School Member',
        photoURL: p.photoURL || '',
        emailVerified: true,
        isAnonymous: false,
        tenantId: null,
        providerData: [],
        getIdToken: async () => localStorage.getItem('auth_jwt_token') || 'bypass_token'
      };
    } catch {
      return null;
    }
  },
  onAuthStateChanged: (first: any, second?: any) => onAuthStateChanged(first, second),
  setPersistence: async () => {},
  signOut: async () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_jwt_token');
      if (token) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_jwt_token');
      localStorage.removeItem('bypass_user_email');
      localStorage.removeItem('bypass_user_uid');
      localStorage.removeItem('bypass_user_name');
      localStorage.removeItem('bypass_user_photo');
      localStorage.removeItem('bypass_user_role');
      localStorage.removeItem('bypass_user_profile');
      localStorage.removeItem('auth_current_user_role');
      localStorage.removeItem('auth_user_email');
      localStorage.removeItem('auth_allowed_profile_ids');
      triggerAuthStateChanged();
    }
  }
};

export const inMemoryPersistence = 'inMemory';
export const setPersistence = async (_auth: any, _persistence: any) => {};

const app = {
  name: '[DEFAULT]',
  options: {}
} as any;

export default app;
