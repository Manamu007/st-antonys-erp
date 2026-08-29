import React, { useState, useEffect } from 'react';
import { Bot, Save, Sparkles, Sliders, Globe, ShieldCheck, HelpCircle } from 'lucide-react';
import { AntonyAiSettings } from '../types/antonyAiTypes';
import { antonyAiClient } from '../services/antonyAiClient';
import { toast } from 'sonner';

interface SettingsCardProps {
  creds: { userId: string; role: string; schoolId: string; hospitalId?: string };
}

export const AntonyAiSettingsCard: React.FC<SettingsCardProps> = ({ creds }) => {
  const [settings, setSettings] = useState<AntonyAiSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load backend settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await antonyAiClient.getSettings(creds);
        setSettings(data);
      } catch (err: any) {
        toast.error("Failed to sync AI settings.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [creds]);

  const handleToggle = (key: keyof AntonyAiSettings) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [key]: !settings[key]
    });
  };

  const handleSelectLanguage = (val: "ENGLISH" | "TELUGU" | "BOTH") => {
    if (!settings) return;
    setSettings({
      ...settings,
      languageMode: val
    });
  };

  const handleLimitChange = (val: number) => {
    if (!settings) return;
    setSettings({
      ...settings,
      maxDailyQueriesPerUser: val
    });
  };

  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    if (!settings) return;
    setIsSaving(true);

    try {
      const saved = await antonyAiClient.updateSettings(settings, creds);
      setSettings(saved);
      toast.success("Antony AI Settings written successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update AI settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const isAdmin = creds.role === "ADMIN" || creds.role === "SUPER_ADMIN" || creds.role === "PRINCIPAL";

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-neutral-100 rounded-[2.5rem] flex items-center justify-center animate-pulse">
        <Bot className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-8 bg-white border border-neutral-100 rounded-[2.5rem] text-center text-neutral-400">
        AI settings are not available.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-neutral-100 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-tight text-neutral-800">Antony AI Agent Settings</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Institutional AI Engine Panel</p>
          </div>
        </div>

        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
          settings.enabled 
            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
            : 'bg-neutral-50 text-neutral-400 border-neutral-150'
        }`}>
          {settings.enabled ? 'ENABLED' : 'DISABLED'}
        </span>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {/* Toggle Switch */}
        <div className="bg-neutral-50 dark:bg-slate-800 p-5 rounded-2xl border border-neutral-100/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-tight text-neutral-800 dark:text-neutral-150">Antony AI Switch (ON / OFF)</p>
            <p className="text-[11px] font-bold text-neutral-400 mt-1 max-w-md">
              Enable or disable the Antony AI assistant globally. When turned off, all widgets are hidden and routes reject incoming requests completely to prevent use and control API spending.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => handleToggle("enabled")}
              className={`relative w-14 h-7 rounded-full transition-colors flex items-center ${
                settings.enabled ? 'bg-emerald-500' : 'bg-neutral-300'
              } ${!isAdmin ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <div className={`absolute w-5 h-5 bg-white rounded-full transition-transform shadow-xs ${
                settings.enabled ? 'translate-x-8' : 'translate-x-1'
              }`} />
            </button>
            <span className={`text-[10px] font-black uppercase w-16 tracking-wider ${
              settings.enabled ? 'text-emerald-500' : 'text-neutral-400'
            }`}>
              {settings.enabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Section of Sub-settings (Only interactive if enabled and is Admin) */}
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-all ${!settings.enabled ? 'opacity-45 pointer-events-none' : ''}`}>
          
          {/* Language selection dropdown */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-indigo-500" />
              Language Assistance Mode
            </label>
            <select
              disabled={!isAdmin}
              value={settings.languageMode}
              onChange={(e) => handleSelectLanguage(e.target.value as any)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all font-sans"
            >
              <option value="BOTH">Bilingual (English + Telugu)</option>
              <option value="ENGLISH">English Only</option>
              <option value="TELUGU">Telugu (తెలుగు) Only</option>
            </select>
          </div>

          {/* Floating Widget Toggle */}
          <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase text-neutral-600">Allow Floating Widget</p>
              <p className="text-[9px] text-neutral-400 mt-0.5">Render chat circle in lower section.</p>
            </div>
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => handleToggle("allowFloatingWidget")}
              className={`relative w-12 h-6 rounded-full transition-colors flex items-center ${
                settings.allowFloatingWidget ? 'bg-indigo-600' : 'bg-neutral-300'
              }`}
            >
              <div className={`absolute w-4 h-4 bg-white rounded-full transition-transform shadow-xs ${
                settings.allowFloatingWidget ? 'translate-x-7' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Records categories permissions */}
          <div className="md:col-span-2 space-y-3 pt-2">
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Authorized Database Context Boundaries
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Student */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-neutral-600">Student Profiles</p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => handleToggle("allowStudentDataAccess")}
                  className={`relative w-10 h-5 rounded-full transition-colors flex items-center ${
                    settings.allowStudentDataAccess ? 'bg-indigo-600' : 'bg-neutral-300'
                  }`}
                >
                  <div className={`absolute w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                    settings.allowStudentDataAccess ? 'translate-x-5.5' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Fee */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-neutral-600">Tuition & Fees</p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => handleToggle("allowFeeDataAccess")}
                  className={`relative w-10 h-5 rounded-full transition-colors flex items-center ${
                    settings.allowFeeDataAccess ? 'bg-indigo-600' : 'bg-neutral-300'
                  }`}
                >
                  <div className={`absolute w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                    settings.allowFeeDataAccess ? 'translate-x-5.5' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Health */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-neutral-600">Health Cards</p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => handleToggle("allowHealthDataAccess")}
                  className={`relative w-10 h-5 rounded-full transition-colors flex items-center ${
                    settings.allowHealthDataAccess ? 'bg-indigo-600' : 'bg-neutral-300'
                  }`}
                >
                  <div className={`absolute w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                    settings.allowHealthDataAccess ? 'translate-x-5.5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Daily limit counter */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
              Max Daily Queries Per User
            </label>
            <input
              type="number"
              disabled={!isAdmin}
              value={settings.maxDailyQueriesPerUser}
              onChange={(e) => handleLimitChange(Number(e.target.value) || 100)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all font-sans"
              min={10}
              max={1000}
            />
          </div>
        </div>

        {/* Read-Only Non-Admin Notice */}
        {!isAdmin && (
          <div className="p-4 bg-neutral-50 border border-neutral-200/50 rounded-xl flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-indigo-500 shrink-0" />
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
              Note: Settings are in view-only mode. Only Administrative users can mutate Antony AI parameters.
            </p>
          </div>
        )}

        {/* Update timestamp and submit button */}
        <div className="pt-4 border-t border-neutral-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {settings.updatedAt && (
            <div className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
              Last Config Sync: {new Date(settings.updatedAt).toLocaleString()}
            </div>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2.5 bg-indigo-600 hover:bg-black text-white px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all self-end shrink-0 shadow-lg shadow-indigo-100"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving Settings..." : "Save Settings"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
