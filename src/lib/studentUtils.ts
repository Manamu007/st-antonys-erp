/**
 * Generates a stable unique ID for a student to easily identify them across the app.
 * If the student already has a uniqueStudentId, it is returned.
 * Otherwise, a deterministic ID is generated based on the student's unique Firestore ID or UUID.
 */
export function generateUniqueStudentId(student: any): string {
  if (!student) return '';
  if (student.uniqueStudentId) return student.uniqueStudentId;
  
  const idStr = student.id || student.uid || '';
  if (!idStr) {
    // Fallback if no ID yet, but return a placeholder that doesn't conflict
    return 'STU-TEMP-' + Math.floor(1000 + Math.random() * 9000);
  }

  // Generate a clean deterministic 6-digit number based on hashing of the student's ID string
  let hashVal = 0;
  for (let i = 0; i < idStr.length; i++) {
    hashVal = (hashVal << 5) - hashVal + idStr.charCodeAt(i);
    hashVal |= 0; // Convert to 32bit integer
  }
  const cleanNum = Math.abs(hashVal) % 1000000;
  return `STU-${cleanNum.toString().padStart(6, '0')}`;
}

/**
 * Checks if a student is designated as Non-Attending through any of the known fields/statuses.
 */
export function isNonAttendingStudent(s: any): boolean {
  if (!s) return false;
  if (s.isAttending === false || s.isAttending === 'false' || s.isAttending === 0) return true;
  if (s.nonAttending === true || s.nonAttending === 'true' || s.isNonAttending === true || s.isNonAttending === 'true') return true;
  if (s.status === 'Non-Attending' || s.status === 'non_attending' || s.status === 'non-attending') return true;

  const statusClean = String(s.status || '').toLowerCase().trim().replace(/[-_ ]/g, '');
  if (statusClean === 'nonattending' || statusClean === 'notattending') return true;

  const attStatusClean = String(s.attendingStatus || '').toLowerCase().trim().replace(/[-_ ]/g, '');
  if (attStatusClean === 'nonattending' || attStatusClean === 'notattending') return true;

  const attRecordClean = String(s.attendanceStatus || '').toLowerCase().trim().replace(/[-_ ]/g, '');
  if (attRecordClean === 'nonattending' || attRecordClean === 'notattending') return true;

  return false;
}

/**
 * Filter students strictly for active attending status and optional class/batch criteria:
 * const activeStudents = students.filter(s => 
 *   s.class === selectedClass && 
 *   s.batch === selectedBatch && 
 *   s.status !== 'Non-Attending' && 
 *   s.isAttending !== false &&
 *   !s.nonAttending
 * );
 */
export function filterActiveStudents(students: any[], selectedClass?: string, selectedBatch?: string): any[] {
  if (!Array.isArray(students)) return [];
  return students.filter(s => {
    // 1. Check Non-Attending status
    if (
      s.status === 'Non-Attending' ||
      s.isAttending === false ||
      s.isAttending === 'false' ||
      s.isAttending === 0 ||
      s.nonAttending === true ||
      s.nonAttending === 'true' ||
      isNonAttendingStudent(s)
    ) {
      return false;
    }

    // 2. Filter by class if provided
    if (selectedClass && selectedClass !== 'all') {
      const matchClass = s.class === selectedClass || s.className === selectedClass || s.classId === selectedClass;
      if (!matchClass) return false;
    }

    // 3. Filter by batch if provided
    if (selectedBatch && selectedBatch !== 'all') {
      const matchBatch = s.batch === selectedBatch || s.batchName === selectedBatch || s.batchId === selectedBatch;
      if (!matchBatch) return false;
    }

    return true;
  });
}
