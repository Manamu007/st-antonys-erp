import React, { useState, useEffect, useRef } from 'react';
import { Bell, Calendar, GraduationCap, AlertCircle, Clock, X, Check } from 'lucide-react';
import { dbService, checkQuotaStatus } from '../services/dbService';
import { usePermissions } from '../hooks/usePermissions';
import { format, isAfter, subDays } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { limit, where } from 'firebase/firestore';

interface Notification {
  id: string;
  type: 'notice' | 'holiday' | 'exam' | 'absence' | 'result' | 'event';
  title: string;
  description: string;
  date: string;
  isRead: boolean;
  priority?: 'high' | 'medium' | 'low';
}

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('read_notifications');
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [exams, setExams] = useState<any[]>([]);
  const { profile, isStudent, isParent } = usePermissions();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('read_notifications', JSON.stringify(Array.from(readIds)));
  }, [readIds]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!profile) return;

    // Early exit if quota hit
    const isQuotaHit = typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded_timestamp');
    if (isQuotaHit) return;

    const studentId = isStudent ? profile.uid || profile.id : (isParent ? (profile as any).studentId : null);

    const startSubscriptions = async () => {
      // Fetch exams for lookup - using separate listener that won't trigger re-subscription
      dbService.list('exams', [limit(100)]).then(data => setExams(data)).catch(e => console.error(e));

      if (checkQuotaStatus()) return;

      // 1. Fetch notices with limit
      dbService.list('notices', [limit(30)]).then((data) => {
        const recentNotices = data
          .filter(n => {
             const isRecent = isAfter(new Date(n.date || n.createdAt), subDays(new Date(), 30));
             const role = profile?.role || 'staff';
             const isTargeted = n.targetRoles?.includes('all') || n.targetRoles?.includes(role);
             return isRecent && isTargeted;
          })
          .map(n => ({
            id: n.id,
            type: 'notice' as const,
            title: n.title,
            description: n.content,
            date: n.date || n.createdAt,
            isRead: readIds.has(n.id),
            priority: n.priority
          }));
        updateNotifications('notices', recentNotices);
      }).catch(e => console.error(e));

      // 2. Fetch holidays with limit
      dbService.list('holidays', [limit(30)]).then((data) => {
        const upcomingHolidays = data
          .filter(h => isAfter(new Date(h.date), subDays(new Date(), 1)))
          .map(h => ({
            id: h.id,
            type: 'holiday' as const,
            title: `Holiday: ${h.title}`,
            description: h.description || `School will be closed from ${h.date} ${h.toDate ? 'to ' + h.toDate : ''}`,
            date: h.date,
            isRead: readIds.has(h.id)
          }));
        updateNotifications('holidays', upcomingHolidays);
      }).catch(e => console.error(e));

      // 3. Fetch exams with limit
      dbService.list('exams', [limit(30)]).then((data) => {
          const relevantExams = data
            .filter(e => isAfter(new Date(e.date || e.startDate), subDays(new Date(), 1)))
            .map(e => ({
              id: e.id,
              type: 'exam' as const,
              title: `Upcoming Exam: ${e.title}`,
              description: `Examination period starting from ${e.date || e.startDate}`,
              date: e.date || e.startDate,
              isRead: readIds.has(e.id)
            }));
          updateNotifications('exams', relevantExams);
      }).catch(e => console.error(e));

      // 4. Fetch calendar events with limit
      dbService.list('calendar_events', [limit(30)]).then((data) => {
        const upcomingEvents = data
          .filter(event => isAfter(new Date(event.date), subDays(new Date(), 1)))
          .map(event => ({
            id: event.id,
            type: 'event' as const,
            title: `Event: ${event.title}`,
            description: `${event.description || 'School event'} at ${event.startTime || ''}`,
            date: event.date,
            isRead: readIds.has(event.id)
          }));
        updateNotifications('events', upcomingEvents);
      }).catch(e => console.error(e));

      // Student specific notifications (Absences & Results)
      if (studentId) {
          if (checkQuotaStatus()) return;

          // Fetch attendance specifically for this student with a limit of 30
          dbService.list('attendance', [where('studentId', '==', studentId), limit(30)]).then((data) => {
              const myAbsents = data
                  .filter(a => a.status === 'absent')
                  .filter(a => isAfter(new Date(a.date), subDays(new Date(), 7))) // Only last 7 days
                  .map(a => ({
                      id: a.id,
                      type: 'absence' as const,
                      title: 'Student Absent Alert',
                      description: `You were marked absent on ${format(new Date(a.date), 'MMM dd, yyyy')}. Please provide a leave note if applicable.`,
                      date: a.date,
                      isRead: readIds.has(a.id),
                      priority: 'high' as const
                  }));
              updateNotifications('attendance', myAbsents);
          }).catch(e => console.error(e));

          // Fetch examMarks specifically for this student with a limit of 30
          dbService.list('examMarks', [where('studentId', '==', studentId), limit(30)]).then((data) => {
              const myResults = data
                  .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
                  .slice(0, 10) // Show last 10 subjects updated
                  .map(m => {
                      const subject = m.subjectName || 'Subject';
                      const exam = exams.find(e => e.id === m.examId);
                      const total = (Number(m.st1) || 0) + (Number(m.st2) || 0) + (Number(m.hw) || 0) + (Number(m.faWritten) || 0) + (Number(m.saWritten) || 0);
                      const id = `result_${m.id}`;
                      return {
                          id,
                          type: 'result' as const,
                          title: `New Result: ${subject}`,
                          description: `Marks updated for ${exam?.title || 'Exam'}. Current Score: ${total}`,
                          date: m.updatedAt || new Date().toISOString(),
                          isRead: readIds.has(id)
                      };
                  });
              setNotificationGroups(prev => {
                const next = { ...prev, results: myResults };
                const all = (Object.values(next) as Notification[][]).flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setNotifications(all);
                return next;
              });
          }).catch(e => console.error(e));
      }
    };

    startSubscriptions();

    return () => {};
  }, [profile?.uid, isStudent, isParent]); // Reduced dependencies to prevent loops

  const [notificationGroups, setNotificationGroups] = useState<Record<string, Notification[]>>({});

  const updateNotifications = (group: string, items: Notification[]) => {
    setNotificationGroups(prev => {
      const next = { ...prev, [group]: items };
      const all = (Object.values(next) as Notification[][]).flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setNotifications(all);
      return next;
    });
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'holiday': return <Calendar className="w-4 h-4 text-emerald-500" />;
      case 'exam': return <GraduationCap className="w-4 h-4 text-purple-500" />;
      case 'absence': return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case 'result': return <Check className="w-4 h-4 text-blue-500" />;
      case 'event': return <Calendar className="w-4 h-4 text-amber-500" />;
      default: return <Bell className="w-4 h-4 text-blue-500" />;
    }
  };

  const handleOpen = () => {
    if (!isOpen) {
      const allIds = notifications.map(n => n.id);
      setReadIds(prev => {
        const next = new Set(prev);
        allIds.forEach(id => next.add(id));
        return next;
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={handleOpen}
        className="relative p-3 rounded-2xl bg-white shadow-[0_8px_20px_-6px_rgba(0,0,0,0.15)] hover:shadow-[0_12px_25px_-5px_rgba(0,0,0,0.2)] hover:-translate-y-1 active:scale-95 transition-all group border border-white"
      >
        <Bell className={`w-6 h-6 transition-all ${unreadCount > 0 ? 'text-rose-500 fill-rose-500/20' : 'text-indigo-600'} group-hover:scale-110`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-6 h-6 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute right-0 mt-6 w-80 md:w-[420px] bg-white rounded-[3rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.25)] border border-white overflow-hidden z-[100]"
          >
            <div className="p-8 border-b border-neutral-50 flex items-center justify-between bg-neutral-50/30 backdrop-blur-md">
              <div>
                <h3 className="font-black text-neutral-900 uppercase tracking-tight text-lg">Notifications</h3>
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] leading-none mt-1">{unreadCount} Unread Alerts</p>
              </div>
              <button 
                onClick={() => setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))}
                className="p-3 bg-white hover:bg-emerald-50 rounded-2xl text-neutral-400 hover:text-emerald-600 transition-all shadow-sm border border-neutral-100"
                title="Mark all as read"
              >
                <Check className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[450px] overflow-y-auto custom-scrollbar p-2">
              {notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-neutral-400 gap-3">
                  <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center">
                    <Bell className="w-8 h-8 opacity-20" />
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest animate-pulse">Static Environment</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {notifications.map((notif) => (
                    <div 
                      key={notif.id}
                      onClick={() => {
                        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
                      }}
                      className={`p-4 rounded-2xl flex gap-4 cursor-pointer transition-all ${notif.isRead ? 'opacity-60 grayscale-[0.5] hover:bg-neutral-50' : 'bg-primary/5 hover:bg-primary/10 border-l-4 border-primary shadow-sm'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center shadow-sm border ${notif.isRead ? 'bg-neutral-100 border-neutral-200' : 'bg-white border-primary/20'}`}>
                        {getIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className={`text-sm font-black uppercase tracking-tight truncate ${notif.isRead ? 'text-neutral-500' : 'text-sidebar'}`}>
                            {notif.title}
                          </h4>
                          <span className="text-[10px] font-bold text-neutral-400 shrink-0">
                            {format(new Date(notif.date), 'MMM dd')}
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed line-clamp-2 ${notif.isRead ? 'text-neutral-400' : 'text-neutral-600 font-medium'}`}>
                          {notif.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-4 bg-neutral-50 text-center border-t border-neutral-100">
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    window.location.href = '/dashboard/notice-events';
                  }}
                  className="w-full py-2 bg-white border border-neutral-200 rounded-xl text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] hover:text-primary hover:border-primary transition-all shadow-sm"
                >
                  History Center
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
