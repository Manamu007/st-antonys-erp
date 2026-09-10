import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  UserSquare2, 
  CalendarCheck, 
  CreditCard, 
  GraduationCap, 
  Table, 
  BookOpen, 
  MessageSquare, 
  Mail,
  Library, 
  Bus,
  LogOut,
  School,
  FileClock,
  Database,
  BarChart3,
  Shield,
  Bell,
  Bot,
  Zap,
  FileBadge,
  IdCard,
  Building,
  Heart,
  MapPin,
  ArrowRightLeft,
  Workflow,
  Settings as SettingsIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useSettings } from '../context/SettingsContext';
import { PERMISSIONS } from '../constants/permissions';
import { normalizeUrl, getGravatarUrl } from '../lib/utils';
import { motion } from 'motion/react';

import { checkIsTeacherAccount } from '../utils/teacherFilter';

interface SidebarProps {
  collapsed?: boolean;
  onItemClick?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onItemClick }) => {
  const { user, availableProfiles, switchProfile } = useAuth();
  const { 
    hasPermission, 
    hasAnyPermission, 
    isAdmin, 
    profile, 
    isPrincipal, 
    isVicePrincipal,
    isStudent,
    isTeacher,
    isAccountant,
    isParent,
    isClerk
  } = usePermissions();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [logoError, setLogoError] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const actualCollapsed = isMobile ? false : collapsed;

  const studentProfiles = (availableProfiles || []).filter(p => {
    const r = (p.role || '').toLowerCase().trim().replace(/[-_]/g, '_');
    return r === 'student';
  });

  useEffect(() => {
    setLogoError(false);
  }, [settings.logoUrl]);

  const handleLogout = async () => {
    const token = localStorage.getItem('auth_jwt_token');
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {}
    }
    localStorage.removeItem('auth_jwt_token');
    localStorage.removeItem('preferred_profile_id');
    localStorage.removeItem('bypass_user_email');
    localStorage.removeItem('bypass_user_uid');
    localStorage.removeItem('bypass_user_name');
    localStorage.removeItem('bypass_user_photo');
    localStorage.removeItem('bypass_user_role');
    localStorage.removeItem('bypass_user_profile');
    try {
      await auth.signOut();
    } catch (e) {}
    navigate('/login');
  };

  const handleProfileSwitch = (profileId: string) => {
    switchProfile(profileId);
    setShowSwitcher(false);
  };

  const isManagement = isAdmin || isPrincipal || isVicePrincipal;
  const isTeacherRole = profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject';

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: PERMISSIONS.VIEW_NOTICES, color: 'text-blue-400' },
    { to: '/dashboard/notices', icon: Bell, label: 'Notices', permission: PERMISSIONS.VIEW_NOTICES, color: 'text-rose-400' },
    { to: '/dashboard/academics', icon: School, label: 'Academics', permission: PERMISSIONS.VIEW_TIMETABLE, color: 'text-emerald-400' },
    { to: '/dashboard/students', icon: Users, label: 'Students', permission: PERMISSIONS.VIEW_STUDENTS, color: 'text-indigo-400' },
    { to: '/dashboard/staff', icon: UserSquare2, label: 'Staff', permission: PERMISSIONS.VIEW_STAFF, color: 'text-amber-400', hideForTeacher: true },
    { to: '/dashboard/front-office', icon: UserSquare2, label: 'Front Office', permission: PERMISSIONS.VIEW_FRONT_OFFICE, color: 'text-sky-300', hideForTeacher: true },
    { to: '/dashboard/attendance', icon: CalendarCheck, label: 'Attendance', permission: PERMISSIONS.VIEW_ATTENDANCE, color: 'text-cyan-400' },
    { to: '/dashboard/fees', icon: CreditCard, label: 'Fees', permission: PERMISSIONS.VIEW_FEES, color: 'text-emerald-500', hideForTeacher: true },
    { to: '/dashboard/exams', icon: GraduationCap, label: 'Exams', permission: PERMISSIONS.VIEW_MARKS, color: 'text-purple-400' },
    { to: '/dashboard/leaves', icon: FileClock, label: 'Leaves', permission: PERMISSIONS.APPLY_LEAVE, color: 'text-rose-500' },
    { to: '/dashboard/timetable', icon: Table, label: 'Timetable', permission: PERMISSIONS.VIEW_TIMETABLE, color: 'text-violet-400' },
    { to: '/dashboard/homework', icon: BookOpen, label: 'Homework', permission: PERMISSIONS.VIEW_TIMETABLE, color: 'text-orange-400' },
    { to: '/dashboard/certificates', icon: FileBadge, label: 'Certificates', permission: PERMISSIONS.VIEW_CERTIFICATES, color: 'text-yellow-400', hideForTeacher: true },
    { to: '/dashboard/id-cards', icon: IdCard, label: 'ID Cards', permission: PERMISSIONS.MANAGE_STUDENTS, color: 'text-indigo-300', hideForTeacher: true },
    { to: '/dashboard/communication', icon: MessageSquare, label: 'Communication', permission: PERMISSIONS.COMMUNICATION_VIEW, color: 'text-emerald-300', hideForTeacher: true },
    { to: '/dashboard/bot-builder', icon: Workflow, label: 'Bot Workflow Builder', permission: PERMISSIONS.VIEW_NOTICES, color: 'text-rose-400' },
    { to: '/dashboard/reports', icon: BarChart3, label: 'Reports', permission: [PERMISSIONS.VIEW_CENTRAL_REGISTER, PERMISSIONS.VIEW_STUDENTS], color: 'text-emerald-400', hideForTeacher: true },
    { to: '/dashboard/library', icon: Library, label: 'Library', permission: PERMISSIONS.VIEW_LIBRARY, color: 'text-amber-600' },
    { to: '/dashboard/payroll', icon: CreditCard, label: 'Payroll', permission: PERMISSIONS.VIEW_STAFF, color: 'text-emerald-400', hideForTeacher: true },
    { to: '/dashboard/transport', icon: Bus, label: 'Transport', permission: PERMISSIONS.VIEW_TRANSPORT, color: 'text-sky-400', hideForTeacher: true },
    { to: '/dashboard/driver', icon: Bus, label: 'Driver Portal', permission: 'driver_portal_view', color: 'text-yellow-450' },
    { to: '/dashboard/hostel', icon: Building, label: 'Hostel', permission: PERMISSIONS.VIEW_HOSTEL, color: 'text-orange-400', hideForTeacher: true },
    { to: '/dashboard/student-health', icon: Heart, label: 'Student Health', permission: PERMISSIONS.VIEW_STUDENTS, color: 'text-rose-400' },
    { to: '/dashboard/ai-assistant', icon: Bot, label: 'AI Assistant Hub', permission: PERMISSIONS.VIEW_NOTICES, color: 'text-indigo-400' },
    { to: '/dashboard/risk', icon: Zap, label: 'AI Risk Engine', permission: PERMISSIONS.USE_AI_ANALYSIS, color: 'text-yellow-400' },
    { to: '/dashboard/insights', icon: BarChart3, label: 'Performance Insights', permission: PERMISSIONS.USE_AI_ANALYSIS, color: 'text-emerald-400' },
    { to: '/dashboard/admission-register', icon: BookOpen, label: 'Admission Register', permission: PERMISSIONS.VIEW_STUDENTS, color: 'text-rose-400', hideForTeacher: true },
    { to: '/dashboard/storage', icon: Database, label: 'Storage', permission: PERMISSIONS.EDIT_FEE_STRUCTURE, color: 'text-amber-500', hideForTeacher: true },
    { to: '/dashboard/roles', icon: Shield, label: 'Roles', permission: PERMISSIONS.MANAGE_ROLES, color: 'text-neutral-400', hideForTeacher: true },
    { to: '/dashboard/settings', icon: SettingsIcon, label: 'School Settings', permission: PERMISSIONS.EDIT_FEE_STRUCTURE, color: 'text-neutral-300', hideForTeacher: true },
  ];

  const userEmailClean = (user?.email || profile?.email || '').toLowerCase().trim();
  const userDisplayClean = (user?.displayName || profile?.name || '').toLowerCase().trim();
  const roleLower = (profile?.role || '').toLowerCase().trim();
  const isTeacherUser = checkIsTeacherAccount(roleLower, userEmailClean, userDisplayClean);
  const isReceptionist = roleLower === 'receptionist' || profile?.role === 'receptionist' || (profile?.designation || '').toLowerCase().includes('receptionist') || userEmailClean.includes('reception');

  const filteredItems = navItems.filter(item => {
    // Strict restriction for Receptionist: only Dashboard and Attendance
    if (isReceptionist) {
      return item.to === '/dashboard' || item.to === '/dashboard/attendance';
    }

    if (isTeacherUser) {
      const hiddenTeacherRoutes = [
        '/dashboard/ai-assistant',
        '/dashboard/ai-hub',
        '/dashboard/risk',
        '/dashboard/risk-engine',
        '/dashboard/insights',
        '/dashboard/analytics',
        '/dashboard/admission-register',
        '/dashboard/admissions',
        '/dashboard/storage',
        '/dashboard/roles',
        '/dashboard/settings',
        '/dashboard/bot-builder'
      ];
      if (hiddenTeacherRoutes.includes(item.to)) return false;
    }

    const isTeacherPortal = (profile?.role !== 'principal' && profile?.role !== 'vice_principal') && (profile?.isTeacherPortal === true || (!isAdmin && (
      isTeacher ||
      isTeacherUser ||
      profile?.role === 'teacher' ||
      profile?.role?.toLowerCase().includes('teacher') || 
      profile?.role?.toLowerCase().includes('coordinator') || 
      profile?.role?.toLowerCase().includes('staff') ||
      (profile as any)?.staffType === 'teaching'
    )));

    if (isTeacherPortal && (item.to === '/dashboard/bot-builder' || item.to === '/dashboard/ai-assistant' || item.to === '/dashboard/risk')) {
      return false;
    }

    if (profile?.role === 'play_school_incharge') {
      const hiddenPaths = [
        '/dashboard/reports',
        '/dashboard/admission-register'
      ];
      if (hiddenPaths.includes(item.to)) return false;
    }

    if (roleLower === 'doctor') {
      return item.to === '/dashboard/student-health';
    }
    if (roleLower === 'receptionist' || profile?.role === 'receptionist') {
      return item.to === '/dashboard' || item.to === '/dashboard/attendance';
    }
    if (item.to === '/dashboard/student-health') {
      const roleLower = (profile?.role || '').toLowerCase();
      const isHospital = roleLower === 'hospital_user' || roleLower === 'hospital' || roleLower === 'doctor';
      const isWarden = profile?.role === 'warden' || profile?.role === 'hostel_warden';
      const isFinStaff = isAccountant || isClerk;
      const isHStaff = isHospital || isWarden || isFinStaff || isAdmin || isPrincipal || isVicePrincipal;
      if (isHStaff) return true;
      return false;
    }
    if (isStudent || isParent || roleLower === 'student' || roleLower === 'parent') {
      if (item.to === '/dashboard/bot-builder' || item.to === '/dashboard/ai-assistant') return false;
      if (item.to === '/dashboard/certificates') return false;
      if (item.to === '/dashboard/transport') {
        const hasBus = profile?.transportBusId || profile?.busRoute || (profile as any)?.bus_route || (profile as any)?.transportRouteId;
        if (!hasBus) return false;
      }
      if (item.to === '/dashboard/hostel') {
        const isHosteler = profile?.feeType === 'hostel' || (profile as any)?.hostelName || (profile as any)?.isHostelResident;
        if (!isHosteler) return false;
      }
    }
    if (isTeacherRole && (item as any).hideForTeacher) return false;
    if (isVicePrincipal && item.to === '/dashboard/front-office') return false;
    if (profile?.role === 'driver' && (item.to === '/dashboard/ai-assistant' || item.to === '/dashboard/bot-builder')) return false;
    if (isAccountant) {
      const hiddenPaths = [
        '/dashboard/reports',
        '/dashboard/ai-assistant',
        '/dashboard/bot-builder',
        '/dashboard/staff',
        '/dashboard/attendance',
        '/dashboard/students'
      ];
      if (hiddenPaths.includes(item.to)) return false;
    }
    if (isClerk) {
      const hiddenPaths = [
        '/dashboard/attendance',
        '/dashboard/id-cards',
        '/dashboard/payroll',
        '/dashboard/ai-assistant',
        '/dashboard/bot-builder',
        '/dashboard/reports'
      ];
      if (hiddenPaths.includes(item.to)) return false;
    }
    if (Array.isArray(item.permission)) {
      return hasAnyPermission(item.permission as any);
    }
    return hasPermission(item.permission as any);
  });


  return (
    <aside className={`${actualCollapsed ? 'w-24' : 'w-72'} transition-all duration-500 bg-sidebar/95 backdrop-blur-2xl text-sidebar-foreground flex flex-col h-full shadow-[20px_0_50px_rgba(0,0,0,0.1)] border-r border-white/10 relative overflow-hidden`}>
      {/* Decorative glass glow corner */}
      <div className={`absolute -top-24 -left-24 ${actualCollapsed ? 'w-32 h-32' : 'w-48 h-48'} bg-primary/10 rounded-full blur-[80px] pointer-events-none transition-all duration-500`} />
      
      <NavLink 
        to={hasPermission('settings_school') ? "/dashboard/settings" : "/dashboard"}
        onClick={onItemClick}
        className={({ isActive }) => 
          `p-8 flex items-center ${actualCollapsed ? 'justify-center' : 'gap-4'} border-b border-white/5 transition-all hover:bg-white/5 relative z-10 ${isActive ? 'bg-white/5' : ''}`
        }
      >
        <div className="relative group/logo shrink-0">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-0 group-hover/logo:scale-150 transition-transform duration-500" />
          {settings.logoUrl && !logoError ? (
            <div className={`${actualCollapsed ? 'w-10 h-10' : 'w-16 h-16'} rounded-full bg-white shadow-xl relative z-10 border-2 border-white/20 overflow-hidden flex items-center justify-center transition-all duration-500`}>
              <img 
                src={normalizeUrl(settings.logoUrl)} 
                alt="School Logo" 
                className="w-full h-full object-contain p-1 group-hover/logo:scale-110 transition-transform"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : (
            <div className={`${actualCollapsed ? 'w-10 h-10' : 'w-16 h-16'} bg-white/10 rounded-full flex items-center justify-center text-primary relative z-10 border border-white/10 backdrop-blur-md transition-all duration-500`}>
              <School className={`${actualCollapsed ? 'w-5 h-5' : 'w-8 h-8'}`} />
            </div>
          )}
        </div>
        {!actualCollapsed && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative z-10 flex flex-col justify-center min-w-0"
          >
            <h1 className="font-black text-[18px] leading-[1.1] tracking-[0.05em] uppercase text-white drop-shadow-md line-clamp-2 overflow-hidden break-words">
              {settings.schoolName}
            </h1>
          </motion.div>
        )}
      </NavLink>



      <nav className={`flex-1 overflow-y-auto py-6 ${actualCollapsed ? 'px-2' : 'px-4'} space-y-2 custom-scrollbar relative z-10`}>
        {!actualCollapsed && (
          <div className="px-4 mb-4">
            <p className="text-[13px] font-black uppercase tracking-[0.3em] text-white/20">Operations</p>
          </div>
        )}
        {filteredItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            title={actualCollapsed ? item.label : undefined}
            onClick={onItemClick}
            className={({ isActive }) =>
              `flex items-center ${actualCollapsed ? 'justify-center p-4' : 'gap-4 px-4 py-4'} rounded-[1.5rem] text-[15px] font-black transition-all relative group overflow-hidden ${
                isActive 
                  ? 'bg-white/10 text-white shadow-xl shadow-black/20 border border-white/10' 
                  : 'hover:bg-white/5 text-neutral-500 hover:text-white'
              }`
            }
          >
            <div className={`relative z-10 w-8 h-8 rounded-xl flex items-center justify-center transition-all group-hover:scale-110 group-hover:rotate-6 ${item.color.replace('text-', 'bg-')}/10`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            {!actualCollapsed && (
              <span className="flex-1 relative z-10 uppercase tracking-tight">{item.label}</span>
            )}
            
            {window.location.pathname === item.to && (
              <motion.div 
                layoutId="active-nav"
                className="absolute left-0 w-1.5 h-8 bg-primary rounded-r-full shadow-[0_0_20px_rgba(244,63,94,0.8)]" 
              />
            )}
            
            {/* Hover glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
