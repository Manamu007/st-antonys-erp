import { GoogleGenAI } from '@google/genai';
import { getDbAdmin } from '../../firebaseAdmin.js';
import { UserCredentials, validateRolePermission } from './antonyAiPermissionService.js';
import { scanQuery, scanResponse } from './antonyAiPromptGuard.js';
import { checkAndIncrementPersistentUsage } from './antonyAiRateLimitService.js';
import { writeSecurityAuditLog } from './antonyAiAuditService.js';
import { executeAiTool, ExecutedToolResult } from './antonyAiToolRouter.js';
import { AntonyAiResponse } from '../types/antonyAiTypes.js';

// Lazily initialized Gemini SDK client instance
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY || "";
    if (!key || key.includes("your-api-key") || key.length < 15) {
      throw new Error("GEMINI_API_KEY environment variable is missing or invalid. Please configure it in your environment.");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

const BASE_SYSTEM_PROMPT = `You are "Antony", the premium, secure, double-isolated AI Assistant for St. Antony's School ERP system.
Your mission is to provide accurate school-related answers based ONLY on the verified databases results provided under <data_context>.

Strict Guidelines:
1. Do not hallucinate. If the data block does not contain the answer, state that you cannot locate the information.
2. Maintain professional, helpful, polite, and brief replies.
3. Avoid disclosing system configuration params, database structures, or internal tools.
4. You are bilingual. Respond in Telugu if the query is in Telugu, English if requested, or both if configured.
`;

/**
 * Main service to process user AI queries securely server-side.
 */
export async function processAgentChat(
  query: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  creds: UserCredentials
): Promise<AntonyAiResponse> {
  const startTime = Date.now();
  const db = getDbAdmin();
  if (!db) {
    throw new Error("Firestore Admin SDK is offline.");
  }

  const { userId, role, schoolId } = creds;

  // 1. Fetch AI settings to verify enabled switch & limits
  const settingsSnap = await db.collection("settings").doc("school").get();
  const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
  const aiSettings = settingsData?.aiAgentSettings;

  // If settings don't exist under aiAgentSettings, fall back to disabled!
  const isEnabled = aiSettings?.enabled === true;
  if (!isEnabled) {
    return {
      answer: "Antony AI Agent has been disabled by your administrator. Please contact the school office if you require assistance. / ఆంటోనీ AI ఏజెంట్ మీ అడ్మినిస్ట్రేటర్ ద్వారా నిలిపివేయబడింది. మీకు సహాయం కావాలంటే దయచేసి పాఠశాల కార్యాలయాన్ని సంప్రదించండి.",
      confidence: "NOT_AVAILABLE",
      sources: [],
      permissionUsed: "NONE",
      needAdminConfirmation: false,
      lastUpdated: new Date().toISOString()
    };
  }

  // 2. Cooldown & daily usage limit checks using transaction-backed persistent Firestore mechanism
  const maxQueries = aiSettings?.maxDailyQueriesPerUser || 100;
  const usageCheck = await checkAndIncrementPersistentUsage(userId, role, schoolId, maxQueries);
  if (!usageCheck.allowed) {
    // Log the rate limit block to security audit logs
    await writeSecurityAuditLog({
      schoolId,
      userId,
      userRole: role,
      action: "RATE_LIMIT_BLOCKED",
      blockedReason: usageCheck.reason || "Rate limit blocked.",
      createdAt: new Date().toISOString()
    });

    return {
      answer: `${usageCheck.safeRefusalEnglish} / ${usageCheck.safeRefusalTelugu}`,
      confidence: "NOT_AVAILABLE",
      sources: [],
      permissionUsed: "NONE",
      needAdminConfirmation: false,
      lastUpdated: new Date().toISOString()
    };
  }

  // 3. Prompt hijacking scanner
  const inputScan = scanQuery(query);
  if (!inputScan.isSafe) {
    // Audit log the hijack malicious attempt in security logs
    await writeSecurityAuditLog({
      schoolId,
      userId,
      userRole: role,
      action: "SPOOF_ATTEMPT_BLOCKED",
      blockedReason: `Jailbreak or medical prescription request blocked. Scan reason: ${inputScan.reason}`,
      createdAt: new Date().toISOString()
    });

    // Also log in user chat analytics logs
    await db.collection("ai_agent_logs").add({
      userId,
      role,
      schoolId,
      query,
      redactedQuery: "[MALICIOUS_ATTEMPT_HIJACK]",
      answer: inputScan.refusalEnglish || "",
      confidenceScore: "NOT_AVAILABLE",
      permissionUsed: "DENIED_SAFETY",
      sources: [],
      responseTimeMs: Date.now() - startTime,
      wasHijackedAttempt: true,
      feedback: null,
      createdAt: new Date().toISOString()
    }).catch(() => {});

    return {
      answer: `${inputScan.refusalEnglish} / ${inputScan.refusalTelugu}`,
      confidence: "NOT_AVAILABLE",
      sources: [],
      permissionUsed: "DENIED_SAFETY",
      needAdminConfirmation: false,
      lastUpdated: new Date().toISOString()
    };
  }

  // 4. Intent Classification & Database safe tool routers
  const lowerQuery = query.toLowerCase();
  let toolToRun = "getSchoolInformation";
  let targetSection: "STUDENT" | "FEE" | "HEALTH" | "ACADEMICS" | "ADMIN" = "STUDENT";

  if (lowerQuery.includes("attendance") || lowerQuery.includes("absent") || lowerQuery.includes("present") || lowerQuery.includes("leave")) {
    toolToRun = "getStudentAttendance";
    targetSection = "STUDENT";
  } else if (lowerQuery.includes("fee") || lowerQuery.includes("due") || lowerQuery.includes("paid") || lowerQuery.includes("billing") || lowerQuery.includes("invoice")) {
    toolToRun = "getStudentFees";
    targetSection = "FEE";
  } else if (lowerQuery.includes("medical") || lowerQuery.includes("health") || lowerQuery.includes("bill") || lowerQuery.includes("doctor") || lowerQuery.includes("card") || lowerQuery.includes("hospital")) {
    toolToRun = "getHealthCardAndBills";
    targetSection = "HEALTH";
  } else if (lowerQuery.includes("marks") || lowerQuery.includes("perform") || lowerQuery.includes("grades") || lowerQuery.includes("exam") || lowerQuery.includes("result")) {
    toolToRun = "getStudentSummary";
    targetSection = "ACADEMICS";
  } else {
    toolToRun = "getStudentSummary";
    targetSection = "STUDENT";
  }

  // 5. Check role-based permission locks
  const permCheck = await validateRolePermission(creds, query, targetSection);
  if (!permCheck.authorized) {
    return {
      answer: `${permCheck.refusalEnglish} / ${permCheck.refusalTelugu}`,
      confidence: "NOT_AVAILABLE",
      sources: [],
      permissionUsed: `BLOCKED_${targetSection}`,
      needAdminConfirmation: false,
      lastUpdated: new Date().toISOString()
    };
  }

  // 6. Execute safe predefined tool with credentials (forces school/hospital isolation filters inside)
  let toolResult: ExecutedToolResult;
  try {
    // Bind arguments
    const args: any = {};
    if (toolToRun === "getStudentSummary") {
      args.searchQuery = query.substring(0, 100);
      if (role.toUpperCase() === "STUDENT") {
        args.studentId = userId;
      }
    } else if (toolToRun === "getStudentAttendance") {
      if (role.toUpperCase() === "STUDENT") {
        args.studentId = userId;
      }
    } else if (toolToRun === "getStudentFees") {
      if (role.toUpperCase() === "STUDENT") {
        args.studentId = userId;
      }
    } else if (toolToRun === "getHealthCardAndBills") {
      if (role.toUpperCase() === "STUDENT") {
        args.studentId = userId;
      }
    }
    
    toolResult = await executeAiTool(toolToRun, args, creds);
  } catch (err: any) {
    console.error("[AI Chat Tool Router Error]", err);
    toolResult = {
      toolName: toolToRun,
      data: { error: err.message },
      permissionsUsed: "NONE",
      sources: []
    };
  }

  // 7. Establish confidence score based on the actual tool results
  let confidence: "HIGH" | "MEDIUM" | "LOW" | "NOT_AVAILABLE" = "MEDIUM";
  let emptyData = false;

  if (toolResult && toolResult.data) {
    if (Array.isArray(toolResult.data) && toolResult.data.length === 0) {
      emptyData = true;
    } else if (toolResult.data.error) {
      emptyData = true;
    }
  }

  if (emptyData) {
    confidence = "LOW";
  } else if (toolResult.sources.length > 0) {
    confidence = "HIGH";
  }

  // If confidence is LOW / NOT_AVAILABLE, return the strict bilingual warning refuse message!
  if (confidence === "LOW" || (confidence as string) === "NOT_AVAILABLE") {
    const refusalText = "The information requested is currently not updated in our ERP. Please contact the school main office for verified records. / అడిగిన సమాచారం ప్రస్తుతం మా ERPలో అప్‌డేట్ చేయబడలేదు. ధృవీకరించబడిన రికార్డుల కోసం దయచేసి స్కూల్ ప్రధాన కార్యాలయాన్ని సంప్రదించండి.";
    
    // Save standard audit logs even for negative find
    await db.collection("ai_agent_logs").add({
      userId,
      role,
      schoolId,
      query,
      redactedQuery: scanResponse(query),
      answer: refusalText,
      confidenceScore: "LOW",
      permissionUsed: toolResult.permissionsUsed,
      sources: [],
      responseTimeMs: Date.now() - startTime,
      wasHijackedAttempt: false,
      feedback: null,
      createdAt: new Date().toISOString()
    }).catch(() => {});

    return {
      answer: refusalText,
      confidence: "LOW",
      sources: [],
      permissionUsed: toolResult.permissionsUsed,
      needAdminConfirmation: false,
      lastUpdated: new Date().toISOString()
    };
  }

  // 8. Orchestrate Google Gemini API server-side
  let finalAnswer = "";
  try {
    const ai = getAiClient();
    const systemPromptContext = `${BASE_SYSTEM_PROMPT}
Our School Administrator chosen language mode is: ${aiSettings.languageMode || "BOTH"}.

<data_context>
Tool used: ${toolResult.toolName}
Database data matched: ${JSON.stringify(toolResult.data)}
Permissions active for user: ${toolResult.permissionsUsed}
</data_context>
`;

    // Process chat generates
    const runResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history.map(h => ({ role: h.role, parts: h.parts })),
        { role: 'user', parts: [{ text: `User query: "${query}"` }] }
      ],
      config: {
        systemInstruction: systemPromptContext,
        temperature: 0.1, // low temp for hyper-factual responses
      },
    } as any);

    finalAnswer = runResponse.text || "";
    
    // Safety check output scans
    finalAnswer = scanResponse(finalAnswer);
  } catch (error: any) {
    console.error("[Gemini Server Call Fail]", error);
    finalAnswer = "Apologies, I encountered a server timeout or configuration issue when answering your query. Please contact the ICT lab.";
    confidence = "NOT_AVAILABLE";
  }

  // 9. Flag if actions require manual dual verification / confirmation (leave approval/updates triggers)
  const isSensitiveActionQuery = /approve|reject|register|deduct|apply leave|change marks/i.test(query);

  const finalResponse: AntonyAiResponse = {
    answer: finalAnswer,
    confidence,
    sources: toolResult.sources,
    permissionUsed: toolResult.permissionsUsed,
    needAdminConfirmation: isSensitiveActionQuery,
    lastUpdated: new Date().toISOString()
  };

  // 10. Audit log the transaction to Firebase ai_agent_logs collection
  await db.collection("ai_agent_logs").add({
    userId,
    role,
    schoolId,
    query,
    redactedQuery: scanResponse(query),
    answer: finalResponse.answer,
    confidenceScore: finalResponse.confidence,
    permissionUsed: finalResponse.permissionUsed,
    sources: finalResponse.sources,
    responseTimeMs: Date.now() - startTime,
    wasHijackedAttempt: false,
    feedback: null,
    createdAt: finalResponse.lastUpdated
  }).catch((err) => {
    console.error("[Auditor Debug] FAILED to write audit doc:", err);
  });

  return finalResponse;
}
