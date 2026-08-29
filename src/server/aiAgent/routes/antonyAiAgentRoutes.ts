import express from 'express';
import { getDbAdmin } from '../../firebaseAdmin.js';
import { processAgentChat } from '../services/antonyAiService.js';
import { verifyAndDeriveContext, VerifiedAiUserContext } from '../services/antonyAiAuthContextService.js';
import { writeSecurityAuditLog } from '../services/antonyAiAuditService.js';
import { AntonyAiSettings, AntonyAiHealth } from '../types/antonyAiTypes.js';

const router = express.Router();

/**
 * Helper to securely pull and verify user identity in route.
 * Returns derived verified user context. Throws error if invalid.
 */
async function getVerifiedContext(req: express.Request): Promise<VerifiedAiUserContext> {
  const authHeader = req.headers.authorization;
  return await verifyAndDeriveContext(authHeader);
}

/**
 * POST /api/ai/antony-agent - Send a query to the secure AI agent.
 */
router.post('/', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "No message query prompt provided." });
    }

    // 1 & 2. Verify token and derive context server-side
    let context: VerifiedAiUserContext;
    try {
      context = await getVerifiedContext(req);
    } catch (err: any) {
      console.warn("[AI Authentication Failed]", err.message);
      return res.status(401).json({ error: err.message || "Unauthorized context" });
    }

    // 3. Spoofing test/checks logged to safety audit logs
    const attemptedSpoofRole = req.headers['x-user-role'] ? String(req.headers['x-user-role']).toUpperCase() : undefined;
    const attemptedSpoofSchoolId = req.headers['x-school-id'] ? String(req.headers['x-school-id']) : undefined;
    const attemptedSpoofHospitalId = req.headers['x-hospital-id'] ? String(req.headers['x-hospital-id']) : undefined;

    let hasSpoofAttempt = false;
    if (attemptedSpoofRole && attemptedSpoofRole !== context.role) {
      hasSpoofAttempt = true;
    }
    if (attemptedSpoofSchoolId && attemptedSpoofSchoolId !== context.schoolId) {
      hasSpoofAttempt = true;
    }
    if (attemptedSpoofHospitalId && context.hospitalId && attemptedSpoofHospitalId !== context.hospitalId) {
      hasSpoofAttempt = true;
    }

    if (hasSpoofAttempt) {
      // Log blocked spoofing security event
      await writeSecurityAuditLog({
        schoolId: context.schoolId,
        userId: context.userId,
        userRole: context.role,
        attemptedSpoofRole,
        attemptedSpoofSchoolId,
        attemptedSpoofHospitalId,
        action: "SPOOF_ATTEMPT_BLOCKED",
        blockedReason: `Spoofed headers detected: Role=${attemptedSpoofRole}, School=${attemptedSpoofSchoolId}, Hospital=${attemptedSpoofHospitalId}. Overrode to verified secure user values.`,
        createdAt: new Date().toISOString()
      });
    }

    // 4. Pass back context (userId, role, schoolId, hospitalId, linkedStudentIds, etc.) to backend pipeline
    const result = await processAgentChat(message, history, {
      userId: context.userId,
      role: context.role,
      schoolId: context.schoolId,
      hospitalId: context.hospitalId || "",
      linkedStudentIds: context.linkedStudentIds,
      assignedClassIds: context.assignedClassIds
    });

    res.json(result);
  } catch (error: any) {
    console.error("[Antony AI Router] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/ai/antony-agent/health - AI Health stats for administrators.
 */
router.get('/health', async (req, res) => {
  try {
    let context: VerifiedAiUserContext;
    try {
      context = await getVerifiedContext(req);
    } catch (err: any) {
      return res.status(401).json({ error: err.message || "Unauthorized" });
    }

    // Only Admin can check AI health
    if (context.role !== "ADMIN" && context.role !== "SUPER_ADMIN" && context.role !== "PRINCIPAL") {
      return res.status(403).json({ error: "Access Denied: Restricted to Administrator roles." });
    }

    const db = getDbAdmin();
    const todayStr = new Date().toISOString().split('T')[0];

    // Queries count today matched to school
    const logsSnap = await db.collection("ai_agent_logs")
      .where("schoolId", "==", context.schoolId)
      .where("createdAt", ">=", `${todayStr}T00:00:00.000Z`)
      .get();
    
    const logs = logsSnap.docs.map(doc => doc.data());
    const totalToday = logs.length;

    // Calc average response times
    let totalTimes = 0;
    logs.forEach(l => {
      totalTimes += (Number(l.responseTimeMs) || 0);
    });
    const avgResponse = totalToday > 0 ? Math.round(totalTimes / totalToday) : 0;

    // Count hijack safety violations attempts today
    const safetyViolations = logs.filter(l => l.wasHijackedAttempt === true).length;

    const healthReport: AntonyAiHealth = {
      status: safetyViolations > 6 ? "DEGRADED" : "OPTIMAL",
      totalQueriesToday: totalToday,
      averageResponseTimeMs: avgResponse,
      rateLimitViolationsToday: safetyViolations,
      dbSyncStatus: "CONNECTED",
      lastError: null,
      lastCheckedAt: new Date().toISOString()
    };

    res.json(healthReport);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to retrieve health metrics" });
  }
});

/**
 * GET /api/ai/antony-agent/settings - Get settings.
 */
router.get('/settings', async (req, res) => {
  try {
    let context: VerifiedAiUserContext;
    try {
      context = await getVerifiedContext(req);
    } catch (err: any) {
      return res.status(401).json({ error: err.message || "Unauthorized" });
    }

    const db = getDbAdmin();

    const docSnap = await db.collection("settings").doc("school").get();
    let settingsData = docSnap.exists ? docSnap.data() : {};
    
    // Fallback/Default settings payload if none found matching
    if (!settingsData?.aiAgentSettings) {
      settingsData = {
        aiAgentSettings: {
          enabled: false,
          languageMode: "BOTH",
          allowFloatingWidget: true,
          allowVoiceInput: false,
          allowStudentDataAccess: true,
          allowFeeDataAccess: true,
          allowHealthDataAccess: true,
          maxDailyQueriesPerUser: 100,
          updatedByUserId: "",
          updatedAt: new Date().toISOString()
        }
      };
    }

    res.json(settingsData.aiAgentSettings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch AI Settings" });
  }
});

/**
 * POST /api/ai/antony-agent/settings/update - Update settings.
 */
router.post('/settings/update', async (req, res) => {
  try {
    let context: VerifiedAiUserContext;
    try {
      context = await getVerifiedContext(req);
    } catch (err: any) {
      return res.status(401).json({ error: err.message || "Unauthorized" });
    }

    if (context.role !== "ADMIN" && context.role !== "SUPER_ADMIN" && context.role !== "PRINCIPAL") {
      return res.status(403).json({ error: "Access Denied: Only administrators can modify AI settings." });
    }

    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ error: "Missing settings configuration payload." });
    }

    const db = getDbAdmin();
    // Validate schema of updated payload
    const updatedPayload: AntonyAiSettings = {
      enabled: settings.enabled === true,
      languageMode: settings.languageMode || "BOTH",
      allowFloatingWidget: settings.allowFloatingWidget === true,
      allowVoiceInput: settings.allowVoiceInput === true,
      allowStudentDataAccess: settings.allowStudentDataAccess === true,
      allowFeeDataAccess: settings.allowFeeDataAccess === true,
      allowHealthDataAccess: settings.allowHealthDataAccess === true,
      maxDailyQueriesPerUser: Number(settings.maxDailyQueriesPerUser) || 100,
      updatedByUserId: context.userId,
      updatedAt: new Date().toISOString()
    };

    await db.collection("settings").doc("school").set({
      aiAgentSettings: updatedPayload
    }, { merge: true });

    res.json({ success: true, settings: updatedPayload });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to save settings changes" });
  }
});

