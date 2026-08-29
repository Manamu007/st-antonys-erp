import { useState, useEffect, type FC } from 'react';
import { dbService } from '../services/dbService';
import { where, limit } from 'firebase/firestore';
import { 
  Search, 
  Clock, 
  User, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Calendar,
  X,
  Laptop,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '../hooks/usePermissions';

interface AuditLog {
  id: string;
  action: 'add' | 'edit' | 'delete' | 'open';
  collectionName: string;
  docId: string;
  targetProfileName: string;
  operator: {
    uid: string;
    email: string;
    name: string;
  };
  timestamp: string;
  before: any;
  after: any;
}

interface LoginLog {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  timestamp: string;
  userAgent: string;
  type: string;
}

export const AuditTrails: FC = () => {
  const { isAdmin, isPrincipal, isVicePrincipal, isSuperAdmin } = usePermissions();
  const isAllowed = isAdmin || isPrincipal || isVicePrincipal || isSuperAdmin;

  const [activeSubTab, setActiveSubTab] = useState<'audits' | 'modules' | 'logins'>('audits');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Limits for pagination
  const [auditLimit, setAuditLimit] = useState(50);
  const [loginLimit, setLoginLimit] = useState(50);

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'add' | 'edit' | 'delete'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Subscriptions
  useEffect(() => {
    if (!isAllowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let unsubAudits = () => {};
    let unsubLogins = () => {};

    const constraints: any[] = [];
    const oneDay = 1000 * 60 * 60 * 24;
    let sinceDate: Date | null = null;
    if (timeFilter === 'today') {
      sinceDate = new Date(Date.now() - oneDay);
    } else if (timeFilter === 'week') {
      sinceDate = new Date(Date.now() - oneDay * 7);
    } else if (timeFilter === 'month') {
      sinceDate = new Date(Date.now() - oneDay * 30);
    }

    if (sinceDate) {
      constraints.push(where('timestamp', '>=', sinceDate.toISOString()));
    }

    if (activeSubTab === 'audits' || activeSubTab === 'modules') {
      try {
        const fetchConstraints = [...constraints, limit(auditLimit)];
        unsubAudits = dbService.subscribe('audit_logs', fetchConstraints, (data) => {
          setAuditLogs((data as AuditLog[]).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          setLoading(false);
        }, (err) => {
          console.error("Fail fetching audits:", err);
          setLoading(false);
        });
      } catch (e) {
        setLoading(false);
      }
    } else {
      try {
        const fetchConstraints = [...constraints, limit(loginLimit)];
        unsubLogins = dbService.subscribe('login_logs', fetchConstraints, (data) => {
          setLoginLogs((data as LoginLog[]).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          setLoading(false);
        }, (err) => {
          console.error("Fail fetching logins:", err);
          setLoading(false);
        });
      } catch (e) {
        setLoading(false);
      }
    }

    return () => {
      unsubAudits();
      unsubLogins();
    };
  }, [activeSubTab, isAllowed, timeFilter, auditLimit, loginLimit]);

  // General Filter Calculations
  const filterByTime = (itemTime: string) => {
    if (timeFilter === 'all') return true;
    const diffMs = Date.now() - new Date(itemTime).getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    if (timeFilter === 'today') return diffMs <= oneDay;
    if (timeFilter === 'week') return diffMs <= oneDay * 7;
    if (timeFilter === 'month') return diffMs <= oneDay * 30;
    return true;
  };

  const filteredAudits = auditLogs.filter(log => {
    if (log.action === 'open') return false;
    const matchesSearch = 
      log.operator.name.toLowerCase().includes(search.toLowerCase()) ||
      log.operator.email.toLowerCase().includes(search.toLowerCase()) ||
      log.targetProfileName.toLowerCase().includes(search.toLowerCase()) ||
      log.collectionName.toLowerCase().includes(search.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesTime = filterByTime(log.timestamp);

    return matchesSearch && matchesAction && matchesTime;
  });

  const filteredModules = auditLogs.filter(log => {
    if (log.action !== 'open') return false;
    const matchesSearch = 
      (log.operator?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.operator?.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.targetProfileName || '').toLowerCase().includes(search.toLowerCase());

    const matchesTime = filterByTime(log.timestamp);
    return matchesSearch && matchesTime;
  });

  const filteredLogins = loginLogs.filter(log => {
    const matchesSearch = 
      (log.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.role || '').toLowerCase().includes(search.toLowerCase());

    const matchesTime = filterByTime(log.timestamp);
    return matchesSearch && matchesTime;
  });

  // Calculate Difference Helper
  const getDiff = (before: any, after: any) => {
    const diff: { key: string; beforeValue: any; afterValue: any }[] = [];
    const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
    for (const k of keys) {
      if (['createdAt', 'updatedAt', 'id', 'uid', 'preferred_profile_id', 'password'].includes(k)) continue;
      const bVal = before?.[k];
      const aVal = after?.[k];
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        diff.push({ key: k, beforeValue: bVal, afterValue: aVal });
      }
    }
    return diff;
  };

  if (!isAllowed) {
    return (
      <div className="bg-white rounded-[2.5rem] p-12 text-center text-neutral-500 shadow-sm border border-neutral-100 flex flex-col items-center justify-center max-w-xl mx-auto my-12 gap-4">
        <ShieldAlert className="w-16 h-16 text-rose-500" />
        <h3 className="text-xl font-bold text-neutral-850 uppercase tracking-tight">- Access Restricted -</h3>
        <p className="text-sm text-neutral-500 leading-relaxed font-medium">
          You do not possess the required authorization to view audit logs or login history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visual Header card */}
      <div className="bg-gradient-to-r from-primary to-sidebar text-white p-8 rounded-[2.5rem] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-black uppercase tracking-tight">Access & Auditing Command System</h2>
            <p className="text-xs text-white/75 font-semibold uppercase tracking-widest">
              State monitor for operations, modifications, and credential logs
            </p>
          </div>
          <div className="flex bg-white/10 p-1 rounded-2xl border border-white/10 shrink-0">
            <button
              onClick={() => { setActiveSubTab('audits'); setSearch(''); }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeSubTab === 'audits' ? 'bg-white text-primary shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              System Audits
            </button>
            <button
              onClick={() => { setActiveSubTab('modules'); setSearch(''); }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeSubTab === 'modules' ? 'bg-white text-primary shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              Module Visits
            </button>
            <button
              onClick={() => { setActiveSubTab('logins'); setSearch(''); }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeSubTab === 'logins' ? 'bg-white text-primary shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              Login Logs
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Control panel */}
      <div className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder={activeSubTab === 'audits' ? "Search Operator, Target profile..." : "Search Name, Email, Role..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:bg-white focus:outline-primary placeholder-neutral-400 font-medium transition-all"
          />
        </div>

        {/* Quick parameters */}
        <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
          {activeSubTab === 'audits' && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-neutral-400" />
              <select
                value={actionFilter}
                onChange={(e: any) => setActionFilter(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 text-neutral-600 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider focus:outline-none"
              >
                <option value="all">All Actions</option>
                <option value="add">Additions</option>
                <option value="edit">Modifications</option>
                <option value="delete">Deletions</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={timeFilter}
              onChange={(e: any) => setTimeFilter(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 text-neutral-600 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider focus:outline-none"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main logs display area */}
      {loading ? (
        <div className="bg-white p-20 rounded-[2rem] border border-neutral-100 shadow-sm flex flex-col items-center justify-center gap-3">
          <Clock className="w-8 h-8 text-primary animate-spin" />
          <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Loading Access Records...</span>
        </div>
      ) : activeSubTab === 'audits' ? (
        <div className="bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm overflow-hidden">
          {filteredAudits.length === 0 ? (
            <div className="p-20 text-center space-y-2">
              <ShieldAlert className="w-10 h-10 text-neutral-300 mx-auto" />
              <p className="text-xs font-black uppercase tracking-widest text-neutral-400">No matching audit logs found</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredAudits.map((log) => {
                const actionColors = {
                  add: { bg: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100', icon: Plus },
                  edit: { bg: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-100', icon: Edit },
                  delete: { bg: 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-100', icon: Trash2 },
                  open: { bg: 'bg-sky-50 text-sky-600 hover:bg-sky-100 border-sky-100', icon: Eye }
                };
                const config = actionColors[log.action] || actionColors['edit'];
                const ActionIcon = config.icon;

                return (
                  <div key={log.id} className="p-6 hover:bg-neutral-50/50 transition-all flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${config.bg}`}>
                        <ActionIcon className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black uppercase text-sidebar">{log.targetProfileName}</span>
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                            in {log.collectionName}
                          </span>
                        </div>
                        <p className="text-neutral-500 text-[11px] font-medium max-w-lg">
                          Modified by <span className="text-neutral-700 font-bold">{log.operator.name}</span> ({log.operator.email})
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right space-y-0.5 hidden sm:block">
                        <span className="text-[10px] font-bold text-neutral-400 block">
                          {format(new Date(log.timestamp), 'yyyy-MM-dd')}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">
                          {format(new Date(log.timestamp), 'hh:mm:ss a')}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-neutral-600 transition-all flex items-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest decoration-dotted underline hidden sm:inline">Details</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {auditLogs.length >= auditLimit && (
                <div className="p-6 text-center border-t border-neutral-100 bg-neutral-50/50">
                  <button
                    onClick={() => setAuditLimit(prev => prev + 50)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Load More Logs
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : activeSubTab === 'modules' ? (
        <div className="bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm overflow-hidden">
          {filteredModules.length === 0 ? (
            <div className="p-20 text-center space-y-2">
              <Eye className="w-10 h-10 text-neutral-300 mx-auto" />
              <p className="text-xs font-black uppercase tracking-widest text-neutral-400">No screen opens tracked yet</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredModules.map((log) => (
                <div key={log.id} className="p-6 hover:bg-neutral-50/50 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-sky-50 border border-sky-100 rounded-xl flex items-center justify-center shrink-0">
                      <Eye className="w-4 h-4 text-sky-600" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-black uppercase text-sidebar">{log.targetProfileName}</h4>
                        <span className="px-2.5 py-0.5 bg-neutral-100 text-[8px] font-black uppercase tracking-widest text-neutral-500 rounded-full">
                          {log.docId}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 font-medium">
                        Opened by <span className="text-neutral-700 font-bold">{log.operator.name}</span> ({log.operator.email})
                      </p>
                      {log.after?.userAgent && (
                        <div className="flex items-center gap-1.5 text-[9px] text-neutral-400 font-bold uppercase tracking-wider pt-1">
                          <Laptop className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="truncate max-w-sm">{log.after.userAgent}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex sm:flex-col justify-between sm:justify-center items-center sm:items-end gap-1 border-t sm:border-0 border-neutral-100 pt-2 sm:pt-0 shrink-0">
                    <span className="text-[10px] font-bold text-neutral-500 block">
                      {format(new Date(log.timestamp), 'yyyy-MM-dd')}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary block">
                      {format(new Date(log.timestamp), 'hh:mm:ss a')}
                    </span>
                  </div>
                </div>
              ))}
              {auditLogs.length >= auditLimit && (
                <div className="p-6 text-center border-t border-neutral-100 bg-neutral-50/50">
                  <button
                    onClick={() => setAuditLimit(prev => prev + 50)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Load More Screen Opens
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm overflow-hidden">
          {filteredLogins.length === 0 ? (
            <div className="p-20 text-center space-y-2">
              <ShieldAlert className="w-10 h-10 text-neutral-300 mx-auto" />
              <p className="text-xs font-black uppercase tracking-widest text-neutral-400">No login matches found</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredLogins.map((log) => (
                <div key={log.id} className="p-6 hover:bg-neutral-50/50 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-neutral-50 border border-neutral-100 rounded-xl flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-neutral-500" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-black uppercase text-sidebar">{log.name}</h4>
                        <span className="px-2.5 py-0.5 bg-neutral-100 text-[8px] font-black uppercase tracking-widest text-neutral-500 rounded-full">
                          {log.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 font-bold tracking-tight">{log.email}</p>
                      <div className="flex items-center gap-1.5 text-[9px] text-neutral-400 font-bold uppercase tracking-wider pt-1">
                        <Laptop className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-sm">{log.userAgent}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right flex sm:flex-col justify-between sm:justify-center items-center sm:items-end gap-1 border-t sm:border-0 border-neutral-100 pt-2 sm:pt-0 shrink-0">
                    <span className="text-[10px] font-bold text-neutral-500 block">
                      {format(new Date(log.timestamp), 'yyyy-MM-dd')}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary block">
                      {format(new Date(log.timestamp), 'hh:mm:ss a')}
                    </span>
                  </div>
                </div>
              ))}
              {loginLogs.length >= loginLimit && (
                <div className="p-6 text-center border-t border-neutral-100 bg-neutral-50/50">
                  <button
                    onClick={() => setLoginLimit(prev => prev + 50)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Load More Logins
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Changes visualizer Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-100">
            {/* Modal Header */}
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full ${
                  selectedLog.action === 'add' ? 'bg-emerald-100 text-emerald-800' :
                  selectedLog.action === 'edit' ? 'bg-indigo-100 text-indigo-800' :
                  selectedLog.action === 'open' ? 'bg-sky-100 text-sky-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  {selectedLog.action}
                </span>
                <div>
                  <h3 className="text-sm font-black uppercase text-sidebar">Audit Log Detail</h3>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                    Record ID: {selectedLog.docId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-10 h-10 hover:bg-neutral-200 border border-neutral-200 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto space-y-6">
              {/* Operator details information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-50 p-6 rounded-2xl border border-neutral-100 text-xs text-neutral-600">
                <div className="space-y-1.5Packed">
                  <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block">Operator ID</span>
                  <span className="font-bold text-neutral-800 block">{selectedLog.operator.name}</span>
                  <span className="text-neutral-500 text-[10px] block">{selectedLog.operator.email}</span>
                </div>
                <div className="space-y-1.5Packed sm:text-right">
                  <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block">Modification timestamp</span>
                  <span className="font-bold text-neutral-800 block">
                    {format(new Date(selectedLog.timestamp), 'yyyy-MM-dd')}
                  </span>
                  <span className="text-primary text-[10px] font-black uppercase tracking-widest block">
                    {format(new Date(selectedLog.timestamp), 'hh:mm:ss a')} (UTC)
                  </span>
                </div>
              </div>

              {/* State Comparison Diff Visualizer */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400">Profile Change Data Details</h4>
                {selectedLog.action === 'add' ? (
                  <div className="bg-emerald-50/50 border border-emerald-100 p-6 rounded-3xl space-y-3 overflow-x-auto">
                    <span className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Added attributes:</span>
                    <pre className="text-[10px] font-mono text-emerald-800 leading-relaxed font-bold">
                      {JSON.stringify(selectedLog.after, null, 2)}
                    </pre>
                  </div>
                ) : selectedLog.action === 'delete' ? (
                  <div className="bg-rose-50/50 border border-rose-100 p-6 rounded-3xl space-y-3 overflow-x-auto">
                    <span className="text-[9px] font-black uppercase text-rose-600 tracking-widest">Deleted attributes (Snapshot):</span>
                    <pre className="text-[10px] font-mono text-rose-800 leading-relaxed font-bold">
                      {JSON.stringify(selectedLog.before, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {getDiff(selectedLog.before, selectedLog.after).length === 0 ? (
                      <p className="p-4 bg-neutral-50 text-[11px] font-bold text-neutral-400 text-center rounded-xl">
                        No customized attributes changed during merge write
                      </p>
                    ) : (
                      <div className="border border-neutral-100 rounded-3xl overflow-hidden divide-y divide-neutral-100">
                        {getDiff(selectedLog.before, selectedLog.after).map((diff, index) => (
                          <div key={index} className="grid grid-cols-1 md:grid-cols-12 md:items-center gap-4 p-4 hover:bg-neutral-50/50 transition-all text-[11px] font-medium font-mono">
                            {/* Key */}
                            <span className="md:col-span-3 text-neutral-500 font-bold tracking-tight text-xs uppercase font-sans">
                              {diff.key}
                            </span>
                            
                            {/* Left: Before */}
                            <div className="md:col-span-4 bg-rose-50 border border-rose-100 p-2 text-rose-800 rounded-lg truncate flex items-center justify-between">
                              <span className="font-bold">{JSON.stringify(diff.beforeValue) || 'empty'}</span>
                            </div>

                            {/* Arrow Indicator */}
                            <div className="md:col-span-1 flex justify-center text-neutral-400 hidden md:flex">
                              <ArrowRight className="w-4 h-4" />
                            </div>

                            {/* Right: After */}
                            <div className="md:col-span-4 bg-emerald-50 border border-emerald-100 p-2 text-emerald-800 rounded-lg truncate">
                              <span className="font-bold">{JSON.stringify(diff.afterValue) || 'empty'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-neutral-100 bg-neutral-50 text-right">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-6 py-3 bg-white hover:bg-neutral-100 border border-neutral-200 text-sidebar rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
