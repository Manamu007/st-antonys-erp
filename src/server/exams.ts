import express from 'express';
import { getDbAdmin } from './firebaseAdmin.js';
import { sendMessage } from './whatsapp.js';
import { normalizeIndianPhone, extractParentPhone } from './whatsappUtils.js';
import { GoogleGenAI, Type } from "@google/genai";

const router = express.Router();

// Initialize Gemini on server
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * Helper to check if a phone number is a valid E.164 Indian mobile number (+91 followed by 10 digits)
 */
function isValidIndianMobile(phone: string): boolean {
  return /^\+91[6789]\d{9}$/.test(phone);
}

/**
 * Helper to check if an entity or student represents Class 10
 */
export function isClass10Entity(
  student?: any, 
  classId?: string, 
  section?: string, 
  classesMap?: Map<string, any>, 
  batchesMap?: Map<string, any>
): boolean {
  const checkStr = (val?: any): boolean => {
    if (!val) return false;
    const str = String(val).toLowerCase().trim();
    if (!str) return false;
    if (str === '10' || str === 'x' || str === 'tenth' || str === 'ssc' || str === 'class_10' || str === 'class10' || str === 'class 10' || str === '10th') return true;
    if (str.includes('class 10') || str.includes('class-10') || str.includes('class_10') || str.includes('10th') || str.includes('10-') || str.includes('10 ') || str.includes('10_') || str.includes('10a') || str.includes('10b') || str.includes('10c') || str.includes('10d') || str.includes('10th em') || str.includes('10th tm') || str.includes('10-em') || str.includes('10-tm') || str.includes('10th-em') || str.includes('10th-tm')) return true;
    return false;
  };

  if (checkStr(student?.classId) || checkStr(student?.className) || checkStr(student?.class) ||
      checkStr(student?.batchId) || checkStr(student?.batchName) || checkStr(student?.batch) || checkStr(student?.section) ||
      checkStr(classId) || checkStr(section)) {
    return true;
  }

  if (student?.classId && classesMap && classesMap.has(String(student.classId))) {
    const cObj = classesMap.get(String(student.classId));
    if (checkStr(cObj?.name) || checkStr(cObj?.code) || checkStr(cObj?.displayName)) return true;
  }
  if (classId && classesMap && classesMap.has(String(classId))) {
    const cObj = classesMap.get(String(classId));
    if (checkStr(cObj?.name) || checkStr(cObj?.code) || checkStr(cObj?.displayName)) return true;
  }
  if (student?.batchId && batchesMap && batchesMap.has(String(student.batchId))) {
    const bObj = batchesMap.get(String(student.batchId));
    if (checkStr(bObj?.name) || checkStr(bObj?.code) || checkStr(bObj?.displayName)) return true;
  }
  if (section && batchesMap && batchesMap.has(String(section))) {
    const bObj = batchesMap.get(String(section));
    if (checkStr(bObj?.name) || checkStr(bObj?.code) || checkStr(bObj?.displayName)) return true;
  }

  return false;
}

/**
 * Determine if an entity (student, class, or batch) belongs to Secondary Classes 6 to 9
 * (Class 6, Class 7, Class 8, Class 9).
 * For these classes:
 * - There is NO HW in subject marks entry.
 * - Internal slip tests are: ST-1 (Max 10), ST-2 (Max 5).
 * - FA Written is Max 35.
 * - Total per subject is 50 (10 + 5 + 35 = 50).
 */
export function isClass6to9Entity(
  student?: any, 
  classId?: string, 
  section?: string, 
  classesMap?: Map<string, any>, 
  batchesMap?: Map<string, any>
): boolean {
  // If it is Class 10, it's not Class 6 to 9
  if (isClass10Entity(student, classId, section, classesMap, batchesMap)) {
    return false;
  }

  const checkStr = (val?: any): boolean => {
    if (!val) return false;
    const str = String(val).toLowerCase().trim();
    if (!str) return false;

    // Check Roman numerals: VI, VII, VIII, IX (standing alone or bounded)
    if (/\b(vi|vii|viii|ix)\b/i.test(str)) return true;

    // Check numbers 6, 7, 8, 9
    if (/\b(6|7|8|9)\b/.test(str)) return true;
    if (/\b(6th|7th|8th|9th)\b/.test(str)) return true;

    if (
      str.includes('class 6') || str.includes('class-6') || str.includes('class_6') || str.includes('class6') ||
      str.includes('class 7') || str.includes('class-7') || str.includes('class_7') || str.includes('class7') ||
      str.includes('class 8') || str.includes('class-8') || str.includes('class_8') || str.includes('class8') ||
      str.includes('class 9') || str.includes('class-9') || str.includes('class_9') || str.includes('class9')
    ) return true;

    if (
      str.includes('6th') || str.includes('7th') || str.includes('8th') || str.includes('9th') ||
      str.includes('six') || str.includes('seven') || str.includes('eight') || str.includes('nine')
    ) return true;

    return false;
  };

  if (checkStr(student?.classId) || checkStr(student?.className) || checkStr(student?.class) || checkStr(student?.grade) ||
      checkStr(student?.batchId) || checkStr(student?.batchName) || checkStr(student?.batch) || checkStr(student?.section) ||
      checkStr(classId) || checkStr(section)) {
    return true;
  }

  if (student?.classId && classesMap && classesMap.has(String(student.classId))) {
    const cObj = classesMap.get(String(student.classId));
    if (checkStr(cObj?.name) || checkStr(cObj?.code) || checkStr(cObj?.displayName)) return true;
  }
  if (classId && classesMap && classesMap.has(String(classId))) {
    const cObj = classesMap.get(String(classId));
    if (checkStr(cObj?.name) || checkStr(cObj?.code) || checkStr(cObj?.displayName)) return true;
  }
  if (student?.batchId && batchesMap && batchesMap.has(String(student.batchId))) {
    const bObj = batchesMap.get(String(student.batchId));
    if (checkStr(bObj?.name) || checkStr(bObj?.code) || checkStr(bObj?.displayName)) return true;
  }
  if (section && batchesMap && batchesMap.has(String(section))) {
    const bObj = batchesMap.get(String(section));
    if (checkStr(bObj?.name) || checkStr(bObj?.code) || checkStr(bObj?.displayName)) return true;
  }

  return false;
}

