import React, { useState, useEffect } from 'react';
import { AlertCircle, X, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from '../services/dbService';

export const QuotaExceededBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkQuota = () => {
      const timestamp = localStorage.getItem('firestore_quota_exceeded_timestamp');
      if (timestamp) {
        setIsVisible(true);
      }
    };

    checkQuota();

    const handleQuotaExceeded = () => setIsVisible(true);
    const handleQuotaReset = () => setIsVisible(false);

    window.addEventListener('firestore-quota-exceeded', handleQuotaExceeded);
    window.addEventListener('firestore-quota-reset', handleQuotaReset);

    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuotaExceeded);
      window.removeEventListener('firestore-quota-reset', handleQuotaReset);
    };
  }, []);

  const handleReset = () => {
    localStorage.removeItem('firestore_quota_exceeded_timestamp');
    setIsVisible(false);
    dbService.resetQuota();
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-2xl"
        >
          <div className="bg-rose-600 text-white p-4 rounded-2xl shadow-2xl border-2 border-rose-500 flex items-center justify-between gap-4 backdrop-blur-xl bg-opacity-90">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-black uppercase tracking-tight text-sm">Database Quota Exceeded</h3>
                <p className="text-xs text-rose-100 font-medium">
                  The free daily limit for database operations has been reached. App features will be limited until tomorrow or until upgraded.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-2 bg-white text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-50 transition-colors flex items-center gap-2"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Retry
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                title="Dismiss"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
