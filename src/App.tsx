import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { usePermissions } from './hooks/usePermissions';
import { SettingsProvider } from './context/SettingsContext';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster, toast } from 'sonner';
import { useActivityTracker } from './hooks/useActivityTracker';
import ScrollToTop from './components/ScrollToTop';
import { PWAInstallerHelper } from './components/PWAInstallerHelper';
import { IdleTimeoutDetector } from './components/IdleTimeoutDetector';

import { isSystemAccount, isTeacherAccountOrEmail } from './constants/systemAccounts';
import { isTeacherRole } from './utils/teacherFilter';
import { isStaffRole, isStaffAccountOrEmail } from './lib/profileUtils';

// Monkey-patch Sonner toast.error to intercept Firebase index errors and display them as beautiful, clickable blue links
const originalToastError = toast.error;
const patchedToastError = (message: any, options?: any) => {
  let msgStr = '';
  if (typeof message === 'string') {
    msgStr = message;
  } else if (message instanceof Error) {
    msgStr = message.message;
  } else if (message && typeof message === 'object' && 'message' in message) {
    msgStr = String((message as any).message);
  } else {
    msgStr = String(message || '');
  }

  // Parse JSON if it's stringified FirestoreErrorInfo from dbService
  if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
    try {
      const parsed = JSON.parse(msgStr);
      if (parsed && typeof parsed === 'object' && (parsed.error || parsed.message)) {
        msgStr = parsed.error || parsed.message;
      }
    } catch (e) {
      // Ignored
    }
  }

  if (
    msgStr.includes('FAILED_PRECONDITION') || 
    msgStr.includes('requires an index') || 
    msgStr.includes('console.firebase.google.com')
  ) {
    const match = msgStr.match(/https:\/\/console\.firebase\.google\.com[^\s']+/);
    const url = match ? match[0] : '';
    if (url) {
      return originalToastError(
        <div className="flex flex-col gap-2 p-1 text-left">
          <span className="font-bold text-rose-600 block">⚠️ Missing Firestore Index!</span>
          <span className="text-xs text-neutral-600 block leading-tight">
            This query requires a database index. Click the blue link below to open the Firebase Console and create it:
          </span>
          <a 
            href={url} 
            target="_blank" 
            rel="noreferrer noopener"
            className="text-xs font-extrabold text-blue-600 hover:text-blue-800 underline flex items-center gap-1 mt-1 transition-all cursor-pointer"
            style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 'bold' }}
          >
            👉 Create Composite Index on Firebase
          </a>
        </div>,
        { 
          ...options, 
          duration: 30000,
          dismissible: true
        }
      );
    }
  }

  return originalToastError(message, options);
};

// Object.defineProperty is used to ensure we bypass any read-only/frozen modules issues if any
try {
  (toast as any).error = patchedToastError;
} catch (e) {
  console.warn("Could not patch toast.error directly:", e);
}

// Helper for resilient lazy loading with retry logic against stale module caches
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then(resolve)
          .catch((error) => {
            if (remaining > 0) {
              setTimeout(() => attempt(remaining - 1), 400);
            } else {
              const lastReload = sessionStorage.getItem('chunk_retry_reloaded');
              const now = Date.now();
              if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
                sessionStorage.setItem('chunk_retry_reloaded', now.toString());
                window.location.reload();
                return;
              }
              reject(error);
            }
          });
      };
      attempt(retries);
    })
  );
}

import Login from './pages/Login';