/**
 * Standard Andhra Pradesh / Telangana school subject ordering rank:
 * 1. Telugu (1st Language)
 * 2. Hindi (2nd Language)
 * 3. English (3rd Language)
 * 4. Mathematics
 * 5. Physics / Physical Science
 * 6. Biology / Biological Science / Natural Science
 * 7. Social Studies
 * 8+. Other subjects
 */
export function getStandardSubjectRank(subjectName: string): number {
  const raw = (subjectName || '').trim();
  const lower = raw.toLowerCase();
  const clean = lower.replace(/[^a-z0-9]/g, '');

  // 1. TELUGU
  if (clean.includes('telugu') || clean === 'tel' || lower.includes('1st lang') || lower.includes('first lang')) {
    return 1;
  }

  // 2. HINDI
  if (clean.includes('hindi') || clean.includes('hindhi') || clean === 'hin' || lower.includes('2nd lang') || lower.includes('second lang')) {
    return 2;
  }

  // 3. ENGLISH
  if (clean.includes('english') || clean === 'eng' || clean.includes('engreading') || lower.includes('3rd lang') || lower.includes('third lang')) {
    return 3;
  }

  // 4. MATHEMATICS / MATHS / MATH
  if (clean.includes('math') || clean.includes('mathematics') || clean.includes('maths') || clean === 'numbers' || clean === 'tables' || clean.includes('mathbasics')) {
    return 4;
  }

  // 5. PHYSICS / Physical Science / PS
  if (clean.includes('physics') || clean.includes('physicalscience') || clean === 'ps' || clean === 'phy' || clean === 'phys') {
    return 5;
  }
  if ((clean.includes('science') || clean === 'sci' || clean.includes('genscience') || clean.includes('generalscience')) && 
      !clean.includes('bio') && !clean.includes('computer') && !clean.includes('social')) {
    return 5;
  }

  // 6. BIOLOGY / Biological Science / Natural Science / NS / BS
  if (clean.includes('bio') || clean.includes('biology') || clean.includes('biological') || clean.includes('naturalscience') || clean === 'ns' || clean === 'bs') {
    return 6;
  }

  // 7. SOCIAL / Social Studies / Social Science / SST / EVS
  if (clean.includes('social') || clean.includes('sst') || clean.includes('soc') || clean.includes('socialstudies') || clean.includes('socialscience') || clean.includes('evs') || clean.includes('environment')) {
    return 7;
  }

  // 8. COMPUTERS / IT
  if (clean.includes('computer') || clean.includes('computers') || clean === 'cs' || clean.includes('it') || clean.includes('infotech') || clean.includes('informationtechnology')) {
    return 8;
  }

  // 9+. Other auxiliary subjects
  if (clean.includes('gk') || clean.includes('generalknowledge')) return 9;
  if (clean.includes('rhymes')) return 10;
  if (clean.includes('sanskrit')) return 11;
  if (clean.includes('moral') || clean.includes('value')) return 12;
  if (clean.includes('drawing') || clean.includes('art') || clean.includes('craft')) return 13;

  return 100;
}

export function compareSubjectsStandard(a: any, b: any): number {
  const nameA = typeof a === 'string' ? a : (a?.name || a?.subjectName || '');
  const nameB = typeof b === 'string' ? b : (b?.name || b?.subjectName || '');
  const rankA = getStandardSubjectRank(nameA);
  const rankB = getStandardSubjectRank(nameB);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return nameA.localeCompare(nameB);
}

/**
 * Helper to get performance category from percentage
 * 90-100%: 🌟 Outstanding
 * 80-89%: ⭐ Excellent
 * 70-79%: Very Good
 * 60-69%: Good
 * 50-59%: Average
 * 40-49%: Needs Improvement
 * Below 40%: Poor / Fail
 */
export function getPerformanceCategory(percentage: number): string {
  if (percentage >= 90) return '🌟 Outstanding';
  if (percentage >= 80) return '⭐ Excellent';
  if (percentage >= 70) return 'Very Good';
  if (percentage >= 60) return 'Good';
  if (percentage >= 50) return 'Average';
  if (percentage >= 40) return 'Needs Improvement';
  return 'Poor / Fail';
}

/**
 * Standardized exam marks helper to calculate totals consistently
 */
