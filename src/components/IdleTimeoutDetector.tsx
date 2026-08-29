import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Clock, LogOut, ShieldCheck } from 'lucide-react';
import { safeStorage as localStorage } from '../lib/safeStorage';

export const IdleTimeoutDetector: React.FC = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const lastRecordedTime = useRef<number>(Date.now());
  const navigate = useNavigate();

  // Generous timeout for school ERP operations (8 hours total inactivity)
  const IDLE_LIMIT = 8 * 60 * 60 * 1000; // 8 hours
  const WARNING_LIMIT = IDLE_LIMIT - (60 * 1000); // 1 minute warning before 8h limit

  useEffect(() => {
    // Check if user is authenticated (either Firebase user or bypass user)
    const isUserAuthenticated = () => {
      const hasBypass = !!localStorage.getItem('bypass_user_email');
      const hasFirebase = !!auth.currentUser;
      return hasBypass || hasFirebase;
    };

    if (!isUserAuthenticated() || window.location.pathname.startsWith('/login')) {
      setShowWarning(false);
      return;
    }

    // Initialize or refresh activity timestamp upon mounting or route change
    const now = Date.now();
    localStorage.setItem('last_app_activity', now.toString());
    lastRecordedTime.current = now;

    const resetTimer = () => {
      const currentTime = Date.now();
      // Update activity timestamp if at least 2 seconds elapsed
      if (currentTime - lastRecordedTime.current > 2000) {
        lastRecordedTime.current = currentTime;
        localStorage.setItem('last_app_activity', currentTime.toString());
        setShowWarning(false);
      }
    };

    // Attach interaction listeners to monitor real human activity
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('scroll', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('focus', resetTimer);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetTimer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleLogout = async () => {
      localStorage.removeItem('preferred_profile_id');
      localStorage.removeItem('bypass_user_email');
      localStorage.removeItem('bypass_user_uid');
      localStorage.removeItem('bypass_user_name');
      localStorage.removeItem('bypass_user_photo');
      try {
        await auth.signOut();
      } catch (err) {
        console.warn("Sign out failed on idle timeout:", err);
      }
      window.location.href = '/login?reason=timeout';
    };

    const intervalId = setInterval(() => {
      if (!isUserAuthenticated()) {
        setShowWarning(false);
        return;
      }

      // If document is visible, user is actively viewing the app -> refresh activity
      if (document.visibilityState === 'visible') {
        const currentNow = Date.now();
        lastRecordedTime.current = currentNow;
        localStorage.setItem('last_app_activity', currentNow.toString());
        if (showWarning) setShowWarning(false);
        return;
      }

      const lastActivity = parseInt(localStorage.getItem('last_app_activity') || Date.now().toString(), 10);
      const currentTime = Date.now();
      const idleTime = currentTime - lastActivity;

      if (idleTime >= IDLE_LIMIT) {
        clearInterval(intervalId);
        handleLogout();
      } else if (idleTime >= WARNING_LIMIT) {
        setShowWarning(true);
        const remaining = Math.max(0, 60 - Math.floor((idleTime - WARNING_LIMIT) / 1000));
        setCountdown(remaining);
      } else {
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, 5000);

    return () => {
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('focus', resetTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, []);

  if (!showWarning) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl p-8 max-w-md w-full relative overflow-hidden flex flex-col items-center text-center gap-6"
        >
          {/* Decorative background glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/20 to-transparent dark:from-amber-950/10 pointer-events-none" />

          {/* Big Warning Icon */}
          <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-500 relative">
            <Clock className="w-8 h-8 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full" />
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center justify-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Session Timeout Warning
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              You have been idle for a while. To conserve resources and keep your account secure, your session will automatically end shortly unless you choose to stay logged in.
            </p>
          </div>

          {/* Live countdown badge */}
          <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 rounded-2xl px-5 py-3.5 w-full justify-center">
            <span className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
              Auto-logout in:
            </span>
            <span className="font-mono text-xl font-black text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-950 px-3.5 py-1 rounded-xl shadow-sm min-w-[3rem]">
              {countdown}s
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
            <button
              onClick={() => {
                localStorage.setItem('last_app_activity', Date.now().toString());
                setShowWarning(false);
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-md hover:shadow-emerald-500/10 transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Stay Logged In
            </button>
            <button
              onClick={async () => {
                localStorage.removeItem('preferred_profile_id');
                localStorage.removeItem('bypass_user_email');
                localStorage.removeItem('bypass_user_uid');
                localStorage.removeItem('bypass_user_name');
                localStorage.removeItem('bypass_user_photo');
                await auth.signOut();
                window.location.href = '/login?reason=manual';
              }}
              className="inline-flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
