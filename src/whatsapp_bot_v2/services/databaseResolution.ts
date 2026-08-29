import { getDbAdmin } from '../../server/firebaseAdmin.js';

export interface ResolvedContext {
  studentName: string;
  parentName: string;
  className: string;
  batchName: string;
  attendancePercentage: string;
  examMarks: string;
}

/**
 * Fetches dynamic ERP student and academic records from Firestore.
 * Supports dual-run contexts (Server-side admin SDK vs client-side SDK)
 */
export async function resolveStudentContext(phoneNumber: string): Promise<ResolvedContext> {
  const result: ResolvedContext = {
    studentName: 'Student',
    parentName: 'Parent',
    className: 'N/A',
    batchName: 'N/A',
    attendancePercentage: 'N/A',
    examMarks: 'No exam marks recorded yet.'
  };

  try {
    const dbAdmin = getDbAdmin();
    if (!dbAdmin) {
      console.warn("[Bot Resolver] DB Admin not initialized.");
      return result;
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    // 1. Query 'students' collection to locate the parent's registered student(s)
    let studentDoc: any = null;
    let studentData: any = null;

    // Search fields
    const searchFields = ['parentPhone', 'whatsappNumber', 'phone', 'contact'];
    
    for (const field of searchFields) {
      const snap = await dbAdmin.collection('students')
        .where(field, '==', last10)
        .limit(1)
        .get();
      if (!snap.empty) {
        studentDoc = snap.docs[0];
        studentData = studentDoc.data();
        break;
      }
      
      // Try with country code variation
      const snapWithCountry = await dbAdmin.collection('students')
        .where(field, '==', `+91${last10}`)
        .limit(1)
        .get();
      if (!snapWithCountry.empty) {
        studentDoc = snapWithCountry.docs[0];
        studentData = studentDoc.data();
        break;
      }
    }

    if (!studentData) {
      console.warn(`[Bot Resolver] No student found for phone trail: ${last10}`);
      return result;
    }

    const studentId = studentDoc.id;
    result.studentName = studentData.name || studentData.studentName || 'Student';
    result.parentName = studentData.parentName || studentData.fatherName || studentData.motherName || 'Parent';

    // 2. Fetch Class & Batch names
    if (studentData.classId) {
      try {
        const clsDoc = await dbAdmin.collection('classes').doc(studentData.classId).get();
        if (clsDoc.exists) {
          result.className = clsDoc.data()?.name || 'N/A';
        }
      } catch (e) {}
    } else {
      result.className = studentData.class || 'N/A';
    }

    if (studentData.batchId) {
      try {
        const bthDoc = await dbAdmin.collection('batches').doc(studentData.batchId).get();
        if (bthDoc.exists) {
          result.batchName = bthDoc.data()?.name || 'N/A';
        }
      } catch (e) {}
    } else {
      result.batchName = studentData.batch || 'N/A';
    }

    // 3. Fetch & calculate Attendance Percentage
    try {
      const attSnap = await dbAdmin.collection('attendance')
        .where('studentId', '==', studentId)
        .limit(100)
        .get();
      if (!attSnap.empty) {
        let presentCount = 0;
        let totalCount = 0;
        attSnap.forEach((d: any) => {
          const status = d.data().status;
          if (status === 'present') presentCount++;
          totalCount++;
        });
        if (totalCount > 0) {
          result.attendancePercentage = `${Math.round((presentCount / totalCount) * 100)}%`;
        }
      }
    } catch (attErr) {
      console.error("[Bot Resolver] Attendance parse error:", attErr);
    }

    // 4. Fetch Exam Marks
    try {
      const marksSnap = await dbAdmin.collection('examMarks')
        .where('studentId', '==', studentId)
        .limit(20)
        .get();
      if (!marksSnap.empty) {
        const marksList: string[] = [];
        marksSnap.forEach((d: any) => {
          const data = d.data();
          const examName = data.examName || 'Test';
          const subject = data.subject || 'Subject';
          const scored = data.marksObtained ?? data.marks ?? 0;
          const total = data.maxMarks || 100;
          marksList.push(`${examName} - ${subject}: *${scored}/${total}*`);
        });
        if (marksList.length > 0) {
          result.examMarks = marksList.join('\n');
        }
      }
    } catch (marksErr) {
      console.error("[Bot Resolver] Exam marks parse error:", marksErr);
    }

  } catch (err) {
    console.error("[Bot Resolver] Critical Context Resolution Failure:", err);
  }

  return result;
}

const FALLBACK_STR = "సమాచారం లభ్యం కాలేదు (Not Available)";

/**
 * Replaces message templates with dynamic context variables
 */
export function replaceVariables(text: string, context: ResolvedContext): string {
  if (!text) return '';
  
  const safeGet = (val: any, defaultFallback = FALLBACK_STR) => {
    if (
      val === undefined || 
      val === null || 
      String(val).trim() === '' || 
      String(val).trim().toUpperCase() === 'N/A' || 
      String(val).trim().toLowerCase() === 'student' || 
      String(val).trim().toLowerCase() === 'parent' ||
      String(val).trim().toLowerCase() === 'no exam marks recorded yet.'
    ) {
      return defaultFallback;
    }
    return String(val);
  };

  return text
    .replace(/\{\{\s*student[s_]?\s*name\s*\}\}/gi, safeGet(context?.studentName, FALLBACK_STR))
    .replace(/\{\{\s*(parent[s_]?\s*name|father[s_]?\s*name|mother[s_]?\s*name)\s*\}\}/gi, safeGet(context?.parentName, FALLBACK_STR))
    .replace(/\{\{\s*class[es_]?\s*name\s*\}\}/gi, safeGet(context?.className, FALLBACK_STR))
    .replace(/\{\{\s*batch[es_]?\s*name\s*\}\}/gi, safeGet(context?.batchName, FALLBACK_STR))
    .replace(/\{\{\s*(attendance\s*percentage|attendance_percentage)\s*\}\}/gi, safeGet(context?.attendancePercentage, FALLBACK_STR))
    .replace(/\{\{\s*exam[s_]?\s*marks\s*\}\}/gi, safeGet(context?.examMarks, FALLBACK_STR));
}

/**
 * Formats/serializes the List Message Node configuration and resolves context variables 
 * into a valid options structure for the Baileys sender.
 */
export function serializeListMessage(nodeData: any, context: ResolvedContext): { text: string; options: any } {
  let textVal = replaceVariables(nodeData.text || '', context);
  const buttonText = nodeData.buttonText || "View Menu";
  const footer = nodeData.footer || "St. Antony's School ERP";

  const buttons = (nodeData.rows || []).map((row: any, idx: number) => ({
    buttonId: `row-${idx}`,
    buttonText: { displayText: replaceVariables(row.title || '', context) },
    type: 1
  }));

  if (buttons.length > 0) {
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const fallbackText = buttons.map((b: any, idx: number) => {
      const emoji = numberEmojis[idx] || `${idx + 1}.`;
      return `${emoji} *${b.buttonText.displayText}*`;
    }).join('\n');
    
    textVal = `${textVal}\n\n*Select an option (Type number or option name):*\n${fallbackText}`;
  }

  return {
    text: textVal,
    options: {
      buttonText,
      footer,
      buttons
    }
  };
}

/**
 * Queries the database and compiles a unique, deduplicated array of active target communityJid strings
 * mapping to specific classes.
 */
export async function getCommunityJidForClasses(classIds: string[]): Promise<string[]> {
  if (!classIds || classIds.length === 0) return [];
  try {
    const dbAdmin = getDbAdmin();
    const snap = await dbAdmin.collection('whatsapp_communities')
      .where('isActive', '==', true)
      .get();
    const jidsSet = new Set<string>();
    
    snap.forEach((docSnap: any) => {
      const data = docSnap.data();
      const associated = data.associatedClasses || [];
      const hasOverlap = associated.some((cId: string) => classIds.includes(cId));
      if (hasOverlap && data.communityJid) {
        jidsSet.add(data.communityJid.trim());
      }
    });
    return Array.from(jidsSet);
  } catch (error) {
    console.error("[databaseResolution] Error in getCommunityJidForClasses:", error);
    return [];
  }
}

/**
 * Writes execution logs into a separate whatsapp_broadcast_logs tracking document.
 */
export async function logBroadcastExecution(broadcastPayload: {
  messageText: string;
  classIds: string[];
  targetJids: string[];
  sentAt: string;
  senderId?: string;
  status: 'success' | 'failed' | 'partial';
  error?: string;
}): Promise<string | null> {
  try {
    const dbAdmin = getDbAdmin();
    const docRef = await dbAdmin.collection('whatsapp_broadcast_logs').add({
      ...broadcastPayload,
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    console.error("[databaseResolution] Error logging broadcast execution:", error);
    return null;
  }
}

