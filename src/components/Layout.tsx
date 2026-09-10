import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu, X, ChevronLeft, ChevronRight, Settings, Calendar, Bell, LogOut, Shield, Users, ArrowRightLeft } from 'lucide-react';
import { AIAssistant } from './AIAssistant';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { NotificationCenter } from './NotificationCenter';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { dbService } from '../services/dbService';
import { normalizeUrl } from '../lib/utils';
import { toast } from 'sonner';
import { isTeacherRole } from '../utils/teacherFilter';

const Layout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { profile, isStudent, isParent } = usePermissions();
  const { availableProfiles, switchProfile } = useAuth();
  const navigate = useNavigate();
  const [classTeacherInfo, setClassTeacherInfo] = useState<{ className: string; batchName: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isTeacher = isTeacherRole(profile?.role || '', profile?.email, profile?.name);

  const studentProfiles = useMemo(() => {
    const raw = (availableProfiles || []).filter(p => {
      const r = (p.role || '').toLowerCase().trim().replace(/[-_]/g, '_');
      return r === 'student';
    });

    const uniqueMap = new Map<string, any>();
    raw.forEach(p => {
      const pId = p.id || p.uid;
      const pEmail = (p.email || '').toLowerCase().trim();
      const pName = (p.name || '').toLowerCase().trim();
      const pFather = (p.fatherName || '').toLowerCase().trim();
      const pAdmission = (p.admissionNumber || '').toLowerCase().trim();

      // Priority deduplication keys
      let dedupeKey = pId;
      if (pAdmission) {
        dedupeKey = `adm_${pAdmission}`;
      } else if (pEmail && pEmail.includes('@') && !pEmail.includes('bypass')) {
        dedupeKey = `email_${pEmail}`;
      } else if (pName && pFather) {
        dedupeKey = `name_${pName}_${pFather}`;
      } else if (pName) {
        dedupeKey = `name_${pName}`;
      }

      if (dedupeKey && !uniqueMap.has(dedupeKey)) {
        uniqueMap.set(dedupeKey, p);
      }
    });

    return Array.from(uniqueMap.values());
  }, [availableProfiles]);

  const getDisplayRole = () => {
    if (!profile?.role) return 'User';
    return profile.role
      .split('_')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  useEffect(() => {
    const userUid = profile?.uid || profile?.id;
    if (!userUid) {
      setClassTeacherInfo(null);
      return;
    }
    if (!isTeacher) {
      setClassTeacherInfo(null);
      return;
    }

    let latestClasses: any[] = [];
    let latestBatches: any[] = [];

    const updateInfo = () => {
      const assignedBatch = latestBatches.find((b: any) => b.classTeacherId === profile.uid || b.classTeacherId === profile.id);
      if (assignedBatch) {
        const assignedClass = latestClasses.find((c: any) => c.id === assignedBatch.classId);
        
        let className = assignedClass?.name || assignedBatch.className || '';
        if (!className && assignedBatch.classId) {
          className = assignedBatch.classId.replace(/_Class$/i, '').replace(/_/g, ' ');
        }
        if (!className && assignedBatch.id) {
          className = assignedBatch.id.split('_')[0].replace(/_/g, ' ');
        }
        if (!className) {
          className = 'Class';
        }

        // Clean up "Class" suffix if present in the class name to avoid redundancy (e.g. "7 Class" -> "7")
        const processedClassName = className.replace(/\sClass$/i, '');

        setClassTeacherInfo({
          className: processedClassName,
          batchName: assignedBatch.name || 'Batch'
        });
      } else {
        setClassTeacherInfo(null);
      }
    };

    dbService.list('classes').then((classesList) => {
      latestClasses = classesList || [];
      updateInfo();
    }).catch(e => console.error(e));

    dbService.list('batches').then((batchesList) => {
      latestBatches = batchesList || [];
      updateInfo();
    }).catch(e => console.error(e));

    return () => {};
  }, [profile?.uid, profile?.id, profile?.role, isTeacher]);

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

  const getAvatarSrc = () => {
    const googlePhoto = auth.currentUser?.photoURL;
    const currentGoogleEmail = (auth.currentUser?.email || '').toLowerCase().trim();
    const profileEmail = (profile?.email || '').toLowerCase().trim();
    const dbPhoto = profile?.photoURL || profile?.photoUrl || (profile as any)?.facePhotoURL || (profile as any)?.facePhotoUrl;
    
    // 1. If we have a database photo that is NOT a Gravatar placeholder, prioritize it because the user explicitly set/uploaded it in this app
    if (dbPhoto && !dbPhoto.includes('gravatar.com') && dbPhoto !== '') {
      return dbPhoto;
    }
    
    // 2. If there is a Google account avatar, use it ONLY if the Google email matches the profile email
    if (googlePhoto && currentGoogleEmail && profileEmail && currentGoogleEmail === profileEmail) {
      return googlePhoto;
    }

    // 3. Fallback to Gravatar if available in DB
    if (dbPhoto && dbPhoto !== '') {
      return dbPhoto;
    }

    // 4. Default template avatar with profile name
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'User')}&background=0284c7&color=fff&bold=true`;
  };

  return (
    <div 
      className="flex h-screen bg-background overflow-hidden relative font-sans selection:bg-primary/20 selection:text-primary transition-colors duration-500"
      data-sidebar-collapsed={isSidebarCollapsed}
    >
      {/* Immersive Background Elements - Only show for default theme */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 [[data-theme='glass-dark']_&]:hidden text-red-500">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/3 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/3 rounded-full blur-[150px] animate-pulse [animation-delay:2s]" />
        <div className="absolute top-[20%] left-[10%] w-[30%] h-[30%] bg-emerald-500/2 rounded-full blur-[120px]" />
      </div>

      {/* Modern Integrated Header (Mobile & Desktop) - Pixar 3D Style */}
      <header className="fixed top-4 right-4 z-40 flex items-center justify-between transition-all duration-500 gap-4" style={{ left: isMobile ? '1rem' : (isSidebarCollapsed ? '112px' : '304px'), width: 'auto' }}>
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex-1 h-24 bg-slate-900/80 backdrop-blur-3xl rounded-[2.5rem] px-4 sm:px-6 md:px-8 lg:px-10 flex items-center justify-between shadow-[0_35px_80px_-15px_rgba(0,0,0,0.6),inset_0_-8px_16px_rgba(255,255,255,0.05),inset_0_5px_15px_rgba(255,255,255,0.1)] border-2 border-white/10 relative overflow-hidden group/banner"
        >
          {/* Animated Pixar Style Gradient Ambient */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-primary/5 to-purple-500/10 animate-pulse" />
          
          {/* Glossy Reflection Asset - Pixar Style */}
          <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          
          {/* 3D Blobs */}
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-cyan-400/10 rounded-full blur-[80px] pointer-events-none group-hover/banner:scale-110 transition-transform duration-1000" />
          <div className="absolute top-0 left-1/2 w-48 h-48 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none" />
          
          <div className="flex items-center gap-3 sm:gap-4 md:gap-6 lg:gap-8 relative z-10 shrink min-w-0">
            <div className="lg:hidden flex items-center">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center text-white border border-white/30 shadow-xl hover:scale-110 active:scale-95 transition-all"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex items-center gap-6 group/profile cursor-pointer min-w-0 shrink" onClick={() => navigate('/dashboard/profile')}>
              <div className="relative shrink-0">
                <div className="absolute -inset-1.5 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-2xl blur-md opacity-50 group-hover/profile:opacity-100 transition-opacity duration-500" />
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl bg-white p-1 shadow-2xl border-2 border-white/60 transform -rotate-3 transition-all relative z-10 shrink-0"
                >
                  <img 
                    src={normalizeUrl(getAvatarSrc())}
                    className="w-full h-full object-cover rounded-xl"
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                  />
                </motion.div>
                {/* Status Dot */}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-4 border-sidebar shadow-[0_0_12px_rgba(16,185,129,0.5)] z-20" />
              </div>
              
              <div className="hidden sm:block text-shadow min-w-0 shrink">
                <h1 className="text-white text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-black italic tracking-tighter leading-none mb-1 flex items-center gap-1.5 sm:gap-2 max-w-full min-w-0 shrink">
                  <span className="shrink-0">Welcome,</span>
                  <span className="not-italic text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] truncate max-w-[100px] sm:max-w-[180px] md:max-w-[260px] lg:max-w-[150px] xl:max-w-[280px] inline-block align-bottom">{profile?.name || 'User'}</span>
                  {isStudent && studentProfiles.length > 1 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/25 border border-rose-400/30 text-rose-300 font-sans not-italic font-black uppercase text-[10px] tracking-wider rounded-xl animate-pulse ml-2 self-center shrink-0">
                      <Users className="w-3.5 h-3.5 text-rose-400" /> Sibling Connected
                    </span>
                  )}
                </h1>
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg shrink-0">
                    <Shield className="w-3 h-3 text-cyan-300" />
                    <p className="text-cyan-200 font-extrabold uppercase tracking-wide text-[10px]">
                      {getDisplayRole()}
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 bg-white/10 rounded-lg shrink-0">
                    <Calendar className="w-3 h-3 text-cyan-400" />
                    <p className="text-white font-black uppercase tracking-[0.1em] text-[10px] flex items-center gap-1">
                      <span>{format(currentTime, 'EEEE, MMM do, yyyy')}</span>
                      <span className="text-cyan-300 font-mono font-medium">{format(currentTime, 'hh:mm:ss a')}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-5 relative z-10 shrink-0">
            <div className="hidden md:flex items-center gap-1 px-1.5 py-0.5 bg-white/5 backdrop-blur-md rounded-md border border-white/10 text-[7px] font-black text-white/80 uppercase tracking-widest shadow-inner group/status">
              <div className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
              <span className="group-hover/status:text-cyan-300 transition-colors font-mono">Sync Active</span>
            </div>
            
            {/* Attractive Highlighted Sibling Switching Button on Welcome Banner */}
            {studentProfiles.length > 1 && (isStudent || isParent) && (
              <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-2xl border border-white/10 shadow-[0_0_20px_rgba(244,63,94,0.15)] animate-in fade-in zoom-in-95">
                <span className="hidden leading-none uppercase tracking-widest text-primary/80 font-black text-[9px] pl-2 md:flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Siblings:
                </span>
                <div className="flex items-center gap-1">
                  {studentProfiles.map((sibling) => {
                    const isActive = (sibling.uid || sibling.id) === profile?.uid;
                    return (
                      <button
                        key={sibling.uid || sibling.id}
                        onClick={() => {
                          if (!isActive) {
                            switchProfile(sibling.uid || sibling.id);
                            toast.success(`Switched account to ${sibling.name}!`);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-1 cursor-pointer select-none border ${
                          isActive
                            ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white shadow-lg shadow-rose-500/25 scale-105 border-transparent'
                            : 'bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white border-transparent'
                        }`}
                      >
                        <span>{sibling.name?.split(' ')[0]}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
              <div className="relative group/notify">
                <div className="absolute -inset-2 bg-white/5 rounded-2xl blur opacity-0 group-hover/notify:opacity-100 transition-opacity" />
                <NotificationCenter />
              </div>
              
              <button 
                onClick={() => navigate('/dashboard/profile')}
                className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-white/10 hover:bg-white/20 backdrop-blur-2xl rounded-2xl flex items-center justify-center text-white border border-white/20 shadow-2xl hover:scale-110 active:scale-95 transition-all group/gear relative overflow-hidden"
                title="Profile Settings"
              >
                <Settings className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 group-hover/gear:rotate-90 transition-transform duration-700 relative z-10" />
              </button>

              <button 
                onClick={handleLogout}
                className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white backdrop-blur-2xl rounded-2xl flex items-center justify-center border-2 border-rose-500/30 hover:border-rose-400 shadow-2xl hover:scale-110 active:scale-95 transition-all group/logout relative overflow-hidden"
                title="Logout Session"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 group-hover/logout:-translate-x-1 transition-transform relative z-10" />
              </button>
            </div>
          </div>
        </motion.div>
      </header>

      {/* Mobile Trigger Overlay (Mobile Only Header adjustment) */}
      <style>{`
        @media (max-width: 1023px) {
          header { left: 0 !important; }
        }
      `}</style>

      {/* Mobile Menu Trigger (Legacy button moved/styled) */}
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className="lg:hidden fixed bottom-8 right-8 z-40 bg-sidebar text-white p-5 rounded-[2rem] shadow-2xl shadow-sidebar/40 hover:scale-110 active:scale-95 transition-all outline-none"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Sidebar - Precision Integration */}
      <div className={`
        fixed inset-y-0 left-0 z-50 lg:relative lg:block transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-full relative shadow-2xl lg:shadow-none">
          {/* Close button for mobile */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className={`lg:hidden absolute top-6 -right-14 bg-white/10 backdrop-blur-xl p-3 rounded-2xl shadow-2xl text-white border border-white/20 hover:bg-white/20 transition-all ${isSidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
          >
            <X className="w-6 h-6" />
          </button>

          {/* Collapse toggle for desktop */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex absolute top-10 -right-4 z-[60] w-8 h-8 bg-sidebar border border-white/10 rounded-full items-center justify-center text-sidebar-foreground shadow-xl hover:scale-110 transition-all cursor-pointer"
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <div className="h-full">
            <Sidebar 
              collapsed={isSidebarCollapsed} 
              onItemClick={() => setIsSidebarOpen(false)} 
            />
          </div>
        </div>
      </div>

      {/* Intelligent Backdrop for mobile */}
      {isSidebarOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="lg:hidden fixed inset-0 bg-sidebar/40 backdrop-blur-md z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Content Engine */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-10 pt-32 lg:pt-32 w-full max-w-[100vw] relative scroll-smooth transition-all duration-500">
        <div className={`${isSidebarCollapsed ? 'max-w-full' : 'max-w-[1600px]'} mx-auto space-y-10 transition-all duration-500`}>
          {studentProfiles.length > 1 && (isStudent || isParent) && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 border-2 border-white/10 rounded-[2.5rem] p-6 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-primary/5 to-purple-500/10 animate-pulse pointer-events-none" />
              <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
              <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-primary/10 rounded-full blur-[60px] pointer-events-none" />
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-primary border border-white/10">
                  <Users className="w-6 h-6 text-cyan-300" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                    Active Sibling Profile Selector
                    <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                  </h3>
                  <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider font-mono">
                    Currently viewing: <span className="text-cyan-300 font-black">{profile?.name}</span> (Class {profile?.class || '---'})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-1.5 bg-white/5 rounded-[1.50rem] border border-white/10 flex-wrap relative z-10">
                {studentProfiles.map((child) => {
                  const isActive = (profile?.uid || profile?.id) === (child.uid || child.id);
                  return (
                    <button
                      key={child.uid || child.id}
                      onClick={() => switchProfile(child.uid || child.id)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-[1rem] text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                        isActive
                          ? 'bg-primary text-white shadow-xl scale-105 border border-white/10'
                          : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                      {child.name || 'Student'}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
          <Outlet />
        </div>
        
        {/* Footer Accent */}
        <footer className="mt-20 py-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[12px] font-black text-white/30 uppercase tracking-widest">
          <p>© 2026 School Management Ecosystem. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="hover:text-primary cursor-pointer transition-colors">Privacy Protocol</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Security Audit</span>
            <span className="hover:text-primary cursor-pointer transition-colors text-[10px] opacity-70">System v4.0.2</span>
          </div>
        </footer>
      </main>

      {!(profile?.role === 'driver' || window.location.pathname.includes('/dashboard/driver')) && (
        <div className="fixed bottom-8 left-8 lg:left-auto lg:right-8 z-50">
          <AIAssistant />
        </div>
      )}
    </div>
  );
};

export default Layout;
