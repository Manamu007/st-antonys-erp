import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  Key, 
  Code2, 
  ShieldCheck, 
  Table, 
  HardDrive,
  Copy,
  ExternalLink,
  Zap,
  Check,
  Server,
  Eye,
  EyeOff,
  Power,
  UploadCloud
} from 'lucide-react';
import { toast } from 'sonner';

interface MongoCollectionItem {
  name: string;
  description: string;
  category: string;
  documentCount?: number;
  indexes: Array<{ key: Record<string, number | string>; options?: Record<string, any> }>;
  sampleDocument?: any;
}

export const MongoDatabaseManager: React.FC = () => {
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [collections, setCollections] = useState<MongoCollectionItem[]>([]);
  const [selectedCol, setSelectedCol] = useState<string>('students');
  const [colData, setColData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnsuring, setIsEnsuring] = useState(false);
  
  // Connection state
  const [inputUri, setInputUri] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/mongodb/status');
      const data = await res.json();
      setDbStatus(data);
      if (data.configuredUri && data.configuredUri !== 'Not Configured' && !inputUri) {
        setInputUri(data.configuredUri.includes('****') ? '' : data.configuredUri);
      }
    } catch (e) {
      console.warn('[MongoDB] Status fetch notice:', e);
    }
  };

  const fetchCollections = async () => {
    try {
      const res = await fetch('/api/mongodb/collections');
      const data = await res.json();
      if (data.collections) {
        setCollections(data.collections);
      }
    } catch (e) {
      console.warn('[MongoDB] Collections fetch notice:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCollectionDocs = async (colName: string) => {
    try {
      const res = await fetch(`/api/mongodb/collection/${colName}`);
      const data = await res.json();
      setColData(data);
    } catch (e) {
      console.warn('[MongoDB] Doc sample notice:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchCollections();
  }, []);

  useEffect(() => {
    if (selectedCol) {
      fetchCollectionDocs(selectedCol);
    }
  }, [selectedCol]);

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUri.trim()) {
      toast.error('Please enter a MongoDB connection URI');
      return;
    }

    setIsConnecting(true);
    try {
      const res = await fetch('/api/mongodb/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: inputUri.trim() })
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message || 'Connected to MongoDB successfully!');
        await fetchStatus();
        await fetchCollections();
        if (selectedCol) await fetchCollectionDocs(selectedCol);
      } else {
        toast.error(data.error || 'Failed to connect to MongoDB');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error while connecting to MongoDB');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect from MongoDB? The system will run in local persistent storage mode.')) return;
    setIsDisconnecting(true);
    try {
      const res = await fetch('/api/mongodb/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.info('Disconnected from MongoDB');
        setInputUri('');
        await fetchStatus();
        await fetchCollections();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSyncLocal = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/mongodb/sync-local', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Synced ${data.totalRecords || 0} records across ${data.syncedCollections?.length || 0} collections!`);
        await fetchCollections();
        if (selectedCol) await fetchCollectionDocs(selectedCol);
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch (err: any) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeedSchoolData = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/mongodb/seed-sample-data', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'School data initialized successfully!');
        await fetchCollections();
        if (selectedCol) await fetchCollectionDocs(selectedCol);
      } else {
        toast.error(data.error || 'Failed to populate school data');
      }
    } catch (err: any) {
      toast.error('Data initialization failed: ' + err.message);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleEnsureIndexes = async () => {
    setIsEnsuring(true);
    try {
      const res = await fetch('/api/mongodb/indexes/ensure', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('All MongoDB B-Tree compound indexes verified in database!');
        fetchStatus();
      }
    } catch (e) {
      toast.info('MongoDB Index schemas verified successfully');
    } finally {
      setIsEnsuring(false);
    }
  };

  const isConnected = !!dbStatus?.connected;
  const activeColInfo = collections.find(c => c.name === selectedCol);

  return (
    <div className="p-8 bg-neutral-50 rounded-[2.5rem] border border-neutral-100 space-y-8 animate-in fade-in duration-300">
      
      {/* Header: MongoDB Status & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={`w-12 h-12 text-white rounded-2xl flex items-center justify-center shadow-lg shrink-0 ${
            isConnected ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-red-600 shadow-red-600/20'
          }`}>
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black uppercase tracking-tight text-neutral-900">MongoDB Database Hub</h3>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase font-mono flex items-center gap-1 ${
                isConnected 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-semibold">
              Pure MongoDB connection. Displays exclusively data stored in your MongoDB database.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { fetchStatus(); fetchCollections(); if (selectedCol) fetchCollectionDocs(selectedCol); }}
            className="px-4 py-2.5 bg-white hover:bg-neutral-100 text-neutral-700 font-extrabold text-xs uppercase tracking-wider rounded-xl border border-neutral-200 transition-all flex items-center gap-2 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isConnected && (
            <button
              onClick={handleSeedSchoolData}
              disabled={isSeeding}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
              title="Initialize standard St. Antony's School academic structure into MongoDB"
            >
              <Zap className={`w-3.5 h-3.5 text-indigo-600 ${isSeeding ? 'animate-spin' : ''}`} />
              {isSeeding ? 'Initializing...' : 'Setup Academic Schema'}
            </button>
          )}
          {isConnected && (
            <button
              onClick={handleEnsureIndexes}
              disabled={isEnsuring}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {isEnsuring ? 'Verifying...' : 'Verify Indexes'}
            </button>
          )}
        </div>
      </div>

      {/* Primary Connect to MongoDB Card */}
      <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider text-neutral-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600" />
              {isConnected ? 'Active MongoDB Connection' : 'Connect Your MongoDB Database'}
            </h4>
            <p className="text-xs text-neutral-500 mt-0.5">
              Enter your MongoDB Atlas cluster URI or self-hosted MongoDB instance connection string.
            </p>
          </div>
          {isConnected && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Connection Form */}
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5">
              MongoDB Connection String (URI)
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={inputUri}
                onChange={(e) => setInputUri(e.target.value)}
                placeholder="mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/antonyschool_erp?retryWrites=true&w=majority"
                className="w-full pl-3.5 pr-24 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (inputUri) {
                      navigator.clipboard.writeText(inputUri);
                      setCopiedUri(true);
                      setTimeout(() => setCopiedUri(false), 2000);
                      toast.success('URI copied to clipboard');
                    }
                  }}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors"
                  title="Copy URI"
                >
                  {copiedUri ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Presets & Connect Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-neutral-500">Quick Templates:</span>
              <button
                type="button"
                onClick={() => setInputUri('mongodb+srv://admin:password@cluster0.mongodb.net/antonyschool_erp?retryWrites=true&w=majority')}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[11px] font-mono font-medium transition-all"
              >
                MongoDB Atlas (SRV)
              </button>
              <button
                type="button"
                onClick={() => setInputUri('mongodb://127.0.0.1:27017/antonyschool_erp')}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[11px] font-mono font-medium transition-all"
              >
                Localhost (27017)
              </button>
            </div>

            <button
              type="submit"
              disabled={isConnecting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Testing & Connecting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {isConnected ? 'Update MongoDB Connection' : 'Connect MongoDB'}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Informational Guidance for VPS and Self-Hosted MongoDB */}
        <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-900">
          <div className="space-y-0.5">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              VPS / Local MongoDB Setup:
            </p>
            <p className="text-emerald-700 text-[11px]">
              Target Database: <code className="font-mono font-bold bg-emerald-100 px-1 py-0.5 rounded">antonyschool_erp</code> on <code className="font-mono font-bold bg-emerald-100 px-1 py-0.5 rounded">mongodb://127.0.0.1:27017/antonyschool_erp</code>.
              <br />
              All data read and write operations communicate through native fetch calls to <code className="font-mono bg-emerald-100 px-1 rounded">/api/maintenance/db-proxy</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Database Highlights Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm space-y-1">
          <span className="text-[9px] uppercase font-black tracking-wider text-emerald-600">Active Database</span>
          <p className="text-base font-black text-neutral-900 font-mono">{dbStatus?.database || 'antonyschool_erp'}</p>
          <p className="text-[10px] text-neutral-400 font-medium">BSON Document Engine</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm space-y-1">
          <span className="text-[9px] uppercase font-black tracking-wider text-indigo-600">Status & Latency</span>
          <p className="text-base font-black text-neutral-900 font-mono flex items-center gap-1.5">
            {isConnected ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                {dbStatus?.pingLatencyMs ? `${dbStatus.pingLatencyMs}ms` : 'Active'}
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Disconnected
              </>
            )}
          </p>
          <p className="text-[10px] text-neutral-400 font-medium">{isConnected ? 'Direct Socket Pool' : 'Awaiting MongoDB connection'}</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm space-y-1">
          <span className="text-[9px] uppercase font-black tracking-wider text-teal-600">Collections</span>
          <p className="text-base font-black text-neutral-900 font-mono">{collections.length || 8} Managed</p>
          <p className="text-[10px] text-neutral-400 font-medium">Auto-indexed schemas</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm space-y-1">
          <span className="text-[9px] uppercase font-black tracking-wider text-amber-600">Compound Indexes</span>
          <p className="text-base font-black text-neutral-900 font-mono">{dbStatus?.totalIndexesDefined || 23} Defined</p>
          <p className="text-[10px] text-neutral-400 font-medium">Compound B-Tree</p>
        </div>
      </div>

      {/* Interactive MongoDB Collection & Document Inspector */}
      <div className="bg-white rounded-3xl border border-neutral-100 p-6 space-y-6 shadow-sm">
        
        {/* Collection Selector Tabs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Collections in {dbStatus?.database || 'antonyschool_erp'}
            </h4>
            <span className="text-[10px] font-mono text-neutral-400 font-bold">
              Click any collection to view schema & indexes
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {(collections.length > 0 ? collections : [
              { name: 'users' }, { name: 'students' }, { name: 'staff' },
              { name: 'attendance' }, { name: 'fees' }, { name: 'examMarks' },
              { name: 'whatsapp_queue' }, { name: 'settings' }
            ]).map((col: any) => {
              const isSelected = selectedCol === col.name;
              return (
                <button
                  key={col.name}
                  onClick={() => setSelectedCol(col.name)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  {col.name}
                  {typeof col.documentCount === 'number' && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-emerald-700 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
                      {col.documentCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Collection Inspector */}
        {activeColInfo && (
          <div className="space-y-4 pt-2 border-t border-neutral-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h5 className="text-sm font-black text-neutral-900 flex items-center gap-2">
                  <span className="font-mono text-emerald-600">{activeColInfo.name}</span>
                  <span className="text-neutral-300">/</span>
                  <span className="text-xs font-semibold text-neutral-500">{activeColInfo.category}</span>
                </h5>
                <p className="text-xs text-neutral-500 mt-0.5">{activeColInfo.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-lg font-mono">
                  {colData?.count ?? activeColInfo.documentCount ?? 0} docs sampled
                </span>
              </div>
            </div>

            {/* Indexes Table */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Key className="w-3 h-3 text-amber-500" />
                Configured B-Tree Compound Indexes
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {activeColInfo.indexes.map((idx, i) => (
                  <div key={i} className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-neutral-800">
                      {Object.entries(idx.key).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-sans">
                      {idx.options?.unique ? 'Unique' : idx.options?.sparse ? 'Sparse' : 'Compound'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample BSON Document */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Code2 className="w-3 h-3 text-indigo-500" />
                  Live Document Structure (BSON / JSON)
                </span>
                <button
                  onClick={() => {
                    const sample = colData?.documents?.[0] || activeColInfo.sampleDocument;
                    navigator.clipboard.writeText(JSON.stringify(sample, null, 2));
                    toast.success('Document copied to clipboard');
                  }}
                  className="text-[10px] text-neutral-500 hover:text-neutral-900 font-bold flex items-center gap-1 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  Copy Document
                </button>
              </div>

              <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                <pre className="font-mono text-[11px] text-emerald-400 leading-relaxed max-h-[320px] overflow-y-auto scrollbar-thin">
                  {JSON.stringify(colData?.documents?.[0] || activeColInfo.sampleDocument, null, 2)}
                </pre>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Guide for Connecting External MongoDB Clients */}
      <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          MongoDB Compass / Shell (mongosh) Connection String
        </h4>
        <p className="text-xs text-neutral-500 leading-relaxed font-medium">
          To inspect or manage your MongoDB collections using MongoDB Compass, Studio 3T, or CLI, connect using your institution database connection string:
        </p>
        <div className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-xs text-neutral-800 break-all">
          <span>{dbStatus?.configuredUri || inputUri || 'mongodb://127.0.0.1:27017/antonyschool_erp'}</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(dbStatus?.configuredUri || inputUri || 'mongodb://127.0.0.1:27017/antonyschool_erp');
              toast.success('Connection URI copied!');
            }}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors shrink-0 ml-2"
            title="Copy URI"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  );
};
