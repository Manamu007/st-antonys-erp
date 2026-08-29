import { limit } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { isTeacherAccountOrEmail, getSystemTeacherProfile, SYSTEM_TEACHER_PROFILES } from '../constants/systemAccounts';
import { isSyntheticOrMailName } from '../lib/utils';

export interface TeacherAssignments {
  assignedClassIds: Set<string>;
  assignedClassNames: Set<string>;
  assignedBatchIds: Set<string>;
  assignedBatchNames: Set<string>;
  assignedSubjects: Set<string>;
  isTeacher: boolean;
  classTeacherBatchId?: string;
  classTeacherBatchName?: string;
  classTeacherClassId?: string;
  classTeacherClassName?: string;
}

export function extractGrade(str: string): string | null {
  if (!str) return null;
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  if (s.includes('nur') || s.includes('nursery')) return 'nur';
  if (s.includes('lkg')) return 'lkg';
  if (s.includes('ukg')) return 'ukg';
  const m = s.match(/\b(10|[1-9])\b/) || s.match(/class\s*(10|[1-9])/i) || s.match(/(10|[1-9])\s*class/i) || s.match(/(10|[1-9])(?:st|nd|rd|th)/i);
  if (m) return m[1];
  return null;
}

export function extractSection(str: string): string | null {
  if (!str) return null;
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  if (s.includes('ipl')) return 'ipl';
  if (s.includes('m batch') || s.includes('m-batch') || s.includes('mbatch') || s.match(/\bm\b/)) return 'm';
  if (s.includes('s batch') || s.includes('s-batch') || s.includes('sbatch') || s.match(/\bs\b/) || s.includes('ths')) return 's';
  if (s.includes('a batch') || s.match(/\ba\b/)) return 'a';
  if (s.includes('b batch') || s.match(/\bb\b/)) return 'b';
  if (s.includes('c batch') || s.match(/\bc\b/)) return 'c';
  return null;
}

/**
 * Normalizes role strings to check if a user is a teacher or class teacher.
 */
export function isTeacherRole(role: string, email?: string, name?: string): boolean {
  const r = (role || '').toLowerCase().trim();
  const e = (email || '').toLowerCase().trim();
  const n = (name || '').toLowerCase().trim();

  const nonTeacherRoles = [
    'admin', 'super_admin', 'superadmin', 'principal', 'vice_principal',
    'receptionist', 'reception', 'accountant', 'clerk', 'driver', 'doctor',
    'student', 'parent', 'warden', 'hostel_warden', 'hospital_user', 'hospital',
    'attendant', 'helper', 'aya'
  ];
  if (nonTeacherRoles.includes(r)) return false;

  if (
    e.includes('reception') || n.includes('reception') ||
    e.includes('accountant') || n.includes('accountant') ||
    e.includes('driver') || n.includes('driver') ||
    e.includes('doctor') || n.includes('doctor') ||
    e.includes('clerk') || n.includes('clerk') ||
    e.includes('warden') || n.includes('warden') ||
    e.includes('admin') || n.includes('admin') ||
    e.includes('principal') || n.includes('principal')
  ) {
    return false;
  }

  return (
    r.includes('teacher') ||
    r === 'teacher_class' ||
    r === 'class_teacher' ||
    r === 'teacher_subject' ||
    isTeacherAccountOrEmail(e) ||
    isTeacherAccountOrEmail(n) ||
    (e.includes('teacher') && !e.includes('reception')) ||
    (n.includes('teacher') && !n.includes('reception'))
  );
}

export const checkIsTeacherAccount = isTeacherRole;

/**
 * Resolves all assigned classes, batches, and subjects for a logged-in teacher.
 */
