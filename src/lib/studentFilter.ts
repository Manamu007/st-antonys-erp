import { isNonAttendingStudent, filterActiveStudents } from './studentUtils';

export { isNonAttendingStudent, filterActiveStudents };

/**
 * Strict active student filter:
 * const activeStudents = students.filter(s => 
 *   s.class === selectedClass && 
 *   s.batch === selectedBatch && 
 *   s.status !== 'Non-Attending' && 
 *   s.isAttending !== false &&
 *   !s.nonAttending
 * );
 */
export const getActiveStudents = (students: any[], selectedClass?: string, selectedBatch?: string) => {
  return filterActiveStudents(students, selectedClass, selectedBatch);
};

export default filterActiveStudents;