export function calculateExamResultTotals(
  marksRecords: any[], 
  isFA: boolean, 
  subjects: any[], 
  isClass10: boolean = false,
  isClass6to9: boolean = false
) {
  const subjectMarks: { name: string; total: number; max: number; entered: boolean; breakdown: string; faWritten?: number }[] = [];
  let grandTotal = 0;
  let maxPossible = 0;
  let isPass = true;
  let enteredCount = 0;

  // Ensure subjects are ordered: Telugu, Hindi, English, Mathematics, Physics, Biology, Social Studies
  const sortedSubjects = [...(subjects || [])].sort(compareSubjectsStandard);

  for (const sub of sortedSubjects) {
    const mark = marksRecords.find(m => m.subjectId === sub.id);
    if (!mark) {
      subjectMarks.push({
        name: sub.name,
        total: 0,
        max: isFA ? 50 : 100,
        entered: false,
        breakdown: 'Not entered'
      });
      continue;
    }

    enteredCount++;
    const st1 = Number(mark.st1) || 0;
    const st2 = Number(mark.st2) || 0;
    const hw = Number(mark.hw) || 0;
    const faWritten = Number(mark.faWritten) || 0;
    const saWritten = Number(mark.saWritten) || 0;

    let total = 0;
    let breakdown = '';
    
    if (isFA) {
      if (isClass10) {
        // Class 10 (all batches) does not conduct internal slip tests for FA exams.
        // It directly uses the FA Written Test marks (Max 50) without mentioning "(FA Written)".
        total = Math.round(faWritten);
        breakdown = '';
      } else if (isClass6to9) {
        // For Class 6 to 9 in FA: no HW in subject marks entry, just ST-1 (Max 10) + ST-2 (Max 5) + FA Written (Max 35) = 50
        total = Math.round(st1 + st2 + faWritten);
        breakdown = `ST1(${st1}) + ST2(${st2}) + FA(${faWritten})`;
      } else {
        total = Math.round(st1 + st2 + hw + faWritten);
        breakdown = `ST1(${st1}) + ST2(${st2}) + HW(${hw}) + FA(${faWritten})`;
      }
    } else {
      if (isClass10) {
        total = Math.round(saWritten);
        breakdown = '';
      } else if (isClass6to9) {
        // For Class 6 to 9 in SA: no HW
        total = Math.round(st1 + st2 + saWritten);
        breakdown = (st1 > 0 || st2 > 0) ? `ST1(${st1}) + ST2(${st2}) + SA(${saWritten})` : `SA(${saWritten})`;
      } else {
        // Consistently use: st1 + st2 + hw + saWritten as required by Part 6 Rule 3
        total = Math.round(st1 + st2 + hw + saWritten);
        breakdown = `ST1(${st1}) + ST2(${st2}) + HW(${hw}) + SA(${saWritten})`;
      }
    }

    const maxMarks = isFA ? 50 : 100;
    if (total < maxMarks * 0.35) {
      isPass = false;
    }

    grandTotal += total;
    maxPossible += maxMarks;

    subjectMarks.push({
      name: sub.name,
      total,
      max: maxMarks,
      entered: true,
      breakdown,
      faWritten
    });
  }

  const percentage = maxPossible > 0 ? Math.round((grandTotal / maxPossible) * 100) : 0;
  const statusLabel = getPerformanceCategory(percentage);

  return {
    subjectMarks,
    grandTotal,
    maxPossible,
    percentage,
    isPass,
    statusLabel,
    enteredCount,
    marksMissing: enteredCount === 0 || enteredCount < sortedSubjects.length
  };
}

/**
 * GET /api/exams/marks-whatsapp-status
 * Returns map of studentIds whose marks have already been sent to WhatsApp for an exam
 */
router.get('/marks-whatsapp-status', async (req, res) => {
  let db: any;
  try {
    db = getDbAdmin();
  } catch (err: any) {
    return res.status(403).json({ error: "Database not accessible" });
  }

  const { examId } = req.query;
  if (!examId) {
    return res.status(400).json({ error: "Missing examId" });
  }

  try {
    const sentMap: Record<string, { sent: boolean; status: string; sentAt?: string; messageId?: string; phone?: string }> = {};

    // 1. From dedicated exam_marks_whatsapp_status collection
    const statusSnap = await db.collection('exam_marks_whatsapp_status')
      .where('examId', '==', String(examId))
      .get();
    
    statusSnap.docs.forEach((d: any) => {
      const data = d.data();
      if (data.studentId) {
        sentMap[data.studentId] = {
          sent: true,
          status: data.status || 'sent',
          sentAt: data.sentAt || data.updatedAt,
          phone: data.phone,
          messageId: data.messageId
        };
      }
    });

    // 2. From examMarks collection with whatsappSent == true
    const marksSnap = await db.collection('examMarks')
      .where('examId', '==', String(examId))
      .where('whatsappSent', '==', true)
      .get();

    marksSnap.docs.forEach((d: any) => {
      const data = d.data();
      if (data.studentId && !sentMap[data.studentId]) {
        sentMap[data.studentId] = {
          sent: true,
          status: data.whatsappStatus || 'sent',
          sentAt: data.whatsappSentAt
        };
      }
    });

    // 3. From whatsapp_queue collection
    const queueSnap = await db.collection('whatsapp_queue')
      .where('options.examId', '==', String(examId))
      .get();

    queueSnap.docs.forEach((d: any) => {
      const data = d.data();
      const sId = data.options?.studentId;
      if (sId && data.status !== 'failed') {
        if (!sentMap[sId]) {
          sentMap[sId] = {
            sent: true,
            status: data.status || 'sent',
            sentAt: data.completedAt || data.createdAt,
            phone: data.to,
            messageId: data.waMessageId || d.id
          };
        }
      }
    });

    res.json({ success: true, sentMap });
  } catch (err: any) {
    console.error('Error fetching marks whatsapp status:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch status' });
  }
});

/**
 * POST /api/exams/send-marks-whatsapp
 */
