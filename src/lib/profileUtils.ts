import { dbService } from '../services/dbService';
import { UserProfile } from '../types';

export const STAFF_ROLES = [
  'super_admin',
  'admin',
  'principal',
  'vice_principal',
  'coordinator',
  'play_school_incharge',
  'teacher',
  'teacher_class',
  'teacher_subject',
  'accountant',
  'clerk',
  'receptionist',
  'warden',
  'hostel_warden',
  'driver',
  'doctor',
  'hospital',
  'hospital_user',
  'transport_staff',
  'helper',
  'attendant',
  'aya',
  'staff'
] as const;

/**
 * Normalizes a role string to a standard machine-readable format.
 */
export const normalizeRole = (role: string | null | undefined): string => {
  if (!role) return '';
  return role.toLowerCase().trim().replace(/[\s_]+/g, '_');
};

/**
 * Checks if a normalized role represents any school staff member.
 */
export const isStaffRole = (role: string | null | undefined): boolean => {
  if (!role) return false;
  const r = normalizeRole(role);
  if (r === 'student' || r === 'parent') return false;
  return (
    STAFF_ROLES.some(sr => r === sr || r.includes(sr)) ||
    r.includes('teacher') ||
    r.includes('staff') ||
    r.includes('admin') ||
    r.includes('accountant') ||
    r.includes('clerk') ||
    r.includes('reception') ||
    r.includes('principal') ||
    r.includes('warden') ||
    r.includes('driver') ||
    r.includes('doctor') ||
    r.includes('coordinator') ||
    r.includes('incharge')
  );
};

/**
 * Checks if an email or identifier indicates a staff member.
 */
export const isStaffAccountOrEmail = (
  email?: string | null,
  role?: string | null,
  name?: string | null
): boolean => {
  if (role && isStaffRole(role)) return true;
  const e = (email || '').toLowerCase().trim();
  const n = (name || '').toLowerCase().trim();
  if (
    e.includes('accountant') || n.includes('accountant') ||
    e.includes('finance') || n.includes('finance') ||
    e.includes('cashier') || n.includes('cashier') ||
    e.includes('accounts') || n.includes('accounts') ||
    e.includes('billing') || n.includes('billing') ||
    e.includes('clerk') || n.includes('clerk') ||
    e.includes('reception') || n.includes('reception') ||
    e.includes('frontoffice') || n.includes('frontoffice') ||
    e.includes('driver') || n.includes('driver') ||
    e.includes('transport') || n.includes('transport') ||
    e.includes('doctor') || n.includes('doctor') ||
    e.includes('nurse') || n.includes('nurse') ||
    e.includes('medical') || n.includes('medical') ||
    e.includes('warden') || n.includes('warden') ||
    e.includes('hostel') || n.includes('hostel') ||
    e.includes('principal') || n.includes('principal') ||
    e.includes('headmaster') || n.includes('headmaster') ||
    e.includes('headmistress') || n.includes('headmistress') ||
    e.includes('admin') || n.includes('admin') ||
    e.includes('superadmin') || n.includes('superadmin') ||
    e.includes('coordinator') || n.includes('coordinator') ||
    e.includes('incharge') || n.includes('incharge') ||
    e.includes('teacher') || n.includes('teacher') ||
    e.includes('faculty') || n.includes('faculty') ||
    e.includes('staff') || n.includes('staff') ||
    e.startsWith('stantonys') || e.startsWith('antonys')
  ) {
    return true;
  }
  return false;
};

/**
 * Two-Step Fetch Helper:
 * 1. Takes identity data (from 'users' collection)
 * 2. Fetches detailed profile (from 'students' or 'staff')
 * 3. Merges and returns a unified UserProfile object
 */
export const fetchAndMergeProfile = async (uid: string, identityData: any): Promise<UserProfile> => {
  const role = normalizeRole(identityData.role);
  const isStaff = isStaffRole(role) || isStaffAccountOrEmail(identityData.email, role, identityData.name);
  
  // Both administrative/leadership roles and employee roles use the 'staff' collection for detailed profiles
  const targetCollection = (role === 'student' || role === 'parent') && !isStaff ? 'students' : 'staff';

  try {
    const detailData = await dbService.get(targetCollection, uid);
    
    // Requirement: Handle cases where profile is missing
    if (!detailData) {
      console.warn(`Profile missing in ${targetCollection} for UID: ${uid}. Falling back to identity.`);
      return { ...identityData, uid } as UserProfile;
    }

    // Step 3: Merge data
    return {
      ...identityData,
      ...(detailData || {}),
      uid // Preserve UID
    } as UserProfile;
  } catch (error) {
    console.error(`Error in two-step fetch for ${targetCollection}:`, error);
    return { ...identityData, uid } as UserProfile;
  }
};
