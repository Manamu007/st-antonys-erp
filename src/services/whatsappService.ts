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

export const whatsappService = {
  async sendMessage(to: string, text: string, options: WASendOptions = {}) {
    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text, options })
    });
    return response.json();
  },

  async broadcastMessage(to: string[], text: string, options: WASendOptions = {}) {
    const response = await fetch('/api/whatsapp/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text, options })
    });
    return response.json();
  },

  async getStatus() {
    const response = await fetch('/api/whatsapp/status');
    return response.json();
  },

  async getStats() {
    const response = await fetch('/api/whatsapp/stats');
    return response.json();
  },

  async reconcileStats() {
    const response = await fetch('/api/whatsapp/reconcile-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  }
};
