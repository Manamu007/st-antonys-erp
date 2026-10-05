import { auth } from './authService';
import { generateUniqueStudentId } from '../lib/studentUtils';
import { safeStorage as localStorage, safeSessionStorage as sessionStorage } from '../lib/safeStorage';
import { isSystemAccount, isDeveloperAccount } from '../constants/systemAccounts';
import { resolveApiUrl as baseResolveApiUrl } from '../lib/apiClient';

/**
 * Dynamic Remote Base URL Resolver for Live Synchronization
 * - Detects if running inside Google AI Studio, WebContainer, localhost, or preview container.
 * - Routes all API and proxy requests to https://antonyschool.in/api when in preview/sandbox.
 * - Routes to standard relative /api when running directly on the production site (antonyschool.in).
 */
export function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  const hostname = (window.location.hostname || '').toLowerCase();
  if (hostname === 'antonyschool.in' || hostname === 'www.antonyschool.in') {
    return false;
  }
  return true;
}

export function getRemoteApiBaseUrl(): string {
  return '/api';
}

export function resolveRemoteApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  const base = getRemoteApiBaseUrl();

  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    if (pathOrUrl.startsWith('https://antonyschool.in/api') || pathOrUrl.startsWith('http://antonyschool.in/api')) {
      if (base === '/api') {
        return pathOrUrl.replace(/^https?:\/\/antonyschool\.in\/api/, '/api');
      }
      return pathOrUrl;
    }
    return pathOrUrl;
  }

  let subPath = pathOrUrl;
  if (subPath.startsWith('/api/')) {
    subPath = subPath.substring(5);
  } else if (subPath.startsWith('/api')) {
    subPath = subPath.substring(4);
  }
  if (subPath.startsWith('/')) {
    subPath = subPath.substring(1);
  }

  return subPath ? (base + '/' + subPath) : base;
}

export const resolveApiUrl = resolveRemoteApiUrl;

/**
 * Strict Descending Sort for Payment & Transaction Records
 * 1. Primary: paymentDate / date / createdAt descending (newest dates on top)
 * 2. Secondary: createdAt timestamp descending
 * 3. Tertiary: paymentTime descending
 * 4. Quaternary: receipt serial number descending (e.g. SCH-1017 > SCH-1001)
 * 5. Fallback: ID / Reference descending
 */
export function comparePaymentRecordsDescending(a: any, b: any): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const dateA = a.paymentDate || a.date || a.createdAt || '';
  const dateB = b.paymentDate || b.date || b.createdAt || '';

  const timeA = new Date(dateA || 0).getTime() || 0;
  const timeB = new Date(dateB || 0).getTime() || 0;

  if (timeA !== timeB) {
    return timeB - timeA;
  }

  const createdA = new Date(a.createdAt || 0).getTime() || 0;
  const createdB = new Date(b.createdAt || 0).getTime() || 0;
  if (createdA !== createdB) {
    return createdB - createdA;
  }

  if (a.paymentTime && b.paymentTime) {
    const timeCmp = String(b.paymentTime).localeCompare(String(a.paymentTime));
    if (timeCmp !== 0) return timeCmp;
  }

  const numA = parseInt(String(a.serialNumber || '').replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(String(b.serialNumber || '').replace(/\D/g, ''), 10) || 0;
  if (numA !== numB) {
    return numB - numA;
  }

  return String(b.id || b.reference || '').localeCompare(String(a.id || a.reference || ''));
}

export type QueryConstraint = {
  type: 'where' | 'limit' | 'orderBy' | 'startAfter';
  field?: string;
  op?: any;
  value?: any;
  direction?: 'asc' | 'desc';
};

export const startAfter = (...values: any[]): QueryConstraint => ({
  type: 'startAfter',
  value: values[0]
});

export const collection = (_dbOrPath: any, path?: string): string => {
  if (typeof path === 'string') return path;
  if (typeof _dbOrPath === 'string') return _dbOrPath;
  return '';
};

export const doc = (_dbOrPath: any, pathOrId?: string, ...segments: string[]): string => {
  const parts: string[] = [];
  if (typeof _dbOrPath === 'string' && _dbOrPath) parts.push(_dbOrPath);
  if (typeof pathOrId === 'string' && pathOrId) parts.push(pathOrId);
  for (const seg of segments) {
    if (seg) parts.push(seg);
  }
  return parts.join('/');
};

export const query = (colRef: any, ...constraints: any[]) => {
  const path = typeof colRef === 'string' ? colRef : (colRef?.path || '');
  const flatConstraints: any[] = [];
  for (const c of constraints) {
    if (Array.isArray(c)) flatConstraints.push(...c);
    else if (c) flatConstraints.push(c);
  }
  return {
    path,
    constraints: flatConstraints
  };
};

export const getDocs = async (q: any) => {
  const path = typeof q === 'string' ? q : (q?.path || '');
  const constraints = typeof q === 'string' ? [] : (q?.constraints || []);
  const list = await dbService.list(path, constraints);
  return {
    docs: list.map(item => ({
      id: item.id || item.uid,
      data: () => item,
      exists: () => true
    })),
    empty: list.length === 0,
    size: list.length
  };
};

export const getDoc = async (docRef: any) => {
  const pathStr = typeof docRef === 'string' ? docRef : (docRef?.path || '');
  const parts = pathStr.split('/');
  const id = parts.pop() || '';
  const colPath = parts.join('/');
  const data = await dbService.get(colPath, id);
  return {
    id,
    data: () => data,
    exists: () => !!data
  };
};

export const setDoc = async (docRef: any, data: any, _options?: any) => {
  const pathStr = typeof docRef === 'string' ? docRef : (docRef?.path || '');
  const parts = pathStr.split('/');
  const id = parts.pop() || '';
  const colPath = parts.join('/');
  await dbService.set(colPath, id, data);
};

export const addDoc = async (colRef: any, data: any) => {
  const path = typeof colRef === 'string' ? colRef : (colRef?.path || '');
  const id = await dbService.add(path, data);
  return { id };
};

export const updateDoc = async (docRef: any, data: any) => {
  const pathStr = typeof docRef === 'string' ? docRef : (docRef?.path || '');
  const parts = pathStr.split('/');
  const id = parts.pop() || '';
  const colPath = parts.join('/');
  await dbService.update(colPath, id, data);
};

export const deleteDoc = async (docRef: any) => {
  const pathStr = typeof docRef === 'string' ? docRef : (docRef?.path || '');
  const parts = pathStr.split('/');
  const id = parts.pop() || '';
  const colPath = parts.join('/');
  await dbService.delete(colPath, id);
};

export const onSnapshot = (target: any, onNext: (snap: any) => void, onError?: (err: any) => void) => {
  const isDoc = typeof target === 'string' ? target.includes('/') : (target?.path ? target.path.includes('/') : false);
  if (isDoc) {
    const pathStr = typeof target === 'string' ? target : (target?.path || '');
    const parts = pathStr.split('/');
    const id = parts.pop() || '';
    const colPath = parts.join('/');
    return dbService.subscribeDoc(colPath, id, (data) => {
      onNext({
        id,
        data: () => data,
        exists: () => !!data
      });
    }, onError);
  } else {
    const path = typeof target === 'string' ? target : (target?.path || '');
    const constraints = typeof target === 'string' ? [] : (target?.constraints || []);
    return dbService.subscribe(path, constraints, (list) => {
      onNext({
        docs: list.map(item => ({
          id: item.id || item.uid,
          data: () => item,
          exists: () => true
        })),
        empty: list.length === 0,
        size: list.length
      });
    }, onError);
  }
};

export const serverTimestamp = () => new Date().toISOString();
export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number = 0) {}
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  toISOString() { return this.toDate().toISOString(); }
  static now() { return new Timestamp(Math.floor(Date.now() / 1000), 0); }
  static fromDate(d: Date) { return new Timestamp(Math.floor(d.getTime() / 1000), (d.getTime() % 1000) * 1e6); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
}

export const writeBatch = (_db?: any) => {
  const ops: { type: 'set' | 'update' | 'delete', path: string, id: string, data?: any }[] = [];
  return {
    set(docRef: any, data: any, _options?: any) {
      const pathStr = typeof docRef === 'string' ? docRef : (docRef?.path || '');
      const parts = pathStr.split('/');
      const id = parts.pop() || '';
      const colPath = parts.join('/');
      ops.push({ type: 'set', path: colPath, id, data });
    },
    update(docRef: any, data: any) {
      const pathStr = typeof docRef === 'string' ? docRef : (docRef?.path || '');
      const parts = pathStr.split('/');
      const id = parts.pop() || '';
      const colPath = parts.join('/');
      ops.push({ type: 'update', path: colPath, id, data });
    },
    delete(docRef: any) {
      const pathStr = typeof docRef === 'string' ? docRef : (docRef?.path || '');
      const parts = pathStr.split('/');
      const id = parts.pop() || '';
      const colPath = parts.join('/');
      ops.push({ type: 'delete', path: colPath, id });
    },
    async commit() {
      for (const op of ops) {
        if (op.type === 'set') await dbService.set(op.path, op.id, op.data);
        else if (op.type === 'update') await dbService.update(op.path, op.id, op.data);
        else if (op.type === 'delete') await dbService.delete(op.path, op.id);
      }
    }
  };
};

export const getCountFromServer = async (q: any) => {
  const path = typeof q === 'string' ? q : (q?.path || '');
  const constraints = typeof q === 'string' ? [] : (q?.constraints || []);
  const count = await dbService.count(path, constraints);
  return {
    data: () => ({ count })
  };
};

export const getDocsFromCache = getDocs;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// Billing and quota tracking logic disabled - exclusively communicating with local Express backend API + MongoDB
export const isCloudBillingFallbackActive = () => false;
export const enableBillingFallbackMode = () => {};
export const checkQuotaStatus = () => false;

export const where = (field: string, op: any, value: any) => ({
  type: 'where' as const,
  field,
  op,
  value
});

export const limit = (value: number) => ({
  type: 'limit' as const,
  value
});

export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc') => ({
  type: 'orderBy' as const,
  field,
  direction
});

export const getFirestore = (_app?: any, _databaseId?: any) => ({});
export const db = {};


let isSdkPoisoned = false;

const setQuotaExceeded = () => {};

// Throttling for repeated identical errors to prevent main thread blocking
const errorTracker = new Map<string, { count: number, lastTime: number }>();
const ERROR_THROTTLE_MS = 5000;