export async function getTeacherAssignments(
  user: any,
  profile: any,
  role: string
): Promise<TeacherAssignments> {
  const assignedClassIds = new Set<string>();
  const assignedClassNames = new Set<string>();
  const assignedBatchIds = new Set<string>();
  const assignedBatchNames = new Set<string>();
  const assignedSubjects = new Set<string>();

  const emailClean = (user?.email || profile?.email || '').toLowerCase().trim();
  const nameClean = (user?.displayName || profile?.name || '').toLowerCase().trim();
  const uid = user?.uid || profile?.uid || profile?.id || '';

  const isTeacher = isTeacherRole(role || profile?.role, emailClean, nameClean);

  if (!isTeacher) {
    return {
      assignedClassIds,
      assignedClassNames,
      assignedBatchIds,
      assignedBatchNames,
      assignedSubjects,
      isTeacher: false
    };
  }

  try {
    const [batchesList, classesList, timetablesList, staffList] = await Promise.all([
      dbService.list('batches', [limit(300)]).catch(() => []),
      dbService.list('classes', [limit(200)]).catch(() => []),
      dbService.list('timetables', [limit(300)]).catch(() => []),
      dbService.list('staff', [limit(300)]).catch(() => [])
    ]);

    const norm = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const genericWords = ['class', 'classes', 'teacher', 'classteacher', 'staff', 'none', 'na', 'undefined', 'null', 'batch', 'section', 'notassigned'];

    // Gather all matching teacher profile records from staff
    const matchedProfiles: any[] = [];
    const matchIds = new Set<string>();
    const matchNormNames = new Set<string>();
    const matchEmails = new Set<string>();

    if (uid) matchIds.add(String(uid).toLowerCase().trim());
    if (profile?.id) matchIds.add(String(profile.id).toLowerCase().trim());
    if (profile?.uid) matchIds.add(String(profile.uid).toLowerCase().trim());
    if ((profile as any)?.staffId) matchIds.add(String((profile as any).staffId).toLowerCase().trim());
    if ((profile as any)?.customId) matchIds.add(String((profile as any).customId).toLowerCase().trim());
    if ((profile as any)?.teacherId) matchIds.add(String((profile as any).teacherId).toLowerCase().trim());

    if (nameClean && !genericWords.includes(norm(nameClean))) matchNormNames.add(norm(nameClean));
    if ((profile as any)?.displayName && !genericWords.includes(norm((profile as any).displayName))) {
      matchNormNames.add(norm((profile as any).displayName));
    }
    if (emailClean) matchEmails.add(emailClean);

    (staffList as any[]).forEach(s => {
      const sEmail = (s.email || '').toLowerCase().trim();
      const sNameNorm = norm(s.name || '');
      const sUid = String(s.uid || s.id || '').toLowerCase().trim();
      const sStaffId = String(s.staffId || s.customId || '').toLowerCase().trim();

      const isMatch = (
        (emailClean && sEmail === emailClean) ||
        (uid && sUid && (sUid === uid || matchIds.has(sUid))) ||
        (sStaffId && matchIds.has(sStaffId)) ||
        (sNameNorm && matchNormNames.has(sNameNorm))
      );

      if (isMatch) {
        matchedProfiles.push(s);
        if (s.id) matchIds.add(String(s.id).toLowerCase().trim());
        if (s.uid) matchIds.add(String(s.uid).toLowerCase().trim());
        if (s.staffId) matchIds.add(String(s.staffId).toLowerCase().trim());
        if (s.customId) matchIds.add(String(s.customId).toLowerCase().trim());
        if (sEmail) matchEmails.add(sEmail);
        if (sNameNorm && !genericWords.includes(sNameNorm)) matchNormNames.add(sNameNorm);
      }
    });

    if (profile) matchedProfiles.push(profile);

    matchedProfiles.forEach(p => {
      if (p.classId) assignedClassIds.add(String(p.classId));
      if (p.className && !genericWords.includes(norm(p.className))) {
        assignedClassNames.add(String(p.className).toLowerCase().trim());
      }
      if (p.class && !genericWords.includes(norm(p.class))) {
        assignedClassNames.add(String(p.class).toLowerCase().trim());
      }

      if (p.classTeacherBatchId) assignedBatchIds.add(String(p.classTeacherBatchId));
      if (p.batchId) assignedBatchIds.add(String(p.batchId));
      if (p.batchName && !genericWords.includes(norm(p.batchName))) {
        assignedBatchNames.add(String(p.batchName).toLowerCase().trim());
      }
      if (p.section && !genericWords.includes(norm(p.section))) {
        assignedBatchNames.add(String(p.section).toLowerCase().trim());
      }

      if (Array.isArray(p.batchIds)) {
        p.batchIds.forEach((bId: any) => bId && assignedBatchIds.add(String(bId)));
      }

      if (Array.isArray(p.staffBatches)) {
        p.staffBatches.forEach((bId: any) => bId && assignedBatchIds.add(String(bId)));
      }

      if (Array.isArray(p.subjects)) {
        p.subjects.forEach((subj: any) => assignedSubjects.add(String(subj).toLowerCase().trim()));
      }

      if (Array.isArray(p.subjectAssignments)) {
        p.subjectAssignments.forEach((sa: any) => {
          if (sa.classId) assignedClassIds.add(String(sa.classId));
          if (sa.batchId) assignedBatchIds.add(String(sa.batchId));
          if (sa.subjectName || sa.subject) {
            assignedSubjects.add(String(sa.subjectName || sa.subject).toLowerCase().trim());
          }
        });
      }
    });

    // Check stantonys / antonys email pattern (e.g., stantonys3m, antonys3m, stantonys9m, antonys9m, stantonys5ipl, stantonys6ths, stantonysnur, stantonyslkg, stantonysukg)
    const stantonysMatch = emailClean.match(/(?:st)?antonys(nur|nursery|lkg|ukg|\d+)([a-z]+)?/i) || nameClean.match(/(?:st)?antonys(nur|nursery|lkg|ukg|\d+)([a-z]+)?/i);
    if (stantonysMatch) {
      const gradeNum = stantonysMatch[1].toLowerCase(); // e.g. "3", "9", "nur", "lkg", "ukg"
      const sectionTag = (stantonysMatch[2] || '').toLowerCase(); // e.g. "m", "ipl", "ths", "s"

      (classesList as any[]).forEach(c => {
        const cName = (c.name || '').toLowerCase().trim();
        const cId = String(c.id || '').toLowerCase().trim();
        if (
          (gradeNum === 'nur' || gradeNum === 'nursery') ? (cName.includes('nur') || cId.includes('nur')) :
          (gradeNum === 'lkg') ? (cName.includes('lkg') || cId.includes('lkg')) :
          (gradeNum === 'ukg') ? (cName.includes('ukg') || cId.includes('ukg')) :
          (
            cName.includes(`class ${gradeNum}`) ||
            cName.includes(`${gradeNum} class`) ||
            cName.includes(`${gradeNum}th`) ||
            cName.includes(`${gradeNum}rd`) ||
            cName.includes(`${gradeNum}nd`) ||
            cName.includes(`${gradeNum}st`) ||
            cName === gradeNum ||
            cId.startsWith(`${gradeNum}_class`) ||
            cId.startsWith(`${gradeNum}class`) ||
            cId === `class_${gradeNum}`
          )
        ) {
          assignedClassIds.add(String(c.id || ''));
          assignedClassNames.add(cName);
        }
      });

      (batchesList as any[]).forEach(b => {
        const bName = (b.name || '').toLowerCase().trim();
        const bId = String(b.id || '');
        const bClassId = String(b.classId || '');

        let matchesTag = false;
        if (sectionTag === 'm') {
          matchesTag = bName.includes('m-batch') || bName.includes('-m') || bName.includes(' m') || bName.startsWith('m ') || bName === 'm' || bName.endsWith('m') || bName.includes('section m') || bName.includes('m section') || bName.includes('m-section');
        } else if (sectionTag === 'ipl') {
          matchesTag = bName.includes('ipl');
        } else if (sectionTag === 's' || sectionTag === 'ths') {
          matchesTag = bName.includes('s-batch') || bName.includes('-s') || bName.includes(' s') || bName.startsWith('s ') || bName === 's' || bName.endsWith('s') || bName.includes('section s') || bName.includes('s section') || bName.includes('s-section') || bName.includes('ths');
        }

        if (assignedClassIds.has(bClassId) && (matchesTag || !sectionTag)) {
          assignedBatchIds.add(bId);
          assignedBatchNames.add(bName);
        }
      });
    }

    // Match from timetables
    (timetablesList as any[]).forEach(tt => {
      const ttEmail = (tt.teacherEmail || '').toLowerCase().trim();
      const ttNameNorm = norm(tt.teacherName || tt.teacher || '');
      const ttTeacherId = String(tt.teacherId || '').toLowerCase().trim();

      if (
        (emailClean && ttEmail === emailClean) ||
        (ttTeacherId && matchIds.has(ttTeacherId)) ||
        (ttNameNorm && matchNormNames.has(ttNameNorm))
      ) {
        if (tt.classId) assignedClassIds.add(String(tt.classId));
        if (tt.batchId) assignedBatchIds.add(String(tt.batchId));
        if (tt.subject || tt.subjectName) assignedSubjects.add(String(tt.subject || tt.subjectName).toLowerCase().trim());
      }
    });

    // Match directly from batches list (where teacher is assigned as classTeacher or subject teacher)
    (batchesList as any[]).forEach(b => {
      if (!b) return;
      const bId = String(b.id || '');
      const bClassId = String(b.classId || '');
      const bName = (b.name || '').toLowerCase().trim();

      const bCTId = b.classTeacherId ? String(b.classTeacherId).toLowerCase().trim() : '';
      const bCT = b.classTeacher ? String(b.classTeacher).toLowerCase().trim() : '';
      const bCTN = b.classTeacherName ? String(b.classTeacherName).toLowerCase().trim() : '';
      const bCTEmail = b.classTeacherEmail ? String(b.classTeacherEmail).toLowerCase().trim() : '';
      const bTId = b.teacherId ? String(b.teacherId).toLowerCase().trim() : '';
      const bT = b.teacher ? String(b.teacher).toLowerCase().trim() : '';
      const bTN = b.teacherName ? String(b.teacherName).toLowerCase().trim() : '';
      const bTEmail = b.teacherEmail ? String(b.teacherEmail).toLowerCase().trim() : '';

      let isAssigned = false;

      if (bCTId && matchIds.has(bCTId)) isAssigned = true;
      if (bCTEmail && matchEmails.has(bCTEmail)) isAssigned = true;
      if (bCT && !genericWords.includes(norm(bCT)) && matchNormNames.has(norm(bCT))) isAssigned = true;
      if (bCTN && !genericWords.includes(norm(bCTN)) && matchNormNames.has(norm(bCTN))) isAssigned = true;

      if (bTId && matchIds.has(bTId)) isAssigned = true;
      if (bTEmail && matchEmails.has(bTEmail)) isAssigned = true;
      if (bT && !genericWords.includes(norm(bT)) && matchNormNames.has(norm(bT))) isAssigned = true;
      if (bTN && !genericWords.includes(norm(bTN)) && matchNormNames.has(norm(bTN))) isAssigned = true;

      if (isAssigned && bId) {
        assignedBatchIds.add(bId);
        assignedBatchNames.add(bName);
        if (bClassId) assignedClassIds.add(bClassId);
      }
    });

    // Populate class & batch metadata cross-references
    (classesList as any[]).forEach(c => {
      const cId = String(c.id || '');
      const cName = (c.name || '').toLowerCase().trim();
      if (assignedClassIds.has(cId)) {
        assignedClassNames.add(cName);
        if (Array.isArray(c.subjectIds)) {
          c.subjectIds.forEach((sId: any) => sId && assignedSubjects.add(String(sId).toLowerCase().trim()));
        }
      }
    });

    (batchesList as any[]).forEach(b => {
      const bId = String(b.id || '');
      const bName = (b.name || '').toLowerCase().trim();
      const bClassId = String(b.classId || '');

      if (assignedBatchIds.has(bId)) {
        assignedBatchNames.add(bName);
        if (bClassId) assignedClassIds.add(bClassId);
        if (Array.isArray(b.subjectIds)) {
          b.subjectIds.forEach((sId: any) => sId && assignedSubjects.add(String(sId).toLowerCase().trim()));
        }
      }
    });

  } catch (err) {
    console.error('[teacherFilter] Error resolving teacher assignments:', err);
  }

  return {
    assignedClassIds,
    assignedClassNames,
    assignedBatchIds,
    assignedBatchNames,
    assignedSubjects,
    isTeacher: true
  };
}

