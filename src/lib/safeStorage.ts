// Multi-tier Storage implementation: persists in browser localStorage/sessionStorage when available,
// with window.name, cookie, and in-memory fallbacks for sandboxed iframe environments.
const globalMemStore: Record<string, string> = {};

function readWindowNameBackup(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    if (window.name && window.name.startsWith('__ERP_STORE__:')) {
      const json = window.name.slice('__ERP_STORE__:'.length);
      return JSON.parse(json) || {};
    }
  } catch {}
  return {};
}

function writeWindowNameBackup(store: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    const compact: Record<string, string> = {};
    // Only persist essential auth and session keys in window.name to keep it lightweight
    for (const [k, v] of Object.entries(store)) {
      if (
        k.startsWith('bypass_') ||
        k.startsWith('auth_') ||
        k === 'last_app_activity' ||
        k === 'preferred_profile_id'
      ) {
        compact[k] = v;
      }
    }
    window.name = '__ERP_STORE__:' + JSON.stringify(compact);
  } catch {}
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + encodeURIComponent(name) + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  try {
    // Only store essential short keys in cookie
    if (name.length > 64 || value.length > 2048) return;
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=604800; SameSite=Lax`;
  } catch {}
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
  } catch {}
}

class SafeStorageWrapper implements Storage {
  private memStore: Record<string, string>;
  private isSession: boolean;

  constructor(isSession = false) {
    this.isSession = isSession;
    this.memStore = globalMemStore;

    // Hydrate memory store from window.name backup if available
    try {
      const windowNameStore = readWindowNameBackup();
      for (const [k, v] of Object.entries(windowNameStore)) {
        if (!this.memStore[k]) {
          this.memStore[k] = v;
        }
      }
    } catch {}
  }

  private get realStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
      return this.isSession ? window.sessionStorage : window.localStorage;
    } catch {
      return null;
    }
  }

  get length(): number {
    const s = this.realStorage;
    if (s) {
      try {
        return s.length;
      } catch {}
    }
    return Object.keys(this.memStore).length;
  }

  clear(): void {
    const s = this.realStorage;
    if (s) {
      try {
        s.clear();
      } catch {}
    }
    for (const k of Object.keys(this.memStore)) {
      delete this.memStore[k];
      deleteCookie(k);
    }
    writeWindowNameBackup({});
  }

  getItem(key: string): string | null {
    // 1. Try native Web Storage
    const s = this.realStorage;
    if (s) {
      try {
        const val = s.getItem(key);
        if (val !== null) {
          this.memStore[key] = val;
          return val;
        }
      } catch {}
    }

    // 2. Try In-Memory Store
    if (this.memStore[key] !== undefined && this.memStore[key] !== null) {
      return this.memStore[key];
    }

    // 3. Try Window.name Backup
    const winBackup = readWindowNameBackup();
    if (winBackup[key] !== undefined && winBackup[key] !== null) {
      this.memStore[key] = winBackup[key];
      return winBackup[key];
    }

    // 4. Try Cookie fallback
    const cookieVal = readCookie(key);
    if (cookieVal !== null) {
      this.memStore[key] = cookieVal;
      return cookieVal;
    }

    return null;
  }

  key(index: number): string | null {
    const s = this.realStorage;
    if (s) {
      try {
        return s.key(index);
      } catch {}
    }
    return Object.keys(this.memStore)[index] ?? null;
  }

  removeItem(key: string): void {
    const s = this.realStorage;
    if (s) {
      try {
        s.removeItem(key);
      } catch {}
    }
    delete this.memStore[key];
    deleteCookie(key);
    writeWindowNameBackup(this.memStore);
  }

  setItem(key: string, value: string): void {
    const val = String(value);
    const s = this.realStorage;
    if (s) {
      try {
        s.setItem(key, val);
      } catch {}
    }
    this.memStore[key] = val;
    writeCookie(key, val);
    writeWindowNameBackup(this.memStore);
  }
}

export const safeStorage: Storage = new SafeStorageWrapper(false);
export const safeSessionStorage: Storage = new SafeStorageWrapper(true);

