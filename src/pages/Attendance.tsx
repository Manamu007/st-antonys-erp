import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Filter,
  Download,
  Users as UsersIcon,
  Plus,
  Save,
  FileSpreadsheet,
  Lock,
  Clock,
  FileText,
  MessageSquare,
  CheckSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { isTeacherRole as checkIsTeacherRole, getTeacherAssignments, filterClassesForTeacher, filterBatchesForTeacher, getClassTeacherBatchForTeacher } from '../utils/teacherFilter';
import { getAttendanceInsights } from '../services/aiService';
import { format } from 'date-fns';
import Papa from 'papaparse';
import SmartAttendanceModal from '../components/SmartAttendanceModal';
import StaffAutoAttendanceConfig from '../components/StaffAutoAttendanceConfig';
import { where, limit } from 'firebase/firestore';
import { sortAlphabetically, getPersonDisplayName, getStaffDisplayName, isSyntheticOrMailName, resolveStudentClassAndBatch } from '../lib/utils';
import { normalizeYear } from '../lib/feeUtils';
import { motion } from 'motion/react';

interface StudentAttendancePortalProps {
  profile: any;
  availableProfiles: any[];
  switchProfile: (id: string) => Promise<void>;
}

const StudentAttendancePortal: React.FC<StudentAttendancePortalProps> = ({ profile, availableProfiles, switchProfile }) => {
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');
  const [personalAttendance, setPersonalAttendance] = useState<any[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [holidays, setHolidays] = useState<any[]>([]);
  const { settings } = useSettings();

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const holidayList = await dbService.list('holidays');
        setHolidays(holidayList);
      } catch (e) {
        console.error("Error fetching holidays:", e);
      }
    };
    fetchHolidays();
  }, []);

  const studentProfiles = (availableProfiles || []).filter(p => {
    const r = (p.role || '').toLowerCase().trim().replace(/[-_]/g, '_');
    return r === 'student';
  });

  useEffect(() => {
    if (!profile?.uid && !profile?.id) return;
    const targetIds = Array.from(new Set([
      profile.uid,
      profile.id,
      (profile as any)?.studentId,
      (profile as any)?.uniqueStudentId,
      profile.email,
      (profile as any)?.rollNumber,
      (profile as any)?.admissionNumber
    ].filter(Boolean)));
    setPersonalLoading(true);

    let isSubscribed = true;

    const processRecords = (data: any[]) => {
      if (!isSubscribed) return;
      const filtered = (data || []).filter((a: any) => 
        targetIds.includes(a.studentId) || 
        targetIds.includes(a.userId) || 
        targetIds.includes(a.studentUid) ||
        targetIds.includes(a.applicantId)
      );
      const sorted = filtered.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
      setPersonalAttendance(sorted);
      setPersonalLoading(false);
    };

    const unsub = dbService.subscribe('attendance', [], (data) => {
      if (data && data.length > 0) {
        processRecords(data);
      } else {
        dbService.list('attendance', []).then(processRecords).catch(() => {
          if (isSubscribed) setPersonalLoading(false);
        });
      }
    }, (err) => {
      console.warn("Attendance subscription warning:", err);
      dbService.list('attendance', []).then(processRecords).catch(() => {
        if (isSubscribed) setPersonalLoading(false);
      });
    });

    return () => {
      isSubscribed = false;
      if (unsub) unsub();
    };
  }, [profile?.uid, profile?.id, (profile as any)?.studentId]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  
  const getStudentStatusForDate = (dateStr: string) => {
    const currentYear = settings?.currentAcademicYear || '2026-27';
    const currentYearDetails = settings?.academicYearDetails?.find(y => y.name === currentYear);
    const academicYearStartDate = currentYearDetails?.startDate || `${currentYear.slice(0, 4)}-06-01`;

    if (dateStr < academicYearStartDate) {
      return 'not_started';
    }

    const isHoliday = holidays.find(h => {
      const start = h.date;
      const end = h.toDate || h.date;
      return dateStr >= start && dateStr <= end && h.type !== 'working_day';
    });
    if (isHoliday) {
      return 'holiday';
    }

    const record = personalAttendance.find(a => a.date === dateStr);
    if (record) return record.status;

    if (profile?.status === 'non_attending' || profile?.status === 'non-attending') {
      return 'present';
    }

    return 'absent';
  };

  const todayStatus = getStudentStatusForDate(todayStr);

  const currentYear = settings?.currentAcademicYear || '2026-27';
  const currentYearDetails = settings?.academicYearDetails?.find((y: any) => y.name === currentYear);
  const academicYearStartDate = currentYearDetails?.startDate || `${currentYear.slice(0, 4)}-06-01`;

  const currentYearRecords = personalAttendance.filter(r => {
    if (r.date < academicYearStartDate) return false;
    
    const isHoliday = holidays.find(h => {
      const start = h.date;
      const end = h.toDate || h.date;
      return r.date >= start && r.date <= end && h.type !== 'working_day';
    });
    if (isHoliday) return false;
    
    return true;
  });
  const isNonAttendingStudent = (profile?.status === 'non_attending' || profile?.status === 'non-attending');
  const explicitAbsentCount = currentYearRecords.filter(r => r.status === 'absent').length;
  const presentDaysCount = isNonAttendingStudent
    ? Math.max(0, currentYearRecords.length - explicitAbsentCount)
    : currentYearRecords.filter(r => r.status === 'present').length;
  const absentDaysCount = isNonAttendingStudent
    ? explicitAbsentCount
    : currentYearRecords.filter(r => r.status === 'absent').length;
  
  const totalDays = presentDaysCount + absentDaysCount;
  const attendancePercentage = totalDays > 0 ? Math.round((presentDaysCount / totalDays) * 100) : 100;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-sidebar flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            My Attendance Portal
          </h1>
          <p className="text-sm text-neutral-500">Track and view your attendance status in real-time.</p>
        </div>

        {studentProfiles.length > 1 && (
          <div className="flex flex-col gap-1 w-full md:w-auto">
            <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest leading-none font-mono">Select Active Sibling</span>
            <div className="flex items-center gap-2 p-1 bg-white rounded-2xl border border-neutral-150 shadow-sm flex-wrap w-fit">
              {studentProfiles.map((child) => (
                <button
                  key={child.uid || child.id}
                  onClick={() => switchProfile(child.uid || child.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    (profile.uid || profile.id) === (child.uid || child.id)
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  {child.name?.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-sidebar to-slate-900 p-5 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center font-black text-2xl border border-white/15 shadow-sm">
            {profile?.name?.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-extrabold uppercase tracking-tight flex flex-wrap items-center gap-2">
              {profile?.name}
              {studentProfiles.length > 1 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[9px] font-black uppercase tracking-wider rounded-md animate-pulse">
                  <UsersIcon className="w-3 h-3 text-rose-400" /> Sibling Connected
                </span>
              )}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 font-semibold font-mono mt-0.5">
              <span>CLASS {profile?.class || '---'}</span>
              <span>•</span>
              <span>BATCH {profile?.batch || '---'}</span>
              <span>•</span>
              <span>ROLL NO: {profile?.rollNumber || '---'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4 relative z-10 shrink-0">
          <div className="text-center bg-white/5 px-4 py-2.5 rounded-xl border border-white/10">
            <p className="text-[10px] font-black uppercase text-slate-300 tracking-wider">Present Days</p>
            <p className="text-lg font-black text-emerald-400 font-mono">{presentDaysCount}</p>
          </div>
          <div className="text-center bg-white/5 px-4 py-2.5 rounded-xl border border-white/10">
            <p className="text-[10px] font-black uppercase text-slate-300 tracking-wider">Absent Days</p>
            <p className="text-lg font-black text-rose-400 font-mono">{absentDaysCount}</p>
          </div>
          <div className="text-center bg-white/5 px-4 py-2.5 rounded-xl border border-white/10">
            <p className="text-[10px] font-black uppercase text-slate-300 tracking-wider">Attendance Rate</p>
            <p className="text-lg font-black text-primary font-mono">{attendancePercentage}%</p>
          </div>
        </div>
      </div>

      <div className="flex p-1 bg-neutral-100 rounded-2xl w-fit border border-neutral-150">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-black text-xs uppercase tracking-wider ${
            activeTab === 'today'
              ? 'bg-white text-primary shadow-sm'
              : 'text-neutral-500 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Present Day Attendance
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-black text-xs uppercase tracking-wider ${
            activeTab === 'history'
              ? 'bg-white text-primary shadow-sm'
              : 'text-neutral-500 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          Attendance History
        </button>
      </div>

      {personalLoading ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest font-mono">Syncing attendance records...</p>
        </div>
      ) : (
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'today' ? (
            <div className="max-w-md mx-auto">
              <div className="bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden text-center p-8 space-y-6">
                <div>
                  <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest font-mono">Status for Today</span>
                  <p className="text-sm font-semibold text-neutral-500 mt-1">{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
                </div>

                <div className="flex flex-col items-center justify-center space-y-4">
                  {todayStatus === 'not_started' ? (
                    <>
                      <div className="w-24 h-24 rounded-full bg-neutral-50 border-4 border-neutral-200 flex items-center justify-center text-neutral-400 shadow-md">
                        <Lock className="w-12 h-12" />
                      </div>
                      <div className="space-y-1">
                        <span className="px-4 py-1.5 bg-neutral-150 text-neutral-600 rounded-full text-xs font-bold uppercase tracking-wider">
                          Before Academic Year
                        </span>
                        <p className="text-xs text-neutral-400 font-bold pt-2">No attendance is tracked before academic year start date.</p>
                      </div>
                    </>
                  ) : todayStatus === 'holiday' ? (
                    <>
                      <div className="w-24 h-24 rounded-full bg-amber-50 border-4 border-amber-200 flex items-center justify-center text-amber-500 shadow-md">
                        <Calendar className="w-12 h-12" />
                      </div>
                      <div className="space-y-1">
                        <span className="px-4 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-black uppercase tracking-wider">
                          Holiday / No School
                        </span>
                        <p className="text-xs text-neutral-400 font-medium pt-2">No attendance tracked representation active.</p>
                      </div>
                    </>
                  ) : todayStatus === 'present' ? (
                    <>
                      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-200 flex items-center justify-center text-emerald-500 shadow-md animate-bounce">
                        <CheckCircle2 className="w-12 h-12" />
                      </div>
                      <div className="space-y-1">
                        <span className="px-4 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black uppercase tracking-wider">
                          Present Today
                        </span>
                        <p className="text-xs text-emerald-600 font-bold pt-2">Awesome! Keep up the consistent presence.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-24 h-24 rounded-full bg-rose-50 border-4 border-rose-200 flex items-center justify-center text-rose-500 shadow-md">
                        <XCircle className="w-12 h-12" />
                      </div>
                      <div className="space-y-1">
                        <span className="px-4 py-1.5 bg-rose-100 text-rose-800 rounded-full text-xs font-black uppercase tracking-wider">
                          Absent Today
                        </span>
                        <p className="text-xs text-rose-600 font-bold pt-2">You are marked as absent or pending status sync today.</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t border-neutral-100 pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-150">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono">Reporting Time</p>
                      <p className="text-sm font-extrabold text-sidebar mt-1">08:30 AM</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-150">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono">Smart Sync Status</p>
                      <p className="text-sm font-extrabold text-emerald-600 mt-1 flex items-center justify-center gap-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Realtime
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
                <h3 className="font-extrabold text-xs uppercase tracking-widest text-neutral-500">Academic Attendance Log</h3>
                <span className="text-xs text-neutral-400 font-semibold">Total Dynamic Entries: {currentYearRecords.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-150 text-[10px] uppercase font-black tracking-widest text-neutral-400">
                      <th className="px-6 py-4">Sno</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Day Name</th>
                      <th className="px-6 py-4">Record Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-sm">
                    {currentYearRecords.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-neutral-400 italic">
                          No past attendance logs found for this student.
                        </td>
                      </tr>
                    ) : (
                      currentYearRecords.map((record, index) => {
                        const recDate = new Date(record.date);
                        return (
                          <tr key={index} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-neutral-400">{index + 1}</td>
                            <td className="px-6 py-4 font-mono font-bold text-sidebar">{record.date}</td>
                            <td className="px-6 py-4 font-medium text-neutral-500">{format(recDate, 'EEEE')}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                record.status === 'present'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {record.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

const Attendance: React.FC = () => {
  const { hasPermission, profile, user, isStudent, isParent, availableProfiles, isVicePrincipal, switchProfile, isAdmin } = useAuth();
  const { settings } = useSettings();

  const navigate = useNavigate();
  const [people, setPeople] = useState<any[]>([]);
  const isTeacherRole = profile?.isTeacherPortal === true ||
    profile?.role === 'teacher' ||
    profile?.role === 'teacher_class' ||
    profile?.role === 'teacher_subject' ||
    (!isAdmin && (
      checkIsTeacherRole(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name) ||
      profile?.role === 'staff' ||
      profile?.role === 'coordinator' ||
      profile?.role === 'play_school_incharge' ||
      (profile as any)?.staffType === 'teaching'
    ));
  const isPlaySchoolIncharge = profile?.role === 'play_school_incharge';
  const isVicePrincipalRole = isVicePrincipal || profile?.role === 'vice_principal';

  const isPersonalView = isStudent || isParent || profile?.role === 'student' || profile?.role === 'parent';

  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);
  const [filterClass, setFilterClass] = useState('all');
  const [filterBatch, setFilterBatch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeTab, setActiveTab] = useState<'student' | 'staff' | 'staff_auto' | 'register'>('student');
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [alertsSent, setAlertsSent] = useState(false);
  const [frequentAbsentees, setFrequentAbsentees] = useState<{ id: string, count: number }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const [whatsappStatus, setWhatsappStatus] = useState<'connecting' | 'open' | 'close' | 'qr'>('connecting');

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        if (active && data && data.status) {
          setWhatsappStatus(data.status);
        }
      } catch (e) {
        console.warn("Failed to fetch WhatsApp connection status:", e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // Check every 15s
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const [holidays, setHolidays] = useState<any[]>([]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const holidayList = await dbService.list('holidays');
        setHolidays(holidayList);
      } catch (e) {
        console.error("Error fetching holidays:", e);
      }
    };
    fetchHolidays();
  }, []);

  const checkIsHoliday = (date: Date) => {
    const dStr = format(date, 'yyyy-MM-dd');
    return holidays.find(h => {
      const start = h.date;
      const end = h.toDate || h.date;
      return dStr >= start && dStr <= end;
    });
  };

  const currentHoliday = checkIsHoliday(selectedDate);

  useEffect(() => {
    const fetchFrequentAbsentees = async () => {
      try {
        if (activeTab !== 'student') return;
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = format(thirtyDaysAgo, 'yyyy-MM-dd');
        
        const recentAttendance = await dbService.list('attendance', [
          where('date', '>=', dateStr),
          limit(1000)
        ]);
        
        const counts: Record<string, number> = {};
        recentAttendance.forEach((a: any) => {
           if (a.date >= dateStr && a.status === 'absent') {
             counts[a.studentId] = (counts[a.studentId] || 0) + 1;
           }
        });
        
        const freq = Object.entries(counts)
           .filter(([_, count]) => count >= 2)
           .map(([id, count]) => ({ id, count }))
           .sort((a, b) => b.count - a.count);
        
        setFrequentAbsentees(freq);
      } catch (e) {
        console.error('failed fetching frequent absentees', e);
      }
    };
    fetchFrequentAbsentees();
  }, [activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterClass, filterBatch, filterStatus, activeTab, selectedDate]);

  useEffect(() => {
    if (!hasPermission('attendance_view_all') && activeTab !== 'student' && activeTab !== 'register') {
      setActiveTab('student');
    }
  }, [hasPermission, activeTab]);
  
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  useEffect(() => {
    const fetchMetadata = async () => {
      setLoading(true);
      try {
        const [classList, batchList] = await Promise.all([
          dbService.list('classes', [limit(200)]),
          dbService.list('batches', [limit(300)])
        ]);

        const isPlaySchoolIncharge = profile?.role === 'play_school_incharge';
        let filteredClasses = classList as any[];
        let filteredBatches = batchList as any[];

        if (isTeacherRole) {
          // Strictly resolve the single batch assigned to this teacher as Class Teacher in Academics Batches tab
          const { batch: singleBatch, classItem: singleClass } = getClassTeacherBatchForTeacher(user, profile, batchList as any[], classList as any[]);
          
          if (singleBatch) {
            filteredBatches = [singleBatch];
            if (singleClass) {
              filteredClasses = [singleClass];
            } else {
              const matchedC = (classList as any[]).find(c => c.id === singleBatch.classId);
              filteredClasses = matchedC ? [matchedC] : [{ id: singleBatch.classId, name: singleBatch.className || singleBatch.classId }];
            }
          } else {
            filteredBatches = [];
            filteredClasses = [];
          }
        } else if (isPlaySchoolIncharge) {
          const assignedClassIds = new Set<string>([
            profile?.classId,
            ...(profile as any)?.classIds || []
          ].filter(Boolean));
          const assignedBatchIds = new Set<string>([
            profile?.batchId,
            ...(profile as any)?.batchIds || []
          ].filter(Boolean));

          if (Array.isArray(profile?.subjectAssignments)) {
            profile.subjectAssignments.forEach((assignment: any) => {
              if (assignment.classId) assignedClassIds.add(assignment.classId);
              if (assignment.batchId) assignedBatchIds.add(assignment.batchId);
            });
          }

          batchList.forEach((b: any) => {
            if (b.classTeacherId === profile?.uid) {
              if (b.id) assignedBatchIds.add(b.id);
              if (b.classId) assignedClassIds.add(b.classId);
            }
          });

          // Fallback to nursery/lkg/ukg check if no classes or batches are explicitly assigned
          if (assignedClassIds.size === 0 && assignedBatchIds.size === 0) {
            classList
              .filter((c: any) => c.name && (
                c.name.toLowerCase().includes('nursery') ||
                c.name.toLowerCase().includes('lkg') ||
                c.name.toLowerCase().includes('ukg')
              ))
              .forEach((c: any) => assignedClassIds.add(c.id));

            batchList
              .filter((b: any) => b.classId && assignedClassIds.has(b.classId))
              .forEach((b: any) => assignedBatchIds.add(b.id));
          } else {
            // Ensure any batch's classId is also in assignedClassIds
            batchList.forEach((b: any) => {
              if (b.id && assignedBatchIds.has(b.id) && b.classId) {
                assignedClassIds.add(b.classId);
              }
            });
          }

          filteredClasses = (classList as any[]).filter((c: any) => assignedClassIds.has(c.id));
          filteredBatches = (batchList as any[]).filter((b: any) => assignedBatchIds.has(b.id));
        }

        const finalClasses = sortAlphabetically(filteredClasses, 'name', 'asc');
        const finalBatches = sortAlphabetically(filteredBatches, 'name', 'asc');

        setClasses(finalClasses);
        setBatches(finalBatches);
        
        // If teacher or play school incharge, auto-select their first assigned class/batch
        if (isTeacherRole || isPlaySchoolIncharge) {
          const firstClass = finalClasses[0];
          const firstBatch = finalBatches.find(b => b.classId === firstClass?.id) || finalBatches[0];
          
          if (firstClass?.id) setFilterClass(firstClass.id);
          if (firstBatch?.id) setFilterBatch(firstBatch.id);
        }
      } catch (error) {
        console.error("Fetch metadata error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMetadata();
  }, [profile?.uid, profile?.id, profile?.role, (profile as any)?.classTeacherBatchId, profile?.batchId, user?.email, user?.displayName, isTeacherRole]);

  useEffect(() => {
    const fetchAttendanceData = async () => {
      // Don't fetch all users/attendance if nothing is selected and not admin
      const isPrivileged = hasPermission('attendance_view_all') || hasPermission('attendance_manage') || isTeacherRole;
      const isPersonalView = isStudent || isParent;

      if (!isPrivileged && !isPersonalView && filterClass === 'all' && filterBatch === 'all') {
        return;
      }

      setLoading(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const userConstraints: any[] = [];
        const currentProfileCollection = (activeTab === 'staff' || activeTab === 'staff_auto') ? 'staff' : 'students';
        const currentCollection = (activeTab === 'staff' || activeTab === 'staff_auto') ? 'staff_attendance' : 'attendance';
        const attendanceConstraints: any[] = [where('date', '==', dateStr)];
        const isSearching = !!debouncedSearch.trim();

        if (isPersonalView) {
          const targetIds = isParent 
            ? availableProfiles.filter(p => p.role === 'student').map(p => p.id || p.uid)
            : [profile?.id || profile?.uid].filter(Boolean);
          
          if (targetIds.length > 0) {
            userConstraints.push(where('uid', 'in', targetIds.slice(0, 10)));
            attendanceConstraints.push(where((activeTab === 'staff' || activeTab === 'staff_auto') ? 'userId' : 'studentId', 'in', targetIds.slice(0, 10)));
          } else {
            // Security fallback
            attendanceConstraints.push(where((activeTab === 'staff' || activeTab === 'staff_auto') ? 'userId' : 'studentId', '==', 'NOT_FOUND'));
          }
        } else if (activeTab === 'student' || activeTab === 'register') {
          // Fetch student list without fragile Firestore classId index constraints so all students are resolved accurately client-side
        } else {
          // Staff list - no specific constraints besides active status (handled below)
        }

        const leaveConstraints: any[] = [where('status', '==', 'approved')];
        if (isPersonalView) {
          const targetId = profile?.uid || profile?.id;
          if (targetId) {
            leaveConstraints.push(where('applicantId', '==', targetId));
          }
        }

        const canSendAlerts = !isTeacherRole && hasPermission('attendance_manage') && !isVicePrincipalRole;

        // Formulate compound key for tracking sent alerts: date_classId_batchId
        const alertDocId = `${dateStr}_${filterClass}_${filterBatch}`;

        const [userList, attendanceList, leaveList, alertDocPrimary, alertDocFallback] = await Promise.all([
          dbService.list(currentProfileCollection, [...userConstraints, limit(5000)], true),
          dbService.list(currentCollection, [...attendanceConstraints, limit(5000)], true),
          dbService.list('leaves', [...leaveConstraints, limit(2000)], true),
          canSendAlerts 
            ? dbService.get('attendance_alerts_sent', alertDocId, true).catch(() => null)
            : Promise.resolve(null),
          canSendAlerts && filterClass === 'all' && filterBatch === 'all'
            ? dbService.get('attendance_alerts_sent', dateStr, true).catch(() => null)
            : Promise.resolve(null)
        ]);

        const activeLeaves = (leaveList || []).filter((l: any) => 
          dateStr >= l.startDate && dateStr <= l.endDate
        );

        let cleanedUserList = userList || [];
        if (currentProfileCollection === 'staff') {
          try {
            const rawUsers = await dbService.list('users', [limit(2000)], true).catch(() => []);
            const userMap = new Map<string, any>();
            (rawUsers || []).forEach((u: any) => {
              if (u.id || u.uid) userMap.set(u.id || u.uid, u);
              if (u.email) userMap.set(u.email.toLowerCase().trim(), u);
            });

            cleanedUserList = cleanedUserList.map((s: any) => {
              const u = userMap.get(s.uid || s.id) || (s.email ? userMap.get(s.email.toLowerCase().trim()) : null);
              const staffUid = s.uid || s.id || u?.uid || u?.id;
              if (u) {
                return {
                  ...u,
                  ...s,
                  uid: staffUid,
                  id: staffUid,
                  firstName: s.firstName || u.firstName || '',
                  lastName: s.lastName || u.lastName || u.secondName || '',
                  name: getStaffDisplayName({ ...u, ...s }),
                };
              }
              return {
                ...s,
                uid: staffUid,
                id: staffUid,
                name: getStaffDisplayName(s)
              };
            });
          } catch (err) {
            console.error("Error enriching staff list in attendance:", err);
          }
        } else if (currentProfileCollection === 'students') {
          cleanedUserList = cleanedUserList.map((st: any) => {
            const studentId = st.uid || st.id;
            return {
              ...st,
              uid: studentId,
              id: studentId,
              name: getPersonDisplayName(st, 'Student')
            };
          });
        }

        const seenId = new Set<string>();
        
        const deduplicatedUsers = cleanedUserList.filter((u: any) => {
          const id = u.uid || u.id;
          if (!id) return false;
          
          if (seenId.has(id)) return false;
          seenId.add(id);
          
          if (currentProfileCollection === 'students') {
            // Exclude inactive and dropped students from daily classroom attendance roll
            const stat = String(u.status || '').toLowerCase().trim().replace(/[- ]/g, '_');
            if (
              stat === 'inactive' || 
              stat === 'dropped' || 
              stat === 'tc_issued' || 
              stat === 'withdrawn' || 
              stat === 'left' || 
              u.isActive === false ||
              stat.includes('inactive') ||
              stat.includes('dropped') ||
              stat.includes('tc_issued') ||
              stat.includes('withdrawn')
            ) {
              return false;
            }
          }
          return true;
        });

        setPeople(deduplicatedUsers);
        setAttendance((attendanceList || []) as any[]);
        setLeaves(activeLeaves);
        setAlertsSent(!!alertDocPrimary || !!alertDocFallback);

        // Auto-mark absent/leave for people on leave (silent background sync)
        if (hasPermission('attendance_manage') && activeLeaves.length > 0) {
          const toAutoMark = activeLeaves.filter((l: any) => {
             const existing = (attendanceList || []).find(a => (a.studentId === l.applicantId || a.userId === l.applicantId) && a.date === dateStr);
             return !existing;
          });
          
          if (toAutoMark.length > 0) {
            const creates = toAutoMark.map(l => {
              const isStaff = l.applicantRole !== 'student';
              return {
                id: `att_${l.applicantId}_${dateStr}`,
                data: {
                  [isStaff ? 'userId' : 'studentId']: l.applicantId,
                  date: dateStr,
                  status: isStaff ? 'leave' as const : 'absent' as const,
                  isLeave: true
                }
              };
            });
            await dbService.createBatch(currentCollection, creates);
            // Refresh local attendance state
            const updated = await dbService.list(currentCollection, [where('date', '==', dateStr)], true);
            setAttendance(updated);
          }
        }
      } catch (error) {
        console.error("Fetch data error:", error);
        toast.error("Failed to load attendance data");
      } finally {
        setLoading(false);
      }
    };
    fetchAttendanceData();
  }, [selectedDate, filterClass, filterBatch, activeTab, profile?.uid, debouncedSearch]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const markAttendance = async (studentId: string, status: 'present' | 'absent') => {
    if (!(hasPermission('attendance_manage') || hasPermission('attendance_manage_my') || isTeacherRole) || isVicePrincipalRole) {
      toast.error("You don't have permission to mark attendance");
      return;
    }

    if (currentHoliday && currentHoliday.type && currentHoliday.type !== 'working_day') {
      const confirmMark = window.confirm(`Note: ${format(selectedDate, 'MMM dd')} is ${currentHoliday.title} (${(currentHoliday.type || 'holiday').replace('_', ' ')}). Are you sure you want to mark attendance?`);
      if (!confirmMark) return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const collectionName = (activeTab === 'staff' || activeTab === 'staff_auto') ? 'staff_attendance' : 'attendance';
    const student = people.find(s => s.uid === studentId || s.id === studentId);
    const sid = student?.uid || student?.id || studentId;
    const altSid = student?.id || student?.uid || studentId;

    const existing = attendance.find(a => 
      (a.studentId === sid || a.userId === sid || a.studentId === altSid || a.userId === altSid || a.studentId === studentId || a.userId === studentId) && 
      a.date === dateStr
    );
    
    try {
      let recordId = existing?.id;
      if (existing) {
        // Use set with merge to avoid 'No document to update' error
        await dbService.set(collectionName, existing.id, { 
          status, 
          ...((activeTab === 'staff' || activeTab === 'staff_auto') ? { userId: sid } : { studentId: sid }),
          date: dateStr,
          updatedAt: new Date().toISOString() 
        });
      } else {
        const classId = student?.classId || 'unknown_class';
        recordId = `${dateStr}_${classId}_${sid}`;
        
        const payload = (activeTab === 'staff' || activeTab === 'staff_auto') 
          ? { userId: sid, date: dateStr, status, timestamp: new Date().toISOString() }
          : { studentId: sid, date: dateStr, status, timestamp: new Date().toISOString() };
        await dbService.create(collectionName, recordId, payload);
      }

      // Optimistic state update so UI updates immediately
      const optimisticRecord = {
        id: recordId,
        date: dateStr,
        status,
        ...((activeTab === 'staff' || activeTab === 'staff_auto') ? { userId: sid } : { studentId: sid }),
        timestamp: new Date().toISOString()
      };
      setAttendance(prev => {
        const remaining = prev.filter(a => !(
          (a.studentId === sid || a.userId === sid || a.studentId === altSid || a.userId === altSid || a.studentId === studentId || a.userId === studentId || a.id === recordId) &&
          a.date === dateStr
        ));
        return [...remaining, optimisticRecord];
      });

      toast.success(`Attendance marked as ${status}`);
      
      // Refresh local state for current date in background safely
      try {
        const updated = await dbService.list(collectionName, [where('date', '==', dateStr)], true);
        if (updated && updated.length > 0) {
          setAttendance(prev => {
            const remaining = updated.filter((a: any) => !(
              (a.studentId === sid || a.userId === sid || a.studentId === altSid || a.userId === altSid || a.studentId === studentId || a.userId === studentId || a.id === recordId) &&
              a.date === dateStr
            ));
            return [...remaining, optimisticRecord];
          });
        }
      } catch (refetchErr) {
        console.warn("Background attendance list refetch warning:", refetchErr);
      }
    } catch (error) {
      console.error("Attendance Update Error:", error);
      toast.error("Failed to mark attendance");
    }
  };

  const executeMarkAll = async (status: 'present' | 'absent') => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const collectionName = (activeTab === 'staff' || activeTab === 'staff_auto') ? 'staff_attendance' : 'attendance';
    
    const peopleToMark = sortedPeople.filter(p => {
      const currentStatus = getStatus(p.uid);
      return currentStatus !== 'not_started' && currentStatus !== 'holiday';
    });

    if (peopleToMark.length === 0) {
      toast.error("No eligible students to mark attendance for.");
      return;
    }

    toast.loading(`Marking ${peopleToMark.length} students as ${status}...`, { id: 'mark-all-loading' });

    try {
      const batchItems = peopleToMark.map(p => {
        const sid = p.uid || p.id;
        const altSid = p.id || p.uid;
        const existing = attendance.find(a => 
          (a.studentId === sid || a.userId === sid || a.studentId === altSid || a.userId === altSid || a.studentId === p.uid || a.userId === p.uid) && 
          a.date === dateStr
        );
        
        let customId = existing?.id;
        if (!customId) {
          const classId = p.classId || 'unknown_class';
          customId = `${dateStr}_${classId}_${sid}`;
        }

        const payload = (activeTab === 'staff' || activeTab === 'staff_auto')
          ? { userId: sid, date: dateStr, status, timestamp: new Date().toISOString() }
          : { studentId: sid, date: dateStr, status, timestamp: new Date().toISOString() };

        return {
          id: customId,
          data: payload
        };
      });

      const chunkSize = 400;
      for (let i = 0; i < batchItems.length; i += chunkSize) {
        const chunk = batchItems.slice(i, i + chunkSize);
        await dbService.setBatch(collectionName, chunk);
      }

      // Optimistic state update
      setAttendance(prev => {
        const markedIdSet = new Set(batchItems.map(b => b.id));
        const sidSet = new Set(peopleToMark.flatMap(p => [p.uid, p.id].filter(Boolean)));
        const kept = prev.filter(a => !(a.date === dateStr && (markedIdSet.has(a.id) || sidSet.has(a.studentId) || sidSet.has(a.userId))));
        const newRecords = batchItems.map(b => ({
          id: b.id,
          ...b.data
        }));
        return [...kept, ...newRecords];
      });

      toast.success(`Successfully marked all ${peopleToMark.length} as ${status}!`, { id: 'mark-all-loading' });
      
      try {
        const updated = await dbService.list(collectionName, [where('date', '==', dateStr)], true);
        if (updated && updated.length > 0) {
          setAttendance(prev => {
            const batchMap = new Map<string, any>();
            batchItems.forEach((b: any) => {
              const sid = b.data.studentId || b.data.userId || b.id;
              batchMap.set(`${dateStr}_${sid}`, { id: b.id, ...b.data });
            });
            const merged = updated.map((rec: any) => {
              const sid = rec.studentId || rec.userId || rec.id;
              const batchRecord = batchMap.get(`${rec.date}_${sid}`);
              return batchRecord || rec;
            });
            return merged;
          });
        }
      } catch (err) {
        console.warn("Could not reload attendance after mark all:", err);
      }
    } catch (e) {
      console.error("Failed to mark all attendance:", e);
      toast.error("Failed to mark all attendance", { id: 'mark-all-loading' });
    }
  };

  const handleMarkAllWithConfirm = (status: 'present' | 'absent') => {
    if (sortedPeople.length === 0) {
      toast.info("No matching students to mark.");
      return;
    }

    if (currentHoliday && currentHoliday.type && currentHoliday.type !== 'working_day') {
      const confirmMark = window.confirm(`Note: ${format(selectedDate, 'MMM dd')} is ${currentHoliday.title} (${(currentHoliday.type || 'holiday').replace('_', ' ')}). Are you sure you want to mark attendance?`);
      if (!confirmMark) return;
    }

    setConfirmConfig({
      title: `Mark All ${status === 'present' ? 'Present' : 'Absent'}`,
      message: `Are you sure you want to mark all ${sortedPeople.length} matched students as ${status.toUpperCase()}? This will update their attendance records for ${format(selectedDate, 'MMM dd, yyyy')}.`,
      onConfirm: () => executeMarkAll(status)
    });
  };

  const sendAbsenteeAlerts = async () => {
    if (!hasPermission('whatsapp_send')) {
      toast.error("You don't have permission to send alerts");
      return;
    }
    
    if (alertsSent) {
      toast.error("already sent alerts");
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Ensure all attendance records are synced to server first
    const toSync = filteredPeople.filter(p => {
      const pid = p.uid || p.id;
      const existingRecord = attendance.find(a => (a.studentId === pid || a.userId === pid) && a.date === dateStr);
      return !existingRecord;
    });

    if (toSync.length > 0) {
      toast.loading(`Syncing ${toSync.length} records to server...`, { id: 'sync-records' });
      try {
        const creates = toSync.map(p => {
          const pid = p.uid || p.id;
          return {
            id: `${dateStr}_${p.classId || 'class'}_${pid}`,
            data: {
              studentId: pid,
              date: dateStr,
              status: 'absent' as const,
              timestamp: new Date().toISOString(),
              method: 'auto_sync'
            }
          };
        });
        await dbService.createBatch('attendance', creates);
        // Refresh local attendance state
        const updated = await dbService.list('attendance', [where('date', '==', dateStr)], true);
        setAttendance(updated);
        toast.success(`Synced ${toSync.length} records`, { id: 'sync-records' });
      } catch (e) {
        console.error("Sync error:", e);
        toast.error("Failed to sync records to server", { id: 'sync-records' });
        return;
      }
    }

    const absentees = filteredPeople.filter(p => {
      const pid = p.uid || p.id;
      const status = getStatus(pid);
      const onLeave = isActuallyOnLeave(pid);
      return status === 'absent' && (p.role === 'student' || !p.role || p.role === '') && !onLeave;
    });
    
    if (absentees.length === 0) {
      toast.info("No regular absentees (excluding those on approved leave) to notify.");
      return;
    }

    const executeSending = async () => {
      setSendingAlerts(true);
      toast.loading(`Sending ${absentees.length} alerts...`, { id: 'sending-alerts' });

      try {
        const response = await fetch('/api/attendance/notify-absent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentIds: absentees.map(a => a.uid),
            date: dateStr,
            classId: filterClass,
            batchId: filterBatch
          })
        });

        const result = await response.json();
        if (response.ok && result.success) {
          toast.success(`Sent ${result.success} alerts successfully!`, { id: 'sending-alerts' });
          setAlertsSent(true);
        } else {
          if (result.error === 'already sent alerts') {
            setAlertsSent(true);
          }
          throw new Error(result.error || 'Failed to send alerts');
        }
      } catch (error) {
        toast.error(`Error: ${error instanceof Error ? error.message : 'Failed to send alerts'}`, { id: 'sending-alerts' });
      } finally {
        setSendingAlerts(false);
      }
    };

    setConfirmConfig({
      title: "Send Attendance Alerts",
      message: `Are you sure you want to send automatic WhatsApp absence alerts to parents of ${absentees.length} students?`,
      onConfirm: executeSending
    });
  };

  const handleManualWhatsApp = (person: any) => {
    const displayName = getPersonDisplayName(person);
    const phone = person.whatsappNumber || 
                  person.parentPhone || 
                  person.phone || 
                  person.fatherPhone || 
                  person.contact || 
                  person.mobile || 
                  person.emergencyContact || 
                  person.motherPhone;
    
    if (!phone) {
      toast.error(`No contact phone number found for ${displayName}`);
      return;
    }

    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const schoolName = 'St. Antony’s School';
    
    const message = `*Attendance Alert - ${schoolName}* 🏫\n\nDear Parent,\n\nThis is to inform you that *${displayName}* (Roll No: ${person.rollNumber || 'N/A'}) is marked *ABSENT* today (${dateStr}).\n\nIf you have any queries, please contact the school office.\n\n_This is an automated message._`;

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
    
    window.open(whatsappUrl, '_blank');
  };

  const handleSmartAttendance = async (identifiedIds: string[]) => {
    if (!(hasPermission('attendance_manage') || hasPermission('attendance_manage_my') || isTeacherRole) || isVicePrincipalRole) {
      toast.error("You don't have permission to manage attendance");
      return;
    }

    if (currentHoliday && currentHoliday.type && currentHoliday.type !== 'working_day') {
      const confirmMark = window.confirm(`Note: ${format(selectedDate, 'MMM dd')} is ${currentHoliday.title} (${(currentHoliday.type || 'holiday').replace('_', ' ')}). Are you sure you want to mark attendance?`);
      if (!confirmMark) return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    toast.info(`Marking ${identifiedIds.length} students as present...`);
    
    try {
      const batchUpdates = identifiedIds.map(studentId => {
        const existing = attendance.find(a => a.studentId === studentId && a.date === dateStr);
        if (existing) {
          return { id: existing.id, data: { status: 'present' as const } };
        }
        return { data: { studentId, date: dateStr, status: 'present' as const } };
      });

      // Split into updates and creates
      const toUpdate = batchUpdates.filter(u => u.id);
      const toCreate = batchUpdates.filter(u => !u.id).map(u => u.data);

      if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map(u => dbService.set('attendance', u.id!, u.data)));
      }
      if (toCreate.length > 0) {
        await dbService.createBatch('attendance', toCreate.map(data => {
          const student = people.find(p => p.uid === data.studentId || p.id === data.studentId);
          const cid = student?.classId || 'unknown_class';
          return { 
            id: `${data.date}_${cid}_${data.studentId}`, 
            data 
          };
        }));
      }

      toast.success("Smart attendance processed successfully!");
      // Refresh local state ONLY for current date
      const updated = await dbService.list('attendance', [where('date', '==', dateStr)], true);
      setAttendance(updated);
    } catch (error) {
      console.error("Smart attendance error:", error);
      toast.error("Failed to process smart attendance");
    }
  };

  const getStatus = (personId: string) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Bounds check: start from academic year starting date onwards
    const currentYear = settings?.currentAcademicYear || '2026-27';
    const currentYearDetails = settings?.academicYearDetails?.find((y: any) => y.name === currentYear);
    const academicYearStartDate = currentYearDetails?.startDate || `${currentYear.slice(0, 4)}-06-01`;

    if (dateStr < academicYearStartDate) {
      return 'not_started';
    }

    // Holiday check for non-staff
    if (activeTab !== 'staff') {
      const isHoliday = holidays.find(h => {
        const start = h.date;
        const end = h.toDate || h.date;
        return dateStr >= start && dateStr <= end && h.type !== 'working_day';
      });
      if (isHoliday) {
        return 'holiday';
      }
    }

    // Check if an explicit attendance record exists in database for this date (takes top priority!)
    const student = people.find(p => p.uid === personId || p.id === personId);
    const sid = student?.uid || student?.id || personId;
    const altSid = student?.id || student?.uid || personId;

    const record = attendance.find(a => 
      (a.studentId === sid || a.userId === sid || a.studentId === altSid || a.userId === altSid || a.studentId === personId || a.userId === personId) && 
      a.date === dateStr
    );
    
    if (record) return record.status;

    // Check if person is a non-attending student (defaults to present only when no explicit record exists)
    if (student && (
      student.status === 'non_attending' || 
      student.status === 'non-attending' || 
      student.nonAttending === true || 
      student.isNonAttending === true ||
      String(student.status || '').toLowerCase().replace(/[- ]/g, '_') === 'non_attending'
    )) {
      return 'present';
    }
    
    // Check if on approved leave
    const onLeave = leaves.find(l => l.applicantId === personId || l.applicantId === sid);
    if (onLeave) return 'absent';
    
    return 'absent';
  };

  const isActuallyOnLeave = (personId: string) => {
    const onLeave = leaves.find(l => l.applicantId === personId);
    return !!onLeave;
  };

  const exportAttendanceData = async (range: 'date' | 'month' | 'year') => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const monthStr = format(selectedDate, 'yyyy-MM');
    const yearStr = format(selectedDate, 'yyyy');

    const isStaff = activeTab === 'staff' || activeTab === 'staff_auto';
    const collectionName = isStaff ? 'staff_attendance' : 'attendance';

    let fetchConstraints: any[] = [];
    let filename = `${isStaff ? 'staff_attendance' : 'attendance'}_${dateStr}.csv`;

    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth(); // 0-11
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (range === 'date') {
      fetchConstraints.push(where('date', '==', dateStr));
    } else if (range === 'month') {
      const start = `${monthStr}-01`;
      const end = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
      fetchConstraints.push(where('date', '>=', start), where('date', '<=', end));
      filename = `${isStaff ? 'staff_attendance' : 'attendance'}_month_${monthStr}.csv`;
    } else {
      const start = `${yearStr}-01-01`;
      const end = `${yearStr}-12-31`;
      fetchConstraints.push(where('date', '>=', start), where('date', '<=', end));
      filename = `${isStaff ? 'staff_attendance' : 'attendance'}_year_${yearStr}.csv`;
    }

    toast.loading(`Preparing ${range}-wise export...`, { id: 'exporting' });

    try {
      const rangeAttendance = await dbService.list(collectionName, fetchConstraints);
      
      let csv = '';

      if (isStaff) {
        // Fetch all batch & staff_batch definitions for robust shift/batch resolution
        const [batchDefs, staffBatchDefs] = await Promise.all([
          dbService.list('batches', [limit(500)]).catch(() => []),
          dbService.list('staff_batches', [limit(500)]).catch(() => [])
        ]);
        const allStaffBatches = [...(batchDefs || []), ...(staffBatchDefs || [])];

        const getStaffAssignedBatch = (p: any) => {
          if (!p) return null;
          const targetId = p.batchId || p.staffBatchId || (p.staffBatches && p.staffBatches[0]) || (p.batchIds && p.batchIds[0]);
          if (targetId) {
            const found = allStaffBatches.find((b: any) => b.id === targetId || b.uid === targetId);
            if (found) return found;
          }
          if (p.batch) {
            const found = allStaffBatches.find((b: any) => b.id === p.batch || b.name === p.batch);
            if (found) return found;
          }
          return null;
        };

        const getStaffBatchLabel = (p: any) => {
          const b = getStaffAssignedBatch(p);
          if (b) {
            const start = b.startTime || '09:00';
            const end = b.endTime || '17:00';
            return `${b.name || 'Shift'} (${start} - ${end})`;
          }
          if (p.batch) return String(p.batch);
          return 'General Shift (09:00 - 17:00)';
        };

        const checkIsLateForStaff = (record: any, staffBatch: any) => {
          if (!record) return false;
          if (record.isLate === true || record.status === 'late' || record.late === true) {
            return true;
          }
          if (record.status === 'absent') return false;

          const timeVal = record.timestamp || record.markedAt || record.time || record.checkInTime || record.createdAt;
          if (!timeVal) return false;

          let checkInHour = -1;
          let checkInMin = -1;

          if (typeof timeVal === 'number') {
            const d = new Date(timeVal);
            if (!isNaN(d.getTime())) {
              checkInHour = d.getHours();
              checkInMin = d.getMinutes();
            }
          } else if (typeof timeVal === 'string') {
            const d = new Date(timeVal);
            if (!isNaN(d.getTime())) {
              checkInHour = d.getHours();
              checkInMin = d.getMinutes();
            } else {
              const match12 = timeVal.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
              if (match12) {
                let h = parseInt(match12[1], 10);
                const m = parseInt(match12[2], 10);
                const ampm = match12[3].toUpperCase();
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                checkInHour = h;
                checkInMin = m;
              } else {
                const match24 = timeVal.match(/(\d{1,2}):(\d{2})/);
                if (match24) {
                  checkInHour = parseInt(match24[1], 10);
                  checkInMin = parseInt(match24[2], 10);
                }
              }
            }
          }

          const shiftStartStr = staffBatch?.startTime || '09:00';
          if (checkInHour !== -1 && shiftStartStr) {
            const [sHour, sMin] = shiftStartStr.split(':').map(Number);
            if (!isNaN(sHour) && !isNaN(sMin)) {
              if (checkInHour > sHour || (checkInHour === sHour && checkInMin > sMin)) {
                return true;
              }
            }
          }

          return false;
        };

        if (range === 'month') {
          // Calculate total working days in the month
          let monthWorkingDaysCount = (month === 5) ? 14 : (month === 6 ? 25 : 0);
          if (month !== 5 && month !== 6) {
            for (let d = 1; d <= daysInMonth; d++) {
              const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dObj = new Date(year, month, d);
              if (dObj.getDay() === 0) continue; // Sunday
              if (dObj.getDay() === 6 && d >= 8 && d <= 14) continue; // Second Saturday
              const isAcadHoliday = holidays.some(h => {
                if (h.type === 'working_day') return false;
                const start = h.date;
                const end = h.toDate || h.date;
                return dStr >= start && dStr <= end;
              });
              if (isAcadHoliday) continue;
              if (month === 5 && d < 12) continue; // June reopen rule
              monthWorkingDaysCount++;
            }
          }

          const headers = [
            "S.No",
            "Emp. No",
            "Name of the Staff",
            "Role",
            "Assigned Batch / Shift",
            ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
            "Present",
            "Absent",
            "Late Marks",
            "Attendance %"
          ];

          const rows = sortedPeople.map((person, idx) => {
            const personAttendance = rangeAttendance.filter(a => 
              a.userId === person.uid || a.studentId === person.uid || a.staffId === person.uid || a.uid === person.uid
            );
            
            const staffBatch = getStaffAssignedBatch(person);
            const batchLabel = getStaffBatchLabel(person);

            let presentCount = 0;
            let absentCount = 0;
            let lateCount = 0;
            const dayStatuses = [];

            for (let d = 1; d <= daysInMonth; d++) {
              const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dObj = new Date(year, month, d);
              const isSunday = dObj.getDay() === 0;
              const isSecondSaturday = dObj.getDay() === 6 && d >= 8 && d <= 14;
              
              const isAcadHoliday = holidays.some(h => {
                if (h.type === 'working_day') return false;
                const start = h.date;
                const end = h.toDate || h.date;
                return dStr >= start && dStr <= end;
              });

              const isReopenHoliday = (month === 5 && d < 12);

              const record = personAttendance.find(a => a.date === dStr);

              let cellVal = '';
              if (record) {
                if (record.status === 'present' || record.status === 'late') {
                  const isLate = checkIsLateForStaff(record, staffBatch);

                  if (isLate) {
                    cellVal = 'L';
                    presentCount++;
                    lateCount++;
                  } else {
                    cellVal = 'X';
                    presentCount++;
                  }
                } else if (record.status === 'absent') {
                  cellVal = 'a';
                  absentCount++;
                } else {
                  cellVal = 'X';
                  presentCount++;
                }
              } else {
                if (isSunday) {
                  cellVal = 'S';
                } else if (isSecondSaturday || isAcadHoliday || isReopenHoliday) {
                  cellVal = 'H';
                } else {
                  cellVal = '';
                }
              }
              dayStatuses.push(cellVal);
            }

            const totalWorking = monthWorkingDaysCount || (presentCount + absentCount);
            const pct = totalWorking > 0 ? `${Math.round((presentCount / totalWorking) * 100)}%` : '0%';

            let rawRole = person.role || 'Staff';
            if (rawRole === 'teacher_class') rawRole = 'Teacher (Class)';
            else if (rawRole === 'teacher_subject') rawRole = 'Teacher (Subject)';
            else if (rawRole === 'play_school_incharge') rawRole = 'Play School Incharge';
            else rawRole = rawRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

            return [
              idx + 1,
              person.employeeId || person.empNo || person.staffId || '',
              getStaffDisplayName(person),
              rawRole,
              batchLabel,
              ...dayStatuses,
              presentCount,
              absentCount,
              lateCount,
              pct
            ];
          });

          csv = Papa.unparse({
            fields: headers,
            data: rows
          });
        } else {
          // Staff single date or year CSV export
          const exportData = sortedPeople.map((person, idx) => {
            const personAttendance = rangeAttendance.filter(a => 
              a.userId === person.uid || a.studentId === person.uid || a.staffId === person.uid || a.uid === person.uid
            );
            
            let present = 0;
            let absent = 0;
            let late = 0;
            let statusStr = 'Present';
            let markTimeStr = 'N/A';

            const staffBatch = getStaffAssignedBatch(person);
            const batchLabel = getStaffBatchLabel(person);

            if (range === 'date') {
              const record = personAttendance.find(a => a.date === dateStr);
              if (record) {
                if (record.status === 'absent') {
                  statusStr = 'Absent';
                  absent = 1;
                } else {
                  const isLate = checkIsLateForStaff(record, staffBatch);
                  if (isLate) {
                    statusStr = 'Present (Late)';
                    late = 1;
                  } else {
                    statusStr = 'Present';
                  }
                  present = 1;
                }
                const timeVal = record.timestamp || record.time || record.markedAt || record.createdAt;
                if (timeVal) {
                  try {
                    markTimeStr = typeof timeVal === 'string' && (timeVal.includes('AM') || timeVal.includes('PM'))
                      ? timeVal
                      : format(new Date(timeVal), 'hh:mm a');
                  } catch (e) {
                    markTimeStr = String(timeVal);
                  }
                }
              } else {
                statusStr = 'Present';
                present = 1;
              }
            } else {
              present = personAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
              absent = personAttendance.filter(a => a.status === 'absent').length;
              late = personAttendance.filter(a => checkIsLateForStaff(a, staffBatch)).length;

              if (personAttendance.length === 0) {
                present = 1;
                absent = 0;
                statusStr = 'Present';
              } else {
                statusStr = absent === 0 ? 'Present' : (present === 0 ? 'Absent' : 'Partial');
              }
            }

            const totalWorking = present + absent;
            const pct = totalWorking > 0 ? `${Math.round((present / totalWorking) * 100)}%` : '100%';

            let rawRole = person.role || 'Staff';
            if (rawRole === 'teacher_class') rawRole = 'Teacher (Class)';
            else if (rawRole === 'teacher_subject') rawRole = 'Teacher (Subject)';
            else if (rawRole === 'play_school_incharge') rawRole = 'Play School Incharge';
            else rawRole = rawRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

            return {
              'S.No': idx + 1,
              'Emp. No': person.employeeId || person.empNo || person.staffId || '',
              'Name of the Staff': getStaffDisplayName(person),
              'Role': rawRole,
              'Assigned Batch / Shift': batchLabel,
              'Status': statusStr,
              'Attend Mark Time': markTimeStr,
              'Late Marks': late,
              'Present': present,
              'Absent': absent,
              'Attendance %': pct
            };
          });

          csv = Papa.unparse(exportData);
        }
      } else if (range === 'month') {
        const headers = ["S.No", "Admission No", "Student Name", "Father Name", ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), "Total Day Present", "Total Day Absent", "Attendance Percentage"];
        const rows = sortedPeople.map((person, idx) => {
          const personAttendance = rangeAttendance.filter(a => 
            a.studentId === person.uid || a.userId === person.uid || a.uid === person.uid || a.studentId === person.id || a.userId === person.id
          );
          
          let presentCount = 0;
          let absentCount = 0;
          const dayStatuses = [];

          const isNonAttending = person.status === 'non_attending' || person.status === 'non-attending';

          for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dObj = new Date(year, month, d);
            const isSunday = dObj.getDay() === 0;
            const isSecondSaturday = dObj.getDay() === 6 && d >= 8 && d <= 14;
            
            const isAcadHoliday = holidays.some(h => {
              if (h.type === 'working_day') return false;
              const start = h.date;
              const end = h.toDate || h.date;
              return dStr >= start && dStr <= end;
            });

            // Reopen rules: June before 12th is holiday
            const isReopenHoliday = (month === 5 && d < 12);

            const record = personAttendance.find(a => a.date === dStr);

            let cellVal = '';
            if (isSunday) {
              cellVal = 'S';
            } else if (isSecondSaturday || isAcadHoliday || isReopenHoliday) {
              cellVal = 'H';
            } else if (record) {
              if (record.status === 'present' || record.status === 'late') {
                cellVal = 'X';
                presentCount++;
              } else if (record.status === 'absent') {
                cellVal = 'a';
                absentCount++;
              }
            } else if (isNonAttending) {
              cellVal = 'X';
              presentCount++;
            } else {
              cellVal = 'a';
              absentCount++;
            }
            dayStatuses.push(cellVal);
          }

          const totalWorking = presentCount + absentCount;
          const percentage = totalWorking > 0 ? `${Math.round((presentCount / totalWorking) * 100)}%` : '0%';

          return [
            idx + 1,
            person.admissionNumber || person.rollNumber || '',
            getPersonDisplayName(person),
            person.fatherName || person.parentName || 'N/A',
            ...dayStatuses,
            presentCount,
            absentCount,
            percentage
          ];
        });

        csv = Papa.unparse({
          fields: headers,
          data: rows
        });
      } else {
        const exportData = sortedPeople.map((person, idx) => {
          const personAttendance = rangeAttendance.filter(a => 
            a.studentId === person.uid || a.userId === person.uid || a.uid === person.uid || a.studentId === person.id || a.userId === person.id
          );
          
          let present = 0;
          let absent = 0;
          let statusStr = 'Present';
          let markTimeStr = 'N/A';
          const isNonAttending = person.status === 'non_attending' || person.status === 'non-attending';
          
          if (range === 'date') {
            const record = personAttendance.find(a => a.date === dateStr);
            if (record) {
              if (record.status === 'absent') {
                statusStr = 'Absent';
                absent = 1;
              } else {
                statusStr = record.status === 'late' ? 'Present (Late)' : 'Present';
                present = 1;
              }
              const timeVal = record.timestamp || record.time || record.markedAt || record.createdAt;
              if (timeVal) {
                try {
                  markTimeStr = typeof timeVal === 'string' && (timeVal.includes('AM') || timeVal.includes('PM'))
                    ? timeVal
                    : format(new Date(timeVal), 'hh:mm a');
                } catch (e) {
                  markTimeStr = String(timeVal);
                }
              }
            } else {
              if (isNonAttending) {
                statusStr = 'Present';
                present = 1;
              } else {
                const isAcadHoliday = holidays.some(h => {
                  if (h.type === 'working_day') return false;
                  const start = h.date;
                  const end = h.toDate || h.date;
                  return dateStr >= start && dateStr <= end;
                });
                if (isAcadHoliday) {
                  statusStr = 'Holiday';
                  present = 0;
                  absent = 0;
                } else {
                  statusStr = 'Absent';
                  absent = 1;
                }
              }
            }
          } else {
            present = personAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
            absent = personAttendance.filter(a => a.status === 'absent').length;

            if (personAttendance.length === 0) {
              if (isNonAttending) {
                present = 1;
                absent = 0;
                statusStr = 'Present';
              } else {
                statusStr = 'No Records';
              }
            } else {
              statusStr = absent === 0 ? 'Present' : (present === 0 ? 'Absent' : 'Partial');
            }
          }

          const totalWorking = present + absent;
          const pct = totalWorking > 0 ? `${Math.round((present / totalWorking) * 100)}%` : (present > 0 ? '100%' : '0%');
          const clsObj = classes.find(c => c.id === person.classId || c.name === person.class);
          const batchObj = batches.find(b => b.id === person.batchId || b.name === person.batch);

            if (range === 'date') {
            return {
              'S.No': idx + 1,
              'Admission No': person.admissionNumber || person.rollNumber || '',
              'Roll No': person.rollNumber || '',
              'Student Name': getPersonDisplayName(person),
              'Father Name': person.fatherName || person.parentName || 'N/A',
              'Class': clsObj?.name || person.class || 'N/A',
              'Section / Batch': batchObj?.name || person.batch || 'N/A',
              'Status': statusStr,
              'Attend Mark Time': markTimeStr,
              'Present': present,
              'Absent': absent,
              'Attendance %': pct
            };
          } else {
            return {
              'S.No': idx + 1,
              'Admission No': person.admissionNumber || person.rollNumber || '',
              'Roll No': person.rollNumber || '',
              'Student Name': getPersonDisplayName(person),
              'Father Name': person.fatherName || person.parentName || 'N/A',
              'Class': clsObj?.name || person.class || 'N/A',
              'Section / Batch': batchObj?.name || person.batch || 'N/A',
              'Status Summary': statusStr,
              'Total Working Days': totalWorking,
              'Present Days': present,
              'Absent Days': absent,
              'Attendance %': pct
            };
          }
        });

        csv = Papa.unparse(exportData);
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`${(String(activeTab || "")).charAt(0).toUpperCase() + activeTab.slice(1)} attendance exported`, { id: 'exporting' });
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export attendance data", { id: 'exporting' });
    }
  };

  const exportAttendanceA4PDF = async (range: 'date' | 'month' | 'year') => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const monthStr = format(selectedDate, 'yyyy-MM');
    const yearStr = format(selectedDate, 'yyyy');

    const isStaff = activeTab === 'staff' || activeTab === 'staff_auto';
    const collectionName = isStaff ? 'staff_attendance' : 'attendance';

    let fetchConstraints: any[] = [];
    let filename = `${isStaff ? 'staff_attendance' : 'attendance'}_${dateStr}.pdf`;

    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth(); // 0-11
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (range === 'date') {
      fetchConstraints.push(where('date', '==', dateStr));
    } else if (range === 'month') {
      const start = `${monthStr}-01`;
      const end = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
      fetchConstraints.push(where('date', '>=', start), where('date', '<=', end));
      filename = `${isStaff ? 'staff_attendance' : 'attendance'}_month_${monthStr}.pdf`;
    } else {
      const start = `${yearStr}-01-01`;
      const end = `${yearStr}-12-31`;
      fetchConstraints.push(where('date', '>=', start), where('date', '<=', end));
      filename = `${isStaff ? 'staff_attendance' : 'attendance'}_year_${yearStr}.pdf`;
    }

    toast.loading(`Preparing A4 PDF ${range}-wise export...`, { id: 'exporting' });

    try {
      const rangeAttendance = await dbService.list(collectionName, fetchConstraints);

      if (isStaff) {
        // Fetch all batch & staff_batch definitions for robust shift/batch resolution
        const [batchDefs, staffBatchDefs] = await Promise.all([
          dbService.list('batches', [limit(500)]).catch(() => []),
          dbService.list('staff_batches', [limit(500)]).catch(() => [])
        ]);
        const allStaffBatches = [...(batchDefs || []), ...(staffBatchDefs || [])];

        const getStaffAssignedBatch = (p: any) => {
          if (!p) return null;
          const targetId = p.batchId || p.staffBatchId || (p.staffBatches && p.staffBatches[0]) || (p.batchIds && p.batchIds[0]);
          if (targetId) {
            const found = allStaffBatches.find((b: any) => b.id === targetId || b.uid === targetId);
            if (found) return found;
          }
          if (p.batch) {
            const found = allStaffBatches.find((b: any) => b.id === p.batch || b.name === p.batch);
            if (found) return found;
          }
          return null;
        };

        const getStaffBatchLabel = (p: any) => {
          const b = getStaffAssignedBatch(p);
          if (b) {
            const start = b.startTime || '09:00';
            const end = b.endTime || '17:00';
            return `${b.name || 'Shift'} (${start} - ${end})`;
          }
          if (p.batch) return String(p.batch);
          return 'General Shift (09:00 - 17:00)';
        };

        const checkIsLateForStaff = (record: any, staffBatch: any) => {
          if (!record) return false;
          if (record.isLate === true || record.status === 'late' || record.late === true) {
            return true;
          }
          if (record.status === 'absent') return false;

          const timeVal = record.timestamp || record.markedAt || record.time || record.checkInTime || record.createdAt;
          if (!timeVal) return false;

          let checkInHour = -1;
          let checkInMin = -1;

          if (typeof timeVal === 'number') {
            const d = new Date(timeVal);
            if (!isNaN(d.getTime())) {
              checkInHour = d.getHours();
              checkInMin = d.getMinutes();
            }
          } else if (typeof timeVal === 'string') {
            const d = new Date(timeVal);
            if (!isNaN(d.getTime())) {
              checkInHour = d.getHours();
              checkInMin = d.getMinutes();
            } else {
              const match12 = timeVal.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
              if (match12) {
                let h = parseInt(match12[1], 10);
                const m = parseInt(match12[2], 10);
                const ampm = match12[3].toUpperCase();
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                checkInHour = h;
                checkInMin = m;
              } else {
                const match24 = timeVal.match(/(\d{1,2}):(\d{2})/);
                if (match24) {
                  checkInHour = parseInt(match24[1], 10);
                  checkInMin = parseInt(match24[2], 10);
                }
              }
            }
          }

          const shiftStartStr = staffBatch?.startTime || '09:00';
          if (checkInHour !== -1 && shiftStartStr) {
            const [sHour, sMin] = shiftStartStr.split(':').map(Number);
            if (!isNaN(sHour) && !isNaN(sMin)) {
              if (checkInHour > sHour || (checkInHour === sHour && checkInMin > sMin)) {
                return true;
              }
            }
          }

          return false;
        };

        if (range === 'month') {
          // Calculate total working days in the month
          let monthWorkingDaysCount = (month === 5) ? 14 : (month === 6 ? 25 : 0);
          if (month !== 5 && month !== 6) {
            for (let d = 1; d <= daysInMonth; d++) {
              const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dObj = new Date(year, month, d);
              if (dObj.getDay() === 0) continue; // Sunday
              if (dObj.getDay() === 6 && d >= 8 && d <= 14) continue; // Second Saturday
              const isAcadHoliday = holidays.some(h => {
                if (h.type === 'working_day') return false;
                const start = h.date;
                const end = h.toDate || h.date;
                return dStr >= start && dStr <= end;
              });
              if (isAcadHoliday) continue;
              if (month === 5 && d < 12) continue; // June reopen rule
              monthWorkingDaysCount++;
            }
          }

          const headers = [
            "S.No",
            "Emp. No",
            "Name of the Staff",
            "Role",
            "Assigned Batch / Shift",
            ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
            "Present",
            "Absent",
            "Late Marks",
            "Attendance %"
          ];

          const tableRows = sortedPeople.map((person, idx) => {
            const personAttendance = rangeAttendance.filter(a => 
              a.userId === person.uid || a.studentId === person.uid || a.staffId === person.uid || a.uid === person.uid
            );
            
            const staffBatch = getStaffAssignedBatch(person);
            const batchLabel = getStaffBatchLabel(person);

            let presentCount = 0;
            let absentCount = 0;
            let lateCount = 0;
            const dayStatuses = [];

            for (let d = 1; d <= daysInMonth; d++) {
              const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dObj = new Date(year, month, d);
              const isSunday = dObj.getDay() === 0;
              const isSecondSaturday = dObj.getDay() === 6 && d >= 8 && d <= 14;
              
              const isAcadHoliday = holidays.some(h => {
                if (h.type === 'working_day') return false;
                const start = h.date;
                const end = h.toDate || h.date;
                return dStr >= start && dStr <= end;
              });

              const isReopenHoliday = (month === 5 && d < 12);

              const record = personAttendance.find(a => a.date === dStr);

              let val = '';
              if (record) {
                if (record.status === 'present' || record.status === 'late') {
                  const isLate = checkIsLateForStaff(record, staffBatch);

                  if (isLate) {
                    val = 'L';
                    presentCount++;
                    lateCount++;
                  } else {
                    val = 'X';
                    presentCount++;
                  }
                } else if (record.status === 'absent') {
                  val = 'a';
                  absentCount++;
                } else {
                  val = 'X';
                  presentCount++;
                }
              } else {
                if (isSunday) {
                  val = 'S';
                } else if (isSecondSaturday || isAcadHoliday || isReopenHoliday) {
                  val = 'H';
                } else {
                  val = '';
                }
              }
              dayStatuses.push(val);
            }

            const totalWorking = monthWorkingDaysCount || (presentCount + absentCount);
            const pct = totalWorking > 0 ? `${Math.round((presentCount / totalWorking) * 100)}%` : '0%';

            let rawRole = person.role || 'Staff';
            if (rawRole === 'teacher_class') rawRole = 'Teacher (Class)';
            else if (rawRole === 'teacher_subject') rawRole = 'Teacher (Subject)';
            else if (rawRole === 'play_school_incharge') rawRole = 'Play School Incharge';
            else rawRole = rawRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

            return [
              String(idx + 1),
              String(person.employeeId || person.empNo || person.staffId || ''),
              getStaffDisplayName(person),
              rawRole,
              batchLabel,
              ...dayStatuses,
              String(presentCount),
              String(absentCount),
              String(lateCount),
              pct
            ];
          });

          const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
          }) as any;

          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();

          // Header Title
          doc.setTextColor(0, 0, 0);
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(14);
          doc.text("STAFF ATTENDANCE REGISTER", pageWidth / 2, 12, { align: 'center' });

          const formattedMonthName = format(selectedDate, 'MMMM yyyy');

          doc.setFontSize(9);
          doc.setFont('Helvetica', 'normal');
          doc.text(`Role / Dept: All Staff   |   For the Month of: ${formattedMonthName}`, 10, 20);

          doc.setFont('Helvetica', 'bold');
          doc.text(`Total No. of Working Days: ${monthWorkingDaysCount}`, pageWidth - 10 - doc.getTextWidth(`Total No. of Working Days: ${monthWorkingDaysCount}`), 20);

          // Divider line
          doc.setDrawColor(150, 150, 150);
          doc.setLineWidth(0.2);
          doc.line(10, 24, pageWidth - 10, 24);

          // Define column widths for autoTable
          const colStyles: any = {
            0: { halign: 'center', cellWidth: 6 }, // S.No
            1: { halign: 'center', cellWidth: 11 }, // Emp. No
            2: { halign: 'left', cellWidth: 26 }, // Staff Name
            3: { halign: 'left', cellWidth: 18 }, // Role
            4: { halign: 'left', cellWidth: 22 }, // Assigned Batch
          };
          for (let i = 1; i <= daysInMonth; i++) {
            colStyles[4 + i] = { halign: 'center', cellWidth: 4.5 }; // Narrow day cells
          }
          colStyles[5 + daysInMonth] = { halign: 'center', cellWidth: 9 }; // Present
          colStyles[6 + daysInMonth] = { halign: 'center', cellWidth: 9 }; // Absent
          colStyles[7 + daysInMonth] = { halign: 'center', cellWidth: 10 }; // Late Marks
          colStyles[8 + daysInMonth] = { halign: 'center', cellWidth: 11 }; // Attendance %

          autoTable(doc, {
            startY: 28,
            head: [headers],
            body: tableRows,
            theme: 'grid',
            headStyles: {
              fillColor: [243, 244, 246],
              textColor: [0, 0, 0],
              fontSize: 5.5,
              fontStyle: 'bold',
              halign: 'center',
              cellPadding: 0.5,
              lineColor: [180, 180, 180],
              lineWidth: 0.1
            },
            bodyStyles: {
              fontSize: 5.5,
              cellPadding: 0.6,
              lineColor: [180, 180, 180],
              lineWidth: 0.1
            },
            columnStyles: colStyles,
            margin: { left: 8, right: 8, top: 28, bottom: 15 },
            didDrawPage: (data: any) => {
              doc.setFontSize(8);
              doc.setTextColor(148, 163, 184);
              const str = "Page " + doc.internal.getNumberOfPages();
              doc.text(str, pageWidth - 15 - doc.getTextWidth(str), pageHeight - 10);
              doc.text("A4 Landscape Staff Monthly Register Format", 15, pageHeight - 10);
            }
          });

          doc.save(filename);
        } else {
          // Staff single date or year PDF export
          const headers = ["S.No", "Emp. No", "Name of the Staff", "Role", "Assigned Batch / Shift", "Status", "Attend Mark Time", "Late Marks", "Present", "Absent", "Attendance %"];

          const tableRows = sortedPeople.map((person, idx) => {
            const personAttendance = rangeAttendance.filter(a => 
              a.userId === person.uid || a.studentId === person.uid || a.staffId === person.uid || a.uid === person.uid
            );
            
            let present = 0;
            let absent = 0;
            let late = 0;
            let statusStr = 'Present';
            let markTimeStr = 'N/A';

            const staffBatch = getStaffAssignedBatch(person);
            const batchLabel = getStaffBatchLabel(person);

            if (range === 'date') {
              const record = personAttendance.find(a => a.date === dateStr);
              if (record) {
                if (record.status === 'absent') {
                  statusStr = 'Absent';
                  absent = 1;
                } else {
                  const isLate = checkIsLateForStaff(record, staffBatch);
                  if (isLate) {
                    statusStr = 'Present (Late)';
                    late = 1;
                  } else {
                    statusStr = 'Present';
                  }
                  present = 1;
                }
                const timeVal = record.timestamp || record.time || record.markedAt || record.createdAt;
                if (timeVal) {
                  try {
                    markTimeStr = typeof timeVal === 'string' && (timeVal.includes('AM') || timeVal.includes('PM'))
                      ? timeVal
                      : format(new Date(timeVal), 'hh:mm a');
                  } catch (e) {
                    markTimeStr = String(timeVal);
                  }
                }
              } else {
                statusStr = 'Present';
                present = 1;
              }
            } else {
              present = personAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
              absent = personAttendance.filter(a => a.status === 'absent').length;
              late = personAttendance.filter(a => checkIsLateForStaff(a, staffBatch)).length;

              if (personAttendance.length === 0) {
                present = 1;
                absent = 0;
                statusStr = 'Present';
              } else {
                statusStr = absent === 0 ? 'Present' : (present === 0 ? 'Absent' : 'Partial');
              }
              const latestRecord = personAttendance.find(a => a.timestamp || a.time || a.markedAt);
              if (latestRecord) {
                const timeVal = latestRecord.timestamp || latestRecord.time || latestRecord.markedAt;
                try {
                  markTimeStr = typeof timeVal === 'string' && (timeVal.includes('AM') || timeVal.includes('PM'))
                    ? timeVal
                    : format(new Date(timeVal), 'hh:mm a');
                } catch (e) {
                  markTimeStr = 'N/A';
                }
              }
            }

            const totalWorking = present + absent;
            const pct = totalWorking > 0 ? `${Math.round((present / totalWorking) * 100)}%` : '100%';

            let rawRole = person.role || 'Staff';
            if (rawRole === 'teacher_class') rawRole = 'Teacher (Class)';
            else if (rawRole === 'teacher_subject') rawRole = 'Teacher (Subject)';
            else if (rawRole === 'play_school_incharge') rawRole = 'Play School Incharge';
            else rawRole = rawRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

            const staffName = getStaffDisplayName(person);

            return [
              String(idx + 1),
              String(person.employeeId || person.empNo || person.staffId || ''),
              staffName,
              rawRole,
              batchLabel,
              statusStr,
              markTimeStr,
              String(late),
              String(present),
              String(absent),
              pct
            ];
          });

          const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
          }) as any;

          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();

          doc.setFillColor(30, 41, 59);
          doc.rect(0, 0, pageWidth, 24, 'F');

          doc.setTextColor(255, 255, 255);
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(15);
          doc.text("Staff Attendance Register Report", 14, 11);

          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.text(`Range: ${range.toUpperCase()} | Generated: ${new Date().toLocaleDateString()} | Total Staff: ${sortedPeople.length}`, 14, 18);

          autoTable(doc, {
            startY: 28,
            head: [headers],
            body: tableRows,
            theme: 'striped',
            headStyles: {
              fillColor: [79, 70, 229],
              textColor: [255, 255, 255],
              fontSize: 7.5,
              fontStyle: 'bold',
              halign: 'center'
            },
            styles: {
              fontSize: 7,
              cellPadding: 1.8,
              overflow: 'linebreak',
              valign: 'middle'
            },
            columnStyles: {
              0: { halign: 'center', cellWidth: 8 },  // S.No
              1: { halign: 'center', cellWidth: 14 }, // Emp. No
              2: { halign: 'left', cellWidth: 28 },   // Name of the Staff
              3: { halign: 'left', cellWidth: 18 },   // Role
              4: { halign: 'left', cellWidth: 26 },   // Assigned Batch
              5: { halign: 'center', cellWidth: 18 }, // Status
              6: { halign: 'center', cellWidth: 20 }, // Attend Mark Time
              7: { halign: 'center', cellWidth: 14 }, // Late Marks
              8: { halign: 'center', cellWidth: 12 }, // Present
              9: { halign: 'center', cellWidth: 12 }, // Absent
              10: { halign: 'center', cellWidth: 14 }  // Attendance %
            },
            alternateRowStyles: {
              fillColor: [248, 250, 252]
            },
            margin: { left: 8, right: 8, top: 28, bottom: 15 },
            didDrawPage: (data: any) => {
              doc.setFontSize(8);
              doc.setTextColor(148, 163, 184);
              const str = "Page " + doc.internal.getNumberOfPages();
              doc.text(str, pageWidth - 15 - doc.getTextWidth(str), pageHeight - 10);
              doc.text("A4 Paper Printable Format - Staff Attendance", 15, pageHeight - 10);
            }
          });

          doc.save(filename);
        }
      } else if (range === 'month') {
        const headers = [
          "S.No",
          "Admn. No",
          "Name of the Pupil",
          "Father Name",
          ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
          "Present",
          "Remarks"
        ];

        const tableRows = sortedPeople.map((person, idx) => {
          const personAttendance = rangeAttendance.filter(a => 
            a.studentId === person.uid || a.userId === person.uid || a.uid === person.uid || a.studentId === person.id || a.userId === person.id
          );
          
          let presentCount = 0;
          const dayStatuses = [];
          const isNonAttending = person.status === 'non_attending' || person.status === 'non-attending';

          for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dObj = new Date(year, month, d);
            const isSunday = dObj.getDay() === 0;
            const isSecondSaturday = dObj.getDay() === 6 && d >= 8 && d <= 14;
            
            const isAcadHoliday = holidays.some(h => {
              if (h.type === 'working_day') return false;
              const start = h.date;
              const end = h.toDate || h.date;
              return dStr >= start && dStr <= end;
            });

            // Reopen rules: June before 12th is holiday
            const isReopenHoliday = (month === 5 && d < 12);

            const record = personAttendance.find(a => a.date === dStr);

            let val = '';
            if (isSunday) {
              val = 'S';
            } else if (isSecondSaturday || isAcadHoliday || isReopenHoliday) {
              val = 'H';
            } else if (record) {
              if (record.status === 'present' || record.status === 'late') {
                val = 'X';
                presentCount++;
              } else if (record.status === 'absent') {
                val = 'a';
              }
            } else if (isNonAttending) {
              val = 'X';
              presentCount++;
            } else {
              val = 'a';
            }
            dayStatuses.push(val);
          }

          return [
            String(idx + 1),
            String(person.admissionNumber || person.rollNumber || ''),
            getPersonDisplayName(person),
            person.fatherName || person.parentName || 'N/A',
            ...dayStatuses,
            String(presentCount),
            "" // Remarks
          ];
        });

        // Compute total monthly working days
        let monthWorkingDaysCount = (month === 5) ? 14 : (month === 6 ? 25 : 0);
        if (month !== 5 && month !== 6) {
          for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dObj = new Date(year, month, d);
            if (dObj.getDay() === 0) continue; // Sunday
            if (dObj.getDay() === 6 && d >= 8 && d <= 14) continue; // Second Saturday
            const isAcadHoliday = holidays.some(h => {
              if (h.type === 'working_day') return false;
              const start = h.date;
              const end = h.toDate || h.date;
              return dStr >= start && dStr <= end;
            });
            if (isAcadHoliday) continue;
            
            if (month === 5 && d < 12) continue; // June reopen rule
            
            monthWorkingDaysCount++;
          }
        }

        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        }) as any;

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Header Title
        doc.setTextColor(0, 0, 0);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(14);
        doc.text("PUPILS' ATTENDANCE REGISTER", pageWidth / 2, 12, { align: 'center' });

        const clsName = filterClass === 'all' ? 'All Classes' : (classes.find(c => c.id === filterClass)?.name || filterClass);
        const batchName = filterBatch === 'all' ? 'All Batches' : (batches.find(b => b.id === filterBatch)?.name || filterBatch);
        const formattedMonthName = format(selectedDate, 'MMMM yyyy');

        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Class: ${clsName}   |   Section: ${batchName}   |   For the Month of: ${formattedMonthName}`, 10, 20);

        doc.setFont('Helvetica', 'bold');
        doc.text(`Total No. of Working Days: ${monthWorkingDaysCount}`, pageWidth - 10 - doc.getTextWidth(`Total No. of Working Days: ${monthWorkingDaysCount}`), 20);

        // Divider line
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.2);
        doc.line(10, 24, pageWidth - 10, 24);

        // Define column widths for autoTable
        const colStyles: any = {
          0: { halign: 'center', cellWidth: 7 }, // S.No
          1: { halign: 'center', cellWidth: 14 }, // Admn. No
          2: { halign: 'left', cellWidth: 35 }, // Pupil Name
          3: { halign: 'left', cellWidth: 30 }, // Father Name
        };
        for (let i = 1; i <= daysInMonth; i++) {
          colStyles[3 + i] = { halign: 'center', cellWidth: 5.1 }; // Narrow day cells
        }
        colStyles[4 + daysInMonth] = { halign: 'center', cellWidth: 12 }; // Present
        colStyles[5 + daysInMonth] = { halign: 'left', cellWidth: 16 }; // Remarks

        autoTable(doc, {
          startY: 28,
          head: [headers],
          body: tableRows,
          theme: 'grid',
          headStyles: {
            fillColor: [243, 244, 246],
            textColor: [0, 0, 0],
            fontSize: 5.5,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 0.5,
            lineColor: [180, 180, 180],
            lineWidth: 0.1
          },
          bodyStyles: {
            fontSize: 5.5,
            cellPadding: 0.6,
            lineColor: [180, 180, 180],
            lineWidth: 0.1
          },
          columnStyles: colStyles,
          margin: { left: 8, right: 8, top: 28, bottom: 15 },
          didDrawPage: (data: any) => {
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            const str = "Page " + doc.internal.getNumberOfPages();
            doc.text(str, pageWidth - 15 - doc.getTextWidth(str), pageHeight - 10);
            doc.text("A4 Landscape Monthly Register Format", 15, pageHeight - 10);
          }
        });

        doc.save(filename);
      } else {
        const isDateRange = range === 'date';
        const headers = isDateRange
          ? ["S.No", "Admn. No", "Roll No", "Student Name", "Father Name", "Class", "Section", "Status", "Mark Time", "Present", "Absent", "Attendance %"]
          : ["S.No", "Admn. No", "Roll No", "Student Name", "Father Name", "Class", "Section", "Status Summary", "Working Days", "Present Days", "Absent Days", "Attendance %"];

        const tableRows = sortedPeople.map((person, idx) => {
          const personAttendance = rangeAttendance.filter(a => 
            a.studentId === person.uid || a.userId === person.uid || a.uid === person.uid || a.studentId === person.id || a.userId === person.id
          );
          
          let present = 0;
          let absent = 0;
          let statusStr = 'Present';
          let markTimeStr = 'N/A';
          const isNonAttending = person.status === 'non_attending' || person.status === 'non-attending';
          
          if (isDateRange) {
            const record = personAttendance.find(a => a.date === dateStr);
            if (record) {
              if (record.status === 'absent') {
                statusStr = 'Absent';
                absent = 1;
              } else {
                statusStr = record.status === 'late' ? 'Present (Late)' : 'Present';
                present = 1;
              }
              const timeVal = record.timestamp || record.time || record.markedAt || record.createdAt;
              if (timeVal) {
                try {
                  markTimeStr = typeof timeVal === 'string' && (timeVal.includes('AM') || timeVal.includes('PM'))
                    ? timeVal
                    : format(new Date(timeVal), 'hh:mm a');
                } catch (e) {
                  markTimeStr = String(timeVal);
                }
              }
            } else {
              if (isNonAttending) {
                statusStr = 'Present';
                present = 1;
              } else {
                const isAcadHoliday = holidays.some(h => {
                  if (h.type === 'working_day') return false;
                  const start = h.date;
                  const end = h.toDate || h.date;
                  return dateStr >= start && dateStr <= end;
                });
                if (isAcadHoliday) {
                  statusStr = 'Holiday';
                  present = 0;
                  absent = 0;
                } else {
                  statusStr = 'Absent';
                  absent = 1;
                }
              }
            }
          } else {
            present = personAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
            absent = personAttendance.filter(a => a.status === 'absent').length;

            if (personAttendance.length === 0) {
              if (isNonAttending) {
                present = 1;
                absent = 0;
                statusStr = 'Present';
              } else {
                statusStr = 'No Records';
              }
            } else {
              statusStr = absent === 0 ? 'Present' : (present === 0 ? 'Absent' : 'Partial');
            }
          }

          const totalWorking = present + absent;
          const pct = totalWorking > 0 ? `${Math.round((present / totalWorking) * 100)}%` : (present > 0 ? '100%' : '0%');
          const clsObj = classes.find(c => c.id === person.classId || c.name === person.class);
          const batchObj = batches.find(b => b.id === person.batchId || b.name === person.batch);

          if (isDateRange) {
            return [
              String(idx + 1),
              String(person.admissionNumber || person.rollNumber || ''),
              String(person.rollNumber || 'N/A'),
              getPersonDisplayName(person),
              person.fatherName || person.parentName || 'N/A',
              clsObj?.name || person.class || 'N/A',
              batchObj?.name || person.batch || 'N/A',
              statusStr,
              markTimeStr,
              String(present),
              String(absent),
              pct
            ];
          } else {
            return [
              String(idx + 1),
              String(person.admissionNumber || person.rollNumber || ''),
              String(person.rollNumber || 'N/A'),
              getPersonDisplayName(person),
              person.fatherName || person.parentName || 'N/A',
              clsObj?.name || person.class || 'N/A',
              batchObj?.name || person.batch || 'N/A',
              statusStr,
              String(totalWorking),
              String(present),
              String(absent),
              pct
            ];
          }
        });

        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        }) as any;

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, pageWidth, 24, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(15);
        doc.text(isDateRange ? "Daily Student Attendance Register Report" : "Student Attendance Yearly Summary Report", 14, 11);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`Date: ${dateStr} | Range: ${range.toUpperCase()} | Total Students: ${sortedPeople.length}`, 14, 18);

        const colStyles: any = isDateRange ? {
          0: { halign: 'center', cellWidth: 8 },  // S.No
          1: { halign: 'center', cellWidth: 14 }, // Admn. No
          2: { halign: 'center', cellWidth: 12 }, // Roll No
          3: { halign: 'left', cellWidth: 28 },   // Student Name
          4: { halign: 'left', cellWidth: 24 },   // Father Name
          5: { halign: 'left', cellWidth: 14 },   // Class
          6: { halign: 'left', cellWidth: 14 },   // Section
          7: { halign: 'center', cellWidth: 18 }, // Status
          8: { halign: 'center', cellWidth: 20 }, // Mark Time
          9: { halign: 'center', cellWidth: 10 }, // Present
          10: { halign: 'center', cellWidth: 10 }, // Absent
          11: { halign: 'center', cellWidth: 14 }  // Attendance %
        } : {
          0: { halign: 'center', cellWidth: 8 },  // S.No
          1: { halign: 'center', cellWidth: 14 }, // Admn. No
          2: { halign: 'center', cellWidth: 12 }, // Roll No
          3: { halign: 'left', cellWidth: 30 },   // Student Name
          4: { halign: 'left', cellWidth: 26 },   // Father Name
          5: { halign: 'left', cellWidth: 14 },   // Class
          6: { halign: 'left', cellWidth: 14 },   // Section
          7: { halign: 'center', cellWidth: 18 }, // Status Summary
          8: { halign: 'center', cellWidth: 14 }, // Working Days
          9: { halign: 'center', cellWidth: 12 }, // Present
          10: { halign: 'center', cellWidth: 12 }, // Absent
          11: { halign: 'center', cellWidth: 14 }  // Attendance %
        };

        autoTable(doc, {
          startY: 28,
          head: [headers],
          body: tableRows,
          theme: 'striped',
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'center'
          },
          styles: {
            fontSize: 7,
            cellPadding: 1.5,
            overflow: 'linebreak',
            valign: 'middle'
          },
          columnStyles: colStyles,
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          margin: { left: 8, right: 8, top: 28, bottom: 15 },
          didDrawPage: (data: any) => {
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            const str = "Page " + doc.internal.getNumberOfPages();
            doc.text(str, pageWidth - 15 - doc.getTextWidth(str), pageHeight - 10);
            doc.text("A4 Paper Printable Format", 15, pageHeight - 10);
          }
        });

        doc.save(filename);
      }

      toast.success("Attendance exported as clean A4 PDF!", { id: 'exporting' });
    } catch (error) {
      console.error("PDF Export error:", error);
      toast.error("Failed to export A4 PDF attendance", { id: 'exporting' });
    }
  };

  const playSchoolClassIds = classes.map(c => c.id);

  const canViewAllClasses = (hasPermission('attendance_view_all') || hasPermission('classes_view_all')) && !isTeacherRole && !isPlaySchoolIncharge;
  const canViewAllBatches = (hasPermission('attendance_view_all') || hasPermission('batches_view_all')) && !isTeacherRole && !isPlaySchoolIncharge;
  const canViewClasses = hasPermission('classes_view') || canViewAllClasses || isTeacherRole || isPlaySchoolIncharge;
  const canViewBatches = hasPermission('batches_view') || canViewAllBatches || isTeacherRole || isPlaySchoolIncharge;

  const teacherBatchIds: string[] = batches.map(b => String(b.id || ''));
  const teacherClassIds: string[] = classes.map(c => String(c.id || ''));

  const availableClasses = isTeacherRole
    ? classes
    : classes.filter(c => {
      if (isPlaySchoolIncharge) {
        return playSchoolClassIds.includes(c.id);
      }
      if (canViewAllClasses) return true;
      return teacherClassIds.includes(c.id);
    });
  
  const availableBatches = isTeacherRole
    ? batches
    : (filterClass === 'all' 
      ? [] 
      : batches.filter(b => {
        const selectedClassObj = classes.find(c => c.id === filterClass);
        const selectedClassName = selectedClassObj?.name;
        return b.classId === filterClass || (selectedClassName && b.className === selectedClassName);
      }));

  const baseFilteredPeople = people.filter(p => {
    const isStudentTab = activeTab === 'student' || activeTab === 'register';
    const isStaffTab = activeTab === 'staff' || activeTab === 'staff_auto';

    if (isStaffTab) {
      const matchesTab = p.role !== 'student' && p.role !== 'parent';
      const pStatusClean = String(p.status || '').toLowerCase().trim().replace(/[- ]/g, '_');
      const isInactive = pStatusClean === 'inactive' || pStatusClean === 'dropped' || pStatusClean === 'tc_issued' || pStatusClean === 'withdrawn' || pStatusClean === 'left' || pStatusClean === 'archived' || pStatusClean === 'deleted';
      return matchesTab && !isInactive;
    }

    // Student / Register Tab:
    const resolved = resolveStudentClassAndBatch(p, classes, batches);

    // Teacher Access Restriction - Only see students in assigned classes/batches
    const isPlaySchoolIncharge = profile?.role === 'play_school_incharge';
    const matchesTeacherAccess = (isTeacherRole && !isPlaySchoolIncharge) ? (
      batches.some(b => b.id === resolved.batchId || (resolved.classId === b.classId && b.name && resolved.batchName.toLowerCase() === b.name.toLowerCase()))
    ) : (!hasPermission('students_view_all') ? (
      (isPlaySchoolIncharge && playSchoolClassIds.includes(resolved.classId)) ||
      (!isPlaySchoolIncharge && (
        batches.some(b => b.id === resolved.batchId || (resolved.classId === b.classId && b.name && resolved.batchName.toLowerCase() === b.name.toLowerCase()))
      ))
    ) : true);

    const matchesClass = filterClass === 'all' || resolved.classId === filterClass;
    const matchesBatch = filterBatch === 'all' || resolved.batchId === filterBatch;

    const matchesTab = p.role === 'student' || !p.role || p.role === '';
    const isStub = (!resolved.classId || resolved.classId === 'N/A' || resolved.classId === '');
    const pStatusClean = String(p.status || '').toLowerCase().trim().replace(/[- ]/g, '_');
    const isInactive = pStatusClean === 'inactive' || pStatusClean === 'dropped' || pStatusClean === 'tc_issued' || pStatusClean === 'withdrawn' || pStatusClean === 'left' || pStatusClean === 'archived' || pStatusClean === 'deleted';
    const matchesStatusActive = !isInactive && !isStub;

    return matchesClass && matchesBatch && matchesTab && matchesStatusActive && matchesTeacherAccess;
  });

  const filteredPeople = baseFilteredPeople.filter(p => {
    const fullName = `${p.name || ''} ${p.firstName || ''} ${p.lastName || ''} ${p.studentName || ''}`.toLowerCase();
    const searchLower = searchTerm.toLowerCase().trim();
    const searchTerms = searchLower.split(/\s+/).filter(Boolean);
    const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => {
      return fullName.includes(term) ||
             (p.rollNumber && String(p.rollNumber).toLowerCase().includes(term)) ||
             (p.parentName && String(p.parentName).toLowerCase().includes(term)) ||
             (p.fatherName && String(p.fatherName).toLowerCase().includes(term)) ||
             (p.phone && String(p.phone).toLowerCase().includes(term)) ||
             (p.parentPhone && String(p.parentPhone).toLowerCase().includes(term)) ||
             (p.whatsappNumber && String(p.whatsappNumber).toLowerCase().includes(term));
    });
    
    const status = getStatus(p.uid);
    const matchesStatus = filterStatus === 'all' || status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const sortedPeople = [...filteredPeople].sort((a, b) => {
    const config = sortConfig || { key: 'rollNumber', direction: 'asc' };
    
    if (config.key === 'rollNumber') {
      const rollA = String(a.rollNumber || a.rollNo || '');
      const rollB = String(b.rollNumber || b.rollNo || '');
      const comparison = rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
      return config.direction === 'asc' ? comparison : -comparison;
    }
    
    if (config.key === 'name') {
      const nameA = getPersonDisplayName(a).toLowerCase();
      const nameB = getPersonDisplayName(b).toLowerCase();
      const comparison = nameA.localeCompare(nameB);
      return config.direction === 'asc' ? comparison : -comparison;
    }

    let aValue: any = a[config.key] || '';
    let bValue: any = b[config.key] || '';

    if (config.key === 'status') {
      aValue = getStatus(a.uid);
      bValue = getStatus(b.uid);
    }

    if (aValue < bValue) return config.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return config.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedPeople.length / pageSize);
  const paginatedPeople = sortedPeople.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Auto-select first available for teachers & play school incharge
  useEffect(() => {
    if ((isTeacherRole || isPlaySchoolIncharge) && availableClasses.length > 0 && filterClass === 'all') {
      setFilterClass(availableClasses[0].id);
    }
  }, [availableClasses, isTeacherRole, isPlaySchoolIncharge, filterClass]);

  // Secondary auto-select for batch
  useEffect(() => {
    if ((isTeacherRole || isPlaySchoolIncharge) && filterClass !== 'all' && availableBatches.length > 0 && (filterBatch === 'all' || !availableBatches.find(b => b.id === filterBatch))) {
      setFilterBatch(availableBatches[0].id);
    }
  }, [filterClass, availableBatches, isTeacherRole, isPlaySchoolIncharge, filterBatch]);

  // Sync batch with class
  useEffect(() => {
    if (filterClass !== 'all') {
      const selectedClassObj = classes.find(c => c.id === filterClass);
      const selectedClassName = selectedClassObj?.name;
      const classBatches = batches.filter(b => b.classId === filterClass || (selectedClassName && b.className === selectedClassName));
      if (filterBatch !== 'all' && !classBatches.find(b => b.id === filterBatch)) {
        setFilterBatch('all');
      }
    } else {
      setFilterBatch('all');
    }
  }, [filterClass, batches, filterBatch, classes]);

  const isAssignedClassTeacher = batches.some(b => b.classTeacherId === profile?.uid) || 
                                 profile?.role === 'teacher_class' || 
                                 isPlaySchoolIncharge ||
                                 teacherClassIds.length > 0 || 
                                 teacherBatchIds.length > 0;

  if (profile?.role === 'clerk') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm min-h-[400px]">
        <Lock className="w-12 h-12 text-[#ef4444] mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have authorization to view or edit the Attendance module.
        </p>
      </div>
    );
  }

  if (isTeacherRole && !isAssignedClassTeacher) {
    return (
      <div className="space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-sidebar">Attendance System</h1>
            <p className="text-sm text-neutral-500">Daily tracking and student/staff attendance management.</p>
          </div>
        </header>

        <div className="bg-white rounded-3xl p-12 border border-neutral-100 shadow-sm flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 font-black" />
          </div>
          <div className="space-y-2 max-w-md">
            <h2 className="text-xl font-bold text-sidebar">Student Attendance Excluded</h2>
            <p className="text-neutral-500 text-sm">
              You are logged in as a <span className="font-bold text-primary">Subject Teacher</span>.
              Class student attendance is restricted to assigned <span className="font-bold text-indigo-600">Class Teachers</span> only.
            </p>
            <p className="text-xs text-neutral-400">
              Please contact your system administrator or principal if you need to be assigned to a classroom.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isPersonalView) {
    return <StudentAttendancePortal profile={profile} availableProfiles={availableProfiles} switchProfile={switchProfile} />;
  }

  if (!hasPermission('attendance_view') && !hasPermission('attendance_manage') && !hasPermission('attendance_view_my') && !hasPermission('attendance_manage_my') && !isTeacherRole && !isPlaySchoolIncharge && !isStudent && !isParent) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have permission to view or manage attendance. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-sidebar">Attendance System</h1>
          <p className="text-sm text-neutral-500">Daily tracking and student/staff attendance management.</p>
        </div>
        <div className="flex items-center gap-4">
          {!isTeacherRole && activeTab === 'student' && hasPermission('whatsapp_send') && (
            <div className="flex flex-col items-end gap-1">
              <button 
                onClick={sendAbsenteeAlerts}
                disabled={sendingAlerts || alertsSent}
                className={`flex items-center gap-3 text-white px-10 py-5 rounded-2xl font-black transition-all active:scale-95 ${
                  alertsSent 
                    ? 'bg-neutral-400 hover:bg-neutral-500 shadow-xl shadow-neutral-400/20' 
                    : 'bg-amber-500 hover:bg-amber-600 shadow-xl shadow-amber-500/20'
                } disabled:opacity-50`}
              >
                <AlertTriangle className="w-8 h-8 font-black" />
                <span className="text-xl font-black">
                  {sendingAlerts ? 'Sending...' : alertsSent ? 'Already Sent Alerts' : 'Send Alerts'}
                </span>
              </button>
              <div className="text-right space-y-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                  whatsappStatus === 'open' 
                    ? 'bg-green-100 text-green-700 border border-green-200' 
                    : whatsappStatus === 'connecting'
                    ? 'bg-blue-100 text-blue-700 border border-blue-200 animate-pulse'
                    : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}>
                  Gateway: {whatsappStatus === 'open' ? '🟢 Online' : whatsappStatus === 'connecting' ? '🌀 Connecting' : '🔴 Offline (QR Code Pending)'}
                </span>
                {!isTeacherRole && (
                  <button 
                    onClick={() => navigate('/dashboard/communication')}
                    className="block text-[11px] font-extrabold text-primary hover:underline ml-auto"
                  >
                    🔗 Link WhatsApp (QR Code)
                  </button>
                )}
              </div>
            </div>
          )}
          {!isTeacherRole && hasPermission('attendance_manage') && !isVicePrincipalRole && (
            <button 
              onClick={() => setShowSmartModal(true)}
              className="flex items-center gap-4 bg-primary text-white px-12 py-6 rounded-2xl font-black hover:bg-sidebar transition-all shadow-xl shadow-primary/20 active:scale-95"
            >
              <Sparkles className="w-8 h-8 font-black" />
              <span className="text-xl font-black">Smart Attendance</span>
            </button>
          )}
          {!isTeacherRole && hasPermission('attendance_view') && (
            <div className="relative group">
              <button 
                className="flex items-center gap-2 bg-white text-neutral-700 border border-neutral-200 px-4 py-2 rounded-lg font-bold hover:bg-neutral-50 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
              <div className="absolute right-0 mt-2 w-56 bg-white border border-neutral-100 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase text-neutral-400 border-b border-neutral-50 bg-neutral-50">CSV Spreadsheets</div>
                <button 
                  onClick={() => exportAttendanceData('date')}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 transition-colors flex items-center gap-2 text-neutral-700 font-medium"
                >
                  <Calendar className="w-3.5 h-3.5 text-green-600" />
                  Daily CSV Export
                </button>
                <button 
                  onClick={() => exportAttendanceData('month')}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 transition-colors flex items-colors gap-2 text-neutral-700 font-medium"
                >
                  <Calendar className="w-3.5 h-3.5 text-green-600" />
                  Monthly CSV Export
                </button>
                <button 
                  onClick={() => exportAttendanceData('year')}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 transition-colors flex items-colors gap-2 text-neutral-700 font-medium"
                >
                  <Calendar className="w-3.5 h-3.5 text-green-600" />
                  Yearly CSV Export
                </button>

                <div className="px-3 py-1.5 text-[10px] font-black uppercase text-neutral-400 border-t border-b border-neutral-50 bg-neutral-50">Printable A4 PDF</div>
                <button 
                  onClick={() => exportAttendanceA4PDF('date')}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 transition-colors flex items-center gap-2 text-neutral-700 font-medium"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  Daily A4 PDF Export
                </button>
                <button 
                  onClick={() => exportAttendanceA4PDF('month')}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 transition-colors flex items-center gap-2 text-neutral-700 font-medium"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  Monthly A4 PDF Export
                </button>
                <button 
                  onClick={() => exportAttendanceA4PDF('year')}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 transition-colors flex items-center gap-2 text-neutral-700 font-medium"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  Yearly A4 PDF Export
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg p-1 shadow-sm">
            <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)))} className="p-1 hover:bg-neutral-100 rounded">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold px-2">{format(selectedDate, 'MMM dd, yyyy')}</span>
            <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)))} className="p-1 hover:bg-neutral-100 rounded">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {currentHoliday && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-500">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0 shadow-sm border border-amber-200">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-amber-900 flex items-center gap-2">
              School Holiday: {currentHoliday.title}
              <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-[10px] rounded-full uppercase tracking-widest font-black">
                {(currentHoliday.type || 'holiday').replace('_', ' ')}
              </span>
            </h3>
            <p className="text-sm text-amber-700 font-medium">Attendance is generally not marked on holidays. {currentHoliday.description}</p>
          </div>
        </div>
      )}

      {/* Tabs and Stats */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4">
        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-neutral-100 rounded-2xl w-fit flex-wrap items-center">
          <button
            onClick={() => setActiveTab('student')}
            className={`px-6 py-2.5 rounded-xl font-bold text-base transition-all ${
              activeTab === 'student' 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Mark Students Attendance
          </button>
          {!isTeacherRole && hasPermission('attendance_view_all') && (
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-6 py-2.5 rounded-xl font-bold text-base transition-all ${
                activeTab === 'staff' 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Staff
            </button>
          )}
          {!isTeacherRole && hasPermission('attendance_view_all') && (activeTab === 'staff' || activeTab === 'staff_auto') && (
            <button
              onClick={() => setActiveTab('staff_auto')}
              className={`px-6 py-2.5 rounded-xl font-bold text-base transition-all flex items-center gap-2 ${
                activeTab === 'staff_auto' 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <CheckSquare className="w-5 h-5 text-green-600" />
              Auto-Mark Staff Present Daily
            </button>
          )}
          {!isTeacherRole && (hasPermission('attendance_view') || hasPermission('attendance_manage')) && (
            <button
              onClick={() => setActiveTab('register')}
              className={`px-6 py-2.5 rounded-xl font-bold text-base transition-all flex items-center gap-2 ${
                activeTab === 'register' 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <FileSpreadsheet className="w-5 h-5" />
              Consolidated Attendance Register
            </button>
          )}
        </div>

        {(activeTab !== 'register' && activeTab !== 'staff_auto' && !isStudent && !isParent) && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-green-50 px-4 py-2.5 rounded-xl border border-green-200 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-[10px] font-bold tracking-wider uppercase text-green-700 leading-none mb-1">Present</p>
                <p className="text-xl font-black text-green-700 leading-none">{baseFilteredPeople.filter(p => getStatus(p.uid || p.id) === 'present').length}</p>
              </div>
            </div>
            
            <div className="bg-red-50 px-4 py-2.5 rounded-xl border border-red-200 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-[10px] font-bold tracking-wider uppercase text-red-700 leading-none mb-1">Absent</p>
                <p className="text-xl font-black text-red-700 leading-none">{baseFilteredPeople.filter(p => getStatus(p.uid || p.id) === 'absent').length}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab !== 'staff_auto' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input 
              type="text" 
              placeholder={`Search ${activeTab === 'staff' ? 'staff' : 'students'}...`} 
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none text-sm focus:border-primary transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-neutral-400" />
            
            {(activeTab === 'student' || activeTab === 'register') && (
              <>
                {canViewClasses && (
                  <select 
                    className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary font-bold disabled:opacity-90 disabled:bg-neutral-100 disabled:cursor-not-allowed"
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    disabled={isTeacherRole && availableClasses.length <= 1}
                  >
                    {(canViewAllClasses && !isTeacherRole) && <option value="all">All Classes</option>}
                    {availableClasses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {canViewBatches && (
                  <select 
                    className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary font-bold disabled:opacity-90 disabled:bg-neutral-100 disabled:cursor-not-allowed transition-all duration-200"
                    value={filterBatch}
                    onChange={(e) => setFilterBatch(e.target.value)}
                    disabled={filterClass === 'all' || (isTeacherRole && availableBatches.length <= 1)}
                  >
                     {(canViewAllBatches && !isTeacherRole) && <option value="all">All Batches</option>}
                    {availableBatches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </>
            )}

            {activeTab !== 'register' && (
              <select 
                className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
              </select>
            )}
          </div>
        </div>
      )}

      {activeTab === 'register' ? (
        <ConsolidatedAttendanceRegister 
          students={sortedPeople} 
          selectedClass={filterClass}
          selectedBatch={filterBatch}
        />
      ) : activeTab === 'staff_auto' ? (
        <StaffAutoAttendanceConfig 
          selectedDate={selectedDate}
          onRefresh={async () => {
            // Force a refresh of attendance list
            try {
              const dateStr = format(selectedDate, 'yyyy-MM-dd');
              const collectionName = 'staff_attendance';
              const updated = await dbService.list(collectionName, [where('date', '==', dateStr)], true);
              setAttendance(updated);
            } catch (err) {
              console.error(err);
            }
          }}
        />
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Attendance List */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="p-6 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
            <h3 className="font-bold text-[13px] uppercase tracking-wider text-neutral-500">Attendance List</h3>
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-neutral-400">
                Showing {paginatedPeople.length} of {sortedPeople.length} {activeTab === 'staff' ? 'staff' : 'students'}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1 hover:bg-neutral-200 rounded disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-neutral-500">Page {currentPage} of {totalPages}</span>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1 hover:bg-neutral-200 rounded disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Mark All Option Toolbar */}
          {activeTab === 'student' && (hasPermission('attendance_manage') || hasPermission('attendance_manage_my') || isTeacherRole) && !isVicePrincipalRole && (
            <div className="px-6 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-end">
              <div className="flex items-center gap-1.5 bg-neutral-150 p-1 rounded-xl border border-neutral-200 shadow-sm">
                <span className="text-[9px] font-extrabold text-neutral-500 uppercase tracking-wider font-mono px-1">All:</span>
                <button
                  type="button"
                  onClick={() => handleMarkAllWithConfirm('present')}
                  className="px-2 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer active:scale-95 border border-green-200 bg-green-50 text-green-700 hover:bg-green-100/90 shadow-sm"
                >
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                  <span>Present</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAllWithConfirm('absent')}
                  className="px-2 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer active:scale-95 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100/90 shadow-sm"
                >
                  <XCircle className="w-3 h-3 text-red-600" />
                  <span>Absent</span>
                </button>
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b-2 border-indigo-500 text-[13px] font-extrabold uppercase text-white shadow-md">
                  {activeTab === 'student' ? (
                    <>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all rounded-tl-2xl text-indigo-300 hover:text-indigo-200"
                        onClick={() => handleSort('rollNumber')}
                      >
                        <div className="flex items-center gap-2">
                          Roll No
                          {sortConfig?.key === 'rollNumber' ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-indigo-300" /> : <ChevronDown className="w-3.5 h-3.5 text-indigo-300" />
                          ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-emerald-300 hover:text-emerald-200"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-2">
                          Name (Total: {sortedPeople.length})
                          {sortConfig?.key === 'name' ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-300" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-300" />
                          ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                        </div>
                      </th>
                    </>
                  ) : (
                    <>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all rounded-tl-2xl text-emerald-300 hover:text-emerald-200"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-2">
                          Name (Total: {sortedPeople.length})
                          {sortConfig?.key === 'name' ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-300" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-300" />
                          ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-indigo-300 hover:text-indigo-200"
                        onClick={() => handleSort('role')}
                      >
                        <div className="flex items-center gap-2">
                          Role
                          {sortConfig?.key === 'role' ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-indigo-300" /> : <ChevronDown className="w-3.5 h-3.5 text-indigo-300" />
                          ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                        </div>
                      </th>
                    </>
                  )}
                  <th className="px-6 py-4 text-amber-300 select-none">
                    {activeTab === 'staff' ? 'Phone' : 'Father Name'}
                  </th>
                  <th 
                    className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-pink-300 hover:text-pink-200"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-2">
                      Status
                      {sortConfig?.key === 'status' ? (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-pink-300" /> : <ChevronDown className="w-3.5 h-3.5 text-pink-300" />
                      ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right rounded-tr-2xl text-purple-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-neutral-400">Loading...</td></tr>
                ) : paginatedPeople.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-neutral-400">No records found.</td></tr>
                ) : paginatedPeople.map((person) => {
                  const personId = person.uid || person.id;
                  const status = getStatus(personId);
                  const personDisplayName = getPersonDisplayName(person);
                  return (
                    <tr key={personId} className="hover:bg-neutral-50/50 transition-colors group">
                      {activeTab === 'student' ? (
                        <>
                          <td className="px-6 py-4 text-lg text-neutral-600 font-mono">
                            {person.rollNumber || 'N/A'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {person.photoURL ? (
                                <img src={person.photoURL} alt={personDisplayName} className="w-12 h-12 rounded-full object-cover shadow-sm" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 font-bold text-lg">
                                  {(String(personDisplayName || "")).charAt(0)}
                                </div>
                              )}
                              <span className={`font-bold text-lg ${(person.role === 'student' || !person.role || person.role === '') && (String(person.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{personDisplayName}</span>
                              {(person.status === 'non_attending' || person.status === 'non-attending' || person.nonAttending === true || person.isNonAttending === true) && (
                                <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                                  Non-Attending
                                </span>
                              )}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {person.photoURL ? (
                                <img src={person.photoURL} alt={personDisplayName} className="w-12 h-12 rounded-full object-cover shadow-sm" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 font-bold text-lg">
                                  {(String(personDisplayName || "")).charAt(0)}
                                </div>
                              )}
                              <span className={`font-bold text-lg ${(person.role === 'student' || !person.role || person.role === '') && (String(person.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{personDisplayName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-lg text-neutral-600 font-mono">
                            <span className="capitalize px-3 py-1.5 bg-neutral-100 rounded-md text-base">{person.role ? person.role.replace(/_/g, ' ') : 'Staff'}</span>
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 text-lg font-bold text-neutral-600">
                        {activeTab === 'staff' ? (person.phone || 'N/A') : (person.fatherName || person.parentName || 'N/A')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-center ${
                            status === 'present' 
                              ? 'bg-green-100 text-green-700' 
                              : status === 'absent'
                              ? 'bg-red-100 text-red-700'
                              : status === 'holiday'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}>
                            {status === 'not_started' ? 'Not Started' : status === 'holiday' ? 'Holiday' : status}
                          </span>
                          {isActuallyOnLeave(personId) && (
                            <span className="text-[10px] text-amber-600 font-black uppercase flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Approved Leave
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(status === 'not_started' || status === 'holiday') ? (
                          <div className="text-right">
                            <span className="text-[11px] font-black uppercase tracking-wider font-mono px-3 py-1 bg-neutral-100 text-neutral-400 rounded-lg">
                              {status === 'not_started' ? '🔒 Locked (Before Acad Year Start)' : '🏖️ Holiday (No Attendance)'}
                            </span>
                          </div>
                        ) : (hasPermission('attendance_manage') || hasPermission('attendance_manage_my') || isTeacherRole) && !isVicePrincipalRole && (
                          <div className="flex items-center justify-end gap-1.5 border-none">
                            <button 
                              onClick={() => markAttendance(personId, 'present')}
                              className={`p-1.5 rounded-lg transition-all border ${
                                status === 'present' 
                                  ? 'bg-green-600 text-white border-green-600 shadow-sm' 
                                  : 'bg-white text-neutral-400 border-neutral-200 hover:bg-green-50 hover:text-green-600 hover:border-green-300'
                              }`}
                              title="Mark Present"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => markAttendance(personId, 'absent')}
                              className={`p-1.5 rounded-lg transition-all border ${
                                status === 'absent' 
                                  ? 'bg-red-600 text-white border-red-600 shadow-sm' 
                                  : 'bg-white text-neutral-400 border-neutral-200 hover:bg-red-50 hover:text-red-300 hover:text-red-600'
                              }`}
                              title="Mark Absent"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                            {status === 'absent' && hasPermission('whatsapp_send') && (
                              <button 
                                onClick={() => handleManualWhatsApp(person)}
                                className="p-1.5 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-600 hover:text-white transition-all shadow-sm active:scale-95 flex items-center justify-center animate-in zoom-in-50 duration-200"
                                title="Send WhatsApp parent alert manually"
                              >
                                <MessageSquare className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-neutral-100 bg-neutral-50/50 flex justify-center items-center gap-4">
              <button 
                disabled={currentPage === 1}
                onClick={() => {
                  setCurrentPage(prev => Math.max(1, prev - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-all active:scale-95 shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Show pages around current page
                  let pageNum = i + 1;
                  if (totalPages > 5) {
                    if (currentPage > 3) {
                      pageNum = currentPage - 3 + i + 1;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                    }
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setCurrentPage(pageNum);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        currentPage === pageNum 
                          ? 'bg-primary text-white shadow-md shadow-primary/20' 
                          : 'bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button 
                disabled={currentPage === totalPages}
                onClick={() => {
                  setCurrentPage(prev => Math.min(totalPages, prev + 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-all active:scale-95 shadow-sm"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Summary & Stats */}
        {(!isStudent && !isParent) && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Frequent Absentees (Last 30 Days)
              </h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {frequentAbsentees.filter(fa => filteredPeople.some(p => (p.uid || p.id) === fa.id)).length === 0 ? (
                  <div className="text-sm text-neutral-500 text-center py-4 bg-neutral-50 rounded-xl">
                    No frequent absentees found.
                  </div>
                ) : (
                  frequentAbsentees.filter(fa => filteredPeople.some(p => (p.uid || p.id) === fa.id)).map(fa => {
                    const person = filteredPeople.find(p => (p.uid || p.id) === fa.id)!;
                    const personId = person?.uid || person?.id || fa.id;
                    const personDisplayName = getPersonDisplayName(person);
                    return (
                      <div key={personId} className="flex items-center justify-between p-2 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer group">
                        <div className="flex items-center gap-3">
                          {person?.photoURL ? (
                            <img src={person.photoURL} alt={personDisplayName} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm">
                              {(String(personDisplayName || "")).charAt(0)}
                            </div>
                          )}
                          <div>
                            <span className="text-base font-bold text-sidebar block">{personDisplayName}</span>
                            <span className="text-xs text-neutral-400 font-bold">
                              {activeTab === 'staff' 
                                ? (person?.role ? person.role.replace(/_/g, ' ') : 'Staff') 
                                : (person?.rollNumber || person?.classId || 'Student')
                              }
                            </span>
                          </div>
                        </div>
                        <span className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-bold">{fa.count} absences</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-sidebar" />
                {activeTab === 'staff' ? "Today's Staff Absentees" : "Today's Absentees"}
              </h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {filteredPeople.filter(p => getStatus(p.uid || p.id) === 'absent').length === 0 ? (
                  <div className="text-sm text-neutral-500 text-center py-4 bg-neutral-50 rounded-xl">
                    {activeTab === 'staff' ? "No staff marked absent today" : "No students marked absent today"}
                  </div>
                ) : (
                  filteredPeople.filter(p => getStatus(p.uid || p.id) === 'absent').map(absentee => {
                    const absenteeId = absentee.uid || absentee.id;
                    const absenteeDisplayName = getPersonDisplayName(absentee);
                    return (
                    <div key={absenteeId} className="flex items-center justify-between p-2 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3">
                        {absentee.photoURL ? (
                          <img src={absentee.photoURL} alt={absenteeDisplayName} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 font-bold text-sm">
                            {(String(absenteeDisplayName || "")).charAt(0)}
                          </div>
                        )}
                        <div>
                          <span className="text-base font-bold text-sidebar block">{absenteeDisplayName}</span>
                          <span className="text-xs text-neutral-400 font-bold">
                            {activeTab === 'staff' 
                              ? (absentee.role ? absentee.role.replace(/_/g, ' ') : 'Staff') 
                              : (absentee.rollNumber || absentee.classId || 'Student')
                            }
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-bold">Absent</span>
                        {hasPermission('whatsapp_send') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManualWhatsApp(absentee);
                            }}
                            className="p-2 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-xl transition-all shadow-sm"
                            title="Send Manual WhatsApp Alert"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }))}
              </div>
            </div>
          </div>
        )}
      </div>
      </>
      )}
      <SmartAttendanceModal 
        isOpen={showSmartModal}
        onClose={() => setShowSmartModal(false)}
        people={people.filter(p => activeTab === 'staff' ? (p.role !== 'student' && p.role !== 'parent') : (p.role === 'student' || !p.role || p.role === ''))}
        type={activeTab === 'staff' ? 'staff' : 'student'}
        onMarkAttendance={handleSmartAttendance}
      />

      {confirmConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 animate-in zoom-in-95 duration-150">
            <h3 className="text-xl font-black text-neutral-900 mb-2">{confirmConfig.title}</h3>
            <p className="text-md text-neutral-600 mb-6 font-semibold">{confirmConfig.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmConfig(null)}
                className="px-6 py-3 rounded-2xl text-neutral-600 hover:bg-neutral-100 font-extrabold transition-all text-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const onConfirm = confirmConfig.onConfirm;
                  setConfirmConfig(null);
                  onConfirm();
                }}
                className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold transition-all text-md shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const calculateAutoWorkingDaysForYear = (startYear: number, endYear: number, holidayList: any[]) => {
  const result: Record<string, number> = {
    'JUNE': 14, 'JULY': 25, 'AUGUST': 20,
    'SEPTEMBER': 16, 'OCTOBER': 19, 'NOVEMBER': 25,
    'DECEMBER': 24, 'JANUARY': 18, 'FEBRUARY': 24,
    'MARCH': 20, 'APRIL': 18
  };

  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  Object.keys(result).forEach(monthName => {
    if (monthName === 'JUNE') {
      result['JUNE'] = 14;
      return;
    }
    if (monthName === 'JULY') {
      result['JULY'] = 25;
      return;
    }
    const monthIdx = monthNames.indexOf(monthName);
    const year = (monthIdx >= 5) ? startYear : endYear;
    
    const totalDays = new Date(year, monthIdx + 1, 0).getDate();
    let workingDaysCount = 0;

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, monthIdx, d);
      
      // 1. June before 12th is excluded
      if (monthIdx === 5 && d < 12) {
        continue;
      }

      // 2. Sundays are excluded
      if (date.getDay() === 0) {
        continue;
      }

      // 3. Second Saturdays are excluded
      const isSecondSaturday = date.getDay() === 6 && d >= 8 && d <= 14;
      if (isSecondSaturday) {
        continue;
      }

      // 4. Academic holidays check
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isHoliday = holidayList.some((h: any) => {
        if (h.type === 'working_day') return false;
        const start = h.date;
        const end = h.toDate || h.date;
        return dateStr >= start && dateStr <= end;
      });

      if (isHoliday) {
        continue;
      }

      workingDaysCount++;
    }

    result[monthName] = workingDaysCount;
  });

  result['JUNE'] = 14;
  result['JULY'] = 25;
  return result;
};

const ConsolidatedAttendanceRegister = ({ students, selectedClass, selectedBatch }: any) => {
  const { settings } = useSettings();
  const currentYear = settings?.currentAcademicYear || '2026-27';
  const yearParts = currentYear.split('-');
  const startYear = parseInt(yearParts[0]) || 2026;
  let endYear = yearParts[1] ? parseInt(yearParts[1]) : startYear + 1;
  if (endYear < 100) endYear += 2000;



  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingDays, setWorkingDays] = useState<Record<string, number>>({
    'JUNE': 14, 'JULY': 25, 'AUGUST': 20,
    'SEPTEMBER': 16, 'OCTOBER': 19, 'NOVEMBER': 25,
    'DECEMBER': 24, 'JANUARY': 18, 'FEBRUARY': 24,
    'MARCH': 20, 'APRIL': 18
  });
  const [isEditingWorkingDays, setIsEditingWorkingDays] = useState(false);
  const [autoCalc, setAutoCalc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBatch, selectedClass, students]);

  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const paginatedStudents = students.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    const fetchBatchAttendance = async () => {
      if (!selectedBatch || students.length === 0 || selectedBatch === 'all') return;
      setLoading(true);
      try {
        // Fetch all attendance records for the students in this batch for the current academic year
        // We fetch ALL records (present/absent) to correctly identify "Working Days"
        const start = `${startYear}-06-01`;
        const end = `${endYear}-05-31`;
        
        const [allAttendance, holidayList] = await Promise.all([
          dbService.list('attendance', [
            where('date', '>=', start),
            where('date', '<=', end)
          ]),
          dbService.list('holidays').catch(() => [] as any[])
        ]);
        
        const studentIds = new Set(students.map((s: any) => s.id || s.uid));
        
        const filteredAttendance = allAttendance.filter((a: any) => {
          if (!studentIds.has(a.studentId)) return false;
          
          const date = new Date(a.date);
          const month = date.getMonth(); // 0-11
          const year = date.getFullYear();
          
          if (month >= 5) {
            return year === startYear;
          } else {
            return year === endYear;
          }
        });
        
        setAttendance(filteredAttendance);

        // Calculate Auto Working Days from the new calendar and reopen rules
        const autoDays = calculateAutoWorkingDaysForYear(startYear, endYear, holidayList);
        autoDays['JUNE'] = 14;
        autoDays['JULY'] = 25;

        // Try to fetch custom working days if saved globally (school-wide), otherwise use auto-calculated
        let savedDays: any = null;
        const globalSettingsDoc = await dbService.get('examSettings', 'workingDays-school');
        if (globalSettingsDoc && globalSettingsDoc.data) {
          savedDays = globalSettingsDoc.data;
        } else {
          const batchSettingsDoc = await dbService.get('examSettings', `workingDays-${selectedBatch}`);
          if (batchSettingsDoc && batchSettingsDoc.data) {
            savedDays = batchSettingsDoc.data;
          }
        }

        if (savedDays) {
          if (!savedDays['JUNE'] || savedDays['JUNE'] === 13 || savedDays['JUNE'] === 0) savedDays['JUNE'] = 14;
          if (!savedDays['JULY'] || savedDays['JULY'] === 0) savedDays['JULY'] = 25;
        }

        if (savedDays && !autoCalc) {
          setWorkingDays(savedDays);
          setAutoCalc(false);
        } else {
          setWorkingDays(autoDays);
          setAutoCalc(true);
        }
      } catch (error) {
        console.error('Error fetching attendance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBatchAttendance();
  }, [selectedBatch, students, currentYear, startYear, endYear, autoCalc]);

  const saveWorkingDays = async () => {
    try {
      await dbService.set('examSettings', 'workingDays-school', { data: workingDays });
      await dbService.set('examSettings', `workingDays-${selectedBatch}`, { data: workingDays });
      setIsEditingWorkingDays(false);
      toast.success('Working days updated for entire school');
    } catch (error) {
      toast.error('Failed to save working days');
    }
  };

  const quarters = [
    { name: 'I-QUARTER', months: ['JUNE', 'JULY', 'AUGUST'], color: 'bg-[#FFDEE2] text-[#800000]' },
    { name: 'II-QUARTER', months: ['SEPTEMBER', 'OCTOBER', 'NOVEMBER'], color: 'bg-[#FFDEE2] text-[#800000]' },
    { name: 'III-QUARTER', months: ['DECEMBER', 'JANUARY', 'FEBRUARY'], color: 'bg-[#FFDEE2] text-[#800000]' },
    { name: 'IV-QUARTER', months: ['MARCH', 'APRIL'], color: 'bg-[#FFDEE2] text-[#800000]' }
  ];

  const getMonthPresentCount = (studentId: string, monthName: string) => {
    const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const monthIndex = monthNames.indexOf(monthName);

    // If student is non_attending, return working days minus any explicit absent records
    const student = students.find((s: any) => (s.id || s.uid) === studentId);
    if (student && (student.status === 'non_attending' || student.status === 'non-attending')) {
      const workingDaysCount = workingDays[monthName] || 22;
      const explicitAbsents = attendance.filter(a => {
        const sId = a.studentId || a.userId;
        if (sId !== studentId || a.status !== 'absent') return false;
        const date = new Date(a.date);
        const year = date.getFullYear();
        const month = date.getMonth();
        if (month !== monthIndex) return false;
        return month >= 5 ? year === startYear : year === endYear;
      }).length;
      return Math.max(0, workingDaysCount - explicitAbsents);
    }
    
    return attendance.filter(a => {
      const sId = a.studentId;
      if (sId !== studentId || a.status !== 'present') return false;
      
      const date = new Date(a.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      
      if (month !== monthIndex) return false;

      // Ensure year matches the academic year context
      if (month >= 5) {
        return year === startYear;
      } else {
        return year === endYear;
      }
    }).length;
  };

  const calculateQuarterTotal = (studentId: string, months: string[]): number => {
    return months.reduce((acc, month) => acc + getMonthPresentCount(studentId, month), 0);
  };

  const calculateGrandTotal = (studentId: string): number => {
    return quarters.reduce((acc, q) => acc + calculateQuarterTotal(studentId, q.months), 0);
  };

  const calculateWorkingGrandTotal = (): number => {
    return (Object.values(workingDays) as number[]).reduce((acc: number, val: number) => acc + val, 0);
  };

  if (selectedBatch === 'all') {
    return (
      <div className="p-20 text-center bg-white rounded-3xl border border-neutral-200">
        <Filter className="w-16 h-16 text-neutral-200 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-sidebar">Select a Batch</h3>
        <p className="text-neutral-500 mt-2">Please select a specific batch to view the consolidated register.</p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-x-auto text-sidebar bg-white rounded-3xl border border-neutral-200 shadow-sm">
      <div className="min-w-[1240px]">
        {/* Header */}
        <div className="bg-blue-700 text-white p-3 flex justify-between items-center text-sm font-bold uppercase tracking-wide rounded-t-2xl">
          <span>ACADEMIC YEAR - {currentYear}</span>
          <span className="flex items-center gap-2 italic">Consolidated Attendance Register</span>
          <div className="flex items-center gap-3">
            <span className="text-[12px] opacity-70">Showing {paginatedStudents.length} of {students.length} students</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-1 hover:bg-blue-600 rounded disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold">Page {currentPage} of {totalPages}</span>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="p-1 hover:bg-blue-600 rounded disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <span>Records Analysis</span>
        </div>

        {/* Action Bar */}
        <div className="my-6 flex flex-wrap justify-end gap-3 px-2">
          <button 
            onClick={() => setAutoCalc(!autoCalc)}
            className={`flex items-center gap-3 px-6 py-4 rounded-xl text-sm font-black transition-all ${autoCalc ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-neutral-100 text-neutral-600 border border-neutral-200'}`}
          >
            <Sparkles className={`w-5 h-5 ${autoCalc ? 'text-amber-500' : 'text-neutral-400'}`} />
            {autoCalc ? 'Auto-Calculating Working Days' : 'Manual Working Days'}
          </button>

          <button 
            onClick={() => {
              const exportData = students.map((student: any, idx: number) => {
                const sId = student.id || student.uid;
                const grandTotal = calculateGrandTotal(sId);
                const workingGrandTotal = calculateWorkingGrandTotal();
                const percentage = workingGrandTotal > 0 ? (grandTotal / workingGrandTotal) * 100 : 0;

                const row: any = {
                  'Admn. No': student.admissionNumber || '',
                  'Roll No': student.rollNumber || (idx + 1),
                  'Student Name': getPersonDisplayName(student),
                  'Father Name': student.fatherName || student.parentName || 'N/A'
                };

                // Add monthly counts
                quarters.forEach(q => {
                  q.months.forEach(m => {
                    row[`${m} (Present)`] = getMonthPresentCount(sId, m);
                    row[`${m} (Working)`] = workingDays[m] || 0;
                  });
                });

                row['Grand Total Present'] = grandTotal;
                row['Grand Total Working'] = workingGrandTotal;
                row['Percentage'] = `${Math.round(percentage)}%`;

                return row;
              });

              const csv = Papa.unparse(exportData);
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.setAttribute('href', url);
              link.setAttribute('download', `consolidated_attendance_${selectedBatch}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
              toast.success("Consolidated register exported as CSV");
            }}
            className="flex items-center gap-3 px-10 py-5 bg-neutral-800 text-white rounded-2xl text-xl font-black shadow-xl shadow-neutral-500/20 hover:bg-neutral-900 transition-all active:scale-95 leading-none group"
          >
            <Download className="w-8 h-8 group-hover:scale-110 transition-transform" /> Export Register
          </button>
          
          {isEditingWorkingDays ? (
            <button onClick={saveWorkingDays} className="flex items-center gap-3 px-10 py-5 bg-green-600 text-white rounded-2xl text-xl font-black shadow-xl shadow-green-500/20 hover:bg-green-700 transition-all active:scale-95 leading-none group">
              <Save className="w-8 h-8 group-hover:scale-110 transition-transform" /> Save Working Days
            </button>
          ) : (
            <button onClick={() => setIsEditingWorkingDays(true)} className="flex items-center gap-3 px-10 py-5 bg-primary text-white rounded-2xl text-xl font-black shadow-xl shadow-primary/20 hover:bg-sidebar transition-all active:scale-95 leading-none group">
              <Plus className="w-8 h-8 group-hover:scale-110 transition-transform" /> Edit Working Days
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden mb-6">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              {/* Quarter Headers */}
              <tr>
                <th rowSpan={4} className="border border-neutral-200 w-16 p-2 bg-neutral-50 text-blue-700">Admn.No</th>
                <th rowSpan={4} className="border border-neutral-200 w-10 p-2 bg-neutral-50 text-red-600">Sno</th>
                <th rowSpan={4} className="border border-neutral-200 w-48 p-2 bg-neutral-50 text-red-600">Name of the Student</th>
                <th rowSpan={4} className="border border-neutral-200 w-40 p-2 bg-neutral-50 text-blue-700">Name of the Father</th>
                {quarters.map((q) => (
                  <th key={q.name} colSpan={q.months.length + 1} className={`border border-neutral-200 py-1.5 font-black tracking-tighter ${q.color}`}>
                    {q.name}
                  </th>
                ))}
                <th rowSpan={4} className="border border-neutral-200 bg-red-600 text-white w-16 font-black py-2">GRAND TOTAL</th>
                <th rowSpan={4} className="border border-neutral-200 bg-red-600 text-white w-16 font-black py-2">PERCENTAGE</th>
              </tr>
              {/* Month Names and Group Headers */}
              <tr className="bg-neutral-50 font-bold uppercase">
                {quarters.map((q) => (
                  <React.Fragment key={`${q.name}-months`}>
                    {q.months.map(m => (
                      <th key={m} className="border border-neutral-200 p-1 text-red-600 text-[10px] w-12">{m.substring(0, 3)}</th>
                    ))}
                    <th className="border border-neutral-200 p-1 bg-neutral-200 font-black">TOTAL</th>
                  </React.Fragment>
                ))}
              </tr>
              {/* Working Days Row */}
              <tr className="bg-white text-center font-black">
                {quarters.map((q) => (
                  <React.Fragment key={`${q.name}-wd`}>
                    {q.months.map(m => {
                      const displayVal = (m === 'JUNE') ? (workingDays[m] && workingDays[m] > 13 ? workingDays[m] : 14) : ((m === 'JULY') ? (workingDays[m] && workingDays[m] > 0 ? workingDays[m] : 25) : (workingDays[m] || 0));
                      return (
                        <th key={m} className="border border-neutral-200 p-1 bg-[#FFFFE0]">
                          {isEditingWorkingDays ? (
                            <input 
                              type="number" 
                              value={workingDays[m] || displayVal}
                              onChange={(e) => setWorkingDays({...workingDays, [m]: Number(e.target.value)})}
                              className="w-full bg-transparent text-center border-b border-primary/20 outline-none"
                            />
                          ) : (
                            displayVal
                          )}
                        </th>
                      );
                    })}
                    <th className="border border-neutral-200 p-1 bg-[#D1E8FF] text-blue-800">
                      {q.months.reduce((acc: number, m: string) => {
                        const val = (m === 'JUNE') ? (workingDays[m] && workingDays[m] > 13 ? workingDays[m] : 14) : ((m === 'JULY') ? (workingDays[m] && workingDays[m] > 0 ? workingDays[m] : 25) : (workingDays[m] || 0));
                        return acc + val;
                      }, 0)}
                    </th>
                  </React.Fragment>
                ))}
              </tr>
              {/* Labels */}
              <tr className="bg-neutral-50 text-center font-bold">
                {quarters.map((q) => (
                  <React.Fragment key={`${q.name}-dp-label`}>
                    {q.months.map(m => <th key={m} className="border border-neutral-200 p-0.5 text-[9px] uppercase italic text-neutral-400">D.P</th>)}
                    <th className="border border-neutral-200 p-0.5 bg-[#D1E8FF] uppercase italic text-[9px]">Sum</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white text-center italic">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={24} className="p-12 text-neutral-400 italic bg-neutral-50 underline decoration-dotted">
                    No active students found for this selection
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((student: any, idx: number) => {
                  const sId = student.id || student.uid;
                  const realIdx = (currentPage - 1) * pageSize + idx;
                  const grandTotal: number = calculateGrandTotal(sId);
                  const workingGrandTotal: number = calculateWorkingGrandTotal();
                  const percentage = workingGrandTotal > 0 ? (grandTotal / workingGrandTotal) * 100 : 0;

                  return (
                    <tr key={sId} className="hover:bg-neutral-50 transition-colors group">
                      <td className="border border-neutral-200 p-1.5 font-black text-blue-800">{student.admissionNumber || ''}</td>
                      <td className="border border-neutral-200 p-1.5 text-red-600 font-bold">{student.rollNumber || (realIdx + 1)}</td>
                      <td className={`border border-neutral-200 p-1.5 text-left pl-3 font-medium not-italic ${(String(student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{getPersonDisplayName(student)}</td>
                      <td className="border border-neutral-200 p-1.5 text-left pl-3 text-neutral-500 not-italic">{student.fatherName || student.parentName || 'N/A'}</td>
                      
                      {quarters.map((q) => {
                        const qTotal = calculateQuarterTotal(sId, q.months);
                        return (
                          <React.Fragment key={`${sId}-${q.name}`}>
                            {q.months.map(m => (
                              <td key={m} className="border border-neutral-200 p-1.5">
                                {getMonthPresentCount(sId, m) || '-'}
                              </td>
                            ))}
                            <td className="border border-neutral-200 p-1.5 font-black bg-[#D1E8FF] text-blue-800">
                              {qTotal || '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      
                      <td className="border border-neutral-200 p-1.5 font-black bg-[#E6F3FF] text-blue-900 text-sm">{grandTotal}</td>
                      <td className="border border-neutral-200 p-1.5 font-black bg-neutral-100 text-neutral-700">{Math.round(percentage)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Footer Summary */}
            <tfoot className="bg-neutral-800 text-white font-bold uppercase text-[9px] tracking-tight">
              <tr>
                <td colSpan={4} className="border border-neutral-700 p-2 text-right pr-6 italic text-[10px]">Batch Average Summary (Days Present)</td>
                {quarters.map((q) => (
                  <React.Fragment key={`footer-${q.name}`}>
                    {q.months.map(m => (
                      <td key={m} className="border border-neutral-700 p-1.5">
                        {students.length > 0 ? Math.round(students.reduce((acc: number, s: any) => acc + getMonthPresentCount(s.id || s.uid, m), 0) / students.length) : 0}
                      </td>
                    ))}
                    <td className="border border-neutral-700 p-1.5 bg-neutral-700 text-blue-300">
                      {students.length > 0 ? Math.round(students.reduce((acc: number, s: any) => acc + calculateQuarterTotal(s.id || s.uid, q.months), 0) / students.length) : 0}
                    </td>
                  </React.Fragment>
                ))}
                <td className="border border-neutral-700 p-1.5 bg-neutral-700 text-blue-300">
                  {calculateWorkingGrandTotal()}
                </td>
                <td className="border border-neutral-700 p-1.5 bg-neutral-700 uppercase">AVG %</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