router.post('/send-marks-whatsapp', async (req, res) => {
  let db: any;
  try {
    db = getDbAdmin();
  } catch (err: any) {
    return res.status(403).json({ 
      error: "Google Cloud Billing is required to access Firestore Database for project antonyserp-cc9df. Please enable billing at https://console.developers.google.com/billing/enable?project=antonyserp-cc9df then retry." 
    });
  }

  const {
    studentIds,
    examId,
    classId,
    section,
    sendMode,
    forceSend
  } = req.body;

  if (!examId) {
    return res.status(400).json({ error: "Missing examId" });
  }

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: "Missing studentIds list" });
  }

  console.log(`[Exams Route] Processing send marks. Students: ${studentIds.length}, Exam: ${examId}, Force: ${forceSend}`);

  // Summary counts
  let totalRequested = studentIds.length;
  let queuedCount = 0;
  let duplicateSkipped = 0;
  let optOutSkipped = 0;
  let missingPhone = 0;
  let invalidPhone = 0;
  let marksMissing = 0;
  let failedCount = 0;

  // Itemized breakdown records to inform users exactly which student/phone has issues
  const resultsByStudentId: Record<string, {
    studentId: string;
    studentName: string;
    rollNumber: string;
    phone: string;
    status: 'queued' | 'duplicate' | 'optout' | 'missing_phone' | 'invalid_phone' | 'missing_marks' | 'failed';
    reason?: string;
  }> = {};

  const details = {
    duplicates: [] as Array<{ studentId: string; studentName: string; rollNumber: string; phone: string; reason: string }>,
    marksMissing: [] as Array<{ studentId: string; studentName: string; rollNumber: string; phone: string; reason: string }>,
    invalidPhone: [] as Array<{ studentId: string; studentName: string; rollNumber: string; phone: string; rawPhone: string; reason: string }>,
    missingPhone: [] as Array<{ studentId: string; studentName: string; rollNumber: string; reason: string }>,
    optOut: [] as Array<{ studentId: string; studentName: string; rollNumber: string; phone: string; reason: string }>,
    queued: [] as Array<{ studentId: string; studentName: string; rollNumber: string; phone: string; messageId?: string }>,
    failed: [] as Array<{ studentId: string; studentName: string; rollNumber: string; phone: string; error: string }>
  };

  try {
    // 1. Fetch exam details
    const examDoc = await db.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      return res.status(404).json({ error: `Exam with ID ${examId} not found` });
    }
    const examData = examDoc.data()!;
    const isFA = examData.type === 'FA';
    const examTitle = examData.title || `Exam_${examId}`;

    // 2. Fetch subjects, classes, batches, and exam schedules
    const [subjectsSnap, classesSnap, batchesSnap] = await Promise.all([
      db.collection('subjects').get(),
      db.collection('classes').get(),
      db.collection('batches').get()
    ]);
    const allSubjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const classesMap = new Map<string, any>(classesSnap.docs.map(d => [d.id, d.data()]));
    const batchesMap = new Map<string, any>(batchesSnap.docs.map(d => [d.id, d.data()]));

    // Fetch exam schedules for this exam to ensure ONLY scheduled subjects are included
    const schedSnap = await db.collection('examSchedules').where('examId', '==', examId).get();
    let allExamSchedules = schedSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    if (allExamSchedules.length === 0) {
      const altSchedSnap = await db.collection('examSchedules').where('examTitle', '==', examTitle).get();
      allExamSchedules = altSchedSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    }

    // 3. Resolve school metadata for display and key
    const schoolDoc = await db.collection('settings').doc('school').get();
    const resolvedSchoolId = schoolDoc.exists && schoolDoc.data()?.schoolId ? schoolDoc.data()?.schoolId : 'st_antonys_school';
    const resolvedSchoolName = schoolDoc.exists && schoolDoc.data()?.schoolName ? schoolDoc.data()?.schoolName : 'St. Antony’s School';

    // 4. Load message template if available
    const templateSnapshot = await db.collection('message_templates')
      .where('event', '==', 'exam_result')
      .where('isActive', '==', true)
      .limit(1)
      .get();
    const templateData = !templateSnapshot.empty ? templateSnapshot.docs[0].data() : null;

    // Load custom opt-out collection
    const optOutSnap = await db.collection('whatsapp_opt_out').get();
    const optedOutSet = new Set(optOutSnap.docs.map(doc => doc.id));

    // Audit Log: backend queue started
    await db.collection('whatsapp_audit_logs').add({
      event: 'marks_result_backend_queue_used',
      payload: { examId, studentCount: studentIds.length, forceSend: !!forceSend },
      timestamp: new Date().toISOString()
    });

    // 5. Query all exam marks for these students and this exam in one query if possible (or parallel)
    const marksSnap = await db.collection('examMarks')
      .where('examId', '==', examId)
      .get();
    const allMarks = marksSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Pre-load sent status records to deactivate / prevent duplicate sending
    const existingSentSnap = await db.collection('exam_marks_whatsapp_status')
      .where('examId', '==', examId)
      .get();
    const existingSentMap = new Map<string, any>();
    existingSentSnap.docs.forEach((d: any) => {
      const data = d.data();
      if (data.studentId) existingSentMap.set(data.studentId, data);
    });

    // Also check whatsapp_queue for non-failed messages for this exam
    const queueSnap = await db.collection('whatsapp_queue')
      .where('options.examId', '==', examId)
      .get();
    queueSnap.docs.forEach((d: any) => {
      const data = d.data();
      const sId = data.options?.studentId;
      if (sId && data.status !== 'failed' && !existingSentMap.has(sId)) {
        existingSentMap.set(sId, {
          studentId: sId,
          status: data.status,
          sentAt: data.completedAt || data.createdAt
        });
      }
    });

    // 6. Loop through each student to construct, normalize, validate, and queue their results
    for (const studentId of studentIds) {
      let currentStudentName = 'Unknown';
      let currentRollNumber = '-';
      let currentRawPhone = '';
      let currentNormalizedPhone = '';

      try {
        const studentDoc = await db.collection('students').doc(studentId).get();
        if (!studentDoc.exists) {
          missingPhone++;
          details.missingPhone.push({
            studentId,
            studentName: 'Student not found in DB',
            rollNumber: '-',
            reason: 'Student record does not exist in database'
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: 'Not Found',
            rollNumber: '-',
            phone: 'None',
            status: 'missing_phone',
            reason: 'Student record not found'
          };
          continue;
        }

        const student = studentDoc.data()!;
        currentStudentName = student.name || 'Unknown';
        currentRollNumber = student.rollNumber || '-';
        const rawPhone = extractParentPhone(student);
        currentRawPhone = rawPhone || '';

        // Verify missing phone number completely
        if (!rawPhone) {
          missingPhone++;
          details.missingPhone.push({
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            reason: 'No parent phone or WhatsApp number registered in student profile'
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: 'Not Available',
            status: 'missing_phone',
            reason: 'No phone registered'
          };
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_missing_phone',
            payload: { studentId, studentName: currentStudentName },
            timestamp: new Date().toISOString()
          });
          continue;
        }

        const normalizedPhone = normalizeIndianPhone(rawPhone);
        currentNormalizedPhone = normalizedPhone;

        // Verify E.164 phone number validity
        if (!isValidIndianMobile(normalizedPhone)) {
          invalidPhone++;
          details.invalidPhone.push({
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            rawPhone,
            reason: `Invalid Indian mobile number format: "${rawPhone}" (requires valid 10-digit mobile)`
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: rawPhone,
            status: 'invalid_phone',
            reason: 'Invalid phone format'
          };
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_invalid_phone',
            payload: { studentId, studentName: currentStudentName, rawPhone, normalizedPhone },
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Check opt-out
        if (!forceSend && optedOutSet.has(normalizedPhone)) {
          optOutSkipped++;
          details.optOut.push({
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            reason: 'Parent has opted out of WhatsApp automated messages'
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            status: 'optout',
            reason: 'Parent opted out'
          };
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_rejected_opt_out',
            payload: { studentId, studentName: currentStudentName, phone: normalizedPhone },
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Get student's specific marks for this exam
        const studentMarksRecords = allMarks.filter(m => m.studentId === studentId || String(m.studentId) === String(studentId));
        
        // Deactivate & skip if exam marks were already sent to WhatsApp for this student
        const alreadySentRecord = existingSentMap.get(studentId);
        const hasSentMarkFlag = studentMarksRecords.some((m: any) => m.whatsappSent === true);

        if (!forceSend && (alreadySentRecord || hasSentMarkFlag)) {
          duplicateSkipped++;
          const sentDateStr = alreadySentRecord?.sentAt ? new Date(alreadySentRecord.sentAt).toLocaleDateString('en-IN') : 'earlier';
          const dupReason = `Exam marks already sent to WhatsApp on ${sentDateStr}. Deactivated to prevent double-sending messages.`;
          details.duplicates.push({
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            reason: dupReason
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            status: 'duplicate',
            reason: dupReason
          };
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_already_sent_deactivated',
            payload: { studentId, studentName: currentStudentName, phone: normalizedPhone, examId, reason: dupReason },
            timestamp: new Date().toISOString()
          });
          continue;
        }
        
        // If there are zero marks entered for this student in this exam, skip sending!
        if (studentMarksRecords.length === 0) {
          marksMissing++;
          details.marksMissing.push({
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            reason: `No marks entered for this exam: ${examTitle}`
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            status: 'missing_marks',
            reason: 'No marks entered for this exam'
          };
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_missing_marks',
            payload: { studentId, studentName: currentStudentName, examId },
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Filter schedules matching this student's batch and class
        const studentClassId = student.classId || classId;
        const studentBatchId = student.batchId || section;
        const studentClassName = String(student.className || student.class || '').toLowerCase().trim();
        const studentBatchName = String(student.batchName || student.batch || student.section || '').toLowerCase().trim();

        const matchingSchedules = allExamSchedules.filter((sch: any) => {
          const schBatchId = String(sch.batchId || '');
          const schBatchName = String(sch.batchName || '').toLowerCase().trim();
          const schClassId = String(sch.classId || '');
          const schClassName = String(sch.className || '').toLowerCase().trim();

          if (studentBatchId && (schBatchId === String(studentBatchId) || schBatchName === studentBatchName)) return true;
          if (studentBatchName && (schBatchName === studentBatchName || schBatchId.toLowerCase().trim() === studentBatchName)) return true;
          if (studentClassId && (schClassId === String(studentClassId) || schClassName === studentClassName)) return true;
          if (studentClassName && (schClassName === studentClassName || schClassId.toLowerCase().trim() === studentClassName)) return true;
          if (!studentBatchId && !studentClassId && !schBatchId && !schClassId) return true;
          return false;
        });

        let studentSubjects = allSubjects;
        if (matchingSchedules.length > 0) {
          const scheduledSubjectIds = new Set(matchingSchedules.map((s: any) => String(s.subjectId || '')));
          const scheduledSubjectNames = new Set(matchingSchedules.map((s: any) => String(s.subjectName || '').toLowerCase().trim()));

          studentSubjects = allSubjects.filter((s: any) => 
            scheduledSubjectIds.has(String(s.id)) || 
            scheduledSubjectNames.has(String(s.name || '').toLowerCase().trim())
          );

          // Append any scheduled subjects if present in schedule but not in allSubjects
          matchingSchedules.forEach((sch: any) => {
            const schName = (sch.subjectName || '').trim();
            const exists = studentSubjects.some((s: any) => 
              (sch.subjectId && String(s.id) === String(sch.subjectId)) ||
              (schName && (s.name || '').toLowerCase().trim() === schName.toLowerCase())
            );
            if (!exists && schName) {
              studentSubjects.push({
                id: sch.subjectId || `sched_${schName.replace(/\s+/g, '_')}`,
                name: schName,
                code: schName.toUpperCase()
              });
            }
          });
        } else {
          // Fallback: If no schedules for this batch, filter by class curriculum if available
          const classFiltered = allSubjects.filter((s: any) => !s.classId || s.classId === studentClassId || (s.classes && s.classes.includes(studentClassId)));
          if (classFiltered.length > 0) {
            studentSubjects = classFiltered;
          }
        }

        // Determine if student belongs to Class 10 or Class 6 to 9
        const isClass10 = isClass10Entity(student, studentClassId, studentBatchId, classesMap, batchesMap);
        const isClass6to9 = !isClass10 && isClass6to9Entity(student, studentClassId, studentBatchId, classesMap, batchesMap);

        // Get student calculation totals safely and consistently using scheduled subjects only
        const totals = calculateExamResultTotals(studentMarksRecords, isFA, studentSubjects, isClass10, isClass6to9);
        
        await db.collection('whatsapp_audit_logs').add({
          event: 'marks_result_calculation_completed',
          payload: { studentId, studentName: student.name || 'Unknown', totals, isClass10, isClass6to9 },
          timestamp: new Date().toISOString()
        });

        // Construct subject marks text
        // For Class 10 in FA: do NOT mention slip tests, directly mention only FA marks without '(FA Written)'
        const subjectMarksText = totals.subjectMarks.map(sm => {
          if (sm.entered) {
            if (isClass10 && isFA) {
              return `🔹 *${sm.name}*: ${sm.total}/${sm.max}`;
            }
            return `🔹 *${sm.name}*: ${sm.total}/${sm.max} (${sm.breakdown})`;
          } else {
            return `🔹 *${sm.name}*: Not entered`;
          }
        }).join('\n');

        // Prepare context options
        const resultDate = new Date().toISOString().split('T')[0];
        
        // Find if we have any mark ID to include in options
        const firstMarkId = studentMarksRecords[0]?.id || studentMarksRecords[0]?.uid || `${examId}_${studentId}`;

        // 10. Template or fallback message build
        let message = `Dear ${student.fatherName || 'Parent'},
Exam result for *${student.name || 'Student'}* has been published.

📝 *Exam:* ${examTitle}
📌 *Roll No:* ${student.rollNumber || 'N/A'}
📊 *Total:* ${totals.grandTotal}/${totals.maxPossible}
📈 *Percentage:* ${totals.percentage}%
🏁 *Status:* ${totals.statusLabel}

*Subject-wise Marks:*
{subject_marks}

For more details, please contact St. Antony’s School office.

This is an automated message.`;

        if (templateData && templateData.content) {
          message = templateData.content.replace(/\{\{(.*?)\}\}/g, (match: string, key: string) => {
            const k = key.trim();
            if (k === 'student_name') return student.name || '';
            if (k === 'father_name') return student.fatherName || 'Parent';
            if (k === 'exam_name') return examTitle;
            if (k === 'roll_number') return student.rollNumber || 'N/A';
            if (k === 'total_obtained') return totals.grandTotal.toString();
            if (k === 'total_max') return totals.maxPossible.toString();
            if (k === 'percentage') return totals.percentage.toString();
            if (k === 'status') return totals.statusLabel;
            if (k === 'subject_marks') return subjectMarksText;
            if (k === 'school_name') return resolvedSchoolName;
            return match;
          });
        } else {
          // Replace placeholders manually on fallback template
          message = message.replace('{subject_marks}', subjectMarksText);
        }

        // Call sendMessage() with rich metadata options as mandated in Part 4
        const sendResult = await sendMessage(normalizedPhone, message, {
          studentId,
          examId,
          resultId: `${examId}_${studentId}`,
          marksId: firstMarkId,
          templateType: "exam_result",
          messageType: "marks_result",
          eventType: "exam_result",
          priority: 2,
          source: "exams_marks_whatsapp",
          date: resultDate,
          schoolId: resolvedSchoolId,
          forceSend: !!forceSend
        }, "single");

        // Assess result of queue sending
        if (sendResult && sendResult.skipped) {
          duplicateSkipped++;
          const dupReason = sendResult.reason || 'Already queued or sent today for this exam';
          details.duplicates.push({
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            reason: dupReason
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            status: 'duplicate',
            reason: dupReason
          };
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_duplicate_skipped',
            payload: { studentId, studentName: currentStudentName, phone: normalizedPhone, reason: dupReason },
            timestamp: new Date().toISOString()
          });
        } else {
          queuedCount++;
          details.queued.push({
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            messageId: sendResult?.id
          });
          resultsByStudentId[studentId] = {
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            status: 'queued',
            reason: 'Queued for delivery (Deactivated for duplicate prevention)'
          };
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_message_queued',
            payload: { studentId, studentName: currentStudentName, phone: normalizedPhone },
            timestamp: new Date().toISOString()
          });

          // Persistent record in exam_marks_whatsapp_status to deactivate future sends
          const nowIso = new Date().toISOString();
          await db.collection('exam_marks_whatsapp_status').doc(`${examId}_${studentId}`).set({
            examId,
            studentId,
            studentName: currentStudentName,
            rollNumber: currentRollNumber,
            phone: normalizedPhone,
            status: 'sent',
            sentAt: nowIso,
            messageId: sendResult?.id || null,
            updatedAt: nowIso
          }, { merge: true }).catch((err: any) => console.warn('Failed to record exam_marks_whatsapp_status:', err.message));

          // Also update all marks records for this student and exam to flag whatsappSent
          for (const mRec of studentMarksRecords) {
            if (mRec.id) {
              await db.collection('examMarks').doc(mRec.id).update({
                whatsappSent: true,
                whatsappSentAt: nowIso,
                whatsappStatus: 'sent'
              }).catch(() => {});
            }
          }
        }

      } catch (innerErr: any) {
        console.error(`Error queueing for student ${studentId}:`, innerErr);
        failedCount++;
        details.failed.push({
          studentId,
          studentName: currentStudentName,
          rollNumber: currentRollNumber,
          phone: currentNormalizedPhone || currentRawPhone || '-',
          error: innerErr.message || 'Server error during queue'
        });
        resultsByStudentId[studentId] = {
          studentId,
          studentName: currentStudentName,
          rollNumber: currentRollNumber,
          phone: currentNormalizedPhone || currentRawPhone || '-',
          status: 'failed',
          reason: innerErr.message || 'Error queueing message'
        };
      }
    }

    res.json({
      success: true,
      summary: {
        totalRequested,
        queuedCount,
        duplicateSkipped,
        optOutSkipped,
        missingPhone,
        invalidPhone,
        marksMissing,
        failedCount
      },
      details,
      resultsByStudentId
    });

  } catch (error: any) {
    console.error("Failed to send marks via WhatsApp Queue:", error);
    const msg = error?.message || String(error);
    if (msg.includes('billing') || msg.includes('PERMISSION_DENIED')) {
      return res.status(403).json({
        error: "Google Cloud Billing is required on project antonyserp-cc9df. Please enable billing at https://console.developers.google.com/billing/enable?project=antonyserp-cc9df then retry."
      });
    }
    res.status(500).json({ error: error.message || "Failed to process marks WhatsApp queue" });
  }
});

