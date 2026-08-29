import React, { useState, useEffect } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { Bell, Calendar, ChevronRight, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface Notice {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  targetRoles: string[];
}

interface NoticeBoardProps {
  isPublic?: boolean;
}

const NoticeBoard: React.FC<NoticeBoardProps> = ({ isPublic = false }) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = dbService.subscribe('notices', [
      orderBy('createdAt', 'desc'),
      limit(20)
    ], (res) => {
      let filteredNotices = (res || []) as Notice[];
      if (!filteredNotices.length) {
        setNotices([]);
        setLoading(false);
        return;
      }

      if (isPublic) {
        filteredNotices = filteredNotices.filter((n: any) => n.isPublic);
      } else if (user) {
        filteredNotices = filteredNotices.filter((n: any) => 
          n.targetRoles.includes('all') || n.targetRoles.includes((user as any).role)
        );
      }

      // Sort by priority and date
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      filteredNotices.sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setNotices(filteredNotices);
      setLoading(false);
    }, (error) => {
      console.error("Failed to subscribe notices:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isPublic]);

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-rose-50 text-rose-700 border-rose-100 shadow-[0_10px_20px_-10px_rgba(244,63,94,0.2)] hover:shadow-rose-500/20';
      case 'high': return 'bg-amber-50 text-amber-700 border-amber-100 shadow-[0_10px_20px_-10px_rgba(245,158,11,0.2)] hover:shadow-amber-500/20';
      case 'medium': return 'bg-indigo-50 text-indigo-700 border-indigo-100 shadow-[0_10px_20px_-10px_rgba(79,70,229,0.2)] hover:shadow-indigo-500/20';
      default: return 'bg-neutral-50 text-neutral-600 border-neutral-100 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.05)] hover:shadow-neutral-500/10';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical': return <AlertCircle className="w-5 h-5 text-rose-500" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'medium': return <Info className="w-5 h-5 text-indigo-500" />;
      default: return <Bell className="w-5 h-5 text-neutral-400" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-[3rem] p-8 border border-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] animate-pulse h-full">
        <div className="h-8 w-40 bg-neutral-100 rounded-xl mb-8"></div>
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-neutral-50 rounded-3xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-[3rem] border border-white overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)] ${isPublic ? 'h-full' : ''}`}>
      <div className="p-8 border-b border-neutral-50 flex items-center justify-between bg-neutral-50/30">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-xl shadow-rose-200 ring-4 ring-rose-50 group-hover:scale-110 transition-transform">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-neutral-900 uppercase tracking-tight text-lg">Pulse Feedback</h3>
            <p className="text-[10px] text-neutral-400 font-black uppercase tracking-[0.2em] italic leading-none mt-1">Crucial Protocols</p>
          </div>
        </div>
        {!isPublic && (
          <button 
            onClick={() => navigate('/dashboard/notices', { state: { activeTab: 'notices' } })}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-100 hover:bg-rose-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 transition-all shadow-sm group/archive"
          >
            Archive
            <ChevronRight className="w-4 h-4 group-hover/archive:translate-x-1 transition-transform" />
          </button>
        )}
      </div>

      <div className="p-8 space-y-6 overflow-y-auto max-h-[600px] scrollbar-hide">
        {notices.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-4 bg-neutral-50/50 rounded-[2.5rem] border border-dashed border-neutral-200">
            <div className="w-20 h-20 rounded-full bg-white shadow-inner flex items-center justify-center">
              <Bell className="w-10 h-10 text-neutral-200" />
            </div>
            <p className="text-[12px] text-neutral-400 font-black uppercase tracking-[0.3em] italic">No active notices</p>
          </div>
        ) : (
          <AnimatePresence>
            {notices.map((notice, idx) => (
              <motion.div
                key={notice.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className={`group p-6 rounded-[2rem] border transition-all hover:-translate-y-2 cursor-default ${getPriorityStyles(notice.priority)}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-3 bg-white/80 rounded-2xl shadow-sm border border-white/50 backdrop-blur-sm">
                    {getPriorityIcon(notice.priority)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <h4 className="font-black leading-tight text-neutral-900 uppercase text-sm tracking-tight truncate">
                        {notice.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-black bg-white/50 px-3 py-1 rounded-full uppercase tracking-widest border border-white/50">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(notice.createdAt), 'MMM dd')}
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-neutral-700 font-medium line-clamp-4 bg-white/30 p-4 rounded-2xl border border-white/50 shadow-inner">
                      {notice.content}
                    </p>
                    <div className="pt-4 flex items-center justify-end">
                      <button 
                        onClick={() => navigate('/dashboard/notices', { state: { activeTab: 'notices' } })}
                        className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-neutral-900 group-hover:gap-3 transition-all hover:underline"
                      >
                        Read full archive
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
      
      {notices.length > 0 && (
        <div className="p-8 bg-neutral-50/20 border-t border-neutral-100/50">
          <button 
            onClick={() => navigate('/dashboard/notices', { state: { activeTab: 'notices' } })}
            className="w-full py-4 bg-white border border-neutral-100 rounded-2xl text-[12px] font-black text-neutral-900 uppercase tracking-[0.3em] hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-all shadow-sm active:scale-95"
          >
            View Archive Registry
          </button>
        </div>
      )}
    </div>
  );
};

export default NoticeBoard;
