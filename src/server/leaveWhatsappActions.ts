import crypto from 'crypto';
import { getDbAdmin } from './firebaseAdmin.js';
import { sendMessage } from './whatsapp.js';
import { normalizeIndianPhone, safeLogWhatsappEvent } from './whatsappUtils.js';

export interface LeaveRequestData {
  id?: string;
  applicantId: string;
  applicantName: string;
  applicantRole: string;
  applicantType: 'staff' | 'student';
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedDate: string;
  createdAt?: string;
  updatedAt?: string;
  whatsappNumber?: string;
  classId?: string;
  batchId?: string;
}

/**
 * Creates secure approve and reject action tokens for a specific approver.
 */
export async function createLeaveActionTokensForApprover(
  leaveId: string,
  leaveType: 'student' | 'staff',
  approverInfo: { uid: string; phone: string; name: string },
  applicantInfo: { applicantId: string; applicantType: 'student' | 'staff' },
  source: 'web_leave_apply' | 'ai_bot_leave_apply'
): Promise<{ approveToken: string; rejectToken: string }> {
  const db = getDbAdmin();
  const approveToken = crypto.randomBytes(24).toString('hex');
  const rejectToken = crypto.randomBytes(24).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry
  const nowStr = new Date().toISOString();

  const batch = db.batch();

  const approveRef = db.collection('whatsapp_action_tokens').doc(approveToken);
  batch.set(approveRef, {
    tokenId: approveToken,
    leaveId,
    leaveType,
    applicantId: applicantInfo.applicantId,
    applicantType: applicantInfo.applicantType,
    approverId: approverInfo.uid,
    approverPhone: normalizeIndianPhone(approverInfo.phone),
    action: 'approved',
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: nowStr,
    expiresAt: expiry,
    used: false,
    status: 'active',
    source,
    createdBy: applicantInfo.applicantId
  });

  const rejectRef = db.collection('whatsapp_action_tokens').doc(rejectToken);
  batch.set(rejectRef, {
    tokenId: rejectToken,
    leaveId,
    leaveType,
    applicantId: applicantInfo.applicantId,
    applicantType: applicantInfo.applicantType,
    approverId: approverInfo.uid,
    approverPhone: normalizeIndianPhone(approverInfo.phone),
    action: 'rejected',
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: nowStr,
    expiresAt: expiry,
    used: false,
    status: 'active',
    source,
    createdBy: applicantInfo.applicantId
  });

  await batch.commit();

  safeLogWhatsappEvent('leave_approval_tokens_created', {
    leaveId,
    leaveType,
    approverId: approverInfo.uid,
    approverPhone: normalizeIndianPhone(approverInfo.phone),
    source
  });

  return { approveToken, rejectToken };
}

/**
 * Resolves authorized approvers depending on leave type.
 */