/**
 * POST /api/exams/send-schedule-whatsapp
 */
router.post('/send-schedule-whatsapp', async (req, res) => {
  let db: any;
  try {
    db = getDbAdmin();
  } catch (err: any) {
    return res.status(403).json({ 
      error: "Google Cloud Billing is required to access Firestore Database for project antonyserp-cc9df. Please enable billing at https://console.developers.google.com/billing/enable?project=antonyserp-cc9df then retry." 
    });
  }

  const {
    examId,
    batchId,
    classId,
    forceSend
  } = req.body;

  if (!examId || !batchId || !classId) {
    return res.status(400).json({ error: "Missing examId, batchId, or classId" });
  }

  console.log(`[Exams Route] Processing send schedule. Exam: ${examId}, Batch: ${batchId}, Class: ${classId}, Force: ${forceSend}`);

  try {
    // 1. Fetch exam details
    const examDoc = await db.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      return res.status(404).json({ error: `Exam with ID ${examId} not found` });
    }
    const examData = examDoc.data()!;
    const examTitle = examData.title || `Exam_${examId}`;

    // 2. Fetch class details
    const classDoc = await db.collection('classes').doc(classId).get();
    const className = classDoc.exists ? (classDoc.data()!.name || 'N/A') : 'N/A';

    // 3. Fetch batch/section details
    const batchDoc = await db.collection('batches').doc(batchId).get();
    const sectionName = batchDoc.exists ? (batchDoc.data()!.name || 'N/A') : 'N/A';

    // 4. Fetch scheduled subjects for this exam and batch
    const schedulesSnap = await db.collection('examSchedules')
      .where('examId', '==', examId)
      .where('batchId', '==', batchId)
      .get();
    
    if (schedulesSnap.empty) {
      return res.status(400).json({ error: "No exam timetable schedules found for this exam and batch selection." });
    }

    const schedules = schedulesSnap.docs.map(d => d.data());
    
    // Sort schedules by date
    schedules.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateA.localeCompare(dateB);
    });

    // 5. Format schedule details text
    const scheduleDetailsText = schedules.map(s => {
      const formattedDate = s.date ? new Date(s.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
      const timeStr = s.time || '';
      const durationStr = s.duration ? ` (${s.duration})` : '';
      return `🔹 *${s.subjectName || 'Subject'}*: ${formattedDate} at ${timeStr}${durationStr}`;
    }).join('\n');

    // 6. Resolve school metadata for display and key
    const schoolDoc = await db.collection('settings').doc('school').get();
    const resolvedSchoolId = schoolDoc.exists && schoolDoc.data()?.schoolId ? schoolDoc.data()?.schoolId : 'st_antonys_school';
    const resolvedSchoolName = schoolDoc.exists && schoolDoc.data()?.schoolName ? schoolDoc.data()?.schoolName : 'St. Antony’s School';

    // 7. Load message template if available
    const templateSnapshot = await db.collection('message_templates')
      .where('event', '==', 'exam_schedule')
      .where('isActive', '==', true)
      .limit(1)
      .get();
    const templateData = !templateSnapshot.empty ? templateSnapshot.docs[0].data() : null;

    // Load custom opt-out collection
    const optOutSnap = await db.collection('whatsapp_opt_out').get();
    const optedOutSet = new Set(optOutSnap.docs.map(doc => doc.id));

    // Audit Log: backend queue started
    await db.collection('whatsapp_audit_logs').add({
      event: 'exam_schedule_backend_queue_used',
      payload: { examId, batchId, forceSend: !!forceSend },
      timestamp: new Date().toISOString()
    });

    // 8. Fetch students in this batch
    const studentsSnap = await db.collection('students')
      .where('batchId', '==', batchId)
      .get();

    if (studentsSnap.empty) {
      return res.json({
        success: true,
        summary: {
          totalRequested: 0,
          queuedCount: 0,
          duplicateSkipped: 0,
          optOutSkipped: 0,
          missingPhone: 0,
          invalidPhone: 0,
          failedCount: 0
        }
      });
    }

    let totalRequested = studentsSnap.size;
    let queuedCount = 0;
    let duplicateSkipped = 0;
    let optOutSkipped = 0;
    let missingPhone = 0;
    let invalidPhone = 0;
    let failedCount = 0;

    const resultDate = new Date().toISOString().split('T')[0];

    // Loop through each student to queue the message
    for (const doc of studentsSnap.docs) {
      try {
        const student = doc.data();
        const studentId = doc.id;
        const rawPhone = extractParentPhone(student);

        if (!rawPhone) {
          missingPhone++;
          continue;
        }

        const normalizedPhone = normalizeIndianPhone(rawPhone);

        if (!isValidIndianMobile(normalizedPhone)) {
          invalidPhone++;
          continue;
        }

        if (!forceSend && optedOutSet.has(normalizedPhone)) {
          optOutSkipped++;
          continue;
        }

        let message = `Dear Parent,
The exam schedule for *${examTitle}* has been released for Class *${className}* (Section *${sectionName}*).

Please find the timetable details below:
${scheduleDetailsText}

Kindly help your child prepare accordingly.
Regards,
*${resolvedSchoolName}*`;

        if (templateData && templateData.content) {
          message = templateData.content.replace(/\{\{(.*?)\}\}/g, (match: string, key: string) => {
            const k = key.trim();
            if (k === 'exam_name') return examTitle;
            if (k === 'class_name') return className;
            if (k === 'section_name') return sectionName;
            if (k === 'schedule_details') return scheduleDetailsText;
            if (k === 'school_name') return resolvedSchoolName;
            return match;
          });
        }

        const sendResult = await sendMessage(normalizedPhone, message, {
          studentId,
          examId,
          batchId,
          templateType: "exam_schedule",
          messageType: "exam_schedule",
          eventType: "exam_schedule",
          priority: 2,
          source: "exams_schedule_whatsapp",
          date: resultDate,
          schoolId: resolvedSchoolId,
          forceSend: !!forceSend
        }, "single");

        if (sendResult && sendResult.skipped) {
          duplicateSkipped++;
        } else {
          queuedCount++;
        }

      } catch (innerErr) {
        console.error(`Error queueing exam schedule for student ${doc.id}:`, innerErr);
        failedCount++;
      }
    }

    res.json({
      success: true,
      summary: {
        totalRequested,
        queuedCount,
        duplicateSkipped,
        optOutSkipped,
        missingPhone,
        invalidPhone,
        failedCount
      }
    });

  } catch (error: any) {
    console.error("Failed to send exam schedule via WhatsApp Queue:", error);
    res.status(500).json({ error: error.message || "Failed to process exam schedule WhatsApp queue" });
  }
});

