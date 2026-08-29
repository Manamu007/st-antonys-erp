export interface AntonyAiSettings {
  enabled: boolean;
  languageMode: "ENGLISH" | "TELUGU" | "BOTH";
  allowFloatingWidget: boolean;
  allowVoiceInput: boolean;
  allowStudentDataAccess: boolean;
  allowFeeDataAccess: boolean;
  allowHealthDataAccess: boolean;
  maxDailyQueriesPerUser: number;
  updatedByUserId: string;
  updatedAt: string;
}

export interface AntonyAiHealth {
  status: "OPTIMAL" | "DEGRADED" | "CRITICAL" | "OFFLINE";
  totalQueriesToday: number;
  averageResponseTimeMs: number;
  rateLimitViolationsToday: number;
  dbSyncStatus: "CONNECTED" | "DISCONNECTED";
  lastError: string | null;
  lastCheckedAt: string;
}

export interface AntonyAiLog {
  id?: string;
  userId: string;
  role: string;
  schoolId: string;
  query: string;
  redactedQuery: string;
  answer: string;
  confidenceScore: "HIGH" | "MEDIUM" | "LOW" | "NOT_AVAILABLE";
  permissionUsed: string;
  sources: string[];
  responseTimeMs: number;
  wasHijackedAttempt: boolean;
  feedback: "HELPFUL" | "UNHELPFUL" | null;
  createdAt: string;
}

export interface AntonyAiResponse {
  answer: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NOT_AVAILABLE";
  sources: string[];
  permissionUsed: string;
  needAdminConfirmation: boolean;
  lastUpdated: string;
}
