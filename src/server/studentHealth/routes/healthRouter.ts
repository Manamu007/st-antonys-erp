import express from 'express';
import { getDbAdmin } from '../../firebaseAdmin.js';
import { processBillImage } from '../services/healthBillOcrService.js';
import { findStudentMatches } from '../services/studentHealthMatchingService.js';
import { processBillApprovalAndDeduction, processBillRejection } from '../services/healthCardLedgerService.js';
import { StudentHealthBill, SchoolHospital, StudentHealthAccount } from '../../../modules/studentHealth/types/index.js';

const router = express.Router();

// Helper to extract credentials from requests (headers or body fallback)
function getCredentials(req: express.Request) {
  const userId = (req.headers['x-user-id'] || req.body.userId || '').toString();
  const role = (req.headers['x-user-role'] || req.body.role || 'GUEST').toString().toUpperCase();
  const schoolId = (req.headers['x-school-id'] || req.body.schoolId || 'st_antonys_school').toString();
  const hospitalId = (req.headers['x-hospital-id'] || req.body.hospitalId || '').toString();

  return { userId, role, schoolId, hospitalId };
}

/**
 * GET Dashboard Statistics
 */
router.post('/dashboard', async (req, res) => {
  const { userId, role, schoolId, hospitalId } = getCredentials(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized. Missing user authentication details." });
  }

  const db = getDbAdmin();

  try {
    const isHospital = role === 'HOSPITAL_USER' || role === 'HOSPITAL' || role === 'DOCTOR';
    const isWarden = role === 'HOSTEL_WARDEN' || role === 'WARDEN';
    let billsQuery = db.collection('student_health_bills').where('schoolId', '==', schoolId);

    if (isHospital) {
      if (!hospitalId) {
        return res.status(400).json({ error: "Missing hospitalId association for hospital user." });
      }
      billsQuery = billsQuery.where('hospitalId', '==', hospitalId);
    }

    const billsSnap = await billsQuery.get();
    const bills = billsSnap.docs.map(doc => doc.data() as StudentHealthBill);

    // Filter status counts
    const approvedList = bills.filter(b => b.status === 'APPROVED');
    const pendingList = bills.filter(b => b.status === 'PENDING_ADMIN_REVIEW');
    const rejectedList = bills.filter(b => b.status === 'REJECTED');

    const totalApprovedAmount = approvedList.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalDeductedCard = approvedList.reduce((sum, b) => sum + (b.deductedFromHealthCard || 0), 0);
    const totalExtraPayable = approvedList.reduce((sum, b) => sum + (b.extraPayableAmount || 0), 0);

    // Accounts Stats (Admin/Warden only)
    let totalAccountsCount = 0;
    let totalCardBalance = 0;
    let enabledCardsCount = 0;

    if (!isHospital) {
      const accountsSnap = await db.collection('student_health_accounts')
        .where('schoolId', '==', schoolId)
        .get();

      const accounts = accountsSnap.docs.map(doc => doc.data() as StudentHealthAccount);
      totalAccountsCount = accounts.length;
      totalCardBalance = accounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
      enabledCardsCount = accounts.filter(a => a.healthCardEnabled && a.status === 'ACTIVE').length;
    }

    res.json({
      success: true,
      stats: {
        totalBillsCount: bills.length,
        pendingCount: pendingList.length,
        approvedCount: approvedList.length,
        rejectedCount: rejectedList.length,
        totalApprovedAmount,
        totalDeductedCard,
        totalExtraPayable,
        // Accounts
        totalAccountsCount,
        totalCardBalance,
        enabledCardsCount
      }
    });

  } catch (err) {
    console.error("[healthRouter] Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to load dashboard metrics.", details: String(err) });
  }
});

/**
 * GET/POST Hospitals List
 */
