import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users as UsersIcon, 
  Search, 
  Plus, 
  Key, 
  Shield, 
  Edit, 
  Trash2, 
  Check, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  X, 
  UserPlus, 
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { PERMISSIONS, ROLE_PERMISSIONS, Permission, Role } from '../constants/permissions';
import { toast } from 'sonner';

// Helper function to map staff designation or staff role string to system role ID
function mapStaffDesignationToRoleId(designation: string, staffRole?: string): string {
  const norm = (designation || staffRole || '').toLowerCase().trim();
  if (norm.includes('super admin') || norm.includes('super_admin')) return 'super_admin';
  if (norm.includes('vice principal') || norm.includes('vice_principal')) return 'vice_principal';
  if (norm.includes('principal')) return 'principal';
  if (norm.includes('coordinator')) return 'coordinator';
  if (norm.includes('class teacher') || norm.includes('teacher_class')) return 'teacher_class';
  if (norm.includes('subject teacher') || norm.includes('teacher_subject')) return 'teacher_subject';
  if (norm.includes('teacher')) return 'teacher';
  if (norm.includes('accountant')) return 'accountant';
  if (norm.includes('clerk')) return 'clerk';
  if (norm.includes('receptionist')) return 'receptionist';
  if (norm.includes('warden')) return 'warden';
  if (norm.includes('driver')) return 'driver';
  if (norm.includes('parent')) return 'parent';
  if (norm.includes('student')) return 'student';
  if (norm.includes('admin')) return 'admin';
  return '';
}

// Standard available roles
const AVAILABLE_ROLES = [
  { id: 'admin', name: 'Admin' },
  { id: 'super_admin', name: 'Super Admin' },
  { id: 'principal', name: 'Principal' },
  { id: 'vice_principal', name: 'Vice Principal' },
  { id: 'coordinator', name: 'Coordinator' },
  { id: 'teacher', name: 'Teacher' },
  { id: 'teacher_class', name: 'Class Teacher' },
  { id: 'teacher_subject', name: 'Subject Teacher' },
  { id: 'accountant', name: 'Accountant' },
  { id: 'clerk', name: 'Clerk' },
  { id: 'receptionist', name: 'Receptionist' },
  { id: 'warden', name: 'Hostel Warden' },
  { id: 'driver', name: 'Driver' },
  { id: 'student', name: 'Student' },
  { id: 'parent', name: 'Parent' }
];