/**
 * Filter students list strictly to assigned classes & batches for a teacher.
 */
export function filterStudentsForTeacher(
  students: any[],
  assignments: TeacherAssignments
): any[] {
  if (!assignments.isTeacher) return students;

  // If teacher has no specific assignments resolved yet, fallback to empty array rather than showing all
  if (
    assignments.assignedClassIds.size === 0 &&
    assignments.assignedClassNames.size === 0 &&
    assignments.assignedBatchIds.size === 0 &&
    assignments.assignedBatchNames.size === 0
  ) {
    return [];
  }

  return students.filter(s => {
    const sClassId = String(s.classId || s.class || '');
    const sClassName = (s.className || s.class || '').toLowerCase().trim();
    const sBatchId = String(s.batchId || s.batch || '');
    const sBatchName = (s.batchName || s.batch || '').toLowerCase().trim();

    const matchesClassId = assignments.assignedClassIds.has(sClassId);
    const matchesClassName = assignments.assignedClassNames.has(sClassName) ||
      Array.from(assignments.assignedClassNames).some(cn => cn && (sClassName.includes(cn) || cn.includes(sClassName)));

    const matchesBatchId = assignments.assignedBatchIds.has(sBatchId);
    const matchesBatchName = assignments.assignedBatchNames.has(sBatchName) ||
      Array.from(assignments.assignedBatchNames).some(bn => bn && (sBatchName.includes(bn) || bn.includes(sBatchName)));

    if (assignments.assignedBatchIds.size > 0 || assignments.assignedBatchNames.size > 0) {
      return (matchesClassId || matchesClassName) && (matchesBatchId || matchesBatchName);
    }

    return matchesClassId || matchesClassName;
  });
}

