import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Lock, 
  Key, 
  ChevronRight, 
  Search, 
  CheckCircle2, 
  AlertCircle,
  Save,
  RefreshCw,
  Info,
  Trash2,
  Plus,
  Users,
  Check
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { PERMISSIONS, ROLE_PERMISSIONS, Permission } from '../constants/permissions';
import { useAuth } from '../context/AuthContext';
import { syncDefaultRoles } from '../services/roleService';
import { toast } from 'sonner';
import { where } from 'firebase/firestore';

export default function Roles() {
  const { isAdmin } = useAuth();
  const [selectedRoleId, setSelectedRoleId] = useState<string>('teacher_class');
  const [dbRoles, setDbRoles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPermissions, setCurrentPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Create role form fields
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [copyPermissionsFrom, setCopyPermissionsFrom] = useState('');
  
  // Delete/cleanup role workflow fields
  const [affectedUsers, setAffectedUsers] = useState<any[]>([]);
  const [affectedStaff, setAffectedStaff] = useState<any[]>([]);
  const [targetMergeRoleId, setTargetMergeRoleId] = useState('');
  const [checkingUsers, setCheckingUsers] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Auto-sync/repair default roles in the database on load for administrators
  useEffect(() => {
    if (isAdmin) {
      syncDefaultRoles()
        .then(() => console.log('System roles auto-repair & sync completed.'))
        .catch(err => console.error('Failed to auto-repair roles:', err));
    }
  }, [isAdmin]);

  // Fetch all roles on load
  useEffect(() => {
    if (!isAdmin) return;
    dbService.list('roles').then((data) => {
      // Filter out soft-deleted roles
      const activeRoles = data.filter((r: any) => !r.isDeleted);
      setDbRoles(activeRoles);
      
      // Safety fallback: if the selected role is deleted elsewhere, switch selected role
      if (activeRoles.length > 0 && !activeRoles.some(r => r.id === selectedRoleId)) {
        const hasTeacher = activeRoles.some(r => r.id === 'teacher');
        setSelectedRoleId(hasTeacher ? 'teacher' : activeRoles[0].id);
      }
    }).catch(e => console.error(e));
  }, [isAdmin, selectedRoleId]);

  // Initialize/Fetch permissions for selected role
  useEffect(() => {
    setLoading(true);
    const roleKey = selectedRoleId.toLowerCase();
    dbService.get('roles', roleKey).then((roleData: any) => {
      if (roleData?.permissions) {
        setCurrentPermissions(roleData.permissions);
      } else {
        // Fallback to static defaults
        setCurrentPermissions((ROLE_PERMISSIONS as any)[selectedRoleId] || []);
      }
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, [selectedRoleId]);

  const togglePermission = (permission: Permission) => {
    if (!isAdmin) {
      toast.error('Only administrators can modify roles');
      return;
    }
    setCurrentPermissions(prev => 
      prev.includes(permission) 
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const activeRoleDoc = dbRoles.find(r => r.id === selectedRoleId);
      await dbService.set('roles', selectedRoleId.toLowerCase(), {
        id: selectedRoleId.toLowerCase(),
        name: activeRoleDoc?.name || selectedRoleId.replace(/_/g, ' ').toUpperCase(),
        description: activeRoleDoc?.description || `Permissions for ${selectedRoleId}`,
        permissions: currentPermissions,
        isSystem: activeRoleDoc?.isSystem ?? true,
        isAdmin: selectedRoleId === 'admin' || selectedRoleId === 'super_admin' || (activeRoleDoc?.isAdmin ?? false),
        updatedAt: new Date().toISOString()
      });
      toast.success(`${(activeRoleDoc?.name || selectedRoleId).replace(/_/g, ' ')} permissions updated successfully`);
    } catch (error) {
      console.error('Error saving role:', error);
      toast.error('Failed to save role permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (!isAdmin) return;
    const defaults = (ROLE_PERMISSIONS as any)[selectedRoleId] || [];
    setCurrentPermissions(defaults);
    toast.info(`Restored default permissions for ${selectedRoleId.replace(/_/g, ' ')}. Don't forget to save.`);
  };

  // Create role handler
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newRoleName.trim()) {
      toast.error('Role name is required');
      return;
    }
    
    const generatedId = newRoleName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    // Safety check: check duplicate
    if (dbRoles.some((r: any) => r.id === generatedId)) {
      toast.error('A role with this name already exists');
      return;
    }

    try {
      let initialPerms: string[] = [];
      if (copyPermissionsFrom) {
        const sourceRoleDoc = dbRoles.find(r => r.id === copyPermissionsFrom);
        if (sourceRoleDoc) {
          initialPerms = sourceRoleDoc.permissions || [];
        } else {
          initialPerms = (ROLE_PERMISSIONS as any)[copyPermissionsFrom] || [];
        }
      }

      await dbService.set('roles', generatedId, {
        id: generatedId,
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || `Custom role for ${newRoleName.trim()}`,
        permissions: initialPerms,
        isAdmin: false,
        isSystem: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      toast.success(`Role "${newRoleName.trim()}" created successfully!`);
      setSelectedRoleId(generatedId);
      setShowCreateModal(false);
      setNewRoleName('');
      setNewRoleDesc('');
      setCopyPermissionsFrom('');
    } catch (err) {
      console.error('Error creating role:', err);
      toast.error('Failed to create role');
    }
  };

  // Initiate Deletion Wizard
  const initiateDeleteRole = async () => {
    if (!isAdmin) return;
    if (selectedRoleId === 'admin' || selectedRoleId === 'super_admin') {
      toast.error('Standard administrative roles cannot be deleted for safety.');
      return;
    }

    setCheckingUsers(true);
    setShowDeleteModal(true);
    setAffectedUsers([]);
    setAffectedStaff([]);
    
    try {
      // Find all users and staff in Firestore currently assigned to this role
      const [users, staff] = await Promise.all([
        dbService.list('users', [where('role', '==', selectedRoleId)]),
        dbService.list('staff', [where('role', '==', selectedRoleId)])
      ]);

      setAffectedUsers(users);
      setAffectedStaff(staff);
      
      // Find a safe target role to merge existing users/staff into.
      // (Prioritize "teacher" if the deleted role is teacher-related)
      const remainingRoles = dbRoles.filter(r => r.id !== selectedRoleId);
      if (remainingRoles.length > 0) {
        const isTeacherRelated = selectedRoleId.includes('teacher');
        const defaultTarget = isTeacherRelated 
          ? remainingRoles.find(r => r.id === 'teacher') || remainingRoles[0]
          : remainingRoles[0];
        setTargetMergeRoleId(defaultTarget.id);
      } else {
        setTargetMergeRoleId('');
      }
    } catch (err) {
      console.error('Error scanning affected users:', err);
      toast.error('Failed to check for user assignments on this role');
    } finally {
      setCheckingUsers(false);
    }
  };

  // Confirm delete and merge wizard
  const handleConfirmDeleteAndMerge = async () => {
    if (!isAdmin) return;
    if (!targetMergeRoleId && (affectedUsers.length > 0 || affectedStaff.length > 0)) {
      toast.error('Please select a target role to migrate existing users.');
      return;
    }

    setDeleting(true);
    try {
      const targetRoleDoc = dbRoles.find(r => r.id === targetMergeRoleId);
      const targetRoleName = targetRoleDoc ? targetRoleDoc.name : targetMergeRoleId;

      // 1. Migrate active system users in the database
      if (affectedUsers.length > 0) {
        const userUpdates = affectedUsers.map(u => 
          dbService.update('users', u.id, {
            role: targetMergeRoleId,
            updatedAt: new Date().toISOString()
          })
        );
        await Promise.all(userUpdates);
      }

      // 2. Migrate active staff records in the database
      if (affectedStaff.length > 0) {
        const staffUpdates = affectedStaff.map(s => 
          dbService.update('staff', s.id, {
            role: targetMergeRoleId,
            updatedAt: new Date().toISOString()
          })
        );
        await Promise.all(staffUpdates);
      }

      // 3. Soft-delete the role doc from Firestore
      const originalRoleDoc = dbRoles.find(r => r.id === selectedRoleId);
      await dbService.set('roles', selectedRoleId, {
        ...(originalRoleDoc || {}),
        id: selectedRoleId,
        isDeleted: true,
        updatedAt: new Date().toISOString()
      });

      toast.success(
        `Role "${originalRoleDoc?.name || selectedRoleId}" deleted successfully! ${
          affectedUsers.length + affectedStaff.length
        } active records merged into "${targetRoleName}".`
      );

      // Select another active role
      const remaining = dbRoles.filter(r => r.id !== selectedRoleId);
      if (remaining.length > 0) {
        setSelectedRoleId(remaining[0].id);
      }

      setShowDeleteModal(false);
    } catch (err) {
      console.error('Error cleaning up and deleting role:', err);
      toast.error('Failed to clean up and delete role');
    } finally {
      setDeleting(false);
    }
  };

  // Group permissions for better UI
  const allPermissionValues = Object.values(PERMISSIONS);
  
  const groupedPermissions = {
    'Module Access': allPermissionValues.filter(p => p.startsWith('view_')),
    'Academics': allPermissionValues.filter(p => !p.startsWith('portal_') && !p.startsWith('view_') && (p.includes('marks') || p.includes('timetable') || p.includes('leave') || p.includes('register') || p.includes('substitution'))),
    'Finance': allPermissionValues.filter(p => !p.startsWith('portal_') && !p.startsWith('view_') && (p.includes('fee') || p.includes('payment') || p.includes('expenditure') || p.includes('balance') || p.includes('concession'))),
    'Communication': allPermissionValues.filter(p => p.includes('whatsapp') || p.includes('notification') || p.includes('communication') || p.includes('notices')),
    'Management': allPermissionValues.filter(p => !p.startsWith('view_') && (p.includes('manage_') || p.includes('edit_concessions'))),
    'AI & Analytics': allPermissionValues.filter(p => p.includes('ai_')),
    'Portal & Self Service': allPermissionValues.filter(p => p.startsWith('portal_'))
  };

  // Find uncategorized permissions to ensure nothing is hidden
  const categorizedValues = new Set(Object.values(groupedPermissions).flat());
  const otherPermissions = allPermissionValues.filter(p => !categorizedValues.has(p));
  
  if (otherPermissions.length > 0) {
    (groupedPermissions as any)['Other Permissions'] = otherPermissions;
  }

  const filteredPermissions = (perms: Permission[]) => 
    perms.filter(p => p.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-sidebar">Access Denied</h1>
        <p className="text-neutral-500 max-w-md text-center">You do not have administrative privileges to access the role management system.</p>
      </div>
    );
  }

  // Find selected role's display details
  const currentRoleObj = dbRoles.find(r => r.id === selectedRoleId);

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black text-sidebar tracking-tight">Role Management</h1>
          </div>
          <p className="text-neutral-500 font-medium ml-1">Configure granular access levels for staff and students</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Create Custom Role Button */}
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
          >
            <Plus className="w-4 h-4" />
            <span>Create Role</span>
          </button>

          {/* Delete Selected Role Button */}
          {selectedRoleId !== 'admin' && selectedRoleId !== 'super_admin' && (
            <button 
              onClick={initiateDeleteRole}
              title="Delete Role from Entire ERP"
              className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Role</span>
            </button>
          )}

          <button 
            onClick={handleResetToDefault}
            title="Reset to defaults"
            className="flex items-center gap-2 px-4 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition-all shadow-sm"
          >
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>

          <button 
            onClick={() => dbService.subscribe('roles', [], setDbRoles)} // Trigger re-subscribe/load
            className="p-3 bg-white border border-neutral-200 text-neutral-400 hover:text-indigo-600 rounded-xl transition-all shadow-sm group"
          >
            <RefreshCw className="w-5 h-5 group-active:rotate-180 transition-transform duration-500" />
          </button>

          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Role Sidebar */}
        <div className="lg:col-span-3 space-y-3">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] px-2 mb-4">Select System Role</p>
          
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {dbRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border text-left ${
                  selectedRoleId === role.id 
                    ? 'bg-white border-indigo-600 text-indigo-600 shadow-sm ring-4 ring-indigo-50' 
                    : 'bg-white border-neutral-100 hover:border-neutral-200 text-neutral-500 hover:text-sidebar'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedRoleId === role.id ? 'bg-indigo-50' : 'bg-neutral-50'}`}>
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-sm block capitalize leading-snug">{role.name || role.id.replace(/_/g, ' ')}</span>
                    {role.isSystem ? (
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">System Role</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Custom Role</span>
                    )}
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform shrink-0 ${selectedRoleId === role.id ? 'translate-x-0' : '-translate-x-2 opacity-0'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Permissions Grid */}
        <div className="lg:col-span-9 space-y-6">
          {/* Selected Role Meta Header */}
          {currentRoleObj && (
            <div className="bg-neutral-50 border border-neutral-100 p-5 rounded-3xl flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-sidebar capitalize">{currentRoleObj.name || selectedRoleId.replace(/_/g, ' ')}</h2>
                  <span className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider ${currentRoleObj.isAdmin ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                    {currentRoleObj.isAdmin ? 'Admin' : 'General'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 font-medium leading-tight">{currentRoleObj.description}</p>
              </div>
            </div>
          )}

          {/* Search & Meta */}
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input 
                type="text" 
                placeholder="Search permissions..."
                className="w-full pl-11 pr-4 py-3 bg-neutral-50 border-none rounded-xl outline-none focus:ring-2 ring-indigo-500/10 font-medium transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-4 text-xs font-bold px-2">
              <div className="group relative flex items-center gap-2 text-indigo-600">
                <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.5)]"></span>
                {currentPermissions.length} Enabled
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-neutral-900 text-white p-2 rounded-lg text-[10px] w-24 text-center z-50">
                  Active for {selectedRoleId.replace(/_/g, ' ')}
                </div>
              </div>
              <div className="group relative flex items-center gap-2 text-neutral-400">
                <span className="w-2 h-2 rounded-full bg-neutral-200"></span>
                {Object.values(PERMISSIONS).length - currentPermissions.length} Disabled
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-neutral-900 text-white p-2 rounded-lg text-[10px] w-28 text-center z-50">
                  Total available: {Object.values(PERMISSIONS).length}
                </div>
              </div>
            </div>
          </div>

          {/* Groups */}
          <div className="space-y-8">
            {Object.entries(groupedPermissions).map(([group, perms]) => {
              const filtered = filteredPermissions(perms as Permission[]);
              if (filtered.length === 0) return null;

              return (
                <div key={group} className="space-y-4">
                  <div className="flex items-center gap-3 px-2">
                    <h3 className="text-sm font-black text-sidebar uppercase tracking-widest">{group}</h3>
                    <div className="flex-1 h-[1px] bg-neutral-200"></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filtered.map((permission) => {
                      const isEnabled = currentPermissions.includes(permission);
                      return (
                        <motion.button
                          key={permission}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => togglePermission(permission)}
                          className={`flex items-start gap-3 p-4 rounded-2xl text-left transition-all border ${
                            isEnabled 
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-sm' 
                              : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'
                          }`}
                        >
                          <div className={`mt-0.5 p-1 rounded-md ${isEnabled ? 'text-indigo-600' : 'text-neutral-300'}`}>
                            {isEnabled ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-black uppercase tracking-tight leading-none group-hover:text-indigo-600 transition-colors">
                              {permission.replace(/_/g, ' ')}
                            </p>
                            <p className="text-[10px] font-medium opacity-60 leading-tight">
                              Allow access to {permission.split('_').slice(1).join(' ')} features
                            </p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Info Bar */}
      <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex items-start gap-4">
        <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
          <Info className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <p className="text-amber-900 font-bold">Important Security Note</p>
          <p className="text-sm text-amber-800/80 font-medium animate-pulse-slow">
            Role modifications take effect immediately for all users assigned to the selected role. 
            Ensure you understand the implications of each permission before saving. 
            Static defaults from the code will be used if no custom role configuration is found in the database.
          </p>
        </div>
      </div>

      {/* Create Dynamic Role Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-neutral-100 shadow-2xl max-w-lg w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-neutral-100 bg-linear-to-r from-emerald-50 to-white flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-sidebar tracking-tight">Create Custom Role</h3>
                  <p className="text-xs text-neutral-500 font-medium">Add a new dynamic access tier to the school ERP</p>
                </div>
              </div>

              <form onSubmit={handleCreateRole} className="p-6 space-y-4">
                <div className="space-y-1 font-sans">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Science HOD, Assistant Teacher"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-emerald-500/20 font-bold text-neutral-800 placeholder-neutral-400 transition-all text-sm"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                  <p className="text-[9px] text-neutral-400 font-medium italic">Will be registered with ID identifier style (e.g. science_hod)</p>
                </div>

                <div className="space-y-1 font-sans">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Description</label>
                  <textarea
                    placeholder="Describe what access limits or privileges this role represents..."
                    className="w-full h-24 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none resize-none focus:ring-2 ring-emerald-500/20 font-medium text-neutral-700 placeholder-neutral-400 transition-all text-sm"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>

                <div className="space-y-1 font-sans">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Copy Permissions From (Optional)</label>
                  <div className="relative">
                    <select
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-emerald-500/20 font-bold text-neutral-700 transition-all text-sm appearance-none cursor-pointer"
                      value={copyPermissionsFrom}
                      onChange={(e) => setCopyPermissionsFrom(e.target.value)}
                    >
                      <option value="">Start with empty permissions...</option>
                      {dbRoles.map((r: any) => (
                        <option key={r.id} value={r.id}>
                          {r.name || r.id} ({r.permissions?.length || 0} permissions)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 font-sans">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl font-bold transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-100 transition-all text-sm"
                  >
                    Create Role
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete & Merge/Clean Up Role Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-neutral-100 shadow-2xl max-w-xl w-full overflow-hidden font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-neutral-100 bg-linear-to-r from-rose-50 to-white flex items-center gap-3">
                <div className="p-2.5 bg-rose-100 text-rose-500 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-sidebar tracking-tight font-sans">Delete & Clean Up Role</h3>
                  <p className="text-xs text-rose-500 font-semibold mt-0.5">Remove role "{selectedRoleId.replace(/_/g, ' ').toUpperCase()}" safe & clean</p>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {checkingUsers ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-3">
                    <RefreshCw className="w-8 h-8 text-neutral-300 animate-spin" />
                    <p className="text-xs font-bold text-neutral-500">Scanning school databases for active users using this role...</p>
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-amber-900 leading-tight">Database Scan Results</p>
                        <p className="text-[11px] text-amber-800/80 leading-normal font-medium">
                          We found <span className="font-extrabold">{affectedUsers.length}</span> portal users and <span className="font-extrabold">{affectedStaff.length}</span> staff records currently assigned to this role.
                        </p>
                      </div>
                    </div>

                    {(affectedUsers.length > 0 || affectedStaff.length > 0) ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-rose-500/85 uppercase tracking-widest block">Required Action: Select Target Migration Role</label>
                          <p className="text-[11px] text-neutral-500 font-medium leading-tight">
                            You must transfer these active users to another role to avoid locking them out of the system. Select their new role:
                          </p>
                        </div>
                        
                        <div className="relative">
                          <select
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-rose-500/15 font-bold text-neutral-700 transition-all text-sm appearance-none cursor-pointer"
                            value={targetMergeRoleId}
                            onChange={(e) => setTargetMergeRoleId(e.target.value)}
                          >
                            <option value="" disabled>Select a role to migrate to...</option>
                            {dbRoles
                              .filter(r => r.id !== selectedRoleId)
                              .map((r: any) => (
                                <option key={r.id} value={r.id}>
                                  {r.name || r.id}
                                </option>
                              ))}
                          </select>
                        </div>

                        {affectedUsers.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Preview Affected Users</p>
                            <div className="max-h-24 overflow-y-auto pr-1 border border-neutral-100 rounded-xl p-2 bg-neutral-50/50 space-y-1">
                              {affectedUsers.map((u, i) => (
                                <div key={u.id || i} className="flex items-center justify-between text-[11px] px-1.5 py-1 font-bold hover:bg-white rounded transition-all">
                                  <span className="text-neutral-700">{u.name || u.email}</span>
                                  <span className="text-neutral-400 font-mono text-[9px]">{u.email}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 bg-neutral-50 p-4 border border-neutral-100 rounded-2xl italic leading-relaxed font-medium">
                        No active users or staff are currently assigned to this role. It is completely safe to delete without migrating anyone.
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(false)}
                        className="px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl font-bold transition-all text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={deleting || (!(affectedUsers.length === 0 && affectedStaff.length === 0) && !targetMergeRoleId)}
                        onClick={handleConfirmDeleteAndMerge}
                        className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-40 transition-all text-sm shadow-lg shadow-rose-100"
                      >
                        {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {deleting ? 'Cleaning up...' : 'Confirm Deletion & Merge'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
