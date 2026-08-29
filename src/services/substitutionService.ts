import { TimetableDoc, PeriodSlot } from '../types';

export interface SubstituteCandidate {
  teacherId: string;
  name: string;
  loadToday: number;
  maxLoad: number;
  dealsWithBatch: boolean; // Does this teacher normally teach this class?
}

export const findBestSubstitute = (
  slotLabel: string,
  batchId: string,
  teachers: any[],
  allTimetables: TimetableDoc[],
  day: string,
  existingSubstitutions: any[]
): string | null => {
  const candidates: SubstituteCandidate[] = teachers
    .filter(t => t.role === 'teacher') // Only teachers can substitute
    .map(teacher => {
      // 1. Calculate current load (regular periods + already assigned substitutions)
      const regularPeriodsToday = allTimetables
        .filter(tt => tt.day === day)
        .flatMap(tt => tt.periods.filter(p => p.teacherId === teacher.uid)).length;
      
      const substitutionsToday = existingSubstitutions
        .filter(s => s.substituteTeacherId === teacher.uid).length;

      const currentLoad = regularPeriodsToday + substitutionsToday;

      // 2. Check if free during this specific slot
      const isFreeSlot = !allTimetables
        .filter(tt => tt.day === day)
        .some(tt => tt.periods.some(p => p.label === slotLabel && p.teacherId === teacher.uid));
      
      const isAlreadySubbingSlot = existingSubstitutions.some(
        s => s.periodLabel === slotLabel && s.substituteTeacherId === teacher.uid
      );

      if (!isFreeSlot || isAlreadySubbingSlot) return null;

      // 3. Check if they deal with this batch normally
      const dealsWithBatch = allTimetables.some(tt => 
        tt.batchId === batchId && tt.periods.some(p => p.teacherId === teacher.uid)
      );

      return {
        teacherId: teacher.uid,
        name: teacher.name,
        loadToday: currentLoad,
        maxLoad: teacher.maxPeriodsPerDay || 6,
        dealsWithBatch
      };
    })
    .filter((c): c is SubstituteCandidate => c !== null && c.loadToday < c.maxLoad);

  if (candidates.length === 0) return null;

  // Sorting Strategy:
  // 1. Those who deal with this batch first (Priority 1)
  // 2. Those with the lowest current load (Priority 2)
  candidates.sort((a, b) => {
    if (a.dealsWithBatch && !b.dealsWithBatch) return -1;
    if (!a.dealsWithBatch && b.dealsWithBatch) return 1;
    return a.loadToday - b.loadToday;
  });

  return candidates[0].teacherId;
};
