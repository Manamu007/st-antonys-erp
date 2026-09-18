import React, { useState, useEffect, useMemo } from 'react';
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
  Check,
  BookOpen,
  GraduationCap,
  Copy,
  Filter,
  CheckSquare,
  Square,
  ExternalLink,
  Layers,
  Sparkles,
  School,
  Calendar,
  DollarSign,
  ClipboardList,
  Building,
  Bus,
  Home,
  MessageSquare,
  Cpu,
  UserCheck
} from 'lucide-react';
import { dbService, where } from '../services/dbService';
import { PERMISSIONS, ROLE_PERMISSIONS, Permission, Role } from '../constants/permissions';
import { useAuth } from '../context/AuthContext';
import { syncDefaultRoles } from '../services/roleService';
import { toast } from 'sonner';

type ActiveTab = 'matrix' | 'academics_scope' | 'members';
type FilterStatus = 'all' | 'enabled' | 'disabled';

interface CategoryConfig {
  name: string;
  description: string;
  icon: React.ReactNode;
  match: (p: Permission) => boolean;
}

export default function Roles() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('matrix');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('teacher_class');
  const [dbRoles, setDbRoles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [saving, setSaving] = useState(false);
  const [currentPermissions, setCurrentPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // Academics scope data
  const [batches, setBatches] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loadingAcademics, setLoadingAcademics] = useState(false);
  const [academicsSearch, setAcademicsSearch] = useState('');

  // Role Members data
  const [roleUsers, setRoleUsers] = useState<any[]>([]);
  const [roleStaff, setRoleStaff] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Create / Clone role form fields
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
  const loadRoles = () => {
    if (!isAdmin) return;
    dbService.list('roles').then((data) => {
      const activeRoles = data.filter((r: any) => !r.isDeleted);
      setDbRoles(activeRoles);
      
      if (activeRoles.length > 0 && !activeRoles.some(r => r.id === selectedRoleId)) {
        const hasClassTeacher = activeRoles.some(r => r.id === 'teacher_class');
        setSelectedRoleId(hasClassTeacher ? 'teacher_class' : activeRoles[0].id);
      }
    }).catch(e => console.error(e));
  };

  useEffect(() => {
    loadRoles();
  }, [isAdmin]);

  // Fetch permissions for selected role
  useEffect(() => {
    setLoading(true);
    const roleKey = selectedRoleId.toLowerCase();
    dbService.get('roles', roleKey).then((roleData: any) => {
      if (roleData && !roleData.isDeleted && Array.isArray(roleData.permissions)) {
        setCurrentPermissions(roleData.permissions);
      } else {
        setCurrentPermissions((ROLE_PERMISSIONS as any)[selectedRoleId] || []);
      }
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, [selectedRoleId]);

  // Load Academics batches, classes, staff when tab is open
  const loadAcademicsData = async () => {
    setLoadingAcademics(true);
    try {
      const [batchesData, classesData, staffData] = await Promise.all([
        dbService.list('batches').catch(() => []),
        dbService.list('classes').catch(() => []),
        dbService.list('staff').catch(() => [])
      ]);
      setBatches(batchesData || []);
      setClasses(classesData || []);
      setStaffList(staffData || []);
    } catch (e) {
      console.error('Error loading Academics data for roles:', e);
    } finally {
      setLoadingAcademics(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'academics_scope') {
      loadAcademicsData();
    } else if (activeTab === 'members') {
      loadRoleMembers();
    }
  }, [activeTab, selectedRoleId]);

  // Load members for selected role
  const loadRoleMembers = async () => {
    setLoadingMembers(true);
    try {
      const [allUsers, allStaff] = await Promise.all([
        dbService.list('users', [where('role', '==', selectedRoleId)]).catch(() => []),
        dbService.list('staff', [where('role', '==', selectedRoleId)]).catch(() => [])
      ]);
      setRoleUsers(allUsers || []);
      setRoleStaff(allStaff || []);
    } catch (e) {
      console.error('Error loading role members:', e);
    } finally {
      setLoadingMembers(false);
    }
  };

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

  // Bulk actions on a specific list of permissions
  const selectAllPermissions = (perms: Permission[]) => {
    if (!isAdmin) return;
    setCurrentPermissions(prev => Array.from(new Set([...prev, ...perms])));
    toast.success(`Enabled all ${perms.length} permissions in section`);
  };

  const clearAllPermissions = (perms: Permission[]) => {
    if (!isAdmin) return;
    const toRemove = new Set(perms);
    setCurrentPermissions(prev => prev.filter(p => !toRemove.has(p)));
    toast.info(`Disabled all permissions in section`);
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
      toast.success(`${(activeRoleDoc?.name || selectedRoleId).replace(/_/g, ' ')} permissions saved successfully to database!`);
      loadRoles();
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
    
    if (dbRoles.some((r: any) => r.id === generatedId)) {
      toast.error('A role with this name already exists');
      return;
    }

    try {
      let initialPerms: string[] = [];
      if (copyPermissionsFrom) {
        const sourceRoleDoc = dbRoles.find(r => r.id === copyPermissionsFrom);
        if (sourceRoleDoc && Array.isArray(sourceRoleDoc.permissions)) {
          initialPerms = sourceRoleDoc.permissions;
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
      loadRoles();
    } catch (err) {
      console.error('Error creating role:', err);
      toast.error('Failed to create role');
    }
  };

  // Clone active role
  const handleCloneRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newRoleName.trim()) {
      toast.error('Role name is required');
      return;
    }

    const generatedId = newRoleName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (dbRoles.some((r: any) => r.id === generatedId)) {
      toast.error('A role with this identifier already exists');
      return;
    }

    try {
      await dbService.set('roles', generatedId, {
        id: generatedId,
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || `Cloned from ${selectedRoleId.replace(/_/g, ' ')}`,
        permissions: [...currentPermissions],
        isAdmin: false,
        isSystem: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      toast.success(`Role cloned successfully with ${currentPermissions.length} permissions!`);
      setSelectedRoleId(generatedId);
      setShowCloneModal(false);
      setNewRoleName('');
      setNewRoleDesc('');
      loadRoles();
    } catch (err) {
      console.error('Error cloning role:', err);
      toast.error('Failed to clone role');
    }
  };

  // Initiate Deletion Wizard
  const initiateDeleteRole = async () => {
    if (!isAdmin) return;
    if (selectedRoleId === 'admin' || selectedRoleId === 'super_admin' || selectedRoleId === 'teacher_class' || selectedRoleId === 'teacher_subject') {
      toast.error('Essential system roles cannot be deleted.');
      return;
    }

    setCheckingUsers(true);
    setShowDeleteModal(true);
    setAffectedUsers([]);
    setAffectedStaff([]);
    
    try {
      const [usersMatching, staffMatching] = await Promise.all([
        dbService.list('users', [where('role', '==', selectedRoleId)]).catch(() => []),
        dbService.list('staff', [where('role', '==', selectedRoleId)]).catch(() => [])
      ]);

      setAffectedUsers(usersMatching || []);
      setAffectedStaff(staffMatching || []);

      const safeFallbacks = dbRoles.filter(r => r.id !== selectedRoleId && (r.id === 'staff' || r.id === 'teacher_subject' || r.id === 'clerk'));
      if (safeFallbacks.length > 0) {
        setTargetMergeRoleId(safeFallbacks[0].id);
      } else {
        const anyOther = dbRoles.find(r => r.id !== selectedRoleId);
        if (anyOther) setTargetMergeRoleId(anyOther.id);
      }
    } catch (err) {
      console.error('Error checking users for role deletion:', err);
      toast.error('Failed to scan database users');
    } finally {
      setCheckingUsers(false);
    }
  };

  const handleConfirmDeleteAndMerge = async () => {
    if (!isAdmin || !targetMergeRoleId) return;
    setDeleting(true);

    try {
      const targetRoleDoc = dbRoles.find(r => r.id === targetMergeRoleId);
      const targetRoleName = targetRoleDoc ? targetRoleDoc.name : targetMergeRoleId;

      if (affectedUsers.length > 0) {
        const userUpdates = affectedUsers.map(u => 
          dbService.update('users', u.id, {
            role: targetMergeRoleId,
            updatedAt: new Date().toISOString()
          })
        );
        await Promise.all(userUpdates);
      }

      if (affectedStaff.length > 0) {
        const staffUpdates = affectedStaff.map(s => 
          dbService.update('staff', s.id, {
            role: targetMergeRoleId,
            updatedAt: new Date().toISOString()
          })
        );
        await Promise.all(staffUpdates);
      }

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
        } active records migrated to "${targetRoleName}".`
      );

      const remaining = dbRoles.filter(r => r.id !== selectedRoleId && !r.isDeleted);
      if (remaining.length > 0) {
        setSelectedRoleId(remaining[0].id);
      }

      setShowDeleteModal(false);
      loadRoles();
    } catch (err) {
      console.error('Error cleaning up and deleting role:', err);
      toast.error('Failed to clean up and delete role');
    } finally {
      setDeleting(false);
    }
  };

  // Accurate Categories with Granular Classification
  const categories: CategoryConfig[] = useMemo(() => [
    {
      name: 'Academics & Timetable',
      description: 'Manage academic classes, sections, batches, subjects, holidays, and schedule duties',
      icon: <BookOpen className="w-5 h-5 text-blue-600" />,
      match: (p) => (
        p.includes('classes_') ||
        p.includes('batches_') ||
        p.includes('subjects_') ||
        p.includes('holidays_') ||
        p.includes('timetable_') ||
        p === 'view_timetable'
      )
    },
    {
      name: 'Class Teacher Scoped Duties',
      description: 'Attendance taking, class registers, student leaves, and class marksheets automatically bound to assigned batch',
      icon: <GraduationCap className="w-5 h-5 text-indigo-600" />,
      match: (p) => (
        p === 'attendance_manage_my' ||
        p === 'attendance_view_my' ||
        p === 'view_class_marksheets' ||
        p === 'view_central_register' ||
        p === 'student_leaves_approve' ||
        p === 'student_leaves_view' ||
        p === 'timetable_view_my' ||
        p === 'exams_view_my' ||
        p === 'homework_view_my'
      )
    },
    {
      name: 'Exams & Gradebook',
      description: 'Exam scheduling, marks entry, hall tickets, progress cards, and academic assessments',
      icon: <ClipboardList className="w-5 h-5 text-violet-600" />,
      match: (p) => (
        p.includes('exams_') ||
        p.includes('marks') ||
        p === 'edit_marks' ||
        p === 'view_marks'
      )
    },
    {
      name: 'Students & Admissions',
      description: 'Student profiles, admission registration, parent info, promotions, and concessions',
      icon: <Users className="w-5 h-5 text-emerald-600" />,
      match: (p) => p.includes('students_') || p === 'view_students' || p === 'manage_students'
    },
    {
      name: 'Staff & Human Resources',
      description: 'Faculty directory, staff attendance, payroll, teaching assignments, and staff leave approvals',
      icon: <UserCheck className="w-5 h-5 text-amber-600" />,
      match: (p) => (
        p.includes('staff_') ||
        p === 'view_staff' ||
        p === 'manage_staff' ||
        p === 'payroll_manage'
      )
    },
    {
      name: 'Fees & Finance',
      description: 'Fee collection, structure setup, concession approvals, expenditure tracking, and balance sheets',
      icon: <DollarSign className="w-5 h-5 text-emerald-700" />,
      match: (p) => (
        p.includes('fee') ||
        p.includes('payment') ||
        p.includes('expenditure') ||
        p.includes('concession') ||
        p.includes('balance') ||
        p === 'view_fees'
      )
    },
    {
      name: 'Attendance & Leaves',
      description: 'Daily pupil attendance, biometric logs, staff leaves, student leave applications, and holiday registers',
      icon: <Calendar className="w-5 h-5 text-teal-600" />,
      match: (p) => (
        p.includes('attendance') ||
        p.includes('leaves') ||
        p.includes('leave')
      )
    },
    {
      name: 'Homework & Class Tasks',
      description: 'Homework creation, subject-wise assignments, digital submissions, and evaluations',
      icon: <CheckSquare className="w-5 h-5 text-cyan-600" />,
      match: (p) => p.includes('homework')
    },
    {
      name: 'Front Office, Library & Certificates',
      description: 'Visitor logs, postal dispatch, library catalog, book issues/returns, and TC/study certificates',
      icon: <Building className="w-5 h-5 text-orange-600" />,
      match: (p) => (
        p.includes('front_office') ||
        p.includes('library') ||
        p.includes('certificates')
      )
    },
    {
      name: 'Transport, Fleet & Hostel',
      description: 'School buses, routes, driver portal, GPS tracking, boarding rooms, mess, and outing passes',
      icon: <Bus className="w-5 h-5 text-yellow-600" />,
      match: (p) => (
        p.includes('transport') ||
        p.includes('hostel') ||
        p.includes('driver_portal')
      )
    },
    {
      name: 'Communication & WhatsApp',
      description: 'Direct WhatsApp notices, fee reminders, automated attendance alerts, and birthday broadcasts',
      icon: <MessageSquare className="w-5 h-5 text-emerald-500" />,
      match: (p) => (
        p.includes('whatsapp') ||
        p.includes('communication') ||
        p.includes('notifications') ||
        p.includes('notices')
      )
    },
    {
      name: 'AI Hub & Advanced Analytics',
      description: 'Dropout risk prediction engine, smart timetable drafting, and AI grading assistants',
      icon: <Cpu className="w-5 h-5 text-purple-600" />,
      match: (p) => (
        p.includes('ai_') ||
        p.includes('period_substitution') ||
        p.includes('performance_insights')
      )
    },
    {
      name: 'Portal & Self Service (Students/Parents)',
      description: 'Student & parent mobile/web portal view of marks, fees, timetable, and leaves',
      icon: <Layers className="w-5 h-5 text-rose-600" />,
      match: (p) => p.startsWith('portal_student_')
    },
    {
      name: 'Administration & System Settings',
      description: 'Role management, ERP configuration, audit logs, and security controls',
      icon: <Shield className="w-5 h-5 text-red-600" />,
      match: (p) => (
        p.includes('roles') ||
        p.includes('settings') ||
        p.includes('reports')
      )
    }
  ], []);

  // Filtered permission values across all categories
  const allPermsList = useMemo(() => Object.values(PERMISSIONS) as Permission[], []);

  // Map each category to its matched permissions
  const categorizedData = useMemo(() => {
    const assigned = new Set<string>();
    const result = categories.map(cat => {
      const matched = allPermsList.filter(p => cat.match(p));
      matched.forEach(p => assigned.add(p));
      return {
        ...cat,
        permissions: matched
      };
    });

    // Capture any uncategorized permissions
    const uncategorized = allPermsList.filter(p => !assigned.has(p));
    if (uncategorized.length > 0) {
      result.push({
        name: 'General & Module Permissions',
        description: 'Standard module view and operational privileges',
        icon: <Layers className="w-5 h-5 text-neutral-600" />,
        match: () => true,
        permissions: uncategorized
      });
    }

    return result;
  }, [categories, allPermsList]);

  // Apply search and status filter to permissions
  const filterPerms = (perms: Permission[]) => {
    return perms.filter(p => {
      // Status filter
      const isEnabled = currentPermissions.includes(p);
      if (filterStatus === 'enabled' && !isEnabled) return false;
      if (filterStatus === 'disabled' && isEnabled) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const formatted = p.replace(/_/g, ' ').toLowerCase();
        return p.toLowerCase().includes(q) || formatted.includes(q);
      }
      return true;
    });
  };

  const currentRoleObj = dbRoles.find(r => r.id === selectedRoleId);

  // Academics scope filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (!academicsSearch.trim()) return true;
      const q = academicsSearch.toLowerCase().trim();
      const bName = String(b.name || b.batchName || '').toLowerCase();
      const cName = String(b.className || b.class || '').toLowerCase();
      const tName = String(b.classTeacherName || b.classTeacher || '').toLowerCase();
      const tEmail = String(b.classTeacherEmail || '').toLowerCase();
      return bName.includes(q) || cName.includes(q) || tName.includes(q) || tEmail.includes(q);
    });
  }, [batches, academicsSearch]);

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-sans">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-sidebar">Access Restricted</h1>
        <p className="text-neutral-500 max-w-md text-center">
          You do not have administrative privileges to access the Role Management and Permission system.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto font-sans">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-neutral-200 pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-sidebar tracking-tight">Role & Permission System</h1>
              <p className="text-neutral-500 text-sm font-medium mt-0.5">
                Advanced database-driven role management & Academics Class Teacher dynamic permissions
              </p>
            </div>
          </div>
        </div>
        
        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Role</span>
          </button>

          <button 
            onClick={() => setShowCloneModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 text-neutral-700 rounded-xl font-bold hover:bg-neutral-50 transition-all shadow-sm text-sm"
          >
            <Copy className="w-4 h-4 text-indigo-600" />
            <span>Clone Active Role</span>
          </button>

          {selectedRoleId !== 'admin' && selectedRoleId !== 'super_admin' && selectedRoleId !== 'teacher_class' && selectedRoleId !== 'teacher_subject' && (
            <button 
              onClick={initiateDeleteRole}
              title="Safely delete role and migrate users"
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all text-sm"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Role</span>
            </button>
          )}

          <button 
            onClick={handleResetToDefault}
            title="Restore system defaults for this role"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition-all text-sm"
          >
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span>Reset Defaults</span>
          </button>

          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 text-sm"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center gap-2.5 px-6 py-3.5 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'matrix'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Permissions Matrix</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-600 font-extrabold">
            {currentPermissions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('academics_scope')}
          className={`flex items-center gap-2.5 px-6 py-3.5 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'academics_scope'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Academics Class Teacher Scope</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-600 font-extrabold">
            Live
          </span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2.5 px-6 py-3.5 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'members'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Assigned Staff & Users</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-600 font-extrabold">
            {roleUsers.length + roleStaff.length}
          </span>
        </button>
      </div>

      {/* TAB 1: PERMISSIONS MATRIX */}
      {activeTab === 'matrix' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Sidebar: Roles List */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between px-2">
              <span className="text-[11px] font-black text-neutral-400 uppercase tracking-wider">
                Select ERP Role
              </span>
              <span className="text-[11px] font-bold text-neutral-400">
                {dbRoles.length} Roles
              </span>
            </div>
            
            <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
              {dbRoles.map((role) => {
                const isSelected = selectedRoleId === role.id;
                const isClassTeacher = role.id === 'teacher_class';
                const isSubjectTeacher = role.id === 'teacher_subject';
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all border text-left ${
                      isSelected 
                        ? 'bg-white border-indigo-600 text-indigo-600 shadow-sm ring-4 ring-indigo-50' 
                        : 'bg-white border-neutral-200/80 hover:border-neutral-300 text-neutral-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl shrink-0 ${
                        isSelected ? 'bg-indigo-50 text-indigo-600' : 'bg-neutral-100 text-neutral-400'
                      }`}>
                        {isClassTeacher ? <GraduationCap className="w-4 h-4 text-indigo-600" /> :
                         isSubjectTeacher ? <BookOpen className="w-4 h-4 text-blue-600" /> :
                         <Key className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-sm block capitalize truncate">
                          {role.name || role.id.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {role.isSystem ? (
                            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">System</span>
                          ) : (
                            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Custom</span>
                          )}
                          <span className="text-[9px] text-neutral-300">•</span>
                          <span className="text-[9px] font-semibold text-neutral-400">
                            {role.permissions?.length || 0} perms
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform shrink-0 ${isSelected ? 'translate-x-0 text-indigo-600' : 'opacity-0 -translate-x-2'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Area: Permissions Matrix */}
          <div className="lg:col-span-9 space-y-6">
            {/* Selected Role Banner */}
            {currentRoleObj && (
              <div className="bg-neutral-50 border border-neutral-200/80 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-black text-sidebar capitalize">
                      {currentRoleObj.name || selectedRoleId.replace(/_/g, ' ')}
                    </h2>
                    <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider ${
                      currentRoleObj.isAdmin 
                        ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                        : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                    }`}>
                      {currentRoleObj.isAdmin ? 'Admin Tier' : 'Staff / Member Tier'}
                    </span>
                    {selectedRoleId === 'teacher_class' && (
                      <span className="px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Academics Bound
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 font-medium">
                    {currentRoleObj.description || `Permissions configuration for ${selectedRoleId}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-2xl font-black text-indigo-600 block leading-none">
                      {currentPermissions.length}
                    </span>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      Active Permissions
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Controls Bar: Search & Status Filters */}
            <div className="bg-white p-4 rounded-3xl border border-neutral-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input 
                  type="text" 
                  placeholder="Search permissions by name or keyword..."
                  className="w-full pl-11 pr-4 py-2.5 bg-neutral-50 border border-neutral-200/80 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-medium text-sm transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterStatus === 'all'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  All ({allPermsList.length})
                </button>
                <button
                  onClick={() => setFilterStatus('enabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterStatus === 'enabled'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  Enabled ({currentPermissions.length})
                </button>
                <button
                  onClick={() => setFilterStatus('disabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterStatus === 'disabled'
                      ? 'bg-neutral-800 text-white shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  Disabled ({allPermsList.length - currentPermissions.length})
                </button>
              </div>
            </div>

            {/* Granular Categories Grid */}
            <div className="space-y-6">
              {categorizedData.map((cat) => {
                const visiblePerms = filterPerms(cat.permissions);
                if (visiblePerms.length === 0 && (searchQuery.trim() || filterStatus !== 'all')) {
                  return null;
                }

                const enabledCount = cat.permissions.filter(p => currentPermissions.includes(p)).length;
                const totalCount = cat.permissions.length;
                const isAllSelected = totalCount > 0 && enabledCount === totalCount;
                const isNoneSelected = enabledCount === 0;

                return (
                  <div key={cat.name} className="bg-white rounded-3xl border border-neutral-200/80 shadow-xs overflow-hidden">
                    {/* Category Header with Bulk Actions */}
                    <div className="p-4 sm:p-5 bg-neutral-50/70 border-b border-neutral-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white border border-neutral-200 rounded-xl shrink-0 shadow-xs">
                          {cat.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-sidebar tracking-tight">
                              {cat.name}
                            </h3>
                            <span className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider ${
                              isAllSelected 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isNoneSelected
                                ? 'bg-neutral-100 text-neutral-500'
                                : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                            }`}>
                              {enabledCount} of {totalCount} Active
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 font-medium mt-0.5">
                            {cat.description}
                          </p>
                        </div>
                      </div>

                      {/* Bulk Select / Clear Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => selectAllPermissions(cat.permissions)}
                          disabled={isAllSelected}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 hover:border-indigo-300 hover:text-indigo-600 text-neutral-600 text-xs font-bold rounded-lg transition-all disabled:opacity-40"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Select All</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => clearAllPermissions(cat.permissions)}
                          disabled={isNoneSelected}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 hover:border-rose-300 hover:text-rose-600 text-neutral-600 text-xs font-bold rounded-lg transition-all disabled:opacity-40"
                        >
                          <Square className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Clear All</span>
                        </button>
                      </div>
                    </div>

                    {/* Permissions Badges / Cards */}
                    <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {visiblePerms.map((permission) => {
                        const isEnabled = currentPermissions.includes(permission);
                        return (
                          <motion.button
                            key={permission}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => togglePermission(permission)}
                            className={`flex items-start gap-3 p-3.5 rounded-2xl text-left transition-all border ${
                              isEnabled 
                                ? 'bg-indigo-50/70 border-indigo-300/80 text-indigo-950 shadow-xs' 
                                : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-500'
                            }`}
                          >
                            <div className={`mt-0.5 p-1 rounded-lg shrink-0 ${
                              isEnabled ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-neutral-300'
                            }`}>
                              {isEnabled ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <p className={`text-xs font-black uppercase tracking-tight leading-snug truncate ${
                                isEnabled ? 'text-indigo-900' : 'text-neutral-700'
                              }`}>
                                {permission.replace(/_/g, ' ')}
                              </p>
                              <p className="text-[10px] text-neutral-500 font-medium leading-tight line-clamp-2">
                                {permission.startsWith('view_') 
                                  ? `Read and view access for ${permission.replace('view_', '').replace(/_/g, ' ')}`
                                  : permission.includes('manage')
                                  ? `Full management, creation, and editing rights for ${permission.replace('manage_', '').replace(/_/g, ' ')}`
                                  : `Allow operation: ${permission.replace(/_/g, ' ')}`}
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
      )}

      {/* TAB 2: ACADEMICS CLASS TEACHER SCOPE */}
      {activeTab === 'academics_scope' && (
        <div className="space-y-6">
          {/* Informational Guidance Banner */}
          <div className="bg-linear-to-r from-indigo-50 via-white to-emerald-50 border border-indigo-200 p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs">
            <div className="space-y-2 max-w-3xl">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-600 text-white rounded-xl">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-black text-sidebar">
                  Dynamic Class Teacher Scope & Binding
                </h2>
              </div>
              <p className="text-sm text-neutral-700 font-medium leading-relaxed">
                In this school ERP, a faculty member's <strong>Class Teacher permissions</strong> are 
                automatically evaluated in real-time based on the <strong>Academics module batch assignments</strong>. 
                When a teacher is assigned to a Batch in Academics, their system role instantly activates as{' '}
                <span className="font-bold text-indigo-600">Class Teacher (teacher_class)</span> with authority 
                strictly scoped to their assigned Class & Section.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-neutral-600 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Attendance Taking scoped to their batch
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Class Marksheets & Register access
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Student Leave Approvals for their class
                </span>
              </div>
            </div>

            <div className="shrink-0">
              <a
                href="/academics"
                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 text-sm"
              >
                <span>Academics Module</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Search Batches */}
          <div className="bg-white p-4 rounded-3xl border border-neutral-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search classes, sections, or assigned teacher name/email..."
                className="w-full pl-11 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-medium text-sm transition-all"
                value={academicsSearch}
                onChange={(e) => setAcademicsSearch(e.target.value)}
              />
            </div>
            <button
              onClick={loadAcademicsData}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl text-sm transition-all shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loadingAcademics ? 'animate-spin' : ''}`} />
              <span>Refresh Academics</span>
            </button>
          </div>

          {/* Batches & Assigned Class Teachers Table */}
          <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-neutral-50/80 border-b border-neutral-200 text-[11px] font-black text-neutral-400 uppercase tracking-wider">
                    <th className="py-4 px-6">Class & Batch</th>
                    <th className="py-4 px-6">Assigned Class Teacher</th>
                    <th className="py-4 px-6">Teacher Contact / Email</th>
                    <th className="py-4 px-6">Dynamic Scope Status</th>
                    <th className="py-4 px-6 text-right">Effective Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingAcademics ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span className="font-bold text-sm">Loading Academics classes and batches...</span>
                      </td>
                    </tr>
                  ) : filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-400 font-medium">
                        No batches found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => {
                      const matchedClass = classes.find(c => c.id === batch.classId);
                      const className = batch.className || matchedClass?.name || batch.class || 'Class';
                      const batchName = batch.name || batch.batchName || 'Section';
                      const teacherName = batch.classTeacherName || batch.classTeacher || '';
                      const teacherEmail = batch.classTeacherEmail || '';
                      const isAssigned = Boolean(batch.classTeacherId || (teacherName && teacherName !== 'Not Assigned'));

                      return (
                        <tr key={batch.id} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs">
                                <School className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="font-bold text-neutral-800 block text-sm">
                                  {className} - {batchName}
                                </span>
                                <span className="text-xs text-neutral-400 font-mono">
                                  ID: {batch.id}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-6">
                            {isAssigned ? (
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs">
                                  {teacherName.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-bold text-neutral-800">
                                  {teacherName}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Not Assigned in Academics
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-6 text-neutral-500 font-medium">
                            {teacherEmail ? (
                              <span className="font-mono text-xs text-neutral-600">{teacherEmail}</span>
                            ) : (
                              <span className="text-neutral-400 text-xs italic">No email linked</span>
                            )}
                          </td>

                          <td className="py-4 px-6">
                            {isAssigned ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-extrabold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Active Class Teacher Binding
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-500 rounded-full text-xs font-bold">
                                Subject Teacher Mode Only
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-6 text-right">
                            <span className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg ${
                              isAssigned ? 'bg-indigo-50 text-indigo-700' : 'bg-neutral-100 text-neutral-600'
                            }`}>
                              {isAssigned ? 'teacher_class' : 'teacher_subject'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROLE MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-3xl border border-neutral-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder={`Search users currently holding the role "${selectedRoleId.replace(/_/g, ' ')}"...`}
                className="w-full pl-11 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-medium text-sm transition-all"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>
            <button
              onClick={loadRoleMembers}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl text-sm transition-all shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loadingMembers ? 'animate-spin' : ''}`} />
              <span>Refresh Members</span>
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-neutral-50/80 border-b border-neutral-200 text-[11px] font-black text-neutral-400 uppercase tracking-wider">
                    <th className="py-4 px-6">Name & Identifier</th>
                    <th className="py-4 px-6">Email Address</th>
                    <th className="py-4 px-6">Phone / WhatsApp</th>
                    <th className="py-4 px-6">Designation / Department</th>
                    <th className="py-4 px-6 text-right">Collection Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingMembers ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span className="font-bold text-sm">Scanning users and staff records...</span>
                      </td>
                    </tr>
                  ) : [...roleStaff, ...roleUsers].length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-400 font-medium">
                        No active users or staff currently hold the role "{selectedRoleId.replace(/_/g, ' ')}".
                      </td>
                    </tr>
                  ) : (
                    [...roleStaff, ...roleUsers]
                      .filter(m => {
                        if (!memberSearch.trim()) return true;
                        const q = memberSearch.toLowerCase().trim();
                        const mName = String(m.name || m.displayName || '').toLowerCase();
                        const mEmail = String(m.email || '').toLowerCase();
                        return mName.includes(q) || mEmail.includes(q);
                      })
                      .map((member, idx) => {
                        const isStaffSource = 'department' in member || 'qualification' in member;
                        return (
                          <tr key={member.id || idx} className="hover:bg-neutral-50/60 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">
                                  {(member.name || member.email || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <span className="font-bold text-neutral-800 block text-sm">
                                    {member.name || member.displayName || 'Unnamed Account'}
                                  </span>
                                  <span className="text-xs text-neutral-400 font-mono">
                                    ID: {member.id || member.uid}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="py-4 px-6 font-mono text-xs text-neutral-600">
                              {member.email || '—'}
                            </td>

                            <td className="py-4 px-6 text-neutral-600 font-medium">
                              {member.phone || member.mobile || member.whatsappNumber || '—'}
                            </td>

                            <td className="py-4 px-6 text-neutral-700 font-medium">
                              {member.designation || member.department || 'Active Member'}
                            </td>

                            <td className="py-4 px-6 text-right">
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                isStaffSource 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {isStaffSource ? 'Staff Directory' : 'User Account'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ROLE MODAL */}
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
                  <p className="text-xs text-neutral-500 font-medium">Add a new dynamic access role to the school ERP</p>
                </div>
              </div>

              <form onSubmit={handleCreateRole} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Science HOD, Assistant Teacher"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-emerald-500/20 font-bold text-neutral-800 placeholder-neutral-400 transition-all text-sm"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Description</label>
                  <textarea
                    placeholder="Describe what access limits or privileges this role represents..."
                    className="w-full h-24 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none resize-none focus:ring-2 ring-emerald-500/20 font-medium text-neutral-700 placeholder-neutral-400 transition-all text-sm"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Copy Permissions From (Optional)</label>
                  <select
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-emerald-500/20 font-bold text-neutral-700 transition-all text-sm"
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

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
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

      {/* CLONE ROLE MODAL */}
      <AnimatePresence>
        {showCloneModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-neutral-100 shadow-2xl max-w-lg w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-neutral-100 bg-linear-to-r from-indigo-50 to-white flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-sidebar tracking-tight">Clone Role: {selectedRoleId}</h3>
                  <p className="text-xs text-neutral-500 font-medium">
                    Duplicate this role with all {currentPermissions.length} active permissions
                  </p>
                </div>
              </div>

              <form onSubmit={handleCloneRole} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">New Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senior Class Teacher, Primary Coordinator"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-neutral-800 placeholder-neutral-400 transition-all text-sm"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Description</label>
                  <textarea
                    placeholder="Describe what access limits or privileges this role represents..."
                    className="w-full h-24 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none resize-none focus:ring-2 ring-indigo-500/20 font-medium text-neutral-700 placeholder-neutral-400 transition-all text-sm"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setShowCloneModal(false)}
                    className="px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl font-bold transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all text-sm"
                  >
                    Clone & Create
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE & MERGE ROLE MODAL */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-neutral-100 shadow-2xl max-w-xl w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-neutral-100 bg-linear-to-r from-rose-50 to-white flex items-center gap-3">
                <div className="p-2.5 bg-rose-100 text-rose-500 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-sidebar tracking-tight">Delete Role: {selectedRoleId}</h3>
                  <p className="text-xs text-rose-500 font-semibold mt-0.5">Safely remove and reassign active accounts</p>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {checkingUsers ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-3">
                    <RefreshCw className="w-8 h-8 text-neutral-300 animate-spin" />
                    <p className="text-xs font-bold text-neutral-500">Scanning school database for users using this role...</p>
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-amber-900 leading-tight">Database Scan Results</p>
                        <p className="text-[11px] text-amber-800/80 leading-normal font-medium">
                          Found <span className="font-extrabold">{affectedUsers.length}</span> user accounts and <span className="font-extrabold">{affectedStaff.length}</span> staff records currently assigned to this role.
                        </p>
                      </div>
                    </div>

                    {(affectedUsers.length > 0 || affectedStaff.length > 0) ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-rose-500/85 uppercase tracking-widest block">
                            Select Migration Target Role
                          </label>
                          <p className="text-[11px] text-neutral-500 font-medium leading-tight">
                            Select a new role to reassign these active accounts to:
                          </p>
                        </div>
                        
                        <select
                          className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-rose-500/15 font-bold text-neutral-700 transition-all text-sm"
                          value={targetMergeRoleId}
                          onChange={(e) => setTargetMergeRoleId(e.target.value)}
                        >
                          <option value="" disabled>Select target role...</option>
                          {dbRoles
                            .filter(r => r.id !== selectedRoleId)
                            .map((r: any) => (
                              <option key={r.id} value={r.id}>
                                {r.name || r.id}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 bg-neutral-50 p-4 border border-neutral-100 rounded-2xl italic leading-relaxed font-medium">
                        No active users or staff records are assigned to this role. It can be deleted safely.
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
                        <span>{deleting ? 'Cleaning up...' : 'Confirm Deletion & Migrate'}</span>
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
