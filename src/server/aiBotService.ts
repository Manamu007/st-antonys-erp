import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
console.log("[AIBot] Loading module...");
import { getDbAdmin, initializationPromise } from "./firebaseAdmin.js";
import { createLeaveActionTokens } from "./whatsappUtils.js";

let ai: GoogleGenAI | null = null;
const SMART_BOT_INSTRUCTIONS = `You are St. Antony's School Smart Bot, the highly advanced AI Agent for the school's WhatsApp and ERP messaging.
You are bilingual (English/Telugu) and have direct access to the school's ERP database.

Strict Safety and Privacy Rules:
- STRICT PRIVACY FOR PARENTS & STUDENTS: If the sender is a parent or student (indicated in sender profile), you are strictly restricted to responding only to queries that fall within the exact student records associated with the student IDs linked to their profile as declared in the verified context (e.g., 'myStudents' or linked students in the context). Under no circumstances should any parent or student be permitted to query other students' names, history, marks, or attendance records. If they attempt to ask about any other student, refuse politely but firmly.
- UNRESTRICTED ACCESS FOR STAFF & ADMINS: If the sender is a school staff member, teacher, clerk, accountant, vice principal, or administrator (e.g., role is admin, teacher, clerk, accountant, vice_principal, staff), they have full authorized administrative access! They are allowed to query, search, and view ANY student, class, fees, examMarks, payments, or attendance in the database using the queryERP tool. Do NOT apply parent privacy or restriction rules to staff and admins.
- PUBLIC INFORMATION: General school information such as upcoming school holidays, calendar dates, notices, contact details, or generic fee structures are public, and can be shared with anyone (parents, students, and staff alike).
- GROUNDING & NO HALLUCINATION: NEVER invent, hallucinate, mock, or guess any student records, fees, marks, or attendance data. First, use the queryERP tool or context data to fetch the details. 
- HANDLING MISSING DB RECORDS: If a student/parent is successfully identified but their target data (such as specific Fee, ExamMarks, or Attendance) is not found in the database, do NOT just dump the generic fallback warning. Instead, explain clearly and politely in Telugu/English that the student record has been found, but their specific data has not been posted/registered in the ERP system yet for this academic term (e.g., "Student Freddy was found, but no fee due records are currently registered for them in the ERP. / స్టూడెంట్ ఫీజు వివరాలు ప్రస్తుతం ERPలో నమోదు కాలేదు."). Only if the queried student themselves is completely unknown or the search completely fails, output the bilingual help desk warning: 
  "ఈ సమాచారం ప్రస్తుతం ERPలో అందుబాటులో లేదు. దయచేసి స్కూల్ ఆఫీస్ను సంప్రదించండి. / This information is currently not available in the ERP. Please contact the school office."
- SIBLINGS & MULTIPLE STUDENTS (ACTIVE STATE): If multiple children (siblings) are linked to the parent's phone number as declared in the context, check if "activeStudent" is specified in the context object. If "activeStudent" is active, you MUST answer all details (attendance, fees, marks, or homework) specifically for that active student (and do not mix/dump information of other siblings). If they mention another sibling by name or ask to switch/change student or query about a different sibling's name, respond with their details instead. If no student is selected as active ("activeStudent" is missing/empty) and they ask a general question (e.g., "how is my child's attendance?"), you MUST prompt them with the names of all their linked children (e.g., "1. Child X and 2. Child Y") and ask them to select.

Holiday & Working Status Resolution Guidelines:
- Inside the context, 'todayDate' is provided as YYYY-MM-DD.
- To determine if a specific date (todayDate, tomorrowDate, or user-query date) is a holiday or a working day:
  1. Check if the date lies within any holiday in the 'holidays' array (i.e. date is between the holiday's 'date' and 'toDate' range). If yes, it is definitely a school holiday due to that title!
  2. Check if the date is in June but before the 12th (the school reopens on June 12th). If the date is between June 1st and June 11th, it is a School Reopen Holiday.
  3. Check if the day is Sunday. Sundays are always closed/holidays (ఆదివారం పాఠశాల సెలవు దినం).
  4. Check if the day is the second Saturday of the month. To find if a date is the second Saturday: the day of the week is Saturday, and the date day number falls strictly between 8 and 14 inclusive (e.g., YYYY-MM-08 to YYYY-MM-14). Second Saturdays are always official holidays!
  5. If not marked in academic holidays and not a weekend, check if it matches standard public holidays of India/Andhra Pradesh (e.g., Sankranti, Republic Day, Independence Day, Gandhi Jayanti, Diwali, Christmas, etc.).
  6. If none of the holiday rules match, it is a regular school working day!

Capabilities:
- Real-time ERP Data access: Use the queryERP tool to fetch information about students, attendance, fees, exams, staff, and holidays.
- Context Awareness: You can see the sender's details and their linked students (allMatchedUsers/students) in the context.
- Natural Chat: Converse naturally. Use names like {name} or child names from context.

Guidelines:
- BRAIN FIRST: If a parent or admin asks a natural question, answer it directly using context or tool data. Do not just output static links.
- DATA LOOKUP: Always fetch data using queryERP if you don't have the specific requested info in the 'myStudents' field or context.
- PARENTING: For parents, you are their assistant. Help them track their child's progress.
- IDENTIFY INTENT: Understand if they are asking about fees, attendance, or wanting a general update.
- ACCURACY: Never guess data. If information is missing, be honest.
- TONE: Professional, friendly, and helpful. Use emojis (🏫, 📚, ✅).`;