export async function resolveAuthorizedApprovers(
  leaveData: LeaveRequestData
): Promise<Array<{ uid: string; phone: string; name: string; role: string }>> {
  const db = getDbAdmin();
  const isStudent = leaveData.applicantType === 'student';

  const approversMap = new Map<string, { uid: string; phone: string; name: string; role: string }>();

  // Helper to add approver safely with normalization and deduplication
  const addApprover = (uid: string, rawPhone: string, name: string, role: string) => {
    if (!rawPhone) {
      console.warn(`[Approver Resolution] Approver ${name} has missing phone.`);
      return;
    }
    const phone = normalizeIndianPhone(rawPhone);
    if (!phone || phone.length < 10) {
      console.warn(`[Approver Resolution] Approver ${name} has invalid normal phone: ${rawPhone}`);
      return;
    }
    // Dedup by phone
    if (!approversMap.has(phone)) {
      approversMap.set(phone, { uid, phone, name, role });
    }
  };

  // 1. Fetch from 'staff' collection which holds profiles
  try {
    const staffSnap = await db.collection('staff').get();
    for (const doc of staffSnap.docs) {
      const data = doc.data();
      const role = data.role || '';
      const phone = data.whatsappNumber || data.phone || '';
      const name = data.name || data.fullName || 'Authorized Approver';
      const uid = data.uid || doc.id;

      // Administrators & management are always authorized approvers
      if (['admin', 'vice_principal', 'principal', 'management'].includes(role.toLowerCase())) {
        addApprover(uid, phone, name, role);
      }
    }
  } catch (err: any) {
    console.error(`[Approver Resolution] Error reading 'staff':`, err.message);
  }

  // 2. Fetch from 'users' collection too (to handle fallback/additional profiles)
  try {
    const usersSnap = await db.collection('users').get();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const role = data.role || '';
      const phone = data.whatsappNumber || data.phone || '';
      const name = data.name || 'Admin';
      const uid = doc.id;

      if (['admin', 'vice_principal', 'principal', 'management'].includes(role.toLowerCase())) {
        addApprover(uid, phone, name, role);
      }
    }
  } catch (err: any) {
    console.error(`[Approver Resolution] Error reading 'users':`, err.message);
  }

  // 3. For student leaves: resolve Class Teacher if classId is provided
  if (isStudent && leaveData.classId) {
    try {
      const classDoc = await db.collection('classes').doc(leaveData.classId).get();
      if (classDoc.exists) {
        const classTeacherId = classDoc.data()?.classTeacherId;
        if (classTeacherId) {
          // Find class teacher details
          let teacherName = 'Class Teacher';
          let teacherPhone = '';

          const teacherUserDoc = await db.collection('users').doc(classTeacherId).get();
          if (teacherUserDoc.exists) {
            teacherPhone = teacherUserDoc.data()?.whatsappNumber || teacherUserDoc.data()?.phone || '';
            teacherName = teacherUserDoc.data()?.name || teacherName;
          }

          const teacherStaffDoc = await db.collection('staff').doc(classTeacherId).get();
          if (teacherStaffDoc.exists) {
            teacherPhone = teacherStaffDoc.data()?.whatsappNumber || teacherStaffDoc.data()?.phone || teacherPhone;
            teacherName = teacherStaffDoc.data()?.name || teacherStaffDoc.data()?.fullName || teacherName;
          }

          if (teacherPhone) {
            addApprover(classTeacherId, teacherPhone, teacherName, 'class_teacher');
          } else {
            console.warn(`[Approver Resolution] Class Teacher ${teacherName} has no phone number.`);
          }
        }
      }
    } catch (err: any) {
      console.error(`[Approver Resolution] Error resolving Class Teacher:`, err.message);
    }
  }

  return Array.from(approversMap.values());
}

/**
 * Build leave details formatted message for WhatsApp approval.
 */