// Resilient Lazy loading all pages for ultra fast initial app bundle load speed
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Students = lazyWithRetry(() => import('./pages/Students'));
const Staff = lazyWithRetry(() => import('./pages/Staff'));
const Hostel = lazyWithRetry(() => import('./pages/Hostel'));
const Attendance = lazyWithRetry(() => import('./pages/Attendance'));
const Fees = lazyWithRetry(() => import('./pages/Fees'));
const Exams = lazyWithRetry(() => import('./pages/Exams'));
const Timetable = lazyWithRetry(() => import('./pages/Timetable'));
const Homework = lazyWithRetry(() => import('./pages/Homework'));
const ParentDashboard = lazyWithRetry(() => import('./pages/ParentDashboard'));
const Communication = lazyWithRetry(() => import('./pages/Communication'));
const Library = lazyWithRetry(() => import('./pages/Library'));
const Payroll = lazyWithRetry(() => import('./pages/Payroll'));
const Transport = lazyWithRetry(() => import('./pages/Transport'));
const Leaves = lazyWithRetry(() => import('./pages/Leaves'));
const SchoolSettings = lazyWithRetry(() => import('./pages/SchoolSettings'));
const Academics = lazyWithRetry(() => import('./pages/Academics'));
const AboutUs = lazyWithRetry(() => import('./pages/AboutUs'));
const AcademicsPage = lazyWithRetry(() => import('./pages/AcademicsPage'));
const Admissions = lazyWithRetry(() => import('./pages/Admissions'));
const Gallery = lazyWithRetry(() => import('./pages/Gallery'));
const Certificates = lazyWithRetry(() => import('./pages/Certificates'));
const IdCards = lazyWithRetry(() => import('./pages/IdCards'));
const Roles = lazyWithRetry(() => import('./pages/Roles'));
const Reports = lazyWithRetry(() => import('./pages/Reports'));
const RiskPrediction = lazyWithRetry(() => import('./pages/RiskPrediction'));
const TeacherInsights = lazyWithRetry(() => import('./pages/TeacherInsights'));
const ParentTracking = lazyWithRetry(() => import('./pages/ParentTracking'));
const NoticeEvents = lazyWithRetry(() => import('./pages/NoticeEvents'));
const UserProfile = lazyWithRetry(() => import('./pages/UserProfile'));
const DriverPortal = lazyWithRetry(() => import('./pages/DriverPortal'));
const StorageManagement = lazyWithRetry(() => import('./pages/StorageManagement'));
const AIAssistantHub = lazyWithRetry(() => import('./pages/AIAssistantHub'));
const BotWorkflowBuilder = lazyWithRetry(() => import('./whatsapp_bot_v2/components/BotWorkflowBuilder'));
const FrontOffice = lazyWithRetry(() => import('./pages/FrontOffice'));
const AdmissionRegister = lazyWithRetry(() => import('./pages/AdmissionRegister'));
const OutingPermission = lazyWithRetry(() => import('./pages/OutingPermission'));
const StudentHealth = lazyWithRetry(() => import('./modules/studentHealth/pages/StudentHealthPage'));

const PrivacyPolicy = lazyWithRetry(() => import('./pages/Compliance').then(m => ({ default: m.PrivacyPolicy })));
const RefundPolicy = lazyWithRetry(() => import('./pages/Compliance').then(m => ({ default: m.RefundPolicy })));
const TermsAndConditions = lazyWithRetry(() => import('./pages/Compliance').then(m => ({ default: m.TermsAndConditions })));
const FeeStructurePage = lazyWithRetry(() => import('./pages/Compliance').then(m => ({ default: m.FeeStructurePage })));

const PageLoading = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] w-full p-8 text-center bg-slate-50/50 dark:bg-slate-950/20 backdrop-blur-xl">
    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
    <span className="text-xs font-black uppercase tracking-[0.25em] text-[#0f172a]/50 dark:text-white/50 animate-pulse">
      Loading Module...
    </span>
  </div>
);

const ActivityWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useActivityTracker();
  return <>{children}</>;
};

