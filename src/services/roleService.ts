import { dbService, where } from './dbService';
import { DEFAULT_ROLE_PERMISSIONS } from '../constants/roleDefaults';
import { SYSTEM_ROLE_MAPPING, SYSTEM_ACCOUNTS, getSystemAccountRole } from '../constants/systemAccounts';
import { CustomRole } from '../types';

export const syncSystemUsers = async () => {
  try {
    for (const email of SYSTEM_ACCOUNTS) {
      const normalizedEmail = email.toLowerCase().trim();
      const role = getSystemAccountRole(normalizedEmail);
      
      // Check if user already exists
      const existing = await dbService.list('users', [
        where('email', '==', normalizedEmail)
      ]);

      if (existing.length === 0) {
        // Create a pre-registered placeholder
        const id = `system_${normalizedEmail.replace(/[@.]/g, '_')}`;
        console.log(`Pre-registering system account: ${normalizedEmail} with role: ${role}`);
        await dbService.set('users', id, {
          uid: id, // Temporary uid
          email: normalizedEmail,
          name: normalizedEmail.split('@')[0],
          role: role,
          status: 'active',
          isSystem: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error("Error syncing system users:", error);
  }
};

export const syncDefaultRoles = async () => {
  try {
    // Also sync system users when roles are synced
    await syncSystemUsers();
    
    const existingRoles = await dbService.list('roles') as any as CustomRole[];
    const roleMap = new Map(existingRoles.map(r => [(r.name || '').toLowerCase().trim(), r]));

    const promises = Object.entries(DEFAULT_ROLE_PERMISSIONS).map(async ([key, defaults]) => {
      const roleId = key.toLowerCase().trim();
      const existing = roleMap.get(defaults.name.toLowerCase().trim()) || existingRoles.find(r => r.id === roleId);

      if (!existing) {
        // Create new system role
        console.log(`Creating missing system role: ${defaults.name} with ID: ${roleId}`);
        const roleData: CustomRole = {
          id: roleId,
          name: defaults.name,
          description: defaults.description,
          permissions: defaults.permissions,
          isAdmin: defaults.isAdmin,
          isSystem: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return dbService.set('roles', roleId, roleData);
      } else {
        // Role already exists. Respect admin customizations and do not overwrite modified permissions!
        if (existing.isDeleted) {
          return;
        }
        
        // Only update if role metadata (e.g. system flag) needs alignment, but preserve existing permissions exactly
        const needsMetadataSync = !existing.isSystem || existing.isAdmin !== defaults.isAdmin;
        if (needsMetadataSync) {
          return dbService.update('roles', existing.id!, {
            isAdmin: defaults.isAdmin,
            isSystem: true,
            updatedAt: new Date().toISOString()
          });
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error syncing default roles:", error);
  }
};
