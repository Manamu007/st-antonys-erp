import { getDbAdmin } from '../../firebaseAdmin.js';
import { StudentMatchResult } from '../../../modules/studentHealth/types/index.js';

// Simple Levenshtein or string similarity helper
function getStringSimilarity(s1: string, s2: string): number {
  const clean1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (clean1 === clean2) return 1.0;
  if (!clean1 || !clean2) return 0.0;

  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    return Math.min(clean1.length, clean2.length) / Math.max(clean1.length, clean2.length) * 0.8;
  }

  // standard edit distance
  const track = Array(clean2.length + 1).fill(null).map(() =>
    Array(clean1.length + 1).fill(null));
  for (let i = 0; i <= clean1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= clean2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= clean2.length; j += 1) {
    for (let i = 1; i <= clean1.length; i += 1) {
      const indicator = clean1[i - 1] === clean2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + 0  ? (indicator === 0 ? track[j-1][i-1] : track[j-1][i-1]+1) : track[j-1][i-1] + indicator // substitution
      );
    }
  }
  const distance = track[clean2.length][clean1.length];
  const maxLen = Math.max(clean1.length, clean2.length);
  return (maxLen - distance) / maxLen;
}

export async function findStudentMatches(
  schoolId: string,
  criteria: {
    studentName?: string;
    className?: string;
    batchName?: string;
    admissionNumber?: string;
    patientAddress?: string;
  }
): Promise<StudentMatchResult[]> {
  const db = getDbAdmin();
  const results: StudentMatchResult[] = [];

  try {
    const [studentsSnap, classesSnap, batchesSnap] = await Promise.all([
      db.collection('students').where('status', '==', 'active').get(),
      db.collection('classes').get().catch(() => ({ docs: [] })),
      db.collection('batches').get().catch(() => ({ docs: [] }))
    ]);

    const classMap = new Map<string, string>();
    classesSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data?.name) classMap.set(doc.id, data.name);
    });

    const batchMap = new Map<string, string>();
    batchesSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data?.name) batchMap.set(doc.id, data.name);
    });

    const allStudents = studentsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as any));

    const queryLower = (criteria.studentName || '').toLowerCase().trim();
    const cleanQueryDigits = queryLower.replace(/\D/g, '');

    for (const s of allStudents) {
      let confidence = 0.0;
      const reasons: string[] = [];

      const sStudentName = (s.name || '').trim().toLowerCase();
      const sFatherName = (s.fatherName || s.parentName || '').trim().toLowerCase();
      const sPhone = (s.parentPhone || s.phone || s.contact || s.fatherPhone || s.fatherMobile || s.whatsappNumber || '').toString().trim();
      const cleanPhoneDigits = sPhone.replace(/\D/g, '');

      // 1. Check admission number match (Golden signal)
      if (criteria.admissionNumber && s.admissionNumber) {
        const cNo = criteria.admissionNumber.trim().replace(/\D/g, '');
        const sNo = s.admissionNumber.trim().replace(/\D/g, '');
        if (cNo && sNo && cNo === sNo) {
          confidence = Math.max(confidence, 0.95);
          reasons.push(`Admission number match (${s.admissionNumber})`);
        }
      }

      // 2. Check phone / mobile match (Strong signal)
      if (cleanQueryDigits && cleanQueryDigits.length >= 4 && cleanPhoneDigits) {
        if (cleanPhoneDigits.includes(cleanQueryDigits) || cleanQueryDigits.includes(cleanPhoneDigits)) {
          confidence = Math.max(confidence, 0.95);
          reasons.push(`Mobile match (${sPhone})`);
        }
      }

      // 3. Name checking (Sub-signal)
      if (queryLower && sStudentName) {
        const similarity = getStringSimilarity(queryLower, sStudentName);
        if (similarity > 0.6 || sStudentName.includes(queryLower)) {
          const score = Math.max(similarity, sStudentName.includes(queryLower) ? 0.8 : 0) * 0.9;
          confidence = Math.max(confidence, score);
          reasons.push(`Name similarity match (${s.name})`);
        }
      }

      // 4. Father name checking (Sub-signal)
      if (queryLower && sFatherName) {
        const similarity = getStringSimilarity(queryLower, sFatherName);
        if (similarity > 0.6 || sFatherName.includes(queryLower)) {
          const score = Math.max(similarity, sFatherName.includes(queryLower) ? 0.8 : 0) * 0.85;
          confidence = Math.max(confidence, score);
          reasons.push(`Father name match (${s.fatherName || s.parentName})`);
        }
      }

      // 5. Patient Address checking (Treat address text as potential class & batch keys)
      if (criteria.patientAddress && (s.className || s.batchName)) {
        const addressLower = criteria.patientAddress.toLowerCase();
        const sClassLower = (s.className || '').toLowerCase().trim();
        const sBatchLower = (s.batchName || '').toLowerCase().trim();

        if (sClassLower && addressLower.includes(sClassLower)) {
          confidence = Math.min(confidence + 0.25, 1.0);
          reasons.push(`Invoice address matches class (${s.className})`);
        }
        if (sBatchLower && addressLower.includes(sBatchLower)) {
          confidence = Math.min(confidence + 0.15, 1.0);
          reasons.push(`Invoice address matches batch (${s.batchName})`);
        }

        // check standard digit values for Roman numerals or standard forms
        const cleanClassDigits = sClassLower.replace(/\D/g, '');
        if (cleanClassDigits && addressLower.includes(`class ${cleanClassDigits}`)) {
          confidence = Math.min(confidence + 0.2, 1.0);
          reasons.push(`Invoice address indicates grade number (${cleanClassDigits})`);
        }
      }

      // 6. Class and Batch match boosting from criteria direct
      if (reasons.length > 0) {
        if (criteria.className && s.className) {
          if (criteria.className.toLowerCase().trim() === s.className.toLowerCase().trim()) {
            confidence = Math.min(confidence + 0.1, 1.0);
            reasons.push("Class matches direct");
          }
        }
        if (criteria.batchName && s.batchName) {
          if (criteria.batchName.toLowerCase().trim() === s.batchName.toLowerCase().trim()) {
            confidence = Math.min(confidence + 0.05, 1.0);
            reasons.push("Batch matches direct");
          }
        }
      }

      // Normalize confidence between 0 and 1
      confidence = Math.min(Math.max(confidence, 0), 1);

      if (confidence > 0.35) {
        const studentType = (s.feeType?.toLowerCase() === 'hostel' || (s.hostelDropDate && s.hostelDropDate !== ""))
          ? "HOSTELER"
          : "DAY_SCHOLAR";

        const resolvedClassName = s.className || classMap.get(s.classId) || s.class || '-';
        const resolvedBatchName = s.batchName || batchMap.get(s.batchId) || s.batch || '-';

        results.push({
          studentId: s.id,
          studentName: s.name || '',
          className: resolvedClassName,
          batchName: resolvedBatchName,
          admissionNumber: s.admissionNumber || undefined,
          studentType,
          confidence,
          matchReasons: reasons,
          fatherName: s.fatherName || s.parentName || 'N/A',
          phone: sPhone || 'N/A'
        } as any);
      }
    }

    // Sort descending by confidence
    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 10);

  } catch (err) {
    console.error("[studentHealthMatchingService] Error matching student:", err);
    return [];
  }
}
