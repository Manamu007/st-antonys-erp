import { getDbAdmin } from '../../firebaseAdmin.js';

export interface AiSecurityAuditLog {
  schoolId: string;
  userId: string;
  userRole: string;
  attemptedSpoofRole?: string;
  attemptedSpoofSchoolId?: string;
  attemptedSpoofHospitalId?: string;
  attemptedStudentId?: string;
  action: "SPOOF_ATTEMPT_BLOCKED" | "RATE_LIMIT_BLOCKED" | "AI_REQUEST_ALLOWED";
  blockedReason?: string;
  createdAt: string;
}

/**
 * Writes a security audit log record to Firestore 'ai_security_audit_logs' collection.
 */
export async function writeSecurityAuditLog(log: AiSecurityAuditLog): Promise<void> {
  const db = getDbAdmin();
  if (!db) {
    console.error("[AiSecurityAuditLog] Failed to log security event: Database is offline.");
    return;
  }

  try {
    // Basic scrubbing of sensitive information if present
    const sanitizedLog = { ...log };
    if (sanitizedLog.blockedReason) {
      sanitizedLog.blockedReason = sanitizeLogMessage(sanitizedLog.blockedReason);
    }

    await db.collection('ai_security_audit_logs').add(sanitizedLog);
    console.log(`[AiSecurityAuditLog] Created audit log for user: ${log.userId} (${log.userRole}), Action: ${log.action}`);
  } catch (err) {
    console.error("[AiSecurityAuditLog] Error writing audit log to Firestore:", err);
  }
}

/**
 * Helper to ensure raw sensitive data like API keys, card/phone numbers are redacted
 */
function sanitizeLogMessage(message: string): string {
  if (!message) return "";
  // Redact API keys or passwords if mentioned
  let clean = message.replace(/(gsk_||AIzaSy)[a-zA-Z0-9_-]{10,}/g, "[REDACTED_API_KEY]");
  // Redact phone numbers (simple pattern for 10 digit or international)
  clean = clean.replace(/(\+\d{1,2}\s?)?1?\-?\s*?\d{3}\-\d{3}\-\d{4}/g, "[REDACTED_PHONE]");
  clean = clean.replace(/\b\d{10}\b/g, "[REDACTED_PHONE]");
  return clean;
}
