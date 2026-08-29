import React, { useState, useEffect } from 'react';
import { Bot, RefreshCw, Key, ShieldCheck, ShieldAlert, Calendar, History, Trash2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { AntonyAiHealthCard } from '../components/AntonyAiHealthCard';
import { AntonyAiLog } from '../types/antonyAiTypes';
import { antonyAiClient } from '../services/antonyAiClient';
import { toast } from 'sonner';

export const AntonyAiHealthPage: React.FC = () => {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AntonyAiLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  const creds = React.useMemo(() => ({
    userId: profile?.uid || profile?.id || 'GUEST_USER',
    role: profile?.role || 'GUEST',
    schoolId: 'st_antonys_school',
    hospitalId: (profile as any)?.hospitalId || ''
  }), [profile]);

  async function loadLogs() {
    setIsLoadingLogs(true);
    try {
      const data = await antonyAiClient.getLogs(creds);
      setLogs(data);
    } catch (e) {
      console.warn("Could not query audit logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [creds]);

  const getLogBadgeColor = (conf: string) => {
    switch (conf) {
      case "HIGH":
        return "bg-emerald-50 text-emerald-600 border-emerald-100";
      case "MEDIUM":
        return "bg-indigo-50 text-indigo-600 border-indigo-100";
      case "LOW":
        return "bg-amber-50 text-amber-600 border-amber-100";
      default:
        return "bg-rose-50 text-rose-600 border-rose-100";
    }
  };

  const isAdmin = creds.role === "ADMIN" || creds.role === "SUPER_ADMIN" || creds.role === "PRINCIPAL";

  if (!isAdmin) {
    return (
      <div className="p-12 text-center text-neutral-400">
        Access Denied: Only school administrators can view AI health telemetry and audited logs.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upper Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core health card */}
        <div className="lg:col-span-2">
          <AntonyAiHealthCard creds={creds} />
        </div>

        {/* Info panel */}
        <div className="bg-white border border-neutral-100 rounded-[2.5rem] p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="font-black text-sm uppercase tracking-tight text-neutral-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 animate-pulse" />
              Safety & Isolation Compliance
            </h4>
            <p className="text-[11px] font-bold text-neutral-400 leading-relaxed">
              Every request is filtered through a layered security sandbox. Prompts are monitored for injection, results redacted for PII, and multi-tenant database isolation is strictly enforced via server-side credentials verification.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-200/55 flex items-center gap-3">
            <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-500 hover:text-indigo-600 transition-colors">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-450 leading-none">Security Keys</p>
              <p className="text-[9px] text-neutral-400 mt-1">Managed server-side with zero exposure</p>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Logs Audit Section */}
      <div className="bg-white border border-neutral-100 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-black text-sm uppercase tracking-tight text-neutral-800">Antony Auditor Log System</h4>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Layered AI Audit Trails</p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadLogs}
            disabled={isLoadingLogs}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 hover:bg-indigo-50 text-neutral-600 hover:text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            Refresh Logs
          </button>
        </div>

        {/* Audited elements */}
        <div className="overflow-x-auto">
          {isLoadingLogs ? (
            <div className="p-12 text-center text-neutral-400 col-span-3 animate-pulse">
              Syncing audit registers...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-neutral-400 italic text-xs">
              No recent AI interaction logs registered in this session.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/50 border-b border-neutral-100 text-[10px] font-black uppercase tracking-wider text-neutral-450">
                  <th className="p-4 pl-6">Role / ID</th>
                  <th className="p-4">Agent Question</th>
                  <th className="p-4">Safeguard Answer</th>
                  <th className="p-4">Confidence</th>
                  <th className="p-4">Latency</th>
                  <th className="p-4 pr-6">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/40 text-xs">
                    <td className="p-4 pl-6 font-bold text-neutral-700">
                      <div>
                        <span className="font-black text-[9px] uppercase bg-neutral-100 px-1.5 py-0.5 rounded mr-1 text-neutral-500">
                          {log.role}
                        </span>
                        {log.userId}
                      </div>
                    </td>
                    <td className="p-4 max-w-xs truncate font-medium text-neutral-500" title={log.query}>
                      {log.query}
                    </td>
                    <td className="p-4 max-w-xs truncate text-neutral-600" title={log.answer}>
                      {log.answer}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${getLogBadgeColor(log.confidenceScore)}`}>
                        {log.confidenceScore}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-[10px] text-neutral-400">
                      {log.responseTimeMs} ms
                    </td>
                    <td className="p-4 pr-6 font-semibold text-neutral-400 text-[10px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
