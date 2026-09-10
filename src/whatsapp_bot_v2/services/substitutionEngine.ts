import { getDbAdmin, initializationPromise, isDatabaseDenied, setDatabaseDenied, isQuotaOrPermissionError, handleFirestoreError } from '../../server/firebaseAdmin.js';
import { sendMessage } from '../../server/whatsapp.js';

/**
 * Automated Teacher Substitution Engine
 * Triggers on leave approval for teaching staff.
 * Scans timetable for free, qualified teachers using a leisure and proximity-based matching algorithm,
 * creates substitutions, and dispatches targeted ERP and WhatsApp notifications.
 */
export async function runTeacherSubstitutionEngine(leaveId: string): Promise<boolean> {
  console.log(`[Substitution Engine] Triggered for leaveId: ${leaveId}`);
  const db = getDbAdmin();
  if (!db) {
    console.error(`[Substitution Engine] Firestore Admin DB is not initialized.`);
    return false;
  }

  try {
    // 1. Fetch leave document
    const leaveDoc = await db.collection('leaves').doc(leaveId).get();
    if (!leaveDoc.exists) {
      console.warn(`[Substitution Engine] Leave request not found: ${leaveId}`);
      return false;
    }

    const leaveData = leaveDoc.data()!;
    if (leaveData.status !== 'approved') {
      console.log(`[Substitution Engine] Leave request is not approved: status = ${leaveData.status}`);
      return false;
    }

    // Ensure it's a staff/teacher leave
    if (leaveData.applicantRole !== 'staff' && leaveData.applicantRole !== 'teacher') {
      console.log(`[Substitution Engine] Leave is for ${leaveData.applicantRole} (${leaveData.applicantName}), skipping teacher substitution.`);
      return true;
    }

    const absentTeacherId = leaveData.applicantId;
    const absentTeacherName = leaveData.applicantName;
    const startDateStr = leaveData.startDate; // e.g., '2026-06-24'
    const endDateStr = leaveData.endDate;     // e.g., '2026-06-24'

    console.log(`[Substitution Engine] Absent Teacher: ${absentTeacherName} (${absentTeacherId}) from ${startDateStr} to ${endDateStr}`);

    // Generate dates range
    const dates: string[] = [];
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    // Safely iterate days to avoid timezone shift bugs
    const current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
      current.setDate(current.getDate() + 1);
    }

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Fetch batches, classes, staff, and timetableSlots to keep in memory for queries
    const batchesSnap = await db.collection('batches').get();
    const batches = batchesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    const classesSnap = await db.collection('classes').get();
    const classes = classesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    const staffSnap = await db.collection('staff').get();
    const staffList = staffSnap.docs.map((doc: any) => ({ uid: doc.id, ...doc.data() }));

    const teachingStaff = staffList.filter((t: any) => 
      t.role === 'teacher' || 
      t.role === 'teacher_class' || 
      t.role === 'teacher_subject' || 
      t.role === 'coordinator' || 
      t.staffType === 'teaching'
    );

    // Filter to exclude absent teacher
    const candidateTeachers = teachingStaff.filter((t: any) => t.uid !== absentTeacherId);

    // Fetch ALL timetable slots
    const timetableSnap = await db.collection('timetableSlots').get();
    const timetables = timetableSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    for (const dateStr of dates) {
      // Determine day of week
      const d = new Date(dateStr);
      const dayOfWeek = daysOfWeek[d.getDay()];

      console.log(`[Substitution Engine] Processing date: ${dateStr} (${dayOfWeek})`);

      // 1. Fetch Absent Teacher's Schedule for this day of week
      const absentTeacherPeriods = [];
      const dayTimetables = timetables.filter((tt: any) => tt.day === dayOfWeek);

      for (const tt of dayTimetables) {
        const batch = batches.find((b: any) => b.id === tt.batchId);
        const cls = classes.find((c: any) => c.id === batch?.classId);
        
        for (const p of tt.periods) {
          if (!p.isBreak && p.teacherId === absentTeacherId) {
            absentTeacherPeriods.push({
              batchId: tt.batchId,
              batchName: batch?.name || 'Class',
              className: cls?.name || batch?.name || 'Class',
              periodLabel: p.label,
              startTime: p.startTime,
              endTime: p.endTime,
              subjectId: p.subjectId,
            });
          }
        }
      }

      if (absentTeacherPeriods.length === 0) {
        console.log(`[Substitution Engine] No active teaching periods scheduled for ${absentTeacherName} on ${dayOfWeek}.`);
        continue;
      }

      console.log(`[Substitution Engine] Found ${absentTeacherPeriods.length} periods to substitute on ${dateStr}:`, absentTeacherPeriods.map(p => p.periodLabel));

      // Fetch existing substitutions on this date to prevent duplicate scheduling
      const existingSubsSnap = await db.collection('substitutions').where('date', '==', dateStr).get();
      const existingSubs = existingSubsSnap.docs.map((doc: any) => doc.data());

      // Fetch other teachers on leave on this date to exclude them from substitute pool
      const activeLeavesSnap = await db.collection('leaves').where('status', '==', 'approved').get();
      const activeLeaves = activeLeavesSnap.docs.map((doc: any) => doc.data());
      
      const onLeaveTeacherIds = new Set(
        activeLeaves
          .filter((l: any) => {
            const startL = new Date(l.startDate);
            const endL = new Date(l.endDate);
            const target = new Date(dateStr);
            return target >= startL && target <= endL;
          })
          .map((l: any) => l.applicantId)
      );

      // Helper function to extract grade level for proximity rules
      const extractGradeNumber = (name: string): number => {
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : -1;
      };

      for (const period of absentTeacherPeriods) {
        const periodLabel = period.periodLabel;
        const batchId = period.batchId;

        // Check if there's already an existing substitution recorded for this class/period on this day
        const isAlreadySubbed = existingSubs.some((s: any) => 
          s.periodLabel === periodLabel && s.batchId === batchId
        );
        if (isAlreadySubbed) {
          console.log(`[Substitution Engine] Period ${periodLabel} for ${period.batchName} is already substituted on ${dateStr}. Skipping.`);
          continue;
        }

        const targetGrade = extractGradeNumber(period.className);

        // Score all candidate teachers to find the best match
        const candidatesWithScores = [];

        for (const teacher of candidateTeachers) {
          // Exclude if this teacher is on approved leave on this date
          if (onLeaveTeacherIds.has(teacher.uid)) {
            continue;
          }

          // A. Is this teacher free in the main timetable for this period/day?
          const isBusyInTimetable = dayTimetables.some((tt: any) => 
            tt.periods.some((p: any) => p.label === periodLabel && p.teacherId === teacher.uid && !p.isBreak)
          );

          // B. Is this teacher already assigned to some substitution for this period/date?
          const isBusyInSubstitutions = existingSubs.some((s: any) => 
            s.periodLabel === periodLabel && s.substituteTeacherId === teacher.uid
          );

          const isFree = !isBusyInTimetable && !isBusyInSubstitutions;
          if (!isFree) {
            continue; // Not free during this period
          }

          // Priority factors:
          // 1. Normally teaches this class batch
          const normallyTeachesClass = timetables.some((tt: any) => 
            tt.batchId === batchId && tt.periods.some((p: any) => p.teacherId === teacher.uid)
          );

          // 2. Teaches the same subject
          const teachesSubject = timetables.some((tt: any) => 
            tt.periods.some((p: any) => p.teacherId === teacher.uid && p.subjectId === period.subjectId)
          );

          // 3. Proximity score - nearby classes/grades taught today
          const teacherPeriodsToday = dayTimetables.flatMap((tt: any) => {
            const teachesThisSlot = tt.periods.some((p: any) => p.teacherId === teacher.uid && !p.isBreak);
            if (!teachesThisSlot) return [];
            const b = batches.find((b: any) => b.id === tt.batchId);
            const c = classes.find((c: any) => c.id === b?.classId);
            const className = c?.name || b?.name || '';
            const grade = extractGradeNumber(className);
            return grade >= 0 ? [grade] : [];
          });

          let minGradeDistance = 999;
          if (targetGrade >= 0 && teacherPeriodsToday.length > 0) {
            teacherPeriodsToday.forEach(g => {
              const dist = Math.abs(g - targetGrade);
              if (dist < minGradeDistance) {
                minGradeDistance = dist;
              }
            });
          }

          // 4. Fair workload: calculate current total periods (regular + subbed) today
          const regularPeriodsCount = dayTimetables.flatMap((tt: any) => 
            tt.periods.filter((p: any) => !p.isBreak && p.teacherId === teacher.uid)
          ).length;

          const substitutionPeriodsCount = existingSubs.filter((s: any) => 
            s.substituteTeacherId === teacher.uid
          ).length;

          const currentLoad = regularPeriodsCount + substitutionPeriodsCount;
          const maxLoad = teacher.maxPeriodsPerDay || 6;

          if (currentLoad >= maxLoad) {
            continue; // Exceeds teaching limit
          }

          // Calculate ranking score
          let score = 0;
          if (normallyTeachesClass) score += 100;
          if (teachesSubject) score += 50;

          if (minGradeDistance === 0) score += 30;
          else if (minGradeDistance === 1) score += 20;
          else if (minGradeDistance === 2) score += 10;

          // Prefer lower workload to distribute work evenly
          score -= currentLoad * 5;

          candidatesWithScores.push({
            teacher,
            score,
            currentLoad,
            normallyTeachesClass
          });
        }

        if (candidatesWithScores.length === 0) {
          console.warn(`[Substitution Engine] No free candidate teachers found for Period ${periodLabel} (${period.batchName}) on ${dateStr}.`);
          continue;
        }

        // Sort candidates: highest score first
        candidatesWithScores.sort((a, b) => b.score - a.score);
        const bestMatch = candidatesWithScores[0];
        const assignedTeacher = bestMatch.teacher;

        console.log(`[Substitution Engine] Assigned ${assignedTeacher.name} (Score: ${bestMatch.score}, Load: ${bestMatch.currentLoad}) as substitute for ${absentTeacherName} in ${period.batchName} Period ${periodLabel}.`);

        // Write substitution record to collection
        const docId = `${dateStr}_${absentTeacherId}_${periodLabel}_${batchId}`;
        const substitutionRecord = {
          id: docId,
          date: dateStr,
          absentTeacherId,
          absentTeacherName,
          substituteTeacherId: assignedTeacher.uid,
          substituteTeacherName: assignedTeacher.name,
          periodLabel,
          periodIndex: periodLabel,
          batchId,
          reason: `Auto-assigned coverage for ${absentTeacherName} in ${period.batchName}.`,
          createdAt: new Date().toISOString()
        };

        await db.collection('substitutions').doc(docId).set(substitutionRecord);
        
        // Add to our in-memory list to prevent double assignment of the same substitute in same period
        existingSubs.push({
          periodLabel,
          substituteTeacherId: assignedTeacher.uid,
          batchId
        });

        // 3. Isolated internal app notification event delivery
        await db.collection('notifications').add({
          userId: assignedTeacher.uid,
          title: '🔄 Automated Substitution Duty',
          message: `🔄 సబ్స్టిట్యూషన్ అలర్ట్: ${absentTeacherName} సెలవులో ఉన్నందున, ఈరోజు Period ${periodLabel} లో మీరు ${period.batchName} క్లాస్ కు వెళ్లాల్సిందిగా కోరుచున్నాము. / Substitution Alert: Since ${absentTeacherName} is on leave, you are assigned to ${period.batchName} during Period ${periodLabel} today.`,
          type: 'substitution',
          date: dateStr,
          read: false,
          createdAt: new Date().toISOString()
        });

        // Send isolated WhatsApp notification to assigned teacher only
        const phone = assignedTeacher.whatsappNumber || assignedTeacher.phone;
        if (phone) {
          const normPhone = phone.replace(/\D/g, '');
          const last10Phone = normPhone.length >= 10 ? normPhone.slice(-10) : normPhone;
          const indianPhone = last10Phone.length === 10 ? `91${last10Phone}` : last10Phone;

          const whatsappMessageText = `🔄 *సబ్స్టిట్యూషన్ అలర్ట్ / Substitution Alert*\n\n${absentTeacherName} సెలవులో ఉన్నందున, ఈరోజు *Period ${periodLabel}* లో మీరు *${period.batchName}* క్లాస్ కు వెళ్లాల్సిందిగా కోరుచున్నాము.\n\nSince ${absentTeacherName} is on leave, you are assigned to *${period.batchName}* during *Period ${periodLabel}* today.`;

          console.log(`[Substitution Engine] Sending isolated WhatsApp notification to assigned teacher ${assignedTeacher.name} (${indianPhone})...`);
          
          try {
            await sendMessage(indianPhone, whatsappMessageText, {
              templateType: 'substitution_alert',
              eventType: 'substitution',
              priority: 1
            }, 'bot');
          } catch (waErr: any) {
            console.error(`[Substitution Engine] Failed to deliver WhatsApp alert to ${assignedTeacher.name}:`, waErr.message);
          }
        }
      }
    }

    return true;
  } catch (error: any) {
    if (isQuotaOrPermissionError(error)) {
      handleFirestoreError(error, 'Substitution Engine');
      return false;
    }
    console.error(`[Substitution Engine Error] Failed during auto teacher substitution calculation:`, error);
    return false;
  }
}