/**
 * Filter classes list strictly to assigned classes for a teacher.
 */
export function filterClassesForTeacher(
  classes: any[],
  assignments: TeacherAssignments,
  batches?: any[]
): any[] {
  if (!assignments.isTeacher) return classes;

  if (assignments.assignedClassIds.size === 0 && assignments.assignedClassNames.size === 0) {
    return [];
  }

  const genericWords = ['class', 'classes', 'teacher', 'class teacher', 'staff', 'none', 'n/a', 'batch', 'batches', 'section'];

  const matchedClasses = classes.filter(c => {
    const cId = String(c.id || '');
    const cName = (c.name || '').toLowerCase().trim();

    return (
      assignments.assignedClassIds.has(cId) ||
      assignments.assignedClassNames.has(cName) ||
      Array.from(assignments.assignedClassNames).some(cn => {
        if (!cn || genericWords.includes(cn) || cn.length < 2) return false;
        return cName === cn || cName.startsWith(cn) || cn.startsWith(cName);
      })
    );
  });

  // If batches are provided and teacher has specific batch assignments, restrict classes to only those containing assigned batches
  if (batches && (assignments.assignedBatchIds.size > 0 || assignments.assignedBatchNames.size > 0)) {
    const validClassIds = new Set<string>();
    batches.forEach(b => {
      const bId = String(b.id || '');
      const bName = (b.name || '').toLowerCase().trim();
      if (assignments.assignedBatchIds.has(bId) || assignments.assignedBatchNames.has(bName)) {
        if (b.classId) validClassIds.add(String(b.classId));
      }
    });
    if (validClassIds.size > 0) {
      return matchedClasses.filter(c => validClassIds.has(String(c.id || '')));
    }
  }

  return matchedClasses;
}