export async function buildLeaveApprovalMessage(
  leaveData: LeaveRequestData,
  approveToken: string,
  rejectToken: string
): Promise<string> {
  const db = getDbAdmin();
  const isStudent = leaveData.applicantType === 'student';

  let detailLine = '';
  if (isStudent && leaveData.classId) {
    let className = 'Class Room';
    try {
      const classDoc = await db.collection('classes').doc(leaveData.classId).get();
      if (classDoc.exists) {
        className = classDoc.data()?.name || className;
      }
    } catch (e: any) {
      console.warn('[Message Builder] Class fetch fail:', e.message);
    }
    detailLine = `*Class/Section:* ${className}`;
  } else {
    // Staff details
    let roleName = leaveData.applicantRole || 'Staff Member';
    let deptName = 'N/A';
    try {
      const staffDoc = await db.collection('staff').doc(leaveData.applicantId).get();
      if (staffDoc.exists) {
        roleName = staffDoc.data()?.designation || staffDoc.data()?.role || roleName;
        deptName = staffDoc.data()?.department || deptName;
      }
    } catch (e: any) {
      console.warn('[Message Builder] Staff fetch fail:', e.message);
    }
    detailLine = `*Role/Designation:* ${roleName}\n*Department:* ${deptName}`;
  }

  // Calculate days
  let daysCount = 1;
  try {
    const start = new Date(leaveData.startDate).getTime();
    const end = new Date(leaveData.endDate).getTime();
    if (!isNaN(start) && !isNaN(end)) {
      const diffTime = Math.abs(end - start);
      daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
  } catch (e) {
    daysCount = 1;
  }

  const schoolTitle = 'St. Antony’s School';
  const appliedDateStr = new Date(leaveData.appliedDate || leaveData.createdAt || Date.now()).toLocaleDateString('en-GB');

  return `*${schoolTitle}* 🏛️\n` +
         `*Leave Type:* ${isStudent ? 'Student Leave' : 'Staff Leave'}\n` +
         `*Applicant:* ${leaveData.applicantName}\n` +
         `${detailLine}\n` +
         `*Dates:* ${leaveData.startDate} to ${leaveData.endDate} (${daysCount} day${daysCount > 1 ? 's' : ''})\n` +
         `*Reason:* ${leaveData.reason}\n` +
         `*Applied Date:* ${appliedDateStr}\n\n` +
         `--- Leave Action (ఆమోదం / తిరస్కరణ) ---\n` +
         `Please reply with the option number:\n\n` +
         `👉 *1* - To Approve (ఆమోదించడానికి)\n` +
         `👉 *2* - To Reject (తిరస్కరించడానికి)`;
}

/**
 * Creates action tokens and queues WhatsApp approval notifications for all authorized approvers.
 */
export async function queueLeaveApprovalWhatsApp(
  leaveId: string,
  source: 'web_leave_apply' | 'ai_bot_leave_apply'
): Promise<{
  approversFound: number;
  messagesQueued: number;
  missingApproverPhone: number;
  tokensCreated: number;
  duplicatesSkipped: number;
  failed: boolean;
  error?: string;
}> {
  try {
    const db = getDbAdmin();
    const leaveSnap = await db.collection('leaves').doc(leaveId).get();
    
    if (!leaveSnap.exists) {
      return { approversFound: 0, messagesQueued: 0, missingApproverPhone: 0, tokensCreated: 0, duplicatesSkipped: 0, failed: true, error: 'Leave request not found' };
    }

    const leaveData = { id: leaveId, ...leaveSnap.data() } as LeaveRequestData;
    const applicantType = leaveData.applicantType || 'student';
    const applicantId = leaveData.applicantId || 'unknown';

    // Resolve approvers
    const approvers = await resolveAuthorizedApprovers(leaveData);
    if (approvers.length === 0) {
      console.warn(`[Leave Approval Main] No authorized approvers with valid phone numbers resolved for leave ${leaveId}.`);
      return { approversFound: 0, messagesQueued: 0, missingApproverPhone: 0, tokensCreated: 0, duplicatesSkipped: 0, failed: false };
    }

    // Get schoolId
    let schoolId = 'st_antonys_school';
    try {
      const schoolDoc = await db.collection('settings').doc('school').get();
      if (schoolDoc.exists && schoolDoc.data()?.schoolId) {
        schoolId = schoolDoc.data()?.schoolId;
      }
    } catch (e) {}

    let tokensCreatedCount = 0;
    let messagesQueuedCount = 0;
    let duplicatesSkippedCount = 0;

    for (const approver of approvers) {
      // Create tokens bound to this specific approver phone
      const tokens = await createLeaveActionTokensForApprover(
        leaveId,
        applicantType,
        approver,
        { applicantId, applicantType },
        source
      );
      tokensCreatedCount += 2; // Approved & Rejected tokens

      // Build formatted approval message
      const textMessage = await buildLeaveApprovalMessage(leaveData, tokens.approveToken, tokens.rejectToken);

      // Set options as requested by PART 8 (Do not send buttons)
      const options = {
        leaveId,
        leaveType: applicantType,
        applicantId,
        applicantType,
        approverId: approver.uid,
        templateType: 'leave_approval_request',
        messageType: applicantType === 'student' ? 'student_leave_approval_request' : 'staff_leave_approval_request',
        eventType: 'leave_approval_request',
        priority: 0,
        source,
        date: leaveData.appliedDate || new Date().toISOString().split('T')[0],
        schoolId,
        forceSend: false
      };

      // Queue the message via sendMessage
      const sendResult = await sendMessage(approver.phone, textMessage, options, 'bot');
      if (sendResult.success) {
        if (sendResult.skipped) {
          duplicatesSkippedCount++;
        } else {
          messagesQueuedCount++;
        }
      }
    }

    safeLogWhatsappEvent('leave_approval_whatsapp_queued', {
      leaveId,
      applicantId,
      approversContacted: messagesQueuedCount,
      duplicatesSkipped: duplicatesSkippedCount,
      source
    });

    return {
      approversFound: approvers.length,
      messagesQueued: messagesQueuedCount,
      missingApproverPhone: 0, // already excluded by resolver
      tokensCreated: tokensCreatedCount,
      duplicatesSkipped: duplicatesSkippedCount,
      failed: false
    };
  } catch (err: any) {
    console.error(`[Leave Approval Queue System] Failed:`, err.message);
    return {
      approversFound: 0,
      messagesQueued: 0,
      missingApproverPhone: 0,
      tokensCreated: 0,
      duplicatesSkipped: 0,
      failed: true,
      error: err.message
    };
  }
}

/**
 * Handle verification of tokens and update states.
 */
export async function consumeLeaveActionToken(
  tokenString: string,
  senderPhone?: string
): Promise<{ success: boolean; message: string; errorType?: string }> {
  const db = getDbAdmin();
  const tokenDocRef = db.collection('whatsapp_action_tokens').doc(tokenString);
  let approvedLeaveId: string | null = null;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const tokenDoc = await transaction.get(tokenDocRef);

      if (!tokenDoc.exists) {
        console.warn(`[Leave Token Security] Token doesn't exist: ${tokenString}`);
        return {
          success: false,
          errorType: 'invalid',
          message: '⚠️ Security Check Failed: This leave action is invalid, already used, or expired.'
        };
      }

      const tokenData = tokenDoc.data()!;
      
      // Check replay attacks / used
      if (tokenData.used || tokenData.status === 'used') {
        safeLogWhatsappEvent('leave_action_token_already_used', { tokenId: tokenString, senderPhone });
        return {
          success: false,
          errorType: 'already_used',
          message: '⚠️ Security Check Failed: This leave action is invalid, already used, or expired.'
        };
      }

      // Check expired
      const isExpired = new Date(tokenData.expiresAt).getTime() < Date.now();
      if (isExpired || tokenData.status === 'expired') {
        transaction.update(tokenDocRef, { status: 'expired' });
        safeLogWhatsappEvent('leave_action_token_expired', { tokenId: tokenString, senderPhone });
        return {
          success: false,
          errorType: 'expired',
          message: '⚠️ Security Check Failed: This leave action is invalid, already used, or expired.'
        };
      }

      // Verify phone binding (PART 6)
      if (senderPhone && tokenData.approverPhone) {
        const normSender = normalizeIndianPhone(senderPhone);
        const normApprover = normalizeIndianPhone(tokenData.approverPhone);
        if (normSender !== normApprover) {
          safeLogWhatsappEvent('leave_action_token_phone_mismatch', {
            tokenId: tokenString,
            senderPhone: normSender,
            expectedPhone: normApprover,
            leaveId: tokenData.leaveId
          });
          return {
            success: false,
            errorType: 'phone_mismatch',
            message: '⚠️ Security Check Failed: This leave action can only be used by the authorized approver.'
          };
        }
      }

      // Read leave document
      const leaveId = tokenData.leaveId;
      const leaveDocRef = db.collection('leaves').doc(leaveId);
      const leaveDoc = await transaction.get(leaveDocRef);

      if (!leaveDoc.exists) {
        return {
          success: false,
          errorType: 'leave_missing',
          message: '⚠️ Error: The associated leave request could not be found.'
        };
      }

      const leaveData = leaveDoc.data()! as LeaveRequestData;
      if (leaveData.status !== 'pending') {
        return {
          success: false,
          errorType: 'leave_not_pending',
          message: `⚠️ Leave request is no longer pending (already ${leaveData.status}).`
        };
      }

      // Resolve approver name
      let approverName = 'Authorized Approver';
      try {
        const approverDoc = await db.collection('staff').doc(tokenData.approverId).get();
        if (approverDoc.exists) {
          approverName = approverDoc.data()?.name || approverDoc.data()?.fullName || approverName;
        } else {
          const approverUserDoc = await db.collection('users').doc(tokenData.approverId).get();
          if (approverUserDoc.exists) {
            approverName = approverUserDoc.data()?.name || approverName;
          }
        }
      } catch (e) {}

      const actionText = tokenData.action === 'approved' ? 'approved' : 'rejected';
      if (actionText === 'approved') {
        approvedLeaveId = leaveId;
      }

      // Update state in one atomic transaction
      transaction.update(tokenDocRef, {
        used: true,
        usedAt: new Date().toISOString(),
        status: 'used',
        usedBy: tokenData.approverId || '',
        usedByPhone: senderPhone || ''
      });

      transaction.update(leaveDocRef, {
        status: actionText,
        approverId: tokenData.approverId || '',
        approverName: approverName,
        approvalDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Log successful consumption (PART 11)
      safeLogWhatsappEvent('leave_action_token_consumed', {
        tokenId: tokenString,
        leaveId,
        action: actionText,
        approverName,
        senderPhone
      });

      // Queue Applicant Notification Message
      if (leaveData.whatsappNumber) {
        const normApplicantPhone = normalizeIndianPhone(leaveData.whatsappNumber);
        const statusEmoji = actionText === 'approved' ? '✅' : '❌';
        const schoolTitle = 'St. Antony’s School';
        
        const applicantMsgText = `🔔 *${schoolTitle}*:\n\nDear ${leaveData.applicantName}, your leave request from ${leaveData.startDate} to ${leaveData.endDate} has been *${actionText.toUpperCase()}* ${statusEmoji} by ${approverName}.`;

        let schoolId = 'st_antonys_school';
        try {
          const schoolDoc = await db.collection('settings').doc('school').get();
          if (schoolDoc.exists && schoolDoc.data()?.schoolId) {
            schoolId = schoolDoc.data()?.schoolId;
          }
        } catch (e) {}

        const options = {
          leaveId,
          leaveType: leaveData.applicantType,
          applicantId: leaveData.applicantId || '',
          templateType: 'leave_status',
          messageType: leaveData.applicantType === 'student' 
            ? (actionText === 'approved' ? 'student_leave_approved' : 'student_leave_rejected')
            : (actionText === 'approved' ? 'staff_leave_approved' : 'staff_leave_rejected'),
          eventType: 'leave_status',
          priority: 0,
          source: 'leave_action_token',
          date: new Date().toISOString().split('T')[0],
          schoolId,
          forceSend: false
        };

        const notifyResult = await sendMessage(normApplicantPhone, applicantMsgText, options, 'bot');
        if (notifyResult.success) {
          safeLogWhatsappEvent('leave_status_notification_queued', { leaveId, recipient: normApplicantPhone, status: actionText });
        } else {
          safeLogWhatsappEvent('leave_status_notification_failed', { leaveId, recipient: normApplicantPhone, error: notifyResult.reason });
        }
      }

      return {
        success: true,
        message: `✅ Leave request for *${leaveData.applicantName}* has been successfully *${actionText}* via secure one-time action link.`
      };
    });

    if (result && result.success && approvedLeaveId) {
      // Trigger Teacher Substitution Engine asynchronously
      import('../whatsapp_bot_v2/services/substitutionEngine.js')
        .then(({ runTeacherSubstitutionEngine }) => {
          runTeacherSubstitutionEngine(approvedLeaveId!).catch(err => {
            console.error('[Substitution Engine] Failed in consumeLeaveActionToken background execution:', err);
          });
        })
        .catch(err => {
          console.error('[Substitution Engine] Failed to import substitutionEngine in consumeLeaveActionToken:', err);
        });
    }

    return result;
  } catch (err: any) {
    console.error(`[Leave Token Consume Transaction Fail]`, err.message);
    return {
      success: false,
      errorType: 'transaction_failed',
      message: '⚠️ Error: A system transaction failure occurred while completing this action.'
    };
  }
}
