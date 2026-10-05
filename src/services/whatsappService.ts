import { resolveApiUrl } from '../lib/apiClient';

export interface WASendOptions {
  imageUrl?: string;
  videoUrl?: string;
  documentUrl?: string;
  fileName?: string;
  mimetype?: string;
  asGif?: boolean;
  buttons?: any[];
  footer?: string;
  studentId?: string;
  outingId?: string;
  permissionId?: string;
  templateType?: string;
  messageType?: string;
  eventType?: string;
  priority?: number;
  source?: string;
  date?: string;
  schoolId?: string;
  forceSend?: boolean;
}

async function safeWaFetch(endpoint: string, init?: RequestInit): Promise<any> {
  const primaryUrl = resolveApiUrl(endpoint);
  try {
    const res = await fetch(primaryUrl, {
      ...init,
      mode: 'cors'
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {
    // If primary cross-origin fetch fails (e.g. Failed to fetch), fallback to local path
  }

  // Fallback to local container relative endpoint
  try {
    const fallbackRes = await fetch(endpoint, {
      ...init,
      mode: 'cors'
    });
    if (fallbackRes.ok) {
      return await fallbackRes.json();
    }
  } catch (err) {
    console.warn(`[whatsappService] Fetch failed for ${endpoint}:`, err);
  }

  return { success: false, status: 'close', data: null, stats: {} };
}

export const whatsappService = {
  async sendMessage(to: string, text: string, options: WASendOptions = {}) {
    return safeWaFetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text, options })
    });
  },

  async broadcastMessage(to: string[], text: string, options: WASendOptions = {}) {
    return safeWaFetch('/api/whatsapp/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text, options })
    });
  },

  async getStatus() {
    return safeWaFetch('/api/whatsapp/status');
  },

  async getStats() {
    return safeWaFetch('/api/whatsapp/stats');
  },

  async reconcileStats() {
    return safeWaFetch('/api/whatsapp/reconcile-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

