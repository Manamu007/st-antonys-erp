// Hybrid Storage implementation: persists in browser localStorage/sessionStorage when available,
// with graceful in-memory fallback for sandboxed environments.
class SafeStorageWrapper implements Storage {
  private memStore: Record<string, string> = {};
  private isSession: boolean;

  constructor(isSession = false) {
    this.isSession = isSession;
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
    this.memStore = {};
  }

  getItem(key: string): string | null {
    const s = this.realStorage;
    if (s) {
      try {
        const val = s.getItem(key);
        if (val !== null) return val;
      } catch {}
    }
    return this.memStore[key] ?? null;
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
  }
}

export const safeStorage: Storage = new SafeStorageWrapper(false);
export const safeSessionStorage: Storage = new SafeStorageWrapper(true);