/**
 * Filter batches list strictly to assigned batches/classes for a teacher.
 */
export function filterBatchesForTeacher(
  batches: any[],
  assignments: TeacherAssignments
): any[] {
  if (!assignments.isTeacher) return batches;

  if (
    assignments.assignedBatchIds.size === 0 &&
    assignments.assignedBatchNames.size === 0 &&
    assignments.assignedClassIds.size === 0
  ) {
    return [];
  }

  const hasSpecificBatches = assignments.assignedBatchIds.size > 0 || assignments.assignedBatchNames.size > 0;

  return batches.filter(b => {
    const bId = String(b.id || '');
    const bName = (b.name || '').toLowerCase().trim();
    const bClassId = String(b.classId || '');

    const genericWords = ['class', 'classes', 'teacher', 'class teacher', 'staff', 'none', 'n/a', 'batch', 'batches', 'section'];
    const matchesBatchId = assignments.assignedBatchIds.has(bId);
    const matchesBatchName = assignments.assignedBatchNames.has(bName) ||
      Array.from(assignments.assignedBatchNames).some(bn => {
        if (!bn || genericWords.includes(bn) || bn.length < 2) return false;
        return bName === bn || bName.startsWith(bn) || bn.startsWith(bName);
      });

    const matchesClass = assignments.assignedClassIds.has(bClassId);

    if (hasSpecificBatches) {
      if (assignments.assignedClassIds.size > 0) {
        return matchesClass && (matchesBatchId || matchesBatchName);
      }
      return matchesBatchId || matchesBatchName;
    }

    return matchesClass;
  });
}

