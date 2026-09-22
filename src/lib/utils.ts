import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { isKnownDemoName } from "../constants/systemAccounts";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(url?: string | null) {
  if (!url || url === 'null' || url === 'undefined' || url === 'NaN') return '';
  const urlStr = String(url);
  // Convert legacy localhost/127.0.0.1 URLs to relative paths so they work in proxy environments
  if (urlStr.includes('localhost:3000/uploads/') || urlStr.includes('127.0.0.1:3000/uploads/')) {
    return urlStr.replace(/https?:\/\/(localhost|127\.0\.0\.1):3000\/uploads\//, '/uploads/');
  }
  return urlStr;
}

export function getGravatarUrl(email: string) {
  if (!email) return '';
  const trimmed = email.trim().toLowerCase();
  // We'll use a simple approach for gravatar default
  return `https://www.gravatar.com/avatar/${btoa(trimmed).replace(/[^a-zA-Z0-9]/g, '')}?d=identicon&s=400`;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

/**
 * Sorts an array of objects alphabetically by a given key.
 * Defaults to 'name' key and ascending order.
 */
export function sortAlphabetically<T>(items: T[], key: keyof T = 'name' as keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  if (!items || !Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const aVal = String((a[key] || '')).toLowerCase().trim();
    const bVal = String((b[key] || '')).toLowerCase().trim();
    
    // Handle numeric strings naturally (e.g. "Class 2" before "Class 10")
    const comparison = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? comparison : -comparison;
  });
}

/**
 * Cleans names with dots, underscores, or hyphens (e.g. "Reshmabhi.sk" -> "Reshmabhi Sk", "Suvarna.K" -> "Suvarna K")
 * and capitalizes each component properly without altering the actual letters or changing the person's identity.
 */
export function cleanPersonName(nameStr?: string | null): string {
  if (!nameStr || typeof nameStr !== 'string') return '';
  let s = nameStr.trim();
  if (!s) return '';

  // Remove surrounding parenthesis, brackets, quotes
  s = s.replace(/^[\(\[\{\"\']+|[\)\]\}\"\']+$/g, '').trim();

  // Split by whitespace, dots, underscores, hyphens, and slashes
  const parts = s.split(/[\s._\-\/]+/).filter(Boolean);
  if (parts.length > 0) {
    const formatted = parts.map(p => {
      const cleanP = p.trim();
      if (!cleanP) return '';
      if (cleanP.length === 1) return cleanP.toUpperCase();
      return cleanP.charAt(0).toUpperCase() + cleanP.slice(1);
    }).filter(Boolean).join(' ');

    return formatted.trim() || s;
  }

  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Checks if a string looks like an email address or empty placeholder
 */
export function isSyntheticOrMailName(nameStr?: string | null): boolean {
  if (!nameStr) return true;
  const s = String(nameStr).trim();
  if (!s) return true;

  // Contains @ (email)
  if (s.includes('@')) return true;

  // Generic blank placeholder terms only
  const genericBlankWords = [
    'not assigned', 'none', 'n/a', 'undefined', 'null', 
    'select teacher', 'unknown teacher', 'unknown', 'unnamed staff',
    'staff member', 'staff', 'teacher', 'admin', 'user', 'pending', 'teacher_class'
  ];
  if (genericBlankWords.includes(s.toLowerCase())) return true;

  // Matches pattern like "class 8m teacher", "class 8 ipl teacher", "8 class teacher", "class 6 m teacher", etc.
  if (/^(?:class\s*)?\d+\s*(?:class\s*)?(?:[a-z]+)?\s*teacher$/i.test(s) || /^(?:nur|nursery|lkg|ukg)\s*teacher$/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Extracts a readable name from email if no name is provided at all
 */
export function formatNameFromEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  const cleanEmail = email.toLowerCase().trim();
  const prefix = cleanEmail.split('@')[0].trim();
  if (!prefix) return '';

  // Clean common school/staff email patterns:
  // e.g. shareeftchrpml -> shareef
  // e.g. ravi_teacher -> ravi
  let cleanPrefix = prefix
    .replace(/(?:tch|teacher|staff|school|rpml|hyd|sec)+$/gi, '')
    .replace(/^(?:tch|teacher|staff|school)+/gi, '')
    .replace(/[._-]+$/, '')
    .replace(/^[._-]+/, '');

  if (!cleanPrefix) cleanPrefix = prefix;

  const parts = cleanPrefix.split(/[._-]+/).filter(Boolean);
  const formatted = parts.map(p => {
    const cleaned = p.replace(/\d+$/, '');
    if (!cleaned) return p;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }).join(' ');
  return formatted.trim();
}

/**
 * Formats a person's display name:
 * 1. STRICT RULE: User-entered authentic names in database (name, displayName, fullName, firstName + lastName)
 *    are NEVER altered or overridden with mock names.
 * 2. If no name exists or if name is a placeholder/demo, gracefully fall back to authentic name or email name.
 */
export function getPersonDisplayName(person: any, fallback: string = 'Staff Member'): string {
  if (!person) return fallback;

  // 1. If person is a string
  if (typeof person === 'string') {
    const s = person.trim();
    if (!s) return fallback;

    if (isKnownDemoName(s) || isSyntheticOrMailName(s)) {
      return fallback;
    }

    if (s.includes('@')) {
      const formatted = formatNameFromEmail(s);
      return formatted || fallback;
    }

    return cleanPersonName(s) || s;
  }

  // 2. If person is an object:
  // Explicitly saved name field (highest priority)
  const rawName = (person.name || person.displayName || person.fullName || person.studentName || '').trim();
  if (rawName && !isSyntheticOrMailName(rawName) && !isKnownDemoName(rawName)) {
    return cleanPersonName(rawName) || rawName;
  }

  // First name + Last name
  const fName = (person.firstName || '').trim();
  const lName = (person.lastName || person.secondName || '').trim();
  if (fName || lName) {
    const combined = `${fName} ${lName}`.trim();
    if (combined && !isSyntheticOrMailName(combined) && !isKnownDemoName(combined)) {
      return cleanPersonName(combined) || combined;
    }
  }

  // Authentic original or real name
  const authenticName = (person.originalName || person.realName || '').trim();
  if (authenticName && !isKnownDemoName(authenticName) && !isSyntheticOrMailName(authenticName)) {
    return cleanPersonName(authenticName) || authenticName;
  }

  // Check if explicit batch class teacher name is attached ONLY for teacher/staff records (NEVER for students)
  const isStudent = person.role === 'student' || !!person.studentId || !!person.rollNumber || !!person.admissionNumber;
  if (!isStudent) {
    const batchTeacherName = (person.classTeacherName || person.classTeacher || '').trim();
    if (batchTeacherName && !isKnownDemoName(batchTeacherName) && !isSyntheticOrMailName(batchTeacherName)) {
      return cleanPersonName(batchTeacherName) || batchTeacherName;
    }
  }

  // If rawName was an email, format it
  if (rawName && rawName.includes('@')) {
    const emailFormatted = formatNameFromEmail(rawName);
    if (emailFormatted && !isKnownDemoName(emailFormatted) && !isSyntheticOrMailName(emailFormatted)) return emailFormatted;
  }

  // Fallback to person.email
  const email = (person.email || '').trim().toLowerCase();
  if (email) {
    const formattedEmailName = formatNameFromEmail(email);
    if (formattedEmailName && !isKnownDemoName(formattedEmailName) && !isSyntheticOrMailName(formattedEmailName)) {
      return formattedEmailName;
    }

    // Dynamic naming for teacher emails only as a descriptive role label if no other name exists, e.g. stantonys4m -> Class 4M Teacher
    const match = email.replace(/@.*$/, '').match(/^(?:st)?antonys(nur|nursery|lkg|ukg|\d+)([a-z]+)?$/i);
    if (match) {
      const grade = match[1].toUpperCase();
      const section = (match[2] || 'M').toUpperCase();
      const gradeTitle = ['NUR', 'NURSERY', 'LKG', 'UKG'].includes(grade) ? grade : `Class ${grade}`;
      return `${gradeTitle} (${section}) Teacher`;
    }
  }

  return fallback;
}

/**
 * Convenience helper specifically for staff members
 */
export const getStaffDisplayName = (member: any): string => {
  if (!member) return 'Staff Member';
  return getPersonDisplayName(member, 'Staff Member');
};

/**
 * Robust helper to locate the corresponding class for any batch object
 */
export function findClassForBatch(batch: any, classes: any[] = []): any {
  if (!batch || !classes || classes.length === 0) return null;

  const bClassId = String(batch.classId || '').trim();
  const bClassName = String(batch.className || '').trim();
  const bId = String(batch.id || batch.uid || '').trim();
  const bName = String(batch.name || '').trim();

  // 1. Direct classId match
  if (bClassId && bClassId !== 'N/A') {
    const direct = classes.find(c => c && (c.id === bClassId || c.uid === bClassId));
    if (direct) return direct;
  }

  // 2. Direct className match
  if (bClassName && bClassName !== 'N/A') {
    const byName = classes.find(c => c && c.name && c.name.toLowerCase().trim() === bClassName.toLowerCase().trim());
    if (byName) return byName;
  }

  // 3. Normalized matching across IDs and names (e.g. "cls_10" vs "10_Class_Class" vs "10 Class" vs "Class 10")
  const combined = `${bClassId} ${bClassName} ${bId} ${bName}`.toLowerCase();

  if (combined.includes('nur')) {
    const c = classes.find(cls => (cls.id && cls.id.toLowerCase().includes('nur')) || (cls.name && cls.name.toLowerCase().includes('nur')));
    if (c) return c;
  }
  if (combined.includes('lkg')) {
    const c = classes.find(cls => (cls.id && cls.id.toLowerCase().includes('lkg')) || (cls.name && cls.name.toLowerCase().includes('lkg')));
    if (c) return c;
  }
  if (combined.includes('ukg')) {
    const c = classes.find(cls => (cls.id && cls.id.toLowerCase().includes('ukg')) || (cls.name && cls.name.toLowerCase().includes('ukg')));
    if (c) return c;
  }

  // Numeric grades 1 to 10
  for (let g = 10; g >= 1; g--) {
    const tokenRegex = new RegExp(`\\b${g}\\b|cls_${g}|${g}_class|class_${g}|${g}th|class\\s*${g}`, 'i');
    if (tokenRegex.test(combined)) {
      const c = classes.find(cls => {
        const clsStr = `${cls.id || ''} ${cls.name || ''} ${cls.code || ''}`.toLowerCase();
        return tokenRegex.test(clsStr);
      });
      if (c) return c;
    }
  }

  return null;
}

export function findBatchesForClass(cls: any, batches: any[] = []): any[] {
  if (!cls || !batches || batches.length === 0) return [];
  return batches.filter(b => {
    if (!b) return false;
    if (b.classId === cls.id || b.classId === cls.uid) return true;
    if (b.className && cls.name && b.className.toLowerCase().trim() === cls.name.toLowerCase().trim()) return true;
    const resolvedCls = findClassForBatch(b, [cls]);
    return resolvedCls?.id === cls.id;
  });
}

export function isStudentInBatch(student: any, batch: any): boolean {
  if (!student || !batch) return false;
  if ((student.status || 'active') !== 'active') return false;

  const sBatchId = String(student.batchId || '').trim();
  const sBatch = String(student.batch || student.batchName || '').trim();
  const bId = String(batch.id || batch.uid || '').trim();
  const bName = String(batch.name || '').trim();
  const aliases: string[] = Array.isArray(batch.aliases) ? batch.aliases : [];

  if (sBatchId && (sBatchId === bId || aliases.includes(sBatchId))) return true;
  if (sBatch && (sBatch === bName || sBatch === bId || aliases.includes(sBatch))) return true;

  const sCombined = `${sBatchId} ${sBatch}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bCombined = `${bId} ${bName}`.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (sCombined && bCombined && (sCombined === bCombined || sCombined.includes(bCombined) || bCombined.includes(sCombined))) {
    const sClass = String(student.classId || student.class || '').toLowerCase();
    const bClass = String(batch.classId || batch.className || '').toLowerCase();
    if (!sClass || !bClass) return true;
    const sNum = sClass.match(/\d+|nur|lkg|ukg/)?.[0];
    const bNum = bClass.match(/\d+|nur|lkg|ukg/)?.[0];
    if (sNum && bNum && sNum === bNum) return true;
  }

  return false;
}

/**
 * Accurately and consistently resolves a student's classId, className, batchId, and batchName
 * from raw student metadata against registered classes and batches.
 */
export function resolveStudentClassAndBatch(
  student: any,
  classes: any[] = [],
  batches: any[] = []
): {
  classId: string;
  className: string;
  batchId: string;
  batchName: string;
} {
  if (!student) {
    return { classId: '', className: '', batchId: '', batchName: '' };
  }

  // 1. Resolve Class
  let resolvedClass: any = null;
  const sClassId = String(student.classId || '').trim();
  const sClass = String(student.class || student.className || '').trim();

  // If student has explicit human-readable class name (e.g. "4 Class", "5 Class"), prioritize direct name match
  if (sClass && sClass !== 'N/A') {
    resolvedClass = classes.find(c => 
      c && c.name && c.name.toLowerCase() === sClass.toLowerCase()
    );
  }

  if (!resolvedClass && sClassId && sClassId !== 'N/A') {
    resolvedClass = classes.find(c => c && (c.id === sClassId || c.uid === sClassId));
    if (!resolvedClass) {
      resolvedClass = classes.find(c => 
        (c.name && c.name.toLowerCase() === sClassId.toLowerCase()) || 
        (c.id && c.id.toLowerCase() === sClassId.toLowerCase())
      );
    }
  }
  if (!resolvedClass && sClass && sClass !== 'N/A') {
    resolvedClass = classes.find(c => 
      (c.id && c.id.toLowerCase() === sClass.toLowerCase()) ||
      (c.name && sClass.toLowerCase().includes(c.name.toLowerCase()))
    );
  }
  if (!resolvedClass) {
    resolvedClass = findClassForBatch({ classId: sClassId, className: sClass }, classes);
  }

  // 2. Resolve Batch
  let resolvedBatch: any = null;
  const sBatchId = String(student.batchId || '').trim();
  const sBatch = String(student.batch || student.batchName || '').trim();

  // If student has explicit batchId, match directly in batches
  if (sBatchId && sBatchId !== 'N/A') {
    resolvedBatch = batches.find(b => b.id === sBatchId || b.uid === sBatchId);
  }

  // If resolvedClass is known, prioritize batches belonging to this class!
  if (!resolvedBatch && resolvedClass) {
    const classBatches = findBatchesForClass(resolvedClass, batches);
    
    // First, check if sBatchId directly matches a batch belonging to this class
    if (sBatchId && sBatchId !== 'N/A') {
      resolvedBatch = classBatches.find(b => 
        b.id === sBatchId || 
        (Array.isArray(b.aliases) && b.aliases.includes(sBatchId)) ||
        (b.name && b.name.toLowerCase() === sBatchId.toLowerCase()) ||
        (b.id && b.id.toLowerCase() === sBatchId.toLowerCase())
      );
    }
    
    // Second, check if sBatch / batchName matches a batch belonging to this class
    if (!resolvedBatch && sBatch && sBatch !== 'N/A') {
      resolvedBatch = classBatches.find(b => 
        b.id === sBatch ||
        (Array.isArray(b.aliases) && b.aliases.includes(sBatch)) ||
        (b.name && b.name.toLowerCase() === sBatch.toLowerCase()) ||
        (b.id && b.id.toLowerCase() === sBatch.toLowerCase()) ||
        (b.name && sBatch.toLowerCase().includes(b.name.toLowerCase()))
      );
    }
  }

  // If still not resolved or no class resolved, search all batches
  if (!resolvedBatch && sBatchId && sBatchId !== 'N/A') {
    resolvedBatch = batches.find(b => b.id === sBatchId || (Array.isArray(b.aliases) && b.aliases.includes(sBatchId))) ||
      batches.find(b => (b.name && b.name.toLowerCase() === sBatchId.toLowerCase()) || (b.id && b.id.toLowerCase() === sBatchId.toLowerCase()));
  }
  if (!resolvedBatch && sBatch && sBatch !== 'N/A') {
    resolvedBatch = batches.find(b => 
      b.id === sBatch ||
      (Array.isArray(b.aliases) && b.aliases.includes(sBatch)) ||
      (b.name && b.name.toLowerCase() === sBatch.toLowerCase()) ||
      (b.id && b.id.toLowerCase() === sBatch.toLowerCase())
    );
  }

  return {
    classId: resolvedClass ? resolvedClass.id : (student.classId || student.class || ''),
    className: resolvedClass ? resolvedClass.name : (student.class || student.className || ''),
    batchId: resolvedBatch ? resolvedBatch.id : (student.batchId || student.batch || ''),
    batchName: resolvedBatch ? resolvedBatch.name : (student.batch || student.batchName || '')
  };
}

