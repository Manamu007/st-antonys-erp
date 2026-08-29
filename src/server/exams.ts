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
 * Standardized exam marks helper to calculate totals consistently
 */
export function calculateExamResultTotals(marksRecords: any[], isFA: boolean, subjects: any[]) {
  const subjectMarks: { name: string; total: number; max: number; entered: boolean; breakdown: string }[] = [];
  let grandTotal = 0;
  let maxPossible = 0;
  let isPass = true;
  let enteredCount = 0;

  for (const sub of subjects) {
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
      total = Math.round(st1 + st2 + hw + faWritten);
      breakdown = `ST1(${st1}) + ST2(${st2}) + HW(${hw}) + FA(${faWritten})`;
    } else {
      // Consistently use: st1 + st2 + hw + saWritten as required by Part 6 Rule 3
      total = Math.round(st1 + st2 + hw + saWritten);
      breakdown = `ST1(${st1}) + ST2(${st2}) + HW(${hw}) + SA(${saWritten})`;
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
      breakdown
    });
  }

  const percentage = maxPossible > 0 ? Math.round((grandTotal / maxPossible) * 100) : 0;
  const statusLabel = isPass ? "PASS" : "FAIL/COMP";

  return {
    subjectMarks,
    grandTotal,
    maxPossible,
    percentage,
    isPass,
    statusLabel,
    enteredCount,
    marksMissing: enteredCount === 0 || enteredCount < subjects.length
  };
}

/**
 * POST /api/exams/send-marks-whatsapp
 */
router.post('/send-marks-whatsapp', async (req, res) => {
  const db = getDbAdmin();
  if (!db) {
    return res.status(500).json({ error: "Firestore unavailable" });
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

  try {
    // 1. Fetch exam details
    const examDoc = await db.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      return res.status(404).json({ error: `Exam with ID ${examId} not found` });
    }
    const examData = examDoc.data()!;
    const isFA = examData.type === 'FA';
    const examTitle = examData.title || `Exam_${examId}`;

    // 2. Fetch subjects and exam schedules
    const subjectsSnap = await db.collection('subjects').get();
    const allSubjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

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

    // 6. Loop through each student to construct, normalize, validate, and queue their results
    for (const studentId of studentIds) {
      try {
        const studentDoc = await db.collection('students').doc(studentId).get();
        if (!studentDoc.exists) {
          missingPhone++;
          continue;
        }

        const student = studentDoc.data()!;
        const rawPhone = extractParentPhone(student);

        // Verify missing phone number completely
        if (!rawPhone) {
          missingPhone++;
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_missing_phone',
            payload: { studentId, studentName: student.name || 'Unknown' },
            timestamp: new Date().toISOString()
          });
          continue;
        }

        const normalizedPhone = normalizeIndianPhone(rawPhone);

        // Verify E.164 phone number validity
        if (!isValidIndianMobile(normalizedPhone)) {
          invalidPhone++;
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_invalid_phone',
            payload: { studentId, studentName: student.name || 'Unknown', rawPhone, normalizedPhone },
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Check opt-out
        if (!forceSend && optedOutSet.has(normalizedPhone)) {
          optOutSkipped++;
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_rejected_opt_out',
            payload: { studentId, studentName: student.name || 'Unknown', phone: normalizedPhone },
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Get student's specific marks for this exam
        const studentMarksRecords = allMarks.filter(m => m.studentId === studentId);
        
        // If there are zero marks entered for this student in this exam, skip sending!
        if (studentMarksRecords.length === 0) {
          marksMissing++;
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_missing_marks',
            payload: { studentId, studentName: student.name || 'Unknown', examId },
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

        // Get student calculation totals safely and consistently using scheduled subjects only
        const totals = calculateExamResultTotals(studentMarksRecords, isFA, studentSubjects);
        
        await db.collection('whatsapp_audit_logs').add({
          event: 'marks_result_calculation_completed',
          payload: { studentId, studentName: student.name || 'Unknown', totals },
          timestamp: new Date().toISOString()
        });

        // Construct subject marks text
        const subjectMarksText = totals.subjectMarks.map(sm => {
          if (sm.entered) {
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
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_duplicate_skipped',
            payload: { studentId, studentName: student.name || 'Unknown', reason: sendResult.reason },
            timestamp: new Date().toISOString()
          });
        } else {
          queuedCount++;
          await db.collection('whatsapp_audit_logs').add({
            event: 'marks_result_message_queued',
            payload: { studentId, studentName: student.name || 'Unknown', phone: normalizedPhone },
            timestamp: new Date().toISOString()
          });
        }

      } catch (innerErr: any) {
        console.error(`Error queueing for student ${studentId}:`, innerErr);
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
        marksMissing,
        failedCount
      }
    });

  } catch (error: any) {
    console.error("Failed to send marks via WhatsApp Queue:", error);
    res.status(500).json({ error: error.message || "Failed to process marks WhatsApp queue" });
  }
});

/**
 * POST /api/exams/send-schedule-whatsapp
 */
router.post('/send-schedule-whatsapp', async (req, res) => {
  const db = getDbAdmin();
  if (!db) {
    return res.status(500).json({ error: "Firestore unavailable" });
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