/**
 * GET /api/ai/antony-agent/logs - Retrieves audit logs for admin review.
 */
router.get('/logs', async (req, res) => {
  try {
    let context: VerifiedAiUserContext;
    try {
      context = await getVerifiedContext(req);
    } catch (err: any) {
      return res.status(401).json({ error: err.message || "Unauthorized" });
    }

    if (context.role !== "ADMIN" && context.role !== "SUPER_ADMIN" && context.role !== "PRINCIPAL") {
      return res.status(403).json({ error: "Access Denied: Audit Logs are administrative eyes only." });
    }

    const db = getDbAdmin();
    const snap = await db.collection("ai_agent_logs")
      .where("schoolId", "==", context.schoolId)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get()
      .catch(async () => {
         // Fallback if index is not created yet
         return await db.collection("ai_agent_logs")
           .where("schoolId", "==", context.schoolId)
           .limit(100)
           .get();
      });

    const logsList = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(logsList);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load audit logs" });
  }
});

/**
 * POST /api/ai/antony-agent/feedback - Register user helpfulness votes.
 */
router.post('/feedback', async (req, res) => {
  try {
    const { logId, type } = req.body; // type: "HELPFUL" or "UNHELPFUL"
    if (!logId || !type) {
      return res.status(400).json({ error: "Missing logId or type parameter." });
    }

    const db = getDbAdmin();
    await db.collection("ai_agent_logs").doc(logId).update({
      feedback: type
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to save feedback." });
  }
});

export default router;