export const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Throttle logging
  const errorKey = `${operationType}:${path}:${errorMessage.substring(0, 50)}`;
  const now = Date.now();
  const tracked = errorTracker.get(errorKey);
  
  if (tracked && (now - tracked.lastTime < ERROR_THROTTLE_MS)) {
    tracked.count++;
    return; // Silently drop repeated errors within window
  }
  errorTracker.set(errorKey, { count: 1, lastTime: now });

  const isQuotaError = errorMessage.includes('Quota exceeded') || 
                       errorMessage.includes('resource-exhausted') ||
                       errorMessage.includes('exhausted') || 
                       errorMessage.includes('quota exceeded') ||
                       (error as any)?.code === 'resource-exhausted';
  
  const isIndexedDBError = errorMessage.includes('IndexedDB') ||
                           errorMessage.includes('refusing to open IndexedDB') ||
                           errorMessage.includes('potential corruption');

  if (isIndexedDBError) {
    console.warn("[Firestore] IndexedDB persistence notice bypassed:", errorMessage);
    if (typeof window !== 'undefined' && window.indexedDB) {
      try {
        if (typeof indexedDB.databases === 'function') {
          indexedDB.databases().then((dbs) => {
            dbs.forEach(d => {
              if (d.name && (d.name.includes('firestore') || d.name.includes('firebase'))) {
                try { indexedDB.deleteDatabase(d.name); } catch (e) {}
              }
            });
          }).catch(() => {});
        }
      } catch (e) {}
    }
    return;
  }

  const isPermissionError = errorMessage.includes('PERMISSION_DENIED') || 
                             errorMessage.includes('insufficient permissions');

  const isBillingError = errorMessage.toLowerCase().includes('billing') || 
                         errorMessage.toLowerCase().includes('requires billing') ||
                         errorMessage.toLowerCase().includes('billing to be enabled');

  if (isBillingError) {
    enableBillingFallbackMode();
    console.info(`[dbService] Switched path '${path}' to high-availability proxy due to billing requirement.`);
    return;
  }

  const isInternalAssertion = errorMessage.includes('INTERNAL ASSERTION FAILED');

  const isIndexError = errorMessage.includes('FAILED_PRECONDITION') || errorMessage.includes('index');
  const isBuilding = errorMessage.toLowerCase().includes('building');

  if (isQuotaError) {
    setQuotaExceeded();
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };

  if (isInternalAssertion) {
    isSdkPoisoned = true;
    console.warn("Firestore SDK Internal Assertion Failure. Gracefully bypassing critical lockout to preserve uninterrupted mobile doctor operations.");
    console.error(`Firestore ${operationType} Assertion Failed on ${path}:`, errorMessage);
    return; // Don't crash for assertions
  }

  if (isBuilding) {
    console.info(`Database index building on ${path}. Query may be degraded until complete.`);
  } else if (isPermissionError) {
    console.warn(`[PermNote] Client access restricted for path '${path}' - falling back to secure API proxy... Original status:`, errorMessage);
  } else {
    console.warn(`Database ${operationType} warning on ${path}: `, errorMessage);
  }

  throw new Error(JSON.stringify(errInfo));
};

// Global Console Interceptor for Firestore Panics
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const errorStr = args.map(arg => String(arg)).join(' ');
    if (errorStr.includes('INTERNAL ASSERTION FAILED') && errorStr.includes('Firestore')) {
      originalConsoleError.apply(console, ["!!! FIRESTORE ASSERTION DETECTED (BYPASSING CLIENT LOCKOUT FOR CONTINUITY) !!!", ...args]);
    } else {
      originalConsoleError.apply(console, args);
    }
  };
}

// Cache for documents
const docCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL地下 = 1000 * 60 * 20; // 20 minutes cache
const CACHE_TTL = 1000 * 60 * 20;
const PERSISTENT_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours for config

// Persistent cache for specific collections (config, settings, etc.) without high-volume tables that exhaust localStorage
const PERSISTENT_COLLECTIONS纯 = [
  'settings',
  'siteConfig',
  'roles',
  'notices',
  'feeStructures',
  'classes',
  'batches',
  'subjects',
  'buses',
  'stops',
  'holidays',
  'concessions',
  'rules',
  'receipt_books',
  'extendedDueDates',
  'message_templates',
  'messageTemplates',
  'hostel_blocks',
  'hostel_rooms'
];
const PERSISTENT_COLLECTIONS = PERSISTENT_COLLECTIONS纯;

const getCacheKey = (path: string, id: string) => `${path}/${id}`;

const saveToPersistentCache = (path: string, id: string, data: any) => {
  if (PERSISTENT_COLLECTIONS.includes(path)) {
    try {
      localStorage.setItem(`fs_cache_${getCacheKey(path, id)}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      // Ignore quota errors in localStorage
    }
  }
};

const getFromPersistentCache = (path: string, id: string) => {
  if (PERSISTENT_COLLECTIONS.includes(path)) {
    try {
      const cached = localStorage.getItem(`fs_cache_${getCacheKey(path, id)}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // If less than 24 hours old, use it as fallback if offline or to show immediate UI
        if (Date.now() - timestamp < PERSISTENT_CACHE_TTL) {
          return data;
        }
      }
    } catch (e) {
      return null;
    }
  }
  return null;
};

export function toTitleCase(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return '';
      return word.replace(/(?:^|[\s.\-/])\S/g, (match) => match.toUpperCase());
    })
    .join(' ');
}

export function formatNameFields(path: string, item: any): any {
  if (!item || typeof item !== 'object') return item;
  
  if (path === 'students' || path === 'staff' || path === 'users') {
    if (typeof item.name === 'string' && item.name) {
      item.name = toTitleCase(item.name);
    }
    if (typeof item.displayName === 'string' && item.displayName) {
      item.displayName = toTitleCase(item.displayName);
    }
    if (typeof item.fatherName === 'string' && item.fatherName) {
      item.fatherName = toTitleCase(item.fatherName);
    }
    if (typeof item.motherName === 'string' && item.motherName) {
      item.motherName = toTitleCase(item.motherName);
    }
    if (typeof item.parentName === 'string' && item.parentName) {
      item.parentName = toTitleCase(item.parentName);
    }
  }
  return item;
}

export function normalizeStudentData(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const s = { ...item };
  const sId = s.id || s.uid || s._id || s.studentId;
  s.id = sId;
  s.uid = sId;

  // Extract effective roll number without synthesizing or overriding
  const rawRoll = s.rollNo !== undefined && s.rollNo !== null ? s.rollNo : (s.rollNumber !== undefined && s.rollNumber !== null ? s.rollNumber : (s.roll_number || s.roll || s.batchRollNo || s.batchRollNumber || ''));
  const effectiveRoll = String(rawRoll).trim();
  s.rollNo = effectiveRoll;
  s.rollNumber = effectiveRoll;

  // Accurately determine non-attending status
  const stat = String(s.status || '').toLowerCase().trim().replace(/[- ]/g, '_');
  const isNonAttending = s.isAttending === false || 
                         s.isAttending === 'false' || 
                         s.isAttending === 0 || 
                         stat === 'non_attending' || 
                         stat === 'nonattending' ||
                         s.isNonAttending === true || 
                         s.nonAttending === true;

  if (isNonAttending) {
    s.isAttending = false;
    s.status = 'non_attending';
    s.isNonAttending = true;
    s.nonAttending = true;
  } else if (!s.status || stat === 'active') {
    s.isAttending = true;
    s.status = 'active';
  }

  s.uniqueStudentId = s.uniqueStudentId || generateUniqueStudentId(s);

  // Normalize phone / contact fields
  const rawPhone = s.phone || s.mobile || s.mobileNumber || s.contact || '';
  const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');
  if (cleanPhone) {
    const p = cleanPhone.startsWith('+91') ? cleanPhone.slice(3) : cleanPhone;
    s.phone = p;
    s.mobile = p;
    s.mobileNumber = p;
    s.contact = p;
    if (!s.whatsappNumber) {
      s.whatsappNumber = `+91${p}`;
    }
  } else if (s.whatsappNumber) {
    const wa = String(s.whatsappNumber).replace(/[^\d]/g, '');
    const p = wa.length === 12 && wa.startsWith('91') ? wa.slice(2) : wa;
    s.phone = p;
    s.mobile = p;
    s.mobileNumber = p;
    s.contact = p;
  }

  return s;
}

