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

  if (sClassId && sClassId !== 'N/A') {
    resolvedClass = classes.find(c => c.id === sClassId);
    if (!resolvedClass) {
      resolvedClass = classes.find(c => 
        (c.name && c.name.toLowerCase() === sClassId.toLowerCase()) || 
        (c.id && c.id.toLowerCase() === sClassId.toLowerCase())
      );
    }
  }
  if (!resolvedClass && sClass && sClass !== 'N/A') {
    resolvedClass = classes.find(c => 
      (c.name && c.name.toLowerCase() === sClass.toLowerCase()) || 
      (c.id && c.id.toLowerCase() === sClass.toLowerCase()) ||
      (c.name && sClass.toLowerCase().includes(c.name.toLowerCase()))
    );
  }

  // 2. Resolve Batch
  let resolvedBatch: any = null;
  const sBatchId = String(student.batchId || '').trim();
  const sBatch = String(student.batch || student.batchName || '').trim();

  // If resolvedClass is known, prioritize batches belonging to this class!
  if (resolvedClass) {
    const classBatches = batches.filter(b => b.classId === resolvedClass.id || b.className === resolvedClass.name);
    
    // First, check if sBatchId directly matches a batch belonging to this class
    if (sBatchId && sBatchId !== 'N/A') {
      resolvedBatch = classBatches.find(b => 
        b.id === sBatchId || 
        (b.name && b.name.toLowerCase() === sBatchId.toLowerCase()) ||
        (b.id && b.id.toLowerCase() === sBatchId.toLowerCase())
      );
    }
    
    // Second, check if sBatch / batchName matches a batch belonging to this class
    if (!resolvedBatch && sBatch && sBatch !== 'N/A') {
      resolvedBatch = classBatches.find(b => 
        b.id === sBatch ||
        (b.name && b.name.toLowerCase() === sBatch.toLowerCase()) ||
        (b.id && b.id.toLowerCase() === sBatch.toLowerCase()) ||
        (b.name && sBatch.toLowerCase().includes(b.name.toLowerCase()))
      );
    }
  }

  // If still not resolved or no class resolved, search all batches
  if (!resolvedBatch && sBatchId && sBatchId !== 'N/A') {
    resolvedBatch = batches.find(b => b.id === sBatchId) ||
      batches.find(b => (b.name && b.name.toLowerCase() === sBatchId.toLowerCase()) || (b.id && b.id.toLowerCase() === sBatchId.toLowerCase()));
  }
  if (!resolvedBatch && sBatch && sBatch !== 'N/A') {
    resolvedBatch = batches.find(b => 
      b.id === sBatch ||
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

