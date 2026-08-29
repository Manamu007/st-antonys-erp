import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Share, Plus, X, Smartphone, CheckCircle } from 'lucide-react';

export const PWAInstallerHelper: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Detect if device is iOS (iPhone/iPad)
    const isIOS = 
      /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Detect if already installed / running in standalone mode
    const isStandalone = 
      (window.navigator as any).standalone === true || 
      window.matchMedia('(display-mode: standalone)').matches;

    // Check if user dismissed it already in this session/local storage
    const isDismissed = localStorage.getItem('pwa_install_prompt_dismissed') === 'true';

    if (isIOS && !isStandalone && !isDismissed) {
      // Small delay to make it feel natural
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('pwa_install_prompt_dismissed', 'true');
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[9999] bg-white dark:bg-slate-900 border border-indigo-100 dark:border-slate-800 shadow-2xl rounded-2xl p-5 overflow-hidden"
          id="pwa-install-banner"
        >
          {/* Accent colored top bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-600" />

          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  iPad లో ఇన్‌స్టాల్ చేయండి (Install on iPad)
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                  Staff PWA Setup Guide
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Instruction Content */}
          <div className="space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
            {/* Telugu instruction */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100 dark:border-slate-800/40">
              <p className="font-medium leading-relaxed">
                మీ <span className="text-indigo-600 dark:text-indigo-400 font-bold">iPad Safari బ్రౌజర్‌లో</span> యాప్‌ను ఉపయోగించడానికి:
              </p>
              <ol className="mt-2 space-y-1.5 pl-1">
                <li className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">1</span>
                  <span>Safari పైన ఉండే షేర్ బటన్ <Share className="w-3.5 h-3.5 inline mx-0.5 text-indigo-500" /> ని నొక్కండి.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">2</span>
                  <span>కిందికి స్క్రోల్ చేసి <span className="font-semibold text-slate-800 dark:text-slate-200">'Add to Home Screen'</span> <Plus className="w-3.5 h-3.5 inline mx-0.5 text-indigo-500 border border-slate-300 rounded" /> పై క్లిక్ చేయండి.</span>
                </li>
              </ol>
            </div>

            {/* English translation */}
            <div className="px-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <p>
                <strong>For Staff iPad Setup:</strong> Tap the Safari share button <Share className="w-3 h-3 inline text-slate-500" /> and choose <strong>"Add to Home Screen"</strong> <Plus className="w-3 h-3 inline text-slate-500" /> to run in seamless full-screen mode without the Safari address bar.
              </p>
            </div>
          </div>

          {/* Quick Action Button to dismiss and mark as done */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleDismiss}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-200 dark:shadow-none"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>అర్థమైంది (Understood)</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PWAInstallerHelper;