const erpTools: FunctionDeclaration[] = [
  {
    name: "queryERP",
    description: "Query the school ERP database for information.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        collectionName: { 
          type: Type.STRING, 
          description: "Collection: 'users', 'attendance', 'fees', 'examMarks', 'notices', 'classes', 'subjects', 'homework', 'leaves', 'holidays'." 
        },
        filters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              field: { type: Type.STRING },
              value: { type: Type.STRING },
              operator: { type: Type.STRING, description: "Default is '=='." }
            },
            required: ["field", "value"]
          }
        },
        limit: { type: Type.NUMBER, description: "Max results (default 10)" }
      },
      required: ["collectionName"]
    }
  },
  {
    name: "applyLeave",
    description: "Submit a leave application for a student or staff member.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        applicantId: { type: Type.STRING },
        applicantName: { type: Type.STRING },
        applicantRole: { type: Type.STRING, enum: ["student", "teacher", "staff", "clerk", "accountant"] },
        classId: { type: Type.STRING, description: "Required if applicant is a student" },
        startDate: { type: Type.STRING, description: "ISO date YYYY-MM-DD" },
        endDate: { type: Type.STRING, description: "ISO date YYYY-MM-DD" },
        leaveType: { type: Type.STRING, enum: ["CL", "SL", "PL", "ML", "Other"] },
        reason: { type: Type.STRING }
      },
      required: ["applicantId", "applicantName", "applicantRole", "startDate", "endDate", "leaveType", "reason"]
    }
  },
  {
    name: "manageLeaveRequest",
    description: "Approve or reject a leave request (Admin/VP only).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        leaveId: { type: Type.STRING },
        status: { type: Type.STRING, enum: ["approved", "rejected"] },
        approverId: { type: Type.STRING },
        approverName: { type: Type.STRING },
        rejectionReason: { type: Type.STRING, description: "Optional reason if rejected" }
      },
      required: ["leaveId", "status", "approverId", "approverName"]
    }
  }
];

function replaceMenuVariables(text: string, user: any, context: any) {
  let result = text;
  const replacements: Record<string, string> = {
    '{name}': user?.name || '',
    '{fatherName}': user?.fatherName || '',
    '{slug}': user?.slug || user?.admissionNumber || '',
    '{class}': user?.className || context?.className || '',
    '{batch}': user?.batchName || context?.batchName || '',
    '{rollNumber}': user?.rollNumber || ''
  };
  Object.entries(replacements).forEach(([key, val]) => {
    result = result.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), val || '');
  });
  return result;
}

