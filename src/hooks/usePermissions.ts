import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Permission } from '../constants/permissions';

export const usePermissions = () => {
  const { 
    hasPermission, 
    isAdmin, 
    profile,
    isTeacher,
    isStudent,
    isAccountant,
    isClerk,
    isReceptionist,
    isParent,
    isVicePrincipal,
    isPrincipal,
    isSuperAdmin
  } = useAuth();

  const hasAnyPermission = React.useCallback((permIds: Permission[]) => {
    if (isAdmin) return true;
    return permIds.some(id => hasPermission(id));
  }, [isAdmin, hasPermission]);

  const hasAllPermissions = React.useCallback((permIds: Permission[]) => {
    if (isAdmin) return true;
    return permIds.every(id => hasPermission(id));
  }, [isAdmin, hasPermission]);

  return React.useMemo(() => ({
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    /**
     * returns true if the user is a super admin or has the isAdmin flag in their role
     */
    isAdmin,
    /**
     * returns true if the user is a super admin
     */
    isSuperAdmin,
    /**
     * The raw role string from the user profile
     */
    role: profile?.role,
    /**
     * Semantic role flags
     */
    isTeacher,
    isStudent,
    isAccountant,
    isClerk,
    isReceptionist,
    isParent,
    isVicePrincipal,
    isPrincipal,
    /**
     * User profile data
     */
    profile
  }), [
    hasPermission, 
    hasAnyPermission, 
    hasAllPermissions, 
    isAdmin, 
    profile, 
    isTeacher, 
    isStudent, 
    isAccountant, 
    isClerk, 
    isReceptionist,
    isParent, 
    isVicePrincipal, 
    isPrincipal,
    isSuperAdmin
  ]);
};