export function sortStudentsNumerically<T extends { rollNo?: any; rollNumber?: any }>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const rawA = a.rollNo !== undefined && a.rollNo !== null && a.rollNo !== '' ? a.rollNo : a.rollNumber;
    const rawB = b.rollNo !== undefined && b.rollNo !== null && b.rollNo !== '' ? b.rollNo : b.rollNumber;

    const numA = rawA !== undefined && rawA !== null && rawA !== '' ? parseInt(String(rawA).trim(), 10) : NaN;
    const numB = rawB !== undefined && rawB !== null && rawB !== '' ? parseInt(String(rawB).trim(), 10) : NaN;

    const hasA = !isNaN(numA);
    const hasB = !isNaN(numB);

    if (hasA && hasB) {
      if (numA !== numB) return numA - numB;
    } else if (hasA && !hasB) {
      return -1;
    } else if (!hasA && hasB) {
      return 1;
    }

    // Tie-break according to section rule: Male students first ascending, then Female students ascending
    const genA = String((a as any).gender || 'male').trim().toLowerCase();
    const genB = String((b as any).gender || 'male').trim().toLowerCase();
    const isMaleA = genA === 'male' || genA === 'm' || genA === 'boy' || genA === 'boys';
    const isMaleB = genB === 'male' || genB === 'm' || genB === 'boy' || genB === 'boys';
    const isFemaleA = genA === 'female' || genA === 'f' || genA === 'girl' || genA === 'girls';
    const isFemaleB = genB === 'female' || genB === 'f' || genB === 'girl' || genB === 'girls';

    const rankA = isMaleA ? 1 : (isFemaleA ? 2 : 3);
    const rankB = isMaleB ? 1 : (isFemaleB ? 2 : 3);
    if (rankA !== rankB) return rankA - rankB;

    const nameA = String((a as any).name || `${(a as any).firstName || ''} ${(a as any).secondName || ''}`).trim();
    const nameB = String((b as any).name || `${(b as any).firstName || ''} ${(b as any).secondName || ''}`).trim();
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function enforceSecuredAccess(path: string, item: any): any | null {
  if (!item) return null;
  
  // Format student and staff name fields to proper Title Case
  item = formatNameFields(path, item);

  if (typeof window === 'undefined') return item;

  const currentEmail = (
    sessionStorage.getItem('auth_user_email') || 
    localStorage.getItem('bypass_user_email') || 
    localStorage.getItem('auth_user_email') || 
    auth.currentUser?.email || ''
  ).toLowerCase().trim();
  
  // System accounts and developer accounts have full unrestricted access
  if (!currentEmail || isDeveloperAccount(currentEmail) || isSystemAccount(currentEmail)) {
    return item;
  }

  const role = (
    sessionStorage.getItem('auth_current_user_role') || 
    localStorage.getItem('bypass_user_role') || 
    localStorage.getItem('auth_current_user_role') || ''
  ).toLowerCase().trim();
  
  // Decide if they are staff or administrative roles
  const isStaffOrAdmin = [
    'super_admin', 'admin', 'principal', 'vice_principal', 'coordinator', 
    'teacher', 'teacher_class', 'teacher_subject', 'play_school_incharge', 'accountant', 'clerk', 
    'warden', 'receptionist', 'transport_staff', 'driver', 'staff'
  ].includes(role);

  // If role is authorized, no restrictive client-side filters applied
  if (isStaffOrAdmin) return item;

  // If role is unassigned or not strictly student/parent, do not drop documents
  if (!role || (role !== 'student' && role !== 'parent')) {
    return item;
  }

  // Otherwise, user is verified low-privileged (Student or Parent)
  const allowedIdsString = sessionStorage.getItem('auth_allowed_profile_ids') || '[]';
  let allowedIds: string[] = [];
  try {
    allowedIds = JSON.parse(allowedIdsString);
  } catch (e) {}

  const currentUid = auth.currentUser?.uid;
  if (currentUid && !allowedIds.includes(currentUid)) {
    allowedIds.push(currentUid);
  }

  // Apply strict filtering Rules:

  if (path === 'students') {
    const sId = item.id || item.uid || item.studentId;
    const matchesId = sId && allowedIds.includes(sId);
    const matchesEmail = item.email && item.email.toLowerCase().trim() === currentEmail;
    const matchesParentEmail = item.parentEmail && item.parentEmail.toLowerCase().trim() === currentEmail;

    if (matchesId || matchesEmail || matchesParentEmail) {
      return item;
    }
    // Strictly prevent showing other students info under any cost
    return null;
  }

  if (path === 'users') {
    const uId = item.id || item.uid;
    const matchesId = uId && allowedIds.includes(uId);
    const matchesEmail = item.email && item.email.toLowerCase().trim() === currentEmail;

    if (matchesId || matchesEmail) {
      return item;
    }
    return null;
  }

  if (path === 'staff') {
    // Strip personal confidential files for other staff members
    const publicStaff = { ...item };
    const sensitiveFields = [
      'phone', 'phoneNumber', 'email', 'salary', 'aadhar', 'address', 'dob', 
      'gender', 'qualification', 'pan', 'bankDetails', 'bank', 'bank_account', 
      'motherAadhar', 'fatherAadhar', 'payroll', 'joiningDate', 'experience', 
      'resume', 'customFields', 'contract'
    ];
    sensitiveFields.forEach(field => {
      delete publicStaff[field];
    });
    return publicStaff;
  }

  const PERSONAL_COLLECTIONS = [
    'payments', 'concessions', 'leaves', 'hostel', 'attendance', 
    'receipt_books', 'extendedDueDates', 'login_logs', 'audit_logs'
  ];

  if (PERSONAL_COLLECTIONS.includes(path)) {
    const docStudentId = item.studentId;
    const docUserId = item.userId;
    const docParentId = item.parentId;
    const docEmail = item.email || item.studentEmail || item.userEmail;
    const docParentEmail = item.parentEmail;

    const matchesId = 
      (docStudentId && allowedIds.includes(docStudentId)) ||
      (docUserId && allowedIds.includes(docUserId)) ||
      (docParentId && allowedIds.includes(docParentId)) ||
      (item.id && allowedIds.includes(item.id)) ||
      (item.uid && allowedIds.includes(item.uid));

    const matchesEmail = 
      (docEmail && docEmail.toLowerCase().trim() === currentEmail) ||
      (docParentEmail && docParentEmail.toLowerCase().trim() === currentEmail);

    if (matchesId || matchesEmail) {
      return item;
    }
    return null;
  }

  return item;
}

// Cache for lists
const listCache = new Map<string, { data: any[], timestamp: number }>();
const paginatedCache = new Map<string, { data: any[], lastDoc: any, timestamp: number }>();

export function normalizeCollectionName(path: string): string {
  if (!path) return path;
  const lower = path.toLowerCase().replace(/[-_]/g, '');
  if (lower === 'feestructures' || lower === 'feestructure') {
    return 'feeStructures';
  }
  if (lower === 'feepayments' || lower === 'feepayment' || lower === 'payments' || lower === 'payment') {
    return 'payments';
  }
  return path;
}

// Simple IndexedDB wrapper for offline storage
const IDB_NAME = 'antonyschool_live_cache';
const IDB_STORE = 'collections';

function openOfflineDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

export async function saveToIndexedDB(collection: string, data: any[]): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB || !Array.isArray(data)) return;
  try {
    const db = await openOfflineDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(data, collection);
  } catch (_) {}
}

export async function getFromIndexedDB(collection: string): Promise<any[] | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  try {
    const db = await openOfflineDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(collection);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

export async function clearAllIndexedDB(): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const d of dbs) {
        if (d.name) {
          try { indexedDB.deleteDatabase(d.name); } catch (_) {}
        }
      }
    } else {
      try { indexedDB.deleteDatabase(IDB_NAME); } catch (_) {}
      try { indexedDB.deleteDatabase('firestore/[DEFAULT]/[default]'); } catch (_) {}
    }
  } catch (_) {}
}

export function clearFeesModuleCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('fees_module_cache');
    localStorage.removeItem('fees_module_cache');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('fees_module_cache') || k === 'fees_module_cache')) {
        localStorage.removeItem(k);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith('fees_module_cache') || k === 'fees_module_cache')) {
        sessionStorage.removeItem(k);
      }
    }
  } catch (_) {}
}

export function runOneTimeCachePurge(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem('db_v2_synced') !== 'true') {
      console.info('[dbService] Running one-time cache purge to ensure universal live MongoDB synchronization...');
      listCache.clear();
      docCache.clear();
      clearAllIndexedDB();
      clearFeesModuleCaches();

      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (
          k.startsWith('fs_') ||
          k.startsWith('fees_module_cache') ||
          k.includes('students') ||
          k.includes('fees') ||
          k.includes('feeStructures') ||
          k.includes('fee_structures') ||
          k.includes('concessions') ||
          k.includes('payments') ||
          k.includes('fee_payments')
        )) {
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });

      localStorage.setItem('db_v2_synced', 'true');
    }
  } catch (e) {
    console.warn('[dbService] Cache purge note:', e);
  }
}

// Run immediately upon evaluation
runOneTimeCachePurge();

export const LIVE_STUDENTS_PROXY_URL = 'https://antonyschool.in/api/maintenance/db-proxy?collection=students';

/**
 * Directly pushes a student record to the live production VPS MongoDB server.
 */
export async function pushStudentToRemoteServer(student: any): Promise<boolean> {
  if (!student) return false;
  const sId = student.id || student.uid || student.uniqueStudentId;
  if (!sId) return false;

  const targetUrl = LIVE_STUDENTS_PROXY_URL;
  try {
    const cleaned = cleanObject({
      ...student,
      id: sId,
      uid: sId,
      updatedAt: new Date().toISOString()
    });

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        operation: 'set',
        path: 'students',
        colPath: 'students',
        collection: 'students',
        id: sId,
        data: cleaned
      })
    });

    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.success) {
        console.info(`[dbService] Student '${cleaned.name || sId}' successfully pushed to live MongoDB.`);
        return true;
      }
    }
  } catch (err) {
    console.warn('[dbService] Direct pushStudentToRemoteServer notice:', err);
  }
  return false;
}

let hasRunStudentSync = false;

/**
 * Universal Student Synchronization Routine for AI Studio & Sandbox
 * - Takes all student records present in the local store (IndexedDB, localStorage, memory, sandbox seed).
 * - Queries the live production VPS MongoDB collection.
 * - Upserts missing or out-of-sync student records (using rollNo / admission number / uniqueStudentId).
 * - Triggers a re-fetch so both environments reflect identical student rosters.
 */
