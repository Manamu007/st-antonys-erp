import React, { useEffect, useState, useMemo } from 'react';
import { 
  Activity, 
  Clock, 
  Map as MapIcon, 
  User as UserIcon,
  ChevronRight,
  Globe,
  Timer,
  X,
  Search,
  Users,
  TrendingUp,
  Sparkles,
  Filter
} from 'lucide-react';
import { normalizeUrl, getGravatarUrl } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';

const UserActivityPanel: React.FC = () => {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      const matchesSearch = 
        (activity.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (activity.userEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (activity.module || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      if (moduleFilter === 'all') return matchesSearch;
      return matchesSearch && (activity.module || '').toLowerCase().includes(moduleFilter.toLowerCase());
    });
  }, [activities, searchQuery, moduleFilter]);

  const moduleStats = useMemo(() => {
    const counts: { [key: string]: number } = { students: 0, staff: 0, fees: 0, exams: 0, other: 0 };
    activities.forEach(a => {
      const m = (a.module || '').toLowerCase();
      if (m.includes('student')) counts.students++;
      else if (m.includes('staff')) counts.staff++;
      else if (m.includes('fee')) counts.fees++;
      else if (m.includes('exam')) counts.exams++;
      else counts.other++;
    });
    return counts;
  }, [activities]);

  const mostActiveUsers = useMemo(() => {
    const userMap = new Map<string, { count: number; name: string; photo: string; email: string }>();
    activities.forEach(a => {
      const key = a.userName || a.userEmail || 'Anonymous';
      const current = userMap.get(key) || { count: 0, name: a.userName || 'Anonymous', photo: a.userPhoto || '', email: a.userEmail || '' };
      current.count++;
      userMap.set(key, current);
    });
    return Array.from(userMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activities]);

  const fetchActivities = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/dashboard/timeline');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.activities)) {
          setActivities(data.activities);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch timeline activities', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, 60000);
    return () => clearInterval(interval);
  }, []);

  const getModuleColor = (path: string) => {
    if (path.includes('students')) return 'bg-blue-50 text-blue-600';
    if (path.includes('staff')) return 'bg-purple-50 text-purple-600';
    if (path.includes('fees')) return 'bg-green-50 text-green-600';
    if (path.includes('exams')) return 'bg-amber-50 text-amber-600';
    return 'bg-neutral-50 text-neutral-600';
  };

  const cleanPath = (path: string) => {
    return path.split('/').filter(Boolean).pop() || 'Dashboard';
  };

  return (
    <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-sidebar uppercase tracking-tight">System Pulse</h3>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Real-time Activity Logs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-green-600 uppercase">Live</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[500px]">
        {loading ? (
          <div className="p-8 text-center text-neutral-400 font-medium">Monitoring activity...</div>
        ) : activities.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="w-12 h-12 text-neutral-100 mx-auto mb-4" />
            <p className="text-neutral-400 font-medium text-sm">No recent activity recorded.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-50">
            <AnimatePresence mode="popLayout">
              {activities.map((activity) => (
                <motion.div 
                  key={activity.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 hover:bg-neutral-50 transition-all flex items-start gap-4 group"
                >
                  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm overflow-hidden">
                    {normalizeUrl(activity.userPhoto) ? (
                      <img src={normalizeUrl(activity.userPhoto)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      activity.userEmail ? (
                        <img src={getGravatarUrl(activity.userEmail)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-5 h-5 text-neutral-400" />
                      )
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-sidebar truncate">{activity.userName || 'Anonymous'}</p>
                      <span className="text-[10px] font-medium text-neutral-400 whitespace-nowrap flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDistanceToNow(new Date(activity.timestamp))} ago
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getModuleColor(activity.module)}`}>
                        {cleanPath(activity.module)}
                      </span>
                      {activity.durationSeconds > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-neutral-400 font-bold">
                          <Timer className="w-3 h-3 text-neutral-300" />
                          {Math.floor(activity.durationSeconds / 60)}m {activity.durationSeconds % 60}s
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-neutral-200" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="p-4 bg-neutral-50 border-t border-neutral-100">
        <button 
          onClick={() => setIsAnalyticsModalOpen(true)}
          className="w-full py-2 bg-white border border-neutral-200 rounded-xl text-[10px] font-bold text-neutral-500 uppercase tracking-widest hover:border-primary hover:text-primary hover:bg-neutral-50 active:scale-[0.98] transition-all"
        >
          View Detailed Analytics
        </button>
      </div>

      {/* Detailed Analytics Modal */}
      <AnimatePresence>
        {isAnalyticsModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-neutral-900/80 backdrop-blur-md" 
              onClick={() => setIsAnalyticsModalOpen(false)}
            />
            
            {/* Modal Body */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-[94vw] xl:max-w-6xl rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col p-6 sm:p-8 md:p-10 border border-neutral-200 h-[85vh] max-h-[90vh] animate-in fade-in-50 duration-300"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6 shrink-0 border-b border-neutral-100 pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="bg-primary/10 p-3 text-primary rounded-2xl">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-sans font-black text-sidebar uppercase tracking-tight text-lg sm:text-xl">System Pulse Analytics</h3>
                    <p className="text-[10px] font-black text-neutral-450 uppercase tracking-widest mt-0.5">Real-time Session and Auditing Console</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAnalyticsModalOpen(false)}
                  className="p-2.5 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Content (Scrollable Grid) */}
              <div className="overflow-y-auto pr-1.5 flex-1 min-h-0 custom-scrollbar pb-2">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Left Section: Stats and Insights (4 cols) */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Activity Breakdown */}
                    <div className="bg-neutral-50/50 p-6 rounded-2xl border border-neutral-150">
                      <div className="flex items-center justify-between mb-5">
                        <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-500" />
                          Activity by Module
                        </h4>
                        <span className="text-[10px] bg-neutral-200 text-neutral-600 font-bold px-2 py-0.5 rounded-full font-mono uppercase">
                          Total: {activities.length}
                        </span>
                      </div>
                      
                      <div className="space-y-4">
                        {[
                          { name: 'Students', count: moduleStats.students, color: 'bg-blue-500' },
                          { name: 'Staff & HR', count: moduleStats.staff, color: 'bg-purple-500' },
                          { name: 'Finance & Fees', count: moduleStats.fees, color: 'bg-emerald-500' },
                          { name: 'Exams & Results', count: moduleStats.exams, color: 'bg-amber-500' },
                          { name: 'Other/General', count: moduleStats.other, color: 'bg-neutral-400' }
                        ].map((stat, idx) => {
                          const percentage = activities.length > 0 ? Math.round((stat.count / activities.length) * 100) : 0;
                          return (
                            <div key={idx} className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold text-neutral-600">
                                <span className="uppercase tracking-tight">{stat.name}</span>
                                <span className="font-mono font-extrabold">{stat.count} ({percentage}%)</span>
                              </div>
                              <div className="w-full h-2.5 bg-neutral-200/50 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${stat.color} rounded-full transition-all duration-500`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Most Active Users */}
                    <div className="bg-neutral-50/50 p-6 rounded-2xl border border-neutral-150">
                      <h4 className="text-xs font-black text-sidebar uppercase tracking-wider mb-5 flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        Most Active Users
                      </h4>
                      
                      <div className="space-y-3.5">
                        {mostActiveUsers.map((user, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl border border-neutral-100 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 border border-neutral-100 overflow-hidden">
                                {normalizeUrl(user.photo) ? (
                                  <img src={normalizeUrl(user.photo)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  user.email ? (
                                    <img src={getGravatarUrl(user.email)} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <UserIcon className="w-4 h-4 text-neutral-400" />
                                  )
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-neutral-800 truncate">{user.name}</p>
                                <p className="text-[10px] text-neutral-400 font-medium truncate">{user.email}</p>
                              </div>
                            </div>
                            <span className="text-xs font-black text-primary bg-primary/5 border border-primary/10 px-2.5 py-1 rounded-lg font-mono">
                              {user.count} logs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Interactive Audit Ledger (7 cols) */}
                  <div className="lg:col-span-7 flex flex-col h-full space-y-4">
                    
                    {/* Filter and Search Bar */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search logs by name, email, module..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full text-xs font-bold pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary text-sidebar"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 bg-neutral-50 border border-neutral-200 rounded-xl px-2">
                        <Filter className="w-3.5 h-3.5 text-neutral-400 ml-1.5" />
                        <select
                          value={moduleFilter}
                          onChange={(e) => setModuleFilter(e.target.value)}
                          className="bg-transparent text-[10px] font-black uppercase tracking-widest text-neutral-600 border-none py-2.5 pl-1.5 pr-6 outline-none cursor-pointer"
                        >
                          <option value="all">All Modules</option>
                          <option value="student">Students</option>
                          <option value="staff">Staff & HR</option>
                          <option value="fee">Finance & Fees</option>
                          <option value="exam">Exams</option>
                        </select>
                      </div>
                    </div>

                    {/* Audited Logs Feed list */}
                    <div className="border border-neutral-150 rounded-2xl overflow-hidden flex-1 flex flex-col bg-neutral-50/20 max-h-[420px] overflow-y-auto">
                      {filteredActivities.length === 0 ? (
                        <div className="p-12 text-center my-auto flex flex-col items-center gap-3">
                          <Globe className="w-10 h-10 text-neutral-250 animate-pulse" />
                          <p className="text-neutral-400 font-bold text-xs uppercase tracking-widest italic">No audited activities match filters</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-neutral-100 bg-white">
                          {filteredActivities.map((activity, idx) => (
                            <div key={idx} className="p-4 hover:bg-neutral-50/50 transition-all flex items-start gap-4">
                              <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 border border-neutral-100 overflow-hidden">
                                {normalizeUrl(activity.userPhoto) ? (
                                  <img src={normalizeUrl(activity.userPhoto)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  activity.userEmail ? (
                                    <img src={getGravatarUrl(activity.userEmail)} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <UserIcon className="w-4 h-4 text-neutral-400" />
                                  )
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-x-2 mb-1">
                                  <p className="text-xs font-black text-sidebar uppercase tracking-tight">{activity.userName || 'Anonymous'}</p>
                                  <span className="text-[9px] font-bold text-neutral-400 font-mono whitespace-nowrap flex items-center gap-1">
                                    <Clock className="w-2 h-2" />
                                    {formatDistanceToNow(new Date(activity.timestamp))} ago
                                  </span>
                                </div>
                                <p className="text-xs font-medium text-neutral-500 italic mb-2">
                                  Accessed {activity.path || 'dashboard'}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${getModuleColor(activity.module)}`}>
                                    {cleanPath(activity.module)}
                                  </span>
                                  {activity.durationSeconds > 0 && (
                                    <span className="flex items-center gap-1 text-[9px] text-neutral-400 font-extrabold font-mono">
                                      <Timer className="w-2.5 h-2.5 text-neutral-300" />
                                      {Math.floor(activity.durationSeconds / 60)}m {activity.durationSeconds % 60}s
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer action */}
              <div className="flex justify-end pt-5 border-t border-neutral-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAnalyticsModalOpen(false)}
                  className="px-6 py-3.5 text-xs font-black uppercase text-neutral-500 hover:bg-neutral-50 rounded-2xl border border-neutral-200 transition-all text-center"
                >
                  Close Console
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserActivityPanel;