/**
 * POST /api/exams/ocr-marks
 * Extracts marks for students in an exam using Gemini 3.5 Flash OCR
 */
router.post('/ocr-marks', async (req, res) => {
  const { image, students, columns } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Missing image data" });
  }

  if (!students || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: "Missing students list" });
  }

  console.log(`[Exams OCR Route] Processing OCR marks extraction. Students list length: ${students.length}`);

  try {
    let base64Data = image;
    let mimeType = "image/jpeg";

    if (image.includes(';base64,')) {
      const parts = image.split(';base64,');
      mimeType = parts[0].split(':')[1];
      base64Data = parts[1];
    }

    const imagePart = {
      inlineData: {
        mimeType,
        data: base64Data
      }
    };

    const studentsText = JSON.stringify(students.map((s: any) => ({
      rollNumber: s.rollNumber || '',
      name: s.name,
      id: s.id
    })));

    const prompt = `Analyze this image of a marks sheet or register page and extract the marks for the students.
We have a list of students:
${studentsText}

We need to extract values for these specific marks columns:
${JSON.stringify(columns)}

Instructions:
1. Scan the image for any matches of student names or roll numbers from the list above.
2. Under each column in ${JSON.stringify(columns)} (such as 'st1', 'st2', 'hw', 'faWritten', 'saWritten'), extract the numeric marks for that student.
3. If a student is present but has no entry or marked absent (e.g. 'Ab', 'A', '-'), or if you cannot find the student, set that mark to 0 or null.
4. Try to be extremely careful with spelling variants and phonetic similarities in student names.
5. Do not hallucinate or make up marks.
6. Return a valid JSON array matching the response schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [imagePart, prompt],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              studentId: { type: Type.STRING, description: "The student's unique ID from the input list" },
              rollNumber: { type: Type.STRING, description: "The student's roll number" },
              studentName: { type: Type.STRING, description: "The student's name" },
              marks: {
                type: Type.OBJECT,
                properties: {
                  st1: { type: Type.NUMBER, description: "Marks for ST-1" },
                  st2: { type: Type.NUMBER, description: "Marks for ST-2" },
                  hw: { type: Type.NUMBER, description: "Marks for ST-3 / HW" },
                  faWritten: { type: Type.NUMBER, description: "Marks for FA Written" },
                  saWritten: { type: Type.NUMBER, description: "Marks for SA Written" }
                }
              }
            },
            required: ["studentId"]
          }
        }
      }
    });

    const text = response.text || "[]";
    const parsed = JSON.parse(text);
    res.json({ success: true, marks: parsed });

  } catch (error: any) {
    console.error("Gemini OCR marks extraction failed:", error);
    res.status(500).json({ error: error.message || "Failed to extract marks using OCR" });
  }
});

export default router;
