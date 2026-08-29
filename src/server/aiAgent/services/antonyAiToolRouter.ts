import { getDbAdmin } from '../../firebaseAdmin.js';
import { UserCredentials, enforceIsolationFilters } from './antonyAiPermissionService.js';
import { redactObject } from '../utils/antonyAiRedactionUtils.js';

export interface ExecutedToolResult {
  toolName: string;
  data: any;
  permissionsUsed: string;
  sources: string[];
}

/**
 * Executes a safe, role-validated predefined data fetcher tool based on user authority.
 */
export async function executeAiTool(
  toolName: string,
  args: any,
  creds: UserCredentials
): Promise<ExecutedToolResult> {
  const db = getDbAdmin();
  if (!db) {
    throw new Error("ERP Firebase Admin SDK is not available.");
  }

  const { role, userId, schoolId, hospitalId } = creds;
  const upRole = role.toUpperCase();

  console.log(`[AI Tool Router] Executing action '${toolName}' for user '${userId}' (${role}) at school '${schoolId}'...`);

  let dataResult: any = null;
  let permissionString = "";
  const sourcesList: string[] = [];

  switch (toolName) {
    // 1. Fetch Student Summary
    case "getStudentSummary": {
      const { searchQuery, classId, studentId } = args;
      permissionString = `STUDENT_READ_LIMITED_${upRole}`;

      // Enforce who can query students:
      // Parents can only query their own child ID
      // Students can only query their own student ID
      // Admin/Teacher can run broader queries
      let queryRef: any = db.collection('students');

      if (upRole === "PARENT" || upRole === "GUARDIAN") {
        // Query parent's students directly from securely derived linkedStudentIds
        const studentIds: string[] = creds.linkedStudentIds || [];

        if (studentId && !studentIds.includes(studentId)) {
          return {
            toolName,
            data: { error: "Access Denied: Requested student is not linked to your parent account." },
            permissionsUsed: permissionString,
            sources: []
          };
        }

        if (studentId) {
          queryRef = queryRef.where('id', '==', studentId);
        } else if (studentIds.length > 0) {
          // If no specific student query but multiple exist, pull all of them
          queryRef = queryRef.where('id', 'in', studentIds.slice(0, 10));
        } else {
          return {
            toolName,
            data: { message: "No registered students found associated with this parent account." },
            permissionsUsed: permissionString,
            sources: []
          };
        }
      } else if (upRole === "STUDENT") {
        queryRef = queryRef.where('id', '==', userId);
      } else {
        // Teachers / Admins / Accountants / Wardens can query
        queryRef = queryRef.where('schoolId', '==', schoolId);
        
        if (studentId) {
          queryRef = queryRef.where('id', '==', studentId);
        } else if (classId) {
          queryRef = queryRef.where('classId', '==', classId);
        }
      }

      const snap = await queryRef.limit(15).get();
      const records = snap.docs.map((doc: any) => ({ uid: doc.id, ...doc.data() }));

      // If search query is present (name matching/roll matching) for broad roles, filter
      let filtered = records;
      if (searchQuery && (upRole === "ADMIN" || upRole === "SUPER_ADMIN" || upRole === "TEACHER" || upRole === "PRINCIPAL")) {
        const term = searchQuery.toLowerCase();
        filtered = records.filter((r: any) => 
          (r.name && r.name.toLowerCase().includes(term)) ||
          (r.admissionNumber && r.admissionNumber.toLowerCase().includes(term)) ||
          (r.rollNumber && r.rollNumber.toLowerCase().includes(term)) ||
          (r.fatherName && r.fatherName.toLowerCase().includes(term))
        );
      }

      dataResult = filtered.map(r => redactObject({
        id: r.id || r.uid,
        name: r.name,
        className: r.className,
        classId: r.classId,
        batchName: r.batchName,
        rollNumber: r.rollNumber,
        admissionNumber: r.admissionNumber,
        fatherName: r.fatherName,
        parentPhone: r.parentPhone || r.mobile,
        hostelResident: r.hostelResident || false,
        roomNumber: r.roomNumber || "N/A"
      }));

      filtered.forEach((r: any) => {
        sourcesList.push(`student_record:${r.name} (${r.admissionNumber || r.id})`);
      });
      break;
    }

    // 2. Fetch Student Attendance summary
    case "getStudentAttendance": {
      const { studentId, classId, date } = args;
      permissionString = `ATTENDANCE_READ_${upRole}`;

      // Check access limit
      if (upRole === "STUDENT" && studentId !== userId) {
        return {
          toolName,
          data: { error: "Access Denied: Students can only view their own attendance details." },
          permissionsUsed: permissionString,
          sources: []
        };
      }

      if ((upRole === "PARENT" || upRole === "GUARDIAN") && studentId && !(creds.linkedStudentIds || []).includes(studentId)) {
        return {
          toolName,
          data: { error: "Access Denied: You do not have permission to view this student's attendance." },
          permissionsUsed: permissionString,
          sources: []
        };
      }

      let attQuery: any = db.collection('attendance').where('schoolId', '==', schoolId);
      
      if (studentId) {
        attQuery = attQuery.where('studentId', '==', studentId);
      } else if (classId) {
        attQuery = attQuery.where('classId', '==', classId);
      }

      if (date) {
        attQuery = attQuery.where('date', '==', date);
      }

      const snap = await attQuery.limit(30).get();
      const records = snap.docs.map((doc: any) => doc.data());

      dataResult = records.map((r: any) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        classId: r.classId,
        className: r.className,
        date: r.date,
        status: r.status, // "present", "absent", "leave"
        reason: r.reason || ""
      }));

      records.forEach((r: any) => {
        sourcesList.push(`attendance_record:${r.studentName}_${r.date}`);
      });
      break;
    }

    // 3. Fetch Student Fees / Billing details (Restricted based on role checks in permission service)
    case "getStudentFees": {
      const { studentId } = args;
      permissionString = `FINANCE_READ_${upRole}`;

      // Only Admin, Accountant, Parent (for own kid), or Student (for own data) can view fees details
      const canAccess = upRole === "ADMIN" || upRole === "SUPER_ADMIN" || upRole === "ACCOUNTANT" || upRole === "PRINCIPAL" ||
                       ((upRole === "PARENT" || upRole === "GUARDIAN") && studentId && (creds.linkedStudentIds || []).includes(studentId)) ||
                       (upRole === "STUDENT" && studentId === userId);

      if (!canAccess) {
        return {
          toolName,
          data: { error: "Access Denied: You do not have permission to view private school billing/fee structures." },
          permissionsUsed: permissionString,
          sources: []
        };
      }

      let feesQuery: any = db.collection('fees').where('schoolId', '==', schoolId);
      if (studentId) {
        feesQuery = feesQuery.where('studentId', '==', studentId);
      }

      const snap = await feesQuery.limit(20).get();
      const records = snap.docs.map((doc: any) => doc.data());

      dataResult = redactObject(records.map((r: any) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        billingCycle: r.billingCycle,
        amountDue: r.amountDue || r.dueAmount || 0,
        amountPaid: r.amountPaid || r.paidAmount || 0,
        totalAmount: r.totalAmount || 0,
        status: r.status, // "PAID", "PENDING", "PARTIAL"
        termName: r.termName || "General",
        dueDate: r.dueDate || "N/A"
      })));

      records.forEach((r: any) => {
        sourcesList.push(`fees_record:${r.studentName}_${r.termName || 'General'}`);
      });
      break;
    }

    // 4. Fetch Health Card and bills (Segregated by hospitalId for Hospital Users!)
    case "getHealthCardAndBills": {
      const { studentId, billId } = args;
      permissionString = `HEALTH_CARD_READ_${upRole}`;

      // Check access permission: Hospital Users can only query files matching their hospitalId
      const isHospitalRole = upRole === "HOSPITAL" || upRole === "HOSPITAL_USER" || upRole === "DOCTOR";
      if (isHospitalRole && !hospitalId) {
        return {
          toolName,
          data: { error: "Access Denied: Missing partner hospital registration context." },
          permissionsUsed: permissionString,
          sources: []
        };
      }

      if (upRole === "STUDENT" && studentId && studentId !== userId) {
        return {
          toolName,
          data: { error: "Access Denied: Students can only view their own health records." },
          permissionsUsed: permissionString,
          sources: []
        };
      }

      if ((upRole === "PARENT" || upRole === "GUARDIAN") && studentId && !(creds.linkedStudentIds || []).includes(studentId)) {
        return {
          toolName,
          data: { error: "Access Denied: You do not have permission to view this student's health records." },
          permissionsUsed: permissionString,
          sources: []
        };
      }

      let queryRef: any = db.collection('student_health_bills').where('schoolId', '==', schoolId);

      if (isHospitalRole) {
        // Enforce strict hospital isolation filter!
        queryRef = queryRef.where('hospitalId', '==', hospitalId);
      }

      if (studentId) {
        queryRef = queryRef.where('studentId', '==', studentId);
      }
      if (billId) {
        queryRef = queryRef.where('id', '==', billId);
      }

      const snap = await queryRef.limit(25).get();
      const records = snap.docs.map((doc: any) => doc.data());

      // If requested student health account details, load ledger balances
      let accountBalance: any = null;
      if (studentId) {
        const accSnap = await db.collection('student_health_accounts')
          .where('schoolId', '==', schoolId)
          .where('studentId', '==', studentId)
          .get();
        if (!accSnap.empty) {
          const acc = accSnap.docs[0].data();
          accountBalance = {
            studentId: acc.studentId,
            studentName: acc.studentName,
            cardStatus: acc.cardStatus || "ACTIVE",
            cardLimit: acc.cardLimit || 0,
            cardBalance: acc.cardBalance || 0,
            spentLimit: acc.spentLimit || 0
          };
        }
      }

      dataResult = {
        bills: records.map((r: any) => ({
          billId: r.id || r.billId,
          studentName: r.studentName,
          studentId: r.studentId,
          hospitalId: r.hospitalId,
          hospitalName: r.hospitalName,
          totalAmount: r.totalAmount,
          deductedFromHealthCard: r.deductedFromHealthCard,
          extraPayableAmount: r.extraPayableAmount,
          status: r.status, // "APPROVED", "PENDING_ADMIN_REVIEW", "REJECTED"
          date: r.date
        })),
        healthCardAccount: accountBalance
      };

      records.forEach((r: any) => {
        sourcesList.push(`health_bill:${r.id || 'bill'}`);
      });
      break;
    }

    // 5. General announcements and school holiday tools
    case "getSchoolInformation": {
      permissionString = `SCHOOL_INFO_READ_${upRole}`;
      
      const noticesSnap = await db.collection('notices')
        .where('schoolId', '==', schoolId)
        .limit(10).get();
      const notices = noticesSnap.docs.map((d: any) => d.data());

      const holidaysSnap = await db.collection('holidays')
        .limit(10).get();
      const holidays = holidaysSnap.docs.map((d: any) => d.data());

      dataResult = {
        announcements: notices.map((n: any) => ({
          title: n.title,
          content: n.content,
          date: n.createdAt || n.date
        })),
        upcomingHolidays: holidays.map((h: any) => ({
          name: h.name,
          date: h.date,
          day: h.day || ""
        }))
      };

      sourcesList.push("school_notices_and_holidays");
      break;
    }

    default:
      throw new Error(`Tool name '${toolName}' is not supported or restricted.`);
  }

  return {
    toolName,
    data: dataResult || [],
    permissionsUsed: permissionString,
    sources: Array.from(new Set(sourcesList))
  };
}
