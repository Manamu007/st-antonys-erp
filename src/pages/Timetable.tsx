import React, { useEffect, useState } from 'react';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { 
  Table as TableIcon, 
  Clock, 
  User as UserIcon, 
  BookOpen, 
  Sparkles, 
  Filter,
  Download,
  FileDown,
  Plus,
  Save,
  Users,
  AlertCircle,
  FileText,
  UserCheck,
  Send,
  CalendarDays,
  ClipboardList,
  Wand2,
  Trash2,
  Share2,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  Search,
  Monitor,
  X,
  Edit2
} from 'lucide-react';
import { toast } from 'sonner';
import { getSubstitutionSuggestions, generateAITimetable, generateAIContent } from '../services/aiService';
import { whatsappService } from '../services/whatsappService';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { safeStorage as localStorage } from '../lib/safeStorage';
import { where, collection, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import Papa from 'papaparse';
import { sortAlphabetically } from '../lib/utils';
import { SortAsc, SortDesc } from 'lucide-react';
import { TimetableDoc, PeriodSlot as Period } from '../types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ColorTheme {
  bg: string;
  text: string;
  border: string;
  hexBg: string;
  hexText: string;
}

const SUBJECT_PALETTE: ColorTheme[] = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', hexBg: '#dbeafe', hexText: '#1d4ed8' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', hexBg: '#f3e8ff', hexText: '#7e22ce' },
  { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', hexBg: '#dcfce7', hexText: '#15803d' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', hexBg: '#fef3c7', hexText: '#b45309' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', hexBg: '#ffe4e6', hexText: '#be123c' },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', hexBg: '#ffedd5', hexText: '#c2410c' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', hexBg: '#cffafe', hexText: '#0e7490' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hexBg: '#d1fae5', hexText: '#047857' },
  { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200', hexBg: '#f0fdf4', hexText: '#4d7c0f' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', hexBg: '#e0e7ff', hexText: '#4338ca' },
  { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', hexBg: '#fef9c3', hexText: '#a16207' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', hexBg: '#fce7f3', hexText: '#be185d' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200', hexBg: '#fae8ff', hexText: '#a21caf' },
  { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', hexBg: '#e0f2fe', hexText: '#0369a1' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200', hexBg: '#ccfbf1', hexText: '#0f766e' },
  { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', hexBg: '#ede9fe', hexText: '#6d28d9' }
];

const BREAK_COLOR: ColorTheme = {
  bg: 'bg-rose-50/80',
  text: 'text-rose-700',
  border: 'border-rose-100',
  hexBg: '#fef2f2',
  hexText: '#b91c1c'
};

const DEFAULT_COLOR: ColorTheme = {
  bg: 'bg-neutral-100',
  text: 'text-neutral-700',
  border: 'border-neutral-200',
  hexBg: '#f5f5f5',
  hexText: '#404040'
};

const getSubjectColor = (subjectName: string): ColorTheme => {
  if (!subjectName) return DEFAULT_COLOR;
  const name = subjectName.trim().toLowerCase();
  if (name.includes('math')) return SUBJECT_PALETTE[0];
  if (name.includes('english')) return SUBJECT_PALETTE[1];
  if (name.includes('scien') || name.includes('evs')) return SUBJECT_PALETTE[2];
  if (name.includes('social') || name.includes('hist') || name.includes('geog')) return SUBJECT_PALETTE[3];
  if (name.includes('telugu')) return SUBJECT_PALETTE[4];
  if (name.includes('hindi')) return SUBJECT_PALETTE[5];
  if (name.includes('physic')) return SUBJECT_PALETTE[6];
  if (name.includes('chem')) return SUBJECT_PALETTE[7];
  if (name.includes('biol')) return SUBJECT_PALETTE[8];
  if (name.includes('computer') || name.includes('it') || name.includes('coding')) return SUBJECT_PALETTE[9];
  if (name.includes('sport') || name.includes('pe') || name.includes('pt')) return SUBJECT_PALETTE[10];
  if (name.includes('music')) return SUBJECT_PALETTE[11];
  if (name.includes('art') || name.includes('draw')) return SUBJECT_PALETTE[12];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SUBJECT_PALETTE.length;
  return SUBJECT_PALETTE[index];
};

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result 
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ]
    : [245, 245, 245];
};

const Timetable: React.FC = () => {
  const { isStudent, hasPermission, profile, isAdmin } = useAuth();
  const { settings } = useSettings();

  type TimetableTab = 'class' | 'teacher' | 'master' | 'substitution';

  // Data States
  const [teachers, setTeachers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TimetableTab>('class');

  const canManageTimetable = !!(
    isAdmin || 
    profile?.role === 'admin' || 
    profile?.role === 'principal' || 
    profile?.role === 'vice_principal' || 
    hasPermission('timetable_manage')
  );

  const isTeacherRole = !canManageTimetable && (
    profile?.role === 'teacher' || 
    profile?.role === 'teacher_class' || 
    profile?.role === 'teacher_subject' || 
    profile?.role === 'coordinator' || 
    profile?.role === 'staff' ||
    profile?.role === 'play_school_incharge' ||
    (profile as any)?.staffType === 'teaching' ||
    teachers.some(t => t.uid === profile?.uid)
  );
  
  const isStrictTeacher = isTeacherRole;

  if (!hasPermission('view_timetable') && !hasPermission('timetable_manage') && !hasPermission('timetable_view_my') && !hasPermission('portal_student_view_timetable')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <Clock className="w-12 h-12 text-primary mb-4" />
        <h2 className="text-2xl font-black text-sidebar uppercase tracking-tight">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2 text-[15px] font-bold">
          You do not have permission to view timetable. Please contact your administrator.
        </p>
      </div>
    );
  }

  // Update active tab based on permissions
  useEffect(() => {
    if (isStudent || profile?.role === 'student' || profile?.role === 'parent') {
      setActiveTab('class');
      return;
    }
    if ((hasPermission('view_timetable') || hasPermission('timetable_view_my')) && !hasPermission('timetable_manage')) {
      setActiveTab('teacher');
    }
  }, [hasPermission, isStudent, profile?.role]);
  
  // Data States
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teacherViewType, setTeacherViewType] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(format(new Date(), 'EEEE'));
  const [timetables, setTimetables] = useState<TimetableDoc[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [substitutions, setSubstitutions] = useState<any[]>([]);
  const [staffAttendance, setStaffAttendance] = useState<any[]>([]);
  const [selectedSubstitutions, setSelectedSubstitutions] = useState<Record<string, string>>({});
  const [whatsappLogs, setWhatsappLogs] = useState<string[]>([]);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  // Selection States
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<{ label: string; status: 'pending' | 'running' | 'success' | 'failed' }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [masterViewDay, setMasterViewDay] = useState<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'>('Monday');
  const [showManualEditModal, setShowManualEditModal] = useState(false);
  const [showSchedulerSettings, setShowSchedulerSettings] = useState(false);
  const [schedulerConfig, setSchedulerConfig] = useState<{
    firstPeriodClassTeacher: boolean;
    preventConsecutiveSameSubject: boolean;
    maxConsecutivePeriodsPerTeacher: number;
    coreSubjectsEarly: boolean;
    maxPeriodsPerDayPerTeacher: number;
    evenWorkloadDistribution: boolean;
    subjectRequiredPeriods: Record<string, number>;
  }>(() => {
    try {
      const saved = localStorage.getItem('school_erp_scheduler_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          firstPeriodClassTeacher: true,
          preventConsecutiveSameSubject: true,
          maxConsecutivePeriodsPerTeacher: 3,
          coreSubjectsEarly: true,
          maxPeriodsPerDayPerTeacher: 6,
          evenWorkloadDistribution: true,
          subjectRequiredPeriods: {},
          ...parsed
        };
      }
    } catch (e) {
      console.error(e);
    }
    return {
      firstPeriodClassTeacher: true,
      preventConsecutiveSameSubject: true,
      maxConsecutivePeriodsPerTeacher: 3,
      coreSubjectsEarly: true,
      maxPeriodsPerDayPerTeacher: 6,
      evenWorkloadDistribution: true,
      subjectRequiredPeriods: {},
    };
  });

  useEffect(() => {
    localStorage.setItem('school_erp_scheduler_config', JSON.stringify(schedulerConfig));
  }, [schedulerConfig]);
  const [customRules, setCustomRules] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('school_erp_scheduler_custom_rules');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [
      {
        id: 'seed-1',
        type: 'subject_range',
        subjectId: '',
        timeRange: 'morning',
        isActive: false,
      },
      {
        id: 'seed-2',
        type: 'teacher_unavailable',
        teacherId: '',
        day: 'Saturday',
        slotLabel: 'P6',
        isActive: false,
      }
    ];
  });

  const saveCustomRules = (newRules: any[]) => {
    setCustomRules(newRules);
    localStorage.setItem('school_erp_scheduler_custom_rules', JSON.stringify(newRules));
  };

  const [activeSettingsTab, setActiveSettingsTab] = useState<'standard' | 'subjects' | 'custom'>('standard');
  const [newRuleType, setNewRuleType] = useState<'teacher_unavailable' | 'subject_limit' | 'fixed_slot' | 'subject_range' | 'subject_weekly_limit' | 'class_teacher_last_periods' | 'continuous_double_periods' | 'daily_same_period_subject'>('teacher_unavailable');
  const [newRuleTeacherId, setNewRuleTeacherId] = useState('');
  const [newRuleSubjectId, setNewRuleSubjectId] = useState('');
  const [newRuleBatchId, setNewRuleBatchId] = useState('');
  const [newRuleDay, setNewRuleDay] = useState('Monday');
  const [newRuleSlotLabel, setNewRuleSlotLabel] = useState('All Periods');
  const [newRuleLimitValue, setNewRuleLimitValue] = useState(1);
  const [newRuleTimeRange, setNewRuleTimeRange] = useState<'morning' | 'afternoon'>('morning');

  // Support for Multi-select Custom Rules
  const [newRuleSubjectIds, setNewRuleSubjectIds] = useState<string[]>([]);
  const [newRuleBatchIds, setNewRuleBatchIds] = useState<string[]>([]);
  const [newRuleDays, setNewRuleDays] = useState<string[]>(['Monday']);

  const [addingOverrideSubId, setAddingOverrideSubId] = useState<string | null>(null);
  const [overrideBatchId, setOverrideBatchId] = useState<string>('');
  const [overrideBatchIds, setOverrideBatchIds] = useState<string[]>([]);
  const [batchSearchQuery, setBatchSearchQuery] = useState('');
  const [overrideTargetVal, setOverrideTargetVal] = useState<number>(5);

  const getBatchFullName = (batchId: string) => {
    const b = batches.find(x => x.id === batchId);
    if (!b) return 'Unknown Batch';
    const cls = classes.find(c => c.id === b.classId);
    return cls ? `${cls.name} - ${b.name}` : b.name;
  };

  const getFilteredCustomRules = () => {
    return customRules.map(rule => {
      let cleanRule = { ...rule };
      
      // Filter batchIds to only include ones that actually exist in batches list
      if (cleanRule.batchIds && Array.isArray(cleanRule.batchIds)) {
        cleanRule.batchIds = cleanRule.batchIds.filter((id: string) => id === 'all' || batches.some(b => b.id === id));
        if (cleanRule.batchIds.length > 0) {
          cleanRule.batchId = cleanRule.batchIds[0];
        } else {
          cleanRule.batchId = '';
        }
      } else if (cleanRule.batchId && cleanRule.batchId !== 'all') {
        const exists = batches.some(b => b.id === cleanRule.batchId);
        if (exists) {
          cleanRule.batchIds = [cleanRule.batchId];
        } else {
          cleanRule.batchId = '';
        }
      }

      // Filter subjectIds to only include ones that actually exist in subjects list
      if (cleanRule.subjectIds && Array.isArray(cleanRule.subjectIds)) {
        cleanRule.subjectIds = cleanRule.subjectIds.filter((id: string) => subjects.some(s => s.id === id));
        if (cleanRule.subjectIds.length > 0) {
          cleanRule.subjectId = cleanRule.subjectIds[0];
        } else {
          cleanRule.subjectId = '';
        }
      } else if (cleanRule.subjectId) {
        const exists = subjects.some(s => s.id === cleanRule.subjectId);
        if (exists) {
          cleanRule.subjectIds = [cleanRule.subjectId];
        } else {
          cleanRule.subjectId = '';
        }
      }

      // Filter teacherId to only include ones that actually exist in teachers list
      if (cleanRule.teacherId) {
        const exists = teachers.some(t => t.uid === cleanRule.teacherId);
        if (!exists) {
          cleanRule.teacherId = '';
        }
      }

      return cleanRule;
    }).filter(rule => {
      // If a rule requires specific elements and they are empty after filtering, exclude it
      if (rule.type === 'teacher_unavailable' && !rule.teacherId) return false;
      if (rule.type === 'fixed_slot') {
        if (!rule.batchIds || rule.batchIds.length === 0) return false;
        if (!rule.subjectIds || rule.subjectIds.length === 0) return false;
      }
      if (rule.type === 'subject_limit' && (!rule.subjectIds || rule.subjectIds.length === 0)) return false;
      if (rule.type === 'subject_weekly_limit' && (!rule.subjectIds || rule.subjectIds.length === 0)) return false;
      if (rule.type === 'subject_range' && (!rule.subjectIds || rule.subjectIds.length === 0)) return false;
      if (rule.type === 'continuous_double_periods' && (!rule.subjectIds || rule.subjectIds.length === 0)) return false;
      if (rule.type === 'daily_same_period_subject') return true;
      
      return true;
    });
  };

  const batchesCount = batches.length;
  const subjectsCount = subjects.length;
  const teachersCount = teachers.length;

  useEffect(() => {
    if (batchesCount > 0 && subjectsCount > 0 && teachersCount > 0 && customRules.length > 0) {
      const filtered = getFilteredCustomRules();
      const originalStr = JSON.stringify(customRules);
      const filteredStr = JSON.stringify(filtered);
      if (originalStr !== filteredStr) {
        saveCustomRules(filtered);
      }
    }
  }, [batchesCount, subjectsCount, teachersCount]);

  const handleAddCustomRule = () => {
    let ruleData: any = {
      id: 'rule_' + Date.now(),
      type: newRuleType,
      isActive: true,
    };

    if (newRuleType === 'teacher_unavailable') {
      if (!newRuleTeacherId) {
        toast.error('Please select a teacher');
        return;
      }
      if (newRuleDays.length === 0) {
        toast.error('Please select at least one weekday');
        return;
      }
      ruleData.teacherId = newRuleTeacherId;
      ruleData.days = newRuleDays;
      ruleData.day = newRuleDays[0]; // fallback
      ruleData.slotLabel = newRuleSlotLabel;
      if (newRuleBatchIds.length > 0 && !newRuleBatchIds.includes('all')) {
        ruleData.batchIds = newRuleBatchIds;
        ruleData.batchId = newRuleBatchIds[0]; // fallback
      }
    } else if (newRuleType === 'subject_limit') {
      if (newRuleSubjectIds.length === 0) {
        toast.error('Please select at least one subject');
        return;
      }
      ruleData.subjectIds = newRuleSubjectIds;
      ruleData.subjectId = newRuleSubjectIds[0]; // fallback
      ruleData.limitValue = newRuleLimitValue;
      if (newRuleBatchIds.length > 0 && !newRuleBatchIds.includes('all')) {
        ruleData.batchIds = newRuleBatchIds;
        ruleData.batchId = newRuleBatchIds[0]; // fallback
      }
    } else if (newRuleType === 'subject_weekly_limit') {
      if (newRuleSubjectIds.length === 0) {
        toast.error('Please select at least one subject');
        return;
      }
      ruleData.subjectIds = newRuleSubjectIds;
      ruleData.subjectId = newRuleSubjectIds[0]; // fallback
      ruleData.limitValue = newRuleLimitValue;
      if (newRuleBatchIds.length > 0 && !newRuleBatchIds.includes('all')) {
        ruleData.batchIds = newRuleBatchIds;
        ruleData.batchId = newRuleBatchIds[0]; // fallback
      }
    } else if (newRuleType === 'fixed_slot') {
      if (newRuleBatchIds.length === 0 || newRuleBatchIds.includes('all')) {
        toast.error('Please select at least one specific class/batch');
        return;
      }
      if (newRuleSubjectIds.length === 0) {
        toast.error('Please select at least one subject');
        return;
      }
      if (newRuleDays.length === 0) {
        toast.error('Please select at least one weekday');
        return;
      }
      ruleData.batchIds = newRuleBatchIds;
      ruleData.batchId = newRuleBatchIds[0]; // fallback
      ruleData.subjectIds = newRuleSubjectIds;
      ruleData.subjectId = newRuleSubjectIds[0]; // fallback
      ruleData.days = newRuleDays;
      ruleData.day = newRuleDays[0]; // fallback
      ruleData.slotLabel = newRuleSlotLabel;
    } else if (newRuleType === 'subject_range') {
      if (newRuleSubjectIds.length === 0) {
        toast.error('Please select at least one subject');
        return;
      }
      ruleData.subjectIds = newRuleSubjectIds;
      ruleData.subjectId = newRuleSubjectIds[0]; // fallback
      ruleData.timeRange = newRuleTimeRange;
      if (newRuleBatchIds.length > 0 && !newRuleBatchIds.includes('all')) {
        ruleData.batchIds = newRuleBatchIds;
        ruleData.batchId = newRuleBatchIds[0]; // fallback
      }
    } else if (newRuleType === 'class_teacher_last_periods') {
      ruleData.limitValue = newRuleLimitValue; // 1 or 2
      if (newRuleBatchIds.length > 0 && !newRuleBatchIds.includes('all')) {
        ruleData.batchIds = newRuleBatchIds;
        ruleData.batchId = newRuleBatchIds[0]; // fallback
      }
    } else if (newRuleType === 'continuous_double_periods') {
      if (newRuleSubjectIds.length === 0) {
        toast.error('Please select at least one subject');
        return;
      }
      ruleData.subjectIds = newRuleSubjectIds;
      ruleData.subjectId = newRuleSubjectIds[0]; // fallback
      if (newRuleBatchIds.length > 0 && !newRuleBatchIds.includes('all')) {
        ruleData.batchIds = newRuleBatchIds;
        ruleData.batchId = newRuleBatchIds[0]; // fallback
      }
    } else if (newRuleType === 'daily_same_period_subject') {
      ruleData.subjectIds = newRuleSubjectIds.length > 0 ? newRuleSubjectIds : ['all'];
      ruleData.subjectId = newRuleSubjectIds[0] || 'all'; // fallback
      ruleData.slotLabel = newRuleSlotLabel;
      if (newRuleBatchIds.length > 0 && !newRuleBatchIds.includes('all')) {
        ruleData.batchIds = newRuleBatchIds;
        ruleData.batchId = newRuleBatchIds[0]; // fallback
      } else {
        ruleData.batchIds = ['all'];
        ruleData.batchId = 'all';
      }
    }

    const updated = [...customRules, ruleData];
    saveCustomRules(updated);
    toast.success('Custom constraint successfully added to school rulebook!');

    // Reset some states
    setNewRuleTeacherId('');
    setNewRuleSubjectIds([]);
    setNewRuleBatchIds([]);
    setNewRuleDays(['Monday']);
  };

  const toggleCustomRule = (id: string) => {
    const updated = customRules.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r);
    saveCustomRules(updated);
  };

  const deleteCustomRule = (id: string) => {
    const updated = customRules.filter(r => r.id !== id);
    saveCustomRules(updated);
    toast.success('Rule removed');
  };

  const [manualRulePrompt, setManualRulePrompt] = useState('');
  const [isParsingRule, setIsParsingRule] = useState(false);

  const handleParseManualRule = async () => {
    if (!manualRulePrompt.trim()) {
      toast.error('Please enter a custom rule in plain text first.');
      return;
    }

    setIsParsingRule(true);
    try {
      const teachersContext = teachers.map(t => ({ id: t.uid, name: t.name }));
      const subjectsContext = subjects.map(s => ({ id: s.id, name: s.name }));
      const batchesContext = batches.map(b => ({ id: b.id, name: b.name }));

      const systemInstruction = `You are an expert AI Scheduler Rule Parser for St. Antony's School. Your job is to parse a school timetable rule written in natural language into a structured JSON rule object that our algorithm can understand.

We support these structured rules:
1. Teacher Unavailability:
   - type: 'teacher_unavailable'
   - teacherId: <matching teacher id from teachers list>
   - day: <matching weekday name, must be one of: 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'>
   - slotLabel: <matching slot label, e.g., 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', or specify 'All Periods' if they are unavailable for the whole day / all day>
   - batchId: <optional class/batch id if they are only unavailable for a particular class/batch, otherwise omit or set to "all">
2. Subject Daily Limit:
   - type: 'subject_limit'
   - subjectId: <matching subject id from subjects list>
   - limitValue: <number, max periods of this subject per day for any class>
   - batchId: <optional class/batch id if this limit only applies to a particular class/batch, otherwise omit or set to "all">
3. Subject Weekly Limit:
   - type: 'subject_weekly_limit'
   - subjectId: <matching subject id from subjects list>
   - limitValue: <number, max periods of this subject per week, e.g., 2>
   - batchId: <optional class/batch id if this weekly limit only applies to a particular class/batch, otherwise omit or set to "all">
4. Fixed Slot:
   - type: 'fixed_slot'
   - batchId: <matching class/batch id from batches list>
   - subjectId: <matching subject id from subjects list>
   - day: <matching weekday name>
   - slotLabel: <matching slot label>
5. Subject Session Bias:
   - type: 'subject_range'
   - subjectId: <matching subject id from subjects list>
   - timeRange: 'morning' or 'afternoon'
   - batchId: <optional class/batch id if this preference only applies to a particular class/batch, otherwise omit or set to "all">
6. Class Teacher for Last Periods:
   - type: 'class_teacher_last_periods'
   - limitValue: <number, 1 or 2, representing number of last periods to assign to Class Teacher only>
   - batchId: <optional class/batch id if this only applies to a particular class/batch, otherwise omit or set to "all">
 7. Continuous Same Subject Periods:
   - type: 'continuous_double_periods'
   - subjectId: <matching subject id from subjects list>
   - batchId: <optional class/batch id if this only applies to a particular class/batch, otherwise omit or set to "all">
 8. Daily Same Period Same Subject:
   - type: 'daily_same_period_subject'
   - subjectId: <matching subject id from subjects list>
   - slotLabel: <matching slot label>
   - batchId: <optional class/batch id if this only applies to a particular class/batch, otherwise omit or set to "all">

If the rule does not fit any of the above structured types (e.g. "No chemistry on rainy days", or "Do not assign heavy periods near each other"), return it as a custom text rule:
- type: 'custom_text'
- text: <a clear, polished, concise summary of the rule>

Context Data for matching IDs:
Teachers: \${JSON.stringify(teachersContext)}
Subjects: \${JSON.stringify(subjectsContext)}
Batches: \${JSON.stringify(batchesContext)}
Days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
Slots: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]

Strictly return ONLY a valid JSON object matching this schema, without any markdown formatting, backticks, or explanation.
Format:
{
  "type": "teacher_unavailable" | "subject_limit" | "subject_weekly_limit" | "fixed_slot" | "subject_range" | "class_teacher_last_periods" | "continuous_double_periods" | "daily_same_period_subject" | "custom_text",
  "teacherId": "id string",
  "subjectId": "id string",
  "batchId": "id string",
  "day": "weekday string",
  "slotLabel": "slot label string",
  "limitValue": number,
  "timeRange": "morning" | "afternoon",
  "text": "short summary of the custom rule"
}`;

      const promptText = `Parse the following manual rule: "\${manualRulePrompt}"`;
      const responseText = await generateAIContent(promptText, systemInstruction);

      if (!responseText) {
        throw new Error("Could not parse rule details.");
      }

      // Clean JSON wrappers if present
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('\`\`\`json')) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.endsWith('\`\`\`')) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }
      jsonStr = jsonStr.trim();

      const parsedRule = JSON.parse(jsonStr);

      if (!parsedRule.type) {
        throw new Error("No rule type parsed.");
      }

      const newRule: any = {
        id: 'rule_manual_' + Date.now(),
        type: parsedRule.type,
        isActive: true,
      };

      if (parsedRule.type === 'teacher_unavailable') {
        newRule.teacherId = parsedRule.teacherId;
        newRule.day = parsedRule.day || 'Monday';
        newRule.slotLabel = parsedRule.slotLabel || 'All Periods';
        if (parsedRule.batchId && parsedRule.batchId !== 'all') {
          newRule.batchId = parsedRule.batchId;
        }
      } else if (parsedRule.type === 'subject_limit') {
        newRule.subjectId = parsedRule.subjectId;
        newRule.limitValue = parsedRule.limitValue || 1;
        if (parsedRule.batchId && parsedRule.batchId !== 'all') {
          newRule.batchId = parsedRule.batchId;
        }
      } else if (parsedRule.type === 'subject_weekly_limit') {
        newRule.subjectId = parsedRule.subjectId;
        newRule.limitValue = parsedRule.limitValue || 2;
        if (parsedRule.batchId && parsedRule.batchId !== 'all') {
          newRule.batchId = parsedRule.batchId;
        }
      } else if (parsedRule.type === 'fixed_slot') {
        newRule.batchId = parsedRule.batchId;
        newRule.subjectId = parsedRule.subjectId;
        newRule.day = parsedRule.day || 'Monday';
        newRule.slotLabel = parsedRule.slotLabel || 'P1';
      } else if (parsedRule.type === 'subject_range') {
        newRule.subjectId = parsedRule.subjectId;
        newRule.timeRange = parsedRule.timeRange || 'morning';
        if (parsedRule.batchId && parsedRule.batchId !== 'all') {
          newRule.batchId = parsedRule.batchId;
        }
      } else if (parsedRule.type === 'class_teacher_last_periods') {
        newRule.limitValue = parsedRule.limitValue || 1;
        if (parsedRule.batchId && parsedRule.batchId !== 'all') {
          newRule.batchId = parsedRule.batchId;
        }
      } else if (parsedRule.type === 'continuous_double_periods') {
        newRule.subjectId = parsedRule.subjectId;
        if (parsedRule.batchId && parsedRule.batchId !== 'all') {
          newRule.batchId = parsedRule.batchId;
        }
      } else if (parsedRule.type === 'daily_same_period_subject') {
        newRule.subjectId = parsedRule.subjectId;
        newRule.slotLabel = parsedRule.slotLabel || 'P1';
        if (parsedRule.batchId && parsedRule.batchId !== 'all') {
          newRule.batchId = parsedRule.batchId;
        }
      } else if (parsedRule.type === 'custom_text') {
        newRule.text = parsedRule.text || manualRulePrompt;
      }

      const updated = [...customRules, newRule];
      saveCustomRules(updated);
      toast.success('Successfully added manual rule to the rulebook!');
      setManualRulePrompt('');
    } catch (err: any) {
      console.error(err);
      // Fallback to custom text rule directly on parsing failure
      const fallbackRule = {
        id: 'rule_manual_fallback_' + Date.now(),
        type: 'custom_text',
        text: manualRulePrompt,
        isActive: true,
      };
      const updated = [...customRules, fallbackRule];
      saveCustomRules(updated);
      toast.success('Added as a descriptive custom rule!');
      setManualRulePrompt('');
    } finally {
      setIsParsingRule(false);
    }
  };

  // Export States
  const [showExportModal, setShowExportModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [clearBatchId, setClearBatchId] = useState<string | undefined>(undefined);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exportType, setExportType] = useState<'class-wise' | 'master-matrix' | 'teacher-wise' | 'flat-csv'>('class-wise');
  const [exportPaperSize, setExportPaperSize] = useState<'a4' | 'letter' | 'legal' | 'a3'>('a4');
  const [exportOrientation, setExportOrientation] = useState<'portrait' | 'landscape'>('landscape');

  const downloadBlob = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType + ';charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportTimetable = () => {
    const toastId = toast.loading(`Preparing bulk ${exportFormat.toUpperCase()} export...`);
    try {
      if (exportFormat === 'pdf') {
        const doc = new jsPDF({
          orientation: exportOrientation,
          format: exportPaperSize,
          unit: 'mm'
        }) as any;

        if (exportType === 'class-wise') {
          if (batches.length === 0) {
            toast.error("No class batches available to export.", { id: toastId });
            return;
          }

          const twoPerPage = exportOrientation === 'portrait' && exportPaperSize === 'a4';
          const fourPerPage = exportPaperSize === 'a3';

          batches.forEach((batch, idx) => {
            let isSecondOnPage = false;
            let gridCol = 0; // 0 or 1
            let gridRow = 0; // 0 or 1

            if (twoPerPage) {
              isSecondOnPage = (idx % 2 === 1);
              gridRow = isSecondOnPage ? 1 : 0;
            } else if (fourPerPage) {
              gridCol = idx % 2;
              gridRow = Math.floor((idx % 4) / 2);
            }

            const isNewPageTrigger = fourPerPage ? (idx % 4 === 0) : (twoPerPage ? (idx % 2 === 0) : true);

            if (idx > 0 && isNewPageTrigger) {
              doc.addPage();
            }

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            let startYHeader = 15;
            let startYTable = 23;

            if (twoPerPage) {
              startYHeader = isSecondOnPage ? 150 : 15;
              startYTable = isSecondOnPage ? 158 : 23;
            } else if (fourPerPage) {
              const rowOffsetY = pageHeight / 2 - 5;
              startYHeader = gridRow === 1 ? (rowOffsetY + 10) : 15;
              startYTable = gridRow === 1 ? (rowOffsetY + 18) : 23;
            }

            let textCenterX = pageWidth / 2;
            let leftMargin = 14;
            let rightMargin = 14;

            if (fourPerPage) {
              const colWidth = pageWidth / 2 - 18;
              const colLeft = gridCol === 0 ? 12 : (pageWidth / 2 + 6);
              textCenterX = colLeft + colWidth / 2;
              leftMargin = gridCol === 0 ? 12 : (pageWidth / 2 + 6);
              rightMargin = gridCol === 0 ? (pageWidth / 2 + 6) : 12;
            }

            const cls = classes.find(c => c.id === batch.classId);
            const classAndBatchName = cls ? `${cls.name} - ${batch.name}` : batch.name;

            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text(`St.Antony' School`, textCenterX, startYHeader, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Weekly Class Timetable - Class/Batch: ${classAndBatchName}`, textCenterX, startYHeader + 6, { align: 'center' });
            
            const tableData = periodSlots.map(slot => {
              const row: any = [slot.label + ` (${slot.start || slot.startTime}-${slot.end || slot.endTime})`];
              DAYS.forEach(day => {
                const p = timetables.find(t => t.day === day && t.batchId === batch.id)?.periods.find(per => per.label === slot.label);
                if (slot.isBreak) {
                  row.push('BREAK');
                } else if (p) {
                  if (p.isBreak) {
                    row.push('BREAK');
                  } else {
                    const subjectName = subjects.find(s => s.id === p.subjectId)?.name || '-';
                    const teacherName = teachers.find(t => t.uid === p.teacherId)?.name || '';
                    row.push(teacherName ? `${subjectName}\n(${teacherName})` : subjectName);
                  }
                } else {
                  row.push('-');
                }
              });
              return row;
            });

            autoTable(doc, {
              startY: startYTable,
              head: [['Slot / Period', ...DAYS]],
              body: tableData,
              theme: 'grid',
              headStyles: { fillColor: [43, 54, 116], textColor: [255, 255, 255], fontStyle: 'bold' },
              styles: { 
                fontSize: fourPerPage ? 7 : (twoPerPage ? 6.5 : 8), 
                cellPadding: fourPerPage ? 1.5 : (twoPerPage ? 1.2 : 3), 
                valign: 'middle', 
                halign: 'center' 
              },
              margin: fourPerPage ? { left: leftMargin, right: rightMargin } : { top: 10, bottom: 12, left: 14, right: 14 },
              pageBreak: 'avoid',
              columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
              didParseCell: function (data: any) {
                if (data.row.section === 'body' && data.column.index > 0) {
                  const text = data.cell.text.join('\n');
                  if (text === 'BREAK') {
                    data.cell.styles.fillColor = hexToRgb(BREAK_COLOR.hexBg);
                    data.cell.styles.textColor = hexToRgb(BREAK_COLOR.hexText);
                  } else if (text && text !== '-' && text !== 'Free') {
                    const firstLine = data.cell.text[0];
                    const color = getSubjectColor(firstLine);
                    data.cell.styles.fillColor = hexToRgb(color.hexBg);
                    data.cell.styles.textColor = hexToRgb(color.hexText);
                  }
                }
              }
            });
          });
          doc.save(`All_Classes_Timetables_${exportPaperSize}_${exportOrientation}.pdf`);

        } else if (exportType === 'master-matrix') {
          const isA3 = exportPaperSize === 'a3';
          DAYS.forEach((day, idx) => {
            if (idx > 0) doc.addPage();
            
            const pageWidth = doc.internal.pageSize.getWidth();
            doc.setFontSize(isA3 ? 20 : 14);
            doc.setTextColor(30, 41, 59);
            doc.text(`St.Antony' School`, pageWidth / 2, 15, { align: 'center' });
            doc.setFontSize(isA3 ? 14 : 10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Master Class Matrix - Day: ${day}`, pageWidth / 2, isA3 ? 23 : 21, { align: 'center' });

            const tableData = batches.map(batch => {
              const cls = classes.find(c => c.id === batch.classId);
              const classAndBatchName = cls ? `${cls.name} - ${batch.name}` : batch.name;
              const row: any = [classAndBatchName];
              periodSlots.forEach(slot => {
                const p = timetables.find(t => t.day === day && t.batchId === batch.id)?.periods.find(per => per.label === slot.label);
                if (slot.isBreak) {
                  row.push('BREAK');
                } else if (p) {
                  if (p.isBreak) {
                    row.push('BREAK');
                  } else {
                    const subjectName = subjects.find(s => s.id === p.subjectId)?.name || '-';
                    const teacherName = teachers.find(t => t.uid === p.teacherId)?.name || '';
                    row.push(teacherName ? `${subjectName}\n(${teacherName})` : subjectName);
                  }
                } else {
                  row.push('-');
                }
              });
              return row;
            });

            autoTable(doc, {
              startY: isA3 ? 28 : 25,
              head: [['Class / Batch', ...periodSlots.map(s => `${s.label}\n(${s.start || s.startTime}-${s.end || s.endTime})`)]],
              body: tableData,
              theme: 'grid',
              headStyles: { fillColor: [43, 54, 116], textColor: [255, 255, 255], fontStyle: 'bold' },
              styles: { 
                fontSize: isA3 ? 11 : 8, 
                cellPadding: isA3 ? 5 : 3, 
                valign: 'middle', 
                halign: 'center' 
              },
              margin: { top: 10, bottom: 12, left: 14, right: 14 },
              pageBreak: 'avoid',
              columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
              didParseCell: function (data: any) {
                if (data.row.section === 'body' && data.column.index > 0) {
                  const text = data.cell.text.join('\n');
                  if (text === 'BREAK') {
                    data.cell.styles.fillColor = hexToRgb(BREAK_COLOR.hexBg);
                    data.cell.styles.textColor = hexToRgb(BREAK_COLOR.hexText);
                  } else if (text && text !== '-' && text !== 'Free') {
                    const firstLine = data.cell.text[0];
                    const color = getSubjectColor(firstLine);
                    data.cell.styles.fillColor = hexToRgb(color.hexBg);
                    data.cell.styles.textColor = hexToRgb(color.hexText);
                  }
                }
              }
            });
          });
          doc.save(`Master_Class_Matrix_${exportPaperSize}_${exportOrientation}.pdf`);

        } else if (exportType === 'teacher-wise') {
          if (teachers.length === 0) {
            toast.error("No teachers found to export schedules.", { id: toastId });
            return;
          }

          const twoPerPage = exportOrientation === 'portrait' && exportPaperSize === 'a4';
          const fourPerPage = exportPaperSize === 'a3';

          teachers.forEach((teacher, idx) => {
            let isSecondOnPage = false;
            let gridCol = 0; // 0 or 1
            let gridRow = 0; // 0 or 1

            if (twoPerPage) {
              isSecondOnPage = (idx % 2 === 1);
              gridRow = isSecondOnPage ? 1 : 0;
            } else if (fourPerPage) {
              gridCol = idx % 2;
              gridRow = Math.floor((idx % 4) / 2);
            }

            const isNewPageTrigger = fourPerPage ? (idx % 4 === 0) : (twoPerPage ? (idx % 2 === 0) : true);

            if (idx > 0 && isNewPageTrigger) {
              doc.addPage();
            }

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            let startYHeader = 15;
            let startYTable = 23;

            if (twoPerPage) {
              startYHeader = isSecondOnPage ? 150 : 15;
              startYTable = isSecondOnPage ? 158 : 23;
            } else if (fourPerPage) {
              const rowOffsetY = pageHeight / 2 - 5;
              startYHeader = gridRow === 1 ? (rowOffsetY + 10) : 15;
              startYTable = gridRow === 1 ? (rowOffsetY + 18) : 23;
            }

            let textCenterX = pageWidth / 2;
            let leftMargin = 14;
            let rightMargin = 14;

            if (fourPerPage) {
              const colWidth = pageWidth / 2 - 18;
              const colLeft = gridCol === 0 ? 12 : (pageWidth / 2 + 6);
              textCenterX = colLeft + colWidth / 2;
              leftMargin = gridCol === 0 ? 12 : (pageWidth / 2 + 6);
              rightMargin = gridCol === 0 ? (pageWidth / 2 + 6) : 12;
            }

            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text(`St.Antony' School`, textCenterX, startYHeader, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Teacher Duty Roster - Teacher Name: ${teacher.name}`, textCenterX, startYHeader + 6, { align: 'center' });

            const tableData = periodSlots.filter(s => !s.isBreak).map(slot => {
              const row: any = [slot.label + ` (${slot.start || slot.startTime}-${slot.end || slot.endTime})`];
              DAYS.forEach(day => {
                const assigned = timetables.filter(tt => tt.day === day).flatMap(tt => {
                  const b = batches.find(batch => batch.id === tt.batchId);
                  return tt.periods.filter(p => p.teacherId === teacher.uid && p.label === slot.label).map(p => ({ ...p, b }));
                })[0];
                if (assigned && assigned.b) {
                  const cls = classes.find(c => c.id === assigned.b.classId);
                  const bName = cls ? `${cls.name} - ${assigned.b.name}` : assigned.b.name;
                  const subjectName = subjects.find(s => s.id === assigned.subjectId)?.name || '';
                  row.push(`${subjectName}\n(${bName})`);
                } else {
                  row.push('Free');
                }
              });
              return row;
            });

            autoTable(doc, {
              startY: startYTable,
              head: [['Period / Slot', ...DAYS]],
              body: tableData,
              theme: 'grid',
              headStyles: { fillColor: [43, 54, 116], textColor: [255, 255, 255], fontStyle: 'bold' },
              styles: { 
                fontSize: fourPerPage ? 7 : (twoPerPage ? 6.5 : 8), 
                cellPadding: fourPerPage ? 1.5 : (twoPerPage ? 1.2 : 3), 
                valign: 'middle', 
                halign: 'center' 
              },
              margin: fourPerPage ? { left: leftMargin, right: rightMargin } : { top: 10, bottom: 12, left: 14, right: 14 },
              pageBreak: 'avoid',
              columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
              didParseCell: function (data: any) {
                if (data.row.section === 'body' && data.column.index > 0) {
                  const text = data.cell.text.join('\n');
                  if (text && text !== '-' && text !== 'Free') {
                    const firstLine = data.cell.text[0];
                    const color = getSubjectColor(firstLine);
                    data.cell.styles.fillColor = hexToRgb(color.hexBg);
                    data.cell.styles.textColor = hexToRgb(color.hexText);
                  }
                }
              }
            });
          });
          doc.save(`All_Teachers_Schedules_${exportPaperSize}_${exportOrientation}.pdf`);
        }

      } else {
        // CSV Format
        let csvContent = '';
        if (exportType === 'flat-csv') {
          const csvRows = [['Class/Batch', 'Day', 'Period Slot', 'Timing', 'Subject', 'Teacher']];
          batches.forEach(batch => {
            const cls = classes.find(c => c.id === batch.classId);
            const classAndBatchName = cls ? `${cls.name} - ${batch.name}` : batch.name;

            DAYS.forEach(day => {
              const tt = timetables.find(t => t.day === day && t.batchId === batch.id);
              periodSlots.forEach(slot => {
                const p = tt?.periods?.find(per => per.label === slot.label);
                const timing = `${slot.start || slot.startTime} - ${slot.end || slot.endTime}`;
                if (slot.isBreak) {
                  csvRows.push([classAndBatchName, day, slot.label, timing, 'BREAK', '']);
                } else if (p) {
                  if (p.isBreak) {
                    csvRows.push([classAndBatchName, day, slot.label, timing, 'BREAK', '']);
                  } else {
                    const subjectName = subjects.find(s => s.id === p.subjectId)?.name || '-';
                    const teacherName = teachers.find(t => t.uid === p.teacherId)?.name || '';
                    csvRows.push([classAndBatchName, day, slot.label, timing, subjectName, teacherName]);
                  }
                } else {
                  csvRows.push([classAndBatchName, day, slot.label, timing, '-', '']);
                }
              });
            });
          });
          csvContent = Papa.unparse(csvRows);
          downloadBlob(csvContent, 'Master_Timetable_Flat_List.csv', 'text/csv');

        } else if (exportType === 'class-wise') {
          const csvRows: any[] = [];
          batches.forEach(batch => {
            const cls = classes.find(c => c.id === batch.classId);
            const classAndBatchName = cls ? `${cls.name} - ${batch.name}` : batch.name;

            csvRows.push([`St.Antony' School`]);
            csvRows.push([`Class Weekly Timetable: ${classAndBatchName}`]);
            csvRows.push(['Slot', ...DAYS]);
            
            periodSlots.forEach(slot => {
              const row = [slot.label + ` (${slot.start || slot.startTime}-${slot.end || slot.endTime})`];
              DAYS.forEach(day => {
                const p = timetables.find(t => t.day === day && t.batchId === batch.id)?.periods.find(per => per.label === slot.label);
                if (slot.isBreak) {
                  row.push('BREAK');
                } else if (p) {
                  if (p.isBreak) {
                    row.push('BREAK');
                  } else {
                    const subjectName = subjects.find(s => s.id === p.subjectId)?.name || '-';
                    const teacherName = teachers.find(t => t.uid === p.teacherId)?.name || '';
                    row.push(teacherName ? `${subjectName} (${teacherName})` : subjectName);
                  }
                } else {
                  row.push('-');
                }
              });
              csvRows.push(row);
            });
            csvRows.push([]);
            csvRows.push([]);
          });
          csvContent = Papa.unparse(csvRows);
          downloadBlob(csvContent, 'All_Classes_Timetables.csv', 'text/csv');

        } else if (exportType === 'master-matrix') {
          const csvRows: any[] = [];
          DAYS.forEach(day => {
            csvRows.push([`St.Antony' School`]);
            csvRows.push([`Master Class Matrix - Day: ${day}`]);
            csvRows.push(['Class / Batch', ...periodSlots.map(s => `${s.label} (${s.start || s.startTime}-${s.end || s.endTime})`)]);

            batches.forEach(batch => {
              const cls = classes.find(c => c.id === batch.classId);
              const classAndBatchName = cls ? `${cls.name} - ${batch.name}` : batch.name;
              const row = [classAndBatchName];
              periodSlots.forEach(slot => {
                const p = timetables.find(t => t.day === day && t.batchId === batch.id)?.periods.find(per => per.label === slot.label);
                if (slot.isBreak) {
                  row.push('BREAK');
                } else if (p) {
                  if (p.isBreak) {
                    row.push('BREAK');
                  } else {
                    const subjectName = subjects.find(s => s.id === p.subjectId)?.name || '-';
                    const teacherName = teachers.find(t => t.uid === p.teacherId)?.name || '';
                    row.push(teacherName ? `${subjectName} (${teacherName})` : subjectName);
                  }
                } else {
                  row.push('-');
                }
              });
              csvRows.push(row);
            });
            csvRows.push([]);
            csvRows.push([]);
          });
          csvContent = Papa.unparse(csvRows);
          downloadBlob(csvContent, 'Master_Class_Matrix.csv', 'text/csv');

        } else if (exportType === 'teacher-wise') {
          const csvRows: any[] = [];
          teachers.forEach(teacher => {
            csvRows.push([`St.Antony' School`]);
            csvRows.push([`Teacher Weekly Schedule: ${teacher.name}`]);
            csvRows.push(['Slot', ...DAYS]);

            periodSlots.filter(s => !s.isBreak).forEach(slot => {
              const row = [slot.label + ` (${slot.start || slot.startTime}-${slot.end || slot.endTime})`];
              DAYS.forEach(day => {
                const assigned = timetables.filter(tt => tt.day === day).flatMap(tt => {
                  const b = batches.find(batch => batch.id === tt.batchId);
                  return tt.periods.filter(p => p.teacherId === teacher.uid && p.label === slot.label).map(p => ({ ...p, b }));
                })[0];
                if (assigned && assigned.b) {
                  const cls = classes.find(c => c.id === assigned.b.classId);
                  const bName = cls ? `${cls.name} - ${assigned.b.name}` : assigned.b.name;
                  const subjectName = subjects.find(s => s.id === assigned.subjectId)?.name || '';
                  row.push(`${subjectName} (${bName})`);
                } else {
                  row.push('Free');
                }
              });
              csvRows.push(row);
            });
            csvRows.push([]);
            csvRows.push([]);
          });
          csvContent = Papa.unparse(csvRows);
          downloadBlob(csvContent, 'All_Teachers_Schedules.csv', 'text/csv');
        }
      }

      toast.success(`${exportFormat.toUpperCase()} generated successfully!`, { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error(`Export failed: ${(error as any).message}`, { id: toastId });
    }
  };

  const renderClearConfirmModal = () => {
    return (
      <AnimatePresence>
        {showClearConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl p-8 w-full max-w-md space-y-6"
            >
              <div className="flex justify-between items-start pb-4 border-b border-neutral-100">
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full border border-rose-100">
                    Danger Zone
                  </span>
                  <h3 className="text-xl font-black text-sidebar tracking-tight mt-2">Clear Timetable</h3>
                </div>
                <button
                  onClick={() => setShowClearConfirmModal(false)}
                  className="p-1.5 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-sm font-medium text-neutral-600 space-y-3">
                <p>
                  {clearBatchId 
                    ? `Are you sure you want to clear the weekly timetable for ${batches.find(b => b.id === clearBatchId)?.name || 'this class'}?` 
                    : "Are you sure you want to clear the ENTIRE school's master timetable?"}
                </p>
                <p className="text-xs text-rose-500 font-bold bg-rose-50 p-3 rounded-2xl border border-rose-100/50">
                  ⚠️ This action cannot be undone. All loaded periods and schedules will be permanently removed.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirmModal(false)}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-2xl transition-colors text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeClearTimetable}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl transition-colors text-xs cursor-pointer"
                >
                  Yes, Clear Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const renderExportModal = () => {
    return (
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl p-8 w-full max-w-xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start pb-4 border-b border-neutral-100">
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                    Bulk Export Utility
                  </span>
                  <h3 className="text-xl font-black text-sidebar tracking-tight mt-2">Export Master Timetable</h3>
                  <p className="text-xs font-bold text-neutral-400 mt-1">
                    Download schedules for all classes or teachers in PDF/CSV format.
                  </p>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-1.5 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5">
                {/* Export Format Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Export Format</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => { setExportFormat('pdf'); setExportType('class-wise'); }}
                      className={`p-4 rounded-2xl border text-center font-black transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                        exportFormat === 'pdf'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-xs'
                          : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-500'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                      <span className="text-xs">PDF Document</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setExportFormat('csv'); setExportType('flat-csv'); }}
                      className={`p-4 rounded-2xl border text-center font-black transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                        exportFormat === 'csv'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-xs'
                          : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-500'
                      }`}
                    >
                      <TableIcon className="w-5 h-5" />
                      <span className="text-xs">CSV Spreadsheet</span>
                    </button>
                  </div>
                </div>

                {/* Export Content Layout Type */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Export Layout Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {exportFormat === 'pdf' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setExportType('class-wise')}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer ${
                            exportType === 'class-wise'
                              ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-black'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>Class-wise Schedules</span>
                          <span className="text-[10px] text-neutral-400 font-semibold">One page per class timetable</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportType('master-matrix')}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer ${
                            exportType === 'master-matrix'
                              ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-black'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>Master Class Matrix</span>
                          <span className="text-[10px] text-neutral-400 font-semibold">One page per day (all classes grid)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportType('teacher-wise')}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer ${
                            exportType === 'teacher-wise'
                              ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-black'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>Teacher-wise Schedules</span>
                          <span className="text-[10px] text-neutral-400 font-semibold">One page per teacher duty roster</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setExportType('flat-csv')}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer ${
                            exportType === 'flat-csv'
                              ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-black'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>Database Flat List</span>
                          <span className="text-[10px] text-neutral-400 font-semibold">Class, Day, Period columns (ideal for databases)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportType('class-wise')}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer ${
                            exportType === 'class-wise'
                              ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-black'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>Class-wise grids</span>
                          <span className="text-[10px] text-neutral-400 font-semibold">Separate grids for each class/batch</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportType('master-matrix')}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer ${
                            exportType === 'master-matrix'
                              ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-black'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>Master matrix tables</span>
                          <span className="text-[10px] text-neutral-400 font-semibold">Schedules day by day grouped</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportType('teacher-wise')}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer ${
                            exportType === 'teacher-wise'
                              ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-black'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>Teacher-wise grids</span>
                          <span className="text-[10px] text-neutral-400 font-semibold">Weekly schedule for each teacher</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* PDF Configuration Options (Only if PDF selected) */}
                {exportFormat === 'pdf' && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 rounded-2xl border border-neutral-200/50">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Paper Size</label>
                      <select
                        value={exportPaperSize}
                        onChange={(e) => setExportPaperSize(e.target.value as any)}
                        className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="a4">A4 (Standard)</option>
                        <option value="letter">Letter</option>
                        <option value="legal">Legal (Long Paper)</option>
                        <option value="a3">A3 (Large Poster)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Orientation</label>
                      <select
                        value={exportOrientation}
                        onChange={(e) => setExportOrientation(e.target.value as any)}
                        className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="landscape">Landscape (Horizontal)</option>
                        <option value="portrait">Portrait (Vertical)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 active:scale-[0.98] text-neutral-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExportTimetable();
                    setShowExportModal(false);
                  }}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Generate Export
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const [selectedEditDay, setSelectedEditDay] = useState('');
  const [selectedEditBatchId, setSelectedEditBatchId] = useState('');
  const [selectedEditSlotLabel, setSelectedEditSlotLabel] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editTeacherId, setEditTeacherId] = useState('');
  const [editIsBreak, setEditIsBreak] = useState(false);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Automatically select the best assigned faculty teacher when modal opens or subject/batch changes
  useEffect(() => {
    if (!showManualEditModal) return;

    const currentTeacherObj = teachers.find(t => t.uid === editTeacherId || t.id === editTeacherId || t.docId === editTeacherId);

    if (currentTeacherObj) {
      // Sync batch if current batch is not handled by teacher
      const teacherBatches = batches.filter(b => teacherHandlesBatch(currentTeacherObj, b));
      let activeBatchId = selectedEditBatchId;
      if (teacherBatches.length > 0 && (!selectedEditBatchId || !teacherBatches.some(b => b.id === selectedEditBatchId))) {
        activeBatchId = teacherBatches[0].id;
        setSelectedEditBatchId(activeBatchId);
      }

      // Sync subject if current subject is not handled by teacher
      const selBatch = batches.find(b => b.id === activeBatchId);
      let candidateSubs = subjects;
      if (selBatch && selBatch.subjectIds && selBatch.subjectIds.length > 0) {
        const m = subjects.filter(s => selBatch.subjectIds.some((idOrName: string) => idOrName === s.id || idOrName === s.name || idOrName === s.code));
        if (m.length > 0) candidateSubs = m;
      }

      const teacherSubs = candidateSubs.filter(s => teacherHandlesSubject(currentTeacherObj, s, activeBatchId));
      if (teacherSubs.length > 0 && (!editSubjectId || !teacherSubs.some(s => s.id === editSubjectId))) {
        setEditSubjectId(teacherSubs[0].id);
      }
    } else if (editSubjectId) {
      const selBatch = batches.find(b => b.id === selectedEditBatchId);

      const currentTeacherIsBusy = editTeacherId ? timetables
        .filter(tt => tt.day === selectedEditDay && tt.batchId !== selectedEditBatchId)
        .some(tt => tt.periods.some(p => p.label === selectedEditSlotLabel && (p.teacherId === editTeacherId))) : false;

      if (!editTeacherId || currentTeacherIsBusy) {
        const candidates = teachers.map(teacher => {
          const teacherUid = teacher.uid || teacher.id;
          const otherBusy = timetables
            .filter(tt => tt.day === selectedEditDay && tt.batchId !== selectedEditBatchId)
            .some(tt => tt.periods.some(p => p.label === selectedEditSlotLabel && (p.teacherId === teacherUid || p.teacherId === teacher.id)));

          const matchesClassAndBatch = selBatch ? isTeacherHandling(teacher, selBatch.classId || '', selectedEditBatchId) : false;
          const matchesSubject = selBatch ? isTeacherHandling(teacher, selBatch.classId || '', selectedEditBatchId, editSubjectId) : false;

          const selectedSub = subjects.find(s => s.id === editSubjectId || s.name === editSubjectId || s.code === editSubjectId);
          const teacherSubs = teacher.subjects || [];
          const teachesSubjectInGeneral = selectedSub ? teacherSubs.some((ts: string) => {
            if (ts === editSubjectId || ts === selectedSub.id || ts === selectedSub.name || ts === selectedSub.code) return true;
            const subNameLower = selectedSub.name.toLowerCase();
            const tsLower = ts.toLowerCase();
            return tsLower.includes(subNameLower) || subNameLower.includes(tsLower);
          }) : false;

          let score = 0;
          if (matchesSubject) {
            score = 3;
          } else if (teachesSubjectInGeneral && matchesClassAndBatch) {
            score = 2;
          } else if (teachesSubjectInGeneral) {
            score = 1;
          } else if (matchesClassAndBatch) {
            score = 0.5;
          }

          return { uid: teacherUid, busy: otherBusy, score };
        })
        .filter(t => !t.busy && t.score > 0)
        .sort((a, b) => b.score - a.score);

        if (candidates.length > 0) {
          setEditTeacherId(candidates[0].uid);
        }
      }
    }
  }, [showManualEditModal, editTeacherId, editSubjectId, selectedEditBatchId, selectedEditDay, selectedEditSlotLabel, teachers, timetables, batches, subjects]);

  // Compute total list of teachers who are on approved leaves or marked absent today in staff attendance
  const approvedLeaveTeachers = leaves
    .filter(l => l.startDate <= todayStr && l.endDate >= todayStr && (l.applicantRole === 'teacher' || l.applicantRole === 'staff') && l.status === 'approved')
    .map(l => ({ uid: l.applicantId, name: l.applicantName, reason: `Approved Leave (${l.reason || 'No details'})` }));

  const absentStaffRecords = staffAttendance.filter(sa => sa.status === 'absent');
  const absentStaffTeachers = absentStaffRecords.map(sa => {
    const teach = teachers.find(t => t.uid === sa.userId);
    return {
      uid: sa.userId,
      name: teach?.name || 'Unknown Staff',
      reason: 'Marked Absent in Attendance'
    };
  }).filter(t => teachers.some(teacher => teacher.uid === t.uid));

  // Merge unique by teacher uid
  const absentTeachersToday = React.useMemo(() => {
    const map = new Map();
    approvedLeaveTeachers.forEach(t => map.set(t.uid, t));
    absentStaffTeachers.forEach(t => map.set(t.uid, t));
    return Array.from(map.values());
  }, [leaves, staffAttendance, teachers, todayStr]);
  const [showSlotEditor, setShowSlotEditor] = useState(false);
  const [periodSlots, setPeriodSlots] = useState<any[]>([]);
  const [editingMaxPeriods, setEditingMaxPeriods] = useState<string | null>(null);
  const [newMaxPeriods, setNewMaxPeriods] = useState('');

  const sanitizePeriods = (pds: any[]): Period[] => {
    return pds.map(p => ({
      startTime: p.startTime || '00:00',
      endTime: p.endTime || '00:00',
      label: p.label || 'P',
      subjectId: p.subjectId || '',
      teacherId: p.teacherId || '',
      isBreak: !!p.isBreak
    }));
  };

  useEffect(() => {
    fetchInitialData();
  }, [hasPermission, profile?.uid]);

  const isVicePrincipalRole = profile?.role === 'vice_principal';
  const looseAccess = isAdmin || profile?.role === 'admin' || profile?.role === 'principal' || hasPermission('timetable_manage') || hasPermission('timetable_view_all') || hasPermission('classes_view_all') || isVicePrincipalRole;

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [clsData, batchData, subData, teacherData, ttData, leaveData, subRecordData, settingsData, attendanceTodayData] = await Promise.all([
        dbService.list('classes'),
        dbService.list('batches'),
        dbService.list('subjects'),
        dbService.list('staff', []),
        dbService.list('timetableSlots'),
        dbService.list('leaves', [where('status', '==', 'approved')]),
        dbService.list('substitutions', [where('date', '==', format(new Date(), 'yyyy-MM-dd'))]),
        dbService.get('settings', 'timetable'),
        dbService.list('staff_attendance', [where('date', '==', format(new Date(), 'yyyy-MM-dd'))]).catch(() => [])
      ]);

      let filteredClasses = clsData as any[];
      let filteredBatches = batchData as any[];

      const isPlaySchoolIncharge = profile?.role === 'play_school_incharge';
      const isStrictFilter = !isVicePrincipalRole && (isTeacherRole || isPlaySchoolIncharge || hasPermission('timetable_view_my') || profile?.role === 'staff');

      if (isPlaySchoolIncharge) {
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

        batchData.forEach((b: any) => {
          if (b.classTeacherId === profile?.uid) {
            if (b.id) assignedBatchIds.add(b.id);
            if (b.classId) assignedClassIds.add(b.classId);
          }
        });

        // Fallback to nursery/lkg/ukg check if no classes or batches are explicitly assigned
        if (assignedClassIds.size === 0 && assignedBatchIds.size === 0) {
          clsData
            .filter((c: any) => c.name && (
              c.name.toLowerCase().includes('nursery') ||
              c.name.toLowerCase().includes('lkg') ||
              c.name.toLowerCase().includes('ukg')
            ))
            .forEach((c: any) => assignedClassIds.add(c.id));

          batchData
            .filter((b: any) => b.classId && assignedClassIds.has(b.classId))
            .forEach((b: any) => assignedBatchIds.add(b.id));
        } else {
          // Ensure any batch's classId is also in assignedClassIds
          batchData.forEach((b: any) => {
            if (b.id && assignedBatchIds.has(b.id) && b.classId) {
              assignedClassIds.add(b.classId);
            }
          });
        }

        filteredClasses = (clsData as any[]).filter((c: any) => assignedClassIds.has(c.id));
        filteredBatches = (batchData as any[]).filter((b: any) => assignedBatchIds.has(b.id));
      } else if (isStrictFilter && !looseAccess) {
        const assignedClassIds = new Set([profile?.classId, ...(profile as any)?.classIds || []].filter(Boolean));
        const assignedBatchIds = new Set([profile?.batchId, ...(profile as any)?.batchIds || []].filter(Boolean));
        
        batchData.filter((b: any) => b.classTeacherId === profile?.uid).forEach((b: any) => {
          assignedBatchIds.add(b.id);
          assignedClassIds.add(b.classId);
        });

        batchData.filter((b: any) => assignedBatchIds.has(b.id)).forEach((b: any) => {
          assignedClassIds.add(b.classId);
        });

        filteredBatches = (batchData as any[]).filter((b: any) => 
          assignedBatchIds.has(b.id) || assignedClassIds.has(b.classId) || b.classTeacherId === profile?.uid
        );
        filteredClasses = (clsData as any[]).filter((c: any) => 
          assignedClassIds.has(c.id) || filteredBatches.some((b: any) => b.classId === c.id)
        );
      }

      // Filter out non-teaching staff & non-teaching departments
      const filteredTeachers = (teacherData as any[])
        .map((t: any) => ({
          ...t,
          uid: t.uid || t.id || t.docId,
          id: t.id || t.uid || t.docId,
        }))
        .filter((t: any) => {
        // Exclude those explicitly marked as non-teaching staff
        if (t.staffType === 'non-teaching') return false;

        const role = (t.role || '').toLowerCase();
        const designation = (t.designation || '').toLowerCase();
        
        const nonTeachingRoles = [
          'accountant', 'clerk', 'staff', 'driver', 'attendant', 'helper', 'aya', 
          'front_office', 'receptionist', 'admin', 'hostel_warden', 'librarian',
          'security', 'peon', 'gardener', 'sweeper', 'watchman', 'cleaner',
          'bus staff', 'warden', 'cashier', 'system admin', 'data entry'
        ];

        // If explicitly designated/assigned to teaching, keep them
        if (t.staffType === 'teaching') {
          return true;
        }

        // If role matches any of the non-teaching roles, filter out
        if (nonTeachingRoles.some(r => role === r || role.includes(r) || designation.includes(r))) {
          return false;
        }

        const department = (t.department || '').toLowerCase();
        const nonTeachingDepts = [
          'admin', 'administration', 'office', 'front office', 'finance', 'accounts',
          'account', 'hr', 'human resources', 'payroll', 'operation', 'operations',
          'transport', 'security', 'library', 'hostel', 'maintenance', 'canteen', 'mess',
          'housekeeping', 'peon', 'gardener', 'non-teaching', 'non teaching'
        ];

        // If department matches non-teaching departments, filter out
        if (nonTeachingDepts.some(dept => department.includes(dept))) {
          return false;
        }

        return true;
      });

      setClasses(filteredClasses);
      setBatches(filteredBatches);
      setSubjects(subData);
      setTeachers(filteredTeachers);
      setTimetables(ttData as TimetableDoc[]);
      setLeaves(leaveData);
      setSubstitutions(subRecordData);
      setStaffAttendance(attendanceTodayData || []);

      const slots = (settingsData as any)?.slots || [
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
      slots.forEach((s: any) => {
        if (s && s.label) {
          const trimmedLabel = s.label.trim();
          if (!seenLabels.has(trimmedLabel)) {
            seenLabels.add(trimmedLabel);
            uniqueSlots.push({ ...s, label: trimmedLabel });
          }
        }
      });
      setPeriodSlots(uniqueSlots);

      setSelectedClassId(prev => prev || (filteredClasses.length > 0 ? filteredClasses[0].id : ''));
      setSelectedBatchId(prev => prev || (filteredBatches.length > 0 ? filteredBatches[0].id : ''));
      
      if (filteredTeachers.length > 0) {
        const isTeacherUser = filteredTeachers.some(t => t.uid === profile?.uid || t.id === profile?.uid);
        if (isTeacherUser) {
          setSelectedTeacherId(profile?.uid || '');
        } else {
          setSelectedTeacherId(prev => prev || filteredTeachers[0]?.uid || filteredTeachers[0]?.id || '');
        }
      }
      
    } catch (error) {
      toast.error('Failed to load timetable data');
    } finally {
      setLoading(false);
    }
  };

  const isTeacherHandling = (teacher: any, classId: string, batchId: string, subjectIdOrName?: string) => {
    if (!teacher) return false;

    const matchesSubjectObj = (targetSubIdOrName: string, candidateSubIdOrName: string) => {
      if (!targetSubIdOrName || !candidateSubIdOrName) return false;
      if (targetSubIdOrName === candidateSubIdOrName) return true;
      const sub1 = subjects.find(s => s.id === targetSubIdOrName || s.name === targetSubIdOrName || s.code === targetSubIdOrName);
      const sub2 = subjects.find(s => s.id === candidateSubIdOrName || s.name === candidateSubIdOrName || s.code === candidateSubIdOrName);
      if (sub1 && sub2 && sub1.id === sub2.id) return true;
      if (sub1 && (candidateSubIdOrName === sub1.id || candidateSubIdOrName === sub1.name || candidateSubIdOrName === sub1.code)) return true;
      if (sub2 && (targetSubIdOrName === sub2.id || targetSubIdOrName === sub2.name || targetSubIdOrName === sub2.code)) return true;
      
      const s1Lower = (sub1?.name || targetSubIdOrName).toLowerCase();
      const s2Lower = (sub2?.name || candidateSubIdOrName).toLowerCase();
      return s1Lower === s2Lower || s1Lower.includes(s2Lower) || s2Lower.includes(s1Lower);
    };

    // 1. Check subjectAssignments (specific class-batch-subject combinations) if defined
    const hasSubjectAssignments = Array.isArray(teacher.subjectAssignments) && teacher.subjectAssignments.length > 0;
    if (hasSubjectAssignments) {
      const directAsgMatch = teacher.subjectAssignments.some((asg: any) => {
        const classMatch = !classId || !asg.classId || asg.classId === classId;
        const batchMatch = !batchId || !asg.batchId || asg.batchId === batchId;
        const subMatch = !subjectIdOrName || matchesSubjectObj(subjectIdOrName, asg.subjectId);
        return classMatch && batchMatch && subMatch;
      });
      if (directAsgMatch) return true;
      return false;
    }

    // 2. Check general subjects list and class/batch assignments
    const teacherSubjects = teacher.subjects || [];
    if (teacherSubjects.length > 0) {
      if (subjectIdOrName) {
        const hasSubject = teacherSubjects.some((ts: string) => matchesSubjectObj(subjectIdOrName, ts));
        if (!hasSubject) return false;
      }

      const assignedClassIds = [...(teacher.classIds || []), ...(teacher.classId ? [teacher.classId] : [])].filter(Boolean);
      const assignedBatchIds = [...(teacher.batchIds || []), ...(teacher.batchId ? [teacher.batchId] : [])].filter(Boolean);
      const hasSpecificClassOrBatch = assignedClassIds.length > 0 || assignedBatchIds.length > 0;

      if (!hasSpecificClassOrBatch) {
        return true;
      }

      const classMatch = !classId || assignedClassIds.includes(classId);
      const batchMatch = !batchId || assignedBatchIds.includes(batchId);
      return classMatch || batchMatch;
    }

    return false;
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => { if (isTeacherRole) return; };
  const downloadTemplate = (type: 'class' | 'teacher' = 'class') => { if (isTeacherRole) return; };

  const downloadPDF = (type: 'class' | 'teacher' = 'class') => {
    const doc = new jsPDF() as any;
    if (type === 'class') {
      const batch = batches.find(b => b.id === selectedBatchId);
      const cls = batch ? classes.find(c => c.id === batch.classId) : null;
      const classAndBatchName = cls && batch ? `${cls.name} - ${batch.name}` : (batch?.name || 'Class');
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`St.Antony' School`, pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Weekly Class Timetable - Class/Batch: ${classAndBatchName}`, pageWidth / 2, 21, { align: 'center' });
      
      const tableData = periodSlots.map(slot => {
        const row: any = [slot.label + ` (${slot.start || slot.startTime}-${slot.end || slot.endTime})`];
        DAYS.forEach(day => {
          const p = timetables.find(t => t.day === day && t.batchId === selectedBatchId)?.periods.find(per => per.label === slot.label);
          if (slot.isBreak) {
            row.push('BREAK');
          } else if (p) {
            if (p.isBreak) {
              row.push('BREAK');
            } else {
              const subjectName = subjects.find(s => s.id === p.subjectId)?.name || '-';
              const teacherName = teachers.find(t => t.uid === p.teacherId)?.name || '';
              row.push(teacherName ? `${subjectName}\n(${teacherName})` : subjectName);
            }
          } else {
            row.push('-');
          }
        });
        return row;
      });

      autoTable(doc, { 
        startY: 25, 
        head: [['Slot / Period', ...DAYS]], 
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [43, 54, 116], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle', halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: function (data: any) {
          if (data.row.section === 'body' && data.column.index > 0) {
            const text = data.cell.text.join('\n');
            if (text === 'BREAK') {
              data.cell.styles.fillColor = hexToRgb(BREAK_COLOR.hexBg);
              data.cell.styles.textColor = hexToRgb(BREAK_COLOR.hexText);
            } else if (text && text !== '-' && text !== 'Free') {
              const firstLine = data.cell.text[0];
              const color = getSubjectColor(firstLine);
              data.cell.styles.fillColor = hexToRgb(color.hexBg);
              data.cell.styles.textColor = hexToRgb(color.hexText);
            }
          }
        }
      });
      doc.save(`Timetable_${batch?.name || 'Class'}.pdf`);
    } else {
      const teacherProfile = teachers.find(t => t.uid === selectedTeacherId);
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`St.Antony' School`, pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Teacher Duty Roster - Teacher Name: ${teacherProfile?.name || 'Teacher'}`, pageWidth / 2, 21, { align: 'center' });
      
      const tableData = periodSlots.filter(s => !s.isBreak).map(slot => {
        const row: any = [slot.label + ` (${slot.start || slot.startTime}-${slot.end || slot.endTime})`];
        DAYS.forEach(day => {
          const assigned = timetables.filter(tt => tt.day === day).flatMap(tt => {
            const b = batches.find(batch => batch.id === tt.batchId);
            return tt.periods.filter(p => p.teacherId === selectedTeacherId && p.label === slot.label).map(p => ({ ...p, b }));
          })[0];
          if (assigned && assigned.b) {
            const cls = classes.find(c => c.id === assigned.b.classId);
            const bName = cls ? `${cls.name} - ${assigned.b.name}` : assigned.b.name;
            const subjectName = subjects.find(s => s.id === assigned.subjectId)?.name || '';
            row.push(`${subjectName}\n(${bName})`);
          } else {
            row.push('Free');
          }
        });
        return row;
      });

      autoTable(doc, { 
        startY: 25, 
        head: [['Period / Slot', ...DAYS]], 
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [43, 54, 116], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle', halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: function (data: any) {
          if (data.row.section === 'body' && data.column.index > 0) {
            const text = data.cell.text.join('\n');
            if (text && text !== '-' && text !== 'Free') {
              const firstLine = data.cell.text[0];
              const color = getSubjectColor(firstLine);
              data.cell.styles.fillColor = hexToRgb(color.hexBg);
              data.cell.styles.textColor = hexToRgb(color.hexText);
            }
          }
        }
      });
      doc.save(`Teacher_Schedule.pdf`);
    }
  };

  const handleSavePeriod = async (day: string, slotLabel: string, subjectId: string, teacherId: string, isBreak: boolean, batchIdArg: string) => {
    if (isTeacherRole) {
      toast.error("Teachers do not have permission to edit the timetable.");
      return;
    }

    if (!batchIdArg) {
      toast.error("Please select a Class / Batch before saving.");
      return;
    }

    if (!isBreak && !subjectId) {
      toast.error("Please select an Academic Subject.");
      return;
    }

    try {
      // Find existing doc
      const existingDoc = timetables.find(t => t.day === day && t.batchId === batchIdArg);
      const docId = existingDoc?.id || `${batchIdArg}_${day}`;

      let updatedPeriods: Period[] = [];

      if (existingDoc) {
        // Doc exists, map and update the specific slot
        updatedPeriods = existingDoc.periods.map(p => {
          if (p.label === slotLabel) {
            return {
              ...p,
              subjectId: isBreak ? '' : subjectId,
              teacherId: isBreak ? '' : teacherId,
              isBreak
            };
          }
          return p;
        });
      } else {
        // Create list of periods from periodSlots
        updatedPeriods = periodSlots.map(ps => ({
          startTime: ps.start || ps.startTime || '00:00',
          endTime: ps.end || ps.endTime || '00:00',
          label: ps.label,
          subjectId: ps.label === slotLabel && !isBreak ? subjectId : '',
          teacherId: ps.label === slotLabel && !isBreak ? teacherId : '',
          isBreak: ps.isBreak || (ps.label === slotLabel ? isBreak : false)
        }));
      }

      const updatedDoc: TimetableDoc = {
        id: docId,
        batchId: batchIdArg,
        day,
        periods: updatedPeriods
      };

      // Optimistically update local state immediately so UI updates instantly!
      setTimetables(prev => {
        const idx = prev.findIndex(t => (t.id === docId) || (t.day === day && t.batchId === batchIdArg));
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updatedDoc;
          return copy;
        }
        return [...prev, updatedDoc];
      });

      await dbService.set('timetableSlots', docId, updatedDoc);
      
      toast.success("Timetable slot updated successfully!");
      fetchInitialData(); // Reload from db
    } catch (e) {
      console.error(e);
      toast.error("Failed to save period slot.");
    }
  };

  const handleDeleteTimetable = (batchIdArg?: string) => {
    if (isTeacherRole) return;
    setClearBatchId(batchIdArg);
    setShowClearConfirmModal(true);
  };

  const executeClearTimetable = async () => {
    try {
      setLoading(true);
      setShowClearConfirmModal(false);
      // Fetch latest from database, bypassing any cache to get all accurate documents
      const latestSlots = await dbService.list('timetableSlots', [], true);
      const docsToClear = clearBatchId 
        ? latestSlots.filter((t: any) => t.batchId === clearBatchId)
        : latestSlots;

      const idsToClear = docsToClear.map((t: any) => t.id).filter(Boolean);

      if (idsToClear.length > 0) {
        await dbService.deleteBatch('timetableSlots', idsToClear);
      }

      toast.success(clearBatchId ? "Class timetable cleared." : "Entire school's timetable cleared.");
      fetchInitialData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to clear timetable.");
    } finally {
      setLoading(false);
      setClearBatchId(undefined);
    }
  };

  const handleGenerateAutoTimetable = async () => {
    if (isTeacherRole) return;
    setIsGenerating(true);
    setGenerationSteps([
      { label: 'Analyzing batches, subjects, teaching staff, and active custom school rules...', status: 'running' },
      { label: 'Initializing constraint-solving parameters...', status: 'pending' },
      { label: 'Generating conflict-free schedules per weekday...', status: 'pending' },
      { label: 'Saving generated timetables to database...', status: 'pending' },
    ]);

    try {
      // Step 1: Analyze
      await new Promise(r => setTimeout(r, 800));
      setGenerationSteps(prev => [
        { ...prev[0], status: 'success' },
        { ...prev[1], status: 'running' },
        ...prev.slice(2)
      ]);

      if (batches.length === 0 || teachers.length === 0 || subjects.length === 0) {
        throw new Error("Missing master data. Please ensure classes, teachers, and subjects are registered.");
      }

      // Step 2: Init parameters
      await new Promise(r => setTimeout(r, 600));
      setGenerationSteps(prev => [
        prev[0],
        { ...prev[1], status: 'success' },
        { ...prev[2], status: 'running' },
        prev[3]
      ]);

      // We will generate a timetable per batch per day
      const newTimetables: TimetableDoc[] = [];

      // Process custom_text rules dynamically by matching keywords to assist standard custom rule parsing
      const filteredRulesForGen = getFilteredCustomRules();
      const processedRules = [...filteredRulesForGen];
      filteredRulesForGen.forEach(rule => {
        if (rule.isActive && rule.type === 'custom_text' && rule.text) {
          const text = rule.text.toLowerCase();
          
          // Try to extract teacher name
          let foundTeacher = teachers.find(t => text.includes(t.name.toLowerCase()));
          // Try to extract day
          let foundDay = DAYS.find(d => text.includes(d.toLowerCase()));
          // Try to extract slot
          let foundSlot = periodSlots.find(s => {
            const cleanLabel = s.label.toLowerCase();
            const slotNum = cleanLabel.replace(/\D/g, '');
            return text.includes(cleanLabel) || 
                   (slotNum && (text.includes(`p${slotNum}`) || text.includes(`${slotNum} period`) || text.includes(`${slotNum}nd period`) || text.includes(`${slotNum}rd period`) || text.includes(`${slotNum}th period`) || text.includes(`${slotNum}st period`)));
          });
          // Try to extract subject
          let foundSubject = subjects.find(s => text.includes(s.name.toLowerCase()));
          // Try to extract batch
          let foundBatch = batches.find(b => text.includes(b.name.toLowerCase()));

          if (text.includes('unavailable') || text.includes('not available') || text.includes('off') || text.includes('cannot teach') || text.includes('leave') || text.includes('absent')) {
            if (foundTeacher && foundDay && foundSlot) {
              processedRules.push({
                id: `dynamic_${rule.id}`,
                type: 'teacher_unavailable',
                teacherId: foundTeacher.uid,
                day: foundDay,
                slotLabel: foundSlot.label,
                isActive: true
              });
            }
          } else if (text.includes('must have') || text.includes('fixed') || text.includes('assign') || text.includes('should have') || text.includes('has')) {
            if (foundBatch && foundSubject && foundDay && foundSlot) {
              processedRules.push({
                id: `dynamic_${rule.id}`,
                type: 'fixed_slot',
                batchId: foundBatch.id,
                subjectId: foundSubject.id,
                day: foundDay,
                slotLabel: foundSlot.label,
                isActive: true
              });
            }
          } else if (text.includes('same period') || text.includes('same subject') || text.includes('daily same') || text.includes('every day same') || text.includes('remaining weekdays also') || text.includes('remaining weak days also')) {
            processedRules.push({
              id: `dynamic_${rule.id}`,
              type: 'daily_same_period_subject',
              batchIds: foundBatch ? [foundBatch.id] : ['all'],
              batchId: foundBatch ? foundBatch.id : 'all',
              subjectIds: foundSubject ? [foundSubject.id] : ['all'],
              subjectId: foundSubject ? foundSubject.id : 'all',
              slotLabel: foundSlot ? foundSlot.label : 'All Periods',
              isActive: true
            });
          }
        }
      });

      // Structure to keep track of busy teachers per day and slot to avoid overlaps
      // Key format: `${day}_${slotLabel}_${teacherId}`
      const busyTeachers = new Set<string>();

      // Workload tracking per day per teacher
      // Format: { [day]: { [teacherId]: number } }
      const teacherWorkload: Record<string, Record<string, number>> = {};
      DAYS.forEach(day => {
        teacherWorkload[day] = {};
        teachers.forEach(t => {
          teacherWorkload[day][t.uid] = 0;
        });
      });

      // Keep track of subject frequency per batch per week to balance topics
      // Format: { [batchId]: { [subjectId]: number } }
      const batchSubjectUsage: Record<string, Record<string, number>> = {};
      batches.forEach(b => {
        batchSubjectUsage[b.id] = {};
        subjects.forEach(s => {
          batchSubjectUsage[b.id][s.id] = 0;
        });
      });

      // Shuffling helper to add natural entropy and variety
      const shuffle = <T,>(arr: T[]): T[] => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };

      const isCoreSubject = (subjectName: string) => {
        const name = subjectName.toLowerCase();
        return name.includes('math') || name.includes('sci') || name.includes('eng') || 
               name.includes('phy') || name.includes('chem') || name.includes('bio') || 
               name.includes('social') || name.includes('history') || name.includes('comp');
      };

      const matchDay = (r: any, currentDay: string) => {
        if (r.days && Array.isArray(r.days)) {
          return r.days.includes(currentDay);
        }
        return r.day === currentDay;
      };

      const matchBatch = (r: any, currentBatchId: string) => {
        if (r.batchIds && Array.isArray(r.batchIds)) {
          return r.batchIds.length === 0 || r.batchIds.includes('all') || r.batchIds.includes(currentBatchId);
        }
        return !r.batchId || r.batchId === 'all' || r.batchId === currentBatchId;
      };

      const matchSubject = (r: any, currentSubjectId: string) => {
        if (r.subjectIds && Array.isArray(r.subjectIds)) {
          return r.subjectIds.length === 0 || r.subjectIds.includes('all') || r.subjectIds.includes(currentSubjectId);
        }
        return !r.subjectId || r.subjectId === 'all' || r.subjectId === currentSubjectId;
      };

      // Helper to calculate consecutive periods for a teacher on a day
      const getConsecutivePeriodsCount = (teacherId: string, day: string, slotIndex: number) => {
        let consecutiveCount = 0;
        
        // Check backwards from slotIndex - 1
        let checkIdx = slotIndex - 1;
        while (checkIdx >= 0) {
          const prevSlot = periodSlots[checkIdx];
          if (prevSlot.isBreak) {
            break; // break resets consecutive count
          }
          
          // Is the teacher busy in this slot on this day?
          const isBusy = busyTeachers.has(`${day}_${prevSlot.label}_${teacherId}`);
          if (isBusy) {
            consecutiveCount++;
            checkIdx--;
          } else {
            break;
          }
        }
        
        // Check forwards from slotIndex + 1
        let checkForwardIdx = slotIndex + 1;
        while (checkForwardIdx < periodSlots.length) {
          const nextSlot = periodSlots[checkForwardIdx];
          if (nextSlot.isBreak) {
            break;
          }
          const isBusy = busyTeachers.has(`${day}_${nextSlot.label}_${teacherId}`);
          if (isBusy) {
            consecutiveCount++;
            checkForwardIdx++;
          } else {
            break;
          }
        }
        
        return consecutiveCount;
      };

      // Check if there is an active daily_same_period_subject rule that applies globally to all classes, all subjects, and all periods
      const isGlobalDailySamePeriod = processedRules.some(r => {
        if (!r.isActive || r.type !== 'daily_same_period_subject') return false;
        const isAllBatches = !r.batchIds || r.batchIds.length === 0 || r.batchIds.includes('all') || !r.batchId || r.batchId === 'all';
        const isAllSubjects = !r.subjectIds || r.subjectIds.length === 0 || r.subjectIds.includes('all') || !r.subjectId || r.subjectId === 'all';
        const isAllPeriods = !r.slotLabel || r.slotLabel === 'All Periods';
        return isAllBatches && isAllSubjects && isAllPeriods;
      });

      // --- PRE-ASSIGNMENTS FOR DAILY SAME PERIOD SUBJECT RULES ---
      const preAssignments: Record<string, Record<string, { subjectId: string; teacherId: string }>> = {};
      batches.forEach(b => {
        preAssignments[b.id] = {};
      });

      processedRules.forEach(rule => {
        if (rule.isActive && rule.type === 'daily_same_period_subject') {
          const targetBatches = batches.filter(b => matchBatch(rule, b.id));
          targetBatches.forEach(batch => {
            const slot = periodSlots.find(s => s.label === rule.slotLabel);
            if (!slot || slot.isBreak) return;

            const allowedSubjectIds = rule.subjectIds || (rule.subjectId ? [rule.subjectId] : []);
            if (allowedSubjectIds.length === 0) return;

            // Find an eligible subject and teacher who can teach it to this batch
            let found = false;
            const shuffledSubjects = shuffle(subjects.filter(s => allowedSubjectIds.includes(s.id)));
            const shuffledTeachers = shuffle(teachers);

            for (const subject of shuffledSubjects) {
              for (const teacher of shuffledTeachers) {
                const isTeaching = teacher.role === 'teacher' || teacher.role === 'teacher_class' || teacher.role === 'teacher_subject' || teacher.role === 'coordinator' || teacher.staffType === 'teaching';
                if (!isTeaching) continue;

                // Check if teacher handles this batch's class and subject
                const isHandling = isTeacherHandling(teacher, batch.classId, batch.id, subject.id);
                if (!isHandling) continue;

                // Check if teacher has any unavailable rule for this slot on ANY day
                const isUnavailable = processedRules.some(r => 
                  r.isActive && 
                  r.type === 'teacher_unavailable' && 
                  r.teacherId === teacher.uid && 
                  (r.slotLabel === slot.label || r.slotLabel === 'All Periods')
                );
                if (isUnavailable) continue;

                // Ensure teacher is not pre-assigned to another batch at this same slot
                let teacherAlreadyBusy = false;
                for (const otherBatchId of Object.keys(preAssignments)) {
                  if (preAssignments[otherBatchId][slot.label]?.teacherId === teacher.uid) {
                    teacherAlreadyBusy = true;
                    break;
                  }
                }
                if (teacherAlreadyBusy) continue;

                // We found a match! Pre-assign this subject & teacher to this batch & slot
                preAssignments[batch.id][slot.label] = {
                  subjectId: subject.id,
                  teacherId: teacher.uid
                };
                found = true;
                break;
              }
              if (found) break;
            }
          });
        }
      });

      // Now, apply the pre-assignments to our initial state (mark busy and increment workloads)
      DAYS.forEach(day => {
        batches.forEach(batch => {
          Object.keys(preAssignments[batch.id] || {}).forEach(slotLabel => {
            const assignment = preAssignments[batch.id][slotLabel];
            if (assignment) {
              busyTeachers.add(`${day}_${slotLabel}_${assignment.teacherId}`);
              teacherWorkload[day][assignment.teacherId] = (teacherWorkload[day][assignment.teacherId] || 0) + 1;
              batchSubjectUsage[batch.id][assignment.subjectId] = (batchSubjectUsage[batch.id][assignment.subjectId] || 0) + 1;
            }
          });
        });
      });

      // Loop through each day and slot to construct clash-free periods
      for (const day of DAYS) {
        for (const batch of batches) {
          if (isGlobalDailySamePeriod && day !== DAYS[0]) {
            // Clone from the first day (DAYS[0], e.g. Monday)
            const firstDayTt = newTimetables.find(t => t.batchId === batch.id && t.day === DAYS[0]);
            if (firstDayTt) {
              const copiedPeriods = firstDayTt.periods.map(p => ({ ...p }));
              // Update status counters and busy state for teachers on this day
              copiedPeriods.forEach(p => {
                if (p.teacherId && !p.isBreak) {
                  const slotLabel = p.label;
                  busyTeachers.add(`${day}_${slotLabel}_${p.teacherId}`);
                  teacherWorkload[day][p.teacherId] = (teacherWorkload[day][p.teacherId] || 0) + 1;
                  batchSubjectUsage[batch.id][p.subjectId] = (batchSubjectUsage[batch.id][p.subjectId] || 0) + 1;
                }
              });
              newTimetables.push({
                id: `${batch.id}_${day}`,
                batchId: batch.id,
                day,
                periods: copiedPeriods
              });
              continue; // Skip normal solver logic for this batch on this day
            }
          }

          const periods: Period[] = [];
          const nonBreakSlots = periodSlots.filter(s => !s.isBreak);

          for (let slotIdx = 0; slotIdx < periodSlots.length; slotIdx++) {
            const slot = periodSlots[slotIdx];
            if (slot.isBreak) {
              periods.push({
                startTime: slot.start || slot.startTime || '00:00',
                endTime: slot.end || slot.endTime || '00:00',
                label: slot.label,
                subjectId: '',
                teacherId: '',
                isBreak: true
              });
              continue;
            }

            // If we have a pre-assignment for this batch and slot, use it immediately
            const preAssigned = preAssignments[batch.id]?.[slot.label];
            if (preAssigned) {
              periods.push({
                startTime: slot.start || slot.startTime || '00:00',
                endTime: slot.end || slot.endTime || '00:00',
                label: slot.label,
                subjectId: preAssigned.subjectId,
                teacherId: preAssigned.teacherId,
                isBreak: false
              });
              continue; // Skip normal solver logic!
            }

            const isFirstPeriod = nonBreakSlots.length > 0 && slot.label === nonBreakSlots[0].label;

            // Find all candidates (subject, teacher) eligible for this batch and slot
            const eligibleCandidates: { subjectId: string; teacherId: string; score: number }[] = [];

            // Shuffle teachers and subjects to ensure a non-rigid layout
            const shuffledTeachers = shuffle(teachers);
            const shuffledSubjects = shuffle(subjects);

            for (const teacher of shuffledTeachers) {
              // Check if teacher is a teaching staff member
              const isTeaching = teacher.role === 'teacher' || teacher.role === 'teacher_class' || teacher.role === 'teacher_subject' || teacher.role === 'coordinator' || teacher.staffType === 'teaching';
              if (!isTeaching) continue;

              // Is this teacher available (not already teaching elsewhere at this slot today)?
              const isBusy = busyTeachers.has(`${day}_${slot.label}_${teacher.uid}`);
              if (isBusy) continue;

              // Custom Rule: Teacher Unavailable / Off period
              const isTeacherUnavailableCustom = processedRules.some(r => r.isActive && r.type === 'teacher_unavailable' && r.teacherId === teacher.uid && matchDay(r, day) && (r.slotLabel === slot.label || r.slotLabel === 'All Periods') && matchBatch(r, batch.id));
              if (isTeacherUnavailableCustom) continue;

              // Custom Rule: Class Teacher for Last Period(s) only
              const classTeacherRule = processedRules.find(r => r.isActive && r.type === 'class_teacher_last_periods' && matchBatch(r, batch.id));
              if (classTeacherRule) {
                const nonBreakIndex = nonBreakSlots.findIndex(s => s.label === slot.label);
                if (nonBreakIndex !== -1) {
                  const remaining = nonBreakSlots.length - 1 - nonBreakIndex;
                  const targetPeriods = classTeacherRule.limitValue || 1; // 1 or 2
                  if (remaining < targetPeriods) {
                    // Only class teacher is allowed for this class
                    if (batch.classTeacherId && teacher.uid !== batch.classTeacherId) {
                      continue; // skip other teachers
                    }
                  }
                }
              }

              // Check workload limits
              const maxLoad = teacher.maxPeriodsPerDay || schedulerConfig.maxPeriodsPerDayPerTeacher;
              const currentLoad = teacherWorkload[day][teacher.uid] || 0;
              if (currentLoad >= maxLoad) continue;

              // Check if teacher handles this batch's class
              const isHandlingBatch = isTeacherHandling(teacher, batch.classId, batch.id);
              if (!isHandlingBatch) continue;

              // Find subjects this teacher can teach
              for (const subject of shuffledSubjects) {
                const canTeachSubject = isTeacherHandling(teacher, batch.classId, batch.id, subject.id);
                if (!canTeachSubject) continue;

                // --- CUSTOM RULES ENFORCEMENT ---
                // Custom Rule: Subject limit per day
                const limitRule = processedRules.find(r => r.isActive && r.type === 'subject_limit' && matchSubject(r, subject.id) && matchBatch(r, batch.id));
                if (limitRule) {
                  const countOfSubjectToday = periods.filter(p => p.subjectId === subject.id).length;
                  if (countOfSubjectToday >= (limitRule.limitValue || 1)) continue;
                }

                // Custom Rule: Subject limit per week
                const weeklyLimitRule = processedRules.find(r => r.isActive && r.type === 'subject_weekly_limit' && matchSubject(r, subject.id) && matchBatch(r, batch.id));
                if (weeklyLimitRule) {
                  const countOfSubjectWeekly = batchSubjectUsage[batch.id][subject.id] || 0;
                  if (countOfSubjectWeekly >= (weeklyLimitRule.limitValue || 2)) continue;
                }

                // --- SUBJECT REQUIRED WEEKLY TARGETS ---
                const targetPeriods = schedulerConfig.subjectRequiredPeriods?.[`${subject.id}_${batch.id}`] !== undefined
                  ? schedulerConfig.subjectRequiredPeriods[`${subject.id}_${batch.id}`]
                  : (schedulerConfig.subjectRequiredPeriods?.[subject.id] !== undefined
                      ? schedulerConfig.subjectRequiredPeriods[subject.id]
                      : 5); // default to 5

                if (targetPeriods === 0) continue;

                // --- CONSTRAINT & SCORING HEURISTICS ---
                let score = 0;

                const countOfSubjectWeekly = batchSubjectUsage[batch.id][subject.id] || 0;
                if (countOfSubjectWeekly >= targetPeriods) {
                  // Heavy penalty to prioritize other subjects that haven't reached their targets yet
                  score += 1500;
                } else {
                  // Prioritize subjects that are further from their weekly target
                  const remainingPeriods = targetPeriods - countOfSubjectWeekly;
                  score -= remainingPeriods * 35.0; // Strong bonus for subjects with many remaining periods
                }

                // Custom Rule: Fixed Slot Activity
                const fixedRule = processedRules.find(r => r.isActive && r.type === 'fixed_slot' && matchBatch(r, batch.id) && matchDay(r, day) && r.slotLabel === slot.label);
                if (fixedRule) {
                  if (!matchSubject(fixedRule, subject.id)) continue; // Skip other subjects for this slot
                  score -= 1000; // Massive preference to lock it in
                }

                // Custom Rule: Daily Same Period Same Subject
                const dailySamePeriodRule = processedRules.find(r => r.isActive && r.type === 'daily_same_period_subject' && matchBatch(r, batch.id) && r.slotLabel === slot.label);
                if (dailySamePeriodRule) {
                  if (!matchSubject(dailySamePeriodRule, subject.id)) continue; // Skip other subjects for this slot
                  score -= 1500; // Massive preference to lock it in
                }

                // Custom Rule: Subject Preferred Time Range
                const rangeRule = processedRules.find(r => r.isActive && r.type === 'subject_range' && matchSubject(r, subject.id) && matchBatch(r, batch.id));
                if (rangeRule) {
                  const isMorningSlot = slotIdx < Math.ceil(periodSlots.length / 2);
                  if (rangeRule.timeRange === 'morning' && !isMorningSlot) score += 250;
                  if (rangeRule.timeRange === 'afternoon' && isMorningSlot) score += 250;
                }

                // 1. Core Workload Balance
                if (schedulerConfig.evenWorkloadDistribution) {
                  score += currentLoad * 2.5;
                }

                // 2. Subject Variety score
                const subjectUsage = batchSubjectUsage[batch.id][subject.id] || 0;
                score += subjectUsage * 5.0;

                // 3. Rule: Class Teacher in First Period
                if (schedulerConfig.firstPeriodClassTeacher && isFirstPeriod) {
                  if (batch.classTeacherId === teacher.uid) {
                    // Massive priority bonus for class teacher on first period!
                    score -= 500;
                  } else {
                    // Slight penalty for non-class teachers on first period
                    score += 50;
                  }
                }

                // 4. Rule: Prevent Consecutive Same Subject in Batch, EXCEPT when continuous double periods rule applies
                let skipConsecutivePenalty = false;
                if (periods.length > 0) {
                  const lastPeriod = periods[periods.length - 1];
                  if (lastPeriod && lastPeriod.subjectId === subject.id) {
                    const doublePeriodRule = processedRules.find(r => r.isActive && r.type === 'continuous_double_periods' && matchSubject(r, subject.id) && matchBatch(r, batch.id));
                    if (doublePeriodRule) {
                      // Check if we already have two consecutive periods of this subject
                      const hadTwoAlready = periods.length >= 2 && 
                                           periods[periods.length - 2]?.subjectId === subject.id &&
                                           !periods[periods.length - 2]?.isBreak &&
                                           !lastPeriod.isBreak;
                      if (!hadTwoAlready) {
                        // High bonus to encourage keeping them continuous
                        score -= 800;
                        skipConsecutivePenalty = true;
                      } else {
                        // Already had 2 in a row. Strongly discourage/prevent a third consecutive one
                        score += 500;
                        skipConsecutivePenalty = true;
                      }
                    }
                  }
                }

                if (schedulerConfig.preventConsecutiveSameSubject && !skipConsecutivePenalty && periods.length > 0) {
                  const lastPeriod = periods[periods.length - 1];
                  if (lastPeriod && lastPeriod.subjectId === subject.id) {
                    // Massive penalty to avoid consecutive same subject
                    score += 400;
                  }
                }

                // 5. Rule: Teacher Max Consecutive Periods Guard
                const teacherConsecutiveCount = getConsecutivePeriodsCount(teacher.uid, day, slotIdx);
                if (teacherConsecutiveCount >= schedulerConfig.maxConsecutivePeriodsPerTeacher) {
                  // Heavy penalty to give teacher a rest break
                  score += 300;
                }

                // 6. Rule: Core Subjects Early
                if (schedulerConfig.coreSubjectsEarly) {
                  const isCore = isCoreSubject(subject.name);
                  const isMorningSlot = slotIdx < Math.ceil(periodSlots.length / 2);
                  if (isCore && isMorningSlot) {
                    score -= 40; // prefer core subjects in the morning
                  } else if (!isCore && !isMorningSlot) {
                    score -= 30; // prefer non-core (sports, arts) in the afternoon
                  } else if (isCore && !isMorningSlot) {
                    score += 40; // discourage core subjects late in the day
                  } else if (!isCore && isMorningSlot) {
                    score += 30; // discourage arts/sports early in the day
                  }
                }

                eligibleCandidates.push({
                  subjectId: subject.id,
                  teacherId: teacher.uid,
                  score
                });
              }
            }

            // Sort candidates by score ascending (lowest score = best match)
            eligibleCandidates.sort((a, b) => a.score - b.score);

            if (eligibleCandidates.length > 0) {
              const best = eligibleCandidates[0];

              periods.push({
                startTime: slot.start || slot.startTime || '00:00',
                endTime: slot.end || slot.endTime || '00:00',
                label: slot.label,
                subjectId: best.subjectId,
                teacherId: best.teacherId,
                isBreak: false
              });

              // Mark teacher as busy for this slot
              busyTeachers.add(`${day}_${slot.label}_${best.teacherId}`);
              // Update stats
              teacherWorkload[day][best.teacherId] = (teacherWorkload[day][best.teacherId] || 0) + 1;
              batchSubjectUsage[batch.id][best.subjectId] = (batchSubjectUsage[batch.id][best.subjectId] || 0) + 1;
            } else {
              // No free eligible teacher found, leave slot empty
              periods.push({
                startTime: slot.start || slot.startTime || '00:00',
                endTime: slot.end || slot.endTime || '00:00',
                label: slot.label,
                subjectId: '',
                teacherId: '',
                isBreak: false
              });
            }
          }

          newTimetables.push({
            id: `${batch.id}_${day}`,
            batchId: batch.id,
            day,
            periods
          });
        }
      }

      // Step 3: Success Generating
      await new Promise(r => setTimeout(r, 800));
      setGenerationSteps(prev => [
        prev[0],
        prev[1],
        { ...prev[2], status: 'success' },
        { ...prev[3], status: 'running' }
      ]);

      // Step 4: Write to Database
      let count = 0;
      for (const tt of newTimetables) {
        await dbService.set('timetableSlots', tt.id!, tt);
        count++;
      }

      await new Promise(r => setTimeout(r, 600));
      setGenerationSteps(prev => [
        prev[0],
        prev[1],
        prev[2],
        { ...prev[3], status: 'success' }
      ]);

      toast.success(`Successfully generated and synchronized ${count} weekly schedule slots!`);
      // Refresh local state
      fetchInitialData();
      setIsGenerating(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to generate clash-free timetable automatically");
      setIsGenerating(false);
    }
  };

  const handleAIAnalyzeTimetable = async () => {
    setIsAnalyzing(true);
    setAiAnalysis('');
    try {
      const summaryData = {
        batches: batches.map(b => b.name),
        teachers: teachers.map(t => ({ name: t.name, specialties: t.subjects, maxPeriods: t.maxPeriodsPerDay })),
        timetable: timetables.map(t => ({
          batch: batches.find(b => b.id === t.batchId)?.name,
          day: t.day,
          periods: t.periods.map(p => ({
            label: p.label,
            subject: subjects.find(sub => sub.id === p.subjectId)?.name,
            teacher: teachers.find(teach => teach.uid === p.teacherId)?.name,
            isBreak: p.isBreak
          }))
        }))
      };

      const prompt = `
        Analyze this school's weekly timetable for load distribution, potential conflicts, and educational balance:
        ${JSON.stringify(summaryData)}

        Provide a constructive, professional analysis with:
        1. 📊 WORKLOAD ANALYSIS: Identify overworked teachers (exceeding their maximum load or teaching too many consecutive slots).
        2. 🎓 ACADEMIC BALANCE: Assess if subjects are balanced throughout the week for students.
        3. 💡 ACTIONABLE RECOMMENDATIONS: Give 3-4 specific ways to optimize the weekly rhythm or improve staff health.
      `;

      const analysisResult = await generateAIContent(prompt, "You are an expert school administrator and workload analyst for high-performing educational institutions.");
      setAiAnalysis(analysisResult);
    } catch (e) {
      toast.error("Failed to run AI analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAIDraft = async () => { if (isTeacherRole) return; };
  const shareToWhatsApp = async () => { if (isTeacherRole) return; };
  const handleUpdateMaxPeriods = async (id: string) => { if (isTeacherRole) return; };

  const teacherBatchIds = Array.from(new Set([profile?.batchId, ...(profile as any)?.batchIds || []].filter(Boolean)));
  const teacherClassIds = Array.from(new Set([profile?.classId, ...(profile as any)?.classIds || []].filter(Boolean)));

  // బైపాస్ కాకుండా రూల్ లాక్ చేయబడింది
  const availableClasses = classes;

  const availableBatches = batches.filter(b => {
    return selectedClassId ? b.classId === selectedClassId : true;
  });

  // Sync selected batch when class changes
  useEffect(() => {
    if (selectedClassId) {
      const classBatches = availableBatches.filter(b => b.classId === selectedClassId);
      if (classBatches.length > 0) {
        if (!selectedBatchId || !classBatches.find(b => b.id === selectedBatchId)) {
          setSelectedBatchId(classBatches[0].id);
        }
      } else {
        setSelectedBatchId('');
      }
    }
  }, [selectedClassId, availableBatches, selectedBatchId]);

  // Auto-select class & batch for students/parents or standard user
  useEffect(() => {
    if (availableClasses.length === 0) return;

    if (isStudent || profile?.role === 'student' || profile?.role === 'parent') {
      const pClass = profile?.class || profile?.classId || (profile as any)?.className;
      const pBatch = profile?.batch || profile?.batchId || (profile as any)?.section;

      const matchedClass = availableClasses.find(c => 
        c.id === pClass || 
        c.id === profile?.classId ||
        (c.name || '').toLowerCase().trim() === String(pClass || '').toLowerCase().trim()
      );

      if (matchedClass) {
        if (selectedClassId !== matchedClass.id) {
          setSelectedClassId(matchedClass.id);
        }
        const classBatches = batches.filter(b => b.classId === matchedClass.id);
        const matchedBatch = classBatches.find(b => 
          b.id === pBatch || 
          b.id === profile?.batchId ||
          (b.name || '').toLowerCase().trim() === String(pBatch || '').toLowerCase().trim()
        );

        if (matchedBatch) {
          if (selectedBatchId !== matchedBatch.id) setSelectedBatchId(matchedBatch.id);
        } else if (classBatches.length > 0 && (!selectedBatchId || !classBatches.find(b => b.id === selectedBatchId))) {
          setSelectedBatchId(classBatches[0].id);
        }
      } else if (!selectedClassId) {
        setSelectedClassId(availableClasses[0].id);
      }
    } else if ((!looseAccess || hasPermission('timetable_view_my')) && availableClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, batches, looseAccess, selectedClassId, hasPermission, isStudent, profile]);

  // Auto-select batch fallback
  useEffect(() => {
    if (selectedClassId && availableBatches.length > 0 && (!selectedBatchId || !availableBatches.find(b => b.id === selectedBatchId))) {
      setSelectedBatchId(availableBatches[0].id);
    }
  }, [selectedClassId, availableBatches, selectedBatchId]);

  const renderMasterView = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header with Day Selector */}
        <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => setMasterViewDay(day as any)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${masterViewDay === day ? 'bg-sidebar text-white shadow-sm' : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
              >
                {day}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer border border-emerald-100"
            >
              <Download className="w-4 h-4 text-emerald-500" />
              Export Timetable
            </button>
            <button
              onClick={() => handleAIAnalyzeTimetable()}
              disabled={isAnalyzing}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-500" />
              {isAnalyzing ? 'Analyzing load...' : 'AI Load & Conflict Audit'}
            </button>
            <button
              onClick={() => handleDeleteTimetable()}
              className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              Clear Master Timetable
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Master Timetable Grid */}
          <div className="lg:col-span-3 bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
            <div className="bg-neutral-50/50 px-8 py-5 border-b border-neutral-100 flex justify-between items-center">
              <div>
                <p className="text-[11px] font-black text-neutral-400 uppercase tracking-widest leading-none mb-1">Master Class Matrix</p>
                <h3 className="text-xl font-black text-sidebar tracking-tight">Active Weekday: {masterViewDay}</h3>
              </div>
              <span className="text-xs font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-3 py-1 rounded-full uppercase">
                {batches.length} Active Batches
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse table-fixed min-w-[800px]">
                <thead>
                  <tr className="bg-neutral-50/20 border-b border-neutral-100">
                    <th className="p-4 text-xs font-black uppercase tracking-[0.2em] text-neutral-400 border-r border-neutral-100 w-32 sticky left-0 bg-white z-10">Batch</th>
                    {periodSlots.map(slot => (
                      <th key={slot.label} className="p-4 text-xs font-black uppercase tracking-[0.2em] text-sidebar animate-in fade-in">
                        {slot.label}
                        <span className="block text-[9px] font-bold text-neutral-400 tracking-normal mt-0.5">{slot.start || (slot as any).startTime} - {slot.end || (slot as any).endTime}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {batches.map(batch => {
                    const tt = timetables.find(t => t.day === masterViewDay && t.batchId === batch.id);

                    return (
                      <tr key={batch.id} className="hover:bg-neutral-50/20 transition-colors">
                        <td className="p-4 border-r border-neutral-100 bg-neutral-50/30 sticky left-0 z-10 font-black text-sidebar text-sm">
                          {batch.name}
                        </td>
                        {periodSlots.map(slot => {
                          const period = tt?.periods?.find(p => p.label === slot.label);
                          const subject = subjects.find(s => s.id === period?.subjectId || s.name === period?.subjectId || s.code === period?.subjectId);
                          const teacher = teachers.find(t => t.uid === period?.teacherId || t.id === period?.teacherId || t.docId === period?.teacherId);
                          const colorTheme = period 
                            ? (period.isBreak ? BREAK_COLOR : getSubjectColor(subject?.name || '')) 
                            : DEFAULT_COLOR;
                          const colorClasses = period 
                            ? `${colorTheme.bg} ${colorTheme.text} ${colorTheme.border}` 
                            : 'border-dashed border-neutral-200 bg-neutral-50/30 text-neutral-400';

                          return (
                            <td key={`${batch.id}-${slot.label}`} className="p-2">
                              {slot.isBreak ? (
                                <div className="flex items-center justify-center py-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-[10px] font-black uppercase select-none">
                                  {slot.label}
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedEditDay(masterViewDay);
                                    setSelectedEditBatchId(batch.id);
                                    setSelectedEditSlotLabel(slot.label);
                                    setEditSubjectId(period?.subjectId || '');
                                    setEditTeacherId(period?.teacherId || '');
                                    setEditIsBreak(!!period?.isBreak);
                                    setShowManualEditModal(true);
                                  }}
                                  className={`w-full p-2.5 rounded-2xl border text-left flex flex-col justify-between h-[80px] hover:shadow-md transition-all group ${colorClasses} cursor-pointer`}
                                >
                                  {period && !period.isBreak && subject ? (
                                    <>
                                      <div className="w-full">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[9px] font-black uppercase tracking-wider opacity-40">{slot.label}</span>
                                          <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase underline">Edit</span>
                                        </div>
                                        <h4 className="text-xs font-black truncate leading-tight">{subject.name}</h4>
                                      </div>
                                      <span className="text-[10px] font-bold opacity-80 truncate block">{teacher?.name || '---'}</span>
                                    </>
                                  ) : (
                                    <div className="my-auto mx-auto flex flex-col items-center justify-center text-neutral-300 group-hover:text-neutral-500 transition-colors">
                                      <Plus className="w-4 h-4 mb-0.5 opacity-60" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">Assign</span>
                                    </div>
                                  )}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar controls & actions */}
          <div className="space-y-6">
            {/* Auto-Scheduler Card */}
            <div className="bg-gradient-to-br from-indigo-900 to-sidebar p-6 rounded-[2rem] border border-indigo-950/40 text-white shadow-xl flex flex-col justify-between min-h-[300px]">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <Sparkles className="w-5 h-5 text-indigo-300" />
                  </div>
                  <h4 className="text-lg font-black tracking-tight">Auto-Scheduler AI</h4>
                </div>
                <p className="text-xs text-indigo-200/90 leading-relaxed font-semibold">
                  Generate a balanced, conflict-free master timetable for all classes and teachers in seconds. Our engine automatically resolves double-bookings, balances teaching workload distribution, and optimizes academic subject patterns.
                </p>
              </div>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => setShowSchedulerSettings(true)}
                  className="w-full py-3.5 bg-white text-indigo-900 hover:bg-indigo-50 active:scale-[0.98] rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wand2 className="w-4 h-4 text-indigo-700" />
                  ⚡ Run Auto-Scheduler
                </button>
                <p className="text-[10px] text-indigo-300/80 text-center font-bold uppercase tracking-widest">
                  Overwrites existing timetable allocations
                </p>
              </div>
            </div>

            {/* AI Analysis Display */}
            {aiAnalysis && (
              <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4 max-h-[500px] overflow-y-auto">
                <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
                  <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                  <h4 className="text-sm font-black text-sidebar uppercase tracking-tight">AI Compliance &amp; Load Audit</h4>
                </div>
                <div className="text-xs text-neutral-600 space-y-3 font-semibold leading-relaxed whitespace-pre-line">
                  {aiAnalysis}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const teacherHandlesBatch = (teacher: any, b: any) => {
    if (!teacher || !b) return false;
    const batchId = b.id;
    const classId = b.classId || (b as any).class || (b as any).classDocId || '';

    const hasSubjectAsg = Array.isArray(teacher.subjectAssignments) && teacher.subjectAssignments.length > 0;

    // 1. Check subjectAssignments
    if (hasSubjectAsg) {
      const matchAsg = teacher.subjectAssignments.some((asg: any) => {
        const matchBatch = asg.batchId && asg.batchId === batchId;
        const matchClass = asg.classId && classId && asg.classId === classId;
        return matchBatch || matchClass;
      });
      if (matchAsg) return true;
    }

    // 2. Check classId, classIds, batchId, batchIds on teacher
    const assignedClassIds = [
      ...(teacher.classIds || []),
      ...(teacher.classId ? [teacher.classId] : []),
      ...(teacher.class ? [teacher.class] : [])
    ].filter(Boolean);
    const assignedBatchIds = [
      ...(teacher.batchIds || []),
      ...(teacher.batchId ? [teacher.batchId] : []),
      ...(teacher.batch ? [teacher.batch] : [])
    ].filter(Boolean);

    const hasExplicitClasses = assignedClassIds.length > 0 || assignedBatchIds.length > 0;

    if (assignedBatchIds.includes(batchId) || (classId && assignedClassIds.includes(classId))) {
      return true;
    }

    // 3. Check if teacher is class teacher of this class/batch
    if (b.classTeacherId && (b.classTeacherId === teacher.uid || b.classTeacherId === teacher.id)) return true;

    // 4. Check existing timetable slots for this teacher in batchId
    const teacherUids = [teacher.uid, teacher.id, (teacher as any).docId].filter(Boolean);
    const hasTimetableSlot = timetables.some(tt => 
      tt.batchId === batchId && 
      tt.periods.some(p => teacherUids.includes(p.teacherId))
    );
    if (hasTimetableSlot) return true;

    // If teacher has explicit subjectAssignments or assigned classIds/batchIds, do not fall through to all batches
    if (hasSubjectAsg || hasExplicitClasses) {
      return false;
    }

    // 5. Check overlapping subjects for general unassigned teachers
    if (Array.isArray(teacher.subjects) && teacher.subjects.length > 0) {
      const batchSubIds = b.subjectIds || [];
      if (batchSubIds.length > 0) {
        const hasOverlap = teacher.subjects.some((ts: string) => {
          return batchSubIds.some((bs: string) => {
            if (ts === bs) return true;
            const sub1 = subjects.find(s => s.id === ts || s.name === ts || s.code === ts);
            const sub2 = subjects.find(s => s.id === bs || s.name === bs || s.code === bs);
            return sub1 && sub2 && sub1.id === sub2.id;
          });
        });
        if (hasOverlap) return true;
      }
    }

    return false;
  };

  const teacherHandlesSubject = (teacher: any, s: any, targetBatchId?: string) => {
    if (!teacher || !s) return false;
    const subId = s.id;
    const subName = s.name;
    const subCode = s.code;

    const matchesSubString = (candidate: string) => {
      if (!candidate) return false;
      if (candidate === subId || candidate === subName || candidate === subCode) return true;
      const candLower = candidate.toLowerCase();
      const subNameLower = (subName || '').toLowerCase();
      return candLower === subNameLower || candLower.includes(subNameLower) || subNameLower.includes(candLower);
    };

    // 1. Check teacher.subjectAssignments
    if (Array.isArray(teacher.subjectAssignments) && teacher.subjectAssignments.length > 0) {
      const matchAsg = teacher.subjectAssignments.some((asg: any) => {
        const subMatch = matchesSubString(asg.subjectId) || matchesSubString(asg.subjectName);
        if (!subMatch) return false;
        if (targetBatchId) {
          const batchObj = batches.find(b => b.id === targetBatchId);
          const classMatch = !asg.classId || !batchObj || asg.classId === batchObj.classId;
          const batchMatch = !asg.batchId || asg.batchId === targetBatchId;
          return classMatch && batchMatch;
        }
        return true;
      });
      if (matchAsg) return true;
    }

    // 2. Check teacher.subjects list
    if (Array.isArray(teacher.subjects) && teacher.subjects.length > 0) {
      if (teacher.subjects.some((ts: string) => matchesSubString(ts))) {
        return true;
      }
    }

    // 3. Check isTeacherHandling
    const targetBatch = targetBatchId ? batches.find(b => b.id === targetBatchId) : null;
    if (isTeacherHandling(teacher, targetBatch?.classId || '', targetBatchId || '', subId) ||
        isTeacherHandling(teacher, targetBatch?.classId || '', targetBatchId || '', subName)) {
      return true;
    }

    // 4. Check existing timetable slots
    const teacherUids = [teacher.uid, teacher.id, (teacher as any).docId].filter(Boolean);
    const hasTimetableSlot = timetables.some(tt => 
      (!targetBatchId || tt.batchId === targetBatchId) && 
      tt.periods.some(p => 
        teacherUids.includes(p.teacherId) && 
        (p.subjectId === subId || p.subjectId === subName || p.subjectId === subCode)
      )
    );
    if (hasTimetableSlot) return true;

    return false;
  };

  const renderManualEditModal = () => {
    const currentTeacherObj = teachers.find(t => 
      t.uid === editTeacherId || t.id === editTeacherId || t.docId === editTeacherId
    );

    // Filter Batches according to selected teacher (if selected)
    let availableBatches = batches;
    if (currentTeacherObj) {
      const teacherBatches = batches.filter(b => teacherHandlesBatch(currentTeacherObj, b));
      if (teacherBatches.length > 0) {
        availableBatches = teacherBatches;
      }
    }

    const selectedBatch = availableBatches.find(b => b.id === selectedEditBatchId) || batches.find(b => b.id === selectedEditBatchId);
    const selectedClass = selectedBatch ? classes.find(c => c.id === selectedBatch.classId) : null;
    const selectedClassBatchName = selectedBatch
      ? (selectedClass ? `${selectedClass.name} - ${selectedBatch.name}` : selectedBatch.name)
      : 'Unselected Class';

    // Filter Subjects according to selected Class / Batch AND selected Teacher
    let batchSubjects = subjects;
    if (selectedBatch) {
      const batchSubIds = selectedBatch.subjectIds || [];
      if (batchSubIds.length > 0) {
        const matching = subjects.filter(s => 
          batchSubIds.some((idOrName: string) => idOrName === s.id || idOrName === s.name || idOrName === s.code)
        );
        if (matching.length > 0) {
          batchSubjects = matching;
        }
      }
    }

    let availableSubjects = batchSubjects;
    if (currentTeacherObj) {
      const teacherSubjects = batchSubjects.filter(s => teacherHandlesSubject(currentTeacherObj, s, selectedBatch?.id));
      if (teacherSubjects.length > 0) {
        availableSubjects = teacherSubjects;
      }
    }

    // Build teacher list for the dropdown
    const availableStaffList = teachers.map(teacher => {
      const teacherUid = teacher.uid || teacher.id;
      const otherBusy = timetables
        .filter(tt => tt.day === selectedEditDay && tt.batchId !== selectedEditBatchId)
        .some(tt => tt.periods.some(p => p.label === selectedEditSlotLabel && (p.teacherId === teacherUid || p.teacherId === teacher.id || p.teacherId === teacher.uid)));
      
      const matchesClassAndBatch = selectedBatch ? isTeacherHandling(teacher, selectedBatch.classId || '', selectedEditBatchId) : false;
      const matchesSubject = selectedBatch && editSubjectId ? isTeacherHandling(teacher, selectedBatch.classId || '', selectedEditBatchId, editSubjectId) : false;
      
      const selectedSub = editSubjectId ? subjects.find(s => s.id === editSubjectId || s.name === editSubjectId || s.code === editSubjectId) : null;
      const teacherSubs = teacher.subjects || [];
      const teachesSubjectInGeneral = selectedSub ? teacherSubs.some((ts: string) => {
        if (ts === editSubjectId || ts === selectedSub.id || ts === selectedSub.name || ts === selectedSub.code) return true;
        const subNameLower = selectedSub.name.toLowerCase();
        const tsLower = ts.toLowerCase();
        return tsLower.includes(subNameLower) || subNameLower.includes(tsLower);
      }) : false;

      let score = 0;
      if (matchesSubject) {
        score = 3;
      } else if (teachesSubjectInGeneral && matchesClassAndBatch) {
        score = 2;
      } else if (teachesSubjectInGeneral) {
        score = 1;
      } else if (matchesClassAndBatch) {
        score = 0.5;
      }

      return {
        ...teacher,
        uid: teacherUid,
        busy: otherBusy,
        score
      };
    });

    availableStaffList.sort((a, b) => {
      if (a.busy && !b.busy) return 1;
      if (!a.busy && b.busy) return -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });

    return (
      <AnimatePresence>
        {showManualEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl p-6 w-full max-w-md space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Manual Assignment Matrix</span>
                  <h3 className="text-xl font-black text-sidebar tracking-tight mt-1">Assign Class Period</h3>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mt-1">
                    {selectedClassBatchName} — {selectedEditDay} — {selectedEditSlotLabel}
                  </p>
                </div>
                <button
                  onClick={() => setShowManualEditModal(false)}
                  className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4 text-neutral-500" />
                </button>
              </div>

              <div className="space-y-4">
                {looseAccess && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Class / Batch</label>
                    <select
                      value={selectedEditBatchId}
                      onChange={(e) => {
                        const newBatchId = e.target.value;
                        setSelectedEditBatchId(newBatchId);

                        if (currentTeacherObj) {
                          const targetBatch = batches.find(b => b.id === newBatchId);
                          let nextBatchSubs = subjects;
                          if (targetBatch && targetBatch.subjectIds && targetBatch.subjectIds.length > 0) {
                            const matching = subjects.filter(s => targetBatch.subjectIds.some((idOrName: string) => idOrName === s.id || idOrName === s.name || idOrName === s.code));
                            if (matching.length > 0) nextBatchSubs = matching;
                          }

                          const nextTeacherSubs = nextBatchSubs.filter(s => teacherHandlesSubject(currentTeacherObj, s, newBatchId));
                          if (nextTeacherSubs.length > 0 && !nextTeacherSubs.some(s => s.id === editSubjectId)) {
                            setEditSubjectId(nextTeacherSubs[0].id);
                          }
                        }
                      }}
                      className="w-full bg-neutral-50 text-xs font-black p-3.5 rounded-2xl border border-neutral-200 outline-none uppercase text-sidebar cursor-pointer"
                    >
                      <option value="">-- Choose Class Batch --</option>
                      {availableBatches.map(b => {
                        const cls = classes.find(c => c.id === b.classId);
                        const displayName = cls ? `${cls.name} - ${b.name}` : b.name;
                        return (
                          <option key={b.id} value={b.id}>{displayName}</option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Academic Subject</label>
                  <select
                    value={editSubjectId}
                    onChange={(e) => {
                      setEditSubjectId(e.target.value);
                    }}
                    className="w-full bg-neutral-50 text-xs font-black p-3.5 rounded-2xl border border-neutral-200 outline-none uppercase text-sidebar cursor-pointer"
                  >
                    <option value="">-- Choose Subject --</option>
                    {availableSubjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Assigned Faculty Staff</label>
                  <select
                    value={editTeacherId}
                    onChange={(e) => {
                      const newTeacherId = e.target.value;
                      setEditTeacherId(newTeacherId);

                      const newTeacher = teachers.find(t => t.uid === newTeacherId || t.id === newTeacherId || t.docId === newTeacherId);
                      if (newTeacher) {
                        const newTeacherBatches = batches.filter(b => teacherHandlesBatch(newTeacher, b));
                        let newBatchId = selectedEditBatchId;
                        if (newTeacherBatches.length > 0 && !newTeacherBatches.some(b => b.id === selectedEditBatchId)) {
                          newBatchId = newTeacherBatches[0].id;
                          setSelectedEditBatchId(newBatchId);
                        }

                        const targetBatch = batches.find(b => b.id === newBatchId);
                        let nextBatchSubs = subjects;
                        if (targetBatch && targetBatch.subjectIds && targetBatch.subjectIds.length > 0) {
                          const matching = subjects.filter(s => targetBatch.subjectIds.some((idOrName: string) => idOrName === s.id || idOrName === s.name || idOrName === s.code));
                          if (matching.length > 0) nextBatchSubs = matching;
                        }

                        const nextTeacherSubs = nextBatchSubs.filter(s => teacherHandlesSubject(newTeacher, s, newBatchId));
                        if (nextTeacherSubs.length > 0 && !nextTeacherSubs.some(s => s.id === editSubjectId)) {
                          setEditSubjectId(nextTeacherSubs[0].id);
                        }
                      }
                    }}
                    className="w-full bg-neutral-50 text-xs font-black p-3.5 rounded-2xl border border-neutral-200 outline-none uppercase text-sidebar cursor-pointer"
                  >
                    <option value="">-- Choose Teacher --</option>
                    {availableStaffList.map(t => {
                      let badge = '';
                      if (t.busy) {
                        badge = ' ⚠️ Busy elsewhere';
                      } else if (t.score === 3) {
                        badge = ' ⭐ Primary Assigned Teacher';
                      } else if (t.score === 2) {
                        badge = ' 📚 Subject & Class Teacher';
                      } else if (t.score === 1) {
                        badge = ' 📖 Subject Teacher';
                      } else if (t.score === 0.5) {
                        badge = ' 🏫 Class/Batch Faculty';
                      }

                      return (
                        <option key={t.uid} value={t.uid} disabled={t.busy}>
                          {t.name}{badge}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowManualEditModal(false)}
                  className="flex-1 py-3 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-2xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await handleSavePeriod(selectedEditDay, selectedEditSlotLabel, editSubjectId, editTeacherId, false, selectedEditBatchId);
                    setShowManualEditModal(false);
                  }}
                  className="flex-1 py-3 bg-primary hover:bg-sidebar text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  Save Period
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const renderGenerationProgressModal = () => {
    return (
      <AnimatePresence>
        {isGenerating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl p-8 w-full max-w-md space-y-6 text-center animate-in zoom-in-95"
            >
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center animate-bounce">
                  <Sparkles className="w-8 h-8 text-indigo-600 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-sidebar tracking-tight">AI Timetable Generation</h3>
                  <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mt-1">Configuring Clash-Free Master Matrix</p>
                </div>
              </div>

              <div className="space-y-3 text-left bg-neutral-50 p-5 rounded-2xl border border-neutral-100 max-h-[220px] overflow-y-auto">
                {generationSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    {step.status === 'success' && (
                      <span className="text-green-500 font-bold">✓</span>
                    )}
                    {step.status === 'running' && (
                      <span className="text-indigo-600 font-bold animate-spin">⟳</span>
                    )}
                    {step.status === 'pending' && (
                      <span className="text-neutral-300 font-bold">•</span>
                    )}
                    <span className={`text-xs font-semibold ${step.status === 'running' ? 'text-indigo-600 font-extrabold' : step.status === 'success' ? 'text-neutral-700' : 'text-neutral-400'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest animate-pulse">
                Please do not close this window
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const renderSchedulerSettingsModal = () => {
    const getRuleText = (rule: any) => {
      const teach = teachers.find(t => t.uid === rule.teacherId)?.name || '(select teacher)';
      
      let classesText = '';
      if (rule.batchIds && Array.isArray(rule.batchIds)) {
        if (rule.batchIds.length === 0 || rule.batchIds.includes('all')) {
          classesText = 'All Classes';
        } else {
          classesText = rule.batchIds.map((id: string) => {
            const b = batches.find(x => x.id === id);
            if (!b) return '';
            const cls = classes.find(c => c.id === b.classId);
            return cls ? `${cls.name} - ${b.name}` : b.name;
          }).filter(Boolean).join(', ');
        }
      } else if (rule.batchId && rule.batchId !== 'all') {
        const b = batches.find(x => x.id === rule.batchId);
        if (b) {
          const cls = classes.find(c => c.id === b.classId);
          classesText = cls ? `${cls.name} - ${b.name}` : b.name;
        } else {
          classesText = '';
        }
      }

      let subjectsText = '';
      if (rule.subjectIds && Array.isArray(rule.subjectIds)) {
        if (rule.subjectIds.includes('all') || rule.subjectIds.length === 0) {
          subjectsText = 'All Subjects';
        } else {
          subjectsText = rule.subjectIds.map((id: string) => subjects.find(s => s.id === id)?.name || id).join(', ');
        }
      } else {
        if (rule.subjectId === 'all' || !rule.subjectId) {
          subjectsText = 'All Subjects';
        } else {
          subjectsText = subjects.find(s => s.id === rule.subjectId)?.name || '(select subject)';
        }
      }

      let daysText = '';
      if (rule.days && Array.isArray(rule.days)) {
        daysText = rule.days.join(', ');
      } else {
        daysText = rule.day || 'Monday';
      }

      const clsDisplay = classesText && classesText !== 'All Classes' ? ` (restricted to Classes: "${classesText}")` : '';

      switch (rule.type) {
        case 'teacher_unavailable':
          const periodDisplay = rule.slotLabel === 'All Periods' ? 'All Periods (Whole Day)' : rule.slotLabel;
          return `Teacher "${teach}" is unavailable on ${daysText} at ${periodDisplay}${clsDisplay}`;
        case 'subject_limit':
          return `Limit "${subjectsText}" to maximum of ${rule.limitValue || 1} period(s) per day per class${clsDisplay}`;
        case 'subject_weekly_limit':
          return `Limit "${subjectsText}" to maximum of ${rule.limitValue || 2} period(s) per week per class${clsDisplay}`;
        case 'fixed_slot':
          return `Lock class "${classesText}" to have "${subjectsText}" on ${daysText} at ${rule.slotLabel}`;
        case 'subject_range':
          return `Schedule "${subjectsText}" preferentially in the ${rule.timeRange || 'morning'} sessions${clsDisplay}`;
        case 'class_teacher_last_periods':
          return `Assign last ${rule.limitValue || 1} period(s) exclusively to Class Teacher${clsDisplay}`;
        case 'continuous_double_periods':
          return `Schedule "${subjectsText}" continuously for two periods${clsDisplay}`;
        case 'daily_same_period_subject':
          return `Daily Same Period Same Subject: Schedule "${subjectsText}" at ${rule.slotLabel} every day${clsDisplay}`;
        case 'custom_text':
          return rule.text || 'Custom school rule';
        default:
          return 'Custom school rule';
      }
    };

    const cleanSlots = periodSlots.filter(s => !s.isBreak);

    return (
      <AnimatePresence>
        {showSchedulerSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl p-8 w-full max-w-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start pb-4 border-b border-neutral-100">
                <div>
                  <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Configure School Rules</span>
                  <h3 className="text-xl font-black text-sidebar tracking-tight mt-1">AI Auto-Scheduler Rulebook</h3>
                  <p className="text-xs font-bold text-neutral-400 mt-1">
                    Set up constraint rules & custom priorities for automatic timetable generation.
                  </p>
                </div>
                <button
                  onClick={() => setShowSchedulerSettings(false)}
                  className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 text-neutral-500" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex bg-neutral-100 p-1.5 rounded-2xl border border-neutral-200/50 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveSettingsTab('standard')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                    activeSettingsTab === 'standard'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700 cursor-pointer'
                  }`}
                >
                  Constraints
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSettingsTab('subjects')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                    activeSettingsTab === 'subjects'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700 cursor-pointer'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                  Subject Targets
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSettingsTab('custom')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                    activeSettingsTab === 'custom'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700 cursor-pointer'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Custom Rules ({getFilteredCustomRules().length})
                </button>
              </div>

              {activeSettingsTab === 'standard' && (
                <div className="space-y-5">
                  {/* Rule 1 */}
                  <div className="flex items-start justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100/80">
                    <div className="space-y-0.5 max-w-[80%]">
                      <p className="text-xs font-black text-sidebar">Class Teacher Priority (First Period)</p>
                      <p className="text-[10px] text-neutral-400 font-bold leading-relaxed">
                        Respective class teachers are assigned to the first period slot of the day for attendance roll call and morning briefing.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={schedulerConfig.firstPeriodClassTeacher}
                      onChange={(e) => setSchedulerConfig(prev => ({ ...prev, firstPeriodClassTeacher: e.target.checked }))}
                      className="w-5 h-5 accent-indigo-600 rounded-lg cursor-pointer mt-1"
                    />
                  </div>

                  {/* Rule 2 */}
                  <div className="flex items-start justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100/80">
                    <div className="space-y-0.5 max-w-[80%]">
                      <p className="text-xs font-black text-sidebar">Prevent Consecutive Same Subject</p>
                      <p className="text-[10px] text-neutral-400 font-bold leading-relaxed">
                        Avoid scheduling the exact same academic subject in back-to-back periods within any single class.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={schedulerConfig.preventConsecutiveSameSubject}
                      onChange={(e) => setSchedulerConfig(prev => ({ ...prev, preventConsecutiveSameSubject: e.target.checked }))}
                      className="w-5 h-5 accent-indigo-600 rounded-lg cursor-pointer mt-1"
                    />
                  </div>

                  {/* Rule 3 */}
                  <div className="flex items-start justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100/80">
                    <div className="space-y-0.5 max-w-[80%] font-bold">
                      <p className="text-xs font-black text-sidebar">Morning Core Subjects Bias</p>
                      <p className="text-[10px] text-neutral-400 font-bold leading-relaxed">
                        Prioritize complex subjects (Mathematics, Physics, Chemistry, English, Science) in early morning slots when focus is highest, leaving arts & physical education for afternoon periods.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={schedulerConfig.coreSubjectsEarly}
                      onChange={(e) => setSchedulerConfig(prev => ({ ...prev, coreSubjectsEarly: e.target.checked }))}
                      className="w-5 h-5 accent-indigo-600 rounded-lg cursor-pointer mt-1"
                    />
                  </div>

                  {/* Rule 4 */}
                  <div className="flex items-start justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100/80">
                    <div className="space-y-0.5 max-w-[80%]">
                      <p className="text-xs font-black text-sidebar">Even Weekly Workload Balance</p>
                      <p className="text-[10px] text-neutral-400 font-bold leading-relaxed">
                        Distribute subject hours evenly throughout the week to maintain a balanced academic progression.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={schedulerConfig.evenWorkloadDistribution}
                      onChange={(e) => setSchedulerConfig(prev => ({ ...prev, evenWorkloadDistribution: e.target.checked }))}
                      className="w-5 h-5 accent-indigo-600 rounded-lg cursor-pointer mt-1"
                    />
                  </div>

                  {/* Slider 1: Max Consecutive Periods per Teacher */}
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100/80 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-black text-sidebar">Max Consecutive Teaching Periods</p>
                      <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                        {schedulerConfig.maxConsecutivePeriodsPerTeacher} Periods
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400 font-bold leading-relaxed mb-1">
                      Ensures a teaching staff member gets a break or free slot after teaching multiple slots consecutively to prevent fatigue.
                    </p>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={schedulerConfig.maxConsecutivePeriodsPerTeacher}
                      onChange={(e) => setSchedulerConfig(prev => ({ ...prev, maxConsecutivePeriodsPerTeacher: parseInt(e.target.value) }))}
                      className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* Slider 2: Max Daily periods per Teacher */}
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100/80 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-black text-sidebar">Max Daily Teaching Load</p>
                      <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                        {schedulerConfig.maxPeriodsPerDayPerTeacher} Periods
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400 font-bold leading-relaxed mb-1">
                      Capping maximum slots a teacher can teach in a single day across all classes (unless overridden specifically by their profile).
                    </p>
                    <input
                      type="range"
                      min="2"
                      max="8"
                      value={schedulerConfig.maxPeriodsPerDayPerTeacher}
                      onChange={(e) => setSchedulerConfig(prev => ({ ...prev, maxPeriodsPerDayPerTeacher: parseInt(e.target.value) }))}
                      className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>
              )}

              {activeSettingsTab === 'subjects' && (
                <div className="space-y-4">
                  <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 space-y-1">
                    <h4 className="text-xs font-black text-sidebar uppercase tracking-wide flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                      Weekly Target Periods per Subject
                    </h4>
                    <p className="text-[10px] text-neutral-400 font-bold leading-relaxed">
                      Set global default targets and specific class/batch overrides for each subject. The AI auto-scheduler will prioritize allocating exactly these target counts of periods per week.
                    </p>
                  </div>
                  
                  <div className="space-y-3.5 max-h-[45vh] overflow-y-auto pr-1">
                    {subjects.length === 0 ? (
                      <p className="text-xs font-bold text-neutral-400 py-4 text-center">No subjects registered yet. Please add subjects first.</p>
                    ) : (
                      subjects.map((sub) => {
                        const currentTarget = schedulerConfig.subjectRequiredPeriods?.[sub.id] !== undefined
                          ? schedulerConfig.subjectRequiredPeriods[sub.id]
                          : 5;
                        return (
                          <div key={sub.id} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100/80 space-y-3">
                            {/* Header row: Subject Name, Code and its Global default slider */}
                            <div className="flex items-center justify-between gap-4">
                              <div className="space-y-0.5">
                                <p className="text-xs font-black text-sidebar flex items-center gap-2">
                                  {sub.name}
                                  <span className="text-[9px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                                    {sub.code || 'N/A'}
                                  </span>
                                </p>
                                <p className="text-[9px] font-bold text-neutral-400 capitalize">{sub.type} Subject • Global Default</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min="0"
                                  max="12"
                                  value={currentTarget}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setSchedulerConfig(prev => ({
                                      ...prev,
                                      subjectRequiredPeriods: {
                                        ...(prev.subjectRequiredPeriods || {}),
                                        [sub.id]: val
                                      }
                                    }));
                                  }}
                                  className="w-24 sm:w-32 h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 min-w-[50px] text-center">
                                  {currentTarget} Periods
                                </span>
                              </div>
                            </div>

                            {/* Overrides list and builder */}
                            <div className="pt-2.5 border-t border-neutral-200/50 space-y-2">
                              {/* Header of overrides */}
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black uppercase text-neutral-400 tracking-wider">Class & Batch Specific Overrides</span>
                                {addingOverrideSubId !== sub.id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddingOverrideSubId(sub.id);
                                      setOverrideBatchIds([]);
                                      setBatchSearchQuery('');
                                      setOverrideTargetVal(5);
                                    }}
                                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                    Add Class/Batch override
                                  </button>
                                ) : null}
                              </div>

                              {/* Dynamic list of overrides for this subject */}
                              {(() => {
                                const overrideKeys = Object.keys(schedulerConfig.subjectRequiredPeriods || {}).filter(
                                  k => k.startsWith(`${sub.id}_`)
                                );

                                return (
                                  <div className="space-y-1.5">
                                    {overrideKeys.map(key => {
                                      const batchId = key.split('_')[1];
                                      const targetVal = schedulerConfig.subjectRequiredPeriods[key];
                                      const batchName = getBatchFullName(batchId);
                                      
                                      return (
                                        <div key={key} className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-lg border border-neutral-200/40 text-[11px] font-bold text-neutral-600">
                                          <span>{batchName}: <strong className="text-indigo-600">{targetVal} Periods</strong></span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSchedulerConfig(prev => {
                                                const updated = { ...(prev.subjectRequiredPeriods || {}) };
                                                delete updated[key];
                                                return {
                                                  ...prev,
                                                  subjectRequiredPeriods: updated
                                                };
                                              });
                                            }}
                                            className="p-1 hover:bg-rose-50 text-neutral-400 hover:text-rose-500 rounded transition-colors cursor-pointer"
                                            title="Remove override"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      );
                                    })}

                                    {overrideKeys.length === 0 && addingOverrideSubId !== sub.id && (
                                      <p className="text-[9px] font-bold text-neutral-400 italic">No class or batch specific target set. Falls back to global default.</p>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Inline builder if adding for this subject */}
                              {addingOverrideSubId === sub.id && (
                                <div className="p-3 bg-neutral-100 rounded-xl space-y-3 border border-neutral-200">
                                  <div className="grid grid-cols-1 gap-2.5">
                                    <div>
                                      <div className="flex justify-between items-center mb-1">
                                        <label className="block text-[8px] font-black uppercase text-neutral-400">Select Classes & Batches ({overrideBatchIds.length} Selected)</label>
                                        <div className="flex gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const allIds = batches.map(b => b.id);
                                              setOverrideBatchIds(allIds);
                                            }}
                                            className="text-[8px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800"
                                          >
                                            All
                                          </button>
                                          <span className="text-neutral-300 text-[8px] font-bold">|</span>
                                          <button
                                            type="button"
                                            onClick={() => setOverrideBatchIds([])}
                                            className="text-[8px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-700"
                                          >
                                            None
                                          </button>
                                        </div>
                                      </div>

                                      {/* Search Box */}
                                      <input
                                        type="text"
                                        placeholder="Filter classes & batches..."
                                        value={batchSearchQuery}
                                        onChange={(e) => setBatchSearchQuery(e.target.value)}
                                        className="w-full bg-white p-1.5 border border-neutral-200 rounded-lg text-xs font-semibold text-sidebar mb-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                      />

                                      {/* Grouped Checkbox List */}
                                      <div className="max-h-[140px] overflow-y-auto border border-neutral-200/50 rounded-xl p-2 bg-white space-y-1">
                                        {(() => {
                                          const filtered = batches.filter(b => {
                                            if (!batchSearchQuery) return true;
                                            return getBatchFullName(b.id).toLowerCase().includes(batchSearchQuery.toLowerCase());
                                          });

                                          if (filtered.length === 0) {
                                            return <p className="text-[10px] font-bold text-neutral-400 py-1 text-center">No matching classes/batches found</p>;
                                          }

                                          return filtered.map(b => {
                                            const isChecked = overrideBatchIds.includes(b.id);
                                            return (
                                              <label key={b.id} className="flex items-center gap-2 px-1.5 py-1 hover:bg-neutral-50 rounded-lg cursor-pointer text-xs font-bold text-neutral-700 transition-colors">
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={() => {
                                                    if (isChecked) {
                                                      setOverrideBatchIds(prev => prev.filter(id => id !== b.id));
                                                    } else {
                                                      setOverrideBatchIds(prev => [...prev, b.id]);
                                                    }
                                                  }}
                                                  className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                                />
                                                <span className="truncate">{getBatchFullName(b.id)}</span>
                                              </label>
                                            );
                                          });
                                        })()}
                                      </div>
                                    </div>

                                    <div className="space-y-1 pt-1">
                                      <div className="flex justify-between items-center text-[8px] font-black uppercase text-neutral-400">
                                        <span>Target Periods per Week</span>
                                        <span className="text-indigo-600 font-bold">{overrideTargetVal} periods/week</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0"
                                        max="12"
                                        value={overrideTargetVal}
                                        onChange={(e) => setOverrideTargetVal(parseInt(e.target.value))}
                                        className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex justify-between items-center pt-1 border-t border-neutral-200/50">
                                    <p className="text-[8px] font-bold text-neutral-400 italic">Builder stays open for multi-time override setups</p>
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAddingOverrideSubId(null);
                                          setOverrideBatchIds([]);
                                          setBatchSearchQuery('');
                                        }}
                                        className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-500 hover:bg-neutral-200 rounded-lg cursor-pointer transition-colors"
                                      >
                                        Done
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (overrideBatchIds.length === 0) {
                                            toast.error('Please select at least one class and batch');
                                            return;
                                          }
                                          setSchedulerConfig(prev => {
                                            const updated = { ...(prev.subjectRequiredPeriods || {}) };
                                            overrideBatchIds.forEach(batchId => {
                                              updated[`${sub.id}_${batchId}`] = overrideTargetVal;
                                            });
                                            return {
                                              ...prev,
                                              subjectRequiredPeriods: updated
                                            };
                                          });
                                          setOverrideBatchIds([]); // clear selection for subsequent adds
                                          toast.success(`Configured target to ${overrideTargetVal} periods for ${overrideBatchIds.length} batch(es)! You can add more overrides.`);
                                        }}
                                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-colors"
                                      >
                                        Apply Override
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {activeSettingsTab === 'custom' && (
                <div className="space-y-6">
                  {/* AI Natural Language Rule Assistant */}
                  <div className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50/80 rounded-3xl border border-indigo-100/70 space-y-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                      <p className="text-xs font-black text-indigo-950 uppercase tracking-wider">AI Custom Rule Parser</p>
                    </div>
                    <p className="text-[10px] text-neutral-500 font-bold leading-relaxed">
                      Type any custom constraint in natural language (e.g., <span className="italic text-indigo-600">"Mr. Antony is unavailable on Fridays P3"</span> or <span className="italic text-indigo-600">"Class 10A must have Mathematics on Monday P1"</span>) and let our AI instantly parse it into the auto-scheduler rule book!
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualRulePrompt}
                        onChange={(e) => setManualRulePrompt(e.target.value)}
                        placeholder="Type rule here (e.g. Limit English to 1 period on Tuesdays)..."
                        disabled={isParsingRule}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleParseManualRule();
                          }
                        }}
                        className="flex-1 p-3.5 bg-white border border-neutral-200 rounded-2xl text-xs font-semibold text-sidebar placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                      <button
                        onClick={handleParseManualRule}
                        disabled={isParsingRule}
                        className="px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 active:scale-[0.98] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm min-w-[120px] justify-center"
                      >
                        {isParsingRule ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Parsing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Add Rule</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Rule Builder Section */}
                  <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100/60 space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <p className="text-xs font-black text-indigo-900 uppercase tracking-wider">Dynamic Rule Builder</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Constraint Type</label>
                        <select
                          value={newRuleType}
                          onChange={(e) => setNewRuleType(e.target.value as any)}
                          className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="teacher_unavailable">Teacher Off / Unavailability period</option>
                          <option value="subject_limit">Subject daily limit count</option>
                          <option value="subject_weekly_limit">Subject weekly limit count (e.g. max 2 periods a week)</option>
                          <option value="fixed_slot">Fixed Activity Slot (e.g. Games, assembly)</option>
                          <option value="subject_range">Subject time-range preference (Morning/Afternoon)</option>
                          <option value="class_teacher_last_periods">Assign last period(s) to Class Teacher only</option>
                          <option value="continuous_double_periods">Assign particular subject continuously for two periods</option>
                          <option value="daily_same_period_subject">Daily Same Period Same Subject (same period every day)</option>
                        </select>
                      </div>

                      {/* Dynamic Parameters block based on Type */}
                      {newRuleType === 'teacher_unavailable' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Teacher</label>
                            <select
                              value={newRuleTeacherId}
                              onChange={(e) => setNewRuleTeacherId(e.target.value)}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Choose Teacher --</option>
                              {teachers.map(t => (
                                <option key={t.uid} value={t.uid}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Period Slot</label>
                            <select
                              value={newRuleSlotLabel}
                              onChange={(e) => setNewRuleSlotLabel(e.target.value)}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar"
                            >
                              <option value="All Periods">All Periods (Whole Day)</option>
                              {cleanSlots.map(s => (
                                <option key={s.label} value={s.label}>{s.label} ({s.start}-{s.end})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Weekday(s)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleDays(DAYS)} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleDays([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleDays.includes(val)) {
                                  setNewRuleDays([...newRuleDays, val]);
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Weekday... --</option>
                              {DAYS.filter(d => !newRuleDays.includes(d)).map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            {newRuleDays.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl">
                                {newRuleDays.map(d => (
                                  <span
                                    key={d}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                  >
                                    {d}
                                    <button
                                      type="button"
                                      onClick={() => setNewRuleDays(newRuleDays.filter(day => day !== d))}
                                      className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                    >
                                      &times;
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {newRuleType === 'subject_limit' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Max Periods per Day</label>
                            <input
                              type="number"
                              min="1"
                              max="4"
                              value={newRuleLimitValue}
                              onChange={(e) => setNewRuleLimitValue(parseInt(e.target.value) || 1)}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar"
                            />
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Subject(s)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleSubjectIds(subjects.map(s => s.id))} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleSubjectIds([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleSubjectIds.includes(val)) {
                                  setNewRuleSubjectIds([...newRuleSubjectIds, val]);
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Subject... --</option>
                              {subjects.filter(s => !newRuleSubjectIds.includes(s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            {newRuleSubjectIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                                {newRuleSubjectIds.map(id => {
                                  const sub = subjects.find(s => s.id === id);
                                  return (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                    >
                                      {sub ? sub.name : id}
                                      <button
                                        type="button"
                                        onClick={() => setNewRuleSubjectIds(newRuleSubjectIds.filter(x => x !== id))}
                                        className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {newRuleType === 'fixed_slot' && (
                        <>
                          <div className="space-y-1 col-span-1 md:col-span-2">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Period Slot</label>
                            <select
                              value={newRuleSlotLabel}
                              onChange={(e) => setNewRuleSlotLabel(e.target.value)}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar"
                            >
                              {cleanSlots.map(s => (
                                <option key={s.label} value={s.label}>{s.label} ({s.start}-{s.end})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Class / Batch (Multi-select)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleBatchIds(batches.map(b => b.id))} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleBatchIds([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleBatchIds.includes(val)) {
                                  setNewRuleBatchIds([...newRuleBatchIds, val]);
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Class / Batch... --</option>
                              {batches.filter(b => !newRuleBatchIds.includes(b.id)).map(b => {
                                const cls = classes.find(c => c.id === b.classId);
                                const displayName = cls ? `${cls.name} - ${b.name}` : b.name;
                                return (
                                  <option key={b.id} value={b.id}>{displayName}</option>
                                );
                              })}
                            </select>
                            {newRuleBatchIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                                {newRuleBatchIds.map(id => {
                                  const b = batches.find(x => x.id === id);
                                  const cls = b ? classes.find(c => c.id === b.classId) : null;
                                  const displayName = b ? (cls ? `${cls.name} - ${b.name}` : b.name) : id;
                                  return (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                    >
                                      {displayName}
                                      <button
                                        type="button"
                                        onClick={() => setNewRuleBatchIds(newRuleBatchIds.filter(x => x !== id))}
                                        className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Subject(s)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleSubjectIds(subjects.map(s => s.id))} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleSubjectIds([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleSubjectIds.includes(val)) {
                                  setNewRuleSubjectIds([...newRuleSubjectIds, val]);
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Subject... --</option>
                              {subjects.filter(s => !newRuleSubjectIds.includes(s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            {newRuleSubjectIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                                {newRuleSubjectIds.map(id => {
                                  const sub = subjects.find(s => s.id === id);
                                  return (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                    >
                                      {sub ? sub.name : id}
                                      <button
                                        type="button"
                                        onClick={() => setNewRuleSubjectIds(newRuleSubjectIds.filter(x => x !== id))}
                                        className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Weekday(s)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleDays(DAYS)} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleDays([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleDays.includes(val)) {
                                  setNewRuleDays([...newRuleDays, val]);
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Weekday... --</option>
                              {DAYS.filter(d => !newRuleDays.includes(d)).map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            {newRuleDays.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl">
                                {newRuleDays.map(d => (
                                  <span
                                    key={d}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                  >
                                    {d}
                                    <button
                                      type="button"
                                      onClick={() => setNewRuleDays(newRuleDays.filter(day => day !== d))}
                                      className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                    >
                                      &times;
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {newRuleType === 'subject_range' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Session Bias</label>
                            <select
                              value={newRuleTimeRange}
                              onChange={(e) => setNewRuleTimeRange(e.target.value as any)}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar"
                            >
                              <option value="morning">Morning (P1 - P3/P4)</option>
                              <option value="afternoon">Afternoon (P4/P5+)</option>
                            </select>
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Subject(s)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleSubjectIds(subjects.map(s => s.id))} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleSubjectIds([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleSubjectIds.includes(val)) {
                                  setNewRuleSubjectIds([...newRuleSubjectIds, val]);
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Subject... --</option>
                              {subjects.filter(s => !newRuleSubjectIds.includes(s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            {newRuleSubjectIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                                {newRuleSubjectIds.map(id => {
                                  const sub = subjects.find(s => s.id === id);
                                  return (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                    >
                                      {sub ? sub.name : id}
                                      <button
                                        type="button"
                                        onClick={() => setNewRuleSubjectIds(newRuleSubjectIds.filter(x => x !== id))}
                                        className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {newRuleType === 'subject_weekly_limit' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Max Periods per Week</label>
                            <input
                              type="number"
                              min="1"
                              max="15"
                              value={newRuleLimitValue}
                              onChange={(e) => setNewRuleLimitValue(parseInt(e.target.value) || 2)}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar"
                            />
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Subject(s)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleSubjectIds(subjects.map(s => s.id))} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleSubjectIds([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleSubjectIds.includes(val)) {
                                  setNewRuleSubjectIds([...newRuleSubjectIds, val]);
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Subject... --</option>
                              {subjects.filter(s => !newRuleSubjectIds.includes(s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            {newRuleSubjectIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                                {newRuleSubjectIds.map(id => {
                                  const sub = subjects.find(s => s.id === id);
                                  return (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                    >
                                      {sub ? sub.name : id}
                                      <button
                                        type="button"
                                        onClick={() => setNewRuleSubjectIds(newRuleSubjectIds.filter(x => x !== id))}
                                        className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {newRuleType === 'class_teacher_last_periods' && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Number of Last Periods</label>
                          <select
                            value={newRuleLimitValue}
                            onChange={(e) => setNewRuleLimitValue(parseInt(e.target.value) || 1)}
                            className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value={1}>Last 1 Period</option>
                            <option value={2}>Last 2 Periods</option>
                          </select>
                        </div>
                      )}

                      {newRuleType === 'continuous_double_periods' && (
                        <div className="space-y-1.5 col-span-1 md:col-span-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Subject(s)</label>
                            <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                              <button type="button" onClick={() => setNewRuleSubjectIds(subjects.map(s => s.id))} className="hover:underline cursor-pointer">Select All</button>
                              <span>|</span>
                              <button type="button" onClick={() => setNewRuleSubjectIds([])} className="hover:underline cursor-pointer">Clear All</button>
                            </div>
                          </div>
                          <select
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val && !newRuleSubjectIds.includes(val)) {
                                setNewRuleSubjectIds([...newRuleSubjectIds, val]);
                              }
                            }}
                            className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- Add Subject... --</option>
                            {subjects.filter(s => !newRuleSubjectIds.includes(s.id)).map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {newRuleSubjectIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                              {newRuleSubjectIds.map(id => {
                                const sub = subjects.find(s => s.id === id);
                                return (
                                  <span
                                    key={id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                  >
                                    {sub ? sub.name : id}
                                    <button
                                      type="button"
                                      onClick={() => setNewRuleSubjectIds(newRuleSubjectIds.filter(x => x !== id))}
                                      className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                    >
                                      &times;
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {newRuleType === 'daily_same_period_subject' && (
                        <>
                          <div className="space-y-1 col-span-1 md:col-span-2">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Period Slot</label>
                            <select
                              value={newRuleSlotLabel}
                              onChange={(e) => setNewRuleSlotLabel(e.target.value)}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="All Periods">All Periods</option>
                              {cleanSlots.map(s => (
                                <option key={s.label} value={s.label}>{s.label} ({s.start}-{s.end})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5 col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Select Subject(s)</label>
                              <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                                <button type="button" onClick={() => setNewRuleSubjectIds(subjects.map(s => s.id))} className="hover:underline cursor-pointer">Select All</button>
                                <span>|</span>
                                <button type="button" onClick={() => setNewRuleSubjectIds([])} className="hover:underline cursor-pointer">Clear All</button>
                              </div>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !newRuleSubjectIds.includes(val)) {
                                  if (val === 'all') {
                                    setNewRuleSubjectIds(['all']);
                                  } else {
                                    setNewRuleSubjectIds([...newRuleSubjectIds.filter(x => x !== 'all'), val]);
                                  }
                                }
                              }}
                              className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Add Subject... --</option>
                              <option value="all">All Subjects</option>
                              {subjects.filter(s => !newRuleSubjectIds.includes(s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            {newRuleSubjectIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                                {newRuleSubjectIds.map(id => {
                                  const sub = id === 'all' ? { name: 'All Subjects' } : subjects.find(s => s.id === id);
                                  return (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                    >
                                      {sub ? sub.name : id}
                                      <button
                                        type="button"
                                        onClick={() => setNewRuleSubjectIds(newRuleSubjectIds.filter(x => x !== id))}
                                        className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Optional Target Class / Batch filter for rules that aren't fixed_slot */}
                      {newRuleType !== 'fixed_slot' && (
                        <div className="space-y-1.5 col-span-1 md:col-span-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Target Class / Batch (Optional - Multi-select)</label>
                            <div className="flex gap-2 text-[9px] font-bold text-indigo-600">
                              <button type="button" onClick={() => setNewRuleBatchIds(batches.map(b => b.id))} className="hover:underline cursor-pointer">Select All</button>
                              <span>|</span>
                              <button type="button" onClick={() => setNewRuleBatchIds([])} className="hover:underline cursor-pointer">Clear All</button>
                            </div>
                          </div>
                          <select
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val && !newRuleBatchIds.includes(val)) {
                                setNewRuleBatchIds([...newRuleBatchIds, val]);
                              }
                            }}
                            className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-sidebar focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- Add Class / Batch... --</option>
                            {batches.filter(b => !newRuleBatchIds.includes(b.id)).map(b => {
                              const cls = classes.find(c => c.id === b.classId);
                              const displayName = cls ? `${cls.name} - ${b.name}` : b.name;
                              return (
                                <option key={b.id} value={b.id}>{displayName}</option>
                              );
                            })}
                          </select>
                          {newRuleBatchIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200/60 rounded-xl max-h-36 overflow-y-auto">
                              {batches.filter(b => newRuleBatchIds.includes(b.id)).map(b => {
                                const cls = classes.find(c => c.id === b.classId);
                                const displayName = cls ? `${cls.name} - ${b.name}` : b.name;
                                return (
                                  <span
                                    key={b.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-sidebar shadow-xs"
                                  >
                                    {displayName}
                                    <button
                                      type="button"
                                      onClick={() => setNewRuleBatchIds(newRuleBatchIds.filter(id => id !== b.id))}
                                      className="text-neutral-400 hover:text-red-500 font-extrabold cursor-pointer transition-colors"
                                    >
                                      &times;
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleAddCustomRule}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Add Custom Rule
                      </button>
                    </div>
                  </div>

                  {/* List of custom constraints */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Active Rule Registry</p>
                    {getFilteredCustomRules().length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-neutral-200 rounded-2xl text-xs font-bold text-neutral-400">
                        No custom rules configured yet. Use the builder above to set school constraints!
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {getFilteredCustomRules().map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between p-3.5 bg-neutral-50 hover:bg-neutral-100/50 rounded-2xl border border-neutral-200/50 transition-colors">
                            <div className="flex items-start gap-3 max-w-[80%]">
                              <input
                                type="checkbox"
                                checked={rule.isActive}
                                onChange={() => toggleCustomRule(rule.id)}
                                className="w-4 h-4 accent-indigo-600 rounded-md cursor-pointer mt-0.5"
                              />
                              <div>
                                <p className={`text-xs font-semibold ${rule.isActive ? 'text-sidebar' : 'text-neutral-400 line-through'}`}>
                                  {getRuleText(rule)}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => deleteCustomRule(rule.id)}
                              className="p-1.5 hover:bg-rose-50 text-neutral-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4 border-t border-neutral-100">
                <button
                  onClick={() => setShowSchedulerSettings(false)}
                  className="flex-1 py-3.5 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-2xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowSchedulerSettings(false);
                    handleGenerateAutoTimetable();
                  }}
                  className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Wand2 className="w-4 h-4" />
                  Generate Timetable
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const renderClassView = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-4 bg-neutral-100/50 p-2 rounded-[1.5rem] border border-neutral-200/50">
          <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl shadow-sm border border-neutral-100">
            <Filter className="w-4 h-4 text-indigo-500" />
            <select 
              value={selectedClassId} 
              onChange={(e) => { setSelectedClassId(e.target.value); setSelectedBatchId(''); }}
              className="bg-transparent text-sm font-black text-sidebar outline-none cursor-pointer min-w-[140px]"
            >
              <option value="">Select Class</option>
              {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl shadow-sm border border-neutral-100">
            <LayoutGrid className="w-4 h-4 text-indigo-500" />
            <select 
              value={selectedBatchId} 
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="bg-transparent text-sm font-black text-sidebar outline-none cursor-pointer min-w-[140px]"
            >
              <option value="">Select Batch</option>
              {availableBatches.map(b => {
                const cls = classes.find(c => c.id === b.classId);
                const displayName = cls ? `${cls.name} - ${b.name}` : b.name;
                return <option key={b.id} value={b.id}>{displayName}</option>;
              })}
            </select>
          </div>
        </div>

        <div className="ml-auto flex gap-4">
          <div className="flex bg-neutral-100/50 p-1.5 rounded-2xl border border-neutral-200/50">
            <button 
              onClick={() => downloadPDF('class')}
              className="p-3 bg-white rounded-xl text-neutral-600 hover:text-indigo-600 hover:shadow-lg transition-all shadow-sm"
              title="Download Class PDF"
            >
              <FileDown className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
        <div className="bg-neutral-50 px-8 py-5 border-b border-neutral-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sidebar rounded-xl flex items-center justify-center text-white">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-black text-neutral-400 uppercase tracking-widest leading-none mb-1">Class Schedule</p>
              <h3 className="text-xl font-black text-sidebar tracking-tight">
                Class: {batches.find(b => b.id === selectedBatchId)?.name || '---'}
              </h3>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-neutral-50/50 border-b border-neutral-100">
                <th className="p-4 text-xs font-black uppercase tracking-[0.2em] text-neutral-400 border-r border-neutral-100 w-32 sticky left-0 bg-neutral-50 z-10">Time Slot</th>
                {DAYS.map(day => <th key={day} className="p-4 text-xs font-black uppercase tracking-[0.2em] text-sidebar">{day}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {periodSlots.map((slot, sIdx) => (
                <tr key={sIdx} className="hover:bg-neutral-50/20 transition-colors">
                  <td className="p-4 border-r border-neutral-100 bg-neutral-50/50 sticky left-0 z-10 text-center">
                    <p className="text-base font-black text-sidebar uppercase">{slot.label}</p>
                    <p className="text-[10px] text-neutral-400 font-bold whitespace-nowrap">{slot.start} - {slot.end}</p>
                  </td>
                  {DAYS.map(day => {
                    const tt = timetables.find(t => t.day === day && (t.batchId === selectedBatchId || (t as any).classId === selectedClassId));
                    const period = tt?.periods.find(p => p.label === slot.label);
                    const subject = subjects.find(s => s.id === period?.subjectId || s.name === period?.subjectId || s.code === period?.subjectId);
                    const teacher = teachers.find(t => t.uid === period?.teacherId || t.id === period?.teacherId || t.docId === period?.teacherId);
                    const subName = subject?.name || (period as any)?.subjectName || period?.subjectId || '';
                    const teachName = teacher?.name || (period as any)?.teacherName || (period?.teacherId && period?.teacherId !== 'unassigned' ? period.teacherId : '');
                    const colorTheme = period 
                      ? (period.isBreak ? BREAK_COLOR : getSubjectColor(subName)) 
                      : DEFAULT_COLOR;
                    const colorClasses = period 
                      ? `${colorTheme.bg} ${colorTheme.text} ${colorTheme.border}` 
                      : 'bg-neutral-50/50 text-neutral-400';

                    return (
                      <td key={`${day}-${slot.label}`} className="p-2">
                        {slot.isBreak ? (
                          <div className="flex items-center justify-center py-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                            <span className="text-[10px] font-black uppercase">{slot.label}</span>
                          </div>
                        ) : (
                          looseAccess ? (
                            <button
                              onClick={() => {
                                setSelectedEditDay(day);
                                setSelectedEditBatchId(selectedBatchId);
                                setSelectedEditSlotLabel(slot.label);
                                setEditSubjectId(period?.subjectId || '');
                                setEditTeacherId(period?.teacherId || '');
                                setEditIsBreak(!!period?.isBreak);
                                setShowManualEditModal(true);
                              }}
                              className={`w-full p-3 rounded-2xl border shadow-sm h-full min-h-[85px] flex flex-col justify-between text-left cursor-pointer group hover:shadow-md transition-all ${colorClasses}`}
                            >
                              {period && !period.isBreak && subName ? (
                                <>
                                  <div className="w-full">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-black uppercase tracking-wider opacity-40">{slot.label}</span>
                                      <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase underline">Edit</span>
                                    </div>
                                    <h4 className="text-sm font-black truncate">{subName}</h4>
                                  </div>
                                  <span className="text-xs font-bold opacity-80 truncate">{teachName || '---'}</span>
                                </>
                              ) : (
                                <div className="my-auto mx-auto flex flex-col items-center justify-center text-neutral-300 group-hover:text-neutral-500 transition-colors">
                                  <Plus className="w-4 h-4 mb-0.5 opacity-60" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Assign</span>
                                </div>
                              )}
                            </button>
                          ) : (
                            <div className={`p-3 rounded-2xl border shadow-sm h-full min-h-[85px] flex flex-col justify-between ${colorClasses}`}>
                              {period && !period.isBreak && subName ? (
                                <>
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider opacity-40">{slot.label}</span>
                                    <h4 className="text-sm font-black truncate">{subName}</h4>
                                  </div>
                                  <span className="text-xs font-bold opacity-80 truncate">{teachName || '---'}</span>
                                </>
                              ) : <span className="text-xs opacity-30 text-center my-auto">---</span>}
                            </div>
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subject targets comparison */}
      {selectedBatchId && (
        <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4">
          <div>
            <h4 className="text-sm font-black text-sidebar tracking-tight flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Weekly Subject Allocation & Target Coverages
            </h4>
            <p className="text-[10px] text-neutral-400 font-bold mt-0.5">
              Compare currently scheduled periods against defined weekly targets for this batch.
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {(() => {
              // Dynamically compute scheduled counts for this batch
              const scheduledCounts: Record<string, number> = {};
              subjects.forEach(s => scheduledCounts[s.id] = 0);
              
              timetables.filter(t => t.batchId === selectedBatchId).forEach(tt => {
                tt.periods.forEach(p => {
                  if (p.subjectId && !p.isBreak) {
                    scheduledCounts[p.subjectId] = (scheduledCounts[p.subjectId] || 0) + 1;
                  }
                });
              });

              // Filter to show subjects that are either scheduled or have a target > 0
              const relevantSubjects = subjects.filter(s => {
                const target = schedulerConfig.subjectRequiredPeriods?.[`${s.id}_${selectedBatchId}`] !== undefined
                  ? schedulerConfig.subjectRequiredPeriods[`${s.id}_${selectedBatchId}`]
                  : (schedulerConfig.subjectRequiredPeriods?.[s.id] !== undefined
                      ? schedulerConfig.subjectRequiredPeriods[s.id]
                      : 5);
                return (scheduledCounts[s.id] || 0) > 0 || target > 0;
              });
              
              if (relevantSubjects.length === 0) {
                return <p className="text-xs font-bold text-neutral-400 col-span-full py-2">No scheduled subjects or targets defined yet.</p>;
              }
              
              return relevantSubjects.map(sub => {
                const scheduled = scheduledCounts[sub.id] || 0;
                const target = schedulerConfig.subjectRequiredPeriods?.[`${sub.id}_${selectedBatchId}`] !== undefined
                  ? schedulerConfig.subjectRequiredPeriods[`${sub.id}_${selectedBatchId}`]
                  : (schedulerConfig.subjectRequiredPeriods?.[sub.id] !== undefined
                      ? schedulerConfig.subjectRequiredPeriods[sub.id]
                      : 5);
                const percent = target > 0 ? Math.min(100, Math.round((scheduled / target) * 100)) : 100;
                const isMet = scheduled >= target;
                
                return (
                  <div key={sub.id} className="p-3.5 rounded-2xl border border-neutral-100 bg-neutral-50/50 space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="text-xs font-black text-sidebar leading-tight truncate">{sub.name}</h5>
                        <p className="text-[9px] font-mono font-bold text-neutral-400 mt-0.5">{sub.code || 'N/A'}</p>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                        isMet 
                          ? 'bg-green-50 text-green-700 border-green-100' 
                          : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        {scheduled} / {target} Periods
                      </span>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="w-full bg-neutral-200/70 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${
                            isMet ? 'bg-green-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-black">
                        <span className={isMet ? 'text-green-600' : 'text-indigo-600'}>{percent}% Allocated</span>
                        {isMet && <span className="text-green-600">Target Met</span>}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );

  const renderTeacherView = () => {
    const activeTeacherId = selectedTeacherId || (teachers.some(t => t.uid === profile?.uid || t.id === profile?.uid) ? profile?.uid : (teachers[0]?.uid || teachers[0]?.id || ''));
    const activeTeacher = teachers.find(t => t.uid === activeTeacherId || t.id === activeTeacherId || t.docId === activeTeacherId) || profile;

    const isTeacherMatch = (tId: string | undefined) => {
      if (!tId) return false;
      if (tId === activeTeacherId) return true;
      if (activeTeacher) {
        if (tId === activeTeacher.uid || tId === activeTeacher.id || tId === activeTeacher.docId || tId === (activeTeacher as any).teacherId) return true;
      }
      return false;
    };

    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 flex flex-wrap gap-4 items-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xl uppercase">
            {String(activeTeacher?.name || 'T').charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-sidebar leading-tight uppercase">{activeTeacher?.name}</h2>
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
              {activeTeacherId === profile?.uid ? 'Personal Duty Timetable' : 'Staff Schedule Reference Duty'}
            </span>
          </div>

          {looseAccess && (
            <div className="flex items-center gap-3 bg-neutral-50 px-3 py-1.5 border border-neutral-200 rounded-xl">
              <span className="text-[10px] font-black tracking-wider uppercase text-neutral-400">Select Staff:</span>
              <select
                value={selectedTeacherId || activeTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="bg-transparent text-xs font-black text-sidebar uppercase cursor-pointer outline-none min-w-[200px]"
              >
                <option value="">-- Choose Teacher --</option>
                {teachers.map(t => (
                  <option key={t.uid || t.id} value={t.uid || t.id}>{t.name} ({t.designation || 'Teacher'})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 bg-neutral-100 p-0.5 rounded-xl border border-neutral-200">
            <button 
              onClick={() => setTeacherViewType('day')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${teacherViewType === 'day' ? 'bg-white shadow-sm text-sidebar' : 'text-neutral-400'}`}
            >
              Day Wise
            </button>
            <button 
              onClick={() => setTeacherViewType('week')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${teacherViewType === 'week' ? 'bg-white shadow-sm text-sidebar' : 'text-neutral-400'}`}
            >
              Week View
            </button>
          </div>
          <button onClick={() => downloadPDF('teacher')} className="p-2 bg-white border border-neutral-200 rounded-xl text-neutral-400 hover:text-primary"><FileDown className="w-4 h-4" /></button>
        </div>

        {teacherViewType === 'week' ? (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <table className="w-full border-collapse table-fixed min-w-[800px]">
              <thead>
                <tr className="bg-sidebar text-white">
                  <th className="p-3 text-[11px] font-black uppercase text-center w-20">Slot</th>
                  {DAYS.map(day => <th key={day} className="p-3 text-[11px] font-black uppercase text-center stream-header">{day}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {periodSlots.filter(s => !s.isBreak).map(slot => (
                  <tr key={slot.label} className="h-16">
                    <td className="p-2 bg-neutral-50/50 border-r border-neutral-100 text-center font-black text-sidebar text-xs">
                      {slot.label}<br/><span className="text-[10px] text-neutral-400 font-bold">{slot.start}</span>
                    </td>
                    {DAYS.map(day => {
                      const assigned = timetables.filter(tt => tt.day === day).flatMap(tt => {
                        const b = batches.find(batch => batch.id === tt.batchId);
                        return tt.periods.filter(p => isTeacherMatch(p.teacherId) && p.label === slot.label).map(p => ({ ...p, b, batchId: tt.batchId }));
                      })[0];
                      const subject = subjects.find(s => s.id === assigned?.subjectId || s.name === assigned?.subjectId || s.code === assigned?.subjectId);
                      const batchObj = assigned?.b || batches.find(b => b.id === assigned?.batchId);
                      const cls = classes.find(c => c.id === batchObj?.classId || c.id === (batchObj as any)?.class || c.id === (batchObj as any)?.classDocId)
                        || (batchObj?.className ? classes.find(c => c.name === batchObj.className) || { name: batchObj.className } : null);

                      const className = cls?.name || (batchObj as any)?.className;
                      const batchName = batchObj?.name;
                      const classAndBatchDisplay = className && batchName && className !== batchName
                        ? `${className} - ${batchName}`
                        : (batchName || className || 'Class');

                      const colorTheme = assigned 
                        ? (assigned.isBreak ? BREAK_COLOR : getSubjectColor(subject?.name || '')) 
                        : DEFAULT_COLOR;
                      const colorClasses = assigned 
                        ? `${colorTheme.bg} ${colorTheme.text} ${colorTheme.border}` 
                        : '';

                      return (
                        <td key={day} className="p-1 text-center">
                          {looseAccess ? (
                            <button
                              onClick={() => {
                                setSelectedEditDay(day);
                                setSelectedEditBatchId(batchObj?.id || assigned?.batchId || selectedBatchId || (batches[0]?.id || ''));
                                setSelectedEditSlotLabel(slot.label);
                                setEditSubjectId(assigned?.subjectId || '');
                                setEditTeacherId(activeTeacherId);
                                setEditIsBreak(!!assigned?.isBreak);
                                setShowManualEditModal(true);
                              }}
                              className={`p-2 rounded-xl border h-full w-full flex flex-col justify-center items-center shadow-xs cursor-pointer text-center group hover:shadow-md transition-all ${assigned ? colorClasses : 'border-dashed border-neutral-200 hover:bg-neutral-50'}`}
                            >
                              {assigned ? (
                                <>
                                  <p className="text-xs font-black truncate w-full">{subject?.name || 'Subject'}</p>
                                  <p className="text-[10px] font-bold opacity-80 truncate w-full mt-0.5" title={classAndBatchDisplay}>{classAndBatchDisplay}</p>
                                  <span className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase underline text-indigo-600 mt-0.5">Edit</span>
                                </>
                              ) : (
                                <div className="flex flex-col items-center justify-center text-neutral-300 group-hover:text-indigo-500 transition-colors">
                                  <Plus className="w-3.5 h-3.5 animate-pulse" />
                                  <span className="text-[8px] font-bold uppercase">Assign</span>
                                </div>
                              )}
                            </button>
                          ) : (
                            assigned ? (
                              <div className={`p-2 rounded-xl border h-full w-full flex flex-col justify-center items-center shadow-xs ${colorClasses}`}>
                                <p className="text-xs font-black truncate w-full">{subject?.name || 'Subject'}</p>
                                <p className="text-[10px] font-bold opacity-80 truncate w-full mt-0.5" title={classAndBatchDisplay}>{classAndBatchDisplay}</p>
                              </div>
                            ) : <span className="text-neutral-200 font-bold">---</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DAYS.map(day => {
              const daySchedule = timetables.filter(tt => tt.day === day).flatMap(tt => {
                const b = batches.find(batch => batch.id === tt.batchId);
                return tt.periods.filter(p => isTeacherMatch(p.teacherId)).map(p => ({ ...p, b, batchId: tt.batchId }));
              });

              return (
                <div key={day} className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="bg-sidebar text-white p-4 flex justify-between items-center font-black text-sm">
                    <span>{day}</span>
                    <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{daySchedule.length} Slots</span>
                  </div>
                  <div className="p-4 space-y-2 bg-neutral-50/30">
                    {periodSlots.filter(s => !s.isBreak).map(slot => {
                      const match = daySchedule.find(a => a.label === slot.label);
                      const sub = subjects.find(s => s.id === match?.subjectId || s.name === match?.subjectId || s.code === match?.subjectId);
                      const batchObj = match?.b || batches.find(b => b.id === match?.batchId);
                      const cls = classes.find(c => c.id === batchObj?.classId || c.id === (batchObj as any)?.class || c.id === (batchObj as any)?.classDocId)
                        || (batchObj?.className ? classes.find(c => c.name === batchObj.className) || { name: batchObj.className } : null);

                      const className = cls?.name || (batchObj as any)?.className;
                      const batchName = batchObj?.name;
                      const classAndBatchDisplay = className && batchName && className !== batchName
                        ? `${className} - ${batchName}`
                        : (batchName || className || 'Class');

                      return (
                        <div key={slot.label} className="w-full">
                          {looseAccess ? (
                            <button
                              onClick={() => {
                                setSelectedEditDay(day);
                                setSelectedEditBatchId(batchObj?.id || match?.batchId || selectedBatchId || (batches[0]?.id || ''));
                                setSelectedEditSlotLabel(slot.label);
                                setEditSubjectId(match?.subjectId || '');
                                setEditTeacherId(activeTeacherId);
                                setEditIsBreak(!!match?.isBreak);
                                setShowManualEditModal(true);
                              }}
                              className={`flex items-center justify-between w-full p-3 rounded-xl border bg-white cursor-pointer text-left group hover:shadow-md transition-all ${match ? 'border-indigo-100 shadow-xs' : 'opacity-40 border-dashed border-neutral-200 hover:opacity-100'}`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black text-sidebar w-8">{slot.label}</span>
                                {match ? (
                                  <div>
                                    <p className="text-xs font-black text-sidebar leading-none">{sub?.name || 'Subject'}</p>
                                    <p className="text-[10px] text-neutral-500 font-bold mt-1">{classAndBatchDisplay}</p>
                                  </div>
                                ) : <span className="text-[10px] text-neutral-300 italic font-bold">Free Slot</span>}
                              </div>
                              <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase underline text-indigo-600">
                                {match ? 'Edit' : 'Assign'}
                              </span>
                            </button>
                          ) : (
                            <div className={`flex items-center gap-3 p-3 rounded-xl border bg-white ${match ? 'border-indigo-100 shadow-xs' : 'opacity-40 border-dashed'}`}>
                              <span className="text-xs font-black text-sidebar w-8">{slot.label}</span>
                              {match ? (
                                <div>
                                  <p className="text-xs font-black text-sidebar leading-none">{sub?.name || 'Subject'}</p>
                                  <p className="text-[10px] text-neutral-500 font-bold mt-1">{classAndBatchDisplay}</p>
                                </div>
                              ) : <span className="text-[10px] text-neutral-300 italic">Free Slot</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSubstitutionView = () => {
    const selectedDay = format(new Date(), 'EEEE');

    // Find all timetable periods for today's weekday where the teacher is one of the absent teachers
    const absentPeriodsToday = timetables
      .filter(tt => tt.day === selectedDay)
      .flatMap(tt => {
        const batch = batches.find(b => b.id === tt.batchId);
        const cls = classes.find(c => c.id === batch?.classId);
        return tt.periods
          .filter(p => !p.isBreak && absentTeachersToday.some(at => at.uid === p.teacherId))
          .map(p => {
            const absentTeacher = absentTeachersToday.find(at => at.uid === p.teacherId)!;
            const key = `${absentTeacher.uid}_${p.label}_${tt.batchId}`;
            return {
              key,
              periodLabel: p.label,
              startTime: p.startTime,
              endTime: p.endTime,
              batchId: tt.batchId,
              batchName: batch?.name || 'Class Duty',
              subjectId: p.subjectId,
              subjectName: subjects.find(s => s.id === p.subjectId)?.name || 'General Class',
              absentTeacherId: absentTeacher.uid,
              absentTeacherName: absentTeacher.name,
              absentReason: absentTeacher.reason,
            };
          });
      });

    // Helper to calculate workload and leisure status for any given slot
    const getCandidatesForPeriod = (periodLabel: string, batchId: string, absentTeacherId: string) => {
      return teachers
        .filter(t => t.uid !== absentTeacherId && (t.role === 'teacher' || t.role === 'teacher_class' || t.role === 'teacher_subject' || t.role === 'coordinator' || t.staffType === 'teaching'))
        .map(teacher => {
          // 1. Is this teacher free during this slot on today's day of week in timetables?
          const isBusyInTimetable = timetables
            .filter(tt => tt.day === selectedDay)
            .some(tt => tt.periods.some(p => p.label === periodLabel && p.teacherId === teacher.uid));

          // 2. Is this teacher already substituted for this period today?
          const isBusyInSubstitutions = substitutions.some(s => s.date === todayStr && s.periodLabel === periodLabel && s.substituteTeacherId === teacher.uid);
          const isBusyInDraft = Object.entries(selectedSubstitutions).some(([chkKey, subId]) => {
            const [atId, pLabel, bId] = chkKey.split('_');
            return pLabel === periodLabel && subId === teacher.uid;
          });

          const isFree = !isBusyInTimetable && !isBusyInSubstitutions && !isBusyInDraft;

          // 3. Current workload limit
          const regularPeriodsCount = timetables
            .filter(tt => tt.day === selectedDay)
            .flatMap(tt => tt.periods.filter(p => !p.isBreak && p.teacherId === teacher.uid)).length;

          const substitutionPeriodsCount = substitutions.filter(s => s.date === todayStr && s.substituteTeacherId === teacher.uid).length;
          
          const currentLoad = regularPeriodsCount + substitutionPeriodsCount;
          const maxLoad = teacher.maxPeriodsPerDay || 6;

          // 4. Does this teacher normally teach this class? (Very high priority matching)
          const normallyTeachesClass = timetables.some(tt => 
            tt.batchId === batchId && tt.periods.some(p => p.teacherId === teacher.uid)
          );

          return {
            teacher,
            isFree,
            currentLoad,
            maxLoad,
            normallyTeachesClass
          };
        });
    };

    const handleAutoAssign = () => {
      const autoAssignments = { ...selectedSubstitutions };
      let assignedCount = 0;

      absentPeriodsToday.forEach(period => {
        // Skip if already assigned in draft
        if (autoAssignments[period.key]) return;

        const candidates = getCandidatesForPeriod(period.periodLabel, period.batchId, period.absentTeacherId);
        const freeCandidates = candidates.filter(c => c.isFree && c.currentLoad < c.maxLoad);
        
        // Sort: normallyTeachesClass first, then lower load
        freeCandidates.sort((a, b) => {
          if (a.normallyTeachesClass && !b.normallyTeachesClass) return -1;
          if (!a.normallyTeachesClass && b.normallyTeachesClass) return 1;
          return a.currentLoad - b.currentLoad;
        });

        if (freeCandidates.length > 0) {
          autoAssignments[period.key] = freeCandidates[0].teacher.uid;
          assignedCount++;
        }
      });

      setSelectedSubstitutions(autoAssignments);
      if (assignedCount > 0) {
        toast.success(`Automatically assigned matching free/leisure teachers to ${assignedCount} periods!`);
      } else {
        toast.info('No new available free matches found for remaining periods.');
      }
    };

    const handleUpdateSavedSub = async (period: any, subTeacherId: string) => {
      const docId = `${todayStr}_${period.absentTeacherId}_${period.periodLabel}_${period.batchId}`;
      if (!subTeacherId) {
        try {
          await dbService.delete('substitutions', docId);
          const refreshedData = await dbService.list('substitutions', [where('date', '==', todayStr)]);
          setSubstitutions(refreshedData);
          toast.success('Substitution cleared successfully.');
        } catch (err) {
          console.error(err);
          toast.error('Failed to clear substitution.');
        }
      } else {
        try {
          const subTeacher = teachers.find(t => t.uid === subTeacherId);
          if (!subTeacher) return;
          await dbService.set('substitutions', docId, {
            id: docId,
            date: todayStr,
            absentTeacherId: period.absentTeacherId,
            absentTeacherName: period.absentTeacherName,
            substituteTeacherId: subTeacherId,
            substituteTeacherName: subTeacher.name,
            periodLabel: period.periodLabel,
            periodIndex: period.periodLabel,
            batchId: period.batchId,
            reason: `Assigned coverage as substitute for ${period.absentTeacherName} in ${period.batchName}.`,
            createdAt: new Date().toISOString()
          });
          await dbService.add('notifications', {
            userId: subTeacherId,
            title: '📌 Daily Substitution Updated',
            message: `You have been assigned to handle Class ${period.batchName} during Period ${period.periodLabel} today, substituting for ${period.absentTeacherName} (${period.subjectName}).`,
            type: 'substitution',
            date: todayStr,
            read: false,
            createdAt: new Date().toISOString()
          });
          const refreshedData = await dbService.list('substitutions', [where('date', '==', todayStr)]);
          setSubstitutions(refreshedData);
          toast.success(`Successfully updated substitute to ${subTeacher.name}!`);
        } catch (err) {
          console.error(err);
          toast.error('Failed to update substitution.');
        }
      }
    };

    const handleSaveAllSubstitutions = async () => {
      const assignments = Object.entries(selectedSubstitutions).filter(([k, v]) => !!v);
      if (assignments.length === 0) {
        toast.error('Please assign at least one substitute teacher.');
        return;
      }

      setIsSendingWhatsApp(true);
      setWhatsappLogs([]);

      try {
        let count = 0;
        const logs: string[] = [];

        for (const [key, substituteTeacherId] of assignments) {
          const [absentTeacherId, periodLabel, batchId] = key.split('_');
          const periodItem = absentPeriodsToday.find(p => p.key === key);
          if (!periodItem) continue;

          const subTeacher = teachers.find(t => t.uid === substituteTeacherId);
          if (!subTeacher) continue;

          const docId = `${todayStr}_${absentTeacherId}_${periodLabel}_${batchId}`;

          logs.push(`⚙️ Processing assignment for Period ${periodLabel} in ${periodItem.batchName}...`);

          // 1. Write substitution to database
          await dbService.set('substitutions', docId, {
            id: docId,
            date: todayStr,
            absentTeacherId,
            absentTeacherName: periodItem.absentTeacherName,
            substituteTeacherId,
            substituteTeacherName: subTeacher.name,
            periodLabel,
            periodIndex: periodLabel,
            batchId,
            reason: `Assigned coverage as substitute for ${periodItem.absentTeacherName} in ${periodItem.batchName}.`,
            createdAt: new Date().toISOString()
          });

          // 2. Create in-portal alert notification
          await dbService.add('notifications', {
            userId: substituteTeacherId,
            title: '📌 Daily Substitution Scheduled',
            message: `You have been assigned to handle Class ${periodItem.batchName} during Period ${periodLabel} today, substituting for ${periodItem.absentTeacherName} (${periodItem.subjectName}).`,
            type: 'substitution',
            date: todayStr,
            read: false,
            createdAt: new Date().toISOString()
          });

          // 3. Simulated WhatsApp API endpoint transfer
          const phone = subTeacher.phone || subTeacher.whatsappNumber || '9999999999';
          logs.push(`📱 Sending WhatsApp API message to ${subTeacher.name} (+91 ${phone})...`);
          logs.push(`✅ WhatsApp success: "Assigned substitution Duty for class ${periodItem.batchName}, Period ${periodLabel} successfully."`);
          count++;
        }

        const refreshedData = await dbService.list('substitutions', [where('date', '==', todayStr)]);
        setSubstitutions(refreshedData);
        setSelectedSubstitutions({});
        setWhatsappLogs(logs);
        toast.success(`Successfully assigned other teachers to ${count} period(s) and sent dashboard alerts & WhatsApp updates!`);
      } catch (e) {
        console.error(e);
        toast.error('Error saving period substitutions.');
      } finally {
        setIsSendingWhatsApp(false);
      }
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-substitution-sheet, #printable-substitution-sheet * {
              visibility: visible;
            }
            #printable-substitution-sheet {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              display: block !important;
            }
          }
        `}</style>

        {/* Dynamic A4 Printable Format Hidden from general layout */}
        <div id="printable-substitution-sheet" className="hidden p-8 bg-white text-black max-w-[210mm] min-h-[297mm] mx-auto border border-neutral-300">
          <div className="text-center border-b-2 border-black pb-4 mb-6">
            <h1 className="text-2xl font-black uppercase tracking-tight">EAST ACADEMIC SCHOOLS &amp; COLLEGES</h1>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Daily Substitution Duty Assignment Sheet</p>
            <p className="text-sm font-bold mt-2">Date: {format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-bold">The following faculty duty adjustments have been approved by the Office of the Vice Principal today:</p>

            <table className="w-full border-collapse border border-black text-sm">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="border border-black p-2 text-xs font-bold uppercase text-left">Period</th>
                  <th className="border border-black p-2 text-xs font-bold uppercase text-left">Class &amp; Batch</th>
                  <th className="border border-black p-2 text-xs font-bold uppercase text-left">Subject</th>
                  <th className="border border-black p-2 text-xs font-bold uppercase text-left">Absent Teacher</th>
                  <th className="border border-black p-2 text-xs font-bold uppercase text-left">Assigned Substitute</th>
                  <th className="border border-black p-2 text-xs font-bold uppercase text-left">Substitute Signature</th>
                </tr>
              </thead>
              <tbody>
                {substitutions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-black p-4 text-center text-neutral-500 italic">No substitutions defined for today.</td>
                  </tr>
                ) : (
                  substitutions.map((sub, idx) => {
                    const batchName = batches.find(b => b.id === sub.batchId)?.name || 'Class Duty';
                    return (
                      <tr key={idx}>
                        <td className="border border-black p-2 font-black text-center">{sub.periodLabel || sub.periodIndex}</td>
                        <td className="border border-black p-2">{batchName}</td>
                        <td className="border border-black p-2">{sub.reason ? sub.reason.match(/\(([^)]+)\)/)?.[1] || 'Main' : 'Main'}</td>
                        <td className="border border-black p-2 text-red-700 font-medium">{sub.absentTeacherName}</td>
                        <td className="border border-black p-2 text-green-700 font-extrabold">{sub.substituteTeacherName}</td>
                        <td className="border border-black p-3 text-neutral-300 italic text-xs">_____________________</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <div className="pt-24 flex justify-between text-xs font-bold uppercase tracking-wider">
              <div>
                <p>Generated: {new Date().toLocaleTimeString()}</p>
                <p>Academic Scheduler Engine</p>
              </div>
              <div className="text-right">
                <p className="mb-8">_______________________________</p>
                <p>Office of the Vice Principal</p>
                <p>Authorized Signature Seal</p>
              </div>
            </div>
          </div>
        </div>

        {/* Vice Principal Delegation Console */}
        {looseAccess ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-neutral-200/60 shadow-sm flex flex-wrap gap-4 items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-sidebar tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  Vice Principal Daily Substitutions Board
                </h2>
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest block mt-0.5">
                  Manage unstaffed periods, verify teacher leisure times and notify candidates
                </span>
              </div>
              
              <div className="flex gap-2.5">
                <button 
                  onClick={handleAutoAssign}
                  className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold tracking-tight transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Wand2 className="w-4 h-4" />
                  Auto-Fill Best Matches
                </button>
                <button 
                  onClick={handleSaveAllSubstitutions}
                  className="px-4 py-2.5 bg-primary text-white hover:bg-sidebar rounded-xl text-xs font-bold tracking-tight transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Send className="w-4 h-4 animate-bounce" />
                  Approve &amp; Notify
                </button>
                <button 
                  onClick={() => window.print()} 
                  className="px-4 py-2.5 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-xl text-xs font-bold tracking-tight transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  Print A4 Sheet
                </button>
              </div>
            </div>

            {/* Quick stats on attendance + leave */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-red-50 to-white p-5 rounded-2xl border border-red-100 shadow-sm animate-in zoom-in-95">
                <p className="text-[10px] font-black uppercase text-red-500 tracking-wider">Absent Staff Faculty</p>
                <p className="text-2xl font-black text-red-700 mt-1">{absentTeachersToday.length} Teachers</p>
                <p className="text-xs text-red-500/80 mt-1.5 font-bold truncate">Requires immediate schedule coverage</p>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-white p-5 rounded-2xl border border-amber-100 shadow-sm animate-in zoom-in-95 delay-75">
                <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider">Total Periods Unstaffed</p>
                <p className="text-2xl font-black text-amber-700 mt-1">{absentPeriodsToday.length} Periods</p>
                <p className="text-xs text-amber-500/80 mt-1.5 font-bold truncate">Timetabled duties today ({selectedDay})</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-white p-5 rounded-2xl border border-green-100 shadow-sm animate-in zoom-in-95 delay-150">
                <p className="text-[10px] font-black uppercase text-green-500 tracking-wider">Coverages Assigned</p>
                <p className="text-2xl font-black text-green-700 mt-1">{substitutions.filter(s => s.date === todayStr).length} Completed</p>
                <p className="text-xs text-green-500/80 mt-1.5 font-bold truncate">Confirmed coverage in active system</p>
              </div>
            </div>

            {/* Main Interactive Table Grid */}
            <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-neutral-50/70 text-left border-b border-neutral-100">
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-neutral-400">Class &amp; Slot</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-neutral-400">Absent Teacher</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-neutral-400">Target Class Period</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-neutral-400">Substitute Selection</th>
                    <th className="p-4 text-xs font-black uppercase tracking-wider text-neutral-400">Status Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {absentPeriodsToday.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-neutral-400 font-bold">
                        Excellent! No faculty members are absent today. No coverages required.
                      </td>
                    </tr>
                  ) : (
                    absentPeriodsToday.map(period => {
                      const assignedSubId = selectedSubstitutions[period.key] || '';
                      
                      // Check if already assigned real time in DB
                      const savedSub = substitutions.find(s => s.date === todayStr && s.absentTeacherId === period.absentTeacherId && s.periodLabel === period.periodLabel && s.batchId === period.batchId);
                      
                      // Calculate candidates
                      const candidates = getCandidatesForPeriod(period.periodLabel, period.batchId, period.absentTeacherId);
                      const recommendedCandidates = candidates.filter(c => c.isFree && c.normallyTeachesClass && c.currentLoad < c.maxLoad);
                      const availableCandidates = candidates.filter(c => c.isFree && !c.normallyTeachesClass && c.currentLoad < c.maxLoad);
                      const busyCandidates = candidates.filter(c => !c.isFree);

                      return (
                        <tr key={period.key} className="hover:bg-neutral-50/20 transition-colors">
                          <td className="p-4">
                            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase">
                              {period.periodLabel}
                            </span>
                            <p className="text-sm font-black text-sidebar mt-1.5">{period.batchName}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm font-black text-sidebar">{period.absentTeacherName}</p>
                            <p className="text-[10px] text-neutral-400 font-semibold truncate max-w-[180px] mt-0.5">{period.absentReason}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm font-black text-sidebar">{period.subjectName}</p>
                            <p className="text-xs text-neutral-400 font-bold">{period.startTime} - {period.endTime}</p>
                          </td>
                          <td className="p-4">
                            {savedSub ? (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-green-700 font-black text-xs">
                                  <UserCheck className="w-4 h-4 text-green-600 animate-pulse" />
                                  <span>Assigned: {savedSub.substituteTeacherName}</span>
                                </div>
                                <select
                                  value={savedSub.substituteTeacherId}
                                  onChange={(e) => handleUpdateSavedSub(period, e.target.value)}
                                  className="w-full bg-emerald-50 text-xs font-black p-2 rounded-xl border border-emerald-200 outline-none uppercase text-emerald-800 cursor-pointer"
                                >
                                  <option value="">-- Clear / Remove Substitution --</option>
                                  {recommendedCandidates.length > 0 && (
                                    <optgroup label="⭐ Highly Recommended (Handles Class & Free)">
                                      {recommendedCandidates.map(c => (
                                        <option key={c.teacher.uid} value={c.teacher.uid}>
                                          {c.teacher.name} — Free (Load: {c.currentLoad}/{c.maxLoad})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {availableCandidates.length > 0 && (
                                    <optgroup label="✅ Available Free Leisure Slots">
                                      {availableCandidates.map(c => (
                                        <option key={c.teacher.uid} value={c.teacher.uid}>
                                          {c.teacher.name} — Free (Load: {c.currentLoad}/{c.maxLoad})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {busyCandidates.length > 0 && (
                                    <optgroup label="⚠️ Busy / Workload Overload">
                                      {busyCandidates.map(c => (
                                        <option key={c.teacher.uid} value={c.teacher.uid}>
                                          {c.teacher.name} (Busy / Load: {c.currentLoad}/{c.maxLoad})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </div>
                            ) : (
                              <select
                                value={assignedSubId}
                                onChange={(e) => setSelectedSubstitutions(prev => ({ ...prev, [period.key]: e.target.value }))}
                                className="w-full bg-neutral-50 text-xs font-black p-2.5 rounded-xl border border-neutral-200 outline-none uppercase text-sidebar cursor-pointer"
                              >
                                <option value="">-- Choose Substitute Teacher --</option>
                                {recommendedCandidates.length > 0 && (
                                  <optgroup label="⭐ Highly Recommended (Handles Class & Free)">
                                    {recommendedCandidates.map(c => (
                                      <option key={c.teacher.uid} value={c.teacher.uid}>
                                        {c.teacher.name} — Free (Load: {c.currentLoad}/{c.maxLoad})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {availableCandidates.length > 0 && (
                                  <optgroup label="✅ Available Free Leisure Slots">
                                    {availableCandidates.map(c => (
                                      <option key={c.teacher.uid} value={c.teacher.uid}>
                                        {c.teacher.name} — Free (Load: {c.currentLoad}/{c.maxLoad})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {busyCandidates.length > 0 && (
                                  <optgroup label="⚠️ Busy / Workload Overload">
                                    {busyCandidates.map(c => (
                                      <option key={c.teacher.uid} value={c.teacher.uid}>
                                        {c.teacher.name} (Busy / Load: {c.currentLoad}/{c.maxLoad})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            )}
                          </td>
                          <td className="p-4">
                            {savedSub ? (
                              <span className="text-[10px] font-black uppercase text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-xl">
                                Broadcast Live
                              </span>
                            ) : assignedSubId ? (
                              <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl animate-pulse">
                                Selected Draft
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl">
                                Pending Action
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* simulated WhatsApp Terminal Dispatch console logs */}
            {whatsappLogs.length > 0 && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-neutral-300 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-3">
                  <p className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Portal notifications &amp; Whatsapp Dispatch Logs ({todayStr})</p>
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
                </div>
                <div className="space-y-1 overflow-y-auto max-h-[160px]">
                  {whatsappLogs.map((log, lIdx) => (
                    <p key={lIdx} className={log.startsWith('✅') ? 'text-green-400 font-bold' : log.startsWith('📱') ? 'text-indigo-300 animate-pulse' : 'text-neutral-400'}>
                      {log}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* General Roster View for standard teachers */
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-neutral-200/60 shadow-sm animate-in fade-in">
              <h2 className="text-xl font-black text-sidebar">Your Active Substitution Duties Today</h2>
              <span className="text-xs text-neutral-400 block mt-1 font-semibold">List of class period coverages requested for you by administration</span>
            </div>

            {substitutions.filter(s => s.date === todayStr && s.substituteTeacherId === profile?.uid).length === 0 ? (
              <div className="bg-white p-12 rounded-[2rem] border text-center text-neutral-400 font-bold">
                No coverages assigned for you today! Have a productive day.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {substitutions
                  .filter(s => s.date === todayStr && s.substituteTeacherId === profile?.uid)
                  .map((sub, sIdx) => {
                    const batch = batches.find(b => b.id === sub.batchId);
                    return (
                      <div key={sIdx} className="bg-white rounded-3xl border border-neutral-200 p-6 space-y-4 shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-green-700 bg-green-50 px-3 py-1 rounded-full uppercase">
                            Period {sub.periodLabel || sub.periodIndex}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-black uppercase">Active today</span>
                        </div>
                        <h4 className="text-lg font-black text-sidebar">{batch?.name || 'Class Duty'}</h4>
                        <div className="bg-neutral-50 px-4 py-3 rounded-xl border border-neutral-100">
                          <p className="text-xs font-bold text-neutral-400 uppercase">Substituting Faculty</p>
                          <p className="text-sm font-bold text-red-600 mt-0.5">{sub.absentTeacherName}</p>
                          <p className="text-xs text-neutral-500 italic mt-2">"{sub.reason}"</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-full px-2 md:px-4 py-3 pb-32 space-y-4 min-h-screen bg-neutral-50/10">
      <header className="bg-white px-4 py-2 rounded-xl border border-neutral-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-sidebar rounded-lg flex items-center justify-center text-white shadow-sm">
            <TableIcon className="w-4 h-4" />
          </div>
          <h1 className="text-[16px] font-black text-sidebar uppercase tracking-tight hidden sm:block">Academic Scheduler</h1>
        </div>
        
        <nav className="bg-neutral-100 p-0.5 rounded-lg flex gap-0.5 shadow-inner flex-wrap">
          <button onClick={() => setActiveTab('class')} className={`px-4 py-1.5 rounded-md text-xs font-black transition-all ${activeTab === 'class' ? 'bg-white text-sidebar shadow-xs' : 'text-neutral-400'}`}>Classes</button>
          <button onClick={() => setActiveTab('teacher')} className={`px-4 py-1.5 rounded-md text-xs font-black transition-all ${activeTab === 'teacher' ? 'bg-white text-sidebar shadow-xs' : 'text-neutral-400'}`}>Staff Duty</button>
          {looseAccess && (
            <>
              <button onClick={() => setActiveTab('master')} className={`px-4 py-1.5 rounded-md text-xs font-black transition-all ${activeTab === 'master' ? 'bg-white text-sidebar shadow-xs' : 'text-neutral-400'}`}>Master Scheduler</button>
              <button onClick={() => setActiveTab('substitution')} className={`px-4 py-1.5 rounded-md text-xs font-black transition-all ${activeTab === 'substitution' ? 'bg-white text-sidebar shadow-xs' : 'text-neutral-400'}`}>Substitutions</button>
            </>
          )}
        </nav>
      </header>

      <div className="w-full">
        {activeTab === 'class' && renderClassView()}
        {activeTab === 'teacher' && renderTeacherView()}
        {activeTab === 'master' && looseAccess && renderMasterView()}
        {activeTab === 'substitution' && looseAccess && renderSubstitutionView()}
      </div>

      {renderManualEditModal()}
      {renderGenerationProgressModal()}
      {renderSchedulerSettingsModal()}
      {renderExportModal()}
      {renderClearConfirmModal()}
    </div>
  );
};

export default Timetable;