const DashboardRouter = () => {
  const { isParent, isStudent, role, isTeacher, isAccountant, isClerk, isReceptionist, isAdmin, isPrincipal, isVicePrincipal, isSuperAdmin, profile } = usePermissions();
  const { user } = useAuth();
  const roleLower = (role || profile?.role || '').toLowerCase().trim();
  const email = (profile?.email || user?.email || '').toLowerCase().trim();
  const name = (profile?.name || user?.displayName || '').toLowerCase().trim();
  
  const isTeacherUser = isTeacher || isTeacherRole(roleLower, email, name) || isTeacherAccountOrEmail(email) || isTeacherAccountOrEmail(name) || (profile as any)?.isTeacherPortal === true;
  const isStaffUser = isStaffRole(roleLower) || isStaffAccountOrEmail(email, roleLower, name) || isTeacherUser || isAccountant || isClerk || isReceptionist || isAdmin || isPrincipal || isVicePrincipal || isSuperAdmin;

  if (roleLower === 'driver') return <Navigate to="/dashboard/driver" replace />;
  if (roleLower === 'doctor') return <Navigate to="/dashboard/student-health" replace />;
  if (isStaffUser) return <Dashboard />;
  if ((isParent || isStudent || roleLower === 'student' || roleLower === 'parent') && !isStaffUser) return <ParentDashboard />;
  return <Dashboard />;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <PublicLayout>{children}</PublicLayout>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-6">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
      <h2 className="text-2xl font-black text-sidebar uppercase tracking-tight italic">Verifying Credentials</h2>
      <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest mt-2 italic animate-pulse">Syncing with secure educational cloud...</p>
    </div>
  );

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user is logged in but has no profile (and is not the system admin bootstrapping)
  // we should treat them as unauthorized unless a bypass session is active
  if (!profile && !isSystemAccount(user.email) && !localStorage.getItem('bypass_user_email')) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const ManagementRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  const { isAdmin, isPrincipal, isVicePrincipal, isSuperAdmin } = usePermissions();
  
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#F8FAFC]">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
      <p className="text-neutral-500 font-bold animate-pulse">Verifying Access...</p>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  const isManagement = isAdmin || isPrincipal || isVicePrincipal || isSuperAdmin;
  return isManagement ? <>{children}</> : <Navigate to="/dashboard" />;
};

