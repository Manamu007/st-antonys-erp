import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle, ArrowUpRight, Zap, Cloud, Server, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveApiUrl } from '../lib/apiClient';

interface MongoStatusBannerProps {
  onDataRefreshed?: () => void;
  totalStudents?: number;
}

export const MongoStatusBanner: React.FC<MongoStatusBannerProps> = ({ onDataRefreshed, totalStudents = 0 }) => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [inputUri, setInputUri] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(resolveApiUrl('/api/mongodb/status'));
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.warn('[MongoStatusBanner] Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUri.trim()) {
      toast.error('Please enter a valid MongoDB connection URI');
      return;
    }

    try {
      setIsConnecting(true);
      setConnectError(null);
      const res = await fetch('/api/mongodb/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: inputUri.trim() })
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message || 'Connected to MongoDB successfully!');
        setShowConnectModal(false);
        setInputUri('');
        setConnectError(null);
        fetchStatus();
        if (onDataRefreshed) onDataRefreshed();
      } else {
        const err = data.error || 'Failed to connect to MongoDB';
        setConnectError(err);
        toast.error(err);
      }
    } catch (err: any) {
      const msg = 'Connection error: ' + (err?.message || 'Network failure');
      setConnectError(msg);
      toast.error(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncToMongo = async () => {
    try {
      setIsSyncing(true);
      const res = await fetch('/api/mongodb/sync-local', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Synced ${data.totalRecords || 0} records across ${data.syncedCollections?.length || 0} collections into MongoDB!`);
        fetchStatus();
        if (onDataRefreshed) onDataRefreshed();
      } else {
        toast.error(data.error || 'Failed to sync to MongoDB');
      }
    } catch (err: any) {
      toast.error('Sync error: ' + (err?.message || 'Network error'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeedData = async () => {
    try {
      setIsSeeding(true);
      const res = await fetch('/api/mongodb/seed-sample-data', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success("School academic data (students, classes, batches) populated successfully!");
        fetchStatus();
        if (onDataRefreshed) onDataRefreshed();
      } else {
        toast.error(data.error || 'Failed to load school data');
      }
    } catch (err: any) {
      toast.error('Seed error: ' + (err?.message || 'Network error'));
    } finally {
      setIsSeeding(false);
    }
  };

  const isConnected = status?.connected;

  return (
    <>
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-700/60 rounded-2xl p-4 sm:p-5 text-white shadow-md mb-6 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shadow-inner ${
              isConnected 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              <Database className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-black tracking-wide uppercase text-white flex items-center gap-2">
                  Database Source:
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold inline-flex items-center gap-1.5 ${
                    isConnected 
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' 
                      : 'bg-red-950/80 text-red-300 border border-red-500/40'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                    {isConnected ? `MongoDB Live (${status?.database || 'antonyschool_erp'})` : 'MongoDB Disconnected'}
                  </span>
                </h3>
                {status?.latencyMs !== null && status?.latencyMs !== undefined && (
                  <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">
                    ⚡ {status.latencyMs}ms
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-1 flex items-center gap-2 flex-wrap">
                <span>Total MongoDB Students: <strong className="text-white font-mono">{totalStudents}</strong></span>
                <span className="text-neutral-600">•</span>
                <span>
                  {isConnected 
                    ? 'Displaying live documents directly from your MongoDB database.' 
                    : 'Temporary and local data removed. Connect your MongoDB database to view and manage school records.'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-end md:self-center">
            {!isConnected ? (
              <button
                onClick={() => setShowConnectModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-900/30 flex items-center gap-2"
              >
                <Server className="w-3.5 h-3.5" />
                Connect MongoDB
              </button>
            ) : totalStudents === 0 ? (
              <button
                onClick={handleSeedData}
                disabled={isSeeding}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                {isSeeding ? 'Initializing...' : 'Setup School Academic Schema'}
              </button>
            ) : null}

            <button
              onClick={() => {
                fetchStatus();
                if (onDataRefreshed) onDataRefreshed();
              }}
              className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl border border-neutral-700 transition-all text-xs flex items-center justify-center"
              title="Refresh Data and Connection Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Connect MongoDB Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-6 sm:p-7 max-w-xl w-full text-white shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Connect MongoDB Database</h3>
                  <p className="text-xs text-neutral-400">Local MongoDB on VPS or self-hosted database instance</p>
                </div>
              </div>
              <button
                onClick={() => setShowConnectModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300">
                    MongoDB Connection URI
                  </label>
                  <button
                    type="button"
                    onClick={() => setInputUri('mongodb://127.0.0.1:27017/antonyschool_erp')}
                    className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 underline"
                  >
                    Use Local VPS Default
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="mongodb://127.0.0.1:27017/antonyschool_erp"
                  value={inputUri}
                  onChange={(e) => setInputUri(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  autoFocus
                />
              </div>

              <div className="bg-neutral-800/80 border border-neutral-700/80 rounded-xl p-3.5 text-xs text-neutral-300 space-y-1.5">
                <p className="font-bold text-white flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  VPS / Local MongoDB Configuration:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 text-[11px]">
                  <li>Default local connection string: <code>mongodb://127.0.0.1:27017/antonyschool_erp</code></li>
                  <li>Ensure MongoDB service is running on your VPS: <code>sudo systemctl status mongod</code></li>
                  <li>Target Database: <code>antonyschool_erp</code></li>
                  <li>All database operations communicate via native fetch API to <code>/api/maintenance/db-proxy</code>.</li>
                </ul>
              </div>

              {connectError && (
                <div className="p-3.5 bg-rose-950/70 border border-rose-800 rounded-xl text-xs text-rose-300 space-y-1">
                  <p className="font-bold text-rose-200 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    Connection Notice
                  </p>
                  <p className="leading-relaxed text-[11px] text-rose-200/90">{connectError}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConnecting || !inputUri.trim()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow flex items-center gap-2 disabled:opacity-50"
                >
                  <Server className="w-4 h-4" />
                  {isConnecting ? 'Connecting & Verifying...' : 'Connect to MongoDB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default MongoStatusBanner;
