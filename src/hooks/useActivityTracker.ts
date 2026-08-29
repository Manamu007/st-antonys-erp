import { useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../services/dbService';
import { auth, testConnection } from '../firebase';
import { toast } from 'sonner';
import { safeStorage as localStorage, safeSessionStorage as sessionStorage } from '../lib/safeStorage';

const getModuleName = (path: string): string | null => {
  if (path === '/dashboard' || path === '/dashboard/') return "Dashboard Main";
  if (path.includes('/fees')) return "Fees Management";
  if (path.includes('/attendance')) return "Attendance Tracking";
  if (path.includes('/students')) return "Student Directory";
  if (path.includes('/staff')) return "Staff Directory";
  if (path.includes('/homework')) return "Homework & Assignments";
  if (path.includes('/exams')) return "Examinations & Marks";
  if (path.includes('/timetable')) return "Class Timetable";
  if (path.includes('/transport')) return "Transport Hub";
  if (path.includes('/hostel')) return "Hostel Operations";
  if (path.includes('/library')) return "Library Catalog";
  if (path.includes('/communication')) return "Communication Center";
  if (path.includes('/certificates')) return "Certificates Generator";
  if (path.includes('/front-office')) return "Front Office Reception";
  if (path.includes('/payroll')) return "Payroll Ledger";
  if (path.includes('/reports')) return "Finance & Academic Reports";
  if (path.includes('/settings')) return "School Administration Settings";
  if (path.includes('/notices')) return "Notices & Calendar";
  if (path.includes('/insights')) return "Teacher Insights";
  if (path.includes('/risk')) return "Risk Prediction";
  if (path.includes('/ai-assistant')) return "AI Assistant Hub";
  if (path.includes('/bot-builder')) return "Bot Workflow Builder";
  if (path.includes('/driver')) return "Driver Portal";
  if (path.includes('/storage')) return "Storage Management";
  return "System Portal";
};

export const useActivityTracker = () => {
  const location = useLocation();
  const { profile } = useAuth();
  const sessionStartTime = useRef(Date.now());
  const lastPath = useRef(location.pathname);

  useEffect(() => {
    if (!profile || !auth.currentUser) return;

    // Track module navigation
    const trackNavigation = async () => {
      const moduleName = getModuleName(location.pathname);
      if (!moduleName) return;

      // Anti-bounce and write conservation throttling using sessionStorage
      const valKey = `last_tracked_${auth.currentUser?.uid || 'anon'}`;
      const lastTracked = sessionStorage.getItem(valKey);
      const now = Date.now();
      if (lastTracked) {
        try {
          const parsed = JSON.parse(lastTracked);
          if (parsed.path === location.pathname && now - parsed.time < 5000) {
            return;
          }
          // Throttle all telemetry navigation writes to at most once every 2 minutes (120000ms) to conserve Firestore writes
          if (now - parsed.time < 120000) {
            return;
          }
        } catch (e) {}
      }
      sessionStorage.setItem(valKey, JSON.stringify({ path: location.pathname, time: now }));

      try {
        const auditDoc = {
          action: 'open',
          collectionName: 'modules',
          docId: location.pathname,
          targetProfileName: moduleName,
          operator: {
            uid: auth.currentUser?.uid || profile?.uid || 'unknown',
            email: auth.currentUser?.email || profile?.email || 'unknown-email',
            name: profile?.name || auth.currentUser?.displayName || 'User'
          },
          timestamp: new Date().toISOString(),
          before: null,
          after: {
            userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
            path: location.pathname
          }
        };

        await dbService.add('audit_logs', auditDoc);

        // Also add to user_activities for real-time visual system pulse
        const userActivityDoc = {
          userName: profile?.name || auth.currentUser?.displayName || 'User',
          userEmail: auth.currentUser?.email || profile?.email || 'unknown-email',
          userPhoto: profile?.photoURL || profile?.photoUrl || auth.currentUser?.photoURL || '',
          timestamp: new Date().toISOString(),
          module: location.pathname,
          durationSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000) || 12
        };
        await dbService.add('user_activities', userActivityDoc);
      } catch (err) {
        console.warn("Module tracking telemetry failed:", err);
      }
    };

    trackNavigation();

    // Heartbeat for "Time Spent" on current session
    const heartbeatInterval = setInterval(async () => {
      /* Heartbeat disabled */
    }, 600000); 

    // Handle tab visibility changes to recover from idle disconnects
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const lastActivity = localStorage.getItem('last_app_activity');
        const now = Date.now();
        
        // If app was idle/hidden for more than 45 minutes, it's safer to refresh
        // as Firebase SDK can sometimes lose state or hang during long idle periods
        // causing the "sad face" or unresponsive UI
        if (lastActivity && now - parseInt(lastActivity) > 1000 * 60 * 45) {
          console.log('App returned from very long idle period. Performing soft refresh to ensure stability...');
          window.location.reload();
          return;
        }

        // For shorter periods (15-45 mins), trigger a connectivity resurrection
        if (lastActivity && now - parseInt(lastActivity) > 1000 * 60 * 15) {
          console.log('App returned from idle period. Triggering connectivity resurrection...');
          const isAlive = await testConnection();
          if (!isAlive) {
            toast.error('Connection lost during idle period. Attempting to reconnect...', { id: 'idle-reconnect' });
            // Forcing another check after delay
            setTimeout(testConnection, 5000);
          } else if (!window.navigator.onLine) {
            toast.error('You appear to be offline. Please refresh if data does not sync.');
          }
        }
        localStorage.setItem('last_app_activity', now.toString());
      }
    };

    const updateActivityStatus = () => {
      localStorage.setItem('last_app_activity', Date.now().toString());
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('mousedown', updateActivityStatus);
    document.addEventListener('keydown', updateActivityStatus);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('mousedown', updateActivityStatus);
      document.removeEventListener('keydown', updateActivityStatus);
    };
  }, [location.pathname, profile?.uid]);
};
