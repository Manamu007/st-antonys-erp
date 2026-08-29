// System accounts with pre-configured access
export const SYSTEM_ACCOUNTS = [
  'manamunagaraju@gmail.com',
  'mddesigns007@gmail.com',
  'antonyschool14@gmail.com',
  'saikumari361@gmail.com',
  'doctor@antony.com',
  // stantonys teacher emails
  'stantonysnur@gmail.com',
  'stantonyslkg@gmail.com',
  'stantonysukg@gmail.com',
  'stantonys1m@gmail.com',
  'stantonys2m@gmail.com',
  'stantonys3m@gmail.com',
  'stantonys4m@gmail.com',
  'stantonys5m@gmail.com',
  'stantonys6m@gmail.com',
  'stantonys7m@gmail.com',
  'stantonys8m@gmail.com',
  'stantonys9m@gmail.com',
  'stantonys10m@gmail.com',
  'stantonys1s@gmail.com',
  'stantonys2s@gmail.com',
  'stantonys3s@gmail.com',
  'stantonys4s@gmail.com',
  'stantonys5s@gmail.com',
  'stantonys6s@gmail.com',
  'stantonys7s@gmail.com',
  'stantonys8s@gmail.com',
  'stantonys9s@gmail.com',
  'stantonys10s@gmail.com',
  // antonys teacher emails (without 'st' prefix)
  'antonysnur@gmail.com',
  'antonyslkg@gmail.com',
  'antonysukg@gmail.com',
  'antonys1m@gmail.com',
  'antonys2m@gmail.com',
  'antonys3m@gmail.com',
  'antonys4m@gmail.com',
  'antonys5m@gmail.com',
  'antonys6m@gmail.com',
  'antonys7m@gmail.com',
  'antonys8m@gmail.com',
  'antonys9m@gmail.com',
  'antonys10m@gmail.com',
  'antonys1s@gmail.com',
  'antonys2s@gmail.com',
  'antonys3s@gmail.com',
  'antonys4s@gmail.com',
  'antonys5s@gmail.com',
  'antonys6s@gmail.com',
  'antonys7s@gmail.com',
  'antonys8s@gmail.com',
  'antonys9s@gmail.com',
  'antonys10s@gmail.com'
];

export const SYSTEM_ROLE_MAPPING: Record<string, string> = {
  'saikumari361@gmail.com': 'vice_principal',
  'mddesigns007@gmail.com': 'admin',
  'doctor@antony.com': 'doctor',
  'stantonysnur@gmail.com': 'teacher_class',
  'stantonyslkg@gmail.com': 'teacher_class',
  'stantonysukg@gmail.com': 'teacher_class',
  'stantonys1m@gmail.com': 'teacher_class',
  'stantonys2m@gmail.com': 'teacher_class',
  'stantonys3m@gmail.com': 'teacher_class',
  'stantonys4m@gmail.com': 'teacher_class',
  'stantonys5m@gmail.com': 'teacher_class',
  'stantonys6m@gmail.com': 'teacher_class',
  'stantonys7m@gmail.com': 'teacher_class',
  'stantonys8m@gmail.com': 'teacher_class',
  'stantonys9m@gmail.com': 'teacher_class',
  'stantonys10m@gmail.com': 'teacher_class',
  'stantonys1s@gmail.com': 'teacher_class',
  'stantonys2s@gmail.com': 'teacher_class',
  'stantonys3s@gmail.com': 'teacher_class',
  'stantonys4s@gmail.com': 'teacher_class',
  'stantonys5s@gmail.com': 'teacher_class',
  'stantonys6s@gmail.com': 'teacher_class',
  'stantonys7s@gmail.com': 'teacher_class',
  'stantonys8s@gmail.com': 'teacher_class',
  'stantonys9s@gmail.com': 'teacher_class',
  'stantonys10s@gmail.com': 'teacher_class',
  'antonysnur@gmail.com': 'teacher_class',
  'antonyslkg@gmail.com': 'teacher_class',
  'antonysukg@gmail.com': 'teacher_class',
  'antonys1m@gmail.com': 'teacher_class',
  'antonys2m@gmail.com': 'teacher_class',
  'antonys3m@gmail.com': 'teacher_class',
  'antonys4m@gmail.com': 'teacher_class',
  'antonys5m@gmail.com': 'teacher_class',
  'antonys6m@gmail.com': 'teacher_class',
  'antonys7m@gmail.com': 'teacher_class',
  'antonys8m@gmail.com': 'teacher_class',
  'antonys9m@gmail.com': 'teacher_class',
  'antonys10m@gmail.com': 'teacher_class',
  'antonys1s@gmail.com': 'teacher_class',
  'antonys2s@gmail.com': 'teacher_class',
  'antonys3s@gmail.com': 'teacher_class',
  'antonys4s@gmail.com': 'teacher_class',
  'antonys5s@gmail.com': 'teacher_class',
  'antonys6s@gmail.com': 'teacher_class',
  'antonys7s@gmail.com': 'teacher_class',
  'antonys8s@gmail.com': 'teacher_class',
  'antonys9s@gmail.com': 'teacher_class',
  'antonys10s@gmail.com': 'teacher_class'
};