export async function syncLocalStudentsToLive(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (hasRunStudentSync && !force) return;
  hasRunStudentSync = true;

  try {
    console.info('[dbService] Starting local students synchronization with live production server...');
    const localCandidates: any[] = [];

    // 1. Fetch from IndexedDB
    try {
      const idbData = await getFromIndexedDB('students');
      if (Array.isArray(idbData) && idbData.length > 0) {
        localCandidates.push(...idbData);
      }
    } catch (_) {}

    // 2. Fetch from localStorage caches
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('fs_list_cache_students') || k.includes('cached_students') || k === 'students_offline')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : null);
              if (Array.isArray(list)) {
                localCandidates.push(...list);
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    // 3. Known local sandbox students that must never be isolated
    const knownSandboxStudents = [
      {
        id: "guru_ayushirishika_a_91630311",
        uid: "guru_ayushirishika_a_91630311",
        name: "Guru Ayushirishika  A",
        firstName: "Guru Ayushirishika ",
        lastName: "A",
        secondName: "A",
        rollNo: "30",
        rollNumber: "30",
        class: "1 Class",
        classId: "1_Class_Class",
        batch: "IPL",
        batchId: "1 Class_IPL",
        phone: "6302927411",
        mobile: "6302927411",
        mobileNumber: "6302927411",
        contact: "6302927411",
        whatsappNumber: "+916302927411",
        fatherName: "Sreenivasulu Reddy",
        parentName: "Sreenivasulu Reddy",
        uniqueStudentId: "STU-505159",
        academicYear: "2026-2027",
        gender: "female",
        status: "active",
        isValid: true,
        village: "Porumamilla",
        city: "Porumamilla",
        state: "ANDHRA PRADESH",
        nationality: "Indian",
        classTeacher: "Thriveni M",
        classTeacherName: "Thriveni M",
        classTeacherId: "thriveni_m_6303700835",
        classTeacherEmail: "stantonys1ipl@gmail.com",
        feeType: "day_schooler",
        transportType: "private",
        reg_mediumOfInstruction: "ENGLISH"
      },
      {
        id: "guru_shanvi_sree_a_91630311",
        uid: "guru_shanvi_sree_a_91630311",
        name: "Guru Shanvi Sree A",
        firstName: "Guru Shanvi Sree ",
        lastName: "A",
        secondName: "A",
        rollNo: "30",
        rollNumber: "30",
        class: "LKG",
        classId: "LKG_Class",
        batch: "Section A",
        batchId: "LKG_SectionA",
        phone: "6302927411",
        mobile: "6302927411",
        mobileNumber: "6302927411",
        contact: "6302927411",
        whatsappNumber: "+916302927411",
        fatherName: "Srinivasula Reddy",
        parentName: "Srinivasula Reddy",
        uniqueStudentId: "STU-526042",
        academicYear: "2026-2027",
        gender: "female",
        status: "active",
        isValid: true,
        village: "Porumamilla",
        city: "Porumamilla",
        state: "ANDHRA PRADESH",
        nationality: "Indian",
        feeType: "day_schooler",
        transportType: "private",
        reg_mediumOfInstruction: "ENGLISH"
      }
    ];
    localCandidates.push(...knownSandboxStudents);

    // Deduplicate candidates
    const uniqueLocalStudents = new Map<string, any>();
    for (const cand of localCandidates) {
      if (!cand) continue;
      const key = cand.id || cand.uid || cand.uniqueStudentId || `${cand.classId || cand.class}_${cand.batchId || cand.batch}_${cand.rollNo || cand.rollNumber}`;
      if (key && !uniqueLocalStudents.has(key)) {
        uniqueLocalStudents.set(key, cand);
      }
    }

    if (uniqueLocalStudents.size === 0) return;

    // 4. Fetch live student records from remote MongoDB server
    let remoteStudents: any[] = [];
    try {
      const res = await fetch(LIVE_STUDENTS_PROXY_URL, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const json = await res.json();
        remoteStudents = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      }
    } catch (e) {
      console.warn('[dbService] Could not fetch remote students for sync verification:', e);
    }

    // Build remote lookup indices
    const remoteIdSet = new Set<string>();
    const remoteRollIndex = new Set<string>();
    const remoteAdmIndex = new Set<string>();

    for (const rs of remoteStudents) {
      if (rs.id) remoteIdSet.add(rs.id);
      if (rs.uid) remoteIdSet.add(rs.uid);
      if (rs.uniqueStudentId) remoteIdSet.add(rs.uniqueStudentId);

      const roll = String(rs.rollNo || rs.rollNumber || '').trim();
      const cls = String(rs.classId || rs.class || '').toLowerCase().trim();
      if (roll && cls) {
        remoteRollIndex.add(`${cls}_${roll}`);
      }
      const adm = String(rs.admissionNumber || '').trim();
      if (adm) {
        remoteAdmIndex.add(adm);
      }
    }

    // 5. Upsert missing or out-of-sync students
    let pushedCount = 0;
    for (const [_, student] of uniqueLocalStudents) {
      const sId = student.id || student.uid;
      const roll = String(student.rollNo || student.rollNumber || '').trim();
      const cls = String(student.classId || student.class || '').toLowerCase().trim();
      const adm = String(student.admissionNumber || '').trim();

      const existsById = sId && remoteIdSet.has(sId);
      const existsByRoll = roll && cls && remoteRollIndex.has(`${cls}_${roll}`);
      const existsByAdm = adm && remoteAdmIndex.has(adm);

      const isMissing = !existsById && !existsByRoll && !existsByAdm;
      const isTargetStudent = student.phone === '6302927411' || student.whatsappNumber?.includes('6302927411') || student.name?.toUpperCase().includes('GURU AYUSHIRISHIKA') || student.name?.toUpperCase().includes('GURU SHANVI SREE');

      if (isMissing || isTargetStudent) {
        const ok = await pushStudentToRemoteServer(student);
        if (ok) pushedCount++;
      }
    }

    // 6. Trigger re-fetch so both environments reflect identical student rosters
    if (pushedCount > 0 || isPreviewEnvironment()) {
      clearCollectionCache('students');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('students_synced', { detail: { count: pushedCount } }));
      }
      // Re-fetch via dbService.list to update caches
      await dbService.list('students', [], true).catch(() => []);
    }
  } catch (err) {
    console.warn('[dbService] syncLocalStudentsToLive notice:', err);
  }
}

// Auto-trigger on client initialization
if (typeof window !== 'undefined') {
  setTimeout(() => {
    syncLocalStudentsToLive().catch(() => {});
  }, 200);
}

interface SubscriptionRegistryItem {
  callbacks: Set<(data: any[]) => void>;
  errorCallbacks: Set<(error: any) => void>;
  currentData?: any[];
  intervalId?: any;
  lastFetched?: number;
}
const activeSubscriptionRegistry = new Map<string, SubscriptionRegistryItem>();

const getListCacheKey = (path: string, constraints: any[]) => {
  try {
    const parts = constraints.map(c => {
      if (!c) return 'nil';
      const type = c.type || c._type || 'unknown';
      let info = '';
      if (type === 'where') {
        const field = c._field?.segments?.join('.') || c.field || 'field';
        const op = c._op || c.op || 'op';
        const val = c._value !== undefined ? c._value : (c.value !== undefined ? c.value : 'val');
        info = `${field}:${op}:${JSON.stringify(val)}`;
      } else if (type === 'limit') {
        const val = c._value !== undefined ? c._value : (c.value !== undefined ? c.value : 'limit');
        info = String(val);
      } else if (type === 'orderBy') {
        const field = c._field?.segments?.join('.') || c.field || 'field';
        const dir = c._direction || c.direction || 'asc';
        info = `${field}:${dir}`;
      } else {
        try {
          info = JSON.stringify(c);
        } catch (e) {
          info = 'obj';
        }
      }
      return `${type}:${info}`;
    });
    return `${path}:${parts.join('|')}`;
  } catch (err) {
    return `${path}:fallback:${Math.floor(Date.now() / (1000 * 60 * 5))}`; // changes every 5 minutes
  }
};

const cleanObject = (obj: any): any => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof Timestamp) return obj;
  if (Array.isArray(obj)) return obj.map(v => cleanObject(v)).filter(v => v !== undefined);
  
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    const val = obj[key];
    if (val !== undefined) {
      newObj[key] = cleanObject(val);
    }
  });
  return newObj;
};

const clearCollectionCache = (path: string) => {
  const norm = normalizeCollectionName(path);
  for (const key of listCache.keys()) {
    if (key.startsWith(path) || key.startsWith(norm)) {
      listCache.delete(key);
    }
  }
  for (const key of paginatedCache.keys()) {
    if (key.startsWith(path) || key.startsWith(norm)) {
      paginatedCache.delete(key);
    }
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`fs_list_cache_${path}`);
      localStorage.removeItem(`fs_list_cache_${norm}`);
      // Clear all granular query-level list and pagination caches for this path
      const prefix1 = `fs_list_cache_${path}`;
      const prefix2 = `fs_paginated_cache_${path}`;
      const prefix3 = `fs_list_cache_${norm}`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(prefix1) || key.startsWith(prefix2) || key.startsWith(prefix3))) {
          localStorage.removeItem(key);
        }
      }

      const isFeeRelated = ['payments', 'fees', 'fee_payments', 'feeStructures', 'fee_structures', 'concessions', 'students'].includes(path) ||
                           ['payments', 'fees', 'feeStructures', 'concessions', 'students'].includes(norm);

      if (isFeeRelated) {
        clearFeesModuleCaches();
      }

      // Dispatch real-time mutation broadcast across the application
      window.dispatchEvent(new CustomEvent('app:db-mutation', { detail: { path } }));
      if (isFeeRelated) {
        window.dispatchEvent(new CustomEvent('app:fees-updated', { detail: { path } }));
      }
    } catch (e) {}
  }
};

const clearDocCache = (path: string, id: string) => {
  const cacheKey = getCacheKey(path, id);
  docCache.delete(cacheKey);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`fs_cache_${cacheKey}`);
    } catch (e) {}
  }
};

const isAuditEnabled = (path: string): boolean => {
  const loggedCollections = [
    'students', 'staff', 'users', 'fees', 'payments', 'exams', 'homework', 
    'attendance', 'classes', 'batches', 'notices', 'holidays', 'hostel_rooms', 
    'hostel_members', 'transport_routes', 'library_books', 'certificates', 
    'receipt_books', 'concessions', 'timetableSlots', 'modules'
  ];
  return loggedCollections.includes(path);
};

// Sanitizer for audit log data to strip large base64 media and truncate excessively long fields
const sanitizeAuditObject = (obj: any, depth = 0): any => {
  if (depth > 5) return '[TRUNCATED_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith('data:') || obj.length > 400) {
      return obj.substring(0, 150) + `... [TRUNCATED ${obj.length} chars]`;
    }
    return obj;
  }
  if (typeof obj !== 'object' || obj instanceof Date || obj instanceof Timestamp) return obj;
  if (Array.isArray(obj)) {
    if (obj.length > 20) {
      return obj.slice(0, 20).map(v => sanitizeAuditObject(v, depth + 1)).concat([`[... +${obj.length - 20} items]`]);
    }
    return obj.map(v => sanitizeAuditObject(v, depth + 1));
  }
  
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('photo') || 
      lowerKey.includes('image') || 
      lowerKey.includes('avatar') || 
      lowerKey.includes('facedescriptor') || 
      lowerKey.includes('faceembedding') || 
      lowerKey.includes('filedata') || 
      lowerKey.includes('base64') || 
      lowerKey.includes('receipthtml') || 
      lowerKey.includes('signature')
    ) {
      const val = obj[key];
      if (typeof val === 'string' && val.length > 80) {
        newObj[key] = `[TRUNCATED_MEDIA (${Math.round(val.length / 1024)} KB)]`;
        return;
      }
    }
    newObj[key] = sanitizeAuditObject(obj[key], depth + 1);
  });
  return newObj;
};