const AutoUpdateNotifier: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [countdown, setCountdown] = React.useState(3);

  React.useEffect(() => {
    // Skip in local development/Vite dev mode to avoid reload loops
    if (import.meta.env.DEV) return;

    // Current version loaded in the browser
    const currentVersion = import.meta.env.VITE_APP_VERSION || 'dev';
    if (currentVersion === 'dev') return;

    // Throttle checks if we've already reloaded multiple times recently for this version
    let syncAttempts = 0;
    try {
      syncAttempts = parseInt(sessionStorage.getItem('version_sync_attempts') || '0', 10);
    } catch (e) {}

    if (syncAttempts >= 2) {
      console.warn(`[AutoUpdate] Suppressing update checks after ${syncAttempts} reloads to prevent lockout loop.`);
      return;
    }

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/app-version');
        if (res.ok) {
          const data = await res.json();
          if (data && data.version && data.version !== currentVersion) {
            console.log(`[AutoUpdate] Version mismatch! Browser: ${currentVersion}, Server: ${data.version}`);
            setUpdateAvailable(true);
          } else {
            // Version matches or is newer, reset sync attempts
            try {
              sessionStorage.removeItem('version_sync_attempts');
            } catch (e) {}
          }
        }
      } catch (err) {
        console.error('[AutoUpdate] Error checking server version:', err);
      }
    };

    // Run check initially after 5 seconds, then every 30 seconds
    const initialTimeout = setTimeout(checkVersion, 5000);
    const interval = setInterval(checkVersion, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    if (!updateAvailable) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          
          // Increment sync attempts in sessionStorage before reload
          try {
            const currentAttempts = parseInt(sessionStorage.getItem('version_sync_attempts') || '0', 10);
            sessionStorage.setItem('version_sync_attempts', (currentAttempts + 1).toString());
          } catch (e) {}

          // Unregister Service Workers, clear cache, and reload with cache-busting version parameter
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
              for (const reg of registrations) {
                reg.unregister();
              }
            }).catch(() => {});
          }

          if ('caches' in window) {
            caches.keys().then((keys) => {
              for (const key of keys) {
                caches.delete(key);
              }
            }).catch(() => {});
          }

          setTimeout(() => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('cv', Date.now().toString());
              window.location.href = url.toString();
            } catch (e) {
              window.location.reload();
            }
          }, 150);

          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl p-8 max-w-md w-full text-center relative overflow-hidden flex flex-col items-center gap-6">
        {/* Decorative background pulse */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/20 to-transparent dark:from-indigo-950/10 pointer-events-none" />
        
        <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 relative">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full animate-ping" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full" />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            System Synchronizing
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            A new version with the latest features was published successfully. Updating all active screens automatically...
          </p>
        </div>

        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl px-5 py-3 w-full justify-center">
          <span className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            Refreshing in
          </span>
          <span className="font-mono text-xl font-black text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-950 px-3 py-1 rounded-xl shadow-sm min-w-[2.5rem]">
            {countdown}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [isPoisoned, setIsPoisoned] = React.useState(false);

  React.useEffect(() => {
    const handlePoison = () => setIsPoisoned(true);
    window.addEventListener('firestore-poisoned', handlePoison);
    
    const logIndexErrorToFirestore = async (message: string, url: string) => {
      try {
        const { dbService } = await import('./services/dbService');
        const cleanUrl = url.trim();
        const docId = cleanUrl.split('create_composite=')[1]?.slice(0, 100).replace(/[^a-zA-Z0-9_-]/g, '_') || String(Date.now());
        await dbService.set('index_errors', docId, {
          message,
          url,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          location: window.location.href,
        });
        console.log('[IndexErrorLogger] Logged to Firestore successfully:', cleanUrl);
      } catch (err) {
        console.error('[IndexErrorLogger] Failed to log index error to Firestore:', err);
      }
    };

    // Global error handlers to display to the user via toast
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || '';
      if (
        message.includes('ResizeObserver') || 
        message.includes('loop limit exceeded') ||
        message.includes('Box.constructor') ||
        message.includes('drawImage')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (message.includes('requires an index') || message.includes('console.firebase.google.com')) {
        const match = message.match(/https:\/\/console\.firebase\.google\.com[^\s']+/);
        const url = match ? match[0] : '';
        if (url) {
          logIndexErrorToFirestore(message, url);
          // High-contrast, beautiful prompt with CTA
          toast.error(
            <div className="flex flex-col gap-2 p-1 text-left">
              <span className="font-bold text-rose-600 block">⚠️ Missing Firestore Index Detector!</span>
              <span className="text-xs text-neutral-600 block leading-tight">
                This academic database view needs a composite query index. You can create it in one click:
              </span>
              <a 
                href={url} 
                target="_blank" 
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center bg-primary hover:bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider py-2 px-3 rounded-xl transition-all shadow-md self-start mt-1 border border-primary/20"
              >
                Create Composite Index
              </a>
            </div>,
            { duration: 30000, dismissible: true }
          );
          return;
        }
      }
      toast.error(`Action Failed: ${event.reason?.message || "An unexpected error occurred"}`);
    };

    const handleError = (event: ErrorEvent) => {
      const message = event.message || '';
      if (
        message.includes('ResizeObserver') || 
        message.includes('loop limit exceeded') ||
        message.includes('Box.constructor') ||
        message.includes('drawImage')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (message.includes('requires an index') || message.includes('console.firebase.google.com')) {
        const match = message.match(/https:\/\/console\.firebase\.google\.com[^\s']+/);
        const url = match ? match[0] : '';
        if (url) {
          logIndexErrorToFirestore(message, url);
          // High-contrast, beautiful prompt with CTA
          toast.error(
            <div className="flex flex-col gap-2 p-1 text-left">
              <span className="font-bold text-rose-600 block">⚠️ Missing Firestore Index Detector!</span>
              <span className="text-xs text-neutral-600 block leading-tight">
                This academic database view needs a composite query index. You can create it in one click:
              </span>
              <a 
                href={url} 
                target="_blank" 
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center bg-primary hover:bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider py-2 px-3 rounded-xl transition-all shadow-md self-start mt-1 border border-primary/20"
              >
                Create Composite Index
              </a>
            </div>,
            { duration: 30000, dismissible: true }
          );
          return;
        }
      }
      toast.error(`Action Failed: ${event.message || "An unexpected application error occurred"}`);
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);

    // Clear all faceDescriptors and related db caches from local Chrome memory/localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        console.log("[Chrome Memory Cleanup] Purging all face ID descriptors & local list caches...");
        const keysToClean: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && (
            key.includes('fs_list_cache_') || 
            key.includes('fs_cache_') || 
            key.includes('fs_paginated_cache_') ||
            key.toLowerCase().includes('face')
          )) {
            keysToClean.push(key);
          }
        }
        keysToClean.forEach(k => {
          try {
            window.localStorage.removeItem(k);
          } catch (e) {}
        });
        console.log(`[Chrome Memory Cleanup] Cleaned ${keysToClean.length} keys from local cache.`);
      }
    } catch (cleanErr) {
      console.warn("Could not clear localStorage keys:", cleanErr);
    }

    return () => {
      window.removeEventListener('firestore-poisoned', handlePoison);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <Router>
            <ScrollToTop />
            <AutoUpdateNotifier />
            <IdleTimeoutDetector />
            <Toaster position="top-right" />
            <PWAInstallerHelper />
            <React.Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
                <Route path="/about" element={<PublicRoute><AboutUs /></PublicRoute>} />
                <Route path="/academics-info" element={<PublicRoute><AcademicsPage /></PublicRoute>} />
                <Route path="/admissions" element={<PublicRoute><Admissions /></PublicRoute>} />
                <Route path="/gallery" element={<PublicRoute><Gallery /></PublicRoute>} />
                <Route path="/privacy-policy" element={<PublicRoute><PrivacyPolicy /></PublicRoute>} />
                <Route path="/refund-policy" element={<PublicRoute><RefundPolicy /></PublicRoute>} />
                <Route path="/terms" element={<PublicRoute><TermsAndConditions /></PublicRoute>} />
                <Route path="/fee-structure" element={<PublicRoute><FeeStructurePage /></PublicRoute>} />
                <Route path="/login" element={<Login />} />
                <Route path="/track/:busId" element={<ParentTracking />} />
                <Route path="/outing-permission" element={<OutingPermission />} />
                <Route path="/dashboard" element={<PrivateRoute><ActivityWrapper><Layout /></ActivityWrapper></PrivateRoute>}>
                  <Route index element={<DashboardRouter />} />
                  <Route path="students" element={<Students />} />
                  <Route path="staff" element={<Staff />} />
                  <Route path="attendance" element={<Attendance />} />
                  <Route path="front-office" element={<FrontOffice />} />
                  <Route path="fees" element={<Fees />} />
                  <Route path="exams" element={<Exams />} />
                  <Route path="timetable" element={<Timetable />} />
                  <Route path="homework" element={<Homework />} />
                  <Route path="communication" element={<Communication />} />
                  <Route path="library" element={<Library />} />
                  <Route path="payroll" element={<Payroll />} />
                  <Route path="transport" element={<Transport />} />
                  <Route path="hostel" element={<Hostel />} />
                  <Route path="student-health" element={<StudentHealth />} />
                  <Route path="leaves" element={<Leaves />} />
                  <Route path="certificates" element={<Certificates />} />
                  <Route path="id-cards" element={<IdCards />} />
                  <Route path="outing-permission" element={<OutingPermission />} />
                  <Route path="settings" element={<ManagementRoute><SchoolSettings /></ManagementRoute>} />
                  <Route path="roles" element={<ManagementRoute><Roles /></ManagementRoute>} />
                  <Route path="academics" element={<Academics />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="admission-register" element={<AdmissionRegister />} />
                  <Route path="risk" element={<RiskPrediction />} />
                  <Route path="insights" element={<TeacherInsights />} />
                  <Route path="ai-assistant" element={<AIAssistantHub />} />
                  <Route path="bot-builder" element={<BotWorkflowBuilder />} />
                  <Route path="notices" element={<NoticeEvents />} />
                  <Route path="profile" element={<UserProfile />} />
                  <Route path="storage" element={<ManagementRoute><StorageManagement /></ManagementRoute>} />
                  <Route path="driver" element={<DriverPortal />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Routes>
            </React.Suspense>
          </Router>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