export interface SystemTeacherProfileData {
  name?: string;
  designation?: string;
  department?: string;
  classTeacherBatchName?: string;
  gender?: string;
  qualification?: string;
  experience?: string;
  subjects?: string[];
  teachingClasses?: string[];
  class?: string;
  section?: string;
  photoURL?: string;
}

// No hardcoded mock/demo teacher profiles
export const SYSTEM_TEACHER_PROFILES: Record<string, SystemTeacherProfileData> = {};

export const KNOWN_DEMO_NAMES = new Set([
  'john doe',
  'jane doe',
  'demo teacher',
  'sample staff',
  'mock teacher',
  'test student',
  'sample student',
  'demo user',
  'mock user',
  'test teacher',
  'demo student',
  'sample user',
  'dummy user',
  'test staff',
  'demostudentrazerpay',
  'demostudentrazorpay',
  'demostudetrazerpay'
]);

/**
 * Checks if a name string matches known demo/mock teacher or student names.
 */
export function isKnownDemoName(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim().toLowerCase();
  if (!clean) return false;
  if (KNOWN_DEMO_NAMES.has(clean)) return true;

  if (
    clean.includes('demo student') ||
    clean.includes('demostudent') ||
    clean.includes('demostude') ||
    clean.includes('sample student') ||
    clean.includes('mock student') ||
    clean.includes('test student')
  ) {
    return true;
  }

  const noPunct = clean.replace(/[^a-z]/g, '');
  for (const demo of KNOWN_DEMO_NAMES) {
    if (noPunct === demo.replace(/[^a-z]/g, '')) return true;
  }
  return false;
}

/**
 * Checks if a staff or user record was generated as a pure mock/demo entry
 */
export function isDemoStaffRecord(record: any): boolean {
  if (!record) return false;
  if (record.isDemo || record.mock || record.isSample) return true;
  const email = (record.email || '').toLowerCase().trim();
  const name = (record.name || record.displayName || '').toLowerCase().trim();
  if (email.startsWith('demo_') || email.startsWith('mock_') || email.startsWith('test_') || email.includes('@example.com')) {
    return true;
  }
  if (name.includes('demo staff') || name.includes('mock teacher') || name.includes('sample faculty')) {
    return true;
  }
  return false;
}

/**
 * Checks if a student record is a mock/demo entry
 */
export function isDemoStudentRecord(record: any): boolean {
  if (!record) return false;
  if (record.isDemo || record.mock || record.isSample) return true;
  const email = (record.email || record.parentEmail || '').toLowerCase().trim();
  const name = (record.name || record.studentName || record.fullName || '').toLowerCase().trim();
  const roll = (record.rollNumber || record.rollNo || record.admissionNo || '').toLowerCase().trim();
  if (
    email.startsWith('demo_') ||
    email.startsWith('mock_') ||
    email.includes('@example.com') ||
    email.includes('demostudent') ||
    email.includes('demostude') ||
    email.includes('razerpay')
  ) {
    return true;
  }
  if (roll.startsWith('demo-') || roll.startsWith('mock-') || roll.startsWith('sample-')) {
    return true;
  }
  if (
    name === 'john doe' ||
    name === 'jane doe' ||
    name.includes('demo student') ||
    name.includes('demostudent') ||
    name.includes('demostude') ||
    name.includes('sample student') ||
    name.includes('test student') ||
    isKnownDemoName(name)
  ) {
    return true;
  }
  return false;
}

/**
 * Checks if a class or batch record is a mock/demo entry
 */
export function isDemoClassOrBatchRecord(record: any): boolean {
  if (!record) return false;
  if (record.isDemo || record.mock || record.isSample) return true;
  const name = (record.name || record.className || record.batchName || '').toLowerCase().trim();
  if (name.includes('demo class') || name.includes('demo batch') || name.includes('sample batch') || name.includes('mock batch')) {
    return true;
  }
  return false;
}

export const DEVELOPER_ACCOUNTS = [
  'manamunagaraju@gmail.com',
  'mddesigns007@gmail.com',
  'antonyschool14@gmail.com',
  'divyamanamu4@gmail.com'
];