export const getSmartBotResponse = async (query: string, context: string) => {
  console.log(`[AIBot] getSmartBotResponse called with query: "${query}"`);
  let key = (process.env.GEMINI_API_KEY || '').trim();
  // Remove potential surrounding quotes from env var
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.substring(1, key.length - 1).trim();
  }
  let customInstructions = '';
  let aiEnabled = true;

  // Mask common placeholder keys
  const isPlaceholder = (k: string) => {
    if (!k) return true;
    const pk = k.toLowerCase().trim();
    return (
      pk === 'undefined' || 
      pk === 'null' || 
      pk === '' ||
      pk.includes('your_') || 
      pk.includes('my_gemini_api_key') || 
      pk.includes('api_key_here') || 
      pk.length < 15
    );
  };

  try {
    await initializationPromise;
    const db = getDbAdmin();
    if (db) {
      const cleanQuery = query.toLowerCase().trim();
      
      // Fetch school settings
      const settingsSnap = await db.collection("settings").doc("school").get();
      const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
      aiEnabled = settingsData?.aiAgentEnabled !== false;
      customInstructions = settingsData?.aiBotInstructions || '';
      
      const schoolKey = settingsData?.aiApiKey;
      if (schoolKey && typeof schoolKey === 'string' && schoolKey.trim().length > 20) {
        key = schoolKey.trim();
        console.log(`[AIBot] Using custom School API Key (starts with: ${key.substring(0, 4)}...)`);
      }

      // Check for custom dynamic menus
      const allMenusSnap = await db.collection("whatsapp_bot_menus")
        .where("isActive", "==", true)
        .get();
      
      const matchingMenuDoc = allMenusSnap.docs.find(doc => {
        const menu = doc.data();
        if (!menu.keyword) return false;
        const keywords = menu.keyword.split(",").map((k: string) => k.trim().toLowerCase());
        // Lenient matching: trigger if the query contains any of the keywords as a whole word
        return keywords.some(k => {
          if (k.length <= 2) return cleanQuery === k; // Exact for very short keywords
          const regex = new RegExp(`\\b${k}\\b`, 'i');
          return regex.test(cleanQuery);
        });
      });
      
      if (matchingMenuDoc) {
        const menu = matchingMenuDoc.data();
        let responseText = menu.responseText || "";
        
        // Dynamic Variable Replacement
        let ctxPayload: any = {};
        try { ctxPayload = JSON.parse(context); } catch(e) {}
        
        const replacements: Record<string, string> = {
          '{name}': '',
          '{studentName}': '',
          '{fatherName}': '',
          '{parentName}': '',
          '{class}': ctxPayload.className || 'N/A',
          '{batch}': ctxPayload.batchName || 'N/A',
          '{rollNumber}': '',
          '{admissionNumber}': ''
        };

        const u = ctxPayload.user || ctxPayload.sender || {};
        replacements['{name}'] = u.name || ctxPayload.sender?.name || '';
        replacements['{studentName}'] = u.name || '';
        replacements['{fatherName}'] = u.fatherName || u.parentName || '';
        replacements['{parentName}'] = u.parentName || u.fatherName || '';
        replacements['{rollNumber}'] = u.rollNumber || '';
        replacements['{admissionNumber}'] = u.admissionNumber || '';

        // If it's a parent, try to find the first child's name if not set
        if (ctxPayload.sender?.role === 'parent' && !replacements['{studentName}'] && ctxPayload.students && ctxPayload.students.length > 0) {
          replacements['{studentName}'] = ctxPayload.students[0].name;
          replacements['{class}'] = ctxPayload.students[0].className || replacements['{class}'];
        }

        Object.entries(replacements).forEach(([key, val]) => {
          const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          responseText = responseText.replace(regex, val || '');
        });
        
        const response: any = { text: responseText };
        if (menu.buttons && menu.buttons.length > 0) {
          // Append hint if buttons are present
          if (!responseText.includes("Select Option")) {
            response.text = responseText + "\n\n(Please select an option from the menu below ⤵️)";
          }
          
          response.options = {
            buttons: menu.buttons.map((b: any) => ({
              buttonId: b.id || Math.random().toString(36).substring(7),
              buttonText: { displayText: b.text },
              type: 1
            }))
          };
        }
        return JSON.stringify(response);
      }
    }
  } catch(e) {
    console.error("[AIBot] Error in settings or menu lookup:", e);
  }

  // Local function for basic offline mode
  const runBasicMode = () => {
    const q = query.toLowerCase().trim();
    let ctxPayload: any = {};
    try { ctxPayload = JSON.parse(context); } catch(e) {}

    const createButtonMenu = (text: string) => {
      return JSON.stringify({
        text,
        options: {
          buttons: [
            { id: 'today', text: 'Today Working?' },
            { id: 'holidays', text: 'Holidays' },
            { id: 'fees', text: 'Fees' },
            { id: 'attendance', text: 'Attendance' },
            { id: 'marks', text: 'Marks' }
          ].map(b => ({ buttonId: b.id, buttonText: { displayText: b.text }, type: 1 }))
        }
      });
    };

    const activeStudent = ctxPayload.activeStudent || (ctxPayload.myStudents && ctxPayload.myStudents[0]);

    // 1. GREETINGS & MENU HELP
    if (['hello', 'hi', 'hey', 'namaste', 'నమస్కారం', 'హలో', 'menu', 'help', 'సహాయం', 'మెనూ'].some(g => q === g)) {
      const welcomeName = ctxPayload.user?.name || ctxPayload.sender?.name || 'User';
      return createButtonMenu(`🏫 *Welcome, ${welcomeName}!* \n\nI am currently operating in *Basic Auto-Bot Mode* (Gemini AI is switched off or unavailable).\n\nSelect an option below or type your request (e.g., "fees", "attendance", "marks", "holidays", "today working"). / ఏ సమాచారం కావాలో ఎంచుకోవడానికి క్రింది బటన్లపై క్లిక్ చేయండి.`);
    }

    // 2. FEES & PAYMENTS
    if (q.includes('fee') || q.includes('payment') || q.includes('fess') || q.includes('ఫీజు')) {
      if (activeStudent) {
        const fees = activeStudent.fees || [];
        const payments = activeStudent.payments || [];
        
        let totalTermFee = 0;
        let totalPaid = 0;
        
        fees.forEach((f: any) => {
          totalTermFee += Number(f.amount || f.totalAmount || 0);
        });
        
        payments.forEach((p: any) => {
          if (p.status?.toLowerCase() === 'success' || p.status?.toLowerCase() === 'paid') {
            totalPaid += Number(p.amount || 0);
          }
        });
        
        const balance = totalTermFee - totalPaid;
        const dueText = balance > 0 ? `🔴 *Pending Balance:* ₹${balance}` : `🟢 *No Pending Balance*`;
        
        let paymentsList = '';
        if (payments.length > 0) {
          paymentsList = `\n\n*Recent Payments / ఇటీవలి చెల్లింపులు:*\n` + payments.slice(0, 3).map((p: any) => {
            return `📅 ${p.date || p.paymentDate || 'N/A'}: ₹${p.amount} (${p.purpose || p.feeType || 'Fee'}) - ${p.status?.toUpperCase()}`;
          }).join('\n');
        }
        
        return JSON.stringify({
          text: `💰 *Fee details for ${activeStudent.name}:*\n\n` +
                `🔹 *Total Term Fee:* ₹${totalTermFee}\n` +
                `🔹 *Total Paid:* ₹${totalPaid}\n` +
                `${dueText}` +
                paymentsList + 
                `\n\nIf you have any queries regarding payments, please contact the school accountant.`,
          options: {
            buttons: [
              { buttonId: 'fees', buttonText: { displayText: 'Refresh Fees' }, type: 1 },
              { buttonId: 'menu', buttonText: { displayText: 'Main Menu' }, type: 1 }
            ]
          }
        });
      } else {
        return JSON.stringify({ text: "Fee details are not available. Please register or select your child first." });
      }
    }

    // 3. ATTENDANCE SUMMARY
    if (q.includes('attendance') || q.includes('absent') || q.includes('present') || q.includes('హాజరు')) {
      if (activeStudent) {
        const attendance = activeStudent.attendance || [];
        
        if (attendance.length > 0) {
          const totalDays = attendance.length;
          const presentCount = attendance.filter((a: any) => a.status?.toLowerCase() === 'present').length;
          const percentage = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 100;
          
          let lastAttendanceList = `\n\n*Recent Days:*`;
          attendance.slice(0, 5).forEach((a: any) => {
            const dateStr = a.date || 'N/A';
            const statusLabel = a.status?.toLowerCase() === 'present' ? '🟢 Present' : '🔴 Absent';
            lastAttendanceList += `\n📅 ${dateStr}: ${statusLabel}`;
          });
          
          return JSON.stringify({
            text: `📊 *Attendance Summary for ${activeStudent.name}:*\n\n` +
                  `🔹 *Total Tracked Academic Days:* ${totalDays}\n` +
                  `🔹 *Present Days:* ${presentCount}\n` +
                  `🔹 *Attendance Rate:* *${percentage}%*` +
                  lastAttendanceList,
            options: {
              buttons: [
                { buttonId: 'attendance', buttonText: { displayText: 'Refresh Attendance' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: 'Main Menu' }, type: 1 }
              ]
            }
          });
        } else {
          return JSON.stringify({
            text: `📊 *Attendance for ${activeStudent.name}:*\n\nNo structured attendance records entered yet of this student in ERP database template.`
          });
        }
      } else {
        return JSON.stringify({ text: "Attendance records are not available. Please contact the school support team." });
      }
    }

    // 4. EXAM MARKS
    if (q.includes('marks') || q.includes('exam') || q.includes('results') || q.includes('score') || q.includes('మార్కులు')) {
      if (activeStudent) {
        const marks = activeStudent.marks || [];
        if (marks.length > 0) {
          const examsMap: Record<string, any[]> = {};
          marks.forEach((m: any) => {
            const exName = m.examName || m.exam || 'General Exam';
            if (!examsMap[exName]) examsMap[exName] = [];
            examsMap[exName].push(m);
          });
          
          let responseText = `📝 *Exam Marks Status for ${activeStudent.name}:*\n`;
          Object.entries(examsMap).forEach(([examName, list]) => {
            responseText += `\n*🏆 ${examName.toUpperCase()}:*`;
            list.forEach((m: any) => {
              const obt = m.marks ?? m.marksObtained;
              const max = m.maxMarks || 100;
              const minMark = m.minMarks || 35;
              const resultLabel = obt >= minMark ? 'PASS' : 'FAIL';
              responseText += `\n🔹 ${m.subject || 'Subject'}: *${obt}/${max}* (${resultLabel})`;
            });
          });
          
          return JSON.stringify({
            text: responseText,
            options: {
              buttons: [
                { buttonId: 'marks', buttonText: { displayText: 'Refresh Marks' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: 'Main Menu' }, type: 1 }
              ]
            }
          });
        } else {
          return JSON.stringify({ text: `📝 *Exam Marks for ${activeStudent.name}:*\n\nNo recent exam marks records found in the database. Marks may not have been posted yet.` });
        }
      } else {
        return JSON.stringify({ text: "Marks records are not available. Please register or contact the class teacher." });
      }
    }

    // 5. TODAY / TOMORROW WORKING STATUS
    const isTomorrow = q.includes('tomorrow') || q.includes('రేపు');
    const isYesterday = q.includes('yesterday') || q.includes('నిన్న');
    const isToday = q.includes('today') || q.includes('ఈరోజు') || q.includes('నేడు') || q.includes('ఇవాళ');
    const hasWorkingOrSchedule = q.includes('working') || q.includes('schedule') || q.includes('సెలవా') || q.includes('పనిదినమా') || q.includes('స్కూల్ ఉందా') || q.includes('హాలిడే');

    if (isTomorrow || isYesterday || (isToday && (hasWorkingOrSchedule || q.includes('holiday') || q.includes('సెలవు'))) || (hasWorkingOrSchedule && (q.includes('today') || q.includes('tomorrow') || q.includes('yesterday')))) {
      const targetQueryDate = isTomorrow ? ctxPayload.tomorrowDate : (isYesterday ? ctxPayload.yesterdayDate : ctxPayload.todayDate);
      const dayLabel = isTomorrow ? 'Tomorrow' : (isYesterday ? 'Yesterday' : 'Today');
      const dayLabelTelugu = isTomorrow ? 'రేపు' : (isYesterday ? 'నిన్న' : 'ఈరోజు');
      
      const holidays = ctxPayload.holidays || [];
      const matchingHoliday = holidays.find((h: any) => targetQueryDate >= h.date && targetQueryDate <= (h.toDate || h.date));
      
      let resText = '';
      if (matchingHoliday) {
        resText = `🗓️ *${dayLabel} Status / ${dayLabelTelugu} పాఠశాల సమాచారం:* \n\n❌ School is *CLOSED* on ${targetQueryDate} due to: *${matchingHoliday.title}* (${matchingHoliday.description || 'Holiday'}).\n\n(${matchingHoliday.title} సందర్భంగా పాఠశాల సెలవు దినం.)`;
      } else {
        // Parse date for school reopen and second Saturday rules
        let isReopenHoliday = false;
        try {
          const parts = targetQueryDate.split('-');
          if (parts.length === 3) {
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (m === 6 && d < 12) {
              isReopenHoliday = true;
            }
          }
        } catch(e) {}

        if (isReopenHoliday) {
          resText = `🗓️ *${dayLabel} Status / ${dayLabelTelugu} పాఠశాల సమాచారం:* \n\n❌ School is *CLOSED* on ${targetQueryDate} as school has not reopened for this term yet (Official reopen day is June 12th).\n\n(పాఠశాల ఇంకా పునఃప్రారంభం కాలేదు. జూన్ 12న పాఠశాల పునఃప్రారంభించబడుతుంది.)`;
        } else {
          const dateObj = new Date(targetQueryDate || new Date());
          const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 6 is Saturday
          const dayOfMonth = dateObj.getDate();
          const isSecSaturday = (dayOfWeek === 6 && dayOfMonth >= 8 && dayOfMonth <= 14);

          if (dayOfWeek === 0) {
            resText = `🗓️ *${dayLabel} Status / ${dayLabelTelugu} పాఠశాల సమాచారం:* \n\n❌ School is *CLOSED* on Sunday (ఆదివారం పాఠశాల సెలవు దినం).`;
          } else if (isSecSaturday) {
            resText = `🗓️ *${dayLabel} Status / ${dayLabelTelugu} పాఠశాల సమాచారం:* \n\n❌ School is *CLOSED* on Second Saturday (రెండవ శనివారం పాఠశాల సెలవు దినం).`;
          } else if (dayOfWeek === 6) {
            resText = `🗓️ *${dayLabel} Status / ${dayLabelTelugu} పాఠశాల సమాచారం:* \n\n⚠️ School is *HALF-DAY* or operates under special Saturday hours (శనివారం అర్ధ దినం మాత్రమే తరగతులు జరుగుతాయి).`;
          } else {
            resText = `🗓️ *${dayLabel} Status / ${dayLabelTelugu} పాఠశాల సమాచారం:* \n\n🟢 School is *OPEN* and running under the standard curriculum schedule (పాఠశాల తెరిచి ఉంటుంది మరియు తరగతులు యధావిధిగా జరుగుతాయి).`;
          }
        }
      }
      
      return JSON.stringify({
        text: resText,
        options: {
          buttons: [
            { buttonId: 'menu', buttonText: { displayText: 'Main Menu' }, type: 1 }
          ]
        }
      });
    }

    // 6. HOLIDAYS LIST
    if (q.includes('holiday') || q.includes('vacation') || q.includes('సెలవులు')) {
      const holidays = ctxPayload.holidays || [];
      if (holidays.length > 0) {
        let holidaysText = `🏖️ *Upcoming Holidays List / పాఠశాల సెలవుల జాబితా:*\n`;
        const sorted = [...holidays].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
        const todayStr = ctxPayload.todayDate || new Date().toISOString().split('T')[0];
        const upcoming = sorted.filter((h: any) => (h.date || h.toDate || '') >= todayStr);
        const listToDisplay = upcoming.length > 0 ? upcoming : sorted;
        
        listToDisplay.slice(0, 8).forEach((h: any) => {
          const dateLabel = h.date === h.toDate ? h.date : `${h.date} to ${h.toDate}`;
          holidaysText += `\n📅 *${dateLabel}* - ${h.title}\n📝 _${h.description || h.type || 'Holiday'}_`;
        });
        
        return JSON.stringify({
          text: holidaysText,
          options: {
            buttons: [
              { buttonId: 'menu', buttonText: { displayText: 'Main Menu' }, type: 1 }
            ]
          }
        });
      } else {
        return JSON.stringify({ text: "🏖️ *Holidays:* No holidays are currently scheduled in the school academic calendar." });
      }
    }

    // 7. HOMEWORK INFORMATION
    if (q.includes('homework') || q.includes('home work') || q.includes('హోంవర్క్')) {
      const activeName = activeStudent ? activeStudent.name : 'your child';
      return JSON.stringify({ 
        text: `📚 *Homework for ${activeName}:*\n\nPlease check the official school mobile app or Student ERP portal for daily homework updates, or contact the class teacher directly. I am currently running in Basic Mode and cannot fetch real-time notebook scans.`,
        options: {
          buttons: [
            { buttonId: 'menu', buttonText: { displayText: 'Main Menu' }, type: 1 }
          ]
        }
      });
    }

    // 8. STAFF DIRECTORY (For staff roles)
    const userRole = ctxPayload.user?.role || ctxPayload.sender?.role || 'parent';
    if (['admin', 'teacher', 'staff', 'clerk', 'accountant', 'vice_principal'].includes(userRole) && (q.includes('staff') || q.includes('directory') || q.includes('teacher'))) {
      const directory = ctxPayload.staffDirectory || [];
      if (directory.length > 0) {
        let dirText = `👤 *School Staff & Teacher Directory:*\n`;
        directory.slice(0, 12).forEach((st: any) => {
          const subjectsLabel = st.subjects && st.subjects.length > 0 ? `(${st.subjects.join(', ')})` : '';
          dirText += `\n• *${st.name}* - ${st.role.replace('_', ' ').toUpperCase()} ${subjectsLabel}`;
        });
        return JSON.stringify({
          text: dirText,
          options: {
            buttons: [
              { buttonId: 'menu', buttonText: { displayText: 'Main Menu' }, type: 1 }
            ]
          }
        });
      }
    }
    
    return createButtonMenu(`I am operating in *Basic Auto-Bot Mode* (AI is disabled).\n\nPlease select one of the options below to query the ERP system:`);
  };

  // Fallback if key is missing, a placeholder, or AI is disabled
  if (!key || isPlaceholder(key) || key === 'undefined' || !aiEnabled) {
    if (key && isPlaceholder(key)) {
      console.warn(`[AIBot] Detected placeholder or invalid API key format: "${key}"`);
    }
    return runBasicMode();
  }

  const systemPrompt = (customInstructions || SMART_BOT_INSTRUCTIONS) + 
    "\n\nCRITICAL: When a user requests leave, ALWAYS use the 'applyLeave' tool. After submission via 'applyLeave', inform them that 'Your leave request is submitted to school authority, wait for approval.'";

  try {
    const aiInstance = new GoogleGenAI({ 
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const modelName = "gemini-2.5-flash"; // Modern, supported, extremely fast and smart

    const contents: any[] = [
      { role: 'user', parts: [{ text: `User: ${query}\n\nContext:\n${context}` }] }
    ];

    const { sendMessage: sendWAMessage } = await import("./whatsapp.js");
    let loopCount = 0;
    const maxLoops = 3;

    while (loopCount < maxLoops) {
      const response = await aiInstance.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: erpTools }],
        },
      } as any);

      const assistantContent = response.candidates?.[0]?.content;
      if (!assistantContent) {
        break;
      }
      contents.push(assistantContent);

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        console.log(`[AIBot] Detected ${functionCalls.length} function calls in loop ${loopCount}.`);
        const toolResponses: any[] = [];

        for (const call of functionCalls) {
          const { name, args, id } = call;
          console.log(`[AIBot] Tool Call: ${name}`, args);
          let toolResult: any;
          const db = getDbAdmin();

          if (name === "queryERP") {
            const { collectionName, filters = [], limit = 10 } = args as any;
            try {
              let queryRef: any = db.collection(collectionName);
              filters.forEach((f: any) => {
                queryRef = queryRef.where(f.field, f.operator || '==', f.value);
              });
              const snap = await queryRef.limit(limit).get();
              toolResult = { documents: snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) };
            } catch (e: any) {
              toolResult = { error: e.message };
            }
          } else if (name === "applyLeave") {
            const argsData = args as any;
            try {
              const settingsSnap = await db.collection("settings").doc("school").get();
              const settings = settingsSnap.data() || {};
              const isStaff = argsData.applicantRole !== 'student';
              
              if (isStaff) {
                const start = new Date(argsData.startDate);
                const monthYearStr = start.toISOString().split('-').slice(0, 2).join('-');
                const holidaysSnap = await db.collection("holidays").get();
                const holidaysInMonth = holidaysSnap.docs.filter(h => h.data().date?.startsWith(monthYearStr));

                if (holidaysInMonth.length > 10 && argsData.leaveType === 'CL') {
                  toolResult = { error: "Casual Leave not available for this month due to high number of scheduled holidays (more than 10)." };
                  toolResponses.push({ functionResponse: { name, response: toolResult, id } });
                  continue;
                }

                if (settings.teacherLeaveQuotaEnabled) {
                  const currentLeavesSnap = await db.collection("leaves").where("status", "==", "approved").get();
                  const allApprovedLeaves = currentLeavesSnap.docs.map(d => d.data());
                  const dateStr = argsData.startDate;
                  const count = allApprovedLeaves.filter(l => l.applicantRole !== 'student' && dateStr >= l.startDate && dateStr <= l.endDate).length;
                  
                  if (count >= 3) {
                    toolResult = { error: "Today's teacher leave quota is full. Try for emergency leave." };
                    toolResponses.push({ functionResponse: { name, response: toolResult, id } });
                    continue;
                  }
                }
              }

              const leaveData = { ...argsData, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              if (!leaveData.whatsappNumber) {
                const userDoc = await db.collection("users").doc(leaveData.applicantId).get();
                leaveData.whatsappNumber = userDoc.data()?.whatsappNumber || "";
              }
              const docRef = await db.collection("leaves").add(leaveData);
              toolResult = { success: true, leaveId: docRef.id };

              // Generate secure one-time action tokens
              const actionTokens = await createLeaveActionTokens(docRef.id);

              // Send confirmation to applicant
              if (leaveData.whatsappNumber) {
                await sendWAMessage(leaveData.whatsappNumber, "Your leave request is submitted to school authority, wait for approval.", {}, 'bot');
              }
              
              // Notify admins/teachers
              const notificationBody = `*New Leave Request* 📄\n\n*From:* ${leaveData.applicantName}\n*Dates:* ${leaveData.startDate} to ${leaveData.endDate}\n*Type:* ${leaveData.leaveType}\n*Reason:* ${leaveData.reason}`;
              const leaveButtons = {
                buttons: [
                  { buttonId: `leave_approve_${actionTokens.approveToken}`, buttonText: { displayText: 'Approve ✅' }, type: 1 },
                  { buttonId: `leave_reject_${actionTokens.rejectToken}`, buttonText: { displayText: 'Reject ❌' }, type: 1 }
                ]
              };
              
              if (leaveData.applicantRole === 'student' && leaveData.classId) {
                const classSnap = await db.collection("classes").doc(leaveData.classId).get();
                const teacherId = classSnap.data()?.classTeacherId;
                if (teacherId) {
                  const teacherSnap = await db.collection("users").doc(teacherId).get();
                  const phone = teacherSnap.data()?.whatsappNumber;
                  if (phone) await sendWAMessage(phone, notificationBody, leaveButtons, 'bot');
                }
              } else {
                const adminsSnap = await db.collection("users").where("role", "in", ["admin", "vice_principal"]).get();
                for (const d of adminsSnap.docs) {
                  const phone = d.data().whatsappNumber;
                  if (phone) await sendWAMessage(phone, notificationBody, leaveButtons, 'bot');
                }
              }
            } catch (e: any) { toolResult = { error: e.message }; }
          } else if (name === "manageLeaveRequest") {
            const { leaveId, status, approverId, approverName, rejectionReason } = args as any;
            try {
              await db.collection("leaves").doc(leaveId).update({
                status, approverId, approverName,
                approvalDate: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                ...(rejectionReason && { rejectionReason })
              });
              toolResult = { success: true };

              // Trigger Teacher Substitution Engine asynchronously
              if (status === 'approved') {
                import('../whatsapp_bot_v2/services/substitutionEngine.js')
                  .then(({ runTeacherSubstitutionEngine }) => {
                    runTeacherSubstitutionEngine(leaveId).catch(err => {
                      console.error('[Substitution Engine] Failed in manageLeaveRequest background execution:', err);
                    });
                  })
                  .catch(err => {
                    console.error('[Substitution Engine] Failed to import substitutionEngine in manageLeaveRequest:', err);
                  });
              }

              const leaveSnap = await db.collection("leaves").doc(leaveId).get();
              const leaveData = leaveSnap.data();
              if (leaveData) {
                const applicantSnap = await db.collection("users").doc(leaveData.applicantId).get();
                const phone = applicantSnap.data()?.whatsappNumber;
                if (phone) {
                  const msg = `*Leave Request ${status.toUpperCase()}* ${status === 'approved' ? '✅' : '❌'}\n\nYour leave for ${leaveData.startDate} to ${leaveData.endDate} has been ${status} by ${approverName}.`;
                  await sendWAMessage(phone, msg, {}, 'bot');
                }
              }
            } catch (e: any) { toolResult = { error: e.message }; }
          }

          toolResponses.push({ functionResponse: { name, response: toolResult, id } });
        }

        contents.push({ role: 'user', parts: toolResponses });
        loopCount++;
      } else {
        // No function calls, we are done!
        console.log("[AIBot] Final text output:", response.text);
        return response.text || "I've processed your request.";
      }
    }

    // fallback return if exceeded maximum loops
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      console.log("[AIBot] Loop limit reached under unresolved tool responses. Making one final generation call...");
      try {
        const finalResponse = await aiInstance.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: systemPrompt,
          },
        } as any);
        return finalResponse.text || "I've processed your request.";
      } catch (finalErr: any) {
        console.error("Error making final generation after tool responses:", finalErr.message);
      }
    }

    const lastResponseText = contents[contents.length - 1]?.parts?.[0]?.text;
    return lastResponseText || "I've processed your request.";
  } catch (error: any) {
    console.error("Smart Bot Error (falling back to Basic Auto-Bot Mode):", error);
    return runBasicMode();
  }
};
