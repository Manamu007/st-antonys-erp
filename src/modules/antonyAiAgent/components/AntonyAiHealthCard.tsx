import React, { useState, useEffect } from 'react';
import { Bot, RefreshCw, Activity, ShieldAlert, Cpu, Heart } from 'lucide-react';
import { AntonyAiHealth } from '../types/antonyAiTypes';
import { antonyAiClient } from '../services/antonyAiClient';
import { toast } from 'sonner';

interface HealthCardProps {
  creds: { userId: string; role: string; schoolId: string; hospitalId?: string };
}

export const AntonyAiHealthCard: React.FC<HealthCardProps> = ({ creds }) => {
  const [health, setHealth] = useState<AntonyAiHealth | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHealthData = async () => {
    setIsRefreshing(true);
    try {
      const data = await antonyAiClient.getHealth(creds);
      setHealth(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load health indicators.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadHealthData();
  }, [creds]);

  const getStatusColor = (stat: string) => {
    switch (stat) {
      case "OPTIMAL":
        return "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-100";
      case "DEGRADED":
        return "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-100";
      case "CRITICAL":
      case "OFFLINE":
        return "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-100";
      default:
        return "bg-neutral-400 text-white";
    }
  };

  if (!health) {
    return (
      <div className="p-8 bg-white border border-neutral-100 rounded-[2.5rem] flex items-center justify-center animate-pulse">
        <Activity className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-100 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-black text-sm uppercase tracking-tight text-neutral-800">Antony Health & Metrics</h4>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">System Monitoring Status</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadHealthData}
          disabled={isRefreshing}
          className="p-2.5 bg-neutral-100 hover:bg-indigo-50 text-neutral-500 hover:text-indigo-600 rounded-xl transition-colors shrink-0 disabled:opacity-50"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Main Badge Card */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-neutral-50 rounded-2xl border border-neutral-100/50 gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black shadow-lg ${getStatusColor(health.status)}`}>
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase text-neutral-400 tracking-wider">Antony Core Status</p>
              <h3 className="font-black text-lg tracking-tight uppercase text-neutral-800">{health.status}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-neutral-400">Last Telemetry Checked</p>
            <p className="text-xs font-bold text-neutral-600">{new Date(health.lastCheckedAt).toLocaleTimeString()}</p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total Queries Today */}
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 text-center space-y-1">
            <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Total Queries Today</p>
            <h3 className="font-black text-2xl text-indigo-600 tracking-tight">{health.totalQueriesToday}</h3>
            <p className="text-[9px] font-bold text-neutral-400">Synchronized</p>
          </div>

          {/* Average response times */}
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 text-center space-y-1">
            <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Avg Latency Speed</p>
            <h3 className="font-black text-2xl text-indigo-600 tracking-tight">{health.averageResponseTimeMs} <span className="text-xs font-bold text-neutral-400">ms</span></h3>
            <p className="text-[9px] font-bold text-neutral-400">From Google server-side</p>
          </div>

          {/* Cooldown limit blocks */}
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 text-center space-y-1">
            <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Violations Blocked</p>
            <h3 className={`font-black text-2xl tracking-tight ${health.rateLimitViolationsToday > 0 ? 'text-rose-500' : 'text-indigo-600'}`}>
              {health.rateLimitViolationsToday}
            </h3>
            <p className="text-[9px] font-bold text-neutral-400">Prompt / Cooldown Guards</p>
          </div>
        </div>

        {/* Database state */}
        <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-xl border border-neutral-100 text-xs">
          <div className="flex items-center gap-2 font-bold text-neutral-550">
            <Activity className="w-4 h-4 text-indigo-500" />
            Database Synchronization state
          </div>
          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded border ${
            health.dbSyncStatus === "CONNECTED"
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
              : 'bg-rose-50 text-rose-600 border-rose-100'
          }`}>
            {health.dbSyncStatus}
          </span>
        </div>
      </div>
    </div>
  );
};
