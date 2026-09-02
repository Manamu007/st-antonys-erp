import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  getDocsFromCache,
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  Timestamp,
  addDoc,
  writeBatch,
  limit,
  startAfter,
  orderBy,
  getCountFromServer,
  QueryConstraint
} from 'firebase/firestore';
import { db, auth, isBackendUnreachable } from '../firebase';
import { generateUniqueStudentId } from '../lib/studentUtils';
import { safeStorage as localStorage, safeSessionStorage as sessionStorage } from '../lib/safeStorage';
import { isSystemAccount, isDeveloperAccount } from '../constants/systemAccounts';

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

// Quota tracking logic
const QUOTA_ERROR_KEY = 'firestore_quota_exceeded_timestamp';
const QUOTA_COOLOFF_PERIOD = 1000 * 60 * 60; // 1 hour cooloff

export const checkQuotaStatus = () => {
  return false;
};

let isSdkPoisoned = false;

const setQuotaExceeded = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(QUOTA_ERROR_KEY, Date.now().toString());
    window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
  }
};

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
    console.info(`Firestore Index building on ${path}. Query may be degraded until complete.`);
  } else if (isPermissionError) {
    console.warn(`[PermNote] Client access restricted for path '${path}' - falling back to secure API proxy... Original status:`, errorMessage);
  } else if (isIndexError) {
    const consoleUrlMatch = errorMessage.match(/https:\/\/console\.firebase\.google\.com[^\s']+/)?.[0];
    const url = consoleUrlMatch || `https://console.firebase.google.com/project/antonyserp-cc9df/firestore/databases/antony-database1/indexes`;
    console.warn(`Firestore Index Missing on ${path}. Generate it here: ${url}`);
    
    // Auto-persist index error to Firebase collection "index_errors"
    try {
      const docId = url.split('create_composite=')[1]?.slice(0, 100).replace(/[^a-zA-Z0-9_-]/g, '_') || String(Date.now());
      setDoc(doc(db, 'index_errors', docId), {
        id: docId,
        message: errorMessage,
        url,
        timestamp: new Date().toISOString(),
        location: window?.location?.href || 'Unknown',
        userAgent: navigator?.userAgent || 'Unknown'
      }).then(() => {
        console.log('[handleFirestoreError] Index error logged to DB successfully.');
      }).catch(err => {
        console.error('[handleFirestoreError] Failed to write index error log:', err);
      });
    } catch (e) {
      console.error('[handleFirestoreError] Error setting up index error log:', e);
    }
  } else {
    console.error(`Firestore ${operationType} Error on ${path}: `, errorMessage);
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

export function enforceSecuredAccess(path: string, item: any): any | null {
  if (!item) return null;
  
  // Format student and staff name fields to proper Title Case
  item = formatNameFields(path, item);

  if (typeof window === 'undefined') return item;

  const currentEmail = (sessionStorage.getItem('auth_user_email') || auth.currentUser?.email || '').toLowerCase().trim();
  
  // System accounts and developer accounts have full unrestricted access
  if (currentEmail && (isDeveloperAccount(currentEmail) || isSystemAccount(currentEmail))) {
    return item;
  }

  const role = (sessionStorage.getItem('auth_current_user_role') || '').toLowerCase().trim();
  
  // Decide if they are staff or administrative roles
  const isStaffOrAdmin = [
    'super_admin', 'admin', 'principal', 'vice_principal', 'coordinator', 
    'teacher', 'teacher_class', 'teacher_subject', 'play_school_incharge', 'accountant', 'clerk', 
    'warden', 'receptionist', 'transport_staff', 'driver'
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
  for (const key of listCache.keys()) {
    if (key.startsWith(path)) {
      listCache.delete(key);
    }
  }
  for (const key of paginatedCache.keys()) {
    if (key.startsWith(path)) {
      paginatedCache.delete(key);
    }
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`fs_list_cache_${path}`);
      // Clear all granular query-level list and pagination caches for this path
      const prefix1 = `fs_list_cache_${path}`;
      const prefix2 = `fs_paginated_cache_${path}`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(prefix1) || key.startsWith(prefix2))) {
          localStorage.removeItem(key);
        }
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

export async function resilientFetch(input: RequestInfo | URL, init?: RequestInit, retries = 5, delay = 800): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const requestInit = { ...init, signal: controller.signal };

      const res = await fetch(input, requestInit);
      clearTimeout(timeoutId);

      if (res.status === 429) {
        throw new Error(`HTTP 429 Rate Limited`);
      }

      if (res.status < 500) {
        return res;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      attempt++;
      if (attempt >= retries) {
        console.error(`[ResilientFetch] Failed after ${attempt} attempts: ${err?.message || String(err)}`);
        throw err;
      }
      const backoffDelay = delay * Math.pow(2, attempt - 1) + Math.random() * 300;
      console.warn(`[ResilientFetch] Attempt ${attempt} failed (${err?.message || String(err)}). Retrying in ${Math.round(backoffDelay)}ms...`);
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
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('bypass_user_email') || isBackendUnreachable;
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

// Queue to limit active concurrent proxy HTTP requests to max 2 with smooth pacing
const MAX_CONCURRENT_PROXY_REQUESTS = 2;
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
            setTimeout(next, 50); // Pacing delay to prevent rate limit spikes
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
        throw new Error(result?.error || 'DB Proxy returned failure or non-JSON response');
      }
      return result;
    } catch (err) {
      console.warn(`[DB Proxy Fallback] ${operation} on ${path}:`, err);
      if (isRead) {
        // Return a safe fallback for reads on proxy failure to prevent crashing the UI with toasts
        return { success: true, data: operation === 'list' ? [] : null };
      }
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
        const res = await resilientFetch(`/api/fees/receipt-books/${id}`, {
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

    if (isBypassActive()) {
      try {
        const cleaned = cleanObject({ ...data, createdAt: new Date().toISOString() });
        await proxyRequest('set', path, { id, data: cleaned });
        clearDocCache(path, id);
        clearCollectionCache(path);
        return;
      } catch (err) {
        console.warn(`Proactive DB proxy create failed for ${path}/${id}, falling back to SDK:`, err);
      }
    }

    try {
      const cleaned = cleanObject({ ...data, createdAt: new Date().toISOString() });
      await setDoc(doc(db, path, id), cleaned);
      clearDocCache(path, id);
      clearCollectionCache(path);

      if (isAuditEnabled(path)) {
        logAudit('add', path, id, null, cleaned);
      }
    } catch (error) {
      // Try proxy fallback
      try {
        const cleaned = cleanObject({ ...data, createdAt: new Date().toISOString() });
        await proxyRequest('set', path, { id, data: cleaned });
        clearDocCache(path, id);
        clearCollectionCache(path);
        return;
      } catch (proxyError) {
        console.error(`Both client create and proxy create failed for ${path}/${id}:`, proxyError);
      }

      handleFirestoreError(error, OperationType.CREATE, `${path}/${id}`);
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
        const res = await resilientFetch(`/api/fees/receipt-books/${id}`, {
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

    if (isBypassActive()) {
      try {
        const cleaned = cleanObject(data);
        await proxyRequest('set', path, { id, data: cleaned });
        clearDocCache(path, id);
        clearCollectionCache(path);
        return;
      } catch (err) {
        console.warn(`Proactive DB proxy set failed for ${path}/${id}, falling back to SDK:`, err);
      }
    }

    let beforeData: any = null;
    let isAuditCollection = isAuditEnabled(path);
    if (isAuditCollection) {
      try {
        beforeData = await this.get(path, id);
      } catch (e) {}
    }

    try {
      const cleaned = cleanObject(data);
      await setDoc(doc(db, path, id), cleaned, { merge: true });
      clearDocCache(path, id);
      clearCollectionCache(path);

      if (isAuditCollection) {
        const afterData = beforeData ? { ...beforeData, ...cleaned } : cleaned;
        logAudit(beforeData ? 'edit' : 'add', path, id, beforeData, afterData);
      }
    } catch (error) {
      // Try proxy fallback
      try {
        const cleaned = cleanObject(data);
        await proxyRequest('set', path, { id, data: cleaned });
        clearDocCache(path, id);
        clearCollectionCache(path);
        return;
      } catch (proxyError) {
        console.error(`Both client set and proxy set failed for ${path}/${id}:`, proxyError);
      }

      handleFirestoreError(error, OperationType.WRITE, `${path}/${id}`);
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

    if (isBypassActive()) {
      try {
        const cleaned = cleanObject(data);
        const proxyRes = await proxyRequest('add', path, { data: cleaned });
        clearCollectionCache(path);
        return proxyRes.id;
      } catch (err) {
        console.warn(`Proactive DB proxy add failed for ${path}, falling back to SDK:`, err);
      }
    }

    try {
      const cleaned = cleanObject({ ...data, createdAt: new Date().toISOString() });
      const docRef = await addDoc(collection(db, path), cleaned);
      clearCollectionCache(path);

      if (isAuditEnabled(path)) {
        logAudit('add', path, docRef.id, null, cleaned);
      }
      return docRef.id;
    } catch (error) {
      // Try proxy fallback
      try {
        const cleaned = cleanObject(data);
        const proxyRes = await proxyRequest('add', path, { data: cleaned });
        clearCollectionCache(path);
        return proxyRes.id;
      } catch (proxyError) {
        console.error(`Both client add and proxy add failed for ${path}:`, proxyError);
      }

      handleFirestoreError(error, OperationType.CREATE, path);
      return null;
    }
  },

  async get(path: string, id: string, bypassCache = false) {
    if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
      return null;
    }
    if (path === 'attendance_alerts_sent') {
      try {
        const res = await resilientFetch(`/api/attendance/alerts-sent?date=${id}`, {
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

    if (isBypassActive()) {
      try {
        const proxyRes = await proxyRequest('get', path, { id });
        const data = proxyRes ? proxyRes.data : null;
        const securedData = data ? enforceSecuredAccess(path, { ...data, id, uid: id }) : null;
        if (securedData) {
          docCache.set(cacheKey, { data: securedData, timestamp: Date.now() });
          saveToPersistentCache(path, id, securedData);
        }
        return securedData;
      } catch (err) {
        console.warn(`Proactive DB proxy get failed for ${path}/${id}, falling back to SDK:`, err);
      }
    }

    try {
      // Add a 30s timeout to prevent UI hanging
      const docSnap = await Promise.race([
        getDoc(doc(db, path, id)),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Firestore Get Timeout on ${path}/${id}`)), 30000))
      ]) as any;

      const data = docSnap.exists() ? docSnap.data() : null;
      const securedData = data ? enforceSecuredAccess(path, { ...data, id, uid: id }) : null;
      
      if (securedData) {
        docCache.set(cacheKey, { data: securedData, timestamp: Date.now() });
        saveToPersistentCache(path, id, securedData);
      }
      
      return securedData;
    } catch (error) {
      // Try proxy fallback
      try {
        const proxyRes = await proxyRequest('get', path, { id });
        return proxyRes.data;
      } catch (proxyError) {
        console.warn(`Both client get and proxy get failed for ${path}/${id}:`, proxyError);
      }

      // If we hit timeout, quota error or network error, return persistent cache if available
      if (securedPersistent) {
        console.warn(`Firestore Error: ${error instanceof Error ? error.message : String(error)}. Using persistent cache for ${path}/${id}.`);
        return securedPersistent;
      }
      
      try { handleFirestoreError(error, OperationType.GET, `${path}/${id}`); } catch(e) { /* ignore to prevent crash */ }
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
        const res = await resilientFetch(`/api/fees/receipt-books/${id}`, {
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

    if (isBypassActive()) {
      try {
        const cleaned = cleanObject(data);
        await proxyRequest('update', path, { id, data: cleaned });
        clearDocCache(path, id);
        clearCollectionCache(path);
        return;
      } catch (err) {
        console.warn(`Proactive DB proxy update failed for ${path}/${id}, falling back to SDK:`, err);
      }
    }

    let beforeData: any = null;
    let isAuditCollection = isAuditEnabled(path);
    if (isAuditCollection) {
      try {
        beforeData = await this.get(path, id);
      } catch (e) {}
    }

    try {
      const cleaned = cleanObject(data);
      await updateDoc(doc(db, path, id), cleaned);
      clearDocCache(path, id);
      clearCollectionCache(path);

      if (isAuditCollection) {
        const afterData = beforeData ? { ...beforeData, ...cleaned } : cleaned;
        logAudit('edit', path, id, beforeData, afterData);
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNotFoundError = error?.code === 'not-found' || 
                            errorMessage.includes('not-found') || 
                            errorMessage.includes('No document to update');
      
      if (isNotFoundError) {
        try {
          const cleaned = cleanObject(data);
          await setDoc(doc(db, path, id), cleaned, { merge: true });
          clearDocCache(path, id);
          clearCollectionCache(path);

          if (isAuditCollection) {
            const afterData = beforeData ? { ...beforeData, ...cleaned } : cleaned;
            logAudit(beforeData ? 'edit' : 'add', path, id, beforeData, afterData);
          }
        } catch (setErr) {
          // Fallback to proxy
          try {
            const cleaned = cleanObject(data);
            await proxyRequest('set', path, { id, data: cleaned });
            clearDocCache(path, id);
            clearCollectionCache(path);
            return;
          } catch (proxyError) {
            console.error(`Both client update/set and proxy failed for ${path}/${id}:`, proxyError);
          }
          handleFirestoreError(setErr, OperationType.UPDATE, `${path}/${id}`);
        }
      } else {
        // Fallback to proxy
        try {
          const cleaned = cleanObject(data);
          await proxyRequest('update', path, { id, data: cleaned });
          clearDocCache(path, id);
          clearCollectionCache(path);
          return;
        } catch (proxyError) {
          console.error(`Both client update and proxy update failed for ${path}/${id}:`, proxyError);
        }
        handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
      }
    }
  },

  async delete(path: string, id: string) {
    if (path === 'receipt_books') {
      try {
        const res = await resilientFetch(`/api/fees/receipt-books/${id}`, {
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

    if (isBypassActive()) {
      try {
        await proxyRequest('delete', path, { id });
        clearDocCache(path, id);
        clearCollectionCache(path);
        return;
      } catch (err) {
        console.warn(`Proactive DB proxy delete failed for ${path}/${id}, falling back to SDK:`, err);
      }
    }

    let beforeData: any = null;
    let isAuditCollection = isAuditEnabled(path);
    if (isAuditCollection) {
      try {
        beforeData = await this.get(path, id);
      } catch (e) {}
    }

    try {
      await deleteDoc(doc(db, path, id));
      clearDocCache(path, id);
      clearCollectionCache(path);

      if (isAuditCollection) {
        logAudit('delete', path, id, beforeData, null);
      }
    } catch (error) {
      // Try proxy fallback
      try {
        await proxyRequest('delete', path, { id });
        clearDocCache(path, id);
        clearCollectionCache(path);
        return;
      } catch (proxyError) {
        console.error(`Both client delete and proxy delete failed for ${path}/${id}:`, proxyError);
      }

      handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
      throw error;
    }
  },

  async deleteBatch(path: string, ids: string[]) {
    if (checkQuotaStatus()) return;
    try {
      if (isBypassActive()) {
        await proxyRequest('deleteBatch', path, { ids });
        ids.forEach(id => {
          if (id) {
            clearDocCache(path, id);
          }
        });
        clearCollectionCache(path);
        return;
      }
      const batchSize = 400;
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(id => {
          if (id) {
            batch.delete(doc(db, path, id));
            clearDocCache(path, id);
          }
        });
        await batch.commit();
      }
      clearCollectionCache(path);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
      throw error;
    }
  },

  async createBatch(path: string, items: { id: string, data: any }[]) {
    if (checkQuotaStatus()) return;
    try {
      const batch = writeBatch(db);
      items.forEach(item => {
        const formattedData = formatNameFields(path, item.data);
        const cleaned = cleanObject({ ...formattedData, createdAt: new Date().toISOString() });
        batch.set(doc(db, path, item.id), cleaned);
        clearDocCache(path, item.id);
      });
      await batch.commit();
      clearCollectionCache(path);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updateBatch(path: string, items: { id: string, data: any }[]) {
    if (checkQuotaStatus()) return;
    try {
      if (isBypassActive()) {
        await proxyRequest('updateBatch', path, { items });
        items.forEach(item => {
          clearDocCache(path, item.id);
        });
        clearCollectionCache(path);
        return;
      }
      const batch = writeBatch(db);
      items.forEach(item => {
        const formattedData = formatNameFields(path, item.data);
        const cleaned = cleanObject(formattedData);
        batch.update(doc(db, path, item.id), cleaned);
        clearDocCache(path, item.id);
      });
      await batch.commit();
      clearCollectionCache(path);
    } catch (error) {
      try {
        console.warn(`Client updateBatch failed on ${path}, trying proxy fallback:`, error);
        await proxyRequest('updateBatch', path, { items });
        items.forEach(item => {
          clearDocCache(path, item.id);
        });
        clearCollectionCache(path);
      } catch (proxyError) {
        console.error(`Both client updateBatch and proxy failed for ${path}:`, proxyError);
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  },

  async setBatch(path: string, items: { id: string, data: any }[]) {
    if (checkQuotaStatus()) return;
    try {
      if (isBypassActive()) {
        await proxyRequest('setBatch', path, { items });
        items.forEach(item => {
          clearDocCache(path, item.id);
        });
        clearCollectionCache(path);
        return;
      }
      const batch = writeBatch(db);
      items.forEach(item => {
        const formattedData = formatNameFields(path, item.data);
        const cleaned = cleanObject(formattedData);
        batch.set(doc(db, path, item.id), cleaned, { merge: true });
        clearDocCache(path, item.id);
      });
      await batch.commit();
      clearCollectionCache(path);
    } catch (error) {
      try {
        console.warn(`Client setBatch failed on ${path}, trying proxy fallback:`, error);
        await proxyRequest('setBatch', path, { items });
        items.forEach(item => {
          clearDocCache(path, item.id);
        });
        clearCollectionCache(path);
      } catch (proxyError) {
        console.error(`Both client setBatch and proxy failed for ${path}:`, proxyError);
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  },

  async list(path: string, constraints: QueryConstraint[] = [], bypassCache = false) {
    if (path === 'receipt_books') {
      try {
        const res = await resilientFetch('/api/fees/receipt-books');
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
        console.warn("Failed to fetch receipt_books from backend API proxy:", error);
        return [];
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
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn("Failed to fetch extendedDueDates from backend API proxy:", error);
        return [];
      }
    }
    if (path === 'staff_attendance') {
      try {
        let dateVal = '';
        let statusVal = '';
        for (const c of constraints) {
          if (c && (c as any).type === 'where') {
            const fieldName = (c as any)._field?.segments?.[0];
            const op = (c as any)._op;
            const val = (c as any)._value;
            if (fieldName === 'date' && (op === '==' || op === 'equal')) {
              dateVal = String(val);
            }
            if (fieldName === 'status' && (op === '==' || op === 'equal')) {
              statusVal = String(val);
            }
          }
        }
        let url = '/api/attendance/list-staff-attendance';
        const params = new URLSearchParams();
        if (dateVal) params.append('date', dateVal);
        if (statusVal) params.append('status', statusVal);
        if (params.toString()) {
          url += `?${params.toString()}`;
        }
        const res = await resilientFetch(url);
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
        console.warn("Failed to fetch staff_attendance from backend API proxy:", error);
        return [];
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
        console.warn("Failed to fetch login_logs from backend API proxy:", error);
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
        console.warn("Failed to fetch audit_logs from backend API proxy:", error);
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
            return data;
          }
        }
        return [];
      } catch (error) {
        console.warn("Failed to fetch stop_backups from backend API proxy:", error);
        return [];
      }
    }
    const cacheKey = getListCacheKey(path, constraints);

    if (!bypassCache) {
      const cached = listCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data.map(i => enforceSecuredAccess(path, i)).filter(Boolean);
      }

      // Check local persistent cache for lists first as a very fast fallback
      if (PERSISTENT_COLLECTIONS.includes(path)) {
        try {
          // First try the granular query-specific cache
          let cachedStored = localStorage.getItem(`fs_list_cache_${path}_${cacheKey}`);
          if (!cachedStored) {
            // Fall back to general cache if constraints are simple or absent
            cachedStored = localStorage.getItem(`fs_list_cache_${path}`);
          }
          if (cachedStored) {
            const { data, timestamp } = JSON.parse(cachedStored);
            if (Date.now() - timestamp < CACHE_TTL) {
              const secured = data.map((i: any) => enforceSecuredAccess(path, i)).filter(Boolean);
              listCache.set(cacheKey, { data: secured, timestamp: Date.now() });
              return secured;
            }
          }
        } catch (e) { /* ignore */ }
      }
    }

    if (checkQuotaStatus()) {
      const cached = listCache.get(cacheKey);
      if (cached) return cached.data.map(i => enforceSecuredAccess(path, i)).filter(Boolean);

      // Fallback to persistent cache specifically for lists
      if (PERSISTENT_COLLECTIONS.includes(path)) {
        try {
          const cachedItem = localStorage.getItem(`fs_list_cache_${path}_${cacheKey}`) || localStorage.getItem(`fs_list_cache_${path}`);
          if (cachedItem) {
            const { data } = JSON.parse(cachedItem);
            return data.map((i: any) => enforceSecuredAccess(path, i)).filter(Boolean);
          }
        } catch (e) {}
      }
      return [];
    }

    if (isBypassActive()) {
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
          listCache.set(cacheKey, { data: dedupedData, timestamp: Date.now() });
          
          if (PERSISTENT_COLLECTIONS.includes(path)) {
            try {
              localStorage.setItem(`fs_list_cache_${path}_${cacheKey}`, JSON.stringify({ data: dedupedData, timestamp: Date.now() }));
              if (constraints.length === 0) {
                localStorage.setItem(`fs_list_cache_${path}`, JSON.stringify({ data: dedupedData, timestamp: Date.now() }));
              }
            } catch (e) {}
          }
          return dedupedData;
        }
        return [];
      } catch (err) {
        console.warn(`Proactive DB proxy list failed for ${path}, falling back to SDK:`, err);
      }
    }

    const performRequest = async (attempt = 1): Promise<any[]> => {
      try {
        const q = query(collection(db, path), ...constraints);

        // Try local Firestore cache first if not explicitly bypassing cache
        if (!bypassCache && attempt === 1) {
          try {
            const cacheSnapshot = await getDocsFromCache(q);
            if (cacheSnapshot && !cacheSnapshot.empty) {
              const rawData = cacheSnapshot.docs.map((doc: any) => {
                const docData = doc.data();
                const cleanItem = { ...docData, id: doc.id, uid: doc.id } as any;
                if (path === 'students') {
                  cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
                }
                return cleanItem;
              });
              const data = rawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
              const dedupedData = deduplicateArrayByID(data);
              
              // Set the RAM list cache so subsequent fast reads resolve instantly
              listCache.set(cacheKey, { data: dedupedData, timestamp: Date.now() });
              return dedupedData;
            }
          } catch (cacheErr) {
            console.warn(`[dbService] Cache-first query failed for ${path}, falling back to network:`, cacheErr);
          }
        }

        // On second attempt, we might try to bypass the SDK cache layer which can sometimes hang
        const timeoutMs = attempt === 1 ? 45000 : 90000;
        
        const querySnapshot = await Promise.race([
          getDocs(q),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Firestore List Timeout on ${path} (Attempt ${attempt})`)), timeoutMs))
        ]) as any;

        const rawData = querySnapshot.docs.map((doc: any) => {
          const docData = doc.data();
          const cleanItem = { ...docData, id: doc.id, uid: doc.id } as any;
          if (path === 'students') {
            cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
          }
          return cleanItem;
        });
        
        const data = rawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
        listCache.set(cacheKey, { data, timestamp: Date.now() });
        
        // Save to persistent storage if it's a metadata collection
        if (PERSISTENT_COLLECTIONS.includes(path)) {
          try {
            // Save the granular constraint-specific list
            localStorage.setItem(`fs_list_cache_${path}_${cacheKey}`, JSON.stringify({ data, timestamp: Date.now() }));
            
            // Also store general lists for fallback
            if (constraints.length === 0) {
              localStorage.setItem(`fs_list_cache_${path}`, JSON.stringify({ data, timestamp: Date.now() }));
            }
          } catch (e) {}
        }
        
        return deduplicateArrayByID(data);
      } catch (error) {
        if (attempt < 2 && (error instanceof Error && error.message.includes('Timeout'))) {
          console.warn(`Firestore list timeout on ${path}, retrying...`);
          await new Promise(r => setTimeout(r, 1000));
          return performRequest(attempt + 1);
        }
        
        console.warn(`Firestore list Error on ${path}: `, error instanceof Error ? error.message : String(error));

        // Try proxy fallback
        try {
          const proxyRes = await proxyRequest('list', path, { constraints });
          return proxyRes.data;
        } catch (proxyError) {
          console.error(`Both client list and proxy list failed for ${path}:`, proxyError);
        }
        
        // Final fallback: try to return ANY cached data we have
        const memoryCached = listCache.get(cacheKey);
        if (memoryCached) return memoryCached.data.map(i => enforceSecuredAccess(path, i)).filter(Boolean);

        if (PERSISTENT_COLLECTIONS.includes(path)) {
          try {
            const cachedItem = localStorage.getItem(`fs_list_cache_${path}_${cacheKey}`) || localStorage.getItem(`fs_list_cache_${path}`);
            if (cachedItem) {
              const { data } = JSON.parse(cachedItem);
              return data.map((i: any) => enforceSecuredAccess(path, i)).filter(Boolean);
            }
          } catch (e) {}
        }

        try { handleFirestoreError(error, OperationType.LIST, path); } catch (e) {}
        return []; 
      }
    };

    return performRequest();
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

    // Try granular persistent cache load
    if (PERSISTENT_COLLECTIONS.includes(path)) {
      try {
        const stored = localStorage.getItem(`fs_paginated_cache_${path}_${cacheKey}`);
        if (stored) {
          const { data, timestamp } = JSON.parse(stored);
          if (Date.now() - timestamp < CACHE_TTL) {
            return { data, lastDoc: null };
          }
        }
      } catch (e) {}
    }

    const performRequest = async (attempt = 1, forceLimit?: number): Promise<any> => {
      try {
        let activeConstraints = [...constraints];
        
        if (forceLimit !== undefined) {
          // Replace or add limit constraint
          let limitFound = false;
          activeConstraints = activeConstraints.map(c => {
            const type = (c as any).type || (c as any)._type;
            if (type === 'limit') {
              limitFound = true;
              return limit(forceLimit);
            }
            return c;
          });
          if (!limitFound) {
            activeConstraints.push(limit(forceLimit));
          }
        }

        const q = query(collection(db, path), ...activeConstraints);

        // Try local Firestore cache first if not explicitly bypassing cache
        if (!bypassCache && attempt === 1) {
          try {
            const cacheSnapshot = await getDocsFromCache(q);
            if (cacheSnapshot && !cacheSnapshot.empty) {
              const rawData = cacheSnapshot.docs.map((doc: any) => {
                const docData = doc.data();
                const cleanItem = { ...docData, id: doc.id, uid: doc.id } as any;
                if (path === 'students') {
                  cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
                }
                return cleanItem;
              });
              const data = rawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
              const lastDoc = cacheSnapshot.docs[cacheSnapshot.docs.length - 1];

              // Cache the parsed result sequence in RAM
              paginatedCache.set(cacheKey, { data, lastDoc, timestamp: Date.now() });

              // Fire and forget server fetch to refresh local database and RAM cache in background
              setTimeout(async () => {
                try {
                  const freshSnapshot = await getDocs(q);
                  const freshRawData = freshSnapshot.docs.map((doc: any) => {
                    const docData = doc.data();
                    const cleanItem = { ...docData, id: doc.id, uid: doc.id } as any;
                    if (path === 'students') {
                      cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
                    }
                    return cleanItem;
                  });
                  const freshData = freshRawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
                  const freshLastDoc = freshSnapshot.docs[freshSnapshot.docs.length - 1];
                  paginatedCache.set(cacheKey, { data: freshData, lastDoc: freshLastDoc, timestamp: Date.now() });

                  // Save to persistent storage if metadata collection
                  if (PERSISTENT_COLLECTIONS.includes(path)) {
                    localStorage.setItem(`fs_paginated_cache_${path}_${cacheKey}`, JSON.stringify({
                      data: freshData,
                      timestamp: Date.now()
                    }));
                  }
                } catch (e) {
                  console.warn(`[dbService] Background paginated list revalidation failed for ${path}:`, e);
                }
              }, 50);

              return { data, lastDoc };
            }
          } catch (cacheErr) {
            console.warn(`[dbService] Cache-first paginated query failed for ${path}, falling back to network:`, cacheErr);
          }
        }

        const timeoutMs = attempt === 1 ? 45000 : 120000;

        const snapshot = await Promise.race([
          getDocs(q),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Firestore Paginated List Timeout on ${path} (Attempt ${attempt})`)), timeoutMs))
        ]) as any;
        
        const rawData = snapshot.docs.map((doc: any) => {
          const docData = doc.data();
          const cleanItem = { ...docData, id: doc.id, uid: doc.id } as any;
          if (path === 'students') {
            cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
          }
          return cleanItem;
        });
        
        const data = rawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        // Cache the parsed result sequence in RAM
        paginatedCache.set(cacheKey, { data, lastDoc, timestamp: Date.now() });

        // Save to persistent storage if metadata collection
        if (PERSISTENT_COLLECTIONS.includes(path)) {
          try {
            localStorage.setItem(`fs_paginated_cache_${path}_${cacheKey}`, JSON.stringify({
              data,
              timestamp: Date.now()
            }));
          } catch (e) {}
        }
        
        return { data, lastDoc };
      } catch (error) {
        const isTimeout = error instanceof Error && error.message.includes('Timeout');
        
        if (attempt < 2 && isTimeout) {
          console.warn(`Firestore paginated list timeout on ${path}, retrying with reduced limit...`);
          await new Promise(r => setTimeout(r, 1500));
          
          // Try to find the existing limit if any
          let existingLimit = 50;
          for (const c of constraints) {
            const type = (c as any).type || (c as any)._type;
            if (type === 'limit') {
              existingLimit = (c as any)._value || (c as any).value || 50;
              break;
            }
          }
          
          // Reduce limit to 10 or half of existing to be safe
          const newLimit = Math.min(10, Math.floor(existingLimit / 2));
          return performRequest(attempt + 1, newLimit);
        }
        
        // Final fallback: try to return ANY cached data we have for this paginated snapshot query
        const memoryCached = paginatedCache.get(cacheKey);
        if (memoryCached) {
          return { data: memoryCached.data, lastDoc: memoryCached.lastDoc };
        }

        if (PERSISTENT_COLLECTIONS.includes(path)) {
          try {
            const stored = localStorage.getItem(`fs_paginated_cache_${path}_${cacheKey}`);
            if (stored) {
              const { data } = JSON.parse(stored);
              return { data, lastDoc: null };
            }
          } catch (e) {}
        }

        try { handleFirestoreError(error, OperationType.LIST, path); } catch(e) {}
        throw error;
      }
    };

    return performRequest();
  },

  async count(path: string, constraints: QueryConstraint[] = []) {
    if (checkQuotaStatus()) return 0;
    try {
      const q = query(collection(db, path), ...constraints);
      // Add a 30s timeout for counts
      const snapshot = await Promise.race([
        getCountFromServer(q),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Firestore Count Timeout on ${path}`)), 30000))
      ]) as any;
      
      return snapshot.data().count;
    } catch (error: any) {
      console.warn(`[dbService] Count failed for ${path} (${error.code || error.message || error}). Switched to Secure Proxy fallback.`);
      try { handleFirestoreError(error, OperationType.LIST, path); } catch(e) {}
      try {
        const proxyRes = await proxyRequest('count', path, { constraints });
        return proxyRes.count !== undefined ? proxyRes.count : (proxyRes.data ? proxyRes.data.length : 0);
      } catch (proxyError) {
        return 0;
      }
    }
  },

  subscribe(path: string, constraints: QueryConstraint[], callback: (data: any[]) => void, errorCallback?: (error: any) => void) {
    if (checkQuotaStatus()) {
        callback([]);
        return () => {};
    }

    let activeUnsubscribe: () => void = () => {};
    let isTerminated = false;

    const startProxyPolling = () => {
      if (isTerminated) return;
      console.log(`[dbService] Switched real-time subscription to Secure Proxy Polling for path: ${path}`);
      
      const fetchAndCallback = async () => {
        try {
          const proxyRes = await proxyRequest('list', path, { constraints });
          if (proxyRes && proxyRes.data) {
            const rawData = proxyRes.data.map((item: any) => {
              const cleanItem = { ...item };
              if (path === 'students') {
                cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
              }
              return cleanItem;
            });
            const data = rawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
            callback(deduplicateArrayByID(data));
          }
        } catch (err) {
          console.warn(`[Proxy Polling Sub Retry] Subscription polling failed for ${path}:`, err);
          if (errorCallback) errorCallback(err);
        }
      };

      fetchAndCallback();
      const pollingInterval = (path === 'attendance' || path === 'user_activities' || path === 'whatsapp_logs') ? 30000 : 60000;
      const intervalId = setInterval(fetchAndCallback, pollingInterval);
      activeUnsubscribe = () => {
        clearInterval(intervalId);
      };
    };

    if (isBypassActive()) {
      startProxyPolling();
      return () => {
        isTerminated = true;
        activeUnsubscribe();
      };
    }

    if (path === 'login_logs' || path === 'audit_logs' || path === 'stop_backups') {
      const endpoint = path === 'login_logs' 
        ? '/api/attendance/list-login-logs' 
        : path === 'audit_logs'
          ? '/api/attendance/list-audit-logs'
          : '/api/transport/stop-backups';
        
      const fetchAndCallback = async () => {
        try {
          const res = await resilientFetch(endpoint);
          if (res && res.ok) {
            const data = await parseResponseJson(res, []);
            if (Array.isArray(data)) {
              callback(deduplicateArrayByID(data));
            }
          }
        } catch (err) {
          console.warn(`Polling subscription failed for ${path}:`, err);
          if (errorCallback) errorCallback(err);
        }
      };

      // Trigger initial load
      fetchAndCallback();

      // Poll every 60 seconds to simulate reactive subscription (reduced from 15s to save reads)
      const intervalId = setInterval(fetchAndCallback, 60000);

      // Return cleanup function to clear interval
      return () => {
        isTerminated = true;
        clearInterval(intervalId);
      };
    }

    // Try standard onSnapshot first
    try {
      const q = query(collection(db, path), ...constraints);
      const unsub = onSnapshot(q, (snapshot) => {
        const rawData = snapshot.docs.map(doc => {
          const docData = doc.data();
          const cleanItem = { ...docData, id: doc.id, uid: doc.id } as any;
          if (path === 'students') {
            cleanItem.uniqueStudentId = cleanItem.uniqueStudentId || generateUniqueStudentId(cleanItem);
          }
          return cleanItem;
        });
        const data = rawData.map((item: any) => enforceSecuredAccess(path, item)).filter(Boolean);
        callback(deduplicateArrayByID(data));
      }, (error: any) => {
        console.warn(`[dbService] Realtime subscription error for path "${path}" (${error.code || error.message || error}). Activating self-healing fallback to secure backup proxy...`);
        try { handleFirestoreError(error, OperationType.LIST, path); } catch(e) {}
        
        // Setup proxy fallback
        startProxyPolling();
      });

      activeUnsubscribe = () => {
        unsub();
      };
    } catch (e: any) {
      console.warn(`[dbService] Exception setting up realtime subscription for ${path}:`, e.message);
      startProxyPolling();
    }

    return () => {
      isTerminated = true;
      activeUnsubscribe();
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
      console.log(`[dbService] Switched doc subscription to Secure Proxy Polling for path: ${path}/${id}`);
      
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
      const pollingInterval = (path === 'attendance' || path === 'user_activities' || path === 'whatsapp_logs') ? 30000 : 60000;
      const intervalId = setInterval(fetchAndCallback, pollingInterval);
      activeUnsubscribe = () => {
        clearInterval(intervalId);
      };
    };

    if (isBypassActive()) {
      startProxyDocPolling();
      return () => {
        isTerminated = true;
        activeUnsubscribe();
      };
    }

    // Try to provide initial data from cache if available
    const persistent = getFromPersistentCache(path, id);
    if (persistent) {
      setTimeout(() => callback({ id, ...persistent }), 0);
    }

    try {
      const unsub = onSnapshot(doc(db, path, id), (snapshot) => {
        let rawData = snapshot.exists() ? { id: snapshot.id, uid: snapshot.id, ...snapshot.data() } as any : null;
        if (rawData && path === 'students') {
          rawData.uniqueStudentId = rawData.uniqueStudentId || generateUniqueStudentId(rawData);
        }
        const data = rawData ? enforceSecuredAccess(path, rawData) : null;
        if (data) {
          saveToPersistentCache(path, id, data);
        }
        callback(data);
      }, (error) => {
        console.warn(`[dbService] Doc subscription error for path "${path}/${id}" (${error.code || error.message || error}). Activating self-healing fallback to secure backup proxy...`);
        try { handleFirestoreError(error, OperationType.GET, path); } catch(e) {}
        
        // Setup proxy fallback
        startProxyDocPolling();
      });

      activeUnsubscribe = () => {
        unsub();
      };
    } catch (e: any) {
      console.warn(`[dbService] Exception setting up doc subscription for ${path}/${id}:`, e.message);
      startProxyDocPolling();
    }

    return () => {
      isTerminated = true;
      activeUnsubscribe();
    };
  },

  resetQuota() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-reset'));
    }
  },

  isPoisoned() {
    return isSdkPoisoned || (typeof window !== 'undefined' && (window as any).isFirestorePoisoned);
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
