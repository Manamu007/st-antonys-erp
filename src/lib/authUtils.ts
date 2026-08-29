
import { Role, Permission, ROLE_PERMISSIONS } from '../constants/permissions';

/**
 * Checks if a user role has a specific permission.
 * Handles Principal strict read-only mode by checking if the action is a "write" action.
 */
export function hasPermission(role: string | undefined, permission: Permission): boolean {
  if (!role) return false;
  
  const userRole = role.toLowerCase() as Role;
  const permissions = ROLE_PERMISSIONS[userRole] || [];

  // Super Admin bypass
  if (userRole === 'super_admin' || userRole === 'admin') return true;

  // Principal Strict read-only check
  // If the permission implies a "write" operation but the role is principal, deny.
  if (userRole === 'principal') {
    const writeKeywords = ['manage', 'edit', 'grant', 'apply', 'approve', 'delete', 'update', 'create'];
    if (writeKeywords.some(keyword => permission.toLowerCase().includes(keyword))) {
      return false;
    }
  }

  return permissions.includes(permission);
}

/**
 * Checks if a user can perform a specific operation on a field.
 * Example: Clerk cannot edit 'concession' field.
 */
export function canEditField(role: string | undefined, field: string): boolean {
  if (!role) return false;
  const userRole = role.toLowerCase() as Role;

  if (userRole === 'super_admin' || userRole === 'admin') return true;
  if (userRole === 'principal') return false;

  if (userRole === 'clerk' && field === 'concession') return false;

  return true;
}
