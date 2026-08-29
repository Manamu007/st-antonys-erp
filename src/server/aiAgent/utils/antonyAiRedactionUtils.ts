/**
 * Utility functions for redacting sensitive information from queries and data.
 */

export function redactPII(text: string): string {
  if (!text) return "";

  let redacted = text;

  // 1. Redact credit card / account card numbers (12-19 digits)
  redacted = redacted.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4,5}\b/g, "[CARD_REDACTED]");

  // 2. Redact phone numbers (e.g. 10 digit Indian mobiles or generic 10-12 digit numbers)
  // Replaces the middle digits with ******
  redacted = redacted.replace(/\b(\+?91)?[6-9]\d{9}\b/g, (match) => {
    const clean = match.replace(/\D/g, "");
    const len = clean.length;
    if (len >= 10) {
      const prefix = match.startsWith("+") ? "+91 " : "";
      const lastDigits = clean.substring(len - 2);
      const firstDigits = clean.substring(len - 10, len - 8);
      return `${prefix}${firstDigits}******${lastDigits}`;
    }
    return "[PHONE_REDACTED]";
  });

  // 3. Redact Email addresses: a***d@domain.com
  redacted = redacted.replace(/\b([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})\b/g, (match, username, domain, ext) => {
    if (username.length <= 2) {
      return `${username[0]}***@${domain}.${ext}`;
    }
    return `${username[0]}***${username[username.length - 1]}@${domain}.${ext}`;
  });

  // 4. Redact potential API Keys / secrets
  redacted = redacted.replace(/\bAIzaSy[A-Za-z0-9_\-]{33}\b/g, "[API_KEY_REDACTED]");
  redacted = redacted.replace(/(password|secret|pass|key|token|auth)\s*[:=]\s*["']?[A-Za-z0-9_\-]+["']?/gi, (match, param) => {
    return `${param}: ******`;
  });

  return redacted;
}

/**
 * Mask an individual object (like user, student info) recursively
 */
export function redactObject(obj: any): any {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item));
  }
  if (typeof obj === 'object') {
    const masked: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        const lowerKey = key.toLowerCase();
        
        if (lowerKey === 'password' || lowerKey === 'salt' || lowerKey === 'hash' || lowerKey === 'apikey' || lowerKey === 'api_key') {
          masked[key] = "******";
        } else if (lowerKey === 'phone' || lowerKey === 'mobile' || lowerKey === 'whatsappnumber' || lowerKey === 'whatsapp') {
          masked[key] = typeof val === 'string' ? redactPII(val) : "[MEMBER_CONTACT_REDACTED]";
        } else if (lowerKey === 'email') {
          masked[key] = typeof val === 'string' ? redactPII(val) : "[EMAIL_REDACTED]";
        } else if (typeof val === 'object') {
          masked[key] = redactObject(val);
        } else {
          masked[key] = val;
        }
      }
    }
    return masked;
  }
  return obj;
}
