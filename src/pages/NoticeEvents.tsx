import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { orderBy, limit } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Bell, 
  Calendar as CalendarIcon,
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Clock, 
  MapPin,
  Search,
  Filter,
  Edit2,
  Eye,
  EyeOff,
  Users,
  Send,
  AlertCircle,
  Mail,
  Phone,
  ExternalLink,
  ShieldCheck,
  LayoutGrid,
  List
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, isToday } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

// --- NOTICE MANAGEMENT COMPONENTS ---
interface Notice {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  targetRoles: string[];
  isPublic: boolean;
  createdAt: string;
}

const NoticeSection = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const { user, hasPermission, profile, isAdmin, isPrincipal, isVicePrincipal } = useAuth();

  const isCoordinator = profile?.role?.toLowerCase() === 'coordinator';
  const canManageNotices = isAdmin || isPrincipal || isVicePrincipal || isCoordinator || hasPermission('settings_school');

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    targetRoles: ['all'],
    isPublic: false
  });

  const fetchNotices = async () => {
    setLoading(true);
    try {
      const res = await dbService.list('notices', [
        orderBy('createdAt', 'desc'),
        limit(50)
      ]);
      setNotices(res as Notice[]);
    } catch (error) {
      toast.error("Failed to load notices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const noticeData = {
        ...formData,
        authorId: (profile as any)?.uid || (profile as any)?.id,
        updatedAt: new Date().toISOString()
      };

      if (editingNotice) {
        await dbService.update('notices', editingNotice.id, noticeData);
        toast.success("Notice updated successfully");
      } else {
        const customId = (formData.title || '').trim().replace(/\s+/g, '_');
        await dbService.create('notices', customId, {
          ...noticeData,
          createdAt: new Date().toISOString()
        });
        toast.success("Notice published successfully");
      }
      setShowModal(false);
      setEditingNotice(null);
      setFormData({
        title: '',
        content: '',
        priority: 'medium',
        targetRoles: ['all'],
        isPublic: false
      });
      fetchNotices();
    } catch (error) {
      toast.error("Failed to save notice");
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageNotices) return;
    if (!window.confirm("Are you sure you want to delete this notice?")) return;
    try {
      await dbService.delete('notices', id);
      toast.success("Notice deleted");
      fetchNotices();
    } catch (error) {
      toast.error("Failed to delete notice");
    }
  };

  const openEdit = (notice: Notice) => {
    setEditingNotice(notice);
    setFormData({
      title: notice.title,
      content: notice.content,
      priority: notice.priority,
      targetRoles: notice.targetRoles,
      isPublic: notice.isPublic
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-sidebar uppercase tracking-tight">Active Notices</h2>
        {canManageNotices && (
          <button 
            onClick={() => {
              setEditingNotice(null);
              setShowModal(true);
            }}
            className="bg-primary text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-sidebar transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Create New Notice
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center font-bold text-neutral-400">Loading notices...</div>
        ) : notices.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-3xl border border-dashed border-neutral-200 flex flex-col items-center justify-center gap-4">
             <Bell className="w-12 h-12 text-neutral-200" />
             <p className="text-neutral-400 font-bold uppercase tracking-widest">No notices published yet</p>
          </div>
        ) : (
          notices.map(notice => (
            <div key={notice.id} className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm space-y-4 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    notice.priority === 'critical' ? 'bg-red-500 animate-pulse' : 
                    notice.priority === 'high' ? 'bg-orange-500' : 
                    notice.priority === 'medium' ? 'bg-primary' : 'bg-neutral-300'
                  }`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    notice.priority === 'critical' ? 'text-red-500' : 
                    notice.priority === 'high' ? 'text-orange-500' : 
                    notice.priority === 'medium' ? 'text-primary' : 'text-neutral-400'
                  }`}>
                    {notice.priority} Priority
                  </span>
                </div>
                {canManageNotices && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(notice)} className="p-2 hover:bg-neutral-50 rounded-xl text-neutral-400 hover:text-primary transition-all">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(notice.id);
                      }} 
                      className="p-2 hover:bg-rose-50 rounded-xl text-neutral-400 hover:text-rose-600 transition-all relative z-10"
                    >
                      <Trash2 className="w-4 h-4 pointer-events-none" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-sidebar group-hover:text-primary transition-colors uppercase leading-tight">
                  {notice.title}
                </h3>
                <p className="text-sm text-neutral-500 leading-relaxed font-medium line-clamp-3">
                  {notice.content}
                </p>
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-3 border-t border-neutral-50">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 rounded-full text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                  <Clock className="w-3 h-3" />
                  {new Date(notice.createdAt).toLocaleDateString()}
                </div>
                {notice.isPublic && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-full text-[10px] font-black text-green-600 uppercase tracking-widest">
                    <Eye className="w-3 h-3" />
                    Public
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 rounded-full text-[10px] font-black text-primary uppercase tracking-widest">
                  <Users className="w-3 h-3" />
                  {notice.targetRoles.join(', ')}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-sidebar/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={handleSubmit}
            className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
          >
            <div className="p-8 bg-primary text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-6 h-6" />
                <h2 className="text-2xl font-black uppercase tracking-tight">
                  {editingNotice ? 'Edit Notice' : 'New Notice'}
                </h2>
              </div>
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
              >
                ×
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Notice Title</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Annual Sports Meet 2026"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-sidebar transition-all"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value.toUpperCase()})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Content</label>
                <textarea 
                  required
                  placeholder="Describe the announcement in detail..."
                  rows={4}
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-medium text-neutral-600 transition-all resize-none"
                  value={formData.content}
                  onChange={e => setFormData({...formData, content: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Priority</label>
                  <select 
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-sidebar appearance-none"
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value as any})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Visibility</label>
                  <div className="flex items-center gap-4 h-[60px]">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, isPublic: !formData.isPublic})}
                      className={`flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all font-bold ${
                        formData.isPublic ? 'bg-green-50 border-green-200 text-green-600' : 'bg-neutral-50 border-neutral-100 text-neutral-400'
                      }`}
                    >
                      {formData.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      Show on Landing Page
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Target Roles</label>
                <div className="flex flex-wrap gap-2">
                  {['all', 'teacher', 'student', 'parent', 'accountant'].map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        const roles = formData.targetRoles.includes(role) 
                          ? formData.targetRoles.filter(r => r !== role)
                          : [...formData.targetRoles, role];
                        setFormData({...formData, targetRoles: roles.length === 0 ? ['all'] : roles});
                      }}
                      className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                        formData.targetRoles.includes(role) 
                          ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' 
                          : 'bg-white border-neutral-200 text-neutral-400 hover:border-primary/50'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-8 bg-neutral-50 flex items-center justify-end gap-4">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="px-8 py-4 font-black text-xs text-neutral-500 uppercase tracking-widest"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-10 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-sidebar transition-all shadow-xl shadow-primary/20 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {editingNotice ? 'Update Notice' : 'Publish Notice'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// --- CALENDAR COMPONENTS ---