// Group system permissions for clear visual mapping
const PERMISSION_GROUPS = [
  {
    category: 'Global View Options',
    perms: [
      { key: 'view_notices', label: 'View Notices & Bulletins' },
      { key: 'view_attendance', label: 'View School Attendance' },
      { key: 'view_fees', label: 'View Fees' },
      { key: 'view_marks', label: 'View Academic Marks' },
      { key: 'view_timetable', label: 'View Timetables' },
      { key: 'view_staff', label: 'View Staff Members' },
      { key: 'view_students', label: 'View Student Body' }
    ]
  },
  {
    category: 'Students Module',
    perms: [
      { key: 'students_view', label: 'View Students' },
      { key: 'students_view_all', label: 'Access All Student Records' },
      { key: 'students_create', label: 'Add New Students' },
      { key: 'students_edit_basic', label: 'Edit Student Personal Info' },
      { key: 'students_edit_academic', label: 'Edit Student Academic Details' },
      { key: 'students_edit_parent', label: 'Edit Student Parent Details' },
      { key: 'students_delete', label: 'Delete Student Records' }
    ]
  },
  {
    category: 'Staff Module',
    perms: [
      { key: 'staff_view', label: 'View Staff Directory' },
      { key: 'staff_view_all', label: 'Access Full Staff Dossiers' },
      { key: 'staff_create', label: 'Register New Staff' },
      { key: 'staff_edit', label: 'Edit Staff Information' },
      { key: 'staff_delete', label: 'De-register/Remove Staff' }
    ]
  },
  {
    category: 'Academics Module',
    perms: [
      { key: 'classes_view', label: 'View Classes' },
      { key: 'classes_manage', label: 'Create/Edit Classes' },
      { key: 'batches_view', label: 'View Batches & Sections' },
      { key: 'batches_manage', label: 'Create/Edit Batches' },
      { key: 'subjects_view', label: 'View Subjects' },
      { key: 'subjects_manage', label: 'Assign/Edit Subjects' },
      { key: 'timetable_manage', label: 'Design & Modify Timetables' }
    ]
  },
  {
    category: 'Exams & Progress Reporting',
    perms: [
      { key: 'exams_manage', label: 'Configure Exams' },
      { key: 'edit_marks', label: 'Enter & Modify Student Marks' },
      { key: 'view_class_marksheets', label: 'Review Class Marksheets' },
      { key: 'view_central_register', label: 'Access Centralized Records' }
    ]
  },
  {
    category: 'Finance & Payments',
    perms: [
      { key: 'fees_view', label: 'Access Fees Dashboard' },
      { key: 'fees_collect', label: 'Collect Fee Payments' },
      { key: 'fees_manage_structure', label: 'Configure Fee Structures' },
      { key: 'fees_balance_sheet', label: 'Review Balances & Ledger' },
      { key: 'payroll_manage', label: 'Configure & Release Payroll' }
    ]
  },
  {
    category: 'Attendance & Leave Processing',
    perms: [
      { key: 'attendance_view', label: 'Review Attendance Registers' },
      { key: 'attendance_manage', label: 'Mark/Submit Attendance' },
      { key: 'leaves_manage', label: 'Review & Manage Leave Requests' },
      { key: 'apply_leave', label: 'Submit Personal Leave' },
      { key: 'approve_leave', label: 'Approve Leave Applications' }
    ]
  },
  {
    category: 'Communication Channel Control',
    perms: [
      { key: 'communication_view', label: 'Access Communications Panel' }
    ]
  }
];

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Modals
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    whatsappNumber: '',
    phone: '',
    role: 'teacher',
    status: 'active',
    password: ''
  });
  const [customPerms, setCustomPerms] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [newPasswordVal, setNewPasswordVal] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [usersData, staffData, studentsData] = await Promise.all([
        dbService.list('users').catch(() => []),
        dbService.list('staff').catch(() => []),
        dbService.list('students').catch(() => [])
      ]);

      const enriched = (usersData || []).map((u: any) => {
        const uEmail = (u.email || '').trim().toLowerCase();
        const uId = u.id || u.uid;

        // Find matching staff member
        const staffMatch = staffData.find((s: any) => 
          (s.email && s.email.trim().toLowerCase() === uEmail) || 
          (s.id && s.id === uId) || (s.uid && s.uid === uId)
        );

        // Find matching student
        const studentMatch = !staffMatch ? studentsData.find((st: any) => 
          (st.email && st.email.trim().toLowerCase() === uEmail) || 
          (st.id && st.id === uId) || (st.uid && st.uid === uId)
        ) : null;

        const match = staffMatch || studentMatch;
        const matchedName = match ? match.name : '';
        const matchedPhone = match ? (match.phone || match.whatsappNumber || '') : '';

        // Extract normalized 10 digits
        const cleanPhone = matchedPhone.replace(/\D/g, '').slice(-10);

        // Auto-sync user role with staff designation or role
        let resolvedRole = u.role || 'teacher';
        if (staffMatch) {
          const mappedRole = mapStaffDesignationToRoleId(staffMatch.designation, staffMatch.role);
          if (mappedRole) {
            resolvedRole = mappedRole;
          }
        } else if (studentMatch) {
          resolvedRole = 'student';
        }

        return {
          ...u,
          name: u.name || matchedName || `User (${uEmail || uId})`,
          phone: u.phone || u.whatsappNumber || cleanPhone,
          whatsappNumber: u.whatsappNumber || u.phone || cleanPhone,
          role: resolvedRole
        };
      });

      setUsers(enriched);
    } catch (e) {
      console.error('Error loading users:', e);
      toast.error('Failed to retrieve system users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const nameMatch = (u.name || '').toLowerCase().includes(search.toLowerCase());
      const usernameMatch = (u.username || '').toLowerCase().includes(search.toLowerCase());
      const emailMatch = (u.email || '').toLowerCase().includes(search.toLowerCase());
      const phoneMatch = (u.whatsappNumber || u.phone || '').includes(search);
      const roleMatch = !roleFilter || u.role === roleFilter;
      return (nameMatch || usernameMatch || emailMatch || phoneMatch) && roleMatch;
    });
  }, [users, search, roleFilter]);

  const handleOpenAdd = () => {
    setSelectedUser(null);
    setFormData({
      name: '',
      username: '',
      email: '',
      whatsappNumber: '',
      phone: '',
      role: 'teacher',
      status: 'active',
      password: ''
    });
    setCustomPerms([]);
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (user: any) => {
    setSelectedUser(user);
    setFormData({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      whatsappNumber: user.whatsappNumber || user.phone || '',
      phone: user.phone || user.whatsappNumber || '',
      role: user.role || 'teacher',
      status: user.status || 'active',
      password: '' // Don't pre-populate password for safety
    });
    // Set custom permissions if exists, otherwise load default permissions of the role as baseline
    const initialPerms = Array.isArray(user.customPermissions) 
      ? user.customPermissions 
      : (ROLE_PERMISSIONS[user.role as Role] || []);
    setCustomPerms(initialPerms);
    setShowAddEditModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return toast.error('Full name is required');
    if (!formData.whatsappNumber && !formData.email && !formData.username) {
      return toast.error('Either WhatsApp number, email or username must be provided');
    }

    const normalizedPhone = formData.whatsappNumber.replace(/\D/g, '');
    if (formData.whatsappNumber && normalizedPhone.length !== 10) {
      return toast.error('WhatsApp number must be a valid 10-digit number');
    }

    try {
      const payload: any = {
        name: formData.name,
        username: formData.username.trim(),
        email: formData.email.trim().toLowerCase(),
        whatsappNumber: normalizedPhone,
        phone: normalizedPhone,
        role: formData.role,
        status: formData.status,
        customPermissions: customPerms,
        updatedAt: new Date().toISOString()
      };

      if (!selectedUser) {
        // Create user
        payload.id = 'usr_' + Date.now();
        payload.uid = payload.id;
        payload.createdAt = new Date().toISOString();
        payload.password = formData.password.trim() || 'password'; // default password

        await dbService.create('users', payload.id, payload);
        toast.success(`User '${formData.name}' successfully registered!`);
      } else {
        // Update user
        await dbService.update('users', selectedUser.id, payload);
        toast.success(`User details for '${formData.name}' updated!`);
      }

      // Sync updated role back to Staff or Students collections to ensure absolute sync
      try {
        const uEmail = payload.email.trim().toLowerCase();
        const uId = selectedUser ? (selectedUser.id || selectedUser.uid) : payload.id;
        
        const [staffList, studentList] = await Promise.all([
          dbService.list('staff').catch(() => []),
          dbService.list('students').catch(() => [])
        ]);

        const staffMatch = staffList.find((s: any) => 
          (s.email && s.email.trim().toLowerCase() === uEmail) || (s.id && s.id === uId) || (s.uid && s.uid === uId)
        );

        if (staffMatch) {
          const selectedRoleObj = AVAILABLE_ROLES.find(r => r.id === payload.role);
          const roleName = selectedRoleObj ? selectedRoleObj.name : 'Staff';
          await dbService.update('staff', staffMatch.id, {
            designation: roleName,
            role: payload.role
          });
        } else {
          const studentMatch = studentList.find((st: any) => 
            (st.email && st.email.trim().toLowerCase() === uEmail) || (st.id && st.id === uId) || (st.uid && st.uid === uId)
          );
          if (studentMatch) {
            await dbService.update('students', studentMatch.id, {
              role: payload.role
            });
          }
        }
      } catch (syncErr) {
        console.warn('Background sync to staff/students failed:', syncErr);
      }

      setShowAddEditModal(false);
      loadUsers();
    } catch (e) {
      console.error('Error saving user:', e);
      toast.error('An error occurred while saving user records');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await dbService.delete('users', userId);
      toast.success('User deleted successfully');
      loadUsers();
    } catch (e) {
      console.error('Error deleting user:', e);
      toast.error('Failed to delete user');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordVal.trim()) return toast.error('Password cannot be empty');
    try {
      await dbService.update('users', selectedUser.id, {
        password: newPasswordVal.trim(),
        updatedAt: new Date().toISOString()
      });
      toast.success(`Password for ${selectedUser.name} successfully updated.`);
      setShowResetModal(false);
      setNewPasswordVal('');
    } catch (e) {
      console.error('Error resetting password:', e);
      toast.error('Could not reset password');
    }
  };

  const togglePermission = (permKey: string) => {
    setCustomPerms(prev => {
      if (prev.includes(permKey)) {
        return prev.filter(p => p !== permKey);
      } else {
        return [...prev, permKey];
      }
    });
  };

  const handleApplyRoleDefaultPermissions = () => {
    const defaultPerms = ROLE_PERMISSIONS[formData.role as Role] || [];
    setCustomPerms(defaultPerms);
    toast.success('Reset permissions to standard role defaults!');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" id="user-management-module">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-800 tracking-tight flex items-center gap-2">
            <UsersIcon className="w-7 h-7 text-indigo-600" />
            User Management
          </h1>
          <p className="text-sm text-neutral-500 font-medium">
            Configure system accounts, manage logins, reset passwords, and assign individual option permissions.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm shadow-indigo-600/10 hover:shadow-indigo-600/20"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New User</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name, email, username or WhatsApp number..."
            className="w-full pl-11 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-semibold text-sm text-neutral-800 transition-all placeholder:text-neutral-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <select
            className="px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-sm text-neutral-700"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {AVAILABLE_ROLES.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            onClick={loadUsers}
            className="p-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl transition-all"
            title="Reload database users"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* User Table Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-12 text-center text-neutral-500 font-medium">
          No registered users found matching the selected filters.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-150 text-neutral-500 font-bold text-xs uppercase tracking-wider">
                  <th className="px-6 py-4">Full Name</th>
                  <th className="px-6 py-4">Contact Detail (WhatsApp)</th>
                  <th className="px-6 py-4">Username / Email</th>
                  <th className="px-6 py-4">Assigned Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-150 text-sm font-semibold text-neutral-700">
                {filteredUsers.map((u) => {
                  const hasCustomPermOverrides = Array.isArray(u.customPermissions);
                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/50 transition-all">
                      <td className="px-6 py-4">
                        <div className="font-extrabold text-neutral-850">{u.name}</div>
                        <div className="text-xs text-neutral-400 font-medium">ID: {u.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        {u.whatsappNumber ? (
                          <span className="text-neutral-800 font-mono">+91 {u.whatsappNumber}</span>
                        ) : (
                          <span className="text-neutral-400 italic">No phone setup</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div>{u.username || <span className="text-neutral-400 italic">None</span>}</div>
                        <div className="text-xs text-neutral-400 font-medium">{u.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 text-xs rounded-full bg-indigo-50 text-indigo-700 font-extrabold capitalize">
                            {String(u.role).replace(/_/g, ' ')}
                          </span>
                          {hasCustomPermOverrides && (
                            <span className="px-2 py-0.5 text-[10px] rounded bg-amber-50 border border-amber-200 text-amber-700 font-extrabold" title="Has individual permission overrides">
                              Custom Controls
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-extrabold ${
                          u.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {u.status === 'active' ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedUser(u);
                              setNewPasswordVal('');
                              setShowResetModal(true);
                            }}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-all"
                            title="Reset User Password"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-all"
                            title="Edit Details & Overwrite Permissions"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-all"
                            title="Delete Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE & EDIT MODAL WITH GRANULAR OPTION PERMISSIONS */}
      <AnimatePresence>
        {showAddEditModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-neutral-200 shadow-2xl"
            >
              <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-neutral-800">
                    {selectedUser ? `Modify Account: ${selectedUser.name}` : 'Register New User'}
                  </h2>
                  <p className="text-xs text-neutral-500 font-medium">
                    Configure profile information and toggle granular permissions.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddEditModal(false)}
                  className="p-1.5 bg-neutral-200/50 hover:bg-neutral-200 text-neutral-600 rounded-full transition-all"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Full Name</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-semibold text-sm"
                      placeholder="e.g. Nagaraju Manamu"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Role Type</label>
                    <select
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-sm"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    >
                      {AVAILABLE_ROLES.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">WhatsApp Number (For OTP/Login)</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-semibold text-sm"
                      placeholder="10-digit number"
                      value={formData.whatsappNumber}
                      onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Alternative Email</label>
                    <input
                      type="email"
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-semibold text-sm"
                      placeholder="name@stantonys.edu"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Username Identifier</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-semibold text-sm"
                      placeholder="e.g. nagaraju123"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Status</label>
                    <select
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-sm"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>

                  {!selectedUser && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Initial Account Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="w-full pl-4 pr-11 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-semibold text-sm"
                          placeholder="Leave empty for default 'password'"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-all"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Overrides Header */}
                <div className="border-t border-neutral-200 pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-md font-extrabold text-neutral-850 flex items-center gap-1.5">
                        <Shield className="w-4.5 h-4.5 text-indigo-600" />
                        Custom Option Permissions
                      </h3>
                      <p className="text-xs text-neutral-500 font-medium">
                        Overwrite default role privileges. Checked options will be permitted for this user.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyRoleDefaultPermissions}
                      className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-lg transition-all"
                    >
                      Reset to Standard Role Defaults
                    </button>
                  </div>

                  {/* Permissions Selection Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/60 max-h-[300px] overflow-y-auto">
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group.category} className="space-y-2 bg-white p-3 rounded-xl border border-neutral-150 shadow-sm">
                        <h4 className="text-xs font-extrabold text-neutral-800 border-b border-neutral-100 pb-1 mb-2">
                          {group.category}
                        </h4>
                        <div className="space-y-2">
                          {group.perms.map((p) => {
                            const isChecked = customPerms.includes(p.key);
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => togglePermission(p.key)}
                                className="w-full flex items-start gap-2.5 text-left text-xs font-semibold text-neutral-600 hover:text-neutral-900 select-none transition-all"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <Square className="w-4 h-4 text-neutral-300 flex-shrink-0 mt-0.5" />
                                )}
                                <span>{p.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-neutral-200 pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddEditModal(false)}
                    className="px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-sm rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm shadow-indigo-600/15"
                  >
                    {selectedUser ? 'Save Updates' : 'Register Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RESET PASSWORD MODAL */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl w-full max-w-md overflow-hidden border border-neutral-200 shadow-2xl"
            >
              <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-amber-500" />
                  <h2 className="text-md font-extrabold text-neutral-800">
                    Reset User Password
                  </h2>
                </div>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="p-1.5 bg-neutral-200/50 hover:bg-neutral-200 text-neutral-600 rounded-full transition-all"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                <p className="text-xs text-neutral-500 font-semibold leading-relaxed">
                  Enter a new password for <span className="text-neutral-800 font-bold">{selectedUser?.name}</span>. This change takes effect immediately across web dashboards & portal login methods.
                </p>

                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">New Account Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full pl-4 pr-11 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 font-semibold text-sm text-neutral-800"
                      placeholder="e.g. AdminNagaraju123"
                      value={newPasswordVal}
                      onChange={(e) => setNewPasswordVal(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-all"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-amber-600/10"
                  >
                    Apply New Password
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
