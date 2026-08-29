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
