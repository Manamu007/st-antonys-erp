import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { isKnownDemoName } from "../constants/systemAccounts";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(url?: string | null) {
  if (!url || url === 'null' || url === 'undefined' || url === 'NaN') return '';
  const urlStr = String(url).trim();
  if (urlStr.startsWith('data:') || urlStr.startsWith('blob:')) return urlStr;

  // Convert any host/domain uploads URL to relative /uploads/ path so it loads universally
  const uploadsIndex = urlStr.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return urlStr.substring(uploadsIndex);
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

  // Numeric grades 10 down to 1
  for (let g = 10; g >= 1; g--) {
    const tokenRegex = new RegExp(`(?:^|[^0-9]|cls_|class_|class\\s*)${g}(?!\\d)`, 'i');
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

export function findBatchesForClass(cls: any, batches: any[] = [], allClasses: any[] = []): any[] {
  if (!cls || !batches || batches.length === 0) return [];
  const candidateClasses = (Array.isArray(allClasses) && allClasses.length > 0) ? allClasses : [cls];
  return batches.filter(b => {
    if (!b) return false;
    if (b.classId === cls.id || b.classId === cls.uid) return true;
    if (b.className && cls.name && b.className.toLowerCase().trim() === cls.name.toLowerCase().trim()) return true;
    const resolvedCls = findClassForBatch(b, candidateClasses);
    return resolvedCls?.id === cls.id;
  });
}

export function doesStudentMatchClass(student: any, batch: any, classes: any[] = []): boolean {
  if (!student || !batch) return false;

  const sClassId = String(student.classId || '').trim();
  const sClass = String(student.class || student.className || '').trim();
  const bClassId = String(batch.classId || '').trim();
  const bClass = String(batch.className || batch.class || '').trim();

  let resolvedBClassId = bClassId;
  let resolvedBClassName = bClass;
  if ((!resolvedBClassId || !resolvedBClassName) && Array.isArray(classes) && classes.length > 0) {
    const foundCls = findClassForBatch(batch, classes);
    if (foundCls) {
      resolvedBClassId = resolvedBClassId || foundCls.id || foundCls.uid || '';
      resolvedBClassName = resolvedBClassName || foundCls.name || '';
    }
  }

  // 1. Direct classId match
  if (sClassId && resolvedBClassId && sClassId === resolvedBClassId) {
    return true;
  }

  // 2. Direct className match
  if (sClass && resolvedBClassName && sClass.toLowerCase().trim() === resolvedBClassName.toLowerCase().trim()) {
    return true;
  }

  // 3. Cross check classId and className
  if (sClassId && resolvedBClassName && sClassId.toLowerCase().trim() === resolvedBClassName.toLowerCase().trim()) {
    return true;
  }
  if (sClass && resolvedBClassId && sClass.toLowerCase().trim() === resolvedBClassId.toLowerCase().trim()) {
    return true;
  }

  // 4. Token grade match (10 down to 1, nursery, lkg, ukg)
  const sCombined = `${sClassId} ${sClass}`.toLowerCase();
  const bCombined = `${resolvedBClassId} ${resolvedBClassName} ${batch.id || ''} ${batch.code || ''}`.toLowerCase();

  if (bCombined.includes('nur') || sCombined.includes('nur')) {
    return bCombined.includes('nur') && sCombined.includes('nur');
  }
  if (bCombined.includes('lkg') || sCombined.includes('lkg')) {
    return bCombined.includes('lkg') && sCombined.includes('lkg');
  }
  if (bCombined.includes('ukg') || sCombined.includes('ukg')) {
    return bCombined.includes('ukg') && sCombined.includes('ukg');
  }

  for (let g = 10; g >= 1; g--) {
    const regex = new RegExp(`(^|[^0-9])${g}([^0-9]|$)`, 'i');
    const sHasGrade = regex.test(sCombined);
    const bHasGrade = regex.test(bCombined);
    if (sHasGrade || bHasGrade) {
      return sHasGrade && bHasGrade;
    }
  }

  return false;
}

export function isStudentInBatch(student: any, batch: any, classes: any[] = [], allBatches: any[] = []): boolean {
  if (!student || !batch) return false;

  const bId = String(batch.id || batch.uid || '').trim();
  const bName = String(batch.name || '').trim();
  const bSection = String(batch.section || '').trim();
  const aliases: string[] = Array.isArray(batch.aliases) ? batch.aliases : [];

  const sBatchId = String(student.batchId || '').trim();
  const sBatch = String(student.batch || student.batchName || '').trim();

  // If allBatches is provided, use resolveStudentClassAndBatch for 1-to-1 exact resolution
  if (allBatches && allBatches.length > 0) {
    const resolved = resolveStudentClassAndBatch(student, classes, allBatches);
    if (resolved.batchId) {
      return resolved.batchId === bId;
    }
    if (resolved.batchName && bName) {
      return resolved.batchName.toLowerCase() === bName.toLowerCase();
    }
  }

  // RULE 1: Direct batchId match
  if (sBatchId && sBatchId !== 'N/A') {
    if (sBatchId === bId || (batch.uid && sBatchId === batch.uid) || aliases.includes(sBatchId)) {
      if (classes && classes.length > 0) {
        return doesStudentMatchClass(student, batch, classes);
      }
      return true;
    }
    
    const cleanS = sBatchId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanB = bId.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanS === cleanB) {
      if (classes && classes.length > 0) {
        return doesStudentMatchClass(student, batch, classes);
      }
      return true;
    }
  }

  // RULE 2: Direct match by batch name / section within the same class
  if (sBatch && sBatch !== 'N/A') {
    if (sBatch.toLowerCase().trim() === bName.toLowerCase().trim() ||
        (bSection && sBatch.toLowerCase().trim() === bSection.toLowerCase().trim()) ||
        aliases.some(a => a.toLowerCase().trim() === sBatch.toLowerCase().trim())) {
      if (classes && classes.length > 0) {
        return doesStudentMatchClass(student, batch, classes);
      }
      return true;
    }

    if (doesStudentMatchClass(student, batch, classes)) {
      const normS = sBatch.toLowerCase().replace(/batch|section|class|\s|[-_]/g, '');
      const normB = bName.toLowerCase().replace(/batch|section|class|\s|[-_]/g, '');
      const normSec = bSection.toLowerCase().replace(/batch|section|class|\s|[-_]/g, '');
      if (normS && (normS === normB || (normSec && normS === normSec))) {
        return true;
      }
    }
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

  // If student has an explicit batchId that directly matches a registered batch, honor it strictly!
  if (sBatchId && sBatchId !== 'N/A' && sBatchId !== 'undefined') {
    resolvedBatch = batches.find(b => 
      b && (b.id === sBatchId || b.uid === sBatchId)
    );
  }

  // If resolvedClass is known, prioritize batches belonging to this class!
  if (!resolvedBatch && resolvedClass) {
    const classBatches = findBatchesForClass(resolvedClass, batches, classes);

    // 1. Check if sBatchId matches a batch belonging to this class (by id, uid or alias)
    if (sBatchId && sBatchId !== 'N/A' && sBatchId !== 'undefined') {
      resolvedBatch = classBatches.find(b => 
        b.id === sBatchId || 
        b.uid === sBatchId ||
        (Array.isArray(b.aliases) && b.aliases.includes(sBatchId)) ||
        (b.name && b.name.toLowerCase().trim() === sBatchId.toLowerCase().trim()) ||
        (b.id && b.id.toLowerCase().trim() === sBatchId.toLowerCase().trim())
      );
    }

    // 2. Check if sBatch (human-readable name e.g. "S-Batch", "IPL", "M-Batch", "Section A") matches a batch in this class
    if (!resolvedBatch && sBatch && sBatch !== 'N/A' && sBatch !== 'undefined') {
      resolvedBatch = classBatches.find(b => 
        (b.section && b.section.toLowerCase().trim() === sBatch.toLowerCase().trim()) ||
        (b.name && b.name.toLowerCase().trim() === sBatch.toLowerCase().trim()) ||
        (Array.isArray(b.aliases) && b.aliases.some((a: string) => a.toLowerCase().trim() === sBatch.toLowerCase().trim()))
      );
      if (!resolvedBatch) {
        const normS = sBatch.toLowerCase().replace(/batch|section|class|\s|[-_]/g, '');
        resolvedBatch = classBatches.find(b => {
          const normB = (b.name || '').toLowerCase().replace(/batch|section|class|\s|[-_]/g, '');
          const normSec = (b.section || '').toLowerCase().replace(/batch|section|class|\s|[-_]/g, '');
          return normS && (normS === normB || normS === normSec);
        });
      }
    }
  }

  // Fallback: If not resolved yet, search all batches by sBatchId or sBatch
  if (!resolvedBatch && sBatchId && sBatchId !== 'N/A' && sBatchId !== 'undefined') {
    resolvedBatch = batches.find(b => 
      b.id === sBatchId || 
      b.uid === sBatchId || 
      (Array.isArray(b.aliases) && b.aliases.includes(sBatchId)) ||
      (b.name && b.name.toLowerCase() === sBatchId.toLowerCase()) || 
      (b.id && b.id.toLowerCase() === sBatchId.toLowerCase())
    );
  }

  if (!resolvedBatch && sBatch && sBatch !== 'N/A' && sBatch !== 'undefined') {
    resolvedBatch = batches.find(b => 
      (b.section && b.section.toLowerCase() === sBatch.toLowerCase()) ||
      (b.name && b.name.toLowerCase() === sBatch.toLowerCase()) ||
      (Array.isArray(b.aliases) && b.aliases.some((a: string) => a.toLowerCase() === sBatch.toLowerCase()))
    );
  }

  return {
    classId: resolvedClass ? resolvedClass.id : (student.classId || student.class || ''),
    className: resolvedClass ? resolvedClass.name : (student.class || student.className || ''),
    batchId: resolvedBatch ? resolvedBatch.id : (student.batchId || student.batch || ''),
    batchName: resolvedBatch ? resolvedBatch.name : (student.batch || student.batchName || '')
  };
}

/**
 * Normalizes student gender into 'male' | 'female' | 'other'
 */
export function normalizeStudentGender(gender?: string | null): 'male' | 'female' | 'other' {
  if (!gender) return 'male';
  const g = String(gender).trim().toLowerCase();
  if (g === 'female' || g === 'f' || g === 'girl' || g === 'girls') return 'female';
  if (g === 'male' || g === 'm' || g === 'boy' || g === 'boys') return 'male';
  return 'other';
}

/**
 * Sorts students in a section according to mandatory school rule:
 * In each section, male students appear first in ascending alphabetical order of name,
 * and female students appear second in ascending alphabetical order of name,
 * followed by others in ascending alphabetical order.
 */
export function sortStudentsBySectionRules<T extends { name?: string; firstName?: string; secondName?: string; gender?: string }>(students: T[]): T[] {
  const sortAsc = (list: T[]) => [...list].sort((a, b) => {
    const nameA = (a.name || `${a.firstName || ''} ${a.secondName || ''}`).trim();
    const nameB = (b.name || `${b.firstName || ''} ${b.secondName || ''}`).trim();
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  const males = sortAsc(students.filter(s => normalizeStudentGender(s.gender) === 'male'));
  const females = sortAsc(students.filter(s => normalizeStudentGender(s.gender) === 'female'));
  const others = sortAsc(students.filter(s => normalizeStudentGender(s.gender) === 'other'));

  return [...males, ...females, ...others];
}

/**
 * Calculates sequential roll numbers (1..M for boys, M+1..N for girls) for a section of students.
 */
export function calculateSectionRollNumbers<T extends { id?: string; uid?: string; name?: string; firstName?: string; secondName?: string; gender?: string; rollNumber?: string; rollNo?: string }>(
  students: T[]
): Array<{ student: T; rollNumber: string; isChanged: boolean }> {
  const sorted = sortStudentsBySectionRules(students);
  return sorted.map((student, idx) => {
    const rollNumber = String(idx + 1);
    const currentRoll = String(student.rollNumber || student.rollNo || '').trim();
    return {
      student,
      rollNumber,
      isChanged: currentRoll !== rollNumber
    };
  });
}


