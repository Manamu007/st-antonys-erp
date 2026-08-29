import crypto from 'crypto';
import { getDbAdmin } from './firebaseAdmin.js';
import admin from './firebaseAdmin.js';

/**
 * Cascadingly extracts the best available parent or student contact phone number from a record.
 */
export function extractParentPhone(s: any): string {
  if (!s || typeof s !== 'object') return '';
  const raw = 
    s.whatsappNumber ||
    s.parentPhone ||
    s.parentMobile ||
    s.parent_phone ||
    s.fatherPhone ||
    s.fatherMobile ||
    s.father_phone ||
    s.motherPhone ||
    s.motherMobile ||
    s.mother_phone ||
    s.guardianPhone ||
    s.guardianMobile ||
    s.contact ||
    s.phone ||
    s.phoneNumber ||
    s.mobile ||
    s.mobileNumber ||
    s.emergencyContact ||
    '';
  return String(raw).trim();
}

/**
 * Normalizes Indian phone numbers to modern E.164 standards.
 * E.g., +91XXXXXXXXXX
 */
export function normalizeIndianPhone(phone: any): string {
  if (!phone) return '';
  const trimmed = String(phone).trim();

  // If it's a group, newsletter, or LID JID, pass it through intact
  if (trimmed.endsWith('@g.us') || trimmed.endsWith('@newsletter') || trimmed.endsWith('@lid')) {
    return trimmed;
  }

  let cleaned = trimmed.replace(/\D/g, '');
  
  // If it's a user JID like 919441133118@s.whatsapp.net
  if (trimmed.includes('@')) {
    const parts = trimmed.split('@');
    let jidUser = parts[0];
    if (jidUser.includes(':')) {
      jidUser = jidUser.split(':')[0];
    }
    cleaned = jidUser.replace(/\D/g, '');
  }

  // Strip leading zeroes (e.g. 09441133118 or 00919441133118)
  while (cleaned.length > 10 && cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }
  
  return cleaned ? `+${cleaned}` : trimmed;
}

/**
 * Masks sensitive authentication details, private credentials, or QR state before logging.
 */
export function maskSensitiveData(data: any): any {
  if (!data) return data;
  if (typeof data !== 'object') return data;

  const sensitiveKeys = ['creds', 'keys', 'auth', 'token', 'session', 'qr', 'secret', 'password', 'privateKey', 'noiseKey', 'signalIdentities'];
  const cloned = { ...data };

  for (const key of Object.keys(cloned)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      cloned[key] = '[MASKED / SECURED]';
    } else if (typeof cloned[key] === 'object') {
      cloned[key] = maskSensitiveData(cloned[key]);
    }
  }
  return cloned;
}

/**
 * Safe logger for WhatsApp events ensuring no data exposure.
 */
export function safeLogWhatsappEvent(eventName: string, payload: any = {}) {
  const maskedPayload = maskSensitiveData(payload);
  const timestamp = new Date().toISOString();
  console.log(`[WhatsApp Event] [${timestamp}] ${eventName}:`, JSON.stringify(maskedPayload));
  
  try {
    const db = getDbAdmin();
    if (db) {
      db.collection('whatsapp_audit_logs').add({
        event: eventName,
        payload: maskedPayload,
        timestamp,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString() // 30 days retention
      });
    }
  } catch (err: any) {
    console.warn(`[SafeLog] Failed to persist audit log: ${err.message}`);
  }
}

/**
 * Priority message rates helper. Ensures fast real-time queue processing while maintaining smooth delivery.
 */
export function getDelayForPriority(priority: number): number {
  let min = 1500;
  let max = 2500;

  switch (priority) {
    case 0: // P0 Emergency / Leave approvals
      min = 500;
      max = 1000;
      break;
    case 1: // P1 Attendance alerts
      min = 1000;
      max = 1800;
      break;
    case 2: // P2 Fee reminders, exam status
      min = 1200;
      max = 2200;
      break;
    case 3: // P3 Broadcasts, birthday wishes
    default:
      min = 1500;
      max = 2500;
      break;
  }

  const delayMs = Math.floor(min + Math.random() * (max - min));
  return delayMs;
}

/**
 * Leaves Approval token security helpers
 */
export async function createLeaveActionTokens(leaveId: string): Promise<{ approveToken: string; rejectToken: string }> {
  const db = getDbAdmin();
  const approveToken = crypto.randomBytes(24).toString('hex');
  const rejectToken = crypto.randomBytes(24).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry
  const nowStr = new Date().toISOString();

  let applicantId = '';
  let applicantType = 'student';
  try {
    const leaveDoc = await db.collection('leaves').doc(leaveId).get();
    if (leaveDoc.exists) {
      const data = leaveDoc.data()!;
      applicantId = data.applicantId || '';
      applicantType = data.applicantType || (data.applicantRole === 'student' ? 'student' : 'staff');
    }
  } catch (err: any) {
    console.warn(`[Leave Tokens] Failed to fetch leave request for extra fields:`, err.message);
  }

  const tokenBatch = db.batch();
  
  tokenBatch.set(db.collection('whatsapp_action_tokens').doc(approveToken), {
    tokenId: approveToken,
    leaveId,
    leaveType: applicantType,
    applicantId,
    applicantType,
    approverId: '',
    approverPhone: '',
    action: 'approved',
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: nowStr,
    expiresAt: expiry,
    used: false,
    status: 'active',
    source: 'ai_bot_leave_apply',
    createdBy: applicantId
  });

  tokenBatch.set(db.collection('whatsapp_action_tokens').doc(rejectToken), {
    tokenId: rejectToken,
    leaveId,
    leaveType: applicantType,
    applicantId,
    applicantType,
    approverId: '',
    approverPhone: '',
    action: 'rejected',
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: nowStr,
    expiresAt: expiry,
    used: false,
    status: 'active',
    source: 'ai_bot_leave_apply',
    createdBy: applicantId
  });

  await tokenBatch.commit();
  console.log(`[Leave Tokens] Secure action tokens created for leave ${leaveId}.`);

  return { approveToken, rejectToken };
}

/**
 * Verifies a leave action token and consumes it if valid.
 */
export async function consumeLeaveActionToken(token: string): Promise<{ leaveId: string; action: string } | null> {
  try {
    const db = getDbAdmin();
    const docRef = db.collection('whatsapp_action_tokens').doc(token);
    
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        console.warn(`[Leave Tokens] Fetch failed: Token ${token} does not exist.`);
        return null;
      }
      
      const data = doc.data()!;
      if (data.used) {
        console.warn(`[Leave Tokens] Warning: Replay attempt blocked. Token ${token} already used.`);
        return null;
      }
      
      const isExpired = new Date(data.expiresAt).getTime() < Date.now();
      if (isExpired) {
        console.warn(`[Leave Tokens] Token ${token} expired.`);
        return null;
      }

      transaction.update(docRef, { used: true, usedAt: new Date().toISOString() });
      return { leaveId: data.leaveId, action: data.action };
    });
  } catch (err: any) {
    console.error(`[Leave Tokens] Verification transaction failed:`, err.message);
    return null;
  }
}
