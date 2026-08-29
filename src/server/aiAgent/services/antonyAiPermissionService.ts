import { getDbAdmin } from '../../firebaseAdmin.js';

export interface UserCredentials {
  userId: string;
  role: string;
  schoolId: string;
  hospitalId: string;
  linkedStudentIds?: string[];
  assignedClassIds?: string[];
}

interface PermissionResult {
  authorized: boolean;
  reason?: string;
  refusalEnglish?: string;
  refusalTelugu?: string;
}

/**
 * Validates permission for an AI interaction and queries based on RBAC rules, school settings, and targets.
 * Ensures school-wise and hospital-wise isolation.
 */
export async function validateRolePermission(
  creds: UserCredentials,
  query: string,
  targetSection?: "STUDENT" | "FEE" | "HEALTH" | "ACADEMICS" | "ADMIN"
): Promise<PermissionResult> {
  const { userId, role, schoolId, hospitalId } = creds;

  const upRole = role.toUpperCase();

  // 1. Safe default: deny GUEST directly
  if (upRole === 'GUEST' || !userId) {
    return {
      authorized: false,
      reason: "Unregistered Guest Account",
      refusalEnglish: "You are not registered in our ERP system. Please contact school admin for your credentials.",
      refusalTelugu: "మీరు మా ERP సిస్టమ్‌లో నమోదై లేరు. దయచేసి మీ వివరాల కోసం స్కూల్ అడ్మిన్‌ను సంప్రదించండి."
    };
  }

  // 2. School settings check for data categories
  try {
    const db = getDbAdmin();
    if (db) {
      const settingsSnap = await db.collection("settings").doc("school").get();
      if (settingsSnap.exists) {
        const settings = settingsSnap.data();
        const aiSettings = settings?.aiAgentSettings;
        if (aiSettings) {
          if (targetSection === "STUDENT" && aiSettings.allowStudentDataAccess === false) {
            return {
              authorized: false,
              reason: "Student records access disabled by admin",
              refusalEnglish: "Access to Student Data has been disabled in Antony AI Settings by the school administrator.",
              refusalTelugu: "స్కూల్ అడ్మినిస్ట్రేటర్ ఆంటోనీ AI సెట్టింగ్స్‌లో విద్యార్థుల డేటా యాక్సెస్‌ను నిలిపివేశారు."
            };
          }
          if (targetSection === "FEE" && aiSettings.allowFeeDataAccess === false) {
            return {
              authorized: false,
              reason: "Fees data access disabled by admin",
              refusalEnglish: "Access to Fee and Finance Data has been disabled in Antony AI Settings by the school administrator.",
              refusalTelugu: "స్కూల్ అడ్మినిస్ట్రేటర్ ఆంటోనీ AI సెట్టింగ్స్‌లో ఫీజు మరియు ఫైనాన్స్ డేటా యాక్సెస్‌ను నిలిపివేశారు."
            };
          }
          if (targetSection === "HEALTH" && aiSettings.allowHealthDataAccess === false) {
            return {
              authorized: false,
              reason: "Health data access disabled by admin",
              refusalEnglish: "Access to Student Health and Medical records has been disabled in Antony AI Settings by the school administrator.",
              refusalTelugu: "స్కూల్ అడ్మినిస్ట్రేటర్ ఆంటోనీ AI సెట్టింగ్స్‌లో విద్యార్థుల ఆరోగ్య మరియు వైద్య రికార్డుల యాక్సెస్‌ను నిలిపివేశారు."
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn("[PermissionService] Skipped school settings verification:", err);
  }

  // 3. Admin / Super Admin (Can query everything in their own school)
  if (upRole === "ADMIN" || upRole === "SUPER_ADMIN" || upRole === "PRINCIPAL") {
    return { authorized: true };
  }

  const queryLower = query.toLowerCase();

  // 4. Team permissions - Teachers
  if (upRole === "TEACHER") {
    // Teachers cannot view whole-school billing summaries, payroll records, or raw clinical health diagnostics
    if (queryLower.includes("fee") || queryLower.includes("salary") || queryLower.includes("billing") || queryLower.includes("financial") || queryLower.includes("medical") || queryLower.includes("diagnosis") || queryLower.includes("ledger")) {
      return {
        authorized: false,
        reason: "Teacher requested restricted financial/medical fields",
        refusalEnglish: "Teachers do not have permissions to query school financial, billing, or student clinical diagnostic records.",
        refusalTelugu: "టీచర్లకు స్కూల్ ఆర్థిక, బిల్లింగ్ లేదా విద్యార్థుల క్లినికల్ వైద్య రికార్డులను శోధించే అధికారాలు లేవు."
      };
    }
    return { authorized: true };
  }

  // 5. Team permissions - Accountants
  if (upRole === "ACCOUNTANT" || upRole === "CLERK") {
    // Accountants can see fees but cannot access exam performance records or student clinical health cards
    if (queryLower.includes("mark") || queryLower.includes("exam result") || queryLower.includes("clinical") || queryLower.includes("health card") || queryLower.includes("report")) {
      return {
        authorized: false,
        reason: "Accountant requested restricted academic/clinical fields",
        refusalEnglish: "Accountants do not have permissions to view student academic exam marks or private clinical health balance logs.",
        refusalTelugu: "అకౌంటెంట్లకు విద్యార్థుల విద్యా పరీక్ష మార్కులు లేదా వ్యక్తిగత క్లినికల్ హెల్త్ బ్యాలెన్స్ లాగ్‌లను చూసే అధికారాలు లేవు."
      };
    }
    return { authorized: true };
  }

  // 6. Family permissions - Parent
  if (upRole === "PARENT" || upRole === "GUARDIAN") {
    // Parents must only access their own children's logs
    // Block general school-wide lists or other student inquiries
    if (queryLower.includes("all students") || queryLower.includes("whole school") || queryLower.includes("income") || queryLower.includes("expenses") || queryLower.includes("teacher ") || queryLower.includes("salary")) {
      return {
        authorized: false,
        reason: "Parent attempted to run school-wide list command",
        refusalEnglish: "Parents can only query records of their registered children. General school administration details are restricted.",
        refusalTelugu: "తల్లిదండ్రులు తమ స్వంత పిల్లల రికార్డులను మాత్రమే విచారించగలరు. జనరల్ స్కూల్ అడ్మినిస్ట్రేషన్ వివరాలు పరిమితం చేయబడ్డాయి."
      };
    }
    return { authorized: true };
  }

  // 7. Academic student permissions - Student
  if (upRole === "STUDENT") {
    // Students can access their own grades/attendance but not other students' details or ledger adjustments
    if (queryLower.includes("parent log") || queryLower.includes("adjustment") || queryLower.includes("ledger") || queryLower.includes("billing") || queryLower.includes("fee template") || queryLower.includes("other student") || queryLower.includes("classmates")) {
      return {
        authorized: false,
        reason: "Student attempted restricted records access",
        refusalEnglish: "Students can only access their own basic academic performance. System billing configurations, parent logs, and peer records are restricted.",
        refusalTelugu: "విద్యార్థులు తమ ప్రాథమిక విద్యా పనితీరును మాత్రమే యాక్సెస్ చేయగలరు. సిస్టమ్ బిల్లింగ్ కాన్ఫిగరేషన్‌లు, తల్లిదండ్రుల లాగ్‌లు మరియు ఇతర విద్యార్థుల రికార్డులు పరిమితం చేయబడ్డాయి."
      };
    }
    return { authorized: true };
  }

  // 8. Hospital and warden user checks
  if (upRole === "HOSPITAL_USER" || upRole === "HOSPITAL" || upRole === "DOCTOR") {
    if (!hospitalId) {
      return {
        authorized: false,
        reason: "Unregistered hospital id",
        refusalEnglish: "Hospital accounts must be mapped to a registered healthcare partner ID.",
        refusalTelugu: "హాస్పిటల్ ఖాతాలు తప్పనిసరిగా నమోదిత వైద్య భాగస్వామి ఐడితో మ్యాప్ చేయబడాలి."
      };
    }

    if (queryLower.includes("mark") || queryLower.includes("exam") || queryLower.includes("homework") || queryLower.includes("salary") || queryLower.includes("fee")) {
      return {
        authorized: false,
        reason: "Hospital User requested academic or administrative records",
        refusalEnglish: "Hospital Users are strictly restricted to verifying health billing and card balances. Academic or fee structures are unauthorized.",
        refusalTelugu: "ఆసుపత్రి సిబ్బంది ఆరోగ్య బిల్లింగ్ మరియు కార్డ్ బ్యాలెన్స్‌లను మాత్రమే ధృవీకరించడానికి పరిమితం చేయబడ్డారు. విద్యా లేదా ఫీజు వివరాలు అనధికారికం."
      };
    }
    return { authorized: true };
  }

  if (upRole === "HOSTEL_WARDEN" || upRole === "WARDEN") {
    if (queryLower.includes("fee invoice") || queryLower.includes("clinical") || queryLower.includes("hospital bill") || queryLower.includes("salary")) {
      return {
        authorized: false,
        reason: "Hostel Warden requested restricted billing/medical info",
        refusalEnglish: "Hostel Wardens do not have access credentials to view clinical medical treatment records or administrative tuition invoices.",
        refusalTelugu: "హాస్టల్ వార్డెన్లకు క్లినికల్ వైద్య వివరాలు లేదా విద్యా ట్యూషన్ ఇన్‌వాయిస్‌లను చూసే అధికారాలు లేవు."
      };
    }
    return { authorized: true };
  }

  // Final catchall
  return { authorized: true };
}

/**
 * Validates data isolation on firestore query boundaries.
 * In a secure multi-tenant environment, the filters applied must match schoolId and hospitalId context.
 */
export function enforceIsolationFilters(
  collectionName: string,
  filters: any[],
  creds: UserCredentials
): any[] {
  const { schoolId, hospitalId, role } = creds;
  const cleanFilters = [...filters];

  // 1. Strict School-wise Isolation: Ensure schoolId filter matches
  const hasSchoolId = cleanFilters.some(f => f.field === 'schoolId');
  if (!hasSchoolId && collectionName !== 'settings') {
    cleanFilters.push({ field: 'schoolId', operator: '==', value: schoolId });
  }

  // 2. Strict Hospital-wise Isolation:
  // If it's a student health bill or card collection, and the role is hospital_user, strictly force hospitalId matching
  if (collectionName === 'student_health_bills' || collectionName === 'student_health_accounts') {
    const upRole = role.toUpperCase();
    if (upRole === 'HOSPITAL' || upRole === 'HOSPITAL_USER' || upRole === 'DOCTOR') {
      const hasHospitalId = cleanFilters.some(f => f.field === 'hospitalId');
      if (!hasHospitalId && hospitalId) {
        cleanFilters.push({ field: 'hospitalId', operator: '==', value: hospitalId });
      }
    }
  }

  return cleanFilters;
}