/**
 * Resolves the single batch assigned as Class Teacher in Academics module (Batches tab).
 */
export function getClassTeacherBatchForTeacher(
  user: any,
  profile: any,
  batchesList: any[],
  classesList: any[] = []
): { batch: any | null; classItem: any | null } {
  if (!batchesList || batchesList.length === 0) {
    return { batch: null, classItem: null };
  }

  const emailClean = (user?.email || profile?.email || '').toLowerCase().trim();
  const nameClean = (user?.displayName || profile?.name || '').toLowerCase().trim();
  const uid = String(user?.uid || profile?.uid || profile?.id || '').toLowerCase().trim();
  const staffId = String((profile as any)?.staffId || (profile as any)?.customId || '').toLowerCase().trim();
  const classTeacherBatchId = String((profile as any)?.classTeacherBatchId || '').toLowerCase().trim();
  const batchId = String((profile as any)?.batchId || '').toLowerCase().trim();
  const profileBatchIds: string[] = Array.isArray((profile as any)?.batchIds) 
    ? (profile as any).batchIds.map((id: any) => String(id).toLowerCase().trim()) 
    : [];

  const norm = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const genericWords = ['class', 'classes', 'teacher', 'classteacher', 'staff', 'none', 'na', 'undefined', 'null', 'batch', 'section', 'notassigned', 'selectteacher'];

  const matchIds = new Set<string>();
  if (uid) matchIds.add(uid);
  if (profile?.id) matchIds.add(String(profile.id).toLowerCase().trim());
  if (profile?.uid) matchIds.add(String(profile.uid).toLowerCase().trim());
  if (staffId) matchIds.add(staffId);

  const matchEmails = new Set<string>();
  if (emailClean) matchEmails.add(emailClean);
  if (user?.email) matchEmails.add(user.email.toLowerCase().trim());
  if (profile?.email) matchEmails.add(profile.email.toLowerCase().trim());

  const matchNames = new Set<string>();
  if (nameClean) matchNames.add(nameClean);
  if (user?.displayName) matchNames.add(user.displayName.toLowerCase().trim());
  if (profile?.name) matchNames.add(profile.name.toLowerCase().trim());

  const matchBatchIds = new Set<string>();
  if (classTeacherBatchId) matchBatchIds.add(classTeacherBatchId);
  if (batchId && (profile?.role === 'teacher_class' || profile?.isTeacherPortal)) matchBatchIds.add(batchId);
  profileBatchIds.forEach((id: string) => matchBatchIds.add(id));

  // Check system teacher info if available
  const sysTeacher = getSystemTeacherProfile(emailClean) || (nameClean ? getSystemTeacherProfile(nameClean) : null);
  if (sysTeacher) {
    if (sysTeacher.name) matchNames.add(sysTeacher.name.toLowerCase().trim());
  }

  // Derive target class grade and target section/batch if known
  const targetClassGrade = extractGrade(profile?.className || profile?.class || sysTeacher?.class || '') ||
                           extractGrade(emailClean) ||
                           extractGrade(nameClean);

  const targetSection = extractSection(profile?.classTeacherBatchName || profile?.batchName || profile?.section || sysTeacher?.section || sysTeacher?.classTeacherBatchName || '') ||
                        extractSection(emailClean) ||
                        extractSection(nameClean);

  const targetBatchName = profile?.classTeacherBatchName || profile?.batchName || sysTeacher?.classTeacherBatchName || '';

  // Score every batch in batchesList
  let bestBatch: any = null;
  let highestScore = 0;

  for (const b of batchesList) {
    if (!b) continue;
    let score = 0;

    const bId = String(b.id || '').toLowerCase().trim();
    const bName = (b.name || '').toLowerCase().trim();
    const bClassName = (b.className || '').toLowerCase().trim();
    const bClassId = String(b.classId || '').toLowerCase().trim();
    const bCTId = String(b.classTeacherId || '').toLowerCase().trim();
    const bCTEmail = String(b.classTeacherEmail || '').toLowerCase().trim();
    const bCTName = norm(b.classTeacherName || b.classTeacher || '');

    // 1. Direct ID match from profile.classTeacherBatchId or batchIds
    if (bId && matchBatchIds.has(bId)) {
      score += 1000;
    }

    // 2. Direct teacher UID / staffId on batch.classTeacherId
    if (bCTId && matchIds.has(bCTId)) {
      score += 800;
    }

    // 3. Direct teacher Email on batch.classTeacherEmail
    if (bCTEmail && matchEmails.has(bCTEmail)) {
      score += 800;
    }

    // 4. Direct teacher Name on batch.classTeacher / classTeacherName (when not generic)
    if (bCTName && !genericWords.includes(bCTName)) {
      for (const name of matchNames) {
        if (name && !genericWords.includes(norm(name)) && norm(name) === bCTName) {
          score += 600;
          break;
        }
      }
    }

    // 5. Check Class Grade Match
    const parentClass = classesList.find(c => String(c.id).toLowerCase().trim() === bClassId);
    const fullClassText = `${bClassName} ${parentClass?.name || ''} ${bClassId}`.toLowerCase();
    const batchClassGrade = extractGrade(fullClassText) || extractGrade(bName) || extractGrade(bId);

    if (targetClassGrade) {
      if (batchClassGrade === targetClassGrade) {
        score += 400;
      } else if (batchClassGrade && batchClassGrade !== targetClassGrade) {
        // Heavy penalty: batch belongs to a different class (e.g. Class 2 when teacher is Class 3)
        score -= 5000;
      }
    }

    // 6. Check Section Match
    const batchSection = extractSection(bName) || extractSection(bId);
    if (targetSection) {
      if (batchSection === targetSection) {
        score += 200;
      } else if (batchSection && batchSection !== targetSection) {
        // Heavy penalty: batch belongs to a different section (e.g. IPL when teacher is M-Batch)
        score -= 3000;
      }
    }

    if (targetBatchName) {
      const normTargetBatch = norm(targetBatchName);
      if (norm(bName).includes(normTargetBatch) || normTargetBatch.includes(norm(bName))) {
        score += 150;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestBatch = b;
    }
  }

  const matchedBatch = highestScore > 0 ? bestBatch : null;

  // Resolve corresponding class
  let classItem: any = null;
  if (matchedBatch) {
    const bClassId = String(matchedBatch.classId || '').toLowerCase().trim();
    const bClassName = (matchedBatch.className || '').toLowerCase().trim();

    classItem = (classesList as any[]).find(c => {
      const cId = String(c.id || '').toLowerCase().trim();
      const cName = (c.name || '').toLowerCase().trim();
      return (bClassId && cId === bClassId) || (bClassName && cName === bClassName);
    });

    if (!classItem && matchedBatch.classId) {
      classItem = {
        id: matchedBatch.classId,
        name: matchedBatch.className || matchedBatch.classId
      };
    }
  }

  return { batch: matchedBatch || null, classItem: classItem || null };
}

/**
 * Filter subjects list strictly to assigned subjects for a teacher.
 */
export function filterSubjectsForTeacher(
  subjects: any[],
  assignments: TeacherAssignments
): any[] {
  if (!assignments.isTeacher) return subjects;
  if (assignments.assignedSubjects.size === 0) return [];

  return subjects.filter(s => {
    const sId = String(s.id || '').toLowerCase().trim();
    const sName = (s.name || s.subjectName || '').toLowerCase().trim();
    const sCode = (s.code || '').toLowerCase().trim();

    return (
      (sId && assignments.assignedSubjects.has(sId)) ||
      (sName && assignments.assignedSubjects.has(sName)) ||
      (sCode && assignments.assignedSubjects.has(sCode)) ||
      Array.from(assignments.assignedSubjects).some(as => 
        as && (sName.includes(as) || as.includes(sName) || sCode === as || sId === as)
      )
    );
  });
}

/**
 * Resolves the batch for which a given staff member/teacher is the assigned Class Teacher.
 * Provides robust multi-attribute matching (ID, email, authentic name, assigned batch ID)
 * and guards against collisions with other teachers.
 */
export function getAssignedClassTeacherBatch(member: any, batches: any[]): any {
  if (!member || !batches || !batches.length) return null;

  const mUid = String(member.uid || '').toLowerCase().trim();
  const mId = String(member.id || '').toLowerCase().trim();
  const mCanon = String(member.canonicalId || '').toLowerCase().trim();
  const mCustom = String(member.customId || member.staffId || '').toLowerCase().trim();
  const mEmail = String(member.email || '').toLowerCase().trim();
  const mName = String(member.name || member.displayName || member.fullName || '').toLowerCase().trim();
  const memberAssignedBatchId = String(member.classTeacherBatchId || member.batchId || '').toLowerCase().trim();

  const idSet = new Set<string>();
  if (mUid) idSet.add(mUid);
  if (mId) idSet.add(mId);
  if (mCanon) idSet.add(mCanon);
  if (mCustom) idSet.add(mCustom);
  if (member.allIds && typeof member.allIds.forEach === 'function') {
    member.allIds.forEach((i: any) => i && idSet.add(String(i).toLowerCase().trim()));
  }

  const genericWords = ['', 'not assigned', 'none', 'n/a', 'undefined', 'null', 'select teacher', 'staff member'];

  // 1. Direct classTeacherId match
  for (const b of batches) {
    if (!b) continue;
    const ctId = String(b.classTeacherId || '').toLowerCase().trim();
    if (ctId && !genericWords.includes(ctId) && idSet.has(ctId)) {
      return b;
    }
  }

  // 2. Direct classTeacherEmail match
  if (mEmail && !genericWords.includes(mEmail)) {
    for (const b of batches) {
      if (!b) continue;
      const ctEmail = String(b.classTeacherEmail || '').toLowerCase().trim();
      if (ctEmail && ctEmail === mEmail) {
        return b;
      }
    }
  }

  // 3. Authentic classTeacherName match
  if (mName && !genericWords.includes(mName) && !isSyntheticOrMailName(mName)) {
    for (const b of batches) {
      if (!b) continue;
      const ctName = String(b.classTeacherName || b.classTeacher || '').toLowerCase().trim();
      if (ctName && !genericWords.includes(ctName) && !isSyntheticOrMailName(ctName)) {
        if (ctName === mName || ctName.replace(/\s+/g, '') === mName.replace(/\s+/g, '')) {
          return b;
        }
      }
    }
  }

  // 4. Batch ID assigned on member record (if the batch does not explicitly belong to another teacher)
  if (memberAssignedBatchId && !genericWords.includes(memberAssignedBatchId)) {
    const candidateBatch = batches.find(b => b && String(b.id || '').toLowerCase().trim() === memberAssignedBatchId);
    if (candidateBatch) {
      const bCtId = String(candidateBatch.classTeacherId || '').toLowerCase().trim();
      const bCtEmail = String(candidateBatch.classTeacherEmail || '').toLowerCase().trim();
      const isClaimedByOtherId = bCtId && !genericWords.includes(bCtId) && !idSet.has(bCtId);
      const isClaimedByOtherEmail = bCtEmail && !genericWords.includes(bCtEmail) && mEmail && bCtEmail !== mEmail;
      if (!isClaimedByOtherId && !isClaimedByOtherEmail) {
        return candidateBatch;
      }
    }
  }

  return null;
}