router.get('/hospitals', async (req, res) => {
  const schoolId = (req.query.schoolId || 'st_antonys_school').toString();
  const db = getDbAdmin();

  try {
    const snap = await db.collection('school_hospitals')
      .where('schoolId', '==', schoolId)
      .get();

    const hospitals = snap.docs.map(doc => doc.data() as SchoolHospital);
    res.json({ success: true, hospitals });
  } catch (err) {
    console.error("[healthRouter] Fetch hospitals error:", err);
    res.status(500).json({ error: "Failed to list school hospitals." });
  }
});

/**
 * POST Create/Update Hospital Master Entry
 */
router.post('/hospitals', async (req, res) => {
  const { userId, role, schoolId } = getCredentials(req);
  const { hospitalName, contactPerson, phone, address, loginUserId, status, id } = req.body;

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const db = getDbAdmin();

  try {
    const docId = id || db.collection('school_hospitals').doc().id;
    const ref = db.collection('school_hospitals').doc(docId);

    const hospital: SchoolHospital = {
      id: docId,
      schoolId,
      hospitalName,
      contactPerson: contactPerson || '',
      phone: phone || '',
      address: address || '',
      loginUserId: loginUserId || '',
      status: status || 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await ref.set(hospital, { merge: true });

    // Sync hospitalName across all corresponding historic student health bills
    if (id) {
      const billsSnap = await db.collection('student_health_bills')
        .where('hospitalId', '==', docId)
        .get();
      
      if (!billsSnap.empty) {
        const batch = db.batch();
        billsSnap.docs.forEach((doc) => {
          batch.update(doc.ref, { 
            hospitalName: hospitalName,
            updatedAt: new Date().toISOString()
          });
        });
        await batch.commit();
      }
    }

    // Link role 'HOSPITAL_USER' or setup metadata if needed
    if (loginUserId) {
      await db.collection('users').doc(loginUserId).set({
        hospitalId: docId,
        role: "HOSPITAL_USER"
      }, { merge: true });
    }

    res.json({ success: true, hospital });
  } catch (err) {
    console.error("[healthRouter] Set hospital error:", err);
    res.status(500).json({ error: "Failed to save hospital master details." });
  }
});

/**
 * GET/POST Accounts List
 */
router.post('/accounts', async (req, res) => {
  const { userId, role, schoolId } = getCredentials(req);
  const { studentId, studentType, search } = req.body;

  const db = getDbAdmin();

  try {
    let q = db.collection('student_health_accounts').where('schoolId', '==', schoolId);

    if (studentId) {
      q = q.where('studentId', '==', studentId);
    }

    const snap = await q.get();
    let accounts = snap.docs.map(doc => doc.data() as StudentHealthAccount);

    // Simple manual filtering for search matching name or class
    if (search) {
      const sLower = search.toLowerCase();
      accounts = accounts.filter(a => 
        (a.studentName || '').toLowerCase().includes(sLower) || 
        (a.className || '').toLowerCase().includes(sLower) ||
        (a.studentId || '').toLowerCase().includes(sLower)
      );
    }

    res.json({ success: true, accounts });
  } catch (err) {
    console.error("[healthRouter] Fetch accounts error:", err);
    res.status(500).json({ error: "Failed to find health card accounts." });
  }
});

/**
 * GET/POST Toggle / Adjust Health Card Balance
 */
router.post('/accounts/adjust', async (req, res) => {
  const { userId, role, schoolId } = getCredentials(req);
  const { studentId, balance, enabled, action } = req.body; // action: 'enable' | 'adjust_balance'

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const db = getDbAdmin();

  try {
    // Look up existing account
    const q = await db.collection('student_health_accounts')
      .where('schoolId', '==', schoolId)
      .where('studentId', '==', studentId)
      .limit(1)
      .get();

    let ref;
    let currentAccount: any = null;

    if (q.empty) {
      // Find student first to initialize
      const studentDoc = await db.collection('students').doc(studentId).get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Student not found in school." });
      }
      const s = studentDoc.data()!;

      const isHosteler = (s.feeType?.toLowerCase() === 'hostel' || (s.hostelDropDate && s.hostelDropDate !== ""));
      const isCardEnabled = enabled !== undefined ? enabled : isHosteler;
      const initialBal = balance !== undefined ? Number(balance) : (isHosteler ? 2000 : 0);

      const newId = db.collection('student_health_accounts').doc().id;
      ref = db.collection('student_health_accounts').doc(newId);

      currentAccount = {
        id: newId,
        schoolId,
        studentId,
        studentName: s.name || '',
        className: s.className || '',
        batchName: s.batchName || '',
        studentType: isHosteler ? "HOSTELER" : "DAY_SCHOLAR",
        healthCardEnabled: isCardEnabled,
        openingBalance: initialBal,
        currentBalance: initialBal,
        totalMedicalBills: 0,
        totalDeductedFromCard: 0,
        totalExtraPayable: 0,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await ref.set(currentAccount);
    } else {
      const snapDoc = q.docs[0];
      ref = snapDoc.ref;
      currentAccount = snapDoc.data();

      const origBalance = currentAccount.currentBalance || 0;
      let newBalance = origBalance;

      if (balance !== undefined) {
        newBalance = Number(balance);
      }

      const updates: any = {
        updatedAt: new Date().toISOString()
      };

      if (enabled !== undefined) {
        updates.healthCardEnabled = enabled;
      }
      if (balance !== undefined) {
        updates.currentBalance = newBalance;
      }

      await ref.update(updates);
      currentAccount = { ...currentAccount, ...updates };

      // Log balance adjustment if balance changed
      if (balance !== undefined && origBalance !== newBalance) {
        const ledgerRef = db.collection('student_health_ledger').doc();
        await ledgerRef.set({
          id: ledgerRef.id,
          schoolId,
          studentId,
          billId: 'MANUAL_ADJUSTMENT',
          hospitalId: 'ADMIN_MANUAL',
          transactionType: "CARD_TOPUP",
          amount: Math.abs(newBalance - origBalance),
          balanceBefore: origBalance,
          balanceAfter: newBalance,
          extraPayableAmount: 0,
          remarks: `Admin balance adjustment from ₹${origBalance} to ₹${newBalance}`,
          createdByUserId: userId,
          createdAt: new Date().toISOString()
        });
      }
    }

    res.json({ success: true, account: currentAccount });
  } catch (err) {
    console.error("[healthRouter] Adjust account error:", err);
    res.status(500).json({ error: "Failed to modify health card configuration." });
  }
});

/**
 * POST Purchase Health Card for a Student (Auto-adds to hostel)
 */
router.post('/accounts/purchase', async (req, res) => {
  const { userId, role, schoolId } = getCredentials(req);
  const { studentId, amount, paymentMode, referenceNumber, hostelName, hostelRoom, hostelBed, remarks } = req.body;

  if (!studentId) {
    return res.status(400).json({ error: "Missing required studentId parameter." });
  }

  const purchasePrice = Number(amount) || 2000;
  const hName = hostelName || 'St. Antony Hostel';
  const hRoom = hostelRoom || 'Block A-101';
  const hBed = hostelBed || 'Bed-A';

  const db = getDbAdmin();

  try {
    // 1. Find and update the student in 'students' collection
    const studentDoc = await db.collection('students').doc(studentId).get();
    if (!studentDoc.exists) {
      return res.status(404).json({ error: "Student not found in the school records." });
    }
    const studentData = studentDoc.data()!;

    // Auto-allocate student to the hostel
    await db.collection('students').doc(studentId).update({
      feeType: 'hostel',
      hostelName: hName,
      hostelRoom: hRoom,
      hostelBed: hBed,
      hostelDropDate: "", // Clear any historical drop date
      updatedAt: new Date().toISOString()
    });

    // 2. Fetch or create the Student Health Card Account
    const accountSnap = await db.collection('student_health_accounts')
      .where('schoolId', '==', schoolId)
      .where('studentId', '==', studentId)
      .limit(1)
      .get();

    let accountRef;
    let finalAccount: any = null;
    let balanceBefore = 0;
    let balanceAfter = 0;

    if (accountSnap.empty) {
      const newAccountId = db.collection('student_health_accounts').doc().id;
      accountRef = db.collection('student_health_accounts').doc(newAccountId);
      balanceBefore = 0;
      balanceAfter = purchasePrice;

      finalAccount = {
        id: newAccountId,
        schoolId,
        studentId,
        studentName: studentData.name || '',
        className: studentData.className || '',
        batchName: studentData.batchName || '',
        studentType: "HOSTELER",
        healthCardEnabled: true,
        openingBalance: purchasePrice,
        currentBalance: purchasePrice,
        totalMedicalBills: 0,
        totalDeductedFromCard: 0,
        totalExtraPayable: 0,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await accountRef.set(finalAccount);
    } else {
      const existingDoc = accountSnap.docs[0];
      accountRef = existingDoc.ref;
      const accountData = existingDoc.data();
      balanceBefore = accountData.currentBalance || 0;
      balanceAfter = balanceBefore + purchasePrice;

      finalAccount = {
        ...accountData,
        studentType: "HOSTELER", // Convert student type to Hosteler
        healthCardEnabled: true,
        currentBalance: balanceAfter,
        status: "ACTIVE",
        updatedAt: new Date().toISOString()
      };

      await accountRef.update({
        studentType: "HOSTELER",
        healthCardEnabled: true,
        currentBalance: balanceAfter,
        status: "ACTIVE",
        updatedAt: new Date().toISOString()
      });
    }

    // 3. Log a ledger transaction for the health card top-up
    const ledgerRef = db.collection('student_health_ledger').doc();
    const payModeStr = paymentMode ? ` via ${paymentMode}` : '';
    const refNumStr = referenceNumber ? ` (Ref: ${referenceNumber})` : '';
    const commentStr = remarks ? `. Remarks: ${remarks}` : '';

    await ledgerRef.set({
      id: ledgerRef.id,
      schoolId,
      studentId,
      billId: 'PURCHASE_TOPUP',
      hospitalId: 'ADMIN_PURCHASE',
      transactionType: "CARD_TOPUP",
      amount: purchasePrice,
      balanceBefore,
      balanceAfter,
      extraPayableAmount: 0,
      remarks: `Health Card purchased${payModeStr}${refNumStr}. Student auto-registered to hostel (${hName}, Rm ${hRoom}, ${hBed})${commentStr}`,
      createdByUserId: userId,
      createdAt: new Date().toISOString()
    });

    // 4. Create an Audit Log entry for the transaction
    await db.collection('student_health_audit_logs').add({
      id: db.collection('student_health_audit_logs').doc().id,
      schoolId,
      studentId,
      userId,
      role,
      action: "HEALTH_CARD_DEDUCTED", // Audit action mapping
      beforeData: { healthCardEnabled: accountSnap.empty ? false : accountSnap.docs[0].data().healthCardEnabled, feeType: studentData.feeType },
      afterData: { healthCardEnabled: true, feeType: "hostel", currentBalance: balanceAfter },
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Health Card purchased successfully for ${studentData.name || 'student'}. Added to ${hName} hostel.`,
      account: finalAccount
    });
  } catch (err: any) {
    console.error("[healthRouter] Purchase card transaction error:", err);
    res.status(500).json({ error: "Purchase collapsed during transaction writing.", details: err.message });
  }
});

/**
 * POST Search Students Fuzzy
 */
router.post('/students/search', async (req, res) => {
  const { schoolId } = getCredentials(req);
  const { query, className, batchName } = req.body;

  try {
    const matches = await findStudentMatches(schoolId, {
      studentName: query,
      className,
      batchName,
      admissionNumber: query
    });
    res.json({ success: true, matches });
  } catch (err) {
    console.error("[healthRouter] Student search error:", err);
    res.status(500).json({ error: "Failed to query students database." });
  }
});

/**
 * POST Process Bill Upload with Gemini Vision OCR
 */
router.post('/bills/upload', async (req, res) => {
  const { userId, role, schoolId, hospitalId } = getCredentials(req);
  const { imageUrl, filePath } = req.body;

  if (!imageUrl || !filePath) {
    return res.status(400).json({ error: "Missing uploaded imageUrl or domestic local filePath." });
  }

  try {
    // 1. Process with Gemini OCR
    const ocrResult = await processBillImage(filePath);

    // 2. Perform fuzzy students lookup (treating address as class and batch)
    const matches = await findStudentMatches(schoolId, {
      studentName: ocrResult.studentName,
      className: ocrResult.className,
      batchName: ocrResult.batchName,
      admissionNumber: ocrResult.admissionNumber,
      patientAddress: ocrResult.patientAddress
    });

    // 3. Automated allotment & health card balance deduction if a perfect match is found
    let autoAllotted = false;
    let autoAllottedBillId: string | null = null;
    let autoAllottedStatus: string = "PENDING_ADMIN_REVIEW";
    let autoDeductedAmount = 0;
    let autoDuesAmount = ocrResult.totalAmount || 0;
    let matchedStudentId: string | null = null;
    let autoAllottedBill: any = null;

    const db = getDbAdmin();
    const bestMatch = matches[0];

    // Perfect student match: confidence >= 0.72
    if (bestMatch && bestMatch.confidence >= 0.72) {
      matchedStudentId = bestMatch.studentId;
      const billId = db.collection('student_health_bills').doc().id;
      const verifiedHospitalId = hospitalId || req.body.hospitalId || 'general-hospital';

      // Lock up hospital details
      const hospDoc = await db.collection('school_hospitals').doc(verifiedHospitalId).get();
      const resolvedHospitalName = hospDoc.exists ? hospDoc.data()?.hospitalName : 'Associated Hospital';

      // Look up Health Card Student Account
      const accountSnap = await db.collection('student_health_accounts')
        .where('schoolId', '==', schoolId)
        .where('studentId', '==', matchedStudentId)
        .limit(1)
        .get();

      let isCardEnabled = false;
      let balanceBefore = 0;
      let balanceAfter = 0;
      let accountRef = null;
      let accountData: any = null;

      if (!accountSnap.empty) {
        const docSnap = accountSnap.docs[0];
        accountRef = docSnap.ref;
        accountData = docSnap.data();
        isCardEnabled = accountData.healthCardEnabled && accountData.status === 'ACTIVE';
        balanceBefore = isCardEnabled ? (accountData.currentBalance || 0) : 0;
      }

      const totalAmount = ocrResult.totalAmount || 0;

      if (isCardEnabled) {
        // Automatically deduct from health card!
        if (balanceBefore > 0) {
          if (balanceBefore >= totalAmount) {
            autoDeductedAmount = totalAmount;
            autoDuesAmount = 0;
          } else {
            autoDeductedAmount = balanceBefore;
            autoDuesAmount = totalAmount - balanceBefore;
          }
        }
        balanceAfter = balanceBefore - autoDeductedAmount;
        autoAllottedStatus = "APPROVED"; // Instantly approved and settled
      } else {
        autoDeductedAmount = 0;
        autoDuesAmount = totalAmount;
        autoAllottedStatus = "PENDING_ADMIN_REVIEW"; // Drafted for standard admin review
        balanceAfter = 0;
      }

      // Populate new finalized bill
      autoAllottedBill = {
        id: billId,
        schoolId,
        hospitalId: verifiedHospitalId,
        hospitalName: resolvedHospitalName,

        studentId: matchedStudentId,
        studentName: bestMatch.studentName,
        className: bestMatch.className,
        batchName: bestMatch.batchName,
        admissionNumber: bestMatch.admissionNumber || '',
        studentType: bestMatch.studentType || 'DAY_SCHOLAR',
        fatherName: bestMatch.fatherName || '',
        phone: bestMatch.phone || '',

        billNumber: ocrResult.billNumber || '',
        billDate: ocrResult.billDate || new Date().toISOString().split('T')[0],
        doctorName: ocrResult.doctorName || '',
        treatmentDescription: ocrResult.treatmentDescription || 'Clinical Treatment',
        medicines: ocrResult.medicines || [],

        doctorFee: Number(ocrResult.doctorFee) || 0,
        medicineAmount: Number(ocrResult.medicineAmount) || 0,
        labFee: Number(ocrResult.labFee) || 0,
        otherCharges: Number(ocrResult.otherCharges) || 0,
        totalAmount: Number(totalAmount) || 0,

        deductedFromHealthCard: autoDeductedAmount,
        extraPayableAmount: autoDuesAmount,
        balanceBefore,
        balanceAfter,

        imageUrl: imageUrl || '',
        ocrRawText: ocrResult.rawText || '',
        ocrConfidence: ocrResult.confidence || 0.9,
        ocrWarnings: ocrResult.warnings || [],

        entryMode: 'OCR_UPLOAD',
        status: autoAllottedStatus,

        createdByUserId: userId,
        createdByRole: role,

        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (autoAllottedStatus === "APPROVED") {
        autoAllottedBill.approvedByUserId = userId;
        autoAllottedBill.approvedAt = new Date().toISOString();
      }

      const batch = db.batch();
      batch.set(db.collection('student_health_bills').doc(billId), autoAllottedBill);

      if (isCardEnabled && accountRef) {
        // Debit card balance instantly
        batch.update(accountRef, {
          currentBalance: balanceAfter,
          totalMedicalBills: (accountData.totalMedicalBills || 0) + totalAmount,
          totalDeductedFromCard: (accountData.totalDeductedFromCard || 0) + autoDeductedAmount,
          totalExtraPayable: (accountData.totalExtraPayable || 0) + autoDuesAmount,
          updatedAt: new Date().toISOString()
        });

        // Add health ledger debit receipt entry
        const ledgerRef = db.collection('student_health_ledger').doc();
        batch.set(ledgerRef, {
          id: ledgerRef.id,
          schoolId,
          studentId: matchedStudentId,
          billId,
          hospitalId: verifiedHospitalId,
          transactionType: "BILL_APPROVAL",
          amount: totalAmount,
          balanceBefore,
          balanceAfter,
          extraPayableAmount: autoDuesAmount,
          remarks: `Auto-Approved & Deducted via Doctor OCR upload: ₹${autoDeductedAmount}`,
          createdByUserId: userId,
          createdAt: new Date().toISOString()
        });
      }

      // Add audit logging
      const auditRef = db.collection('student_health_audit_logs').doc();
      batch.set(auditRef, {
        id: auditRef.id,
        schoolId,
        hospitalId: verifiedHospitalId,
        studentId: matchedStudentId,
        billId,
        userId,
        role,
        action: autoAllottedStatus === "APPROVED" ? "HEALTH_CARD_DEDUCTED" : "HOSPITAL_BILL_UPLOADED",
        afterData: { status: autoAllottedStatus, totalAmount, autoDeductedAmount, autoDuesAmount },
        createdAt: new Date().toISOString()
      });

      await batch.commit();
      autoAllotted = true;
      autoAllottedBillId = billId;
    }

    res.json({
      success: true,
      ocrResult,
      matches,
      imageUrl,
      autoAllotted,
      autoAllottedBill,
      autoDeductedAmount,
      autoDuesAmount,
      autoAllottedStatus
    });

  } catch (err) {
    console.error("[healthRouter] Bill upload processing error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to run OCR interpretation on the upload file." });
  }
});

/**
 * POST Create Manual Bill or Confirm Upload Draft
 */
router.post('/bills/manual', async (req, res) => {
  const { userId, role, schoolId, hospitalId } = getCredentials(req);
  const {
    studentId,
    studentName,
    className,
    batchName,
    admissionNumber,
    studentType,

    billNumber,
    billDate,
    doctorName,
    treatmentDescription,
    medicines,

    doctorFee,
    medicineAmount,
    labFee,
    otherCharges,
    totalAmount,

    imageUrl,
    ocrRawText,
    ocrConfidence,
    ocrWarnings,
    entryMode,
    fatherName,
    phone
  } = req.body;

  if (!studentId || !treatmentDescription || totalAmount === undefined) {
    return res.status(400).json({ error: "Missing required inputs (studentId, treatmentDescription, totalAmount)" });
  }

  const db = getDbAdmin();

  try {
    const verifiedHospitalId = hospitalId || req.body.hospitalId;
    if (!verifiedHospitalId) {
      return res.status(400).json({ error: "Hospital identifier is required to save billing details." });
    }

    // Load hospital details
    const hospDoc = await db.collection('school_hospitals').doc(verifiedHospitalId).get();
    const hospitalName = hospDoc.exists ? hospDoc.data()?.hospitalName : 'Associated Hospital';

    const billId = db.collection('student_health_bills').doc().id;
    const newBill: StudentHealthBill = {
      id: billId,
      schoolId,
      hospitalId: verifiedHospitalId,
      hospitalName,

      studentId,
      studentName,
      className,
      batchName,
      admissionNumber: admissionNumber || '',
      studentType: studentType || 'DAY_SCHOLAR',
      fatherName: fatherName || '',
      phone: phone || '',

      billNumber: billNumber || '',
      billDate: billDate || new Date().toISOString().split('T')[0],
      doctorName: doctorName || '',
      treatmentDescription,
      medicines: medicines || [],

      doctorFee: Number(doctorFee) || 0,
      medicineAmount: Number(medicineAmount) || 0,
      labFee: Number(labFee) || 0,
      otherCharges: Number(otherCharges) || 0,
      totalAmount: Number(totalAmount) || 0,

      deductedFromHealthCard: 0,
      extraPayableAmount: 0,
      balanceBefore: 0,
      balanceAfter: 0,

      imageUrl: imageUrl || '',
      ocrRawText: ocrRawText || '',
      ocrConfidence: ocrConfidence || 0,
      ocrWarnings: ocrWarnings || [],

      entryMode: entryMode || 'MANUAL',
      status: "PENDING_ADMIN_REVIEW", // Mandatory review status on creation

      createdByUserId: userId,
      createdByRole: role,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('student_health_bills').doc(billId).set(newBill);

    // Audit Log
    await db.collection('student_health_audit_logs').add({
      id: db.collection('student_health_audit_logs').doc().id,
      schoolId,
      hospitalId: verifiedHospitalId,
      studentId,
      billId,
      userId,
      role,
      action: entryMode === 'OCR_UPLOAD' ? "HOSPITAL_BILL_UPLOADED" : "HOSPITAL_BILL_MANUALLY_CREATED",
      afterData: { status: "PENDING_ADMIN_REVIEW", totalAmount },
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, bill: newBill });
  } catch (err) {
    console.error("[healthRouter] Save bill error:", err);
    res.status(500).json({ error: "Failed to queue bill for admin review." });
  }
});

/**
 * GET/POST Bills Query
 */
router.post('/bills', async (req, res) => {
  const { userId, role, schoolId, hospitalId } = getCredentials(req);
  const { studentId, status } = req.body;

  const db = getDbAdmin();

  try {
    let q = db.collection('student_health_bills').where('schoolId', '==', schoolId);

    // Segregate! If role is hospital user, strictly filter by their hospitalId!
    const isHospital = role === 'HOSPITAL_USER' || role === 'HOSPITAL' || role === 'DOCTOR';
    if (isHospital) {
      if (!hospitalId) {
        return res.status(403).json({ error: "Access Denied. Hospital account holds no corresponding hospital correlation." });
      }
      q = q.where('hospitalId', '==', hospitalId);
    }

    if (studentId) {
      q = q.where('studentId', '==', studentId);
    }
    if (status) {
      q = q.where('status', '==', status);
    }

    const snap = await q.get();
    const bills = snap.docs.map(doc => doc.data() as StudentHealthBill)
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, bills });
  } catch (err) {
    console.error("[healthRouter] Query bills error:", err);
    res.status(500).json({ error: "Failed to retrieve hospital bills." });
  }
});

/**
 * POST Approve Bill
 */
router.post('/bills/:billId/approve', async (req, res) => {
  const { userId, role, schoolId } = getCredentials(req);
  const { billId } = req.params;

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: "Access Denied. Only authorized Administrators can approve medical billing items." });
  }

  const result = await processBillApprovalAndDeduction(schoolId, billId, userId);

  if (result.success) {
    res.json({ success: true, message: "Bill approved and health card ledger debited successfully." });
  } else {
    res.status(400).json({ error: result.error || "Approval transaction processing collapsed." });
  }
});

/**
 * POST Reject Bill
 */
router.post('/bills/:billId/reject', async (req, res) => {
  const { userId, role, schoolId } = getCredentials(req);
  const { billId } = req.params;
  const { reason } = req.body;

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: "Access Denied. Only authorized Administrators can decline medical billing items." });
  }

  if (!reason) {
    return res.status(400).json({ error: "Rejection reason must be stated to decline billing transactions." });
  }

  const result = await processBillRejection(schoolId, billId, userId, reason);

  if (result.success) {
    res.json({ success: true, message: "Bill rejected and returned to draft/cancelled queue." });
  } else {
    res.status(400).json({ error: result.error || "Rejection attempt failed." });
  }
});

/**
 * GET Reports for School Board & Accounts
 */
router.post('/reports', async (req, res) => {
  const { userId, role, schoolId, hospitalId } = getCredentials(req);
  const { startDate, endDate, studentType } = req.body;

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'ACCOUNTANT' && role !== 'DOCTOR') {
    return res.status(403).json({ error: "Access Denied. Financial reports only visible by administration, accounting staff, and authorized clinical doctors." });
  }

  const db = getDbAdmin();

  try {
    let q = db.collection('student_health_bills')
      .where('schoolId', '==', schoolId)
      .where('status', '==', 'APPROVED');

    const snap = await q.get();
    let approvedBills = snap.docs.map(doc => doc.data() as StudentHealthBill);

    // Limit doctor records strictly to their associated health partner
    if (role === 'DOCTOR') {
      if (!hospitalId) {
        return res.status(430).json({ error: "Access Denied. Doctor account must be associated with a registered hospital." });
      }
      approvedBills = approvedBills.filter(b => b.hospitalId === hospitalId);
    }

    // Apply filtering in memory
    if (startDate) {
      const sMs = new Date(startDate).getTime();
      approvedBills = approvedBills.filter(b => new Date(b.billDate).getTime() >= sMs);
    }
    if (endDate) {
      const eMs = new Date(endDate).getTime();
      approvedBills = approvedBills.filter(b => new Date(b.billDate).getTime() <= eMs);
    }
    if (studentType) {
      approvedBills = approvedBills.filter(b => b.studentType === studentType);
    }

    // Totals
    const totalBills = approvedBills.length;
    const totalAmount = approvedBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalDeducted = approvedBills.reduce((sum, b) => sum + (b.deductedFromHealthCard || 0), 0);
    const totalPayable = approvedBills.reduce((sum, b) => sum + (b.extraPayableAmount || 0), 0);

    // Category distributions
    const hospitalTally: Record<string, number> = {};
    const treatTally: Record<string, number> = {};

    approvedBills.forEach(b => {
      hospitalTally[b.hospitalName] = (hospitalTally[b.hospitalName] || 0) + b.totalAmount;
      const tKey = b.treatmentDescription || 'General';
      treatTally[tKey] = (treatTally[tKey] || 0) + 1;
    });

    const ledgerSnap = await db.collection('student_health_ledger')
      .where('schoolId', '==', schoolId)
      .get();
    const ledger = ledgerSnap.docs.map(doc => doc.data())
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      report: {
        totalBills,
        totalAmount,
        totalDeducted,
        totalPayable,
        hospitalDistribution: Object.entries(hospitalTally).map(([name, val]) => ({ name, value: val })),
        treatmentTypes: Object.entries(treatTally).map(([name, count]) => ({ name, count })),
        approvedBills,
        ledger
      }
    });

  } catch (err) {
    console.error("[healthRouter] Reports failed:", err);
    res.status(500).json({ error: "Failed to compile financial metrics report." });
  }
});

export default router;