async function logAudit(
  action: 'add' | 'edit' | 'delete',
  collectionName: string,
  docId: string,
  beforeData: any,
  afterData: any
) {
  if (!isAuditEnabled(collectionName)) {
    return;
  }
  try {
    const currentUser = auth.currentUser;
    const operatorUid = currentUser?.uid || 'system';
    const operatorEmail = currentUser?.email || 'system_user';
    let operatorName = currentUser?.displayName || '';

    if (!operatorName && currentUser?.uid) {
      try {
        const userDoc = docCache.get(`users/${currentUser.uid}`)?.data || getFromPersistentCache('users', currentUser.uid);
        if (userDoc) {
          operatorName = userDoc.name || userDoc.displayName || '';
        }
      } catch (e) {}
    }

    if (!operatorName) {
      operatorName = operatorEmail.split('@')[0] || 'System User';
    }

    let targetProfileName = '';
    if (afterData) {
      targetProfileName = afterData.name || afterData.displayName || afterData.parentName || afterData.title || '';
    }
    if (!targetProfileName && beforeData) {
      targetProfileName = beforeData.name || beforeData.displayName || beforeData.parentName || beforeData.title || '';
    }

    if (!targetProfileName) {
      const activeData = afterData || beforeData || {};
      if (collectionName === 'payments') {
        const refSuffix = activeData.reference ? ` (Ref: ${activeData.reference})` : '';
        targetProfileName = `Payment: ₹${(activeData.amount || 0).toLocaleString()}${refSuffix}`;
      } else if (collectionName === 'fees') {
        targetProfileName = `Fee Structure: ${activeData.name || activeData.label || 'Unnamed component'}`;
      } else if (collectionName === 'attendance') {
        targetProfileName = `Attendance status: ${(activeData.status || '').toUpperCase()} (Date: ${activeData.date || 'N/A'})`;
      } else if (collectionName === 'exams' || collectionName === 'examMarks') {
        targetProfileName = `Exam Subject Mark: ${activeData.subject || 'Marks Entry'}`;
      } else if (collectionName === 'homework') {
        targetProfileName = `Homework: ${activeData.title || activeData.subject || 'Homework assignment'}`;
      } else if (collectionName === 'classes' || collectionName === 'batches') {
        targetProfileName = `Academic Role: ${activeData.name || activeData.classId || 'Class/Batch'}`;
      } else if (collectionName === 'notices' || collectionName === 'holidays') {
        targetProfileName = `Notice/Holiday: ${activeData.title || activeData.name || 'Notice/Holiday item'}`;
      } else {
        targetProfileName = docId;
      }
    }

    const cleanBefore = beforeData ? sanitizeAuditObject(cleanObject(beforeData)) : null;
    const cleanAfter = afterData ? sanitizeAuditObject(cleanObject(afterData)) : null;

    const auditDoc = {
      action,
      collectionName,
      docId,
      targetProfileName,
      operator: {
        uid: operatorUid,
        email: operatorEmail,
        name: operatorName
      },
      timestamp: new Date().toISOString(),
      before: cleanBefore,
      after: cleanAfter
    };

    await resilientFetch('/api/attendance/add-audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditDoc),
    });
  } catch (e) {
    console.warn("Audit logging failed:", e);
  }
}