const CalendarSection = () => {
  const { hasPermission } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'event', // 'event', 'holiday', 'exam'
    description: '',
    startTime: '09:00',
    endTime: '10:00',
    location: ''
  });

  useEffect(() => {
    const unsubscribe = dbService.subscribe('calendar_events', [
      limit(500)
    ], (data) => {
      // Sort in memory to avoid timeout/index issues
      const sorted = [...data].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setEvents(sorted);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map((day) => (
          <div key={day} className="text-center font-black text-neutral-400 text-[10px] uppercase tracking-widest py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, 'd');
        const cloneDay = day;
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelected = isSameDay(day, selectedDate);
        const dayEvents = events.filter(e => isSameDay(new Date(e.date), day));
        const hasHoliday = dayEvents.some(e => e.type === 'holiday');
        const hasExam = dayEvents.some(e => e.type === 'exam');

        days.push(
          <div
            key={day.toString()}
            className={`min-h-[120px] p-2 border-r border-b border-neutral-100 transition-all cursor-pointer relative group flex flex-col ${
              !isCurrentMonth ? 'bg-neutral-50/50' : 'bg-white hover:bg-primary/5'
            } ${isSelected ? 'bg-primary/5 ring-2 ring-primary/20 z-10' : ''}`}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`w-8 h-8 flex items-center justify-center rounded-xl text-sm font-bold ${
                isToday(day) ? 'bg-primary text-white shadow-lg shadow-primary/20' : 
                isCurrentMonth ? 'text-sidebar' : 'text-neutral-300'
              }`}>
                {formattedDate}
              </span>
              {hasHoliday && <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm animate-pulse" />}
            </div>
            
            <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar">
              {dayEvents.map((event, index) => (
                <div 
                  key={index}
                  className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tight truncate border ${
                    event.type === 'holiday' 
                      ? 'bg-red-50 text-red-600 border-red-100' 
                      : event.type === 'exam'
                      ? 'bg-amber-50 text-amber-600 border-amber-100'
                      : 'bg-primary/5 text-primary border-primary/20'
                  }`}
                  title={event.title}
                >
                  {event.title}
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return <div className="bg-white border-l border-t border-neutral-100 rounded-3xl overflow-hidden shadow-2xl shadow-sidebar/5">{rows}</div>;
  };

  const deleteEvent = async (id: string) => {
    if (!hasPermission('settings_school')) return;
    if (!window.confirm('Delete this event?')) return;
    try {
      await dbService.delete('calendar_events', id);
      toast.success('Event deleted');
    } catch (e) {
      toast.error('Failed to delete event');
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dbService.add('calendar_events', formData);
      setShowModal(false);
      toast.success('Event created successfully');
    } catch (e) {
      toast.error('Failed to create event');
    }
  };

  const selectedDateEvents = events.filter(e => isSameDay(new Date(e.date), selectedDate));

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-neutral-100 p-1 rounded-xl border border-neutral-200 shadow-sm">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-white rounded-lg transition-all text-neutral-500 hover:text-primary"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-6 flex items-center justify-center font-black text-sidebar min-w-[160px]">
            {format(currentMonth, 'MMMM yyyy')}
          </div>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-white rounded-lg transition-all text-neutral-500 hover:text-primary"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {hasPermission('settings_school') && (
          <button
            onClick={() => {
              setFormData({ ...formData, date: format(selectedDate, 'yyyy-MM-dd') });
              setShowModal(true);
            }}
            className="bg-primary text-white px-6 py-3 rounded-xl font-black flex items-center gap-2 hover:bg-sidebar transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            Add Event
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          {renderDays()}
          {renderCells()}
        </div>

        <div className="space-y-8">
          <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-xl shadow-sidebar/5 space-y-6">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-sidebar uppercase tracking-tight">{format(selectedDate, 'EEEE')}</h3>
              <p className="text-primary font-bold">{format(selectedDate, 'MMMM do, yyyy')}</p>
            </div>

            <div className="space-y-4">
              {selectedDateEvents.length > 0 ? (
                selectedDateEvents.map((event) => (
                  <div 
                    key={event.id} 
                    className={`p-4 rounded-2xl border transition-all relative group ${
                      event.type === 'holiday' 
                        ? 'bg-red-50 border-red-100' 
                        : event.type === 'exam'
                        ? 'bg-amber-50 border-amber-100'
                        : 'bg-neutral-50 border-neutral-100'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`font-black text-sm uppercase tracking-tight ${
                          event.type === 'holiday' ? 'text-red-900' : 
                          event.type === 'exam' ? 'text-amber-900' : 'text-sidebar'
                        }`}>
                          {event.title}
                        </h4>
                        {hasPermission('settings_school') && (
                          <button 
                            onClick={() => deleteEvent(event.id!)}
                            className="p-1 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                          <Clock className="w-3 h-3" />
                          <span>{event.startTime} - {event.endTime}</span>
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                            <MapPin className="w-3 h-3" />
                            <span>{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center space-y-4 bg-neutral-50/50 rounded-3xl border border-dashed border-neutral-200">
                  <CalendarIcon className="w-6 h-6 text-neutral-200 mx-auto" />
                  <p className="text-[10px] font-bold text-neutral-400">No events scheduled</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sidebar/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md relative z-10 shadow-2xl">
            <h2 className="text-2xl font-black text-sidebar mb-6 flex items-center gap-3 uppercase tracking-tight">Create Event</h2>
            <form onSubmit={handleSaveEvent} className="space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">Event Title</label>
                <input required type="text" className="w-full px-5 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary transition-all font-bold" placeholder="e.g. Annual Day" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">Date</label>
                  <input required type="date" className="w-full px-5 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary transition-all font-bold" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">Type</label>
                  <select className="w-full px-5 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary transition-all font-bold" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as any})}>
                    <option value="event">Event</option>
                    <option value="holiday">Holiday</option>
                    <option value="exam">Exam</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-4 rounded-2xl font-black text-neutral-400">Cancel</button>
                <button type="submit" className="flex-1 bg-primary text-white px-6 py-4 rounded-2xl font-black shadow-xl shadow-primary/20">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- ENQUIRY MANAGEMENT COMPONENTS ---
interface Enquiry {
  id: string;
  parentName: string;
  email: string;
  phone: string;
  gradeInterested: string;
  message: string;
  status: 'new' | 'contacted' | 'admitted' | 'rejected';
  createdAt: string;
}

const EnquirySection = () => {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [tours, setTours] = useState<any[]>([]);
  const [newsletters, setNewsletters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'enquiries' | 'tours' | 'newsletter'>('enquiries');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedEnquiry, setSelectedEnquiry] = useState<any | null>(null);

  useEffect(() => {
    const unsubEnquiries = dbService.subscribe('enquiries', [
      orderBy('createdAt', 'desc'),
      limit(50)
    ], (data) => {
      const sorted = (data as Enquiry[]).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setEnquiries(sorted);
    });

    const unsubTours = dbService.subscribe('tours', [
      orderBy('createdAt', 'desc'),
      limit(50)
    ], (data) => {
      const sorted = (data as any[]).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setTours(sorted);
    });

    const unsubNewsletter = dbService.subscribe('newsletter', [
      orderBy('createdAt', 'desc'),
      limit(50)
    ], (data) => {
      const sorted = (data as any[]).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setNewsletters(sorted);
      setLoading(false);
    });

    return () => {
      unsubEnquiries();
      unsubTours();
      unsubNewsletter();
    };
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const collection = activeSubTab === 'enquiries' ? 'enquiries' : 'tours';
      await dbService.update(collection, id, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      if (selectedEnquiry?.id === id) {
        setSelectedEnquiry(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const collection = activeSubTab === 'enquiries' ? 'enquiries' : 'tours';
      await dbService.delete(collection, id);
      toast.success("Item deleted successfully");
      if (selectedEnquiry?.id === id) setSelectedEnquiry(null);
    } catch (error) {
      toast.error("Failed to delete item");
    }
  };

  const currentItems = activeSubTab === 'enquiries' ? enquiries : activeSubTab === 'tours' ? tours : newsletters;

  const filteredItems = currentItems.filter(e => {
    const name = e.parentName || e.email;
    const matchesSearch = 
      (String(name || "")).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (String(e.email || "")).toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.phone?.includes(searchTerm);
    const matchesStatus = activeSubTab === 'newsletter' || statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': 
      case 'pending': return 'bg-blue-100 text-blue-600';
      case 'contacted':
      case 'confirmed': return 'bg-amber-100 text-amber-600';
      case 'admitted':
      case 'completed': return 'bg-green-100 text-green-600';
      case 'rejected':
      case 'cancelled': return 'bg-red-100 text-red-600';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const X_Icon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex gap-1 p-1 bg-neutral-50 border border-neutral-100 rounded-xl">
           <button 
             onClick={() => setActiveSubTab('enquiries')}
             className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'enquiries' ? 'bg-primary text-white shadow-md' : 'text-neutral-400 hover:text-neutral-600'}`}
           >
             Direct Enquiries ({enquiries.length})
           </button>
           <button 
             onClick={() => setActiveSubTab('tours')}
             className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'tours' ? 'bg-primary text-white shadow-md' : 'text-neutral-400 hover:text-neutral-600'}`}
           >
             Tour Requests ({tours.length})
           </button>
           <button 
             onClick={() => setActiveSubTab('newsletter')}
             className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'newsletter' ? 'bg-primary text-white shadow-md' : 'text-neutral-400 hover:text-neutral-600'}`}
           >
             Newsletter ({newsletters.length})
           </button>
        </div>
        
        <div className="flex gap-2 p-1 bg-neutral-50 border border-neutral-100 rounded-xl">
           <button 
             onClick={() => setViewMode('grid')}
             className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}
           >
             <LayoutGrid className="w-4 h-4" />
           </button>
           <button 
             onClick={() => setViewMode('list')}
             className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}
           >
             <List className="w-4 h-4" />
           </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input 
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-6 py-3 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary transition-all font-bold placeholder:text-neutral-400 text-sm"
            />
          </div>
          {activeSubTab !== 'newsletter' && (
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-6 py-3 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-neutral-600 text-sm"
            >
              <option value="all">All Status</option>
              {activeSubTab === 'enquiries' ? (
                <>
                  <option value="new">New Lead</option>
                  <option value="contacted">Contacted</option>
                  <option value="admitted">Admitted</option>
                  <option value="rejected">Rejected</option>
                </>
              ) : (
                <>
                  <option value="pending">Pending Request</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </>
              )}
            </select>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center font-bold text-neutral-400">Loading leads...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-20 text-center space-y-4">
             <Search className="w-12 h-12 text-neutral-100 mx-auto" />
             <p className="text-neutral-400 font-bold uppercase tracking-widest text-xs">No leads matching your criteria</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-50">
                  <th className="px-4 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">{activeSubTab === 'newsletter' ? 'Email' : 'Name'}</th>
                  <th className="px-4 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                    {activeSubTab === 'enquiries' ? 'Contact' : activeSubTab === 'tours' ? 'Schedule' : 'Subscribed On'}
                  </th>
                  {activeSubTab !== 'newsletter' && <th className="px-4 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Status</th>}
                  <th className="px-4 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50 transition-colors group">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] uppercase">
                           {(String(item.parentName || item.email || "")).charAt(0)}
                         </div>
                         <div className="font-bold text-sidebar text-sm">{item.parentName || item.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {activeSubTab === 'enquiries' ? (
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-neutral-600 flex items-center gap-2">
                             <Mail className="w-3 h-3" /> {item.email}
                          </div>
                        </div>
                      ) : activeSubTab === 'tours' ? (
                        <div className="text-[10px] font-black text-sidebar flex items-center gap-2 bg-neutral-100 px-3 py-1 rounded-lg w-fit">
                          <CalendarIcon className="w-3 h-3 text-primary" /> {item.preferredDate}
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold text-neutral-500">
                          {format(new Date(item.createdAt), 'MMM dd, yyyy')}
                        </div>
                      )}
                    </td>
                    {activeSubTab !== 'newsletter' && (
                      <td className="px-4 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end items-center gap-2">
                         <button onClick={() => setSelectedEnquiry(item)} className="p-2 text-primary hover:bg-primary/5 rounded-lg">
                           <ExternalLink className="w-4 h-4" />
                         </button>
                         <button 
                           type="button"
                           onClick={(evt) => {
                             evt.preventDefault();
                             evt.stopPropagation();
                             handleDeleteItem(item.id);
                           }}
                           className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg relative z-10"
                         >
                           <Trash2 className="w-4 h-4 pointer-events-none" />
                         </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((e) => (
              <div key={e.id} className="bg-neutral-50 border border-neutral-100 rounded-3xl p-6 space-y-4 relative group hover:border-primary/30 transition-all shadow-sm">
                <div className="flex justify-between items-start">
                   <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-neutral-100 flex items-center justify-center text-primary font-black uppercase">
                     {(String(e.parentName || e.email || "")).charAt(0)}
                   </div>
                   {activeSubTab !== 'newsletter' && (
                     <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusColor(e.status)}`}>
                        {e.status}
                     </span>
                   )}
                </div>
                
                <div className="space-y-2">
                   <h3 className="text-base font-black text-sidebar tracking-tight truncate">{e.parentName || e.email}</h3>
                   {e.parentName && (
                     <div className="text-[10px] font-bold text-neutral-500 flex items-center gap-2">
                        <Mail className="w-3 h-3 text-neutral-300" /> {e.email}
                     </div>
                   )}
                   {activeSubTab === 'tours' && (
                      <div className="text-[10px] font-black text-primary flex items-center gap-2">
                         <CalendarIcon className="w-3 h-3" /> {e.preferredDate}
                      </div>
                   )}
                   {activeSubTab === 'newsletter' && (
                      <div className="text-[10px] font-bold text-neutral-400">
                         Subscribed: {format(new Date(e.createdAt), 'PP')}
                      </div>
                   )}
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedEnquiry(e)}
                    className="flex-1 py-2 bg-white text-primary border border-primary/10 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm"
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedEnquiry && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedEnquiry(null)} className="absolute inset-0 bg-sidebar/60 backdrop-blur-sm" />
             <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden" >
               <div className="p-8 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-2xl uppercase">
                      {(String(selectedEnquiry.parentName || selectedEnquiry.email || "")).charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-sidebar tracking-tight">{selectedEnquiry.parentName || selectedEnquiry.email}</h3>
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                        {activeSubTab === 'enquiries' ? 'Admission Enquiry' : activeSubTab === 'tours' ? 'Tour Request' : 'Newsletter Subscription'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {activeSubTab !== 'newsletter' && (
                      <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100 text-neutral-600 text-sm italic font-medium leading-relaxed">
                        "{selectedEnquiry.message || 'No additional information provided.'}"
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-neutral-400 uppercase tracking-widest">Email</label>
                        <p className="text-sm font-bold text-sidebar">{selectedEnquiry.email}</p>
                      </div>
                      {selectedEnquiry.phone && (
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-neutral-400 uppercase tracking-widest">Phone</label>
                          <p className="text-sm font-bold text-sidebar">{selectedEnquiry.phone}</p>
                        </div>
                      )}
                      {activeSubTab === 'newsletter' && (
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-neutral-400 uppercase tracking-widest">Subscribed On</label>
                          <p className="text-sm font-bold text-sidebar">{format(new Date(selectedEnquiry.createdAt), 'PPPP')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {activeSubTab !== 'newsletter' && (
                    <div className="space-y-4 pt-6 border-t border-neutral-100">
                      <label className="text-[8px] font-black text-neutral-400 uppercase tracking-widest">Action Board</label>
                      <div className="flex flex-wrap gap-2">
                        {(activeSubTab === 'enquiries' ? ['new', 'contacted', 'admitted', 'rejected'] : ['pending', 'confirmed', 'completed', 'cancelled']).map(status => (
                          <button 
                            key={status}
                            onClick={() => handleUpdateStatus(selectedEnquiry.id, status)}
                            className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
                              selectedEnquiry.status === status ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <a href={`mailto:${selectedEnquiry.email}`} className="flex-1 py-4 bg-sidebar text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3">
                      <Mail className="w-4 h-4" /> Send Email
                    </a>
                    <button onClick={() => setSelectedEnquiry(null)} className="px-8 py-4 bg-neutral-100 text-neutral-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">
                      Close
                    </button>
                  </div>
               </div>
               <button onClick={() => setSelectedEnquiry(null)} className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-black">
                 <X_Icon className="w-5 h-5" />
               </button>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NoticeEvents = () => {
  const { isAdmin, isPrincipal, isVicePrincipal } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'notices' | 'calendar' | 'enquiries'>('notices');

  useEffect(() => {
    if (location.state && (location.state as any).activeTab) {
      setActiveTab((location.state as any).activeTab);
    }
  }, [location]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-neutral-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/20">
            <Bell className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-sidebar uppercase tracking-tight">Notice & Leads</h1>
            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em] mt-1">Institutional Communication Core</p>
          </div>
        </div>

        <div className="flex bg-neutral-100 p-1.5 rounded-[1.5rem] border border-neutral-200">
          <button
            onClick={() => setActiveTab('notices')}
            className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === 'notices' ? 'bg-white text-primary shadow-lg' : 'text-neutral-400 hover:text-sidebar'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Notices
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === 'calendar' ? 'bg-white text-primary shadow-lg' : 'text-neutral-400 hover:text-sidebar'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Calendar
          </button>
          <button
            onClick={() => setActiveTab('enquiries')}
            className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              (isAdmin || isPrincipal || isVicePrincipal) ? 'flex' : 'hidden'
            } ${activeTab === 'enquiries' ? 'bg-white text-primary shadow-lg' : 'text-neutral-400 hover:text-sidebar'}`}
          >
            <Mail className="w-3.5 h-3.5" />
            Admission Leads
          </button>
        </div>
      </div>

      <div className="pt-2">
        {activeTab === 'notices' && <NoticeSection />}
        {activeTab === 'calendar' && <CalendarSection />}
        {activeTab === 'enquiries' && <EnquirySection />}
      </div>
    </div>
  );
};

export default NoticeEvents;