/**
 * Checks if an email, username, or ID belongs to a Teacher / Class Teacher account.
 */
export const isTeacherAccountOrEmail = (input: string | null | undefined): boolean => {
  if (!input) return false;
  const normalized = input.toLowerCase().trim();
  const rawClean = normalized.replace(/@.*$/, ''); // strip domain

  // Explicit non-teacher exclusions
  if (
    normalized.includes('reception') ||
    normalized.includes('accountant') ||
    normalized.includes('driver') ||
    normalized.includes('doctor') ||
    normalized.includes('hospital') ||
    normalized.includes('clerk') ||
    normalized.includes('warden') ||
    normalized.includes('admin') ||
    normalized.includes('principal') ||
    normalized.includes('student') ||
    normalized.includes('parent')
  ) {
    return false;
  }

  // Regex pattern for stantonys / antonys class grades (e.g. antonys3m, stantonys9m, antonys5ipl, etc.)
  const match = rawClean.match(/^(?:st)?antonys(nur|nursery|lkg|ukg|\d+)([a-z]+)?$/i);
  if (match) return true;

  if (
    normalized.includes('teacher_class') ||
    normalized.includes('classteacher') ||
    normalized.includes('teacher') ||
    normalized.includes('faculty') ||
    normalized.startsWith('tch-') ||
    normalized.startsWith('tch_')
  ) {
    return true;
  }

  if (SYSTEM_ROLE_MAPPING[normalized] && SYSTEM_ROLE_MAPPING[normalized].includes('teacher')) {
    return true;
  }

  return false;
};

/**
 * Resolves structural metadata for class teacher accounts without injecting fake/demo names.
 */
export const getSystemTeacherProfile = (input: string | null | undefined): SystemTeacherProfileData | null => {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();
  const rawKey = normalized.replace(/@.*$/, '');

  // Dynamic structural pattern matcher for class/section metadata (NO fake names)
  const match = rawKey.match(/^(?:st)?antonys(nur|nursery|lkg|ukg|\d+)([a-z]+)?/i);
  if (match) {
    const rawGrade = match[1].toLowerCase();
    const rawSection = (match[2] || 'm').toUpperCase();
    const isKindergarten = ['nur', 'nursery', 'lkg', 'ukg'].includes(rawGrade);
    const gradeNum = parseInt(rawGrade);
    const isPrimary = isKindergarten || (!isNaN(gradeNum) && gradeNum <= 5);

    let className = `Class ${rawGrade}`;
    if (rawGrade === 'nur' || rawGrade === 'nursery') className = 'Nursery';
    else if (rawGrade === 'lkg') className = 'LKG';
    else if (rawGrade === 'ukg') className = 'UKG';

    return {
      name: '',
      designation: 'Class Teacher',
      department: isPrimary ? 'Primary' : 'High School',
      classTeacherBatchName: `${rawSection}-Batch`,
      gender: '',
      qualification: '',
      experience: '',
      subjects: [],
      teachingClasses: [className],
      class: className,
      section: rawSection
    };
  }

  return null;
};

export const isSystemAccount = (email: string | null | undefined) => {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (
    normalized.includes('reception') ||
    normalized.includes('accountant') ||
    normalized.includes('driver') ||
    normalized.includes('doctor') ||
    normalized.includes('clerk') ||
    normalized.includes('warden')
  ) {
    return false;
  }
  if (
    normalized.includes('teacher_class') ||
    normalized.includes('classteacher') ||
    isTeacherAccountOrEmail(normalized)
  ) return true;
  return SYSTEM_ACCOUNTS.includes(normalized);
};

export const isDeveloperAccount = (email: string | null | undefined) => {
  if (!email) return false;
  return DEVELOPER_ACCOUNTS.includes(email.toLowerCase().trim());
};

export const getSystemAccountRole = (email: string | null | undefined): string => {
  if (!email) return 'staff';
  const normalized = email.toLowerCase().trim();
  if (SYSTEM_ROLE_MAPPING[normalized]) return SYSTEM_ROLE_MAPPING[normalized];
  if (normalized.includes('reception')) return 'receptionist';
  if (normalized.includes('accountant')) return 'accountant';
  if (normalized.includes('doctor')) return 'doctor';
  if (normalized.includes('driver')) return 'driver';
  if (normalized.includes('clerk')) return 'clerk';
  if (isTeacherAccountOrEmail(normalized)) {
    return 'teacher_class';
  }
  if (isDeveloperAccount(normalized)) return 'admin';
  if (isSystemAccount(normalized)) return 'admin';
  return 'staff';
};