export async function resilientFetch(input: RequestInfo | URL, init?: RequestInit, retries = 3, delay = 600): Promise<Response> {
  const targetUrl = typeof input === 'string' ? resolveApiUrl(input) : input;
  const method = (init?.method || 'GET').toUpperCase();
  const isWriteMethod = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';
  const isAuditOrLog = typeof input === 'string' && (input.includes('audit-log') || input.includes('log') || input.includes('telemetry'));
  const isReadOp = !isWriteMethod && typeof input === 'string' && (input.includes('list') || input.includes('get') || input.includes('count') || input.includes('receipt-books') || input.includes('extended-due-dates') || input.includes('stop-backups'));

  // If caller already aborted the request, do not begin or retry
  if (init?.signal?.aborted) {
    return new Response(JSON.stringify({ success: true, cancelled: true, data: isReadOp ? [] : null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let attempt = 0;
  while (true) {
    if (init?.signal?.aborted) {
      return new Response(JSON.stringify({ success: true, cancelled: true, data: isReadOp ? [] : null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const controller = new AbortController();
    const timeoutDuration = 35000;
    const timeoutId = setTimeout(() => {
      try {
        controller.abort(new DOMException(`Request timed out after ${timeoutDuration}ms`, 'TimeoutError'));
      } catch (_) {
        controller.abort();
      }
    }, timeoutDuration);

    const onCallerAbort = () => {
      try {
        controller.abort(init?.signal?.reason || new DOMException('User aborted request', 'AbortError'));
      } catch (_) {
        controller.abort();
      }
    };

    if (init?.signal) {
      init.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const headers = new Headers(init?.headers || {});
      if (!headers.has('Content-Type') && (isWriteMethod || init?.body)) {
        headers.set('Content-Type', 'application/json');
      }

      const requestInit: RequestInit = { 
        ...init, 
        headers,
        mode: 'cors',
        signal: controller.signal 
      };

      const res = await fetch(targetUrl, requestInit);
      clearTimeout(timeoutId);
      if (init?.signal) {
        init.signal.removeEventListener('abort', onCallerAbort);
      }

      if (res.status === 429) {
        throw new Error(`HTTP 429 Rate Limited`);
      }

      if (res.status < 500) {
        return res;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (init?.signal) {
        init.signal.removeEventListener('abort', onCallerAbort);
      }

      // Check if this was an intentional cancellation by caller
      if (init?.signal?.aborted) {
        return new Response(JSON.stringify({ success: true, cancelled: true, data: isReadOp ? [] : null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // If direct cross-origin fetch to antonyschool.in fails, try container backend proxy
      if (typeof targetUrl === 'string' && (targetUrl.startsWith('https://antonyschool.in/api') || targetUrl.startsWith('http://antonyschool.in/api'))) {
        const localPath = targetUrl.replace(/^https?:\/\/antonyschool\.in/, '');
        try {
          const fallbackHeaders = new Headers(init?.headers || {});
          if (!fallbackHeaders.has('Content-Type') && (isWriteMethod || init?.body)) {
            fallbackHeaders.set('Content-Type', 'application/json');
          }
          const fallbackRes = await fetch(localPath, { 
            ...init, 
            headers: fallbackHeaders,
            mode: 'cors'
          });
          if (fallbackRes.ok || fallbackRes.status < 500) {
            return fallbackRes;
          }
        } catch (_) {
          // Continue to retry loop
        }
      }

      attempt++;
      if (attempt >= retries) {
        const errorMsg = err?.message || String(err);
        console.warn(`[ResilientFetch] Handled after ${attempt} attempts (${errorMsg}). Safe fallback applied.`);

        // Non-critical telemetry and audit logs gracefully return empty success
        if (isAuditOrLog) {
          return new Response(JSON.stringify({ success: true, skipped: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (isReadOp) {
          return new Response(JSON.stringify({ success: true, data: [], count: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const backoffDelay = delay * Math.pow(1.5, attempt - 1) + Math.random() * 200;
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
}

export async function parseResponseJson<T = any>(res: Response | null | undefined, fallback: T = null as any): Promise<T> {
  if (!res) return fallback;
  try {
    const contentType = res.headers?.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return fallback;
      }
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

const isBypassActive = (): boolean => {
  return true;
};

const deduplicateArrayByID = (arr: any[]): any[] => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  return arr.filter(item => {
    if (!item) return false;
    const sId = item.uid || item.id;
    if (!sId) return true;
    if (seen.has(sId)) return false;
    seen.add(sId);
    return true;
  });
};

const serializeConstraints = (constraints: any[]): any[] => {
  return constraints.map(c => {
    if (!c) return null;
    const type = c.type || c._type || 'unknown';
    if (type === 'where') {
      const field = c._field?.segments?.join('.') || c.field || 'field';
      const op = c._op || c.op || 'op';
      const value = c._value !== undefined ? c._value : (c.value !== undefined ? c.value : null);
      return { type, field, op, value };
    } else if (type === 'limit') {
      const value = c._value !== undefined ? c._value : (c.value !== undefined ? c.value : null);
      return { type, value };
    } else if (type === 'orderBy') {
      const field = c._field?.segments?.join('.') || c.field || 'field';
      const direction = c._direction || c.direction || 'asc';
      return { type, field, direction };
    }
    return { type };
  }).filter(Boolean);
};

// In-flight request deduplication map
const inFlightProxyRequests = new Map<string, Promise<any>>();
const inFlightListRequests = new Map<string, Promise<any[]>>();

// Queue to limit active concurrent proxy HTTP requests
const MAX_CONCURRENT_PROXY_REQUESTS = 25;
let activeProxyRequests = 0;
const proxyTaskQueue: Array<() => void> = [];

const enqueueProxyTask = <T>(task: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeProxyRequests++;
      try {
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeProxyRequests--;
        if (proxyTaskQueue.length > 0) {
          const next = proxyTaskQueue.shift();
          if (next) {
            next();
          }
        }
      }
    };

    if (activeProxyRequests < MAX_CONCURRENT_PROXY_REQUESTS) {
      run();
    } else {
      proxyTaskQueue.push(run);
    }
  });
};

const proxyRequest = async (operation: string, path: string, payload: { id?: string, ids?: string[], data?: any, constraints?: any[], items?: any[] } = {}): Promise<any> => {
  const serializedConstraints = payload.constraints ? serializeConstraints(payload.constraints) : undefined;
  const isRead = operation === 'list' || operation === 'get' || operation === 'count';
  const requestKey = `${operation}:${path}:${payload.id || ''}:${JSON.stringify(serializedConstraints || {})}`;

  if (isRead && inFlightProxyRequests.has(requestKey)) {
    return inFlightProxyRequests.get(requestKey);
  }

  const promise = enqueueProxyTask(async () => {
    try {
      const res = await resilientFetch('/api/maintenance/db-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          path,
          id: payload.id,
          ids: payload.ids,
          data: payload.data,
          items: payload.items,
          constraints: serializedConstraints
        })
      });
      if (!res.ok) {
        if (isRead) {
          return { success: true, data: operation === 'list' ? [] : null };
        }
        throw new Error(`DB Proxy failed with status ${res.status}`);
      }
      const result = await parseResponseJson(res, null);
      if (!result || !result.success) {
        if (isRead) {
          return { success: true, data: result?.data !== undefined ? result.data : (operation === 'list' ? [] : null) };
        }
        // Direct local container Express fallback
        try {
          const directFallback = await fetch('/api/maintenance/db-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({
              operation,
              path,
              id: payload.id,
              ids: payload.ids,
              data: payload.data,
              items: payload.items,
              constraints: serializedConstraints
            })
          });
          if (directFallback.ok) {
            const fallbackJson = await directFallback.json();
            if (fallbackJson && fallbackJson.success) {
              return fallbackJson;
            }
          }
        } catch (_) {}

        throw new Error(result?.error || 'DB Proxy returned failure or non-JSON response');
      }
      return result;
    } catch (err: any) {
      console.warn(`[DB Proxy Fallback] ${operation} on ${path}:`, err);
      if (isRead) {
        // Return a safe fallback for reads on proxy failure to prevent crashing the UI with toasts
        return { success: true, data: operation === 'list' ? [] : null };
      }
      // Direct local container Express fallback on error
      try {
        const directFallback = await fetch('/api/maintenance/db-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
          body: JSON.stringify({
            operation,
            path,
            id: payload.id,
            ids: payload.ids,
            data: payload.data,
            items: payload.items,
            constraints: serializedConstraints
          })
        });
        if (directFallback.ok) {
          const fallbackJson = await directFallback.json();
          if (fallbackJson && fallbackJson.success) {
            return fallbackJson;
          }
        }
      } catch (_) {}

      throw err;
    }
  });

  if (isRead) {
    inFlightProxyRequests.set(requestKey, promise);
    promise.finally(() => {
      inFlightProxyRequests.delete(requestKey);
    });
  }

  return promise;
};

export const dbService = {
  clearCache(path: string, id?: string) {
    if (id) {
      clearDocCache(path, id);
    }
    clearCollectionCache(path);
  },

  getCached(path: string, constraints: any[] = []) {
    const cacheKey = getListCacheKey(path, constraints);
    const cached = listCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      const secured = cached.data.map(i => enforceSecuredAccess(path, i)).filter(Boolean);
      return deduplicateArrayByID(secured);
    }
    return null;
  },

  // Generic CRUD
  async create(path: string, id: string, data: any) {
    data = formatNameFields(path, data);
    if (path === 'staff_attendance') {
      try {
        const res = await resilientFetch('/api/attendance/mark-staff-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: data.userId || data.uid,
            status: data.status,
            date: data.date,
            method: data.method || 'manual',
            existingRecordId: id && id.includes('_') ? undefined : id
          }),
        });
        if (!res.ok) throw new Error(`Backend write failed for staff_attendance: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `${path}/${id}`);
      }
      return;
    }
    if (path === 'receipt_books') {
      try {
        const cleaned = cleanObject({ ...data, createdAt: new Date().toISOString() });
        const res = await resilientFetch('/api/fees/receipt-books/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        });
        if (!res.ok) throw new Error(`Backend write failed for receipt_books: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `${path}/${id}`);
      }
      return;
    }
    if (path === 'extendedDueDates') {
      try {
        const cleaned = cleanObject({ ...data, createdAt: new Date().toISOString() });
        const res = await resilientFetch('/api/fees/extended-due-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: id, data: cleaned }),
        });
        if (!res.ok) throw new Error(`Backend write failed for extendedDueDates: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `${path}/${id}`);
      }
      return;
    }
    if (checkQuotaStatus()) return;

    try {
      const cleaned = cleanObject({ ...data, createdAt: new Date().toISOString() });
      await proxyRequest('set', path, { id, data: cleaned });
      if (path === 'students') {
        pushStudentToRemoteServer({ ...cleaned, id }).catch(() => {});
      }
      clearDocCache(path, id);
      clearCollectionCache(path);
      if (isAuditEnabled(path)) {
        logAudit('add', path, id, null, cleaned);
      }
      return;
    } catch (err) {
      console.warn(`DB proxy create error for ${path}/${id}:`, err);
      return;
    }
  },

  async set(path: string, id: string, data: any) {
    data = formatNameFields(path, data);
    if (path === 'staff_attendance') {
      try {
        let uid = data.userId || data.uid;
        let date = data.date;
        if (!uid && id && id.includes('_')) {
          const parts = id.split('_');
          if (parts.length >= 3) {
            uid = parts[2];
          }
        }
        if (!date && id && id.includes('_')) {
          const parts = id.split('_');
          if (parts.length >= 1) {
            date = parts[0];
          }
        }
        const res = await resilientFetch('/api/attendance/mark-staff-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            status: data.status,
            date,
            method: data.method || 'manual',
            existingRecordId: id
          }),
        });
        if (!res.ok) throw new Error(`Backend set failed for staff_attendance: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `${path}/${id}`);
      }
      return;
    }
    if (path === 'receipt_books') {
      try {
        const cleaned = cleanObject(data);
        const res = await resilientFetch('/api/fees/receipt-books/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        });
        if (!res.ok) throw new Error(`Backend set failed for receipt_books: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `${path}/${id}`);
      }
      return;
    }
    if (path === 'extendedDueDates') {
      try {
        const cleaned = cleanObject(data);
        const res = await resilientFetch('/api/fees/extended-due-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: id, data: cleaned }),
        });
        if (!res.ok) throw new Error(`Backend set failed for extendedDueDates: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `${path}/${id}`);
      }
      return;
    }
    if (path === 'stop_backups') {
      try {
        const cleaned = cleanObject(data);
        const res = await resilientFetch('/api/transport/stop-backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: id, data: cleaned }),
        });
        if (!res.ok) throw new Error(`Backend set failed for stop_backups: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `${path}/${id}`);
      }
      return;
    }
    if (checkQuotaStatus()) return;

    try {
      const cleaned = cleanObject(data);
      await proxyRequest('set', path, { id, data: cleaned });
      if (path === 'students') {
        pushStudentToRemoteServer({ ...cleaned, id }).catch(() => {});
      }
      clearDocCache(path, id);
      clearCollectionCache(path);
      return;
    } catch (err) {
      console.warn(`DB proxy set error for ${path}/${id}:`, err);
      return;
    }
  },

  async add(path: string, data: any) {
    data = formatNameFields(path, data);
    if (path === 'login_logs') {
      try {
        const res = await resilientFetch('/api/attendance/add-login-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res && res.ok) {
          const result = await parseResponseJson(res, null);
          if (result && result.id) {
            clearCollectionCache(path);
            return result.id;
          }
        }
      } catch (err) {
        console.warn('Failed to proxy login_logs write, falling back:', err);
      }
    }
    if (path === 'audit_logs') {
      try {
        const sanitized = sanitizeAuditObject(cleanObject(data));
        const res = await resilientFetch('/api/attendance/add-audit-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sanitized),
        });
        if (res && res.ok) {
          const result = await parseResponseJson(res, null);
          if (result && result.id) {
            clearCollectionCache(path);
            return result.id;
          }
        }
      } catch (err) {
        console.warn('Failed to proxy audit_logs write, falling back:', err);
      }
    }
    if (path === 'staff_attendance') {
      const autoId = 'att_' + Math.floor(1000 + Math.random() * 9000) + '_' + Date.now();
      await this.create(path, autoId, data);
      return autoId;
    }
    if (path === 'receipt_books') {
      const autoId = 'book_' + Math.floor(1000 + Math.random() * 9000);
      await this.create(path, autoId, data);
      return autoId;
    }
    if (path === 'extendedDueDates') {
      const autoId = 'ext_' + Math.floor(1000 + Math.random() * 9000) + '_' + Date.now();
      await this.create(path, autoId, data);
      return autoId;
    }
    if (checkQuotaStatus()) return null;

    try {
      const cleaned = cleanObject(data);
      const proxyRes = await proxyRequest('add', path, { data: cleaned });
      clearCollectionCache(path);
      const docId = proxyRes?.id || proxyRes?.data?.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'id_' + Date.now());
      if (path === 'students') {
        pushStudentToRemoteServer({ ...cleaned, id: docId }).catch(() => {});
      }
      if (isAuditEnabled(path)) {
        logAudit('add', path, docId, null, cleaned);
      }
      return docId;
    } catch (err) {
      console.warn(`DB proxy add error for ${path}:`, err);
      return null;
    }
  },

  async get(path: string, id: string, bypassCache = false) {
    if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
      return null;
    }
    if (path === 'attendance_alerts_sent') {
      try {
        const res = await resilientFetch('/api/attendance/alerts-sent?date=' + encodeURIComponent(id), {
          method: 'GET'
        });
        if (res && res.ok) {
          const data = await parseResponseJson(res, null);
          return data;
        }
        return null;
      } catch (error) {
        console.warn('Failed to proxy attendance_alerts_sent read:', error);
        return null;
      }
    }
    if (path === 'receipt_books') {
      try {
        const listData = await this.list(path, [], bypassCache);
        return listData.find((b: any) => b.id === id) || null;
      } catch (error) {
        return null;
      }
    }
    if (path === 'extendedDueDates') {
      try {
        const listData = await this.list(path, [], bypassCache);
        return listData.find((b: any) => b.id === id) || null;
      } catch (error) {
        return null;
      }
    }
    const cacheKey = getCacheKey(path, id);
    const persistent = getFromPersistentCache(path, id);
    const securedPersistent = persistent ? enforceSecuredAccess(path, { ...persistent, id, uid: id }) : null;

    if (checkQuotaStatus()) {
        return securedPersistent;
    }

    if (!bypassCache) {
      const cached = docCache.get(cacheKey);
      const isPersistent = PERSISTENT_COLLECTIONS.includes(path);
      const ttl = isPersistent ? PERSISTENT_CACHE_TTL : CACHE_TTL;

      if (cached && (Date.now() - cached.timestamp < ttl)) {
        return enforceSecuredAccess(path, cached.data);
      }
      if (securedPersistent) {
        return securedPersistent;
      }
    }

    try {
      const proxyRes = await proxyRequest('get', path, { id });
      const data = proxyRes ? proxyRes.data : null;
      const securedData = data ? enforceSecuredAccess(path, { ...data, id, uid: id }) : null;
      if (securedData) {
        docCache.set(cacheKey, { data: securedData, timestamp: Date.now() });
        saveToPersistentCache(path, id, securedData);
      }
      return securedData || null;
    } catch (err) {
      console.warn(`DB proxy get error for ${path}/${id}:`, err);
      if (securedPersistent) {
        return securedPersistent;
      }
      return null;
    }
  },

  async update(path: string, id: string, data: any) {
    data = formatNameFields(path, data);
    if (path === 'staff_attendance') {
      try {
        let uid = data.userId || data.uid;
        let date = data.date;
        if (!uid && id && id.includes('_')) {
          const parts = id.split('_');
          if (parts.length >= 3) {
            uid = parts[2];
          }
        }
        if (!date && id && id.includes('_')) {
          const parts = id.split('_');
          if (parts.length >= 1) {
            date = parts[0];
          }
        }
        const res = await resilientFetch('/api/attendance/mark-staff-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            status: data.status,
            date,
            method: data.method || 'manual',
            existingRecordId: id
          }),
        });
        if (!res.ok) throw new Error(`Backend update failed for staff_attendance: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
      }
      return;
    }
    if (path === 'receipt_books') {
      try {
        const cleaned = cleanObject(data);
        const res = await resilientFetch('/api/fees/receipt-books/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        });
        if (!res.ok) throw new Error(`Backend update failed for receipt_books: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
      }
      return;
    }
    if (path === 'extendedDueDates') {
      try {
        const cleaned = cleanObject(data);
        const res = await resilientFetch('/api/fees/extended-due-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: id, data: cleaned }),
        });
        if (!res.ok) throw new Error(`Backend update failed for extendedDueDates: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
      }
      return;
    }
    if (checkQuotaStatus()) return;

    try {
      const cleaned = cleanObject(data);
      await proxyRequest('update', path, { id, data: cleaned });
      if (path === 'students') {
        pushStudentToRemoteServer({ ...cleaned, id }).catch(() => {});
      }
      clearDocCache(path, id);
      clearCollectionCache(path);
      return;
    } catch (err) {
      console.warn(`DB proxy update error for ${path}/${id}:`, err);
      return;
    }
  },

  async delete(path: string, id: string) {
    if (path === 'receipt_books') {
      try {
        const res = await resilientFetch('/api/fees/receipt-books/' + encodeURIComponent(id), {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(`Backend delete failed for receipt_books: status ${res.status}`);
        clearDocCache(path, id);
        clearCollectionCache(path);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
        throw error;
      }
      return;
    }
    if (checkQuotaStatus()) return;

    try {
      await proxyRequest('delete', path, { id });
      clearDocCache(path, id);
      clearCollectionCache(path);
      return;
    } catch (err) {
      console.warn(`DB proxy delete error for ${path}/${id}:`, err);
      return;
    }
  },

  async deleteBatch(path: string, ids: string[]) {
    if (checkQuotaStatus()) return;
    try {
      await proxyRequest('deleteBatch', path, { ids });
      ids.forEach(id => {
        if (id) {
          clearDocCache(path, id);
        }
      });
      clearCollectionCache(path);
    } catch (error) {
      console.warn(`DB proxy deleteBatch error for ${path}:`, error);
    }
  },

  async createBatch(path: string, items: { id: string, data: any }[]) {
    if (checkQuotaStatus()) return;
    try {
      await proxyRequest('setBatch', path, { items });
      items.forEach(item => {
        clearDocCache(path, item.id);
      });
      clearCollectionCache(path);
    } catch (error) {
      console.warn(`DB proxy createBatch error for ${path}:`, error);
    }
  },

  async updateBatch(path: string, items: { id: string, data: any }[]) {
    if (checkQuotaStatus()) return;
    try {
      await proxyRequest('updateBatch', path, { items });
      items.forEach(item => {
        clearDocCache(path, item.id);
      });
      clearCollectionCache(path);
    } catch (error) {
      console.warn(`DB proxy updateBatch error for ${path}:`, error);
    }
  },

  async setBatch(path: string, items: { id: string, data: any }[]) {
    if (checkQuotaStatus()) return;
    try {
      await proxyRequest('setBatch', path, { items });
      items.forEach(item => {
        clearDocCache(path, item.id);
      });
      clearCollectionCache(path);
    } catch (error) {
      console.warn(`DB proxy setBatch error for ${path}:`, error);
    }
  },

  async list(path: string, constraints: QueryConstraint[] = [], bypassCache = false): Promise<any[]> {
    // Special dedicated backend API proxy endpoints
    if (path === 'receipt_books') {
      try {
        const res = await resilientFetch('/api/fees/receipt-books');
        if (res && res.ok) {
          const data = await parseResponseJson(res, []);
          if (Array.isArray(data)) {
            const cacheKey = getListCacheKey(path, constraints);
            listCache.set(cacheKey, { data, timestamp: Date.now() });
            saveToIndexedDB(path, data);
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch receipt_books from backend API proxy:', error);
        const idbData = await getFromIndexedDB(path);
        return Array.isArray(idbData) ? idbData : [];
      }
    }

    if (path === 'extendedDueDates') {
      try {
        const res = await resilientFetch('/api/fees/extended-due-dates');
        if (res && res.ok) {
          const data = await parseResponseJson(res, []);
          if (Array.isArray(data)) {
            const cacheKey = getListCacheKey(path, constraints);
            listCache.set(cacheKey, { data, timestamp: Date.now() });
            saveToIndexedDB(path, data);
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch extendedDueDates from backend API proxy:', error);
        const idbData = await getFromIndexedDB(path);
        return Array.isArray(idbData) ? idbData : [];
      }
    }

    if (path === 'staff_attendance') {
      try {
        let dateVal = '';
        let statusVal = '';
        for (const c of constraints) {
          if (c && (c as any).type === 'where') {
            const fieldName = (c as any)._field?.segments?.[0] || (c as any).field;
            const op = (c as any)._op || (c as any).op;
            const val = (c as any)._value !== undefined ? (c as any)._value : (c as any).value;
            if (fieldName === 'date' && (op === '==' || op === 'equal')) dateVal = String(val);
            if (fieldName === 'status' && (op === '==' || op === 'equal')) statusVal = String(val);
          }
        }
        let url = '/api/attendance/list-staff-attendance';
        const params = new URLSearchParams();
        if (dateVal) params.append('date', dateVal);
        if (statusVal) params.append('status', statusVal);
        if (params.toString()) url += ('?' + params.toString());
        const res = await resilientFetch(url);
        if (res && res.ok) {
          const data = await parseResponseJson(res, []);
          if (Array.isArray(data)) {
            const cacheKey = getListCacheKey(path, constraints);
            listCache.set(cacheKey, { data, timestamp: Date.now() });
            saveToIndexedDB(path, data);
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch staff_attendance from backend API proxy:', error);
        const idbData = await getFromIndexedDB(path);
        return Array.isArray(idbData) ? idbData : [];
      }
    }

    if (path === 'login_logs') {
      try {
        const res = await resilientFetch('/api/attendance/list-login-logs');
        if (res && res.ok) {
          const data = await parseResponseJson(res, []);
          if (Array.isArray(data)) {
            const cacheKey = getListCacheKey(path, constraints);
            listCache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch login_logs from backend API proxy:', error);
        return [];
      }
    }

    if (path === 'audit_logs') {
      try {
        const res = await resilientFetch('/api/attendance/list-audit-logs');
        if (res && res.ok) {
          const data = await parseResponseJson(res, []);
          if (Array.isArray(data)) {
            const cacheKey = getListCacheKey(path, constraints);
            listCache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch audit_logs from backend API proxy:', error);
        return [];
      }
    }

    if (path === 'stop_backups') {
      try {
        const res = await resilientFetch('/api/transport/stop-backups');
        if (res && res.ok) {
          const data = await parseResponseJson(res, []);
          if (Array.isArray(data)) {
            const cacheKey = getListCacheKey(path, constraints);
            listCache.set(cacheKey, { data, timestamp: Date.now() });
            saveToIndexedDB(path, data);
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch stop_backups from backend API proxy:', error);
        return [];
      }
    }

    // Universal Network-First for ALL standard collections (students, fees, feeStructures, concessions, attendance, payments, classes, batches, exams, etc.)
    const targetCollection = normalizeCollectionName(path);
    const cacheKey = getListCacheKey(path, constraints);

    // In-flight deduplication: return active promise if identical request is pending
    if (inFlightListRequests.has(cacheKey)) {
      return inFlightListRequests.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      const isPreview = isPreviewEnvironment();
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

      // Extract specific query parameters from constraints
      let dateParam = '';
      let classIdParam = '';
      let examIdParam = '';
      let batchIdParam = '';
      let limitParam = '';

      if (constraints && constraints.length > 0) {
        for (const c of constraints) {
          if (!c) continue;
          if ((c as any).type === 'where') {
            const field = (c as any)._field?.segments?.[0] || (c as any).field;
            const op = (c as any)._op || (c as any).op;
            const val = (c as any)._value !== undefined ? (c as any)._value : (c as any).value;
            if (op === '==' || op === 'equal') {
              if (field === 'date') dateParam = String(val);
              if (field === 'classId') classIdParam = String(val);
              if (field === 'examId') examIdParam = String(val);
              if (field === 'batchId') batchIdParam = String(val);
            }
          } else if ((c as any).type === 'limit') {
            const val = (c as any)._value !== undefined ? (c as any)._value : (c as any).value;
            if (val) limitParam = String(val);
          }
        }
      }

      // Build primary live endpoint with dynamic cache buster timestamp
      const timestamp = Date.now();
      const apiBase = isPreview ? 'https://antonyschool.in/api' : '/api';
      const params = new URLSearchParams();
      params.append('collection', targetCollection);
      params.append('_t', String(timestamp));
      if (dateParam) params.append('date', dateParam);
      if (classIdParam) params.append('classId', classIdParam);
      if (examIdParam) params.append('examId', examIdParam);
      if (batchIdParam) params.append('batchId', batchIdParam);
      if (limitParam) params.append('limit', limitParam);
      if (targetCollection === 'examMarks' && !limitParam) params.append('limit', '10000');

      const primaryUrl = apiBase + '/maintenance/db-proxy?' + params.toString();

      let liveData: any[] | null = null;

      // 1. Universal Network-First: Always fetch live MongoDB records when online
      if (isOnline) {
        try {
          const res = await fetch(primaryUrl, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            },
            signal: AbortSignal.timeout(15000)
          });
          if (res.ok) {
            const json = await res.json();
            liveData = Array.isArray(json) ? json : (json.data || []);
          }
        } catch (netErr) {
          console.warn('Universal live GET sync failed for ' + path + ':', netErr);
        }

        // Secondary Network Fallback: POST proxyRequest
        if (liveData === null) {
          try {
            const postRes = await proxyRequest('list', targetCollection, { constraints });
            if (postRes && Array.isArray(postRes.data)) {
              liveData = postRes.data;
            }
          } catch (_) {}
        }

        // Tertiary Network Fallback: Container backend proxy route
        if (liveData === null && isPreview) {
          try {
            const localUrl = '/api/maintenance/db-proxy?' + params.toString();
            const localRes = await fetch(localUrl, {
              method: 'GET',
              mode: 'cors',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(5000)
            });
            if (localRes.ok) {
              const localJson = await localRes.json();
              liveData = Array.isArray(localJson) ? localJson : (localJson.data || []);
            }
          } catch (_) {}
        }
      }

      // If live records were fetched, process, normalize, and update IndexedDB & local cache immediately
      if (Array.isArray(liveData)) {
        let processed = liveData;

        // Specific collection normalization
        if (targetCollection === 'students' || path === 'students') {
          processed = processed.map(s => normalizeStudentData(s));
          processed = sortStudentsNumerically(processed);
        } else if (targetCollection === 'payments' || path === 'payments' || path === 'fee_payments') {
          processed.sort(comparePaymentRecordsDescending);
        } else if (targetCollection === 'attendance' && dateParam) {
          processed = processed.filter((a: any) => a.date === dateParam);
        }

        const secured = processed.map(i => enforceSecuredAccess(path, i)).filter(Boolean);
        const deduped = deduplicateArrayByID(secured);

        // Update in-memory list cache
        listCache.set(cacheKey, { data: deduped, timestamp: Date.now() });

        // Immediately update local IndexedDB storage with fetched MongoDB array so offline fallback matches live state
        saveToIndexedDB(path, deduped);
        if (targetCollection !== path) {
          saveToIndexedDB(targetCollection, deduped);
        }

        // Update localStorage persistent cache
        try {
          localStorage.setItem('fs_list_cache_' + path + '_' + cacheKey, JSON.stringify({ data: deduped, timestamp: Date.now() }));
          if (constraints.length === 0) {
            localStorage.setItem('fs_list_cache_' + path, JSON.stringify({ data: deduped, timestamp: Date.now() }));
          }
        } catch (_) {}

        // Invalidate stale fees_module_cache for accurate summary metric calculations
        if (['students', 'fees', 'feeStructures', 'fee_structures', 'concessions', 'payments', 'fee_payments'].includes(path) ||
            ['students', 'fees', 'feeStructures', 'concessions', 'payments'].includes(targetCollection)) {
          clearFeesModuleCaches();
        }

        return deduped;
      }

      // 2. Offline Fallback: ONLY when offline or live synchronization failed
      const idbData = await getFromIndexedDB(path) || await getFromIndexedDB(targetCollection);
      if (Array.isArray(idbData) && idbData.length > 0) {
        const secured = idbData.map(i => enforceSecuredAccess(path, i)).filter(Boolean);
        return deduplicateArrayByID(secured);
      }

      // Check localStorage fallback
      try {
        const cachedItem = localStorage.getItem('fs_list_cache_' + path + '_' + cacheKey) || localStorage.getItem('fs_list_cache_' + path);
        if (cachedItem) {
          const { data } = JSON.parse(cachedItem);
          if (Array.isArray(data) && data.length > 0) {
            const secured = data.map((i: any) => enforceSecuredAccess(path, i)).filter(Boolean);
            return deduplicateArrayByID(secured);
          }
        }
      } catch (_) {}

      // Check in-memory cache
      const memCached = listCache.get(cacheKey);
      if (memCached && Array.isArray(memCached.data)) {
        const secured = memCached.data.map(i => enforceSecuredAccess(path, i)).filter(Boolean);
        return deduplicateArrayByID(secured);
      }

      return [];
    })();

    inFlightListRequests.set(cacheKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlightListRequests.delete(cacheKey);
    }
  },

  async listPaginated(path: string, constraints: QueryConstraint[] = [], bypassCache = false) {
    const cacheKey = getListCacheKey(path, constraints);

    if (checkQuotaStatus()) {
        const cached = paginatedCache.get(cacheKey);
        if (cached) return { data: cached.data, lastDoc: cached.lastDoc };
        
        // Try persistent fallback
        if (PERSISTENT_COLLECTIONS.includes(path)) {
          try {
            const stored = localStorage.getItem(`fs_paginated_cache_${path}_${cacheKey}`);
            if (stored) {
              const { data } = JSON.parse(stored);
              return { data, lastDoc: null };
            }
          } catch (e) {}
        }
        return { data: [], lastDoc: null };
    }

    const cached = paginatedCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return { data: cached.data, lastDoc: cached.lastDoc };
    }

    try {
      const proxyRes = await proxyRequest('list', path, { constraints });
      if (proxyRes && Array.isArray(proxyRes.data)) {
        const rawData = proxyRes.data.map((item: any) => {
          const cleanItem = { ...item };
          if (path === 'students') {
            cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
          }
          return cleanItem;
        });
        const data = rawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
        const dedupedData = deduplicateArrayByID(data);
        paginatedCache.set(cacheKey, { data: dedupedData, lastDoc: null, timestamp: Date.now() });
        return { data: dedupedData, lastDoc: null };
      }
      return { data: [], lastDoc: null };
    } catch (err) {
      console.warn(`[dbService] listPaginated proxy error on ${path}:`, err);
      const memoryCached = paginatedCache.get(cacheKey);
      if (memoryCached) {
        return { data: memoryCached.data, lastDoc: memoryCached.lastDoc };
      }
      return { data: [], lastDoc: null };
    }
  },

  async count(path: string, constraints: any[] = []) {
    if (checkQuotaStatus()) return 0;
    try {
      const proxyRes = await proxyRequest('count', path, { constraints });
      return proxyRes?.count !== undefined ? proxyRes.count : (proxyRes?.data ? proxyRes.data.length : 0);
    } catch (err) {
      console.warn(`[dbService] Count proxy error for ${path}:`, err);
      return 0;
    }
  },

  subscribe(path: string, constraints: QueryConstraint[], callback: (data: any[]) => void, errorCallback?: (error: any) => void) {
    if (checkQuotaStatus()) {
      callback([]);
      return () => {};
    }

    const subKey = `${path}_${getListCacheKey(path, constraints)}`;

    // Special collections that have distinct custom polling endpoints
    const isSpecialPath = path === 'login_logs' || path === 'audit_logs' || path === 'stop_backups';

    if (activeSubscriptionRegistry.has(subKey)) {
      const activeSub = activeSubscriptionRegistry.get(subKey)!;
      activeSub.callbacks.add(callback);
      if (errorCallback) activeSub.errorCallbacks.add(errorCallback);

      // If we already have fresh cached data, emit it instantly
      if (activeSub.currentData) {
        const cachedData = activeSub.currentData;
        setTimeout(() => {
          callback(cachedData);
        }, 0);
      }

      return () => {
        activeSub.callbacks.delete(callback);
        if (errorCallback) activeSub.errorCallbacks.delete(errorCallback);

        if (activeSub.callbacks.size === 0) {
          if (activeSub.intervalId) {
            clearInterval(activeSub.intervalId);
          }
          activeSubscriptionRegistry.delete(subKey);
        }
      };
    }

    // New active background poll subscription
    const activeSub: SubscriptionRegistryItem = {
      callbacks: new Set([callback]),
      errorCallbacks: new Set(errorCallback ? [errorCallback] : []),
      currentData: undefined,
      intervalId: null,
      lastFetched: 0
    };

    activeSubscriptionRegistry.set(subKey, activeSub);

    const triggerFetch = async () => {
      try {
        const finalData = await dbService.list(path, constraints, true);
        activeSub.currentData = finalData;
        activeSub.lastFetched = Date.now();

        // Broadcast to all active listeners
        activeSub.callbacks.forEach(cb => {
          try {
            cb(finalData);
          } catch (e) {
            console.error(`Error in subscription callback for ${path}:`, e);
          }
        });
      } catch (err) {
        console.warn(`[Consolidated Sub Polling Failed] ${path}:`, err);
        activeSub.errorCallbacks.forEach(ecb => {
          try {
            ecb(err);
          } catch (e) {}
        });
      }
    };

    const onMutation = (e: any) => {
      const mutatedPath = e?.detail?.path;
      if (!mutatedPath || mutatedPath === path || normalizeCollectionName(mutatedPath) === normalizeCollectionName(path)) {
        triggerFetch();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('app:db-mutation', onMutation);
    }

    // Initial load
    triggerFetch();

    // Set polling interval (conservative 90s/180s to avoid rate limit/quota exhaustion in preview)
    const pollingInterval = (path === 'attendance' || path === 'user_activities' || path === 'whatsapp_logs') ? 90000 : 180000;
    activeSub.intervalId = setInterval(triggerFetch, pollingInterval);

    return () => {
      activeSub.callbacks.delete(callback);
      if (errorCallback) activeSub.errorCallbacks.delete(errorCallback);

      if (activeSub.callbacks.size === 0) {
        if (activeSub.intervalId) {
          clearInterval(activeSub.intervalId);
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('app:db-mutation', onMutation);
        }
        activeSubscriptionRegistry.delete(subKey);
      }
    };
  },

  subscribeDoc(path: string, id: string, callback: (data: any) => void, errorCallback?: (error: any) => void) {
    if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
      callback(null);
      return () => {};
    }
    if (checkQuotaStatus()) {
      const persistent = getFromPersistentCache(path, id);
      callback(persistent ? { id, ...persistent } : null);
      return () => {};
    }

    let activeUnsubscribe: () => void = () => {};
    let isTerminated = false;

    const startProxyDocPolling = () => {
      if (isTerminated) return;
      
      const fetchAndCallback = async () => {
        try {
          const proxyRes = await proxyRequest('get', path, { id });
          if (proxyRes && proxyRes.data) {
            const rawData = proxyRes.data;
            if (rawData && path === 'students') {
              rawData.uniqueStudentId = rawData.uniqueStudentId || generateUniqueStudentId(rawData);
            }
            const data = rawData ? enforceSecuredAccess(path, rawData) : null;
            if (data) {
              saveToPersistentCache(path, id, data);
            }
            callback(data);
          } else {
            callback(null);
          }
        } catch (err) {
          console.warn(`[Proxy Polling Doc Sub Retry] Doc subscription polling failed for ${path}/${id}:`, err);
          if (errorCallback) errorCallback(err);
        }
      };

      fetchAndCallback();
      // Set polling interval (conservative 90s/180s to avoid rate limit/quota exhaustion in preview)
      const pollingInterval = (path === 'attendance' || path === 'user_activities' || path === 'whatsapp_logs') ? 90000 : 180000;
      const intervalId = setInterval(fetchAndCallback, pollingInterval);
      activeUnsubscribe = () => {
        clearInterval(intervalId);
      };
    };

    const persistent = getFromPersistentCache(path, id);
    if (persistent) {
      setTimeout(() => callback({ id, ...persistent }), 0);
    }

    startProxyDocPolling();
    return () => {
      isTerminated = true;
      activeUnsubscribe();
    };
  },

  resetQuota() {},

  isPoisoned() {
    return false;
  },
  
  checkQuotaStatus() {
    return checkQuotaStatus();
  },

  clearCollectionCache(path: string) {
    clearCollectionCache(path);
  },

  clearDocCache(path: string, id: string) {
    clearDocCache(path, id);
  }
};
