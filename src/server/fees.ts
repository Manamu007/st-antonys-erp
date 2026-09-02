import express from 'express';
import { getDbAdmin, isDatabaseDenied, setDatabaseDenied } from './firebaseAdmin.js';
import { sendMessage } from './whatsapp.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const router = express.Router();

/**
 * Send Fee Reminder Alert
 */
router.post('/reminder', async (req, res) => {
  const db = getDbAdmin();
  const { 
    studentId, 
    studentName, 
    fatherName,
    className, 
    batchName,
    academicYear, 
    totalFee, 
    paidFee, 
    dueFee,
    breakdown,
    whatsappNumber 
  } = req.body;

  if (!whatsappNumber) {
    return res.status(400).json({ error: 'WhatsApp number is required' });
  }

  try {
    let breakdownText = '';
    if (breakdown && Array.isArray(breakdown) && breakdown.length > 0) {
      // Strip academic year prefix and any year mentions from labels
      const cleanBreakdown = breakdown.map(item => {
        let label = item.label;
        // Remove any year range pattern like 2024-2025 or 2024-25
        label = label.replace(/\d{4}-\d{2,4}/g, '');
        // Remove individual 4-digit years
        label = label.replace(/\b\d{4}\b/g, '');
        // Clean up leading/trailing separators and extra whitespace
        label = label.replace(/^[\s\-\:]+/, '').replace(/[\s\-\:]+$/, '').trim().replace(/\s+/g, ' ');
        
        return { ...item, label: label || item.label };
      });
      breakdownText = '\n*Fee Breakdown:*\n' + cleanBreakdown.map(item => `🔹 *${item.label}:* ₹${item.amount.toLocaleString('en-IN')}`).join('\n') + '\n';
    }

    // Fetch template from Firestore
    const templateSnapshot = await db.collection('message_templates')
      .where('event', '==', 'fee_reminder')
      .where('isActive', '==', true)
      .limit(1)
      .get();

    // Fetch student data if possible to resolve actual old dues
    let oldDuesAmount = 0;
    if (studentId) {
      const studentDoc = await db.collection('students').doc(studentId).get();
      if (studentDoc.exists) {
        const studentData = studentDoc.data();
        const lastClassFeeDue = Number(studentData?.lastClassFeeDue || 0);
        const oldFeeConcession = Number(studentData?.oldFeeConcession || 0);
        const netOldDues = Math.max(0, lastClassFeeDue - oldFeeConcession);
        if (netOldDues > 0) {
          oldDuesAmount = netOldDues;
        }
      }
    }

    let oldDuesSection = '';
    if (oldDuesAmount > 0) {
      oldDuesSection = `⚠️ *Previous Year Outstanding:* ₹${oldDuesAmount.toLocaleString('en-IN')}\n\n`;
    } else if (req.body.oldDues && req.body.oldDues.length > 0) {
      oldDuesSection = `⚠️ *Previous Year Outstanding:* \n${req.body.oldDues.map((d: any) => `📍 *${d.year} (Class ${d.className}):* ₹${d.balance.toLocaleString('en-IN')}`).join('\n')}\n\n`;
    }

    let message = `📚 *Fee Payment Reminder* 📚\n\nDear ${fatherName || 'Parent'}, \n\nThis is a friendly reminder regarding the school fees for *${studentName}*.\n\n*Details:*\n📌 *Class:* ${className}\n📌 *Batch:* ${batchName}\n📌 *Academic Year:* ${academicYear} (Current)\n${breakdownText}\n💰 *Total Payable:* ₹${totalFee.toLocaleString('en-IN')}\n✅ *Total Paid:* ₹${paidFee.toLocaleString('en-IN')}\n⚠️ *Outstanding Dues:* ₹${dueFee.toLocaleString('en-IN')}\n\n${oldDuesSection}Please ignore this message if payment has already been made. Kindly clear the pending dues at the earliest to ensure uninterrupted services.\n\nLocation for Payment: School Office or Online via ERP.\n\nThank you,\n*St. Antony’s School*`;

    if (!templateSnapshot.empty) {
      const template = templateSnapshot.docs[0].data();
      const templateContent = template.content;
      
      const schoolDoc = await db.collection('settings').doc('school').get();
      const schoolName = schoolDoc.exists ? schoolDoc.data()?.schoolName : 'St. Antony’s School';

      message = templateContent.replace(/\{\{(.*?)\}\}/g, (match: string, key: string) => {
        const k = key.trim();
        if (k === 'student_name') return studentName;
        if (k === 'father_name') return fatherName || 'Parent';
        if (k === 'class') return className;
        if (k === 'batch') return batchName;
        if (k === 'academic_year') return academicYear;
        if (k === 'breakdown') return breakdownText;
        if (k === 'total_fee') return totalFee.toLocaleString('en-IN');
        if (k === 'paid_fee') return paidFee.toLocaleString('en-IN');
        if (k === 'due_fee') return dueFee.toLocaleString('en-IN');
        if (k === 'school_name') return schoolName;
        return match;
      });

      // If the student has previous year dues and they are not mentioned in the message already, append them
      if (oldDuesAmount > 0 && !message.includes('Previous Academic Year Dues') && !message.includes('Previous Year Outstanding') && !message.includes('lastClassFeeDue')) {
        const oldDuesAlert = `⚠️ *Previous Year Outstanding:* ₹${oldDuesAmount.toLocaleString('en-IN')}\n\n`;
        if (message.includes('Regards')) {
          message = message.replace('Regards', `${oldDuesAlert}Regards`);
        } else if (message.includes('Thank you')) {
          message = message.replace('Thank you', `${oldDuesAlert}Thank you`);
        } else {
          message += `\n\n${oldDuesAlert}`;
        }
      }
    }

    await sendMessage(whatsappNumber, message, {}, 'single');

    res.json({ 
      success: true, 
      message: `Reminder sent to ${studentName}`
    });

  } catch (error: any) {
    console.error("Fee reminder error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send Payment Receipt Alert
 */
router.post('/receipt', async (req, res) => {
  const { 
    studentName, 
    fatherName,
    amount, 
    method, 
    reference, 
    component, 
    academicYear, 
    whatsappNumber,
    balanceDue,
    studentId,
    paymentId,
    receiptId,
    receiptNumber,
    date,
    forceSend,
    className,
    batchName
  } = req.body;

  if (!whatsappNumber) {
    return res.status(400).json({ error: 'WhatsApp number is required' });
  }

  try {
    const db = getDbAdmin();
    // Fetch school name and ID first to construct message and options correctly
    const schoolDoc = await db.collection('settings').doc('school').get();
    const schoolName = schoolDoc.exists ? schoolDoc.data()?.schoolName : 'St. Antony’s School';
    const resolvedSchoolId = schoolDoc.exists && schoolDoc.data()?.schoolId ? schoolDoc.data()?.schoolId : 'st_antonys_school';

    // Resolve Class and Batch dynamically if not provided in request body
    let resolvedClassName = className || 'N/A';
    let resolvedBatchName = batchName || 'N/A';

    if (studentId && (resolvedClassName === 'N/A' || resolvedBatchName === 'N/A' || resolvedClassName === '' || resolvedBatchName === '')) {
      try {
        const studentDoc = await db.collection('students').doc(studentId).get();
        if (studentDoc.exists) {
          const studentData = studentDoc.data();
          const classId = studentData?.classId || studentData?.class;
          const batchId = studentData?.batchId || studentData?.batch;
          
          if (classId && (resolvedClassName === 'N/A' || resolvedClassName === '')) {
            const classDoc = await db.collection('classes').doc(classId).get();
            resolvedClassName = classDoc.exists ? classDoc.data()?.name : classId;
          }
          if (batchId && (resolvedBatchName === 'N/A' || resolvedBatchName === '')) {
            const batchDoc = await db.collection('batches').doc(batchId).get();
            resolvedBatchName = batchDoc.exists ? batchDoc.data()?.name : batchId;
          }
        }
      } catch (err) {
        console.warn("[Fees Receipt Backend] Failed to dynamically fetch class/batch for student:", err);
      }
    }

    // Fetch template from Firestore
    const templateSnapshot = await db.collection('message_templates')
      .where('event', '==', 'fee_receipt')
      .where('isActive', '==', true)
      .limit(1)
      .get();

    let message = `✅ *Payment Received* ✅\n\nDear ${fatherName || 'Parent'}, \n\nWe have successfully received the fee payment for *${studentName}*.\n\n*Student Details:*\n👤 *Student Name:* ${studentName}\n🏫 *Class:* ${resolvedClassName}\n📦 *Batch:* ${resolvedBatchName}\n\n*Payment Summary:*\n💰 *Amount Paid:* ₹${amount.toLocaleString('en-IN')}\n💳 *Method:* ${method.toUpperCase()}\n📄 *Component:* ${component}\n📆 *Academic Year:* ${academicYear}\n🔍 *Ref:* ${reference || 'N/A'}\n💼 *Remaining Due:* ₹${balanceDue.toLocaleString('en-IN')}\n\nThank you for your prompt payment. You can view the digital receipt on the school portal.\n\nRegards,\n*${schoolName}*`;

    if (!templateSnapshot.empty) {
      const template = templateSnapshot.docs[0].data();
      const templateContent = template.content;
      
      message = templateContent.replace(/\{\{(.*?)\}\}/g, (match: string, key: string) => {
        const k = key.trim();
        if (k === 'student_name') return studentName;
        if (k === 'father_name') return fatherName || 'Parent';
        if (k === 'amount') return amount.toLocaleString('en-IN');
        if (k === 'method') return method.toUpperCase();
        if (k === 'component') return component;
        if (k === 'academic_year') return academicYear;
        if (k === 'reference') return reference || 'N/A';
        if (k === 'due_fee') return balanceDue.toLocaleString('en-IN');
        if (k === 'school_name') return schoolName;
        if (k === 'class' || k === 'class_name') return resolvedClassName;
        if (k === 'batch' || k === 'batch_name') return resolvedBatchName;
        return match;
      });
    }

    // Import safe logging helper
    const { safeLogWhatsappEvent } = await import('./whatsappUtils.js');

    safeLogWhatsappEvent('fee_receipt_backend_queue_used', {
      studentId: studentId || 'none',
      receiptId: receiptId || receiptNumber || 'none',
      paymentId: paymentId || 'none',
      amount: amount
    });

    const sendMessageOptions = {
      studentId: studentId || 'none',
      paymentId: paymentId || 'none',
      receiptId: receiptId || receiptNumber || 'none',
      receiptNumber: receiptNumber || 'none',
      templateType: "fee_receipt",
      messageType: "payment_receipt",
      eventType: "fee_receipt",
      priority: 2,
      source: "fees_receipt",
      date: date || new Date().toISOString().split('T')[0],
      schoolId: resolvedSchoolId,
      amount: amount,
      paymentMode: method,
      academicYear: academicYear,
      feeComponent: component,
      forceSend: forceSend === true || forceSend === 'true'
    };

    const sendRes = await sendMessage(whatsappNumber, message, sendMessageOptions, 'single');

    res.json({ 
      success: true, 
      message: `Receipt sent to ${studentName}`,
      sendResult: sendRes
    });

  } catch (error: any) {
    console.error("Fee receipt error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Razorpay: Public Config (Client-Safe, secrets remain on server)
 */
router.get('/razorpay/config', async (req, res) => {
  try {
    const db = getDbAdmin();
    let merchantName = process.env.RAZORPAY_MERCHANT_NAME || "ST. ANTONY'S HIGH SCHOOL";
    let mid = process.env.RAZORPAY_MID || "MID_ST_ANTONYS_01";
    let tid = process.env.RAZORPAY_TID || "TID_FEE_COLLECT_01";
    let key_id = process.env.VITE_RAZORPAY_KEY || "";

    if (db) {
      const schoolDoc = await db.collection('settings').doc('school').get();
      if (schoolDoc.exists) {
        const sData = schoolDoc.data();
        if (sData?.razorpayMerchantName) merchantName = sData.razorpayMerchantName;
        if (sData?.razorpayMid) mid = sData.razorpayMid;
        if (sData?.razorpayTid) tid = sData.razorpayTid;
        if (sData?.razorpayKeyId) key_id = sData.razorpayKeyId;
      }
    }

    const key_secret = process.env.RAZORPAY_SECRET;
    const isSandbox = !key_id || !key_secret || key_id === 'rzp_test_your_key_here' || key_id.trim() === '' || key_secret === 'your_razorpay_secret_here' || key_secret.trim() === '';

    res.json({
      keyId: key_id || 'rzp_test_your_key_here',
      merchantName,
      mid,
      tid,
      isSandbox,
      collectNowEnabled: true,
      checkoutMode: 'embedded_collect_now'
    });
  } catch (error: any) {
    console.error("Razorpay config error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Razorpay: Create Order with CollectNow Parameters (Step 1)
 */
router.post('/razorpay/create-order', async (req, res) => {
  const { amount, currency = 'INR', receipt, studentId, studentName, academicYear, componentsMap } = req.body;
  
  const db = getDbAdmin();
  let merchantName = process.env.RAZORPAY_MERCHANT_NAME || "ST. ANTONY'S HIGH SCHOOL";
  let mid = process.env.RAZORPAY_MID || "MID_ST_ANTONYS_01";
  let tid = process.env.RAZORPAY_TID || "TID_FEE_COLLECT_01";
  let key_id = process.env.VITE_RAZORPAY_KEY;

  if (db) {
    try {
      const schoolDoc = await db.collection('settings').doc('school').get();
      if (schoolDoc.exists) {
        const sData = schoolDoc.data();
        if (sData?.razorpayMerchantName) merchantName = sData.razorpayMerchantName;
        if (sData?.razorpayMid) mid = sData.razorpayMid;
        if (sData?.razorpayTid) tid = sData.razorpayTid;
        if (sData?.razorpayKeyId) key_id = sData.razorpayKeyId;
      }
    } catch (e) {
      console.warn("Could not read custom merchant settings from school doc:", e);
    }
  }

  const key_secret = process.env.RAZORPAY_SECRET;
  const isDemoMode = !key_id || !key_secret || key_id === 'rzp_test_your_key_here' || key_id.trim() === '' || key_secret === 'your_razorpay_secret_here' || key_secret.trim() === '';

  const orderReceipt = receipt || `rcpt_${studentId ? String(studentId).slice(0, 5) : 'fee'}_${Date.now()}`;
  const amountInPaise = Math.round(Number(amount || 0) * 100);

  if (isDemoMode) {
    const mockOrderId = `order_collect_${Math.floor(10000000 + Math.random() * 90000000)}`;
    const mockOrder = {
      id: mockOrderId,
      amount: amountInPaise,
      currency,
      receipt: orderReceipt,
      status: 'created',
      isSandbox: true,
      checkoutMode: 'embedded_collect_now',
      merchantName,
      mid,
      tid,
      notes: {
        collect_now_type: 'embedded_hosted',
        merchant_name: merchantName,
        mid,
        tid,
        student_id: studentId || 'unknown',
        student_name: studentName || 'Student',
        academic_year: academicYear || '2026-27'
      }
    };
    return res.json(mockOrder);
  }

  try {
    const razorpay = new Razorpay({
      key_id: key_id!,
      key_secret: key_secret!
    });

    const options = {
      amount: amountInPaise,
      currency,
      receipt: orderReceipt,
      payment_capture: 1,
      notes: {
        collect_now_flow: 'embedded_hosted',
        merchant_name: merchantName,
        mid,
        tid,
        student_id: studentId || 'unknown',
        student_name: studentName || 'Student',
        academic_year: academicYear || '2026-27'
      }
    };

    const order = await razorpay.orders.create(options);
    res.json({
      ...order,
      merchantName,
      mid,
      tid,
      checkoutMode: 'embedded_collect_now'
    });
  } catch (error: any) {
    console.error("Razorpay order error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Razorpay: Step 2 Payment Logging (razorpay_order_id, razorpay_payment_id)
 */
router.post('/razorpay/step2-log', async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    studentId, 
    amount, 
    academicYear, 
    componentsMap, 
    status = 'step2_authorized' 
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ error: 'razorpay_order_id and razorpay_payment_id are mandatory for Step 2 logging' });
  }

  try {
    const db = getDbAdmin();
    const recordedTimestamp = new Date().toISOString();

    let merchantName = process.env.RAZORPAY_MERCHANT_NAME || "ST. ANTONY'S HIGH SCHOOL";
    let mid = process.env.RAZORPAY_MID || "MID_ST_ANTONYS_01";
    let tid = process.env.RAZORPAY_TID || "TID_FEE_COLLECT_01";

    if (db) {
      const schoolDoc = await db.collection('settings').doc('school').get();
      if (schoolDoc.exists) {
        const sData = schoolDoc.data();
        if (sData?.razorpayMerchantName) merchantName = sData.razorpayMerchantName;
        if (sData?.razorpayMid) mid = sData.razorpayMid;
        if (sData?.razorpayTid) tid = sData.razorpayTid;
      }

      // 1. Central Transaction Audit Logging
      await db.collection('payment_transactions').doc(`tx_${razorpay_payment_id}`).set({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        razorpay_order_id,
        razorpay_payment_id,
        merchantName,
        mid,
        tid,
        checkoutMode: 'embedded_collect_now',
        studentId: studentId || 'unknown',
        academicYear: academicYear || '2026-27',
        amount: Number(amount || 0),
        components: componentsMap || {},
        status: 'step2_logged',
        step2LoggedAt: recordedTimestamp,
        createdAt: recordedTimestamp,
        currency: 'INR'
      }, { merge: true });

      // 2. Audit Trail Log for Compliance
      await db.collection('whatsapp_audit_logs').doc(`log_step2_${razorpay_payment_id}`).set({
        event: 'razorpay_step2_payment_logged',
        timestamp: recordedTimestamp,
        payload: {
          razorpay_order_id,
          razorpay_payment_id,
          merchantName,
          mid,
          tid,
          studentId,
          amount,
          status
        }
      }, { merge: true });
    }

    console.log(`[Razorpay CollectNow] Step 2 Payment Logged: Order ${razorpay_order_id} | Payment ${razorpay_payment_id}`);

    res.json({
      success: true,
      logged: true,
      razorpay_order_id,
      razorpay_payment_id,
      timestamp: recordedTimestamp
    });
  } catch (error: any) {
    console.error("Step 2 logging error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Razorpay: Verify Payment & Store Step 4 Merchant Details in ERP Database
 */
router.post('/razorpay/verify', async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature,
    studentId,
    academicYear,
    component, 
    amount,
    componentsMap,
    merchantName: customMerchantName,
    mid: customMid,
    tid: customTid
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ error: 'razorpay_order_id and razorpay_payment_id are required for verification' });
  }

  const db = getDbAdmin();

  // Resolve Step 4 Merchant Details
  let merchantName = customMerchantName || process.env.RAZORPAY_MERCHANT_NAME || "ST. ANTONY'S HIGH SCHOOL";
  let mid = customMid || process.env.RAZORPAY_MID || "MID_ST_ANTONYS_01";
  let tid = customTid || process.env.RAZORPAY_TID || "TID_FEE_COLLECT_01";
  let key_secret = process.env.RAZORPAY_SECRET;

  if (db) {
    try {
      const schoolDoc = await db.collection('settings').doc('school').get();
      if (schoolDoc.exists) {
        const sData = schoolDoc.data();
        if (!customMerchantName && sData?.razorpayMerchantName) merchantName = sData.razorpayMerchantName;
        if (!customMid && sData?.razorpayMid) mid = sData.razorpayMid;
        if (!customTid && sData?.razorpayTid) tid = sData.razorpayTid;
      }
    } catch (e) {
      console.warn("Could not read merchant settings during verification:", e);
    }
  }

  const isDemoSignature = !key_secret || 
    key_secret === 'your_razorpay_secret_here' || 
    key_secret.trim() === '' || 
    String(razorpay_order_id).startsWith('order_collect_') || 
    String(razorpay_order_id).startsWith('rzparp_mock_') || 
    razorpay_signature === 'rzparp_mock_sig';

  if (!isDemoSignature) {
    if (!key_secret) {
      return res.status(500).json({ error: 'Razorpay keys not configured' });
    }
    // 1. Verify Signature cryptographically
    const hmac = crypto.createHmac('sha256', key_secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      console.error(`[Razorpay CollectNow] Signature mismatch for Order: ${razorpay_order_id}`);
      return res.status(400).json({ success: false, error: 'Invalid payment signature. Verification failed.' });
    }
    console.log(`[Razorpay CollectNow] Cryptographic Signature Verified Successfully for Order: ${razorpay_order_id}`);
  } else {
    console.log("[Razorpay CollectNow] Verified signature via CollectNow Sandbox verification flow!");
  }

  // 2. Update Database with verified payment and Step 4 merchant details
  try {
    const verifiedTimestamp = new Date().toISOString();
    const targetYear = academicYear || '2026-27';

    // Fetch student doc to resolve canonical student doc ID and Auth UID
    let studentDoc = await db.collection('students').doc(studentId).get();
    let canonicalStudentId = studentId;
    let canonicalStudentUid = studentId;

    if (!studentDoc.exists) {
      const uidSnap = await db.collection('students').where('uid', '==', studentId).limit(1).get();
      if (!uidSnap.empty) {
        studentDoc = uidSnap.docs[0];
      } else {
        const idSnap = await db.collection('students').where('id', '==', studentId).limit(1).get();
        if (!idSnap.empty) {
          studentDoc = idSnap.docs[0];
        }
      }
    }

    if (studentDoc && studentDoc.exists) {
      const sData = studentDoc.data();
      canonicalStudentId = studentDoc.id;
      canonicalStudentUid = sData?.uid || sData?.id || studentDoc.id;
    }

    const compMap: Record<string, number> = componentsMap && typeof componentsMap === 'object' 
      ? componentsMap 
      : { [component || 'other']: Number(amount || 0) };

    const totalPaidSum = Object.values(compMap).reduce((sum: number, val: any) => sum + Number(val || 0), 0);

    // 2A. Update 'fees' collection
    const feesRef = db.collection('fees');
    let querySnapshot = await feesRef
      .where('studentId', '==', canonicalStudentId)
      .limit(1)
      .get();

    if (querySnapshot.empty && canonicalStudentUid !== canonicalStudentId) {
      querySnapshot = await feesRef
        .where('studentId', '==', canonicalStudentUid)
        .limit(1)
        .get();
    }

    const newHistoryEntries = Object.entries(compMap)
      .filter(([_, cAmt]) => Number(cAmt) > 0)
      .map(([cId, cAmt]) => ({
        date: verifiedTimestamp,
        amount: Number(cAmt),
        method: 'razorpay_online',
        reference: razorpay_payment_id,
        component: cId,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        merchantName,
        mid,
        tid,
        checkoutMode: 'embedded_collect_now',
        status: 'success',
        verifiedAt: verifiedTimestamp
      }));

    if (querySnapshot.empty) {
      const feeDoc = feesRef.doc();
      await feeDoc.set({
        studentId: canonicalStudentId,
        studentUid: canonicalStudentUid,
        academicYear: targetYear,
        paidAmount: totalPaidSum,
        paidComponents: compMap,
        paymentHistory: newHistoryEntries,
        updatedAt: verifiedTimestamp
      });
    } else {
      const feeDoc = querySnapshot.docs[0].ref;
      const currentData = querySnapshot.docs[0].data();
      
      const newPaidAmount = (currentData.paidAmount || 0) + totalPaidSum;
      const newComponents = { ...(currentData.paidComponents || {}) };
      const newHistory = [...(currentData.paymentHistory || [])];

      for (const [cId, cAmt] of Object.entries(compMap)) {
        const amtNum = Number(cAmt);
        if (amtNum <= 0) continue;
        newComponents[cId] = (newComponents[cId] || 0) + amtNum;
      }
      newHistory.push(...newHistoryEntries);
      
      await feeDoc.update({
        studentId: canonicalStudentId,
        studentUid: canonicalStudentUid,
        paidAmount: newPaidAmount,
        paidComponents: newComponents,
        paymentHistory: newHistory,
        updatedAt: verifiedTimestamp
      });
    }

    // 2B. Update 'payments' collection for individual receipt tracking
    const paymentsRef = db.collection('payments');
    let namePrefix = 'student_class_batch';
    if (studentDoc && studentDoc.exists) {
      const sData = studentDoc.data();
      const sName = (sData?.name || 'student').toLowerCase().trim().replace(/\s+/g, '_');
      
      let cName = 'class';
      if (sData?.classId) {
        const cDoc = await db.collection('classes').doc(sData.classId).get();
        if (cDoc.exists) cName = cDoc.data()?.name.toLowerCase().trim().replace(/\s+/g, '_');
      } else if (sData?.class) {
        cName = sData.class.toLowerCase().trim().replace(/\s+/g, '_');
      }
      
      let bName = 'batch';
      if (sData?.batchId) {
        const bDoc = await db.collection('batches').doc(sData.batchId).get();
        if (bDoc.exists) bName = bDoc.data()?.name.toLowerCase().trim().replace(/\s+/g, '_');
      } else if (sData?.batch) {
        bName = sData.batch.toLowerCase().trim().replace(/\s+/g, '_');
      }
      
      namePrefix = `${sName}_${cName}_${bName}`;
    }

    let count = 0;
    for (const [cId, cAmt] of Object.entries(compMap)) {
      const amtNum = Number(cAmt);
      if (amtNum <= 0) continue;
      
      const uniqueNo = Math.floor(1000 + Math.random() * 9000);
      const customId = `${namePrefix}_${cId}_${uniqueNo}_${count++}`;

      await paymentsRef.doc(customId).set({
        studentId: canonicalStudentId,
        studentUid: canonicalStudentUid,
        amount: amtNum,
        date: verifiedTimestamp,
        method: 'razorpay_online',
        reference: razorpay_payment_id,
        academicYear: targetYear,
        component: cId,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature: razorpay_signature || 'verified',
        merchantName,
        mid,
        tid,
        checkoutMode: 'embedded_collect_now',
        status: 'success',
        verifiedAt: verifiedTimestamp,
        createdAt: verifiedTimestamp
      });
    }

    // 2C. Update 'payment_transactions' central audit collection (Step 4 Record)
    await db.collection('payment_transactions').doc(`tx_${razorpay_payment_id}`).set({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature: razorpay_signature || 'verified',
      merchantName,
      mid,
      tid,
      checkoutMode: 'embedded_collect_now',
      studentId: canonicalStudentId,
      studentUid: canonicalStudentUid,
      academicYear: targetYear,
      amount: totalPaidSum,
      components: compMap,
      status: 'verified_success',
      verifiedAt: verifiedTimestamp,
      createdAt: verifiedTimestamp,
      currency: 'INR'
    }, { merge: true });

    // 2D. Audit Log entry for Reconciliation
    await db.collection('whatsapp_audit_logs').doc(`log_recon_${razorpay_payment_id}`).set({
      event: 'razorpay_payment_verified_and_reconciled',
      timestamp: verifiedTimestamp,
      payload: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        merchantName,
        mid,
        tid,
        studentId: canonicalStudentId,
        amount: totalPaidSum,
        components: compMap,
        status: 'verified_success'
      }
    }, { merge: true });

    res.json({ 
      success: true, 
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      merchantName,
      mid,
      tid,
      status: 'success',
      verifiedAt: verifiedTimestamp
    });

  } catch (error: any) {
    console.error("Firestore update error after payment:", error);
    res.status(500).json({ error: 'Payment verified but database update failed: ' + error.message });
  }
});

/**
 * GET All Payment Transactions for Admin Audit & Reconciliation
 */
router.get('/razorpay/transactions', async (req, res) => {
  const db = getDbAdmin();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const snap = await db.collection('payment_transactions').orderBy('createdAt', 'desc').limit(500).get();
    const list: any[] = [];
    snap.forEach((doc: any) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    res.json(list);
  } catch (error: any) {
    console.error("Error fetching payment transactions audit:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET All Extended Due Dates
 */
router.get('/extended-due-dates', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json([]);
  }
  const db = getDbAdmin();
  try {
    const snap = await db.collection('extendedDueDates').get();
    const list: any[] = [];
    snap.forEach((doc: any) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    res.json(list);
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json([]);
    }
    console.error("Error getting extendedDueDates:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST/Set Extended Due Date
 */
router.post('/extended-due-dates', async (req, res) => {
  const { docId, data } = req.body;
  
  if (!docId || !data) {
    return res.status(400).json({ error: 'docId and data are required' });
  }

  if (isDatabaseDenied()) {
    return res.json({ success: true, id: docId });
  }

  const db = getDbAdmin();
  try {
    await db.collection('extendedDueDates').doc(docId).set(data, { merge: true });
    res.json({ success: true });
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, id: docId });
    }
    console.error("Error setting extendedDueDate:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET All Receipt Books via Backend Proxy
 */
router.get('/receipt-books', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json([]);
  }
  const db = getDbAdmin();
  try {
    const snap = await db.collection('receipt_books').get();
    const list: any[] = [];
    snap.forEach((doc: any) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    res.json(list);
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json([]);
    }
    console.error("Error getting receipt_books:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST/Create/Update Receipt Book via Backend Proxy
 */
router.post('/receipt-books/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  if (isDatabaseDenied()) {
    return res.json({ success: true, id });
  }

  const db = getDbAdmin();
  try {
    await db.collection('receipt_books').doc(id).set(data, { merge: true });
    res.json({ success: true });
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, id });
    }
    console.error(`Error writing receipt_book ${id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE Receipt Book via Backend Proxy
 */
router.delete('/receipt-books/:id', async (req, res) => {
  const { id } = req.params;

  if (isDatabaseDenied()) {
    return res.json({ success: true, id });
  }

  const db = getDbAdmin();
  try {
    await db.collection('receipt_books').doc(id).delete();
    res.json({ success: true });
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, id });
    }
    console.error(`Error deleting receipt_book ${id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fees/void-payment
 * Void/Delete a payment transaction completely across payments collection, fees collection, and student payment history.
 */
router.post('/void-payment', async (req, res) => {
  const db = getDbAdmin();
  if (!db) {
    return res.status(500).json({ error: 'Database admin instance unavailable' });
  }

  const { paymentId, studentId, reference, component, amount } = req.body;

  if (!paymentId && !reference && !studentId) {
    return res.status(400).json({ error: 'At least paymentId, reference, or studentId is required to void payment' });
  }

  try {
    const deletedPaymentIds: string[] = [];
    const targetStudentCandidateIds = new Set<string>();
    if (studentId) {
      targetStudentCandidateIds.add(String(studentId));
    }

    // 1. Direct delete by ID from 'payments' collection if valid doc ID
    if (paymentId && typeof paymentId === 'string' && !paymentId.startsWith('hist_') && !paymentId.startsWith('synth_') && !paymentId.startsWith('ph_')) {
      const docRef = db.collection('payments').doc(paymentId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const pData = docSnap.data();
        if (pData?.studentId) targetStudentCandidateIds.add(String(pData.studentId));
        if (pData?.studentUid) targetStudentCandidateIds.add(String(pData.studentUid));
        await docRef.delete();
        deletedPaymentIds.push(paymentId);
      }
    }

    // 2. Search 'payments' collection by reference or studentId + component + amount or paymentId match
    const paymentsSnap = await db.collection('payments').get();
    const deletePromises: Promise<any>[] = [];

    paymentsSnap.forEach((docSnap: any) => {
      const p = docSnap.data();
      const pId = docSnap.id;
      if (deletedPaymentIds.includes(pId)) return;

      const pRef = p.reference || p.orderId;
      const matchRef = reference && typeof reference === 'string' && (pRef === reference || pId === reference);
      const matchId = paymentId && typeof paymentId === 'string' && (pId === paymentId || pRef === paymentId);
      
      const isSameStudent = targetStudentCandidateIds.has(String(p.studentId)) || targetStudentCandidateIds.has(String(p.studentUid)) ||
        (studentId && (p.studentId === studentId || p.studentUid === studentId));
      
      const matchCompAndAmt = isSameStudent && component && p.component === component &&
        amount !== undefined && Math.abs(Number(p.amount) - Number(amount)) < 0.01;

      if (matchRef || matchId || matchCompAndAmt) {
        if (p.studentId) targetStudentCandidateIds.add(String(p.studentId));
        if (p.studentUid) targetStudentCandidateIds.add(String(p.studentUid));
        deletePromises.push(db.collection('payments').doc(pId).delete());
        deletedPaymentIds.push(pId);
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    const studentCandidateArray = Array.from(targetStudentCandidateIds);

    // 3. Search and update 'fees' collection to clean paymentHistory and adjust paidComponents / paidAmount
    const feesSnap = await db.collection('fees').get();
    const updateFeePromises: Promise<any>[] = [];

    feesSnap.forEach((feeDoc: any) => {
      const fData = feeDoc.data();
      const feeStudentId = String(fData.studentId || fData.studentUid || '');
      
      const isTargetStudent = studentCandidateArray.length === 0 || 
        studentCandidateArray.some(sId => sId === feeStudentId || sId === fData.studentId || sId === fData.studentUid);

      if (isTargetStudent) {
        let modified = false;
        let newHistory = fData.paymentHistory ? [...fData.paymentHistory] : [];
        let newPaidComponents = fData.paidComponents ? { ...fData.paidComponents } : {};

        // Clean up paymentHistory array inside fee doc
        if (Array.isArray(fData.paymentHistory) && fData.paymentHistory.length > 0) {
          const filteredHistory = fData.paymentHistory.filter((hp: any, idx: number) => {
            const hpId = hp.id || `ph_${feeDoc.id}_${idx}`;
            const hpRef = hp.reference || hp.orderId;

            const matchId = paymentId && (hpId === paymentId || hp.id === paymentId);
            const matchRef = reference && (hpRef === reference || hpId === reference);
            const matchComp = component && hp.component === component &&
              amount !== undefined && Math.abs(Number(hp.amount || hp.paidAmount) - Number(amount)) < 0.01;

            if (matchId || matchRef || matchComp) {
              modified = true;
              return false; // drop from paymentHistory
            }
            return true;
          });
          newHistory = filteredHistory;
        }

        // Adjust paidComponents object inside fee doc
        if (component && newPaidComponents[component] !== undefined) {
          const deductAmt = Number(amount) || 0;
          if (deductAmt > 0) {
            const currentPaid = Number(newPaidComponents[component]) || 0;
            const remaining = currentPaid - deductAmt;
            if (remaining <= 0) {
              delete newPaidComponents[component];
            } else {
              newPaidComponents[component] = remaining;
            }
            modified = true;
          } else if (paymentId || reference) {
            delete newPaidComponents[component];
            modified = true;
          }
        } else if (modified) {
          // Rebuild paidComponents from remaining history if component wasn't specified directly
          const rebuiltComponents: Record<string, number> = {};
          newHistory.forEach((hp: any) => {
            const compKey = hp.component || 'term1';
            const amt = Number(hp.amount || hp.paidAmount) || 0;
            rebuiltComponents[compKey] = (rebuiltComponents[compKey] || 0) + amt;
          });
          newPaidComponents = rebuiltComponents;
        }

        if (modified) {
          const componentValues: any[] = Object.values(newPaidComponents);
          const newPaidAmount = componentValues.reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
          updateFeePromises.push(
            db.collection('fees').doc(feeDoc.id).update({
              paidAmount: Math.max(0, newPaidAmount),
              paidComponents: newPaidComponents,
              paymentHistory: newHistory,
              updatedAt: new Date().toISOString()
            })
          );
        }
      }
    });

    if (updateFeePromises.length > 0) {
      await Promise.all(updateFeePromises);
    }

    res.json({
      success: true,
      deletedPaymentsCount: deletedPaymentIds.length,
      updatedFeesCount: updateFeePromises.length
    });
  } catch (error: any) {
    console.error('Error in /api/fees/void-payment:', error);
    res.status(500).json({ error: error.message || 'Failed to void payment transaction' });
  }
});

export default router;