/**
 * Starts a real-time Firestore listener on the 'leaves' collection to detect
 * when a staff leave request has been approved (e.g. from the admin panel, WhatsApp, or AI).
 */
let unsubscribeLeavesListener: (() => void) | null = null;

export async function startSubstitutionEngineListener(): Promise<void> {
  if (isDatabaseDenied()) {
    return;
  }
  
  // Set of already processed approved leave IDs to avoid redundant executions during startup/snapshots
  const processedLeaveIds = new Set<string>();

  try {
    await initializationPromise;
    if (isDatabaseDenied()) return;

    const db = getDbAdmin();
    if (!db) {
      return;
    }

    console.log(`[Substitution Engine] Initializing real-time Firestore listener for approved leaves...`);

    let isInitial = true;
    unsubscribeLeavesListener = db.collection('leaves')
      .where('status', '==', 'approved')
      .onSnapshot((snapshot: any) => {
        if (isInitial) {
          isInitial = false;
          // Seed the set with existing approved leaves so we do not re-run substitutions on historical leaves on every server start
          snapshot.docs.forEach((doc: any) => processedLeaveIds.add(doc.id));
          console.log(`[Substitution Engine Listener] Initialized with ${processedLeaveIds.size} existing approved leaves.`);
          return;
        }

        snapshot.docChanges().forEach(async (change: any) => {
          if (change.type === 'added' || change.type === 'modified') {
            const leaveId = change.doc.id;
            
            // To ensure we don't trigger multiple times for the same document in this session
            if (processedLeaveIds.has(leaveId)) {
              return;
            }
            
            const leaveData = change.doc.data();
            // Ensure status is approved and applicant role is teacher/staff
            if (leaveData && leaveData.status === 'approved' && (leaveData.applicantRole === 'staff' || leaveData.applicantRole === 'teacher')) {
              processedLeaveIds.add(leaveId);
              console.log(`[Substitution Engine Listener] Detected newly approved leave: ${leaveId} for ${leaveData.applicantName}. Running engine...`);
              
              try {
                await runTeacherSubstitutionEngine(leaveId);
              } catch (err: any) {
                if (isQuotaOrPermissionError(err)) {
                  handleFirestoreError(err, 'Substitution Engine Listener');
                } else {
                  console.error(`[Substitution Engine Listener] Error running engine for leave ${leaveId}:`, err);
                }
              }
            }
          }
        });
      }, (error: any) => {
        if (isQuotaOrPermissionError(error)) {
          handleFirestoreError(error, 'Substitution Engine Listener');
          if (unsubscribeLeavesListener) {
            try { unsubscribeLeavesListener(); } catch {}
            unsubscribeLeavesListener = null;
          }
        } else {
          console.error(`[Substitution Engine Listener] Firestore listener encountered an error:`, error);
        }
      });
  } catch (err: any) {
    if (isQuotaOrPermissionError(err)) {
      handleFirestoreError(err, 'Substitution Engine Listener');
    } else {
      console.error(`[Substitution Engine Listener] Failed to start:`, err.message);
    }
  }
}
