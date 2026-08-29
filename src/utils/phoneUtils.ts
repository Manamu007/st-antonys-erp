/**
 * Client-side phone utility functions
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

export function normalizePhone(phone: any): string {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  if (trimmed.endsWith('@g.us') || trimmed.endsWith('@newsletter') || trimmed.endsWith('@lid')) {
    return trimmed;
  }
  let cleaned = trimmed.replace(/\D/g, '');
  if (trimmed.includes('@')) {
    cleaned = trimmed.split('@')[0].replace(/\D/g, '');
  }
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
