import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useSettings } from '../context/SettingsContext';
import { 
  Users, 
  GraduationCap, 
  CalendarCheck, 
  TrendingUp, 
  AlertCircle,
  Sparkles,
  Calendar,
  MessageSquare,
  Clock,
  Settings as SettingsIcon,
  Upload,
  Banknote,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Shield,
  Wallet,
  Receipt,
  History,
  Activity,
  Heart,
  Target,
  Trophy,
  UserCheck,
  CheckSquare,
  X,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { dbService, checkQuotaStatus, handleFirestoreError, OperationType } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { generateAIContent, getStrategicAnalysis } from '../services/aiService';
import { uploadService } from '../services/uploadService';
import { normalizeUrl } from '../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line as ReLine, 
  BarChart, 
  Bar as ReBar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ReTooltip, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { where, orderBy, limit, query, collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';

import NoticeBoard from '../components/NoticeBoard';
import UserActivityPanel from '../components/UserActivityPanel';
import { IndexNoticeBanner } from '../components/IndexNoticeBanner';
import { format } from 'date-fns';
import { calculateStudentFee, normalizeYear, computeStudentFeeMetrics, calculateFinancialOverview } from '../lib/feeUtils';

const getYearFormats = (year: string): string[] => {
  if (!year) return [];
  const parts = year.split('-');
  if (parts.length !== 2) return [year];
  const start = parts[0];
  const end = parts[1];
  if (start.length === 4 && end.length === 4) {
    const shortEnd = end.slice(2);
    return [year, `${start}-${shortEnd}`];
  } else if (start.length === 4 && end.length === 2) {
    const century = start.slice(0, 2);
    return [year, `${start}-${century}${end}`];
  }
  return [year];
};

const VerifiedTodayList: React.FC = () => {
  const { hasPermission, isAdmin, isPrincipal, isVicePrincipal } = usePermissions();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only show for management or roles with specific permission
    if (!isAdmin && !isPrincipal && !isVicePrincipal && !hasPermission('staff_attendance_view')) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch Today's Staff Attendance
        const staffAttendance = await dbService.list('staff_attendance', [
          where('date', '==', today),
          where('status', '==', 'present')
        ]);
        
        // Fetch Today's Student Permissions if authorized to prevent permission-denied logs
        let studentPermissions: any[] = [];
        if (isAdmin || isPrincipal || isVicePrincipal || hasPermission('attendance_manage')) {
          studentPermissions = await dbService.list('student_permissions', [
            where('date', '==', today)
          ]).catch(() => []);
        }

        // Get Users to display names/photos
        const userIds = [
          ...staffAttendance.map((a: any) => a.userId),
          ...studentPermissions.map((p: any) => p.studentId)
        ];

        if (userIds.length === 0) {
          setItems([]);
          return;
        }

        // Fetch user details for these IDs (limit to 50 as per request)
        const uniqueUserIds = Array.from(new Set(userIds)).slice(0, 50);
        const usersData = await Promise.all(
          uniqueUserIds.map(id => dbService.get('users', id))
        );

        const formattedItems = uniqueUserIds.map(uid => {
          const user = usersData.find(u => u?.uid === uid);
          if (!user) return null;

          const staffRecord = staffAttendance.find((a: any) => a.userId === uid);
          const studentRecord = studentPermissions.find((p: any) => p.studentId === uid);

          return {
            uid,
            name: user.name,
            photo: user.photoURL,
            role: user.role,
            time: staffRecord?.timestamp || studentRecord?.time || today,
            type: staffRecord ? 'attendance' : 'permission',
            isLate: staffRecord?.isLate || false
          };
        }).filter(Boolean);

        setItems(formattedItems as any[]);
      } catch (e) {
        console.error("Error fetching today verified:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[3rem] border border-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] overflow-hidden"
    >
      <div className="p-8 border-b border-neutral-50 bg-neutral-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl text-primary">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sidebar uppercase tracking-tight text-sm">Today's Verified List</h3>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Real-time Biometric & Permission Sync</p>
          </div>
        </div>
        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full uppercase">Live Sync</span>
      </div>
      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto max-h-[500px] custom-scrollbar bg-neutral-50/30">
        {items.map((item) => (
          <div key={item.uid} className="flex items-center gap-4 p-4 rounded-3xl bg-white border border-neutral-100 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all group scale-100 hover:scale-[1.02] active:scale-[0.98]">
            <div className="relative">
              <img 
                src={item.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=random`} 
                alt="" 
                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                referrerPolicy="no-referrer"
              />
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${item.type === 'attendance' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                {item.type === 'attendance' ? <CheckSquare className="w-2 h-2 text-white" /> : <Clock className="w-2 h-2 text-white" />}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-sidebar truncate">{item.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-bold uppercase ${item.isLate ? 'text-rose-500' : 'text-neutral-400'}`}>
                  {item.isLate ? 'LATE' : item.role?.replace('_', ' ')}
                </span>
                <span className="text-neutral-300">•</span>
                <span className="text-[10px] font-medium text-neutral-400">
                  {item.time.includes('T') ? format(new Date(item.time), 'hh:mm a') : item.time}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const StatCard = ({ icon: Icon, label, value, trend, variant = "indigo", delay = 0, onClick }: any) => {
  const variants: any = {
    indigo: "from-indigo-600 to-indigo-800 border-indigo-400/20 shadow-indigo-500/10 hover:shadow-indigo-500/20",
    rose: "from-rose-600 to-rose-800 border-rose-400/20 shadow-rose-500/10 hover:shadow-rose-500/20",
    emerald: "from-emerald-600 to-emerald-800 border-emerald-400/20 shadow-emerald-500/10 hover:shadow-emerald-500/20",
    amber: "from-amber-500 to-amber-700 border-amber-400/20 shadow-amber-500/10 hover:shadow-amber-500/20",
    violet: "from-violet-600 to-violet-800 border-violet-400/20 shadow-violet-500/10 hover:shadow-violet-500/20",
    blue: "from-blue-600 to-blue-800 border-blue-400/20 shadow-blue-500/10 hover:shadow-blue-500/20",
    orange: "from-orange-500 to-orange-700 border-orange-400/20 shadow-orange-500/10 hover:shadow-orange-500/20"
  };

  const currentVariant = variants[variant] || variants.indigo;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -10, scale: 1.03, rotateX: 2, rotateY: -2 }}
      onClick={onClick}
      className={`p-7 rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] border-2 bg-gradient-to-br ${currentVariant} transition-all duration-500 group relative overflow-hidden perspective-1000 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/20 rounded-full blur-[60px] -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
      
      <div className="flex justify-between items-start mb-8 relative z-10">
        <div className="p-4 rounded-2xl bg-white/25 backdrop-blur-xl shadow-[0_10px_20px_-5px_rgba(0,0,0,0.2)] border border-white/30 transform group-hover:rotate-12 transition-transform">
          <Icon className="w-7 h-7 text-white drop-shadow-sm" />
        </div>
        <div className="px-4 py-1.5 bg-black/10 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-[0.25em] text-white border border-white/10 shadow-inner">
          {trend}
        </div>
      </div>
      
      <div className="relative z-10 transition-transform group-hover:translate-x-1">
        <h3 className="text-white/80 text-[11px] font-black uppercase tracking-[0.3em] mb-1.5 drop-shadow-sm">{label}</h3>
        <p className="text-4xl font-black tracking-tighter tabular-nums text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.25)]">{value}</p>
      </div>
      
      {/* 3D Glass Highlight */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
    </motion.div>
  );
};

const ActivityItem = ({ title, time, type }: any) => (
  <div className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0">
    <div>
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-neutral-400">{time}</p>
    </div>
    <span className="text-[10px] bg-neutral-100 px-2 py-1 rounded-full font-bold uppercase text-neutral-500">{type}</span>
  </div>
);

const AlertItem = ({ title, description }: any) => (
  <div className="p-4 bg-red-50 rounded-xl border border-red-100">
    <p className="font-bold text-sm text-red-700 mb-1">{title}</p>
    <p className="text-xs text-red-600/80">{description}</p>
  </div>
);

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { 
    profile, 
    hasPermission, 
    isAdmin, 
    isVicePrincipal,
    isPrincipal,
    isTeacher,
    isStudent,
    isParent,
    isAccountant,
    isSuperAdmin
  } = usePermissions();
  const { settings, updateSettings } = useSettings();
  const [stats, setStats] = useState<any>({
    students: 0,
    teachers: 0,
    attendance: 0,
    fees: 0,
    todayCollection: 0,
    pendingDues: 0,
    totalExpenses: 0,
    recentPayments: [],
    pendingLeaves: 0,
    presentCount: 0,
    absentCount: 0
  });
  const [waStats, setWaStats] = useState({
    total: 0,
    delivered: 0,
    processing: 0,
    failed: 0
  });
  const [waEngineStatus, setWaEngineStatus] = useState<'connecting' | 'open' | 'close' | 'qr' | null>(null);

  useEffect(() => {
    const checkWaStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          setWaEngineStatus(data.status);
        }
      } catch (err) {
        console.warn("Failed to check WhatsApp status in Dashboard:", err);
      }
    };
    checkWaStatus();
    const interval = setInterval(checkWaStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Concession Shortcut States
  const [isConcessionModalOpen, setIsConcessionModalOpen] = useState(false);
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(format(new Date(), 'HH:mm'));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(format(new Date(), 'HH:mm'));
    }, 10000); // Check every 10 seconds to keep live schedule precise
    return () => clearInterval(timer);
  }, []);
  const [revenueDetails, setRevenueDetails] = useState<any>({
    totalPayable: 0,
    totalCollected: 0,
    totalPending: 0,
    term1Collected: 0,
    term1Pending: 0,
    term2Collected: 0,
    term2Pending: 0,
    term3Collected: 0,
    term3Pending: 0,
  });
  const [concessionClasses, setConcessionClasses] = useState<any[]>([]);
  const [concessionClassStudents, setConcessionClassStudents] = useState<any[]>([]);
  const [allConcessions, setAllConcessions] = useState<any[]>([]);
  const [concessionBatches, setConcessionBatches] = useState<any[]>([]);
  
  const [selectedConcessionClass, setSelectedConcessionClass] = useState('');
  const [selectedConcessionBatch, setSelectedConcessionBatch] = useState('');
  const [selectedConcessionStudent, setSelectedConcessionStudent] = useState('');
  const [selectedConcessionId, setSelectedConcessionId] = useState('');
  const [customConcessionAmount, setCustomConcessionAmount] = useState<number | ''>('');
  const [processingConcession, setProcessingConcession] = useState(false);

  const [studentsForSearch, setStudentsForSearch] = useState<any[]>([]);
  const [concessionSearchQuery, setConcessionSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleOpenConcessionModal = async () => {
    if (profile?.role === 'clerk' || profile?.role === 'teacher' || profile?.role?.toLowerCase().includes('teacher')) {
      toast.error("You do not have permission to manage fee concessions.");
      return;
    }
    setIsConcessionModalOpen(true);
    setConcessionSearchQuery('');
    setSelectedConcessionClass('');
    setSelectedConcessionBatch('');
    setSelectedConcessionStudent('');
    setSelectedConcessionId('');
    setCustomConcessionAmount('');
    try {
      const [classesData, concessionsData, studentsData, batchesData] = await Promise.all([
        dbService.list('classes', [limit(200)]),
        dbService.list('concessions', [limit(200)]),
        dbService.list('students', [limit(3000)]),
        dbService.list('batches', [limit(200)])
      ]);
      setConcessionClasses(classesData || []);
      setAllConcessions(concessionsData || []);
      setStudentsForSearch(studentsData || []);
      setConcessionBatches(batchesData || []);
    } catch (e) {
      console.error("Error loading concession metadata:", e);
      toast.error("Failed to load classes and concessions data");
    }
  };

  useEffect(() => {
    // Only reset batch if the current batch is not related to the new class to prevent losing search-selected batch
    const isBatchInClass = concessionBatches.some(b => b.id === selectedConcessionBatch && b.classId === selectedConcessionClass);
    if (!isBatchInClass) {
      setSelectedConcessionBatch('');
    }
    if (!selectedConcessionClass) {
      setConcessionClassStudents([]);
      return;
    }
    
    const fetchClassStudents = async () => {
      try {
        const studentsData = await dbService.list('students', [
          where('classId', '==', selectedConcessionClass),
          limit(200)
        ]);
        setConcessionClassStudents(studentsData || []);
      } catch (e) {
        console.error("Error loading class students:", e);
        toast.error("Failed to load class students");
      }
    };
    
    fetchClassStudents();
  }, [selectedConcessionClass]);

  const filteredStudents = concessionSearchQuery.trim().length >= 3
    ? studentsForSearch.filter(s => {
        const query = concessionSearchQuery.toLowerCase();
        const nameMatch = (s.name || '').toLowerCase().includes(query);
        const fatherMatch = (s.fatherName || '').toLowerCase().includes(query);
        const emailMatch = (s.email || '').toLowerCase().includes(query);
        const phoneMatch = (s.phone || '').toLowerCase().includes(query) || 
                           (s.contact || '').toLowerCase().includes(query) ||
                           (s.whatsappNumber || '').toLowerCase().includes(query);
        
        return nameMatch || fatherMatch || emailMatch || phoneMatch;
      })
    : [];

  const handleApplyConcession = async () => {
    if (profile?.role === 'clerk') {
      toast.error("Clerks do not have permission to manage fee concessions.");
      return;
    }
    if (!selectedConcessionStudent) {
      toast.error("Please select a student");
      return;
    }
    if (!selectedConcessionId) {
      toast.error("Please select a concession");
      return;
    }
    if (selectedConcessionId === 'custom') {
      if (customConcessionAmount === '' || Number(customConcessionAmount) <= 0) {
        toast.error("Please enter a valid custom concession amount");
        return;
      }
    }
    
    setProcessingConcession(true);
    try {
      const finalConcessionId = selectedConcessionId === 'none' ? '' : selectedConcessionId;
      const isCustom = selectedConcessionId === 'custom';
      const concessionAmount = isCustom ? Number(customConcessionAmount) : 0;

      const updatePayload = {
        feeConcessionType: finalConcessionId,
        feeConcessionAmount: concessionAmount
      };
      
      await Promise.all([
        dbService.update('users', selectedConcessionStudent, updatePayload),
        dbService.update('students', selectedConcessionStudent, updatePayload)
      ]);
      
      toast.success("Successfully applied fee concession to student!");
      setIsConcessionModalOpen(false);
      
      // Reset selections
      setSelectedConcessionClass('');
      setSelectedConcessionBatch('');
      setSelectedConcessionStudent('');
      setSelectedConcessionId('');
      setCustomConcessionAmount('');
    } catch (e) {
      console.error("Error applying concession:", e);
      toast.error("Failed to save student concession assignment");
    } finally {
      setProcessingConcession(false);
    }
  };

  useEffect(() => {
    // Extensive guards to prevent unauthorized access attempts
    if (!profile) return;
    const isManagement = isAdmin || isPrincipal || isVicePrincipal || isSuperAdmin;
    const hasLogPerm = hasPermission('settings_logs');
    
    if (!hasLogPerm && !isManagement) return;

    whatsappService.getStats().then(data => {
      if (data) {
        const dVal = Math.max(0, Number(data.delivered) || 0);
        const pVal = Math.max(0, Number(data.processing) || 0);
        const fVal = Math.max(0, Number(data.failed) || 0);
        const sVal = Math.max(0, Number(data.sent) || 0);
        setWaStats({
          total: dVal + pVal + fVal + sVal,
          delivered: dVal,
          processing: pVal,
          failed: fVal
        });
      }
    }).catch(() => {});

    if (dbService.isPoisoned()) {
      dbService.get('whatsapp_stats', 'summary').then(data => {
        if (data) {
          const dVal = Math.max(0, Number(data.delivered) || 0);
          const pVal = Math.max(0, Number(data.processing) || 0);
          const fVal = Math.max(0, Number(data.failed) || 0);
          const sVal = Math.max(0, Number(data.sent) || 0);
          setWaStats({
            total: dVal + pVal + fVal + sVal,
            delivered: dVal,
            processing: pVal,
            failed: fVal
          });
        }
      });
      return;
    }

    try {
      const unsubscribe = dbService.subscribeDoc(
        'whatsapp_stats',
        'summary',
        (data) => {
          if (data) {
            const dVal = Math.max(0, Number(data.delivered) || 0);
            const pVal = Math.max(0, Number(data.processing) || 0);
            const fVal = Math.max(0, Number(data.failed) || 0);
            const sVal = Math.max(0, Number(data.sent) || 0);
            setWaStats({
              total: dVal + pVal + fVal + sVal,
              delivered: dVal,
              processing: pVal,
              failed: fVal
            });
          }
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.error("Dashboard Stats Subscription restricted or failed:", e);
    }
  }, [profile?.uid, isAdmin, isPrincipal, isVicePrincipal, isSuperAdmin, hasPermission]);

  const [loading, setLoading] = useState(true);
  const [indexError, setIndexError] = useState<any>(null);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);
  const [mySubstitutions, setMySubstitutions] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [studentGenderMap, setStudentGenderMap] = useState<Record<string, string>>({});
  const [aiInsights, setAiInsights] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [savedInsights, setSavedInsights] = useState<any[]>([]);
  const [todayTimetable, setTodayTimetable] = useState<any[]>([]);
  const [periodSlots, setPeriodSlots] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdmin && !isPrincipal && !isVicePrincipal) return;

    const fetchSavedInsights = async () => {
      try {
        const insights = await dbService.list('insights', [orderBy('createdAt', 'desc'), limit(3)]);
        setSavedInsights(insights);
      } catch (error) {
        console.error("Error fetching saved insights:", error);
      }
    };
    fetchSavedInsights();
  }, [isAdmin, isPrincipal, isVicePrincipal]);

  // Sync tempSettings only when we are not editing to avoid loops
  useEffect(() => {
    if (!isEditingSettings) {
      setTempSettings(settings);
    }
  }, [settings, isEditingSettings]);

  const handleGenerateAIInsights = async () => {
    try {
      setLoadingAI(true);
      const dataSummary = {
        totalStudents: stats.students,
        totalTeachers: stats.teachers,
        todayAttendance: stats.attendance,
        feeCollectionRate: stats.fees,
        pendingDues: stats.pendingDues,
        schoolName: settings.schoolName,
      };
      const insights = await getStrategicAnalysis(dataSummary);
      setAiInsights(insights);
      toast.success("AI Intelligence Hub updated!");
    } catch (error) {
      console.error("AI Analysis Error:", error);
      toast.error("Failed to generate AI insights.");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateSettings(tempSettings);
      setIsEditingSettings(false);
      toast.success("School settings updated successfully!");
    } catch (error) {
      toast.error("Failed to update settings.");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        const url = await uploadService.uploadFile(file);
        setTempSettings({ ...tempSettings, logoUrl: url });
        toast.success("Logo uploaded to server!");
      } catch (error: any) {
        toast.error(error.message || "Failed to upload logo.");
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let unsubStudents: (() => void) | undefined;
    let unsubStaff: (() => void) | undefined;
    let unsubUsersStaff: (() => void) | undefined;

    const fetchStats = async () => {
      // Early exit if quota already known to be exceeded to prevent browser hanging on timed out requests
      if (checkQuotaStatus()) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setIndexError(null);
        let myStudentIds: string[] = [];
        let localTimetableSlots: any[] | null = null;
        let playSchoolTotalCount = 0;
        const getTimetableSlots = async () => {
          if (localTimetableSlots) return localTimetableSlots;
          localTimetableSlots = await dbService.list('timetableSlots', [limit(100)]);
          return localTimetableSlots;
        };

        const activeYear = settings?.currentAcademicYear || '2026-27';
        const assignedClassIds = new Set<string>();
        const assignedBatchIds = new Set<string>();

        if (profile?.role === 'play_school_incharge') {
          const [classesList, batchList] = await Promise.all([
            dbService.list('classes').catch(() => []),
            dbService.list('batches').catch(() => [])
          ]);

          const initialClassIds = [
            profile?.classId,
            ...(profile as any)?.classIds || []
          ].filter(Boolean);
          const initialBatchIds = [
            profile?.batchId,
            ...(profile as any)?.batchIds || []
          ].filter(Boolean);

          initialClassIds.forEach(id => assignedClassIds.add(id));
          initialBatchIds.forEach(id => assignedBatchIds.add(id));

          if (Array.isArray(profile?.subjectAssignments)) {
            profile.subjectAssignments.forEach((assignment: any) => {
              if (assignment?.classId) assignedClassIds.add(assignment.classId);
              if (assignment?.batchId) assignedBatchIds.add(assignment.batchId);
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
            classesList
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
        }

        // Get student count efficiently and subscribe to updates for the current academic year
        let studentCount = 0;

        if (isStudent || isParent) {
          // Students and parents are zero-trust roles and do not load or subscribe to general student stats
          studentCount = 0;
        } else if (profile?.role === 'play_school_incharge') {
          const playSchoolStudents = await dbService.list('students', []).catch(() => []);

          const filteredStudents = playSchoolStudents.filter((s: any) => {
            if (!s) return false;
            const status = (s.status || 'active').toLowerCase().trim();
            if (status === 'inactive' || status === 'deleted' || status === 'transferred' || status === 'archived') return false;
            return assignedClassIds.has(s.classId) || assignedBatchIds.has(s.batchId);
          });

          studentCount = filteredStudents.length;
          playSchoolTotalCount = studentCount;
          myStudentIds = filteredStudents.map((s: any) => s.id || s.uid).filter(Boolean);
        } else if (isTeacher && profile?.uid) {
          const [ttData, bData] = await Promise.all([
            getTimetableSlots(),
            dbService.list('batches').catch(() => [])
          ]);
          
          const matchIds = [
            profile?.uid,
            profile?.id,
            (profile as any)?.staffId,
            user?.uid,
            profile?.email,
            user?.email
          ].filter(Boolean).map(id => String(id).toLowerCase().trim());

          const matchNames = [
            profile?.name,
            (profile as any)?.displayName,
            user?.displayName
          ].filter(Boolean).map(n => String(n).toLowerCase().trim());

          const assignedBatchIds = new Set<string>();
          const assignedClassIds = new Set<string>();

          // Check profile direct assignments
          if (profile?.batchId) assignedBatchIds.add(String(profile.batchId));
          if (Array.isArray(profile?.batchIds)) {
            profile.batchIds.forEach((id: string) => { if (id) assignedBatchIds.add(String(id)); });
          }
          if ((profile as any)?.classTeacherBatchId) assignedBatchIds.add(String((profile as any).classTeacherBatchId));
          if (profile?.classId) assignedClassIds.add(String(profile.classId));
          if (Array.isArray(profile?.classIds)) {
            profile.classIds.forEach((id: string) => { if (id) assignedClassIds.add(String(id)); });
          }
          if (Array.isArray(profile?.subjectAssignments)) {
            profile.subjectAssignments.forEach((sa: any) => {
              if (sa?.batchId) assignedBatchIds.add(String(sa.batchId));
              if (sa?.classId) assignedClassIds.add(String(sa.classId));
            });
          }

          // Check batches from Academics module
          bData.forEach((b: any) => {
            if (!b) return;
            const bId = String(b.id || '');
            const bClassId = String(b.classId || '');
            const bCTId = b.classTeacherId ? String(b.classTeacherId).toLowerCase().trim() : '';
            const bCT = b.classTeacher ? String(b.classTeacher).toLowerCase().trim() : '';
            const bCTN = b.classTeacherName ? String(b.classTeacherName).toLowerCase().trim() : '';
            const bTId = b.teacherId ? String(b.teacherId).toLowerCase().trim() : '';
            const bT = b.teacher ? String(b.teacher).toLowerCase().trim() : '';
            const bTN = b.teacherName ? String(b.teacherName).toLowerCase().trim() : '';

            let isAssigned = false;
            if (bCTId && matchIds.includes(bCTId)) isAssigned = true;
            if (bCT && matchNames.includes(bCT)) isAssigned = true;
            if (bCTN && matchNames.includes(bCTN)) isAssigned = true;
            if (bTId && matchIds.includes(bTId)) isAssigned = true;
            if (bT && matchNames.includes(bT)) isAssigned = true;
            if (bTN && matchNames.includes(bTN)) isAssigned = true;

            if (isAssigned && bId) {
              assignedBatchIds.add(bId);
              if (bClassId) assignedClassIds.add(bClassId);
            }
          });

          // Check timetable slots
          ttData.forEach((tt: any) => {
            if (!tt) return;
            const ttBatchId = tt.batchId ? String(tt.batchId) : '';
            const ttClassId = tt.classId ? String(tt.classId) : '';
            const hasTeacher = (tt.periods || []).some((p: any) => {
              const pTId = p.teacherId ? String(p.teacherId).toLowerCase().trim() : '';
              const pTN = p.teacherName ? String(p.teacherName).toLowerCase().trim() : '';
              return (pTId && matchIds.includes(pTId)) || (pTN && matchNames.includes(pTN));
            });
            if (hasTeacher) {
              if (ttBatchId) assignedBatchIds.add(ttBatchId);
              if (ttClassId) assignedClassIds.add(ttClassId);
            }
          });

          // Link any batch whose classId is assigned
          bData.forEach((b: any) => {
            if (!b) return;
            const bId = String(b.id || '');
            const bClassId = String(b.classId || '');
            if (bId && assignedBatchIds.has(bId) && bClassId) {
              assignedClassIds.add(bClassId);
            }
            if (bClassId && assignedClassIds.has(bClassId) && bId) {
              assignedBatchIds.add(bId);
            }
          });

          const myStudentsList = await dbService.list('students', []).catch(() => []);
          
          const targetYearNorm = normalizeYear(activeYear);
          const filteredMyStudents = myStudentsList.filter((s: any) => {
            if (!s) return false;
            const status = (s.status || 'active').toLowerCase().trim();
            if (status === 'inactive' || status === 'deleted' || status === 'transferred' || status === 'archived') return false;
            const sBatch = s.batchId ? String(s.batchId) : '';
            const sClass = s.classId ? String(s.classId) : '';
            const matchesAssignment = (sBatch && assignedBatchIds.has(sBatch)) || (sClass && assignedClassIds.has(sClass));
            if (!matchesAssignment) return false;
            return !s.academicYear || normalizeYear(s.academicYear) === targetYearNorm;
          });
          
          studentCount = filteredMyStudents.length;
          myStudentIds = filteredMyStudents.map((s: any) => s.id || s.uid).filter(Boolean);
        } else {
          const allStudents = await dbService.list('students', []).catch(() => []);
          const activeStudents = (allStudents || []).filter((s: any) => {
            if (!s) return false;
            const status = (s.status || 'active').toLowerCase().trim();
            return status !== 'inactive' && status !== 'deleted' && status !== 'transferred' && status !== 'archived';
          });
          const targetYearNorm = normalizeYear(activeYear);
          const yearMatched = activeStudents.filter((s: any) => !s.academicYear || normalizeYear(s.academicYear) === targetYearNorm);
          studentCount = yearMatched.length > 0 ? yearMatched.length : activeStudents.length;
        }

        // Get staff counts efficiently
        let teacherCount = 0;
        if (!isTeacher && !isStudent && !isParent) {
          const batchesForStaff = profile?.role === 'play_school_incharge'
            ? await dbService.list('batches').catch(() => [])
            : [];

          const [latestUsers, latestStaff] = await Promise.all([
            dbService.list('users', []).catch(() => []),
            dbService.list('staff', []).catch(() => [])
          ]);
          
          const initialUnifiedMap = new Map<string, any>();
          latestStaff.forEach((s: any) => {
            if (s && (s.uid || s.id)) {
              initialUnifiedMap.set(s.uid || s.id, { ...s, status: s.status || 'active' });
            }
          });
          latestUsers.forEach((u: any) => {
            if (u && (u.uid || u.id)) {
              const role = (u.role || '').toLowerCase().trim();
              if (role !== 'student' && role !== 'parent') {
                const sId = u.uid || u.id;
                const existing = initialUnifiedMap.get(sId);
                if (existing) {
                  initialUnifiedMap.set(sId, { ...u, ...existing, uid: sId });
                } else {
                  initialUnifiedMap.set(sId, { ...u, uid: sId, status: u.status || 'active' });
                }
              }
            }
          });
          let initialStaff = Array.from(initialUnifiedMap.values())
            .filter((s: any) => (s.status || 'active') === 'active');
          if (profile?.role === 'play_school_incharge') {
            initialStaff = initialStaff.filter((t: any) => {
              const isSelf = t.id === profile?.uid || t.uid === profile?.uid || t.role === 'play_school_incharge';
              const hasAsg = Array.isArray(t.subjectAssignments) && t.subjectAssignments.some((asg: any) => 
                (asg?.classId && assignedClassIds.has(asg.classId)) || (asg?.batchId && assignedBatchIds.has(asg.batchId))
              );
              const isClassTeach = batchesForStaff.some((b: any) => 
                b.classTeacherId === (t.id || t.uid) && 
                (assignedClassIds.has(b.classId) || assignedBatchIds.has(b.id))
              );
              const hasClassId = t.classId && assignedClassIds.has(t.classId);
              const hasBatchId = t.batchId && assignedBatchIds.has(t.batchId);
              return isSelf || hasAsg || isClassTeach || hasClassId || hasBatchId;
            });
          }
          teacherCount = initialStaff.length;
        }

        // Calculate today's attendance percentage
        const today = new Date().toISOString().split('T')[0];
        let todayAttendanceCount = 0;
        let todayAbsentCount = 0;
        let attendanceRate: any = 0;

        const allAttendanceRecords = await dbService.list('attendance', []).catch(() => []);
        
        if (isTeacher && profile?.uid) {
          const todayAttendanceRecords = allAttendanceRecords.filter((rec: any) => rec.date === today);
          
          const todayMyAttendance = todayAttendanceRecords.filter((rec: any) => 
            myStudentIds.includes(rec.studentId)
          );
          
          todayAttendanceCount = todayMyAttendance.filter((rec: any) => rec.status === 'present').length;
          todayAbsentCount = todayMyAttendance.filter((rec: any) => rec.status === 'absent').length;

          const totalMarked = todayAttendanceCount + todayAbsentCount;
          if (totalMarked > 0) {
            attendanceRate = Math.round((todayAttendanceCount / totalMarked) * 100);
          } else if (studentCount > 0) {
            attendanceRate = Math.round((todayAttendanceCount / studentCount) * 100);
          } else {
            attendanceRate = 100;
          }
          
          const activeYearDetails = settings?.academicYearDetails?.find((y: any) => y.name === activeYear);
          const academicYearStartDate = activeYearDetails?.startDate || `${activeYear.slice(0, 4)}-06-01`;

          const myAttendanceRecords = await dbService.list('staff_attendance', [
            where('userId', '==', profile.uid)
          ]).catch(() => []);

          const filteredRecords = myAttendanceRecords.filter((rec: any) => rec.date >= academicYearStartDate);
          const myPresentCount = filteredRecords.filter((rec: any) => rec.status === 'present').length;
          const myAbsentCount = filteredRecords.filter((rec: any) => rec.status === 'absent').length;

          const totalMyDays = myPresentCount + myAbsentCount;
          if (totalMyDays > 0) {
            attendanceRate = Math.round((myPresentCount / totalMyDays) * 100);
          }
        } else if (isStudent && profile?.uid) {
          const myRecords = allAttendanceRecords.filter((rec: any) => rec.studentId === profile.uid || rec.studentId === (profile as any).id);
          const myPresent = myRecords.filter((r: any) => r.status === 'present').length;
          const myAbsent = myRecords.filter((r: any) => r.status === 'absent').length;
          const total = myPresent + myAbsent;
          attendanceRate = total > 0 ? Math.round((myPresent / total) * 100) : 100;
          todayAttendanceCount = myPresent;
          todayAbsentCount = myAbsent;
        } else if (isParent) {
          const currentEmail = profile?.email || auth.currentUser?.email;
          let parentStudentId = '';
          if (currentEmail) {
            const kids = await dbService.list('students', [where('parentEmail', '==', currentEmail), limit(1)]).catch(() => []);
            if (kids && kids.length > 0) {
              parentStudentId = kids[0].id || kids[0].uid;
            }
          }
          if (parentStudentId) {
            const myRecords = allAttendanceRecords.filter((rec: any) => rec.studentId === parentStudentId);
            const myPresent = myRecords.filter((r: any) => r.status === 'present').length;
            const myAbsent = myRecords.filter((r: any) => r.status === 'absent').length;
            const total = myPresent + myAbsent;
            attendanceRate = total > 0 ? Math.round((myPresent / total) * 100) : 100;
            todayAttendanceCount = myPresent;
            todayAbsentCount = myAbsent;
          } else {
            attendanceRate = 100;
          }
        } else if (profile?.role === 'play_school_incharge') {
          let playSchoolPresentCount = 0;
          let playSchoolAbsentCount = 0;

          if (myStudentIds.length > 0) {
            const todayPlaySchoolAttendance = allAttendanceRecords.filter((rec: any) => 
              rec.date === today && myStudentIds.includes(rec.studentId)
            );

            playSchoolPresentCount = todayPlaySchoolAttendance.filter((rec: any) => rec.status === 'present').length;
            playSchoolAbsentCount = todayPlaySchoolAttendance.filter((rec: any) => rec.status === 'absent').length;

            const totalMarked = playSchoolPresentCount + playSchoolAbsentCount;
            if (totalMarked > 0) {
              attendanceRate = Math.round((playSchoolPresentCount / totalMarked) * 100);
            } else if (playSchoolTotalCount > 0) {
              attendanceRate = Math.round((playSchoolPresentCount / playSchoolTotalCount) * 100);
            } else {
              attendanceRate = 100;
            }
          } else {
            attendanceRate = 100;
          }

          todayAttendanceCount = playSchoolPresentCount;
          todayAbsentCount = playSchoolAbsentCount;
        } else {
          const todayRecords = allAttendanceRecords.filter((rec: any) => rec.date === today);
          todayAttendanceCount = todayRecords.filter((rec: any) => rec.status === 'present').length;
          todayAbsentCount = todayRecords.filter((rec: any) => rec.status === 'absent').length;
          const totalMarkedToday = todayAttendanceCount + todayAbsentCount;

          if (totalMarkedToday > 0) {
            attendanceRate = Math.round((todayAttendanceCount / totalMarkedToday) * 100);
          } else if (allAttendanceRecords.length > 0) {
            const datesWithAttendance = Array.from(new Set(allAttendanceRecords.map((r: any) => r.date).filter(Boolean))).sort().reverse();
            if (datesWithAttendance.length > 0) {
              const latestDate = datesWithAttendance[0];
              const latestRecords = allAttendanceRecords.filter((r: any) => r.date === latestDate);
              const present = latestRecords.filter((r: any) => r.status === 'present').length;
              const total = latestRecords.filter((r: any) => r.status === 'present' || r.status === 'absent').length;
              attendanceRate = total > 0 ? Math.round((present / total) * 100) : 100;
            } else {
              attendanceRate = 100;
            }
          } else {
            attendanceRate = 100;
          }
        }

        // Bounds check: start from academic year starting date onwards, and hide if student holiday
        const currentYearName = settings?.currentAcademicYear || '2026-27';
        const currentYearDetails = settings?.academicYearDetails?.find((y: any) => y.name === currentYearName);
        const academicYearStartDate = currentYearDetails?.startDate || `${currentYearName.slice(0, 4)}-06-01`;

        const holidayList = await dbService.list('holidays').catch(() => []);
        const isTodayHolidayCombined = holidayList.some((h: any) => {
          const start = h.date;
          const end = h.toDate || h.date;
          return today >= start && today <= end && h.type !== 'working_day';
        });

        const isBeforeAcademicYear = today < academicYearStartDate;

        if (isBeforeAcademicYear) {
          attendanceRate = 'N/A';
          todayAttendanceCount = 0;
          todayAbsentCount = 0;
        } else if (isTodayHolidayCombined) {
          attendanceRate = 'Holiday';
          todayAttendanceCount = 0;
          todayAbsentCount = 0;
        }

        // Load collections to compute fee collection status
        const activeYearForRevenue = settings?.currentAcademicYear || '2026-27';
        
        let allStudentsList: any[] = [];
        let allFeeStructures: any[] = [];
        let allConcessions: any[] = [];
        let allClasses: any[] = [];
        let allBatches: any[] = [];
        let allPayments: any[] = [];
        let allFeeDocs: any[] = [];

        const hasFinancialAccess = showFinancials || isStudent || isParent;

        if (hasFinancialAccess) {
          if (isStudent || isParent) {
            // For student and parent, load ONLY their own student record and payments to make it extremely fast and secure!
            let targetStudent: any = null;
            if (isStudent && profile?.uid) {
              targetStudent = profile;
            } else if (isParent) {
              const currentEmail = profile?.email || auth.currentUser?.email;
              if (currentEmail) {
                const kids = await dbService.list('students', [where('parentEmail', '==', currentEmail), limit(1)]).catch(() => []);
                if (kids && kids.length > 0) {
                  targetStudent = kids[0];
                }
              }
            }

            if (targetStudent) {
              const sId = targetStudent.id || targetStudent.uid;
              allStudentsList = [targetStudent];
              const [feesData, concessionsData, classesData, batchesData, paymentsData, feeDocs] = await Promise.all([
                dbService.list('feeStructures').catch(() => []),
                dbService.list('concessions').catch(() => []),
                dbService.list('classes').catch(() => []),
                dbService.list('batches').catch(() => []),
                dbService.list('payments', [where('studentId', '==', sId)]).catch(() => []),
                dbService.list('fees', [where('studentId', '==', sId)]).catch(() => [])
              ]);
              allFeeStructures = feesData || [];
              allConcessions = concessionsData || [];
              allClasses = classesData || [];
              allBatches = batchesData || [];
              allFeeDocs = feeDocs || [];

              const mergedPayments: any[] = [...(paymentsData || [])];
              const seenRefs = new Set(mergedPayments.map(p => p.id || p.reference).filter(Boolean));
              (feeDocs || []).forEach((f: any) => {
                if (f.paymentHistory && Array.isArray(f.paymentHistory)) {
                  f.paymentHistory.forEach((ph: any, idx: number) => {
                    const ref = ph.reference || ph.orderId || ph.transactionId || `ph_${f.id || f.studentId}_${idx}`;
                    if (!seenRefs.has(ref) && !seenRefs.has(ph.id)) {
                      seenRefs.add(ref);
                      mergedPayments.push({
                        id: ph.id || ref,
                        studentId: ph.studentId || f.studentId || sId,
                        amount: Number(ph.amount) || 0,
                        date: ph.date || ph.paymentDate || f.updatedAt || f.createdAt || '',
                        method: ph.method || ph.paymentMethod || 'Online',
                        reference: ref,
                        academicYear: ph.academicYear || f.academicYear || activeYearForRevenue,
                        component: ph.component || 'Fees'
                      });
                    }
                  });
                }
              });
              allPayments = mergedPayments;
            }
          } else {
            // For admins/finance staff, load everything
            const [
              studentsData,
              feesData,
              concessionsData,
              classesData,
              batchesData,
              paymentsData,
              feeDocs
            ] = await Promise.all([
              dbService.list('students').catch(() => []),
              dbService.list('feeStructures').catch(() => []),
              dbService.list('concessions').catch(() => []),
              dbService.list('classes').catch(() => []),
              dbService.list('batches').catch(() => []),
              dbService.list('payments').catch(() => []),
              dbService.list('fees').catch(() => [])
            ]);
            allStudentsList = studentsData || [];
            allFeeStructures = feesData || [];
            allConcessions = concessionsData || [];
            allClasses = classesData || [];
            allBatches = batchesData || [];
            allFeeDocs = feeDocs || [];

            const mergedPayments: any[] = [...(paymentsData || [])];
            const seenRefs = new Set(mergedPayments.map(p => p.id || p.reference).filter(Boolean));
            (feeDocs || []).forEach((f: any) => {
              if (f.paymentHistory && Array.isArray(f.paymentHistory)) {
                f.paymentHistory.forEach((ph: any, idx: number) => {
                  const ref = ph.reference || ph.orderId || ph.transactionId || `ph_${f.id || f.studentId}_${idx}`;
                  if (!seenRefs.has(ref) && !seenRefs.has(ph.id)) {
                    seenRefs.add(ref);
                    mergedPayments.push({
                      id: ph.id || ref,
                      studentId: ph.studentId || f.studentId || f.studentUid || '',
                      amount: Number(ph.amount) || 0,
                      date: ph.date || ph.paymentDate || f.updatedAt || f.createdAt || '',
                      method: ph.method || ph.paymentMethod || 'Online',
                      reference: ref,
                      academicYear: ph.academicYear || f.academicYear || activeYearForRevenue,
                      component: ph.component || 'Fees'
                    });
                  }
                });
              }
            });
            allPayments = mergedPayments;
          }
        }

        const studentMap = new Map<string, string>();
        if (allStudentsList && allStudentsList.length > 0) {
          allStudentsList.forEach((s: any) => {
            const sId = s.id || s.uid;
            if (sId) {
              studentMap.set(sId, s.name || s.studentName || 'Student');
            }
          });
        }

        const recentPayments = (allPayments || [])
          .filter((p: any) => !p.reference || !p.reference.startsWith('EXP'))
          .map((p: any) => {
            const sId = p.studentId || (p as any).studentUid;
            const studentName = studentMap.get(sId) || p.studentName || 'Student';
            return {
              id: p.id || p.reference || Math.random().toString(),
              studentId: sId,
              studentName: studentName,
              paymentMethod: p.method || p.paymentMethod || 'Online',
              paidAmount: Number(p.amount) || 0,
              date: p.date || p.paymentTime || p.updatedAt || p.createdAt || '',
              component: p.component || 'Fees',
              reference: p.reference || p.orderId || ''
            };
          })
          .sort((a: any, b: any) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
          });

        const targetYearNorm = normalizeYear(activeYearForRevenue);

        // Pre-index payments by student ID for O(1) retrieval
        const paymentsByStudent = new Map<string, any[]>();
        if (allPayments && allPayments.length > 0) {
          allPayments.forEach((p: any) => {
            if (p.reference && p.reference.startsWith('EXP')) return;
            const ids = new Set([p.studentId, (p as any).studentUid].filter(Boolean));
            ids.forEach(sId => {
              if (!paymentsByStudent.has(sId)) {
                paymentsByStudent.set(sId, []);
              }
              paymentsByStudent.get(sId)!.push(p);
            });
          });
        }

        // Centralized student fee metrics and financial overview computation
        const studentFeeMetrics = computeStudentFeeMetrics({
          students: allStudentsList,
          academicYear: activeYearForRevenue,
          feeStructures: allFeeStructures,
          concessions: allConcessions,
          classes: allClasses,
          batches: allBatches,
          payments: allPayments,
          fees: allFeeDocs
        });

        const overviewStats = calculateFinancialOverview(studentFeeMetrics);

        setRevenueDetails({
          totalPayable: overviewStats.totalPayable,
          totalCollected: overviewStats.totalCollected,
          totalPending: overviewStats.totalPending,
          term1Collected: overviewStats.term1Collected,
          term1Pending: overviewStats.term1Pending,
          term2Collected: overviewStats.term2Collected,
          term2Pending: overviewStats.term2Pending,
          term3Collected: overviewStats.term3Collected,
          term3Pending: overviewStats.term3Pending,
        });

        const totalPayableSum = overviewStats.totalPayable;
        const totalCollectedSum = overviewStats.totalCollected;
        const totalPendingSum = overviewStats.totalPending;
        const feeCollectionPercent = overviewStats.completionRate;

        const todayStr = new Date().toISOString().split('T')[0];
        const todayCollectionSum = (allPayments || []).reduce((sum: number, p: any) => {
          const pDate = p.date || p.createdAt || p.timestamp;
          if (pDate && pDate.startsWith(todayStr)) {
            return sum + (Number(p.amount) || 0);
          }
          return sum;
        }, 0);

        // Get pending leaves count
        let pendingLeavesCount = 0;
        if (isAdmin || isPrincipal || isVicePrincipal) {
          pendingLeavesCount = await dbService.count('leaves', [where('status', '==', 'pending')]).catch(() => 0);
        } else if (isTeacher && profile?.classId) {
          pendingLeavesCount = await dbService.count('leaves', [
            where('status', '==', 'pending'),
            where('applicantRole', '==', 'student'),
            where('classId', '==', profile.classId)
          ]).catch(() => 0);
        }

        // WhatsApp messages count - sync directly from unified server stats
        try {
          const s = await whatsappService.getStats();
          if (s && s.total !== undefined) {
            const dVal = Math.max(0, Number(s.delivered) || 0);
            const pVal = Math.max(0, Number(s.processing) || 0);
            const fVal = Math.max(0, Number(s.failed) || 0);
            const sVal = Math.max(0, Number(s.sent) || 0);
            setWaStats({
              total: dVal + pVal + fVal + sVal,
              delivered: dVal,
              processing: pVal,
              failed: fVal
            });
          }
        } catch (err) {
          // Fallback to whatsapp_stats subscription
        }

        setStats((prev: any) => ({
          ...prev,
          students: studentCount || 0,
          teachers: teacherCount || 0,
          attendance: attendanceRate ?? 100,
          recentPayments: recentPayments || [],
          pendingLeaves: pendingLeavesCount,
          presentCount: todayAttendanceCount || 0,
          absentCount: profile?.role === 'play_school_incharge'
            ? (todayAbsentCount || (playSchoolTotalCount > 0 ? Math.max(0, playSchoolTotalCount - todayAttendanceCount) : 0))
            : (todayAbsentCount || (studentCount > 0 ? Math.max(0, studentCount - todayAttendanceCount) : 0)),
          fees: feeCollectionPercent,
          feesCollected: totalCollectedSum,
          feesPending: totalPendingSum,
          todayCollection: todayCollectionSum
        }));

        // Fetch Timetable Data for Dashboard
        const [ttData, subjectsData, batchesData, classesList, timetableSettings] = await Promise.all([
          dbService.list('timetableSlots', [where('day', '==', format(new Date(), 'EEEE')), limit(50)]),
          dbService.list('subjects', [limit(200)]),
          dbService.list('batches', [limit(200)]),
          dbService.list('classes', [limit(200)]).catch(() => []),
          dbService.get('settings', 'timetable')
        ]);

        setSubjects(subjectsData);
        setBatches(batchesData);
        const rawSlots = (timetableSettings as any)?.slots || [
          { label: 'P1', start: '08:00', end: '09:00' },
          { label: 'P2', start: '09:00', end: '10:00' },
          { label: 'Short Break', start: '10:00', end: '10:15', isBreak: true },
          { label: 'P3', start: '10:15', end: '11:15' },
          { label: 'P4', start: '11:15', end: '12:15' },
          { label: 'Lunch', start: '12:15', end: '01:00', isBreak: true },
          { label: 'P5', start: '01:00', end: '02:00' },
          { label: 'P6', start: '02:00', end: '03:00' },
          { label: 'P7', start: '03:00', end: '04:00' },
        ];
        
        const uniqueSlots: any[] = [];
        const seenLabels = new Set();
        rawSlots.forEach((s: any) => {
          if (s && s.label) {
            const trimmedLabel = s.label.trim();
            if (!seenLabels.has(trimmedLabel)) {
              seenLabels.add(trimmedLabel);
              uniqueSlots.push({ ...s, label: trimmedLabel });
            }
          }
        });
        setPeriodSlots(uniqueSlots);

        if (isTeacher) {
          const mySchedule = (ttData as any[]).flatMap(tt => {
            const batch = (batchesData || []).find(b => b && b.id === tt.batchId);
            const cls = (classesList || []).find((c: any) => c && (c.id === batch?.classId || c.id === (batch as any)?.class));
            const className = cls?.name || (batch as any)?.className;
            const batchName = batch?.name;
            const classAndBatchName = className && batchName && className !== batchName
              ? `${className} - ${batchName}`
              : (batchName || className || 'Class');

            return (tt.periods || [])
              .filter((p: any) => p.teacherId === profile.uid || p.teacherId === profile.id || p.teacherId === (profile as any).docId)
              .map((p: any) => ({ ...p, batchName: classAndBatchName }));
          });
          setTodayTimetable(mySchedule);
          
          const subData = await dbService.list('substitutions', [
            where('substituteTeacherId', '==', profile.uid),
            where('date', '==', today),
            limit(10)
          ]);
          setMySubstitutions(subData || []);
        } else if (isStudent && profile?.batchId) {
          const myBatchTT = (ttData as any[]).find(tt => tt.batchId === profile.batchId);
          setTodayTimetable(myBatchTT?.periods || []);
        }

        // Fetch upcoming calendar events & milestones for Timeline
        try {
          const [calendarEventsData, holidaysData, noticesData, examsData] = await Promise.all([
            dbService.list('calendar_events', [limit(50)]).catch(() => []),
            dbService.list('holidays', [limit(50)]).catch(() => []),
            dbService.list('notices', [limit(50)]).catch(() => []),
            dbService.list('exams', [limit(50)]).catch(() => [])
          ]);

          const combinedEvents: any[] = [];
          (calendarEventsData || []).forEach((e: any) => {
            if (e.date) combinedEvents.push({ ...e, title: e.title || e.name || 'Event', type: e.type || 'event' });
          });
          (holidaysData || []).forEach((h: any) => {
            if (h.date) combinedEvents.push({ ...h, title: h.title || h.name || 'Holiday', type: 'holiday' });
          });
          (examsData || []).forEach((ex: any) => {
            if (ex.date || ex.startDate) combinedEvents.push({ ...ex, date: ex.date || ex.startDate, title: ex.title || ex.name || 'Exam', type: 'exam' });
          });
          (noticesData || []).forEach((n: any) => {
            if (n.date || n.createdAt) combinedEvents.push({ ...n, date: (n.date || n.createdAt).slice(0, 10), title: n.title || 'Notice', type: 'notice' });
          });

          const todayStr = new Date().toISOString().split('T')[0];
          const sorted = [...combinedEvents].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          const upcoming = sorted.filter(e => e.date >= todayStr).slice(0, 4);
          const finalEvents = upcoming.length > 0 ? upcoming : sorted.slice(-4).reverse();
          setUpcomingEvents(finalEvents);
        } catch (e: any) {
          console.error("Error fetching events for dashboard:", e);
          if (e.message?.includes('index')) setIndexError(e);
        }
      } catch (error: any) {
        console.error("Dashboard Stats Error:", error);
        if (error.message?.includes('index')) setIndexError(error);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.uid) {
      fetchStats();
    }
  }, [profile?.uid, isTeacher, isStudent, isParent, settings?.currentAcademicYear]);

  const barData = useMemo(() => [
    { name: 'Jan', attendance: 92 },
    { name: 'Feb', attendance: 95 },
    { name: 'Mar', attendance: 94 },
    { name: 'Apr', attendance: 96 },
    { name: 'May', attendance: 93 },
    { name: 'Today', attendance: typeof stats?.attendance === 'number' ? stats.attendance : 0 }
  ], [stats?.attendance]);

  const lineData = useMemo(() => [
    { name: 'Mon', collection: 12000 },
    { name: 'Tue', collection: 45000 },
    { name: 'Wed', collection: 32000 },
    { name: 'Thu', collection: 18000 },
    { name: 'Fri', collection: 56000 },
    { name: 'Today', collection: Number(stats?.todayCollection) || 0 }
  ], [stats?.todayCollection]);

  const pieData = useMemo(() => {
    const paidValue = Number(stats?.fees) || 0;
    const pendingValue = Math.max(0, 100 - paidValue);
    return [
      { name: 'Paid', value: paidValue, color: '#F43F5E' },
      { name: 'Pending', value: pendingValue, color: '#E2E8F0' }
    ];
  }, [stats?.fees]);

  const showFinancials = hasPermission('fees_view') && !isVicePrincipal;
  const isTeacherUser = isTeacher || profile?.isTeacherPortal === true || profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject' || (profile as any)?.staffType === 'teaching';
  const isManagement = (isAdmin || isPrincipal || isVicePrincipal || isSuperAdmin) && !isTeacherUser;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <IndexNoticeBanner error={indexError} />

      {isManagement && !isTeacherUser && waEngineStatus && waEngineStatus !== 'open' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-50 border-2 border-red-500 rounded-[2rem] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_20px_40px_rgba(239,68,68,0.12)] relative overflow-hidden"
        >
          {/* Ambient Glow Background decoration */}
          <div className="absolute right-0 top-0 w-64 h-64 bg-red-100 rounded-full blur-3xl opacity-50 -z-10" />
          
          <div className="flex items-center gap-5">
            <div className="p-4 bg-red-500 text-white rounded-2xl animate-pulse shadow-lg shadow-red-500/30">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-black text-red-900 uppercase tracking-wide">
                WhatsApp Engine Disconnected!
              </h3>
              <p className="text-sm text-red-700 font-medium mt-1">
                The school's automated message dispatcher is offline ({waEngineStatus === 'connecting' ? 'Initializing...' : waEngineStatus === 'qr' ? 'Awaiting QR Scan' : 'Disconnected'}). Parents are not receiving attendance alerts or communication broadcasts.
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => navigate('/dashboard/communication')}
            className="whitespace-nowrap px-8 py-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black rounded-2xl shadow-xl shadow-red-600/20 transition-all text-sm uppercase tracking-wider cursor-pointer"
          >
            Reconnect Now
          </button>
        </motion.div>
      )}
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {(!isStudent && !isParent) && (
          <StatCard 
            icon={Users} 
            label={isTeacher ? "Assigned Students" : "Students"} 
            value={stats.students} 
            trend={isTeacher ? "Roster" : "+12/mo"} 
            variant="indigo"
            delay={0.1}
          />
        )}
        {(isTeacher && (batches || []).some(b => b.classTeacherId === profile?.uid)) && (
          <>
            <StatCard 
              icon={UserCheck} 
              label="Present Students" 
              value={stats.presentCount} 
              trend="Today" 
              variant="emerald"
              delay={0.15}
            />
            <StatCard 
              icon={X} 
              label="Absent Students" 
              value={stats.absentCount} 
              trend="Today" 
              variant="rose"
              delay={0.2}
            />
          </>
        )}
        {(!isTeacher && !isStudent && !isParent) && (
          <StatCard 
            icon={GraduationCap} 
            label="Staff" 
            value={stats.teachers} 
            trend="Real-time" 
            variant="rose"
            delay={0.2}
          />
        )}
        <StatCard 
          icon={Activity} 
          label={(isTeacher || isStudent || isParent) ? "My Attendance" : "Attendance"} 
          value={typeof stats.attendance === 'number' ? `${stats.attendance}%` : stats.attendance} 
          trend={stats.attendance === 'N/A' ? 'Locked' : stats.attendance === 'Holiday' ? 'Holiday' : 'Upward'} 
          variant="emerald"
          delay={0.3}
        />
        {(showFinancials || isStudent || isParent) && (
          <StatCard 
            icon={TrendingUp} 
            label="Revenue" 
            value={typeof stats.feesCollected === 'number' ? `₹${stats.feesCollected.toLocaleString()}` : `₹0`} 
            trend={typeof stats.fees === 'number' ? `${Math.round(stats.fees)}% Collected` : 'Target 95%'} 
            variant="amber" 
            delay={0.4}
            onClick={() => setIsRevenueModalOpen(true)}
          />
        )}
        {(hasPermission('settings_logs') && !isStudent && !isParent && !isTeacherUser) && (
          <StatCard 
            icon={MessageSquare} 
            label="WA Messages" 
            value={waStats.total} 
            trend={`${waStats.delivered} Delivered`} 
            variant="violet" 
            delay={0.5}
          />
        )}
      </div>

      {/* Live Timetable Widget - Special Row for Teachers/Students */}
      {(isTeacher || isStudent) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[3rem] border border-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)] mb-8"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-sidebar tracking-tight uppercase">Live Schedule</h3>
                <p className="text-[10px] text-neutral-400 font-bold tracking-widest uppercase italic">Daily heartbeat</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {periodSlots.map((slot, idx) => {
              const assigned = todayTimetable.find(p => p.label === slot.label);
              const isNow = currentTime >= slot.start && currentTime <= slot.end;

              if (!assigned && !isNow) return null; 

              return (
                <div 
                  key={idx} 
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                    isNow 
                      ? 'bg-sidebar text-white shadow-lg border-transparent' 
                      : 'bg-neutral-50 border-neutral-100 hover:bg-white hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${isNow ? 'bg-white/20' : 'bg-neutral-200 text-neutral-500'}`}>
                      {slot.label}
                    </span>
                    <div>
                      <p className={`text-sm font-bold ${isNow ? 'text-white' : 'text-sidebar'}`}>
                        {(subjects || []).find(s => s && s.id === assigned?.subjectId)?.name || 'Assigned Period'}
                      </p>
                      <p className={`text-[10px] ${isNow ? 'text-white/60' : 'text-neutral-400'}`}>
                        {slot.start} - {slot.end}
                      </p>
                    </div>
                  </div>
                  {isNow && (
                    <div className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse">Live</div>
                  )}
                </div>
              );
            })}
            {todayTimetable.length === 0 && (
              <div className="col-span-full py-12 text-center text-neutral-400 italic text-[12px] border border-dashed border-neutral-200 rounded-3xl">
                No classes scheduled for today.
              </div>
            )}
          </div>
          
          <button 
            onClick={() => navigate('/dashboard/timetable')}
            className="w-full mt-6 py-3 text-[10px] font-black uppercase text-primary border border-primary/10 rounded-xl hover:bg-primary/5 transition-all"
          >
            Full Timetable View
          </button>
        </motion.div>
      )}

      {/* Main Tactical Grid: Notice Board, Timeline, and Financial Stream in one line */}
      <div className={`grid grid-cols-1 ${isTeacher ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-8 pb-6`}>
        {/* Notice Board (Pulse Feedback) */}
        <div className="h-full">
          <NoticeBoard />
        </div>

        {/* Timeline Widget */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[3rem] border border-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)] h-full"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-600 p-3 rounded-xl">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-sidebar uppercase tracking-tight">Timeline</h3>
              <p className="text-[8px] text-neutral-400 font-black tracking-widest uppercase italic">Milestones</p>
            </div>
          </div>
          
          <div className="space-y-3 overflow-y-auto max-h-[380px] pr-2 custom-scrollbar flex-1">
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map((event, idx) => (
                <div 
                  key={idx}
                  onClick={() => {
                    if (event.type === 'exam') {
                      navigate('/dashboard/exams');
                    } else {
                      navigate('/dashboard/notices', { state: { activeTab: 'calendar' } });
                    }
                  }}
                  className="flex items-center gap-4 p-3 rounded-2xl bg-neutral-50 border border-neutral-100 group hover:border-emerald-500 hover:bg-neutral-100/50 transition-all shadow-sm cursor-pointer active:scale-[0.98]"
                >
                  <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                    event.type === 'holiday' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                    event.type === 'exam' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                    'bg-emerald-50 text-emerald-600 border-emerald-100'
                  }`}>
                    <span className="text-[7px] uppercase font-black">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                    <span className="text-sm font-black">{new Date(event.date).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[11px] font-black text-sidebar truncate uppercase tracking-tight group-hover:text-emerald-700 transition-colors">{event.title}</h4>
                    <p className="text-[9px] text-neutral-400 font-bold uppercase">{event.type}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-10 text-[10px] text-neutral-400 font-black uppercase tracking-widest italic">No upcoming events</p>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <button 
              onClick={() => navigate('/dashboard/notices', { state: { activeTab: 'calendar' } })}
              className="w-full py-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/50 rounded-xl text-[10px] font-black text-neutral-900 uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
            >
              <Calendar className="w-3.5 h-3.5" />
              Open Academic Calendar
            </button>
          </div>
        </motion.div>

        {/* Financial Stream - Now in the same line with Pulse Feedback and Timeline */}
        {!isTeacher && (
          (showFinancials && (isAdmin || isPrincipal || isAccountant)) ? (
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)] h-full flex flex-col"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-600 text-white rounded-xl">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-sidebar uppercase tracking-tight">Financial Stream</h3>
                  <p className="text-[8px] text-neutral-400 font-black tracking-widest uppercase italic">Live Transaction Flow</p>
                </div>
              </div>
              <div className="space-y-4 flex-1 max-h-[380px] overflow-y-auto pr-1">
                {stats.recentPayments.length > 0 ? stats.recentPayments.map((payment: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-neutral-50 rounded-[2rem] border border-neutral-100 group hover:border-emerald-500 transition-all cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 font-black flex-shrink-0">
                        ₹
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-sidebar uppercase truncate">{payment.studentName}</p>
                          {payment.component && (
                            <span className="text-[7px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-black px-1.5 py-0.5 rounded uppercase flex-shrink-0">
                              {payment.component}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-neutral-400 font-bold uppercase mt-0.5">
                          {payment.paymentMethod || 'Online'} {payment.reference ? `• Ref: ${payment.reference}` : ''}
                        </p>
                        {payment.date && (
                          <p className="text-[8px] text-neutral-400 font-semibold uppercase tracking-wider mt-0.5">
                            {(() => {
                              try {
                                return new Date(payment.date).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                });
                              } catch {
                                return payment.date;
                              }
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-black text-emerald-600 ml-2">₹{payment.paidAmount}</p>
                  </div>
                )) : (
                  <p className="text-center py-10 text-[10px] text-neutral-400 font-black uppercase tracking-widest italic">No recent payments</p>
                )}
              </div>
              <div className="flex gap-2 mt-6">
                <button 
                  onClick={() => navigate('/dashboard/fees')}
                  className="flex-1 py-3 text-[10px] font-black uppercase text-primary border border-primary/10 rounded-xl hover:bg-primary/5 transition-all text-center"
                >
                  Open Financial Ledger
                </button>
                {isAdmin && (
                  <button 
                    onClick={handleOpenConcessionModal}
                    className="flex-1 py-3 text-[10px] font-black uppercase bg-indigo-600 border border-indigo-500 text-white rounded-xl hover:bg-indigo-700 transition-all text-center shadow-lg shadow-indigo-600/15"
                  >
                    Apply Concession
                  </button>
                )}
              </div>
            </motion.div>
          ) : isVicePrincipal ? (
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)] h-full flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-indigo-600 text-white rounded-xl">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-sidebar uppercase tracking-tight">Quick Shortcuts</h3>
                    <p className="text-[8px] text-neutral-400 font-black tracking-widest uppercase italic">Administrative Console</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500 font-medium leading-relaxed">
                    As Vice Principal, you have permissions configured to manage student fee concessions securely and verify academic rosters.
                  </p>
                  
                  <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block mb-1">Assigned Role Authorization</span>
                    <span className="text-xs font-bold text-neutral-600">Student Fee Concession Override</span>
                  </div>
                </div>
              </div>
  
              <button 
                onClick={handleOpenConcessionModal}
                className="w-full mt-6 py-4 bg-indigo-600 text-white text-xs font-black uppercase rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 text-center"
              >
                Give Student Fees Concession
              </button>
            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center bg-neutral-50 border border-dashed border-neutral-200 rounded-[3rem]">
              <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest italic text-center p-8">
                Access Restricted or No Financial Stream Data
              </p>
            </div>
          )
        )}
      </div>

      {/* AI Intelligence Hub - Decision Support System */}
      {(isAdmin || isPrincipal || isVicePrincipal) && !isTeacherUser && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-sidebar via-sidebar/95 to-slate-900 rounded-3xl p-6 text-white relative overflow-hidden shadow-xl border border-white/5"
        >
          {/* Animated Background Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-[60px] -ml-24 -mb-24" />
          
          <div className="relative z-10">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl backdrop-blur-xl flex items-center justify-center shadow-inner">
                  <Zap className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                </div>
                <div>
                  <div className="flex justify-center items-center gap-2 mb-0.5">
                    <span className="bg-primary/20 text-primary text-[12px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest border border-primary/30">Intelligence Active</span>
                  </div>
                  <h2 className="text-xl font-black tracking-tight uppercase leading-none">AI Intelligence Hub</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-white/40 text-[12px] font-black uppercase tracking-[0.2em] italic">Decision Support System</p>
                    {settings.aiSpending !== undefined && (
                      <span className="bg-rose-500/20 text-rose-300 text-[12px] font-black px-1.5 py-0.5 rounded border border-rose-500/30 uppercase tracking-widest">
                        ₹{Number(settings.aiSpending).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <button 
                onClick={handleGenerateAIInsights}
                disabled={loadingAI}
                className="group relative w-full xl:w-auto px-6 py-3 bg-white text-sidebar rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg hover:bg-primary hover:text-white transition-all disabled:opacity-50 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center justify-center gap-3">
                  {loadingAI ? (
                    <div className="w-4 h-4 border-2 border-sidebar border-t-transparent group-hover:border-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {loadingAI ? 'Scanning...' : 'Synthesize Strategy'}
                </div>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {(aiInsights || savedInsights.length > 0) ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {aiInsights && (
                    <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-inner group transition-all mb-4">
                       <div dangerouslySetInnerHTML={{ __html: aiInsights.replace(/text-3xl|text-4xl/g, 'text-lg').replace(/p-10/g, 'p-4') }} className="prose prose-invert prose-sm max-w-none prose-p:text-white/70 prose-headings:text-white prose-strong:text-primary prose-a:text-indigo-400" />
                    </div>
                  )}

                  {savedInsights.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {savedInsights.map((insight, idx) => (
                        <div key={idx} className={`p-4 rounded-2xl border backdrop-blur-xl ${
                          insight.priority === 'high' ? 'bg-rose-500/10 border-rose-500/20' :
                          insight.priority === 'good' ? 'bg-emerald-500/10 border-emerald-500/20' :
                          'bg-amber-500/10 border-amber-500/20'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[12px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                              insight.priority === 'high' ? 'text-rose-400 bg-rose-400/10' :
                              insight.priority === 'good' ? 'text-emerald-400 bg-emerald-400/10' :
                              'text-amber-400 bg-amber-400/10'
                            }`}>
                              {insight.priority} Priority
                            </span>
                          </div>
                          <h4 className="text-[13px] font-black uppercase tracking-tight mb-1 text-white/90">{insight.title}</h4>
                          <p className="text-[12px] text-white/50 leading-relaxed font-bold italic line-clamp-2">"{insight.description}"</p>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-10 text-center flex flex-col items-center gap-4"
                >
                  <Sparkles className="w-8 h-8 text-white/10" />
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">Strategy Engine Ready</h3>
                    <p className="text-white/30 font-bold uppercase tracking-[0.2em] text-[12px] max-w-xs mx-auto">
                      Initiate data synthesis for strategic analysis.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Activity Logs (System Pulse) */}
        {hasPermission('settings_logs') && (
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            className="h-full"
          >
            <UserActivityPanel />
          </motion.div>
        )}

        {/* Today's Verified List - Now beside System Pulse */}
        {(!isStudent && !isParent && !isTeacherUser) && (
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
            className="h-full"
          >
            <VerifiedTodayList />
          </motion.div>
        )}
      </div>

      {/* Charts Section */}
      {(showFinancials || !isTeacherUser) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 }}
            className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] border border-white relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-30" />
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 relative z-10">
              <div>
                <h3 className="font-black text-sidebar uppercase tracking-tight text-2xl">
                  {showFinancials ? 'Financial Velocity' : 'Registry Presence Hub'}
                </h3>
                <p className="text-[10px] text-neutral-400 font-black tracking-[0.2em] uppercase italic">
                  {showFinancials ? 'Daily revenue analytics' : 'Statistical density of student engagement'}
                </p>
              </div>
              <select className="text-[10px] font-black border-2 border-neutral-100 bg-white rounded-xl px-4 py-2 outline-none uppercase tracking-widest focus:border-primary transition-all shadow-sm">
                <option>Cycle: 30 Days</option>
                <option>Cycle: Quarter</option>
              </select>
            </div>
            <div className="h-80 relative z-10">
              {showFinancials ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <ReTooltip 
                      contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '10px', color: '#94A3B8' }}
                    />
                    <ReLine type="monotone" dataKey="collection" stroke="#10B981" strokeWidth={3} dot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: '#10B981' }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <ReTooltip 
                      contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '10px', color: '#94A3B8' }}
                    />
                    <ReBar dataKey="attendance" fill="#F43F5E" radius={[10, 10, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {showFinancials && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.1 }}
              className="bg-white p-10 rounded-[3rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] border border-white flex flex-col relative overflow-hidden"
            >
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-30" />
            <div className="mb-10 relative z-10 text-center lg:text-left">
              <h3 className="font-black text-sidebar uppercase tracking-tight text-2xl">Quota Tracker</h3>
              <p className="text-[10px] text-neutral-400 font-black tracking-[0.2em] uppercase italic">Annual yield goals</p>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center relative z-10">
              <div className="relative w-full aspect-square max-w-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="80%"
                      outerRadius="100%"
                      paddingAngle={0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-4xl font-black text-sidebar leading-none tracking-tighter tabular-nums">{Math.round(stats.fees)}%</p>
                  <p className="text-[9px] text-neutral-400 font-black uppercase tracking-widest mt-2">Target Status</p>
                </div>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4 w-full">
                <div className="text-center p-5 bg-white rounded-[1.5rem] border border-neutral-100 shadow-sm">
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1.5">Efficiency</p>
                  <p className="text-base font-black text-sidebar">{Math.round(stats.fees)}%</p>
                </div>
                <div className="text-center p-5 bg-emerald-50 rounded-[1.5rem] border border-emerald-100 shadow-sm">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1.5">Integrity</p>
                  <p className="text-base font-black text-emerald-600 uppercase">Verified</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        </div>
      )}

      {/* Priority Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
        <AnimatePresence>
          {mySubstitutions.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/80 backdrop-blur-md p-8 rounded-[2.5rem] shadow-xl shadow-neutral-200/50 border border-white relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16" />
              <h3 className="font-black text-xl mb-6 flex items-center gap-3 text-primary uppercase tracking-tighter">
                <Sparkles className="w-5 h-5" />
                Active Substitutions
              </h3>
              <div className="space-y-4">
                {mySubstitutions.map((sub, idx) => (
                  <motion.div 
                    key={idx} 
                    whileHover={{ scale: 1.02 }}
                    className="p-5 bg-primary/5 rounded-2xl border border-primary/10 flex justify-between items-center group hover:bg-primary/10 transition-all border-l-4 border-l-primary"
                  >
                    <div>
                      <p className="font-black text-base text-sidebar uppercase tracking-tight">Period {sub.periodIndex}</p>
                      <p className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Substitute Protocol Active</p>
                      <p className="text-[10px] mt-2 italic text-primary/70 font-medium">"{sub.reason}"</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-white px-3 py-1.5 rounded-xl shadow-sm border border-primary/10">In Effect</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white/80 backdrop-blur-md p-8 rounded-[2.5rem] shadow-xl shadow-neutral-200/50 border border-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-2xl -mr-16 -mt-16" />
          <h3 className="font-black text-xl mb-6 flex items-center gap-3 text-rose-600 uppercase tracking-tighter">
            <AlertCircle className="w-5 h-5" />
            Critical Alerts
          </h3>
          <div className="space-y-4">
            <AlertItem title="Pending Fee Reminders" description="50 students have overdue payments. Review required." />
            {stats.pendingLeaves > 0 && (
              <div 
                onClick={() => window.location.href = '/dashboard/leaves'}
                className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 cursor-pointer hover:bg-amber-100 transition-all flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-sm text-amber-700 uppercase tracking-tighter">Pending Leave Requests</p>
                  <p className="text-xs text-amber-600/80">{stats.pendingLeaves} requests need your attention.</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-amber-600" />
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Concession Shortcut Modal */}
      <AnimatePresence>
        {isConcessionModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-sidebar/80 backdrop-blur-md" 
              onClick={() => setIsConcessionModalOpen(false)}
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-[96vw] xl:max-w-7xl rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col p-6 sm:p-8 md:p-10 border border-neutral-250 h-[94vh] max-h-[96vh] animate-in fade-in-50 duration-300"
            >
              <div className="flex items-center justify-between mb-5 sm:mb-8 shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className="bg-indigo-100 p-3 text-indigo-600 rounded-2xl">
                    <Banknote className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-sans font-black text-sidebar uppercase tracking-tight text-lg sm:text-xl">Fees Concession Override</h3>
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-0.5">VP Quick-Grant Console</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsConcessionModalOpen(false)}
                  className="p-2.5 hover:bg-neutral-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-neutral-400" />
                </button>
              </div>

              <div className="overflow-y-auto pr-1.5 flex-1 min-h-0 custom-scrollbar pb-2">
                {/* Close dropdown on outside click overlay */}
                {isSearchFocused && concessionSearchQuery.trim().length >= 3 && (
                  <div className="fixed inset-0 z-20" onClick={() => setIsSearchFocused(false)} />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
                  {/* Left Column: Student Selection */}
                  <div className="space-y-5">
                    <div className="border-b border-neutral-100 pb-3 mb-2">
                      <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest font-mono">1. Select Target Student</h4>
                    </div>

                    {/* Student Search bar */}
                    <div className="space-y-1.5 relative">
                      <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">
                        Search Student
                      </label>
                      <div className="relative z-30">
                        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search by student name, father's name, phone, or email ID..."
                          value={concessionSearchQuery}
                          onChange={(e) => {
                            setConcessionSearchQuery(e.target.value);
                            setIsSearchFocused(true);
                          }}
                          onFocus={() => setIsSearchFocused(true)}
                          className="w-full text-xs font-bold pl-10 pr-8 py-3.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 text-sidebar"
                        />
                        {concessionSearchQuery && (
                          <button 
                            type="button"
                            onClick={() => {
                              setConcessionSearchQuery('');
                              setSelectedConcessionStudent('');
                              setSelectedConcessionClass('');
                              setSelectedConcessionBatch('');
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Search results suggestions */}
                      {isSearchFocused && concessionSearchQuery.trim().length >= 3 && (
                        <div className="absolute z-30 w-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
                          {filteredStudents.length > 0 ? (
                            filteredStudents.map(s => (
                              <div
                                key={s.id || s.uid}
                                onClick={() => {
                                  setSelectedConcessionClass(s.classId || '');
                                  setSelectedConcessionBatch(s.batchId || '');
                                  setSelectedConcessionStudent(s.id || s.uid || '');
                                  setConcessionSearchQuery(s.name);
                                  setIsSearchFocused(false);
                                }}
                                className="w-full text-left px-4 py-3.5 hover:bg-indigo-50/50 transition-colors flex flex-col gap-1 border-b border-neutral-100 last:border-b-0 cursor-pointer"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-bold text-neutral-800">{s.name}</span>
                                  <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-mono">
                                    {concessionClasses.find(c => c.id === s.classId)?.name || s.class || 'No Class'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-2 text-[10px] text-neutral-500">
                                  {concessionBatches.find(b => b.id === s.batchId)?.name && (
                                    <div>Batch: <span className="font-semibold text-neutral-750">{concessionBatches.find(b => b.id === s.batchId)?.name}</span></div>
                                  )}
                                  {s.fatherName && <div>Father: <span className="font-semibold text-neutral-750">{s.fatherName}</span></div>}
                                  {(s.phone || s.contact || s.whatsappNumber) && <div className={concessionBatches.find(b => b.id === s.batchId)?.name ? "" : "col-span-2"}>Phone: <span className="font-semibold text-neutral-700">{s.phone || s.contact || s.whatsappNumber}</span></div>}
                                  {s.email && <div className="col-span-2 truncate">Email: <span className="font-semibold text-neutral-700">{s.email}</span></div>}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-4 text-xs text-neutral-400 text-center font-medium italic">
                              No matching students found
                            </div>
                          )}
                        </div>
                      )}
                      {concessionSearchQuery.trim().length > 0 && concessionSearchQuery.trim().length < 3 && (
                        <span className="text-[9px] text-neutral-405 font-bold block mt-1 uppercase tracking-wider italic font-mono">
                          Please type at least 3 letters to search
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Filter by Class input */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">Filter by Class</label>
                        <select
                          value={selectedConcessionClass}
                          onChange={(e) => {
                            setSelectedConcessionClass(e.target.value);
                            setSelectedConcessionStudent('');
                          }}
                          className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 text-sidebar font-semibold"
                        >
                          <option value="">-- Choose Class --</option>
                          {concessionClasses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Filter by Batch input (only showing selected-class-related batches) */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">Filter by Batch</label>
                        <select
                          disabled={!selectedConcessionClass}
                          value={selectedConcessionBatch}
                          onChange={(e) => {
                            setSelectedConcessionBatch(e.target.value);
                            setSelectedConcessionStudent('');
                          }}
                          className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 text-sidebar disabled:opacity-50 font-semibold"
                        >
                          <option value="">
                            {!selectedConcessionClass ? 'Select class first' : '-- Choose Batch --'}
                          </option>
                          {concessionBatches
                            .filter(b => b.classId === selectedConcessionClass)
                            .map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))
                          }
                        </select>
                      </div>
                    </div>

                    {/* Choose Student select */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">Choose Student From Selection</label>
                      <select
                        disabled={!selectedConcessionClass}
                        value={selectedConcessionStudent}
                        onChange={(e) => setSelectedConcessionStudent(e.target.value)}
                        className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 text-sidebar disabled:opacity-50"
                      >
                        <option value="">
                          {!selectedConcessionClass ? 'Select class/batch filters first' : '-- Choose Student --'}
                        </option>
                        {(selectedConcessionBatch 
                          ? concessionClassStudents.filter(s => s.batchId === selectedConcessionBatch) 
                          : concessionClassStudents
                        ).map(s => (
                          <option key={s.id || s.uid} value={s.id || s.uid}>
                            {s.name} (Roll: {s.rollNumber || s.rollNo || 'N/A'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Right Column: Concession Settings */}
                  <div className="space-y-5">
                    <div className="border-b border-neutral-100 pb-3 mb-2">
                      <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest font-mono">2. Assign Concession Scheme</h4>
                    </div>

                    {/* Selected Student Details Card Overlay */}
                    {selectedConcessionStudent ? (
                      (() => {
                        const activeStudentObj = studentsForSearch.find(s => (s.id === selectedConcessionStudent || s.uid === selectedConcessionStudent));
                        if (!activeStudentObj) return null;
                        return (
                          <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in fade-in-50 duration-200">
                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block mb-2 font-mono">Active Student Target</span>
                            <div className="flex gap-4 items-start">
                              <div className="flex-1 space-y-1">
                                <h4 className="text-sm font-black text-sidebar uppercase tracking-tight">{activeStudentObj.name}</h4>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-neutral-500 font-bold font-mono">
                                  <div>Class: <span className="text-neutral-700 font-extrabold">{concessionClasses.find(c => c.id === activeStudentObj.classId)?.name || activeStudentObj.class || 'N/A'}</span></div>
                                  {concessionBatches.find(b => b.id === activeStudentObj.batchId)?.name ? (
                                    <div>Batch: <span className="text-neutral-700 font-extrabold">{concessionBatches.find(b => b.id === activeStudentObj.batchId)?.name}</span></div>
                                  ) : null}
                                  {(activeStudentObj.rollNumber || activeStudentObj.rollNo) && <div>Roll No: <span className="text-neutral-700 font-extrabold">{activeStudentObj.rollNumber || activeStudentObj.rollNo}</span></div>}
                                  {activeStudentObj.fatherName && <div className="col-span-2">Father: <span className="text-neutral-700 font-extrabold text-xs">{activeStudentObj.fatherName}</span></div>}
                                  {(activeStudentObj.phone || activeStudentObj.contact || activeStudentObj.whatsappNumber) && <div>Phone: <span className="text-neutral-700 font-extrabold">{activeStudentObj.phone || activeStudentObj.contact || activeStudentObj.whatsappNumber}</span></div>}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="p-5 bg-neutral-50 border border-dashed border-neutral-200 rounded-2xl text-center">
                        <span className="text-[10px] font-black text-neutral-450 uppercase tracking-widest block font-mono italic">
                          No student selected yet
                        </span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">Select Fee Concession Type</label>
                      <select
                        value={selectedConcessionId}
                        onChange={(e) => setSelectedConcessionId(e.target.value)}
                        className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 text-sidebar"
                      >
                        <option value="">-- Choose Concession Type --</option>
                        <option value="none">None (No Concession)</option>
                        <option value="custom">Custom Concession (Flat Amount) 🌟</option>
                        {allConcessions.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type === 'percentage' ? `${c.value}%` : `₹${c.value}`})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedConcessionId === 'custom' && (
                      <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                        <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block font-mono">
                          Custom Concession Amount (₹) *
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          placeholder="e.g. 5000"
                          value={customConcessionAmount}
                          onChange={(e) => setCustomConcessionAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full text-xs font-bold p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl outline-none focus:border-indigo-500 text-sidebar font-mono font-bold"
                        />
                      </div>
                    )}

                    {/* Beautiful Concession Scheme Info Box */}
                    {selectedConcessionId && selectedConcessionId !== 'none' && (
                      (() => {
                        const scheme = allConcessions.find(c => c.id === selectedConcessionId);
                        if (!scheme && selectedConcessionId !== 'custom') return null;
                        return (
                          <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 block mb-1 font-mono">Concession Policy Preview</span>
                            <p className="text-xs font-black text-neutral-800 uppercase tracking-tight">
                              {selectedConcessionId === 'custom' ? 'Custom Flat Rate Overwrite' : scheme?.name}
                            </p>
                            <p className="text-[11px] text-neutral-500 font-medium mt-1 leading-relaxed">
                              {selectedConcessionId === 'custom' 
                                ? `Applies a custom flat discount of ₹${Number(customConcessionAmount || 0).toLocaleString()} to core Academic School Fees.`
                                : `Applies a ${scheme?.type === 'percentage' ? `${scheme?.value}% percentage` : `fixed ₹${scheme?.value}`} discount directed toward ${scheme?.appliedTo === 'transport' ? '🚌 Facility Transportation Fees' : scheme?.appliedTo === 'hostel' ? '🏢 Hostel Accommodation Fees' : '🏫 Core Academic School Fees'}.`
                              }
                            </p>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-6 sm:mt-10 shrink-0 pt-5 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsConcessionModalOpen(false)}
                  className="flex-1 py-4 text-xs font-black uppercase text-neutral-500 hover:bg-neutral-50 rounded-2xl border border-neutral-200 transition-all text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingConcession}
                  onClick={handleApplyConcession}
                  className="flex-1 py-4 text-xs font-black uppercase text-white bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/20 rounded-2xl shadow-md disabled:opacity-50 transition-all text-center"
                >
                  {processingConcession ? 'Processing...' : 'Apply Concession'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Revenue Breakdown Modal */}
      <AnimatePresence>
        {isRevenueModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-sidebar/80 backdrop-blur-md" 
              onClick={() => setIsRevenueModalOpen(false)}
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col p-5 sm:p-8 md:p-10 max-h-[90dvh] sm:max-h-[90vh] border border-neutral-250 animate-in fade-in-50 duration-300"
            >
              <div className="flex items-center justify-between mb-5 sm:mb-8 shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className="bg-amber-100 p-2.5 sm:p-3 text-amber-600 rounded-2xl">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-sidebar uppercase tracking-tight">Revenue Breakdown</h3>
                    <p className="text-[10px] sm:text-xs text-neutral-450 font-bold uppercase tracking-wider font-mono">Academic Year {settings?.currentAcademicYear || '2026-27'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsRevenueModalOpen(false)}
                  className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Container */}
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 sm:space-y-8 pr-1 min-h-0">
                {/* Overall Revenue Summary Card */}
                <div className="p-4 sm:p-6 bg-gradient-to-r from-amber-500/10 to-amber-600/5 rounded-2xl border border-amber-500/10 flex flex-col sm:flex-row justify-between items-center gap-5 sm:gap-6">
                  <div className="flex-1 space-y-1.5 w-full">
                    <div className="flex justify-between text-[11px] sm:text-xs text-amber-800 font-bold uppercase tracking-wider font-mono">
                      <span>Overall Collection Progress</span>
                      <span>
                        {revenueDetails.totalPayable > 0 
                          ? `${Math.round((revenueDetails.totalCollected / revenueDetails.totalPayable) * 100)}%` 
                          : '0%'
                        }
                      </span>
                    </div>
                    <div className="w-full h-2.5 sm:h-3 bg-amber-500/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                        style={{ 
                          width: `${revenueDetails.totalPayable > 0 
                            ? Math.min(100, (revenueDetails.totalCollected / revenueDetails.totalPayable) * 100) 
                            : 0}%` 
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 w-full sm:w-auto shrink-0 border-t border-amber-500/10 pt-4 sm:pt-0 sm:border-0">
                    <div className="text-left sm:text-right flex-1 sm:flex-initial">
                      <span className="text-[9px] sm:text-[10px] font-black text-neutral-450 uppercase tracking-widest block font-mono">Total Collected</span>
                      <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">₹{revenueDetails.totalCollected.toLocaleString()}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-neutral-200 hidden sm:block" />
                    <div className="text-right flex-1 sm:flex-initial">
                      <span className="text-[9px] sm:text-[10px] font-black text-neutral-450 uppercase tracking-widest block font-mono">Total Pending</span>
                      <span className="text-xl sm:text-2xl font-black text-rose-500 font-mono">₹{revenueDetails.totalPending.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Term Wise breakdown Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                  {[
                    {
                      title: 'Term 1 Fees',
                      desc: 'Core academic term fee, transport, and admissions',
                      collected: revenueDetails.term1Collected,
                      pending: revenueDetails.term1Pending,
                    },
                    {
                      title: 'Term 2 Fees',
                      desc: 'Mid-term academic components, transport, and hostels',
                      collected: revenueDetails.term2Collected,
                      pending: revenueDetails.term2Pending,
                    },
                    {
                      title: 'Term 3 Fees',
                      desc: 'Final term academic components, transport, and hostels',
                      collected: revenueDetails.term3Collected,
                      pending: revenueDetails.term3Pending,
                    }
                  ].map((term, index) => {
                    const totalTerm = term.collected + term.pending;
                    const termPercent = totalTerm > 0 ? Math.round((term.collected / totalTerm) * 100) : 0;
                    
                    return (
                      <div key={index} className="p-5 sm:p-6 border border-neutral-200 rounded-2xl flex flex-col justify-between hover:shadow-md transition-all bg-white">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-black text-sidebar text-sm sm:text-base uppercase tracking-tight">{term.title}</h4>
                            <span className="text-[10px] sm:text-xs font-bold font-mono text-neutral-450">AY {settings?.currentAcademicYear || '2026-27'}</span>
                          </div>
                          <p className="text-xs text-neutral-400 mb-4 sm:mb-6 font-medium leading-relaxed">{term.desc}</p>
                        </div>

                        <div className="space-y-3.5 sm:space-y-4">
                          <div className="flex justify-between items-end border-b border-neutral-100 pb-2">
                            <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest font-mono">Collected</span>
                            <span className="text-base sm:text-lg font-bold text-emerald-600 font-mono">₹{term.collected.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-end border-b border-neutral-100 pb-2">
                            <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest font-mono">Pending</span>
                            <span className="text-base sm:text-lg font-bold text-rose-500 font-mono">₹{term.pending.toLocaleString()}</span>
                          </div>

                          <div className="space-y-1 pt-1.5">
                            <div className="flex justify-between text-[10px] text-neutral-450 font-bold uppercase tracking-widest font-mono">
                              <span>Collection Progress</span>
                              <span>{termPercent}%</span>
                            </div>
                            <div className="w-full h-1.5 sm:h-2 bg-neutral-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                                style={{ width: `${termPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-5 sm:mt-8 pt-4 sm:pt-5 border-t border-neutral-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsRevenueModalOpen(false)}
                  className="w-full sm:w-auto px-6 py-3 sm:py-3.5 text-xs font-black uppercase text-neutral-500 hover:bg-neutral-50 rounded-2xl border border-neutral-200 transition-all text-center"
                >
                  Close Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Dashboard;
