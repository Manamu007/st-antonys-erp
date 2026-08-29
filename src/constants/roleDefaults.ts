import { PERMISSIONS, ROLE_PERMISSIONS, Role } from './permissions';

export const DEFAULT_ROLE_PERMISSIONS: Record<string, {
  name: string;
  description: string;
  isAdmin: boolean;
  isSystem: boolean;
  permissions: string[];
}> = Object.keys(ROLE_PERMISSIONS).reduce((acc, role) => {
  const roleKey = role as Role;
  acc[roleKey] = {
    name: roleKey.charAt(0).toUpperCase() + roleKey.slice(1).replace('_', ' '),
    description: `Default permissions for ${roleKey}`,
    isAdmin: roleKey === 'admin' || roleKey === 'super_admin',
    isSystem: true,
    permissions: ROLE_PERMISSIONS[roleKey] as unknown as string[]
  };
  return acc;
}, {} as any);
