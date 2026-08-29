import { AntonyAiSettings, AntonyAiHealth, AntonyAiResponse, AntonyAiLog } from '../types/antonyAiTypes';
import { auth } from '../../../firebase';
import { safeStorage as localStorage } from '../../../lib/safeStorage';

interface ClientCreds {
  userId: string;
  role: string;
  schoolId: string;
  hospitalId?: string;
}

async function getHeaders(creds: ClientCreds) {
  let token = "";
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (err) {
      console.warn("[antonyAiClient] Failed to fetch current user ID token:", err);
    }
  }

  // Fallback if no real firebase user is signed in to support bypass/mock testing
  if (!token) {
    const bypassEmail = localStorage.getItem('bypass_user_email');
    if (bypassEmail) {
      const bypassUid = localStorage.getItem('bypass_user_uid') || 'system_vp_saikumari';
      token = `MOCK_BYPASS:${bypassUid}:${bypassEmail}`;
    }
  }

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    // Send the x-user headers so the backend can compare them against verified values for spoof detection.
    'x-user-id': creds.userId || '',
    'x-user-role': creds.role || '',
    'x-school-id': creds.schoolId || 'st_antonys_school',
    'x-hospital-id': creds.hospitalId || ''
  };
}

export const antonyAiClient = {
  async chat(
    message: string, 
    history: { role: 'user' | 'model'; parts: { text: string }[] }[], 
    creds: ClientCreds
  ): Promise<AntonyAiResponse> {
    const headers = await getHeaders(creds);
    const response = await fetch('/api/ai/antony-agent', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, history })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Query failed");
    }
    return response.json();
  },

  async getHealth(creds: ClientCreds): Promise<AntonyAiHealth> {
    const headers = await getHeaders(creds);
    const response = await fetch('/api/ai/antony-agent/health', {
      method: 'GET',
      headers
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to load health metrics");
    }
    return response.json();
  },

  async getSettings(creds: ClientCreds): Promise<AntonyAiSettings> {
    const headers = await getHeaders(creds);
    const response = await fetch('/api/ai/antony-agent/settings', {
      method: 'GET',
      headers
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to load settings");
    }
    return response.json();
  },

  async updateSettings(settings: Partial<AntonyAiSettings>, creds: ClientCreds): Promise<AntonyAiSettings> {
    const headers = await getHeaders(creds);
    const response = await fetch('/api/ai/antony-agent/settings/update', {
      method: 'POST',
      headers,
      body: JSON.stringify({ settings })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to save settings changes");
    }
    const data = await response.json();
    return data.settings;
  },

  async getLogs(creds: ClientCreds): Promise<AntonyAiLog[]> {
    const headers = await getHeaders(creds);
    const response = await fetch('/api/ai/antony-agent/logs', {
      method: 'GET',
      headers
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to load audit logs");
    }
    return response.json();
  },

  async sendFeedback(logId: string, type: "HELPFUL" | "UNHELPFUL", creds: ClientCreds): Promise<void> {
    const headers = await getHeaders(creds);
    const response = await fetch('/api/ai/antony-agent/feedback', {
      method: 'POST',
      headers,
      body: JSON.stringify({ logId, type })
    });
    if (!response.ok) {
      throw new Error("Failed to send feedback");
    }
  }
};
