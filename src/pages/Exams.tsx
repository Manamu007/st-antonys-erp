import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  GraduationCap,  
  Calendar,  
  UserCheck,  
  Layout,  
  MessageSquare,  
  Save,  
  Download,  
  Send,
  Plus,
  Search,
  ChevronRight,
  Filter,
  Trash2,
  FileText,
  Edit2,
  Printer,
  ImagePlus,
  FileSpreadsheet,
  Camera,
  UploadCloud,
  PieChart,
  Trophy,
  Star,
  Medal,
  TrendingUp,
  BarChart3,
  Copy,
  Check,
  Layers,
  AlertTriangle,
  X,
  Zap,
  RefreshCw,
  Sparkles,
  Eye,
  Info,
  ExternalLink,
  PhoneCall,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { Class10DailyExams } from '../components/Class10DailyExams';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { toast } from 'sonner';
import { isTeacherRole as checkIsTeacherRole, getTeacherAssignments, filterClassesForTeacher, filterBatchesForTeacher } from '../utils/teacherFilter';
import { motion, AnimatePresence } from 'motion/react';
import { where, limit } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { extractHandwrittenMarks } from '../services/aiService';
import { sortAlphabetically, resolveStudentClassAndBatch } from '../lib/utils';
import { isDemoStudentRecord, isKnownDemoName } from '../constants/systemAccounts';
import { SortAsc, SortDesc } from 'lucide-react';

type TabType = 'schedule' | 'class10-daily' | 'subject-entry' | 'class-view' | 'whatsapp' | 'central-register' | 'abstract-summary';

export const sortByRollNumber = (a: any, b: any) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const rollA = String(a.rollNumber || a.rollNo || a.batchRollNo || a.batchRollNumber || '').trim();
  const rollB = String(b.rollNumber || b.rollNo || b.batchRollNo || b.batchRollNumber || '').trim();

  if (!rollA && !rollB) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }
  if (!rollA) return 1;
  if (!rollB) return -1;

  const numA = Number(rollA);
  const numB = Number(rollB);

  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }

  return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
};

export const getStandardSubjectRank = (subjectName: string): number => {
  const raw = (subjectName || '').trim();
  const lower = raw.toLowerCase();
  const clean = lower.replace(/[^a-z0-9]/g, '');

  // 1. TELUGU
  if (clean.includes('telugu') || clean === 'tel' || lower.includes('1st lang') || lower.includes('first lang')) {
    return 1;
  }

  // 2. HINDI
  if (clean.includes('hindi') || clean.includes('hindhi') || clean === 'hin' || lower.includes('2nd lang') || lower.includes('second lang')) {
    return 2;
  }

  // 3. ENGLISH
  if (clean.includes('english') || clean === 'eng' || clean.includes('engreading') || lower.includes('3rd lang') || lower.includes('third lang')) {
    return 3;
  }

  // 4. MATHEMATICS / MATHS / MATH
  if (clean.includes('math') || clean.includes('mathematics') || clean.includes('maths') || clean === 'numbers' || clean === 'tables' || clean.includes('mathbasics')) {
    return 4;
  }

  // 5. 5th Column: EVS / SCIENCE / PHYSICS (according to the class subject)
  // EVS / Environmental Studies / Environmental Science
  if (clean.includes('evs') || clean.includes('environment') || clean.includes('envstudies') || clean.includes('envscience')) {
    return 5;
  }
  // Physics / Physical Science / PS
  if (clean.includes('physics') || clean.includes('physicalscience') || clean === 'ps' || clean === 'phy' || clean === 'phys') {
    return 5;
  }
  // Science / General Science (making sure not to match biological science, computer science, or social science)
  if ((clean.includes('science') || clean === 'sci' || clean.includes('genscience') || clean.includes('generalscience')) && 
      !clean.includes('bio') && !clean.includes('computer') && !clean.includes('social')) {
    return 5;
  }

  // 6. BIOLOGY / Biological Science / Natural Science / NS
  if (clean.includes('bio') || clean.includes('biology') || clean.includes('biological') || clean.includes('naturalscience') || clean === 'ns' || clean === 'bs') {
    return 6;
  }

  // 7. SOCIAL / Social Studies / Social Science / SST
  if (clean.includes('social') || clean.includes('sst') || clean.includes('soc') || clean.includes('socialstudies') || clean.includes('socialscience')) {
    return 7;
  }

  // 8. COMPUTERS / Computer Science / IT
  if (clean.includes('computer') || clean.includes('computers') || clean === 'cs' || clean.includes('it') || clean.includes('infotech') || clean.includes('informationtechnology')) {
    return 8;
  }

  // 9+. Other auxiliary subjects
  if (clean.includes('gk') || clean.includes('generalknowledge')) return 9;
  if (clean.includes('rhymes')) return 10;
  if (clean.includes('sanskrit')) return 11;
  if (clean.includes('moral') || clean.includes('value')) return 12;
  if (clean.includes('drawing') || clean.includes('art') || clean.includes('craft')) return 13;

  return 100;
};

export const isMarkAbsent = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toLowerCase();
  return s === 'absent' || s === 'ab' || s === 'a' || s === 'abs';
};

export const formatDecimalMark = (val: number | string | null | undefined): string | number => {
  if (val === null || val === undefined || val === '') return '-';
  if (typeof val === 'string') {
    if (isMarkAbsent(val)) return 'Absent';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    const cleanNum = Math.round((num + Number.EPSILON) * 100) / 100;
    return Number.isInteger(cleanNum) ? cleanNum : parseFloat(cleanNum.toFixed(2));
  }
  if (isNaN(val)) return '-';
  const cleanVal = Math.round((Number(val) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(cleanVal) ? cleanVal : parseFloat(cleanVal.toFixed(2));
};

export const compareSubjectsStandard = (a: any, b: any) => {
  const nameA = typeof a === 'string' ? a : (a?.name || '');
  const nameB = typeof b === 'string' ? b : (b?.name || '');
  const rankA = getStandardSubjectRank(nameA);
  const rankB = getStandardSubjectRank(nameB);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return nameA.localeCompare(nameB);
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
        if (h.type !== 'holiday') return false;
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

const isPrimaryClass = (className: string): boolean => {
  if (!className) return true;
  const lowerName = className.toLowerCase();
  
  // If it includes numbers like 6, 7, 8, 9, 10
  const match = lowerName.match(/\b(6|7|8|9|10)\b/);
  if (match) return false;
  
  // If it includes word-based grades
  if (
    lowerName.includes('six') ||
    lowerName.includes('seven') ||
    lowerName.includes('eight') ||
    lowerName.includes('nine') ||
    lowerName.includes('ten') ||
    lowerName.includes('6th') ||
    lowerName.includes('7th') ||
    lowerName.includes('8th') ||
    lowerName.includes('9th') ||
    lowerName.includes('10th')
  ) {
    return false;
  }
  
  return true;
};

const isClass10NameOrId = (val?: any): boolean => {
  if (!val) return false;
  const str = String(val).toLowerCase().trim();
  if (!str) return false;
  if (str === '10' || str === 'x' || str === 'tenth' || str === 'ssc' || str === 'class_10' || str === 'class10') return true;
  if (str.includes('class 10') || str.includes('class-10') || str.includes('class_10') || str.includes('10th') || str.includes('10-') || str.includes('10 ') || str.includes('10_') || str.includes('10a') || str.includes('10b') || str.includes('10c') || str.includes('10d')) return true;
  if (str.includes('class x') || str.includes('class-x') || str.includes('class_x') || str.includes('xth') || str.includes('x-') || str.includes('x ') || str.includes('x_')) return true;
  if (/\b10\b/.test(str) || /\b10th\b/.test(str) || /\bx\b/.test(str)) return true;
  return false;
};

export const isClass6to9NameOrId = (val?: any): boolean => {
  if (!val) return false;
  const str = String(val).toLowerCase().trim();
  if (!str) return false;
  if (isClass10NameOrId(val)) return false;

  // Check Roman numerals: VI, VII, VIII, IX
  if (/\b(vi|vii|viii|ix)\b/i.test(str)) return true;

  // Check digits: 6, 7, 8, 9
  if (/\b(6|7|8|9)\b/.test(str)) return true;
  if (/\b(6th|7th|8th|9th)\b/.test(str)) return true;

  if (
    str.includes('class 6') || str.includes('class-6') || str.includes('class_6') || str.includes('class6') ||
    str.includes('class 7') || str.includes('class-7') || str.includes('class_7') || str.includes('class7') ||
    str.includes('class 8') || str.includes('class-8') || str.includes('class_8') || str.includes('class8') ||
    str.includes('class 9') || str.includes('class-9') || str.includes('class_9') || str.includes('class9')
  ) return true;

  if (
    str.includes('6th') || str.includes('7th') || str.includes('8th') || str.includes('9th') ||
    str.includes('six') || str.includes('seven') || str.includes('eight') || str.includes('nine')
  ) return true;

  return false;
};

export const getPerformanceCategory = (percentage: number): string => {
  if (percentage >= 90) return '🌟 Outstanding';
  if (percentage >= 80) return '⭐ Excellent';
  if (percentage >= 70) return 'Very Good';
  if (percentage >= 60) return 'Good';
  if (percentage >= 50) return 'Average';
  if (percentage >= 40) return 'Needs Improvement';
  return 'Poor / Fail';
};

const Exams: React.FC = () => {
  const { profile, hasPermission, isAdmin, user } = useAuth();
  const { settings } = useSettings();
  
  // 'staff' రోల్ ఉన్నా కూడా టీచర్ కిందే పరిగణించేలా లాజిక్ అప్‌డేట్ చేయబడింది
  const isTeacherRole = checkIsTeacherRole(profile?.role || '', profile?.email, profile?.name) || profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject' || profile?.role === 'coordinator' || profile?.role === 'staff' || (profile as any)?.staffType === 'teaching';

  if (!hasPermission('exams_view') && !hasPermission('exams_manage') && !hasPermission('exams_view_my') && !hasPermission('exams_view_my_strict') && !hasPermission('portal_student_view_marks')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <GraduationCap className="w-12 h-12 text-blue-500 mb-4" />
        <h2 className="text-2xl font-black text-sidebar uppercase tracking-tight">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2 text-[15px] font-bold">
          You do not have permission to view or manage exams. Please contact your administrator.
        </p>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [loading, setLoading] = useState(false);
  
  // Data states
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [globalSortDirection, setGlobalSortDirection] = useState<'asc' | 'desc'>('asc');
  const [marks, setMarks] = useState<any[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [showNewExamModal, setShowNewExamModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [currentSchedulingExam, setCurrentSchedulingExam] = useState<any>(null);
  const [isEditingExam, setIsEditingExam] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [examToDelete, setExamToDelete] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState({ 
    paperSize: 'A4' as 'A4' | 'A3', 
    orientation: 'landscape' as 'portrait' | 'landscape' 
  });
  const [newExamData, setNewExamData] = useState({
    title: '',
    type: 'FA' as 'FA' | 'SA',
    examNumber: 1,
    date: new Date().toISOString().split('T')[0],
    status: 'scheduled' as const,
    academicYear: settings?.currentAcademicYear || '2026-27',
    st1Max: 10,
    st2Max: 10,
    homeworkMax: 5,
    writtenMax: 25,
    saWrittenMax: 100
  });

  useEffect(() => {
    if (settings?.currentAcademicYear && !isEditingExam) {
      setNewExamData(prev => ({ ...prev, academicYear: settings.currentAcademicYear }));
    }
  }, [settings?.currentAcademicYear, isEditingExam]);

  // Selection states
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedExam, setSelectedExam] = useState('');

  const activeClassObj = classes.find(c => c.id === selectedClass);
  const activeBatchObj = batches.find(b => b.id === selectedBatch);
  const isPrimary = activeClassObj ? isPrimaryClass(activeClassObj.name) : true;

  const isClass10 = useMemo(() => {
    if (activeClassObj && (isClass10NameOrId(activeClassObj.name) || isClass10NameOrId(activeClassObj.id) || isClass10NameOrId(activeClassObj.code))) {
      return true;
    }
    if (activeBatchObj && (isClass10NameOrId(activeBatchObj.name) || isClass10NameOrId(activeBatchObj.id) || isClass10NameOrId(activeBatchObj.classId))) {
      return true;
    }
    if (selectedClass && isClass10NameOrId(selectedClass)) return true;
    if (selectedBatch && isClass10NameOrId(selectedBatch)) return true;
    return false;
  }, [activeClassObj, activeBatchObj, selectedClass, selectedBatch]);

  const isClass6to9 = useMemo(() => {
    if (isClass10) return false;
    if (activeClassObj && isClass6to9NameOrId(activeClassObj.name || activeClassObj.id || activeClassObj.code)) return true;
    if (activeBatchObj && isClass6to9NameOrId(activeBatchObj.name || activeBatchObj.id || activeBatchObj.classId)) return true;
    if (selectedClass && isClass6to9NameOrId(selectedClass)) return true;
    if (selectedBatch && isClass6to9NameOrId(selectedBatch)) return true;
    if (activeClassObj && !isPrimaryClass(activeClassObj.name) && !isClass10NameOrId(activeClassObj.name)) return true;
    return false;
  }, [isClass10, activeClassObj, activeBatchObj, selectedClass, selectedBatch]);

  // స్ట్రిక్ట్ యాక్సెస్ కంట్రోల్ వేరియబుల్స్
  const looseAccess = isAdmin || profile?.role === 'admin' || profile?.role === 'principal' || hasPermission('exams_manage') || hasPermission('exams_view_all') || hasPermission('classes_view_all');

  const isPlaySchoolIncharge = profile?.role === 'play_school_incharge';

  // Resolved current teacher record from teachers collection if logged-in user profile differs
  const currentTeacherObj = useMemo(() => {
    if (!profile) return null;
    const pUid = profile.uid || profile.id;
    const pEmail = profile.email?.toLowerCase().trim();
    const pName = profile.name ? String(profile.name).toLowerCase().trim() : '';
    const pStaffId = (profile as any)?.staffId;

    return (teachers || []).find((t: any) => {
      if (!t) return false;
      if (pUid && (t.uid === pUid || t.id === pUid)) return true;
      if (pStaffId && (t.staffId === pStaffId || t.uid === pStaffId || t.id === pStaffId)) return true;
      if (pEmail && t.email && String(t.email).toLowerCase().trim() === pEmail) return true;
      if (pName && t.name && String(t.name).toLowerCase().trim() === pName) return true;
      return false;
    }) || null;
  }, [profile, teachers]);

  const teacherIdentifiers = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();

    if (profile) {
      if (profile.uid) ids.add(String(profile.uid));
      if (profile.id) ids.add(String(profile.id));
      if ((profile as any)?.staffId) ids.add(String((profile as any).staffId));
      if (profile.email) ids.add(String(profile.email));
      if (profile.name) names.add(String(profile.name).toLowerCase().trim());
    }

    if (currentTeacherObj) {
      if (currentTeacherObj.uid) ids.add(String(currentTeacherObj.uid));
      if (currentTeacherObj.id) ids.add(String(currentTeacherObj.id));
      if (currentTeacherObj.staffId) ids.add(String(currentTeacherObj.staffId));
      if (currentTeacherObj.email) ids.add(String(currentTeacherObj.email));
      if (currentTeacherObj.name) names.add(String(currentTeacherObj.name).toLowerCase().trim());
    }

    return { ids, names };
  }, [profile, currentTeacherObj]);

  const teacherBatchIds = useMemo(() => {
    const batchSet = new Set<string>();

    if (profile?.batchId) batchSet.add(String(profile.batchId));
    if (Array.isArray((profile as any)?.batchIds)) {
      (profile as any).batchIds.forEach((bId: any) => bId && batchSet.add(String(bId)));
    }
    if ((profile as any)?.classTeacherBatchId) {
      batchSet.add(String((profile as any).classTeacherBatchId));
    }

    if (Array.isArray(profile?.subjectAssignments)) {
      profile.subjectAssignments.forEach((assignment: any) => {
        if (assignment?.batchId) batchSet.add(String(assignment.batchId));
      });
    }

    if (currentTeacherObj) {
      if (currentTeacherObj.batchId) batchSet.add(String(currentTeacherObj.batchId));
      if (Array.isArray(currentTeacherObj.batchIds)) {
        currentTeacherObj.batchIds.forEach((bId: any) => bId && batchSet.add(String(bId)));
      }
      if (currentTeacherObj.classTeacherBatchId) {
        batchSet.add(String(currentTeacherObj.classTeacherBatchId));
      }
      if (Array.isArray(currentTeacherObj.subjectAssignments)) {
        currentTeacherObj.subjectAssignments.forEach((assignment: any) => {
          if (assignment?.batchId) batchSet.add(String(assignment.batchId));
        });
      }
    }

    batches.forEach(b => {
      if (!b) return;
      const bId = String(b.id);
      if (b.classTeacherId && teacherIdentifiers.ids.has(String(b.classTeacherId))) {
        batchSet.add(bId);
      }
      if (b.classTeacher && teacherIdentifiers.names.has(String(b.classTeacher).toLowerCase().trim())) {
        batchSet.add(bId);
      }
      if (b.classTeacherName && teacherIdentifiers.names.has(String(b.classTeacherName).toLowerCase().trim())) {
        batchSet.add(bId);
      }
    });

    if (isPlaySchoolIncharge && batchSet.size === 0) {
      const playSchoolClassIds = classes
        .filter(c => c.name && (
          c.name.toLowerCase().includes('nursery') ||
          c.name.toLowerCase().includes('lkg') ||
          c.name.toLowerCase().includes('ukg')
        ))
        .map(c => String(c.id));

      batches.filter(b => b.classId && playSchoolClassIds.includes(String(b.classId))).forEach(b => {
        batchSet.add(String(b.id));
      });
    }

    return Array.from(batchSet);
  }, [profile, currentTeacherObj, batches, teacherIdentifiers, isPlaySchoolIncharge, classes]);

  const teacherClassIds = useMemo(() => {
    const classSet = new Set<string>();

    if (profile?.classId) classSet.add(String(profile.classId));
    if (Array.isArray((profile as any)?.classIds)) {
      (profile as any).classIds.forEach((cId: any) => cId && classSet.add(String(cId)));
    }

    if (Array.isArray(profile?.subjectAssignments)) {
      profile.subjectAssignments.forEach((assignment: any) => {
        if (assignment?.classId) classSet.add(String(assignment.classId));
      });
    }

    if (currentTeacherObj) {
      if (currentTeacherObj.classId) classSet.add(String(currentTeacherObj.classId));
      if (Array.isArray(currentTeacherObj.classIds)) {
        currentTeacherObj.classIds.forEach((cId: any) => cId && classSet.add(String(cId)));
      }
      if (Array.isArray(currentTeacherObj.subjectAssignments)) {
        currentTeacherObj.subjectAssignments.forEach((assignment: any) => {
          if (assignment?.classId) classSet.add(String(assignment.classId));
        });
      }
    }

    batches.forEach(b => {
      if (b && b.classId && teacherBatchIds.includes(String(b.id))) {
        classSet.add(String(b.classId));
      }
    });

    if (isPlaySchoolIncharge && classSet.size === 0) {
      classes
        .filter(c => c.name && (
          c.name.toLowerCase().includes('nursery') ||
          c.name.toLowerCase().includes('lkg') ||
          c.name.toLowerCase().includes('ukg')
        ))
        .forEach(c => classSet.add(String(c.id)));
    }

    return Array.from(classSet);
  }, [profile, currentTeacherObj, batches, teacherBatchIds, isPlaySchoolIncharge, classes]);

  const classTeacherBatches = useMemo(() => {
    const strictlyAssigned = batches.filter(b => {
      if (!b) return false;
      const bId = String(b.id);
      if (teacherBatchIds.includes(bId)) return true;
      if (b.classTeacherId && teacherIdentifiers.ids.has(String(b.classTeacherId))) return true;
      if (b.classTeacher && teacherIdentifiers.names.has(String(b.classTeacher).toLowerCase().trim())) return true;
      if (b.classTeacherName && teacherIdentifiers.names.has(String(b.classTeacherName).toLowerCase().trim())) return true;
      if ((profile as any)?.classTeacherBatchId && bId === String((profile as any).classTeacherBatchId)) return true;
      return false;
    });

    if (strictlyAssigned.length > 0) return strictlyAssigned;

    if (profile?.batchId) {
      const bMatch = batches.filter(b => String(b.id) === String(profile.batchId));
      if (bMatch.length > 0) return bMatch;
    }

    return [];
  }, [batches, teacherBatchIds, teacherIdentifiers, profile]);

  const classTeacherClassIds = useMemo(() => {
    return Array.from(new Set(classTeacherBatches.map(b => String(b.classId)).filter(Boolean)));
  }, [classTeacherBatches]);

  const isUserConstrained = !isAdmin && profile?.role !== 'admin' && profile?.role !== 'principal' && (isTeacherRole || isPlaySchoolIncharge || hasPermission('exams_view_my_strict'));

  const availableClasses = useMemo(() => {
    return classes.filter(c => {
      if (!c) return false;
      if (!isUserConstrained) return true;

      const cId = String(c.id);

      if (teacherBatchIds.length > 0) {
        return batches.some(b => teacherBatchIds.includes(String(b.id)) && String(b.classId) === cId);
      }

      if (teacherClassIds.length > 0) {
        return teacherClassIds.includes(cId);
      }

      return true;
    });
  }, [classes, isUserConstrained, batches, teacherBatchIds, teacherClassIds]);

  const availableBatches = useMemo(() => {
    return batches.filter(b => {
      if (!b) return false;
      const bId = String(b.id);
      const bClassId = String(b.classId);

      const isMainClassMatched = selectedClass ? bClassId === String(selectedClass) : true;
      if (!isMainClassMatched) return false;

      if (!isUserConstrained) return true;

      if (teacherBatchIds.length > 0) {
        return teacherBatchIds.includes(bId);
      }

      if (classTeacherBatches.length > 0) {
        return classTeacherBatches.some(cb => String(cb.id) === bId);
      }

      return false;
    });
  }, [batches, selectedClass, isUserConstrained, teacherBatchIds, classTeacherBatches]);

  const teacherAssignedSubjects = useMemo(() => {
    const names = new Set<string>();
    const ids = new Set<string>();

    const NON_SUBJECT_TERMS = [
      'teaching', 'non-teaching', 'staff', 'primary', 'primary teacher',
      'class teacher', 'high school', 'highschool', 'academic', 'general',
      'n/a', 'none', 'all', 'teacher', 'admin', 'principal', 'headmaster',
      'incharge', 'play school', 'playschool', 'kg', 'kindergarten'
    ];

    const addSub = (item: any) => {
      if (!item) return;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        const lower = trimmed.toLowerCase();
        if (trimmed && !NON_SUBJECT_TERMS.includes(lower)) {
          names.add(lower);
          ids.add(trimmed);
        }
      } else if (Array.isArray(item)) {
        item.forEach(addSub);
      } else if (typeof item === 'object') {
        if (item.id) ids.add(String(item.id));
        if (item.subjectId) ids.add(String(item.subjectId));
        if (item.code) ids.add(String(item.code));
        const possibleName = item.name || item.subjectName || item.title || item.subject;
        if (possibleName) {
          const lower = String(possibleName).toLowerCase().trim();
          if (!NON_SUBJECT_TERMS.includes(lower)) {
            names.add(lower);
          }
        }
      }
    };

    if (profile) {
      addSub((profile as any).subject);
      addSub((profile as any).subjectName);
      addSub((profile as any).assignedSubject);
      addSub((profile as any).assignedSubjects);
      addSub((profile as any).primarySubject);
      if (Array.isArray(profile.subjects)) addSub(profile.subjects);
      if (Array.isArray((profile as any).subjectAssignments)) addSub((profile as any).subjectAssignments);
    }

    if (currentTeacherObj) {
      addSub(currentTeacherObj.subject);
      addSub(currentTeacherObj.subjectName);
      addSub(currentTeacherObj.assignedSubject);
      addSub(currentTeacherObj.assignedSubjects);
      addSub(currentTeacherObj.primarySubject);
      if (Array.isArray(currentTeacherObj.subjects)) addSub(currentTeacherObj.subjects);
      if (Array.isArray(currentTeacherObj.subjectAssignments)) addSub(currentTeacherObj.subjectAssignments);
    }

    return { names, ids };
  }, [profile, currentTeacherObj]);

  const availableSubjects = useMemo(() => {
    if (!subjects || subjects.length === 0) return [];

    const hasBaseAccess = isAdmin || profile?.role === 'admin' || profile?.role === 'principal' || (hasPermission('exams_manage') && !isTeacherRole);

    // 1. Class-specific subject filtering (if subject specifies classId)
    let classFiltered = subjects.filter(s => {
      if (!s) return false;
      if (selectedClass && s.classId && s.classId !== selectedClass) return false;
      return true;
    });

    if (classFiltered.length === 0) {
      classFiltered = subjects;
    }

    // 2. Role-based subject filtering for teachers
    let teacherFiltered = classFiltered;
    if (!hasBaseAccess && (teacherAssignedSubjects.names.size > 0 || teacherAssignedSubjects.ids.size > 0)) {
      const filtered = classFiltered.filter(s => {
        const sId = String(s.id || '');
        const sCode = String(s.code || '');
        const sName = String(s.name || '').toLowerCase().trim();

        const matchesId = (sId && teacherAssignedSubjects.ids.has(sId)) || (sCode && teacherAssignedSubjects.ids.has(sCode));
        const matchesName = sName && (
          teacherAssignedSubjects.names.has(sName) ||
          Array.from(teacherAssignedSubjects.names).some(tName => tName && (sName.includes(tName) || tName.includes(sName)))
        );
        const matchesTeacherId = s.teacherId && teacherIdentifiers.ids.has(String(s.teacherId));
        const matchesTeacherName = s.teacherName && teacherIdentifiers.names.has(String(s.teacherName).toLowerCase().trim());

        return matchesId || matchesName || matchesTeacherId || matchesTeacherName;
      });

      if (filtered.length > 0) {
        teacherFiltered = filtered;
      }
    }

    // 3. Exam Schedule filtering for subject-entry (only if schedules exist for this exam)
    if (activeTab === 'subject-entry' && selectedExam) {
      const activeExamObj = (exams || []).find((e: any) => e.id === selectedExam || e.title === selectedExam);
      const activeExamTitle = (activeExamObj?.title || selectedExam || '').toLowerCase().trim();
      const activeBatchObj = (batches || []).find((b: any) => b.id === selectedBatch);
      const activeBatchName = (activeBatchObj?.name || selectedBatch || '').toLowerCase().trim();
      const activeClassObj = (classes || []).find((c: any) => c.id === selectedClass);
      const activeClassName = (activeClassObj?.name || selectedClass || '').toLowerCase().trim();

      const examSchedsForThisExam = (examSchedules || []).filter((sch: any) => {
        const schExamId = String(sch.examId || '');
        const schExamTitle = String(sch.examTitle || sch.examId || '').toLowerCase().trim();
        const matchesExam = (schExamId === selectedExam) || (activeExamObj && schExamId === activeExamObj.id) || (schExamTitle === activeExamTitle);
        if (!matchesExam) return false;

        const schBatchId = String(sch.batchId || '');
        const schBatchName = String(sch.batchName || '').toLowerCase().trim();
        const schClassId = String(sch.classId || '');
        const schClassName = String(sch.className || '').toLowerCase().trim();

        if (selectedBatch && (schBatchId === selectedBatch || schBatchName === activeBatchName || schBatchId.toLowerCase().trim() === activeBatchName)) return true;
        if (selectedClass && (schClassId === selectedClass || schClassName === activeClassName || schClassId.toLowerCase().trim() === activeClassName)) return true;
        if (!selectedBatch && !selectedClass) return true;
        return false;
      });

      if (examSchedsForThisExam.length > 0) {
        const scheduledSubjectIds = new Set(examSchedsForThisExam.map((s: any) => String(s.subjectId || '')));
        const scheduledSubjectNames = new Set(examSchedsForThisExam.map((s: any) => String(s.subjectName || '').toLowerCase().trim()));

        const scheduled = teacherFiltered.filter((s: any) => {
          const sId = String(s.id || '');
          const sName = String(s.name || '').toLowerCase().trim();

          return scheduledSubjectIds.has(sId) || 
                 scheduledSubjectNames.has(sName) || 
                 Array.from(scheduledSubjectNames).some(schName => schName && (sName.includes(schName) || schName.includes(sName)));
        });

        // Also add any scheduled subjects from schedule not already in teacherFiltered
        examSchedsForThisExam.forEach((sch: any) => {
          const schName = (sch.subjectName || '').trim();
          const exists = scheduled.some((s: any) => 
            (sch.subjectId && String(s.id) === String(sch.subjectId)) ||
            (schName && (s.name || '').toLowerCase().trim() === schName.toLowerCase())
          );
          if (!exists && schName) {
            scheduled.push({
              id: sch.subjectId || `sched_${schName.replace(/\s+/g, '_')}`,
              name: schName,
              code: schName.toUpperCase()
            });
          }
        });

        if (scheduled.length > 0) {
          return [...scheduled].sort(compareSubjectsStandard);
        }
      }
    }

    return [...teacherFiltered].sort(compareSubjectsStandard);
  }, [subjects, isAdmin, profile, isTeacherRole, teacherAssignedSubjects, selectedClass, activeTab, selectedExam, examSchedules, selectedBatch, teacherIdentifiers, hasPermission]);

  // Sync selected batch when class changes
  useEffect(() => {
    if (selectedClass) {
      const classBatches = availableBatches.filter(b => b.classId === selectedClass);
      if (classBatches.length > 0) {
        if (!selectedBatch || !classBatches.find(b => b.id === selectedBatch)) {
          setSelectedBatch(classBatches[0].id);
        }
      } else {
        setSelectedBatch('');
      }
    }
  }, [selectedClass, availableBatches, selectedBatch]);

  // Auto-select first available class for teachers or when selection is invalid
  useEffect(() => {
    if (availableClasses.length > 0) {
      if (!selectedClass || !availableClasses.some(c => c.id === selectedClass)) {
        setSelectedClass(availableClasses[0].id);
      }
    } else {
      setSelectedClass('');
    }
  }, [availableClasses, selectedClass, activeTab]);

  // Secondary auto-select for batch
  useEffect(() => {
    if (selectedClass && availableBatches.length > 0) {
      if (!selectedBatch || !availableBatches.some(b => b.id === selectedBatch)) {
        setSelectedBatch(availableBatches[0].id);
      }
    } else if (!selectedClass) {
      setSelectedBatch('');
    }
  }, [selectedClass, availableBatches, selectedBatch, activeTab]);

  // Reset or auto-select selected subject when available subjects change
  useEffect(() => {
    if (activeTab === 'subject-entry') {
      if (availableSubjects.length > 0) {
        if (!selectedSubject || !availableSubjects.some(s => s.id === selectedSubject)) {
          setSelectedSubject(availableSubjects[0].id);
        }
      } else {
        setSelectedSubject('');
      }
    }
  }, [selectedExam, selectedBatch, availableSubjects, selectedSubject, activeTab]);

  useEffect(() => {
    let unsubscribeExams: (() => void) | undefined;
    const init = async () => {
      setLoading(true);
      try {
        const roles = await dbService.list('roles').catch(() => []);
        const defaultRoles = ['teacher', 'accountant', 'clerk', 'admin', 'principal', 'vice_principal', 'staff', 'driver', 'attendant', 'helper', 'aya', 'coordinator', 'front_office', 'receptionist'];
        const staffRoles = Array.from(new Set([...defaultRoles, ...roles.filter((r: any) => !r.isDeleted).map((r: any) => r.id)])).slice(0, 30);

        const [classesData, batchesData, subjectsData, teachersData] = await Promise.all([
          dbService.list('classes').catch(e => { console.error("Exams component error listing classes:", e); return []; }),
          dbService.list('batches').catch(e => { console.error("Exams component error listing batches:", e); return []; }),
          dbService.list('subjects').catch(e => { console.error("Exams component error listing subjects:", e); return []; }),
          dbService.list('staff', [where('role', 'in', staffRoles)]).catch(async (e) => {
            console.warn("Exams query failure on staff 'in' roles, falling back to listing all staff:", e);
            return dbService.list('staff').catch(innerErr => {
              console.error("Exams fallback staff fetch also failed:", innerErr);
              return [];
            });
          })
        ]);
        
        setTeachers(teachersData || []);

        if (isTeacherRole || profile?.isTeacherPortal || profile?.role === 'teacher') {
          const assignments = await getTeacherAssignments(user, profile, profile?.role || '');
          let filteredBatches = filterBatchesForTeacher(batchesData as any[], assignments);
          let filteredClasses = filterClassesForTeacher(classesData as any[], assignments, batchesData as any[]);

          // Direct fallback if teacher assignments resolution was empty
          if (filteredBatches.length === 0) {
            const uid = (profile?.uid || user?.uid || profile?.id || '').toLowerCase().trim();
            const email = (user?.email || profile?.email || '').toLowerCase().trim();
            const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const nameNorm = norm(user?.displayName || profile?.name || '');

            const directBatches = (batchesData as any[]).filter(b => {
              const bCTId = String(b.classTeacherId || '').toLowerCase().trim();
              const bCTEmail = String(b.classTeacherEmail || '').toLowerCase().trim();
              const bCT = norm(b.classTeacher || b.classTeacherName || '');
              return (
                (uid && bCTId === uid) ||
                (email && bCTEmail === email) ||
                (nameNorm && bCT && bCT === nameNorm) ||
                (b.id === (profile as any)?.classTeacherBatchId) ||
                (b.id === profile?.batchId) ||
                (Array.isArray((profile as any)?.batchIds) && (profile as any).batchIds.includes(b.id))
              );
            });

            if (directBatches.length > 0) {
              filteredBatches = directBatches;
              const directClassIds = new Set(directBatches.map(b => b.classId));
              filteredClasses = (classesData as any[]).filter(c => directClassIds.has(c.id));
            }
          } else {
            const directClassIds = new Set(filteredBatches.map(b => b.classId).filter(Boolean));
            filteredClasses = (classesData as any[]).filter(c => directClassIds.has(c.id));
          }

          setClasses(sortAlphabetically(filteredClasses, 'name', globalSortDirection));
          setBatches(sortAlphabetically(filteredBatches, 'name', globalSortDirection));
        } else {
          setClasses(sortAlphabetically(classesData as any[], 'name', globalSortDirection));
          setBatches(sortAlphabetically(batchesData as any[], 'name', globalSortDirection));
        }
        
        setSubjects(sortAlphabetically(subjectsData as any[], 'name', globalSortDirection));

        unsubscribeExams = dbService.subscribe('exams', [], (data) => {
          if ((profile?.role === 'student' || profile?.role === 'parent' || isTeacherRole || hasPermission('exams_view_my_strict')) && !hasPermission('exams_manage')) {
            setExams(data.filter(e => e.status === 'scheduled'));
          } else {
            setExams(data);
          }
        });
      } catch (error) {
        console.error('Error fetching initial data:', error);
        toast.error('Failed to load initial data');
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => {
      if (unsubscribeExams) unsubscribeExams();
    };
  }, [hasPermission, profile, globalSortDirection, looseAccess]);

  // Subscribe to examSchedules
  useEffect(() => {
    const unsubscribeSchedules = dbService.subscribe('examSchedules', [], (data) => {
      setExamSchedules(data);
    });
    return () => {
      if (unsubscribeSchedules) unsubscribeSchedules();
    };
  }, []);

  // getDeterministicExamPercent
  const getDeterministicExamPercent = (studentId: string, examId: string, subjectId: string): number => {
    const str = `${studentId}_${examId}_${subjectId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const percent = 80 + (Math.abs(hash) % 13); // 80 to 92 inclusive
    return percent / 100;
  };

  // getNonAttendingStudentMark
  const getNonAttendingStudentMark = (student: any, exam: any, subjectId: string) => {
    if (!exam) return null;
    const isSA = exam.type === 'SA';
    const percent = getDeterministicExamPercent(student.id || student.uid, exam.id, subjectId);
    
    const st1Max = exam.st1Max !== undefined ? Number(exam.st1Max) : 10;
    const st2Max = exam.st2Max !== undefined ? Number(exam.st2Max) : 10;
    const homeworkMax = exam.homeworkMax !== undefined ? Number(exam.homeworkMax) : 5;
    const writtenMax = exam.writtenMax !== undefined ? Number(exam.writtenMax) : 25;
    const saWrittenMax = exam.saWrittenMax !== undefined ? Number(exam.saWrittenMax) : 100;

    return {
      id: `${exam.id}_${student.id || student.uid}_${subjectId}`,
      studentId: student.id || student.uid,
      examId: exam.id,
      subjectId,
      batchId: student.batchId || selectedBatch,
      classId: student.classId || selectedClass,
      st1: isSA ? 0 : Math.round(st1Max * percent),
      st2: isSA ? 0 : Math.round(st2Max * percent),
      hw: isSA ? 0 : Math.round(homeworkMax * percent),
      faWritten: isSA ? 0 : Math.round(writtenMax * percent),
      saWritten: isSA ? Math.round(saWrittenMax * percent) : 0,
      isAutomatic: true
    };
  };

  const handleDeleteStudentPermanently = async (student: any) => {
    const studentId = student.id || student.uid;
    const studentName = student.name || student.studentName || 'this student';
    const rollNo = student.rollNumber || student.rollNo || student.uniqueStudentId || '';
    
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete "${studentName}" ${rollNo ? `(Roll: ${rollNo})` : ''} from the database?\n\nThis will remove the student from all classes, marks, and attendance records permanently.`)) {
      return;
    }
    
    try {
      setLoading(true);
      await dbService.delete('students', studentId);
      if (student.uid) {
        try {
          await dbService.delete('users', student.uid);
        } catch (uErr) {
          // ignore if user doc does not exist
        }
      }
      setStudents(prev => prev.filter((s: any) => (s.id || s.uid) !== studentId));
      toast.success(`Student "${studentName}" deleted permanently from database.`);
    } catch (err: any) {
      console.error("Failed to delete student:", err);
      toast.error(`Failed to delete student: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Load students and marks of selected batch
  useEffect(() => {
    let active = true;
    const loadBatchData = async () => {
      if (!selectedBatch) {
        if (active) {
          setStudents([]);
          setMarks([]);
        }
        return;
      }
      setLoading(true);
      try {
        // 1. Fetch students by batchId
        const batchStudents = await dbService.list('students', [where('batchId', '==', selectedBatch)]);
        
        // 2. Also fetch students by classId to catch any shifted students
        let classStudents: any[] = [];
        if (selectedClass) {
          classStudents = await dbService.list('students', [where('classId', '==', selectedClass)]);
        }

        const activeBatchObj = batches.find((b: any) => b.id === selectedBatch || b.name === selectedBatch || String(b.name || '').toLowerCase().trim() === String(selectedBatch).toLowerCase().trim());
        const targetBatchId = activeBatchObj?.id || selectedBatch;
        const targetBatchName = activeBatchObj?.name ? activeBatchObj.name.toLowerCase().trim() : String(selectedBatch).toLowerCase().trim();

        const activeClassObj = classes.find((c: any) => c.id === selectedClass || c.name === selectedClass || String(c.name || '').toLowerCase().trim() === String(selectedClass).toLowerCase().trim());
        const targetClassId = activeClassObj?.id || selectedClass;
        const targetClassName = activeClassObj?.name ? activeClassObj.name.toLowerCase().trim() : String(selectedClass).toLowerCase().trim();

        const isStudentInSelectedBatch = (s: any) => {
          if (!s) return false;
          if (s.isDeleted === true || s.deleted === true) return false;
          const status = String(s.status || '').toLowerCase().trim();
          if (status === 'inactive' || status === 'dropped' || status === 'archived' || status === 'left') return false;

          // 1. Strict Class Check: If selectedClass is set, student must belong to selectedClass
          if (selectedClass) {
            const sClassId = String(s.classId || '').trim();
            if (sClassId && targetClassId) {
              if (sClassId !== targetClassId && sClassId !== selectedClass) return false;
            } else if (targetClassName) {
              const sClassName = String(s.className || s.class || s.grade || s.standard || '').toLowerCase().trim();
              if (sClassName && !sClassName.includes(targetClassName) && !targetClassName.includes(sClassName)) {
                return false;
              }
            }
          }

          // 2. Strict Batch Check: If selectedBatch is set, student must belong to selectedBatch
          if (!selectedBatch || selectedBatch === 'all') return true;

          const sBatchId = String(s.batchId || '').trim();
          const sBatch = String(s.batch || '').toLowerCase().trim();
          const sSection = String(s.section || '').toLowerCase().trim();
          const sBatchName = String(s.batchName || '').toLowerCase().trim();

          // A) Direct ID or Name match on sBatchId
          if (sBatchId) {
            if (sBatchId === targetBatchId || sBatchId === selectedBatch) {
              return true;
            }
            if (targetBatchName && sBatchId.toLowerCase().trim() === targetBatchName) {
              return true;
            }

            // sBatchId is set to a non-empty string that does NOT equal targetBatchId / selectedBatch / targetBatchName.
            // Check if sBatchId matches another batch object in `batches`
            const studentBatchObj = batches.find((b: any) => b.id === sBatchId || b.name === sBatchId || String(b.name || '').toLowerCase().trim() === sBatchId.toLowerCase().trim());
            if (studentBatchObj) {
              const sBatchObjName = String(studentBatchObj.name || '').toLowerCase().trim().replace(/[-_\s]/g, '');
              const normTarget = targetBatchName.replace(/[-_\s]/g, '');
              if (studentBatchObj.id !== targetBatchId && sBatchObjName !== normTarget) {
                return false;
              }
              return true;
            } else {
              // sBatchId is set to an ID/value that does NOT match targetBatchId. Therefore student belongs to another batch!
              return false;
            }
          }

          // B) Fallback if sBatchId is empty: Check string match on sBatch / sSection / sBatchName
          if (targetBatchName) {
            const normTarget = targetBatchName.replace(/[-_\s]/g, '');
            const normBatch = sBatch.replace(/[-_\s]/g, '');
            const normSection = sSection.replace(/[-_\s]/g, '');
            const normBatchName = sBatchName.replace(/[-_\s]/g, '');

            if (sBatch === targetBatchName || sSection === targetBatchName || sBatchName === targetBatchName) return true;
            if (normBatch === normTarget || normSection === normTarget || normBatchName === normTarget) return true;

            // If student has explicit string batch/section that differs from targetBatchName
            if (sBatch || sSection || sBatchName) {
              return false;
            }
          }

          return sBatchId === targetBatchId || sBatchId === selectedBatch;
        };

        // Combine student records without duplicates, verifying class & batch match
        const map = new Map<string, any>();
        const combineList = [...(batchStudents || []), ...(classStudents || [])];
        combineList.forEach((s: any) => {
          const sid = s.id || s.uid;
          if (!sid) return;

          if (isStudentInSelectedBatch(s)) {
            map.set(sid, s);
          }
        });

        const allStudentsInBatch = Array.from(map.values());
        if (!active) return;

        const filteredStudents = allStudentsInBatch.filter(
          (s: any) => (s.status === 'active' || s.status === 'non_attending' || !s.status) &&
                      s.status !== 'inactive' &&
                      s.status !== 'dropped' &&
                      !s.isDeleted &&
                      !isDemoStudentRecord(s) &&
                      !isKnownDemoName(s.name || s.studentName)
        );

        const sorted = [...filteredStudents].sort(sortByRollNumber);
        setStudents(sorted);

        // 3. Fetch exam marks for batch AND for the student IDs
        const batchMarks = await dbService.list('examMarks', [where('batchId', '==', selectedBatch)]);
        const studentIds = sorted.map((s: any) => s.id || s.uid).filter(Boolean);
        
        let studentSpecificMarks: any[] = [];
        if (studentIds.length > 0) {
          // Chunk requests of 30 due to Firestore 'in' query limitations
          for (let i = 0; i < studentIds.length; i += 30) {
            const chunk = studentIds.slice(i, i + 30);
            try {
              const chunkMarks = await dbService.list('examMarks', [where('studentId', 'in', chunk)]);
              if (Array.isArray(chunkMarks)) {
                studentSpecificMarks.push(...chunkMarks);
              }
            } catch (err) {
              console.warn('Error fetching student specific marks:', err);
            }
          }
        }

        const marksMap = new Map<string, any>();
        (batchMarks || []).forEach((m: any) => {
          if (m.id) marksMap.set(m.id, m);
        });
        studentSpecificMarks.forEach((m: any) => {
          if (m.id) marksMap.set(m.id, m);
        });

        if (active) {
          setMarks(Array.from(marksMap.values()));
        }
      } catch (error) {
        console.error('Error loading batch students/marks:', error);
        toast.error('Failed to load students or marks data');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBatchData();
    return () => {
      active = false;
    };
  }, [selectedBatch, selectedClass, globalSortDirection, batches]);

  // Dynamically resolve/augment marks to include automatic ones for non-attending students
  const resolvedMarks = React.useMemo(() => {
    const baseMarks = [...marks];
    const nonAttendingStudents = students.filter(s => s.status === 'non_attending');
    
    if (nonAttendingStudents.length === 0) return baseMarks;

    const allExams = exams;
    const allSubjects = subjects;

    nonAttendingStudents.forEach(student => {
      allExams.forEach(exam => {
        allSubjects.forEach(subject => {
          const studentId = student.id || student.uid;
          const exists = baseMarks.some(m => m.studentId === studentId && m.examId === exam.id && m.subjectId === subject.id);
          if (!exists) {
            const autoMark = getNonAttendingStudentMark(student, exam, subject.id);
            if (autoMark) {
              baseMarks.push(autoMark);
            }
          }
        });
      });
    });

    return baseMarks;
  }, [marks, students, exams, subjects]);

  const handleExportReport = async () => {
    toast.loading("Generating report...", { id: 'export-report' });
    try {
      const format = exportSettings.paperSize === 'A4' ? 'a4' : 'a3';
      const orientation = exportSettings.orientation;
      
      const doc = new jsPDF({
        orientation: orientation,
        unit: 'pt',
        format: format
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      doc.setFontSize(18);
      doc.setTextColor(0, 51, 102);
      doc.text("EXAMINATION REPORT", pageWidth / 2, 40, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Academic Year: ${settings?.currentAcademicYear || '2026-27'}`, 40, 60);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth - 40, 60, { align: 'right' });

      if (activeTab === 'central-register') {
        if (!selectedBatch || selectedBatch === 'all') {
          toast.error("Please select a batch first");
          return;
        }

        const batch = batches.find(b => b.id === selectedBatch);
        const cls = classes.find(c => c.id === selectedClass);
        const teacher = teachers.find(t => (t.uid && t.uid === batch?.classTeacherId) || (t.id && t.id === batch?.classTeacherId) || (t.customId && t.customId === batch?.classTeacherId)) || (batch?.classTeacherName || batch?.classTeacher ? { name: batch.classTeacherName || batch.classTeacher } : null);
        
        const yearPart = settings?.currentAcademicYear?.split('-')[0] || '2026';
        const startYearNum = parseInt(yearPart.length === 2 ? `20${yearPart}` : yearPart) || 2026;
        const start = `${startYearNum}-06-01`;
        const end = `${startYearNum + 1}-05-31`;

        const [rawBatchMarks, allAttendance, workingDaysDoc, globalWorkingDaysDoc, holidayList] = await Promise.all([
          dbService.list('examMarks', [where('batchId', '==', selectedBatch)]),
          dbService.list('attendance', [
            where('date', '>=', start),
            where('date', '<=', end)
          ]),
          dbService.get('examSettings', `workingDays-${selectedBatch}`),
          dbService.get('examSettings', 'workingDays-school'),
          dbService.list('holidays').catch(() => [] as any[])
        ]);

        const nonAttendingStudentsForExport = students.filter(s => s.status === 'non_attending');
        const allBatchMarks = [...(rawBatchMarks || [])];
        
        nonAttendingStudentsForExport.forEach(student => {
          exams.forEach(exam => {
            subjects.forEach(subject => {
              const studentId = student.id || student.uid;
              const exists = allBatchMarks.some(m => m.studentId === studentId && m.examId === exam.id && m.subjectId === subject.id);
              if (!exists) {
                const autoMark = getNonAttendingStudentMark(student, exam, subject.id);
                if (autoMark) {
                  allBatchMarks.push(autoMark);
                }
              }
            });
          });
        });

        const studentIds = new Set(students.map((s: any) => s.id || s.uid));
        const batchAttendance = (allAttendance || []).filter((a: any) => studentIds.has(a.studentId));

        let workingDaysData = globalWorkingDaysDoc?.data || workingDaysDoc?.data;
        
        if (!workingDaysData) {
          const yearPart = settings?.currentAcademicYear?.split('-')[0] || '2026';
          const startYear = parseInt(yearPart.length === 2 ? `20${yearPart}` : yearPart) || 2026;
          const endYear = startYear + 1;
          workingDaysData = calculateAutoWorkingDaysForYear(startYear, endYear, holidayList);
        } else {
          workingDaysData = { ...workingDaysData, JUNE: 14, JULY: 25, june: 14, july: 25 };
        }

        doc.setFontSize(14);
        doc.setTextColor(30);
        doc.text(`CENTRAL MARKS REGISTER - ${cls?.name || 'Class'} ${batch?.name || ''}`, pageWidth / 2, 85, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Class Teacher: ${teacher?.name || 'Not Assigned'}`, pageWidth / 2, 100, { align: 'center' });

        const activeSubjects = subjects.filter(s => 
          allBatchMarks.some(m => m.subjectId === s.id) || getStandardSubjectRank(s.name) < 100
        ).sort(compareSubjectsStandard);

        const headRow1: any[] = [
          { content: 'Admn No', rowSpan: 2 },
          { content: 'SNo', rowSpan: 2 },
          { content: 'Student Name', rowSpan: 2 },
          { content: 'Caste', rowSpan: 2 }
        ];
        
        activeSubjects.forEach(sub => {
          headRow1.push({ content: sub.name.toUpperCase(), colSpan: 4, styles: { halign: 'center' } });
        });
        
        headRow1.push(
          { content: 'Grand Total', rowSpan: 2 },
          { content: 'Att %', rowSpan: 2 },
          { content: 'Result', rowSpan: 2 }
        );

        const headRow2: any[] = [];
        activeSubjects.forEach(() => {
          headRow2.push('FA Avg', 'SA-1', 'SA-2', 'Total');
        });

        const tableBody: any[][] = [];
        students.forEach((s: any, idx: number) => {
          const studentId = s.id || s.uid;
          
          let presentCount = batchAttendance.filter(a => a.studentId === studentId && (a.status === 'present' || a.status === 'present_half')).length;
          const workingDaysValues = Object.values(workingDaysData) as number[];
          const totalWorkingDays = workingDaysValues.reduce((a: number, b: number) => a + b, 0) || 220;
          
          if (s.status === 'non_attending') {
            const hash = s.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
            const attendancePercent = 80 + (hash % 13);
            presentCount = Math.round(totalWorkingDays * (attendancePercent / 100));
          }
          
          const attPercentage = ((presentCount / totalWorkingDays) * 100).toFixed(1) + '%';

          const row: any[] = [
            s.admissionNumber || '-',
            idx + 1,
            s.name,
            s.caste || '-'
          ];

          let rowGrandTotal = 0;
          let anyFailure = false;
          let hasAnyData = false;

          activeSubjects.forEach(sub => {
            const subjectMarks = allBatchMarks.filter(m => m.studentId === studentId && m.subjectId === sub.id);
            const faMarks = subjectMarks.filter(m => {
              const exam = exams.find(e => e.id === m.examId);
              return exam?.type === 'FA';
            });
            const sa1Mark = subjectMarks.find(m => {
              const exam = exams.find(e => e.id === m.examId);
              return exam?.type === 'SA' && (exam.title?.includes('1') || exam.examNumber === 1);
            });
            const sa2Mark = subjectMarks.find(m => {
              const exam = exams.find(e => e.id === m.examId);
              return exam?.type === 'SA' && (exam.title?.includes('2') || exam.examNumber === 2);
            });

            const faTotals = faMarks.map(m => (Number(m.st1) || 0) + (Number(m.st2) || 0) + (Number(m.hw) || 0) + (Number(m.faWritten) || 0));
            const faSum = faTotals.reduce((a, b) => a + b, 0);
            const faWeighted = (faSum / 200) * 25;
            const sa1Weighted = (Number(sa1Mark?.saWritten || 0) / 100) * 25;
            const sa2Weighted = (Number(sa2Mark?.saWritten || 0) / 100) * 50;
            const subTotal = faWeighted + sa1Weighted + sa2Weighted;

            const subHasMarks = faMarks.length > 0 || !!sa1Mark || !!sa2Mark;
            if (subHasMarks) hasAnyData = true;
            rowGrandTotal += subTotal;
            if (subTotal < 35 && subHasMarks) anyFailure = true;

            row.push(
              subHasMarks ? Math.round(faWeighted) : '-',
              subHasMarks ? Math.round(sa1Weighted) : '-',
              subHasMarks ? Math.round(sa2Weighted) : '-',
              subHasMarks ? Math.round(subTotal) : '-'
            );
          });

          row.push(
            hasAnyData ? Math.round(rowGrandTotal) : '-',
            attPercentage,
            hasAnyData ? ((anyFailure || rowGrandTotal === 0) ? 'NOT PROMOTED' : 'PROMOTED') : '-'
          );
          
          tableBody.push(row);
      });

      const headRowAvg: any[] = [
        { content: 'Batch Averages', colSpan: 4, styles: { fontStyle: 'italic', halign: 'right' } }
      ];

      activeSubjects.forEach(sub => {
        let subjectsTotalFA = 0;
        let subjectsTotalSA1 = 0;
        let subjectsTotalSA2 = 0;
        let subjectsTotalFinal = 0;
        let count = 0;

        students.forEach((s: any) => {
          const studentId = s.id || s.uid;
          const subjectMarks = allBatchMarks.filter(m => m.studentId === studentId && m.subjectId === sub.id);
          const faMarks = subjectMarks.filter(m => {
            const exam = exams.find(e => e.id === m.examId);
            return exam?.type === 'FA';
          });
          const sa1Mark = subjectMarks.find(m => {
            const exam = exams.find(e => e.id === m.examId);
            return exam?.type === 'SA' && (exam.title?.includes('1') || exam.examNumber === 1);
          });
          const sa2Mark = subjectMarks.find(m => {
            const exam = exams.find(e => e.id === m.examId);
            return exam?.type === 'SA' && (exam.title?.includes('2') || exam.examNumber === 2);
          });

          if (faMarks.length > 0 || sa1Mark || sa2Mark) {
            const faTotals = faMarks.map(m => (Number(m.st1) || 0) + (Number(m.st2) || 0) + (Number(m.hw) || 0) + (Number(m.faWritten) || 0));
            const faSum = faTotals.reduce((a, b) => a + b, 0);
            const faWeighted = (faSum / 200) * 25;
            const sa1Weighted = (Number(sa1Mark?.saWritten || 0) / 100) * 25;
            const sa2Weighted = (Number(sa2Mark?.saWritten || 0) / 100) * 50;
            const subTotal = faWeighted + sa1Weighted + sa2Weighted;

            subjectsTotalFA += faWeighted;
            subjectsTotalSA1 += sa1Weighted;
            subjectsTotalSA2 += sa2Weighted;
            subjectsTotalFinal += subTotal;
            count++;
          }
        });

        if (count > 0) {
          headRowAvg.push(
            Math.round(subjectsTotalFA / count),
            Math.round(subjectsTotalSA1 / count),
            Math.round(subjectsTotalSA2 / count),
            Math.round(subjectsTotalFinal / count)
          );
        } else {
          headRowAvg.push('-', '-', '-', '-');
        }
      });

      let totalAttPercentage = 0;
      let totalGrandMarks = 0;
      let markCount = 0;

      students.forEach((s: any) => {
        const studentId = s.id || s.uid;
        let presentCount = batchAttendance.filter(a => a.studentId === studentId && (a.status === 'present' || a.status === 'present_half')).length;
        const workingDaysValues = Object.values(workingDaysData) as number[];
        const totalWorkingDays = workingDaysValues.reduce((a: number, b: number) => a + b, 0) || 220;
        
        if (s.status === 'non_attending') {
          const hash = s.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
          const attendancePercent = 80 + (hash % 13);
          presentCount = Math.round(totalWorkingDays * (attendancePercent / 100));
        }
        
        totalAttPercentage += (presentCount / totalWorkingDays) * 100;
        
        let studentGrandTotal = 0;
        let hasMarks = false;
        activeSubjects.forEach(sub => {
          const subjectMarks = allBatchMarks.filter(m => m.studentId === studentId && m.subjectId === sub.id);
          const faMarks = subjectMarks.filter(m => {
            const exam = exams.find(e => e.id === m.examId);
            return exam?.type === 'FA';
          });
          const sa1Mark = subjectMarks.find(m => {
            const exam = exams.find(e => e.id === m.examId);
            return exam?.type === 'SA' && (exam.title?.includes('1') || exam.examNumber === 1);
          });
          const sa2Mark = subjectMarks.find(m => {
            const exam = exams.find(e => e.id === m.examId);
            return exam?.type === 'SA' && (exam.title?.includes('2') || exam.examNumber === 2);
          });
          if (faMarks.length > 0 || sa1Mark || sa2Mark) {
            hasMarks = true;
            const faSum = faMarks.map(m => (Number(m.st1) || 0) + (Number(m.st2) || 0) + (Number(m.hw) || 0) + (Number(m.faWritten) || 0)).reduce((a, b) => a + b, 0);
            studentGrandTotal += (faSum / 200) * 25 + (Number(sa1Mark?.saWritten || 0) / 100) * 25 + (Number(sa2Mark?.saWritten || 0) / 100) * 50;
          }
        });
        if (hasMarks) {
          totalGrandMarks += studentGrandTotal;
          markCount++;
        }
      });

      headRowAvg.push(
        markCount > 0 ? Math.round(totalGrandMarks / markCount) : '-',
        (totalAttPercentage / students.length).toFixed(1) + '%',
        '-'
      );

      autoTable(doc, {
        startY: 120,
        head: [headRow1, headRow2],
        body: tableBody,
        foot: [headRowAvg],
        theme: 'grid',
          styles: { fontSize: exportSettings.paperSize === 'A3' ? 7 : 5, cellPadding: 1, minCellWidth: 15 },
          headStyles: { fillColor: [30, 64, 175], textColor: 255, halign: 'center', fontSize: exportSettings.paperSize === 'A3' ? 7 : 5 },
          columnStyles: {
            2: { cellWidth: 80 }
          }
        });
      } else {
        doc.setFontSize(12);
        doc.text(`Tab: ${activeTab.replace('-', ' ').toUpperCase()}`, 40, 100);
        doc.text("Tab-specific export formatting coming soon. Table placeholder below:", 40, 120);
        
        autoTable(doc, {
          startY: 140,
          head: [['Item', 'Status', 'Date']],
          body: exams.map(e => [e.title, e.status, e.date])
        });
      }

      doc.save(`exam_report_${format}_${orientation}.pdf`);
      toast.success("Report exported successfully", { id: 'export-report' });
      setShowExportModal(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to generate report", { id: 'export-report' });
    }
  };

  const handleEditExam = (examOrId: any) => {
    const id = typeof examOrId === 'string' ? examOrId : examOrId?.id;
    setEditingExamId(id);
    setIsEditingExam(true);
    const e = exams.find(ex => ex.id === id);
    if (e) {
      setNewExamData({
        title: e.title,
        type: e.type,
        examNumber: e.examNumber,
        date: e.date,
        academicYear: e.academicYear,
        status: e.status,
        st1Max: e.st1Max || 10,
        st2Max: e.st2Max || 10,
        homeworkMax: e.homeworkMax || 5,
        writtenMax: e.writtenMax || 25,
        saWrittenMax: e.saWrittenMax || 100
      });
      setShowNewExamModal(true);
    }
  };

  const handleSaveMarks = async (updatedMarks: any[]) => {
    setLoading(true);
    try {
      const activeExam = exams.find((e: any) => e.id === selectedExam);
      const getFieldMaxLimit = (field: string) => {
        if (activeExam?.type === 'SA') return activeExam?.maxMarks || 100;
        if (field === 'faWritten' || field === 'written' || field === 'total') {
          return activeExam?.writtenMax || 50;
        }
        if (field === 'st1') return activeExam?.st1Max || 10;
        if (field === 'st2') return activeExam?.st2Max || (isPrimary ? 10 : 5);
        if (field === 'hw') return activeExam?.homeworkMax || (isPrimary ? 5 : 0);
        return activeExam?.maxMarks || 50;
      };

      const clampMark = (val: any, field: string) => {
        if (val === 'Absent') return 'Absent';
        if (val === undefined || val === null || val === '') return null;
        let num = parseFloat(val);
        if (isNaN(num)) return null;
        const max = getFieldMaxLimit(field);
        if (num < 0) return 0;
        if (num > max) return max;
        return num;
      };

      const batch = updatedMarks.map(m => {
        const cleanedData = { ...m };
        if (cleanedData.st1 !== undefined) cleanedData.st1 = clampMark(cleanedData.st1, 'st1');
        if (cleanedData.st2 !== undefined) cleanedData.st2 = clampMark(cleanedData.st2, 'st2');
        if (cleanedData.hw !== undefined) cleanedData.hw = clampMark(cleanedData.hw, 'hw');
        if (cleanedData.faWritten !== undefined) cleanedData.faWritten = clampMark(cleanedData.faWritten, 'faWritten');
        if (cleanedData.saWritten !== undefined) cleanedData.saWritten = clampMark(cleanedData.saWritten, 'saWritten');

        return {
          id: m.id || `${selectedExam}_${m.studentId}_${m.subjectId}`,
          data: {
            ...cleanedData,
            examId: selectedExam,
            batchId: selectedBatch,
            classId: selectedClass,
            updatedAt: new Date().toISOString()
          }
        };
      });
      await dbService.setBatch('examMarks', batch);
      toast.success('Marks updated successfully');
      const refreshedMarks = await dbService.list('examMarks', [where('examId', '==', selectedExam), where('batchId', '==', selectedBatch)]);
      setMarks(refreshedMarks);
    } catch (error) {
      console.error('Save Marks Error:', error);
      toast.error('Failed to save marks');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = (mark: any) => {
    const st1 = Number(mark.st1) || 0;
    const st2 = Number(mark.st2) || 0;
    const hw = Number(mark.hw) || 0;
    const faWritten = Number(mark.faWritten) || 0;
    const saWritten = Number(mark.saWritten) || 0;

    if (selectedExam && exams.find(e => e.id === selectedExam)?.type === 'SA') {
      return saWritten;
    }
    if (isClass10) {
      // Class 10 FA uses only the FA Written Test marks (Max 50) without slip tests
      return faWritten;
    }
    if (isClass6to9) {
      // Class 6 to 9 has no HW in subject marks entry: ST-1 (Max 10) + ST-2 (Max 5) + FA Written (Max 35) = 50
      return st1 + st2 + faWritten;
    }
    return st1 + st2 + hw + faWritten;
  };

  const sendWhatsApp = (student: any) => {
    const studentMarks = resolvedMarks.filter(m => m.studentId === student.id);
    const activeExam = exams.find(e => e.id === selectedExam);
    const isFA = activeExam?.type === 'FA';
    let message = `*Exam Results: ${activeExam?.title}*\n`;
    message += `Student: ${student.name}\n`;
    message += `Roll No: ${student.rollNumber}\n\n`;
    
    // Sort subjects by standard curriculum order: Telugu, Hindi, English, Mathematics, Physics, Biology, Social Studies
    const sortedSubjects = [...(subjects || [])].sort(compareSubjectsStandard);
    sortedSubjects.forEach(subject => {
      const m = studentMarks.find(mark => mark.subjectId === subject.id);
      if (m) {
        if (isClass10 && isFA) {
          message += `${subject?.name}: ${calculateTotal(m)}/50\n`;
        } else {
          message += `${subject?.name}: ${calculateTotal(m)}\n`;
        }
      }
    });

    const url = `https://wa.me/${student.whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-sidebar tracking-tighter uppercase">Exams Management</h1>
          <p className="text-neutral-500 text-[15px] font-bold mt-1 uppercase tracking-widest italic opacity-70">Schedule exams, enter marks, and generate reports.</p>
        </div>
        <div className="flex gap-2 items-center">
          {activeTab !== 'central-register' && (
            <button 
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          )}
        </div>
      </div>

      {/* Export Report Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-sidebar text-white">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <Printer className="w-6 h-6" />
                Export Report Settings
              </h2>
              <button 
                onClick={() => setShowExportModal(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-8 space-y-8">
              <div className="space-y-4">
                <label className="text-sm font-black text-neutral-400 uppercase tracking-widest">Paper Size</label>
                <div className="grid grid-cols-2 gap-4">
                  {['A4', 'A3'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setExportSettings({ ...exportSettings, paperSize: size as 'A4' | 'A3' })}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                        exportSettings.paperSize === size 
                          ? 'border-primary bg-primary/5 text-primary shadow-lg shadow-primary/10' 
                          : 'border-neutral-100 hover:border-neutral-200 text-neutral-500'
                      }`}
                    >
                      <FileText className={`w-8 h-8 ${exportSettings.paperSize === size ? 'text-primary' : 'text-neutral-300'}`} />
                      <span className="font-black">{size}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-black text-neutral-400 uppercase tracking-widest">Orientation</label>
                <div className="grid grid-cols-2 gap-4">
                  {['portrait', 'landscape'].map((orientation) => (
                    <button
                      key={orientation}
                      onClick={() => setExportSettings({ ...exportSettings, orientation: orientation as any })}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                        exportSettings.orientation === orientation 
                          ? 'border-primary bg-primary/5 text-primary shadow-lg shadow-primary/10' 
                          : 'border-neutral-100 hover:border-neutral-200 text-neutral-500'
                      }`}
                    >
                      <div className={`transition-transform duration-500 ${orientation === 'landscape' ? 'rotate-90' : ''}`}>
                        <FileText className={`w-8 h-8 ${exportSettings.orientation === orientation ? 'text-primary' : 'text-neutral-300'}`} />
                      </div>
                      <span className="font-black capitalize">{orientation}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-4 border border-neutral-200 rounded-2xl font-black text-neutral-500 hover:bg-neutral-50 active:scale-95 transition-all"
                >
                   Cancel
                </button>
                <button 
                  onClick={handleExportReport}
                  className="flex-[2] py-4 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/20 hover:bg-sidebar active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Generate PDF
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl w-fit flex-wrap">
        {[
          { id: 'schedule', label: 'Exams Schedule', icon: Calendar },
          { id: 'class10-daily', label: 'Class 10 Daily Exams', icon: Trophy },
          { id: 'subject-entry', label: 'Subject Teacher Marks Entry', icon: UserCheck },
          { id: 'class-view', label: 'Class Teacher View', icon: Layout },
          { id: 'central-register', label: 'Central Marks Register', icon: FileSpreadsheet },
          { id: 'abstract-summary', label: 'Abstract Summary', icon: PieChart },
          { id: 'whatsapp', label: 'Marks Generation Message', icon: MessageSquare },
        ].filter(tab => {
          if (profile?.role === 'student' || profile?.role === 'parent') {
            return tab.id === 'schedule';
          }
          if (looseAccess) {
            return true;
          }
          if (isTeacherRole || hasPermission('exams_view_my_strict')) {
            const isAssignedClassTeacher = profile?.role === 'teacher_class' || (batches || []).some((b: any) => b.classTeacherId === profile?.uid);
            if (!isAssignedClassTeacher && tab.id === 'class-view') {
              return false;
            }
            if (tab.id === 'central-register' || tab.id === 'abstract-summary') {
              // Allow class teachers to view the consolidated registers for their classes
              return isAssignedClassTeacher;
            }
            return tab.id !== 'whatsapp';
          }
          return true;
        }).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Exam Timetable Scheduling Modal */}
      {showScheduleModal && currentSchedulingExam && (
        <ExamTimetableModal 
          exam={currentSchedulingExam}
          batchId={selectedBatch}
          classId={selectedClass}
          subjects={subjects}
          batches={batches}
          classes={classes}
          onClose={() => {
            setShowScheduleModal(false);
            setCurrentSchedulingExam(null);
          }}
        />
      )}

      {/* Configure/Initialize Exam Modal */}
      {showNewExamModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-sidebar text-white">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <FileText className="w-6 h-6 text-primary" />
                {isEditingExam ? 'Configure Scheduled Exam' : 'Initialize New Exam'}
              </h2>
              <button 
                onClick={() => setShowNewExamModal(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block mb-2">Exam Title</label>
                  <input
                    type="text"
                    value={newExamData.title}
                    onChange={(e) => setNewExamData({ ...newExamData, title: e.target.value })}
                    disabled={isEditingExam}
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-black text-sidebar focus:border-primary focus:bg-white outline-none transition-all disabled:opacity-50 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block mb-2">Exam Type</label>
                    <select
                      value={newExamData.type}
                      onChange={(e) => {
                        const isSA = e.target.value === 'SA';
                        setNewExamData({ 
                          ...newExamData, 
                          type: e.target.value as any,
                          st1Max: isSA ? 0 : 10,
                          st2Max: isSA ? 0 : (isPrimary ? 10 : 5),
                          homeworkMax: isSA ? 0 : (isPrimary ? 5 : 0),
                          writtenMax: isSA ? 0 : (isPrimary ? 25 : 50),
                          saWrittenMax: isSA ? 100 : 0
                        });
                      }}
                      disabled={isEditingExam}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-black text-sidebar focus:border-primary outline-none transition-all disabled:opacity-50 text-sm"
                    >
                      <option value="FA">Formative Assessment (FA)</option>
                      <option value="SA">Summative Assessment (SA)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block mb-2">Exam Number</label>
                    <input
                      type="number"
                      value={newExamData.examNumber}
                      onChange={(e) => setNewExamData({ ...newExamData, examNumber: parseInt(e.target.value) || 1 })}
                      disabled={isEditingExam}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-black text-sidebar focus:border-primary outline-none transition-all disabled:opacity-50 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block mb-2">Scheduled Date</label>
                    <input
                      type="date"
                      value={newExamData.date}
                      onChange={(e) => setNewExamData({ ...newExamData, date: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-black text-sidebar focus:border-primary outline-none transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block mb-2">Status</label>
                    <select
                      value={newExamData.status}
                      onChange={(e) => setNewExamData({ ...newExamData, status: e.target.value as any })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-black text-sidebar focus:border-primary outline-none transition-all text-sm"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="completed">Completed</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                </div>

                {newExamData.type === 'FA' && (
                  <div className="bg-neutral-50 p-5 rounded-2xl border border-neutral-100 space-y-4">
                    <span className="text-xs font-black text-neutral-400 uppercase tracking-widest block">Mark Component Limits</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">ST-1 Max Marks</label>
                        <input
                          type="number"
                          value={newExamData.st1Max}
                          onChange={(e) => setNewExamData({ ...newExamData, st1Max: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-black text-sidebar focus:border-primary outline-none transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">ST-2 Max Marks</label>
                        <input
                          type="number"
                          value={newExamData.st2Max}
                          onChange={(e) => setNewExamData({ ...newExamData, st2Max: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-black text-sidebar focus:border-primary outline-none transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">ST-3 / HW Max Marks</label>
                        <input
                          type="number"
                          value={newExamData.homeworkMax}
                          onChange={(e) => setNewExamData({ ...newExamData, homeworkMax: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-black text-sidebar focus:border-primary outline-none transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">Written Max Marks</label>
                        <input
                          type="number"
                          value={newExamData.writtenMax}
                          onChange={(e) => setNewExamData({ ...newExamData, writtenMax: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-black text-sidebar focus:border-primary outline-none transition-all text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {newExamData.type === 'SA' && (
                  <div className="bg-neutral-50 p-5 rounded-2xl border border-neutral-100">
                    <div>
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">SA Written Max Marks</label>
                      <input
                        type="number"
                        value={newExamData.saWrittenMax}
                        onChange={(e) => setNewExamData({ ...newExamData, saWrittenMax: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-black text-sidebar focus:border-primary outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3 border-t border-neutral-100">
                <button 
                  onClick={() => setShowNewExamModal(false)}
                  className="flex-1 py-3.5 border border-neutral-200 rounded-xl font-black text-neutral-500 hover:bg-neutral-50 active:scale-95 transition-all text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const docId = isEditingExam && editingExamId ? editingExamId : `${newExamData.title}_${settings?.currentAcademicYear || '2026-27'}`;
                      await dbService.create('exams', docId, {
                        ...newExamData,
                        id: docId,
                        updatedAt: new Date().toISOString()
                      });
                      toast.success(isEditingExam ? 'Exam configuration updated successfully' : 'Exam initialized successfully');
                      setShowNewExamModal(false);
                    } catch (err: any) {
                      console.error("Save exam error:", err);
                      toast.error("Failed to save exam configurations");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex-[2] py-3.5 bg-primary text-white rounded-xl font-black shadow-xl shadow-primary/20 hover:bg-sidebar active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Save className="w-5 h-5" />
                  {isEditingExam ? 'Save Changes' : 'Initialize Exam'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && examToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-red-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <Trash2 className="w-6 h-6" />
                Confirm Deletion
              </h2>
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-neutral-600 font-bold leading-normal text-sm">
                Are you sure you want to delete this exam? This will permanently remove the exam schedule and all associated student marks. This action cannot be undone.
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 border border-neutral-200 rounded-xl font-black text-neutral-500 hover:bg-neutral-50 active:scale-95 transition-all text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await dbService.delete('exams', examToDelete);
                      toast.success('Exam deleted successfully');
                      setShowDeleteConfirm(false);
                      setExamToDelete(null);
                    } catch (err: any) {
                      console.error("Delete exam error:", err);
                      toast.error("Failed to delete exam");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg shadow-red-500/20 hover:bg-red-700 active:scale-95 transition-all text-sm"
                >
                  Delete Permanently
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Filters */}
      {activeTab !== 'class10-daily' && (
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Class</label>
            <select 
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedBatch(''); 
              }}
              className="w-40 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm outline-none focus:border-primary font-bold"
            >
              <option value="">Select Class</option>
              {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Batch</label>
            <select 
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="w-40 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm outline-none focus:border-primary font-bold"
            >
              <option value="">Select Batch</option>
              {availableBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {activeTab !== 'central-register' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Exam</label>
              <select 
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                className="w-48 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm outline-none focus:border-primary font-bold text-sidebar"
              >
                <option value="">Select Exam</option>
                {['FA-1', 'FA-2', 'SA-1', 'FA-3', 'FA-4', 'SA-2'].filter(title => {
                  if (!isTeacherRole && !hasPermission('exams_view_my_strict')) return true;
                  return exams.some(e => e.title === title);
                }).map(standardTitle => {
                  const existingExam = exams.find(e => e.title === standardTitle);
                  return (
                    <option key={standardTitle} value={existingExam?.id || ''} disabled={!existingExam}>
                      {standardTitle} {existingExam ? '' : '(Not Scheduled)'}
                    </option>
                  );
                })}
                {exams.filter(e => !['FA-1', 'FA-2', 'SA-1', 'FA-3', 'FA-4', 'SA-2'].includes(e.title) && e.title?.toLowerCase() !== 'formative-1' && e.title?.toLowerCase() !== 'formative - 1').map(e => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>
            </div>
          )}
          {activeTab === 'subject-entry' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Subject</label>
              <select 
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-40 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm outline-none focus:border-primary"
              >
                <option value="">Select Subject</option>
                {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className={`${activeTab === 'central-register' ? 'min-h-[600px]' : 'bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden min-h-[400px]'} relative`}>
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-sm font-medium text-sidebar">Loading data...</p>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'schedule' && (
              <ExamSchedule 
                exams={exams} 
                hasPermission={hasPermission}
                selectedBatch={selectedBatch}
                selectedExams={selectedExams}
                isTeacherRole={isTeacherRole || hasPermission('exams_view_my_strict')}
                isPrimary={isPrimary}
                onSelect={(id) => setSelectedExams(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onEdit={handleEditExam}
                onCreate={(title: string) => {
                  const isSA = title.startsWith('SA');
                  setNewExamData({
                    title,
                    type: isSA ? 'SA' : 'FA',
                    examNumber: title.includes('-') ? parseInt(title.split('-')[1]) : 1,
                    date: new Date().toISOString().split('T')[0],
                    academicYear: settings?.currentAcademicYear || '2026-27',
                    status: 'scheduled',
                    st1Max: isSA ? 0 : 10,
                    st2Max: isSA ? 0 : (isPrimary ? 10 : 5),
                    homeworkMax: isSA ? 0 : (isPrimary ? 5 : 0),
                    writtenMax: isSA ? 0 : (isPrimary ? 25 : 50),
                    saWrittenMax: isSA ? 100 : 0
                  });
                  setIsEditingExam(false);
                  setEditingExamId(null);
                  setShowNewExamModal(true);
                }}
                onSchedule={(exam: any) => {
                  let bId = selectedBatch;
                  let cId = selectedClass;
                  if (!bId && batches.length > 0) {
                    bId = batches[0].id;
                    cId = batches[0].classId || (classes.length > 0 ? classes[0].id : '');
                    setSelectedBatch(bId);
                    if (cId) setSelectedClass(cId);
                  }
                  setCurrentSchedulingExam(exam);
                  setShowScheduleModal(true);
                }}
                onDelete={(id) => {
                  setExamToDelete(id);
                  setShowDeleteConfirm(true);
                }}
              />
            )}
            {activeTab === 'class10-daily' && (
              <Class10DailyExams
                students={students}
                classes={classes}
                batches={batches}
                subjects={subjects}
                teachers={teachers}
                profile={profile}
              />
            )}
            {activeTab === 'subject-entry' && (
              <SubjectEntry 
                students={students} 
                marks={resolvedMarks} 
                subjects={availableSubjects}
                selectedSubject={selectedSubject}
                selectedExam={exams.find(e => e.id === selectedExam)}
                onSave={handleSaveMarks}
                loading={loading}
                isPrimary={isPrimary}
                isClass10={isClass10}
                selectedClass={selectedClass}
                classes={classes}
                selectedBatch={selectedBatch}
                batches={batches}
              />
            )}
            {activeTab === 'class-view' && (
              <ClassTeacherView 
                students={students} 
                marks={resolvedMarks} 
                subjects={subjects}
                selectedExam={exams.find(e => e.id === selectedExam)}
                isPrimary={isPrimary}
                isClass10={isClass10}
                selectedClass={selectedClass}
                classes={classes}
                selectedBatch={selectedBatch}
                batches={batches}
                examSchedules={examSchedules}
                onDeleteStudent={handleDeleteStudentPermanently}
              />
            )}
            {activeTab === 'whatsapp' && (
              <WhatsAppTab 
                students={students} 
                selectedExam={selectedExam}
                selectedClass={selectedClass}
                selectedBatch={selectedBatch}
                exams={exams}
                subjects={subjects}
                classes={classes}
                batches={batches}
                examSchedules={examSchedules}
                isClass10={isClass10}
                isClass6to9={isClass6to9}
                isPrimary={isPrimary}
                resolvedMarks={resolvedMarks}
                setActiveTab={setActiveTab}
              />
            )}
            {activeTab === 'central-register' && (
              <CentralRegister 
                students={students}
                selectedClass={selectedClass}
                selectedBatch={selectedBatch}
                subjects={subjects}
                exams={exams}
                classes={classes}
                batches={batches}
                teachers={teachers}
                marks={resolvedMarks}
                examSchedules={examSchedules}
              />
            )}
            {activeTab === 'abstract-summary' && (
              <AbstractSummaryTab 
                students={students}
                selectedClass={selectedClass}
                selectedBatch={selectedBatch}
                subjects={subjects}
                exams={exams}
                marks={resolvedMarks}
                classes={classes}
                batches={batches}
                examSchedules={examSchedules}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

// Sub Components remains completely identical to avoid breaking hooks
const ExamSchedule = ({ exams, hasPermission, selectedBatch, selectedExams, onSelect, onEdit, onCreate, onSchedule, onDelete, isTeacherRole, isPrimary }: any) => (
  <div className="p-6">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {['FA-1', 'FA-2', 'SA-1', 'FA-3', 'FA-4', 'SA-2'].filter(title => {
        if (hasPermission('exams_manage')) return true;
        if (!isTeacherRole) return true;
        return exams.some((e: any) => e.title === title);
      }).map((title, idx) => {
        const exam = exams.find((e: any) => e.title === title);
        const isCreated = !!exam;
        return (
          <div 
            key={title} 
            className={`p-6 rounded-2xl border transition-all group relative ${
              exam && selectedExams.includes(exam.id) 
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                : 'border-neutral-100 bg-neutral-50/50 hover:bg-white hover:shadow-xl'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${title.startsWith('SA') ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                <GraduationCap className="w-6 h-6" />
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest ${exam ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-500'}`}>
                {exam ? exam.status : 'Not Scheduled'}
              </span>
            </div>
            <h3 className="text-xl font-bold text-sidebar mb-1">{title}</h3>
            <p className="text-sm text-neutral-500 mb-4">
              {title.startsWith('FA') ? 'Formative Assessment (50 Marks)' : 'Summative Assessment (100 Marks)'}
            </p>
            <div className="space-y-2 text-xs text-neutral-600 mb-6">
              {title.startsWith('FA') ? (
                isPrimary ? (
                  <>
                    <div className="flex justify-between"><span>ST-1 + ST-2</span> <span>{(exam?.st1Max || 10) + (exam?.st2Max || 10)} Marks</span></div>
                    <div className="flex justify-between"><span>ST-3 (Homework)</span> <span>{exam?.homeworkMax || 5} Marks</span></div>
                    <div className="flex justify-between font-bold text-sidebar pt-1 border-t border-neutral-200">
                      <span>Written Test (FA-1)</span> <span>{exam?.writtenMax || 25} Marks</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span>ST-1 Marks</span> <span>{exam?.st1Max || 10} Marks</span></div>
                    <div className="flex justify-between"><span>ST-2 Marks</span> <span>{exam?.st2Max || 5} Marks</span></div>
                    <div className="flex justify-between font-bold text-sidebar pt-1 border-t border-neutral-200">
                      <span>Written Test (FA-1)</span> <span>{exam?.writtenMax || 35} Marks</span>
                    </div>
                  </>
                )
              ) : (
                <div className="flex justify-between font-bold text-sidebar pt-1 border-t border-neutral-200">
                  <span>Written Test</span> <span>{exam?.saWrittenMax || 100} Marks</span>
                </div>
              )}
            </div>

            {/* Actions Block */}
            <div className="pt-4 border-t border-neutral-100 flex flex-col gap-2.5">
              {isCreated ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSchedule(exam);
                    }}
                    className="w-full py-2 bg-primary hover:bg-primary/90 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <Calendar className="w-4 h-4" />
                    Schedule Timetable
                  </button>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(exam);
                      }}
                      className="flex-1 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Configure
                    </button>
                    {hasPermission('exams_manage') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(exam.id);
                        }}
                        className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer"
                        title="Delete Exam"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                hasPermission('exams_manage') ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreate(title);
                    }}
                    className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Initialize Exam
                  </button>
                ) : (
                  <p className="text-center text-[10px] text-neutral-400 font-bold uppercase tracking-widest italic py-2">
                    Not Initialized by Admin
                  </p>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// Stub functions below keep compatibility with file trees
// Real interactive Exam Timetable scheduler and WhatsApp Broadcaster
const ExamTimetableModal = ({ exam, batchId, classId, subjects: propSubjects = [], batches: propBatches = [], classes: propClasses = [], onClose }: any) => {
  const [internalClasses, setInternalClasses] = useState<any[]>(propClasses);
  const [internalBatches, setInternalBatches] = useState<any[]>(propBatches);
  const [internalSubjects, setInternalSubjects] = useState<any[]>(propSubjects);

  useEffect(() => {
    let active = true;
    const fetchDependencies = async () => {
      try {
        if (propClasses.length === 0) {
          const cls = await dbService.list('classes');
          if (active && cls && cls.length > 0) setInternalClasses(cls);
        } else {
          setInternalClasses(propClasses);
        }

        if (propBatches.length === 0) {
          const bts = await dbService.list('batches');
          if (active && bts && bts.length > 0) setInternalBatches(bts);
        } else {
          setInternalBatches(propBatches);
        }

        if (propSubjects.length === 0) {
          const subs紧 = await dbService.list('subjects');
          if (active && subs紧 && subs紧.length > 0) setInternalSubjects(subs紧);
        } else {
          setInternalSubjects(propSubjects);
        }
      } catch (err) {
        console.error("Failed to load classes/batches for timetable modal:", err);
      }
    };
    fetchDependencies();
    return () => { active = false; };
  }, [propClasses, propBatches, propSubjects]);

  const classes = internalClasses.length > 0 ? internalClasses : propClasses;
  const batches不易 = internalBatches.length > 0 ? internalBatches : propBatches;
  const batches = batches不易;
  const subjects = internalSubjects.length > 0 ? internalSubjects : propSubjects;

  // Determine initial class and batch
  const initialClassId = useMemo(() => {
    if (classId) return classId;
    if (batchId) {
      const b = batches.find((x: any) => x.id === batchId);
      if (b?.classId) return b.classId;
    }
    return classes.length > 0 ? classes[0].id : '';
  }, [classId, batchId, batches, classes]);

  const initialBatchId持 = useMemo(() => {
    if (batchId) return batchId;
    if (initialClassId) {
      const b = batches.find((x: any) => x.classId === initialClassId);
      if (b) return b.id;
    }
    return batches.length > 0 ? batches[0].id : '';
  }, [batchId, initialClassId, batches]);

  // Dynamic active selection state
  const [activeClassId, setActiveClassId] = useState<string>(initialClassId);
  const [activeBatchId, setActiveBatchId] = useState<string>(initialBatchId持);

  // Keep activeClassId and activeBatchId valid as classes/batches load
  useEffect(() => {
    if (!activeClassId && classes.length > 0) {
      setActiveClassId(classes[0].id);
    }
  }, [classes, activeClassId]);

  useEffect(() => {
    if (activeClassId) {
      const classBatches = batches.filter((b: any) => b.classId === activeClassId);
      if (classBatches.length > 0 && (!activeBatchId || !classBatches.some((b: any) => b.id === activeBatchId))) {
        setActiveBatchId(classBatches[0].id);
      }
    } else if (!activeBatchId && batches.length > 0) {
      setActiveBatchId(batches[0].id);
    }
  }, [batches, activeClassId, activeBatchId]);

  // When props change or mount, keep in sync
  useEffect(() => {
    if (classId && classId !== activeClassId) {
      setActiveClassId(classId);
    }
  }, [classId]);

  useEffect(() => {
    if (batchId && batchId !== activeBatchId) {
      setActiveBatchId(batchId);
    }
  }, [batchId]);

  // Current active class and batch objects
  const activeClass = useMemo(() => {
    return classes.find((c: any) => c.id === activeClassId) || classes[0] || null;
  }, [classes, activeClassId]);

  const availableBatchesForActiveClass = useMemo(() => {
    if (!activeClassId) return batches;
    const filtered = batches.filter((b: any) => b.classId === activeClassId);
    return filtered.length > 0 ? filtered : batches;
  }, [batches, activeClassId]);

  const activeBatch = useMemo(() => {
    return batches.find((b: any) => b.id === activeBatchId) || availableBatchesForActiveClass[0] || null;
  }, [batches, activeBatchId, availableBatchesForActiveClass]);

  const activeBatchName = useMemo(() => {
    if (activeClass && activeBatch) {
      return `${activeClass.name} - ${activeBatch.name}`;
    }
    return activeBatch?.name || activeClass?.name || 'Selected Section';
  }, [activeClass, activeBatch]);

  // Target Mode for scheduling a subject: 'active' | 'all_in_class' | 'selected_multi'
  const [targetScheduleMode, setTargetScheduleMode] = useState<'active' | 'all_in_class' | 'selected_multi'>('active');

  // Schedules state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [whatsappSummary, setWhatsappSummary] = useState<any>(null);

  // Form Fields
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('09:30 AM');
  const [duration, setDuration] = useState('2 Hours');

  // Multi-batch/multi-class states
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [showTargetBatches, setShowTargetBatches] = useState(false);

  // Initialize selectedBatches when activeBatchId changes
  useEffect(() => {
    if (activeBatchId && !selectedBatches.includes(activeBatchId)) {
      setSelectedBatches(prev => prev.length === 0 ? [activeBatchId] : prev);
    }
  }, [activeBatchId]);

  // Group batches by class for multi-class selection UI
  const batchesByClass最佳 = useMemo(() => {
    const groups: { [classId: string]: { className: string; batches: any[] } } = {};
    classes.forEach((c: any) => {
      groups[c.id] = { className: c.name, batches: [] };
    });
    batches.forEach((b: any) => {
      if (groups[b.classId]) {
        groups[b.classId].batches.push(b);
      } else {
        groups[b.classId] = { className: `Class ${b.classId}`, batches: [b] };
      }
    });
    return Object.entries(groups)
      .filter(([_, value]) => value.batches.length > 0)
      .map(([id, value]) => ({ classId: id, ...value }));
  }, [classes, batches]);
  const batchesByClass = batchesByClass最佳;

  const fetchSchedules = async () => {
    if (!exam?.id || !activeBatchId) return;
    try {
      const data = await dbService.list('examSchedules', [
        where('examId', '==', exam.id),
        where('batchId', '==', activeBatchId)
      ]);
      const sorted = [...(data || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setSchedules(sorted);
    } catch (err) {
      console.error("Failed to fetch examSchedules:", err);
    }
  };

  // Fetch existing schedules for this exam and active batch
  useEffect(() => {
    fetchSchedules();
  }, [exam?.id, activeBatchId]);

  // Handle Class change in modal
  const handleClassChange = (newClassId: string) => {
    setActiveClassId(newClassId);
    const classBatches = batches.filter((b: any) => b.classId === newClassId);
    if (classBatches.length > 0) {
      setActiveBatchId(classBatches[0].id);
      setSelectedBatches([classBatches[0].id]);
    }
  };

  // Handle Batch change in modal
  const handleBatchChange = (newBatchId: string) => {
    setActiveBatchId(newBatchId);
    const b = batches.find((x: any) => x.id === newBatchId);
    if (b?.classId && b.classId !== activeClassId) {
      setActiveClassId(b.classId);
    }
    if (!selectedBatches.includes(newBatchId)) {
      setSelectedBatches(prev => [...prev, newBatchId]);
    }
  };

  // Compute resolved target batches for scheduling
  const resolvedTargetBatches = useMemo(() => {
    if (targetScheduleMode === 'active') {
      return activeBatchId ? [activeBatchId] : [];
    }
    if (targetScheduleMode === 'all_in_class') {
      return availableBatchesForActiveClass.map(b => b.id);
    }
    if (targetScheduleMode === 'selected_multi') {
      return selectedBatches.length > 0 ? selectedBatches : (activeBatchId ? [activeBatchId] : []);
    }
    return activeBatchId ? [activeBatchId] : [];
  }, [targetScheduleMode, activeBatchId, availableBatchesForActiveClass, selectedBatches]);

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      toast.error('Please select a subject');
      return;
    }
    if (!examDate) {
      toast.error('Please select a date');
      return;
    }
    if (resolvedTargetBatches.length === 0) {
      toast.error('Please select at least one class / section to schedule this subject.');
      return;
    }

    setLoading(true);
    try {
      const subject = subjects.find((s: any) => s.id === selectedSubjectId);
      const subjectName = subject ? subject.name : 'Unknown';

      // Iterate over all target batches and schedule
      for (const bId of resolvedTargetBatches) {
        const docId = `${exam.id}_${bId}_${selectedSubjectId}`;
        const scheduleData = {
          examId: exam.id,
          batchId: bId,
          subjectId: selectedSubjectId,
          subjectName,
          date: examDate,
          time: examTime,
          duration,
          updatedAt: new Date().toISOString()
        };
        await dbService.create('examSchedules', docId, scheduleData);
      }

      toast.success(`Subject "${subjectName}" scheduled for ${resolvedTargetBatches.length} section(s)!`);
      
      // Reset form subject and date for quick next entry
      setSelectedSubjectId('');
      setExamDate('');
      await fetchSchedules();
    } catch (error: any) {
      console.error('Error scheduling subject:', error);
      toast.error('Failed to schedule subject: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this schedule slot?')) return;
    setLoading(true);
    try {
      await dbService.delete('examSchedules', id);
      toast.success('Schedule deleted');
      await fetchSchedules();
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      toast.error('Failed to delete schedule: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyScheduleToOtherBatches = async () => {
    const targets = selectedBatches.filter(id => id !== activeBatchId);
    if (targets.length === 0) {
      toast.error('Please select at least one other class/section from the checklist below to copy to.');
      return;
    }
    if (schedules.length === 0) {
      toast.error(`The current section (${activeBatchName}) has no schedules to copy.`);
      return;
    }
    
    if (!window.confirm(`Are you sure you want to copy the entire scheduled timetable (${schedules.length} subjects) from "${activeBatchName}" to the selected ${targets.length} other sections? This will overwrite any existing schedule slots for the same subjects in those sections.`)) {
      return;
    }

    setLoading(true);
    try {
      let copyCount = 0;
      for (const tBatchId of targets) {
        for (const s of schedules) {
          const docId = `${exam.id}_${tBatchId}_${s.subjectId}`;
          const scheduleData = {
            examId: exam.id,
            batchId: tBatchId,
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            date: s.date,
            time: s.time,
            duration: s.duration,
            updatedAt: new Date().toISOString()
          };
          await dbService.create('examSchedules', docId, scheduleData);
          copyCount++;
        }
      }
      toast.success(`Successfully copied schedule. Initialized ${copyCount} slots across ${targets.length} other classes/sections!`);
      await fetchSchedules();
    } catch (err: any) {
      console.error('Error copying schedule:', err);
      toast.error('Failed to copy schedule: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllSchedules = async () => {
    const targets = targetScheduleMode === 'selected_multi' && selectedBatches.length > 1 
      ? selectedBatches 
      : [activeBatchId];
    const isMulti = targets.length > 1;
    const confirmMessage = isMulti 
      ? `Are you sure you want to delete all scheduled subject timetables for the ${targets.length} selected classes/sections? This will permanently remove all scheduled exam slots. This action cannot be undone.`
      : `Are you sure you want to delete the entire scheduled timetable for "${activeBatchName}"? This will permanently remove all scheduled exam slots. This action cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    try {
      let deletedCount = 0;
      for (const tBatchId of targets) {
        const bSchedules = await dbService.list('examSchedules', [
          where('examId', '==', exam.id),
          where('batchId', '==', tBatchId)
        ]);
        
        for (const s of bSchedules) {
          await dbService.delete('examSchedules', s.id || s.uid);
          deletedCount++;
        }
      }
      toast.success(`Successfully deleted ${deletedCount} scheduled exam slots across ${targets.length} section(s)!`);
      await fetchSchedules();
    } catch (err: any) {
      console.error('Error deleting schedules:', err);
      toast.error('Failed to delete schedules: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendScheduleWhatsApp = async () => {
    if (schedules.length === 0) {
      toast.error('Please schedule at least one subject before sending');
      return;
    }

    setSendingWhatsapp(true);
    setWhatsappSummary(null);
    try {
      const response = await fetch('/api/exams/send-schedule-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: exam.id,
          batchId: activeBatchId,
          classId: activeClassId
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setWhatsappSummary(data.summary);
        toast.success(`Schedule queued successfully to ${data.summary.queuedCount} parents!`);
      } else {
        toast.error(data.error || 'Failed to send schedule via WhatsApp');
      }
    } catch (error: any) {
      console.error('Error sending WhatsApp:', error);
      toast.error('Network error sending WhatsApp: ' + error.message);
    } finally {
      setSendingWhatsapp(false);
    }
  };

  // Quick preset handlers
  const setQuickTime = (t: string) => setExamTime(t);
  const setQuickDuration = (d: string) => setDuration(d);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl border border-neutral-100 shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/70">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-sidebar uppercase tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Timetable Schedule: {exam.title}
            </h3>
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-0.5">
              Select class & section to view or schedule examination timetable
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-700 transition-colors font-bold text-lg"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* Class & Batch Quick Selection Bar */}
          <div className="bg-gradient-to-r from-neutral-50 via-neutral-50 to-white border border-neutral-200 p-4 sm:p-5 rounded-2xl shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-primary" />
                  Select Class & Section to Schedule
                </span>
                <span className="text-[10px] bg-primary/10 text-primary font-black px-2 py-0.5 rounded-full uppercase">
                  {classes.length} Classes • {batches.length} Sections
                </span>
              </div>

              <button 
                type="button"
                onClick={() => setShowTargetBatches(!showTargetBatches)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  showTargetBatches 
                    ? 'bg-neutral-800 text-white shadow-sm' 
                    : 'bg-white border border-neutral-300 text-neutral-700 hover:border-neutral-400'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                {showTargetBatches ? 'Hide All Classes & Sections' : `Multi-Class Setup (${selectedBatches.length} selected)`}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
              {/* Class Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-1">
                  1. Class
                </label>
                <select
                  value={activeClassId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-xs"
                >
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch / Section Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-1">
                  2. Section / Batch
                </label>
                <select
                  value={activeBatchId}
                  onChange={(e) => handleBatchChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-xs"
                >
                  {availableBatchesForActiveClass.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Section Indicator Card */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 flex flex-col justify-center text-left">
                <span className="text-[10px] font-black text-primary uppercase tracking-wider">
                  Active Timetable View
                </span>
                <span className="text-sm font-black text-sidebar truncate">
                  {activeBatchName}
                </span>
                <span className="text-[10px] font-bold text-neutral-500">
                  {schedules.length} Subject{schedules.length === 1 ? '' : 's'} Currently Scheduled
                </span>
              </div>
            </div>
          </div>

          {/* Multi-Class & Section Selection Grid (Collapsible/Expandable) */}
          {showTargetBatches && (
            <div className="bg-white border border-neutral-200 p-5 rounded-2xl space-y-4 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                <div className="text-left">
                  <h4 className="text-xs font-black text-sidebar uppercase tracking-tight flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    All School Classes & Sections Checklist
                  </h4>
                  <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider">
                    Select sections to schedule subjects simultaneously or copy timetables
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const classBatchIds = availableBatchesForActiveClass.map(b => b.id);
                      setSelectedBatches(Array.from(new Set([...selectedBatches, ...classBatchIds])));
                    }}
                    className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                  >
                    Select All in {activeClass?.name || 'Class'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBatches(batches.map(b => b.id));
                    }}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                  >
                    Select All School Sections ({batches.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBatches(activeBatchId ? [activeBatchId] : []);
                    }}
                    className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                  >
                    Reset (Keep Active Only)
                  </button>
                </div>
              </div>

              {/* Class & Batches Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 max-h-[300px] overflow-y-auto pr-2">
                {batchesByClass.map(clsGroup => {
                  const allClassBatchesSelected = clsGroup.batches.every(b => selectedBatches.includes(b.id));
                  const isCurrentActiveClass = clsGroup.classId === activeClassId;

                  return (
                    <div 
                      key={clsGroup.classId} 
                      className={`p-3.5 rounded-xl space-y-2 border transition-all text-left ${
                        isCurrentActiveClass 
                          ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20' 
                          : 'bg-neutral-50/70 border-neutral-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5 mb-1.5">
                        <span className="text-[11px] font-black text-sidebar uppercase tracking-wider">
                          {clsGroup.className}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const bIds = clsGroup.batches.map(b => b.id);
                            if (allClassBatchesSelected) {
                              setSelectedBatches(selectedBatches.filter(id => !bIds.includes(id)));
                            } else {
                              setSelectedBatches(Array.from(new Set([...selectedBatches, ...bIds])));
                            }
                          }}
                          className="text-[9px] font-black uppercase tracking-wider text-primary hover:underline"
                        >
                          {allClassBatchesSelected ? 'Deselect' : 'Select All'}
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {clsGroup.batches.map((b: any) => {
                          const isCurrent = b.id === activeBatchId;
                          const isChecked = selectedBatches.includes(b.id);
                          return (
                            <label key={b.id} className="flex items-center gap-2 cursor-pointer group text-xs font-bold text-neutral-700 select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedBatches(selectedBatches.filter(id => id !== b.id));
                                  } else {
                                    setSelectedBatches([...selectedBatches, b.id]);
                                  }
                                }}
                                className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer accent-primary border-neutral-300"
                              />
                              <span className={`text-xs ${isCurrent ? 'text-primary font-black' : 'group-hover:text-neutral-900'}`}>
                                {b.name} {isCurrent && <span className="text-[8px] bg-primary/10 px-1 py-0.5 rounded text-primary ml-1 uppercase font-black">Active</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Multi-Class Bulk Actions Bar */}
              <div className="bg-neutral-50 border border-neutral-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-left">
                <div className="space-y-0.5">
                  <span className="text-xs font-black text-sidebar uppercase tracking-wider block">
                    Bulk Timetable Operations ({selectedBatches.length} Sections Selected)
                  </span>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block">
                    Copy timetable from active section or remove schedules across checked sections
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyScheduleToOtherBatches}
                    disabled={loading || selectedBatches.filter(id => id !== activeBatchId).length === 0 || schedules.length === 0}
                    className="px-3.5 py-1.5 bg-neutral-800 text-white rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-neutral-950 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    title="Copy scheduled subjects from active section to all other selected sections"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy ({schedules.length}) Subjects to Other ({selectedBatches.filter(id => id !== activeBatchId).length}) Sections
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteAllSchedules}
                    disabled={loading}
                    className="px-3.5 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-rose-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Schedules for Selected ({selectedBatches.length})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Schedule a Subject Form */}
          <form onSubmit={handleAddSchedule} className="bg-neutral-50/80 border border-neutral-200 p-5 sm:p-6 rounded-2xl space-y-4 text-left shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200/70 pb-3">
              <div>
                <h4 className="text-xs font-black text-sidebar uppercase tracking-widest flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-primary" />
                  Schedule a Subject Slot
                </h4>
                <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">
                  Pick subject, date, time & duration to add to timetable
                </p>
              </div>

              {/* Target Scope Pill Selector */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-neutral-200">
                <button
                  type="button"
                  onClick={() => setTargetScheduleMode('active')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    targetScheduleMode === 'active'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Active Only ({activeBatchName})
                </button>
                <button
                  type="button"
                  onClick={() => setTargetScheduleMode('all_in_class')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    targetScheduleMode === 'all_in_class'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  All Sections of {activeClass?.name || 'Class'} ({availableBatchesForActiveClass.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetScheduleMode('selected_multi');
                    setShowTargetBatches(true);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    targetScheduleMode === 'selected_multi'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Custom Selected ({selectedBatches.length})
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Subject */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-1">
                  Subject *
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-xs"
                  required
                >
                  <option value="">-- Select Subject --</option>
                  {subjects.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.code ? `(${s.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exam Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-1">
                  Exam Date *
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-xs"
                  required
                >
                </input>
              </div>

              {/* Start Time */}
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                    Start Time *
                  </label>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setQuickTime('09:30 AM')} className="text-[9px] text-primary font-bold hover:underline">09:30 AM</button>
                    <span className="text-[9px] text-neutral-300">•</span>
                    <button type="button" onClick={() => setQuickTime('01:30 PM')} className="text-[9px] text-primary font-bold hover:underline">01:30 PM</button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 09:30 AM"
                  value={examTime}
                  onChange={(e) => setExamTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-xs"
                  required
                />
              </div>

              {/* Duration */}
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                    Duration *
                  </label>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setQuickDuration('2 Hours')} className="text-[9px] text-primary font-bold hover:underline">2h</button>
                    <span className="text-[9px] text-neutral-300">•</span>
                    <button type="button" onClick={() => setQuickDuration('2.5 Hours')} className="text-[9px] text-primary font-bold hover:underline">2.5h</button>
                    <span className="text-[9px] text-neutral-300">•</span>
                    <button type="button" onClick={() => setQuickDuration('3 Hours')} className="text-[9px] text-primary font-bold hover:underline">3h</button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 2 Hours"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-xs"
                  required
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-neutral-500 font-bold">
                Target: Scheduling for <span className="font-black text-primary">{resolvedTargetBatches.length} section(s)</span>
              </span>

              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-sidebar transition-all flex items-center gap-2 shadow-md shadow-primary/20 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> 
                Schedule Subject Slot ({resolvedTargetBatches.length} Section{resolvedTargetBatches.length > 1 ? 's' : ''})
              </button>
            </div>
          </form>

          {/* Active Timetable Schedule Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2 text-left">
              <div>
                <h4 className="text-xs font-black text-sidebar uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Active Timetable Schedule: {activeBatchName}
                </h4>
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mt-0.5">
                  Showing all scheduled exam dates and timings for this specific class section
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-neutral-100 text-neutral-700 font-black px-3 py-1 rounded-full uppercase border border-neutral-200">
                  {schedules.length} {schedules.length === 1 ? 'Subject' : 'Subjects'} Scheduled
                </span>
                {schedules.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteAllSchedules}
                    disabled={loading}
                    className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1"
                    title="Delete entire scheduled timetable for this batch"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Timetable
                  </button>
                )}
              </div>
            </div>

            <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-xs bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="p-3.5 text-xs font-black text-neutral-500 uppercase tracking-wider">#</th>
                    <th className="p-3.5 text-xs font-black text-neutral-500 uppercase tracking-wider">Subject</th>
                    <th className="p-3.5 text-xs font-black text-neutral-500 uppercase tracking-wider">Exam Date</th>
                    <th className="p-3.5 text-xs font-black text-neutral-500 uppercase tracking-wider">Time</th>
                    <th className="p-3.5 text-xs font-black text-neutral-500 uppercase tracking-wider">Duration</th>
                    <th className="p-3.5 text-xs font-black text-neutral-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {schedules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center">
                        <div className="max-w-xs mx-auto space-y-2">
                          <Calendar className="w-8 h-8 text-neutral-300 mx-auto" />
                          <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                            No subjects scheduled yet for {activeBatchName}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            Use the form above to add subjects to the timetable, or copy from another section.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    schedules.map((s: any, idx: number) => (
                      <tr key={s.id || s.uid} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="p-3.5 text-xs font-bold text-neutral-400 text-left">{idx + 1}</td>
                        <td className="p-3.5 text-sm font-black text-sidebar text-left flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary/60" />
                          {s.subjectName}
                        </td>
                        <td className="p-3.5 text-sm font-bold text-neutral-700 text-left">
                          {new Date(s.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="p-3.5 text-sm font-bold text-neutral-600 text-left">{s.time}</td>
                        <td className="p-3.5 text-sm font-medium text-neutral-500 text-left">{s.duration}</td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => handleDeleteSchedule(s.id || s.uid)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete this subject slot"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Broadcast Trigger Summary */}
          {whatsappSummary && (
            <div className="p-4 bg-emerald-50 border border-emerald-200/60 rounded-xl space-y-2 text-left animate-in fade-in">
              <h5 className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">WhatsApp Broadcast Summary</h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100 text-center">
                  <div className="text-[9px] font-bold uppercase text-neutral-400">Total Parents</div>
                  <div className="text-base font-black text-neutral-700">{whatsappSummary.totalRequested}</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100 text-center">
                  <div className="text-[9px] font-bold uppercase text-neutral-400">Queued Messages</div>
                  <div className="text-base font-black text-neutral-700">{whatsappSummary.queuedCount}</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100 text-center">
                  <div className="text-[9px] font-bold uppercase text-neutral-400">Skipped (Optout/Dup)</div>
                  <div className="text-base font-black text-neutral-700">{whatsappSummary.duplicateSkipped + whatsappSummary.optOutSkipped}</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100 text-center">
                  <div className="text-[9px] font-bold uppercase text-neutral-400">Invalid Phone</div>
                  <div className="text-base font-black text-neutral-700">{whatsappSummary.invalidPhone + whatsappSummary.missingPhone}</div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-neutral-100 bg-neutral-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider max-w-md text-left">
            Changes are saved to the school database instantly. Parents will receive the schedule via WhatsApp queue upon broadcasting.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSendScheduleWhatsApp}
              disabled={sendingWhatsapp || schedules.length === 0}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
            >
              {sendingWhatsapp ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Broadcast Timetable to parents
            </button>
            <button 
              onClick={onClose}
              className="px-5 py-2.5 bg-white text-neutral-600 border border-neutral-300 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-neutral-100 transition-all"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
const SubjectEntry = ({ students, marks, subjects, selectedSubject, selectedExam, onSave, loading, isPrimary, isClass10, selectedClass, classes, selectedBatch, batches }: any) => {
  const [localMarks, setLocalMarks] = useState<any[]>([]);

  const sortedStudents = React.useMemo(() => {
    return [...(students || [])].sort(sortByRollNumber);
  }, [students]);

  // File Upload and Template States
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera & OCR States
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrResultsPreview, setOcrResultsPreview] = useState<any[] | null>(null);
  const [useWebcam, setUseWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);

  const isFA = useMemo(() => {
    if (!selectedExam) return true;
    const t = String(selectedExam.type || '').toUpperCase();
    const title = String(selectedExam.title || '').toUpperCase();
    return t === 'FA' || t.includes('FA') || t.includes('FORMATIVE') || title.includes('FA') || title.includes('FORMATIVE') || title.startsWith('FA-');
  }, [selectedExam]);

  const isClass10Effective = useMemo(() => {
    if (isClass10) return true;
    if (selectedClass) {
      const clsObj = classes?.find((c: any) => c.id === selectedClass);
      if (clsObj && (isClass10NameOrId(clsObj.name) || isClass10NameOrId(clsObj.id) || isClass10NameOrId(clsObj.code))) {
        return true;
      }
    }
    if (selectedBatch) {
      const bObj = batches?.find((b: any) => b.id === selectedBatch || b.name === selectedBatch);
      if (bObj && (isClass10NameOrId(bObj.name) || isClass10NameOrId(bObj.id) || isClass10NameOrId(bObj.classId))) {
        return true;
      }
    }
    if (selectedExam && (isClass10NameOrId(selectedExam.className) || isClass10NameOrId(selectedExam.classId) || isClass10NameOrId(selectedExam.title))) {
      return true;
    }
    if (students && students.length > 0) {
      const c10Matches = students.filter((s: any) => 
        isClass10NameOrId(s.classId) || 
        isClass10NameOrId(s.className) || 
        isClass10NameOrId(s.class) || 
        isClass10NameOrId(s.batchName) || 
        isClass10NameOrId(s.batch)
      ).length;
      if (c10Matches > 0 && c10Matches >= Math.ceil(students.length / 2)) {
        return true;
      }
    }
    return false;
  }, [isClass10, selectedClass, classes, selectedBatch, batches, selectedExam, students]);

  useEffect(() => {
    setLocalMarks(marks);
  }, [marks]);

  const getFieldMax = (field: string) => {
    if (!isFA) return selectedExam?.maxMarks || 100;
    if (isClass10Effective) {
      if (field === 'faWritten' || field === 'written' || field === 'total') return selectedExam?.writtenMax || 50;
      return 0;
    }
    if (field === 'faWritten' || field === 'written' || field === 'total') {
      return selectedExam?.writtenMax || 50;
    }
    if (field === 'st1') return selectedExam?.st1Max || 10;
    if (field === 'st2') return selectedExam?.st2Max || (isPrimary ? 10 : 5);
    if (field === 'hw') return selectedExam?.homeworkMax || (isPrimary ? 5 : 0);
    return selectedExam?.maxMarks || 50;
  };

  const handleMarkChange = (studentId: string, field: string, value: string) => {
    if (value === '' || value === null || value === undefined) {
      const existing = localMarks.find(m => m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id);
      let newMarks;
      if (existing) {
        newMarks = localMarks.map(m => (m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id) ? { ...m, [field]: null } : m);
      } else {
        newMarks = [...localMarks, { studentId, subjectId: selectedSubject, examId: selectedExam?.id, [field]: null }];
      }
      setLocalMarks(newMarks);
      return;
    }
    const upperVal = String(value).trim().toUpperCase();
    if (upperVal === 'A' || upperVal === 'AB' || upperVal === 'ABSENT') {
      const existing = localMarks.find(m => m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id);
      let newMarks;
      if (existing) {
        newMarks = localMarks.map(m => (m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id) ? { ...m, [field]: 'Absent' } : m);
      } else {
        newMarks = [...localMarks, { studentId, subjectId: selectedSubject, examId: selectedExam?.id, [field]: 'Absent' }];
      }
      setLocalMarks(newMarks);
      return;
    }

    const max = getFieldMax(field);
    const rawStr = String(value).trim();
    let storedVal: any = value;

    if (rawStr.endsWith('.') || rawStr === '.' || (rawStr.includes('.') && rawStr.endsWith('0'))) {
      const parsed = parseFloat(rawStr);
      if (!isNaN(parsed) && parsed > max) {
        storedVal = max;
        toast.error(`Maximum marks allowed for this column is ${max}`, { id: 'max-marks-alert' });
      } else {
        storedVal = rawStr;
      }
    } else {
      let num = parseFloat(rawStr);
      if (isNaN(num)) num = 0;
      if (num < 0) num = 0;
      if (num > max) {
        num = max;
        toast.error(`Maximum marks allowed for this column is ${max}`, { id: 'max-marks-alert' });
      } else {
        storedVal = num;
      }
    }

    const existing = localMarks.find(m => m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id);
    let newMarks;
    if (existing) {
      newMarks = localMarks.map(m => (m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id) ? { ...m, [field]: storedVal } : m);
    } else {
      newMarks = [...localMarks, { studentId, subjectId: selectedSubject, examId: selectedExam?.id, [field]: storedVal }];
    }
    setLocalMarks(newMarks);
  };

  const handleMarkBlur = (studentId: string, field: string) => {
    const existing = localMarks.find(m => m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id);
    if (!existing || existing[field] === null || existing[field] === undefined || existing[field] === 'Absent') return;

    const strVal = String(existing[field]).trim();
    if (strVal === '' || strVal === '.') {
      handleMarkChange(studentId, field, '');
      return;
    }
    const num = parseFloat(strVal);
    if (!isNaN(num)) {
      const max = getFieldMax(field);
      const clamped = Math.min(Math.max(num, 0), max);
      const existingIdx = localMarks.findIndex(m => m.studentId === studentId && m.subjectId === selectedSubject && m.examId === selectedExam?.id);
      if (existingIdx >= 0) {
        const newMarks = [...localMarks];
        newMarks[existingIdx] = { ...newMarks[existingIdx], [field]: clamped };
        setLocalMarks(newMarks);
      }
    }
  };

  // Generate and Download Excel/CSV Marks Entry Template
  const downloadTemplate = () => {
    // Define columns based on exam configuration
    const headers = ['Roll Number', 'Student Name'];
    if (isFA) {
      if (isClass10Effective) {
        headers.push('FA Written (Max 50)');
      } else if (isPrimary) {
        headers.push('ST-1 (Max 10)', 'ST-2 (Max 10)', 'ST-3 / HW (Max 5)', 'FA Written (Max 25)');
      } else {
        headers.push('ST-1 (Max 10)', 'ST-2 (Max 5)', 'FA Written (Max 35)');
      }
    } else {
      headers.push('SA Written (Max 100)');
    }

    // Prepopulate students - sorted roll number wise
    const sortedStudents = [...students].sort(sortByRollNumber);

    const subjectName = subjects.find((s: any) => s.id === selectedSubject)?.name || 'Subject';

    // Construct spreadsheet with informative metadata rows at the top
    const excelRows: any[][] = [
      ['Exam Name:', selectedExam?.title || ''],
      ['Subject:', subjectName],
      [], // Spacing row
      headers // Table column headers at row index 3
    ];

    sortedStudents.forEach((s: any) => {
      const rowData = [
        s.rollNumber || '',
        s.name
      ];
      if (isFA) {
        if (isClass10Effective) {
          rowData.push(''); // FA Written (Max 50)
        } else if (isPrimary) {
          rowData.push('', '', '', ''); // ST-1, ST-2, ST-3 / HW, FA Written
        } else {
          rowData.push('', '', ''); // ST-1, ST-2, FA Written
        }
      } else {
        rowData.push(''); // SA Written
      }
      excelRows.push(rowData);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(excelRows);

    // Set professional column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Roll Number
      { wch: 25 }, // Student Name
      { wch: 20 }, // Column 1
      { wch: 15 }, 
      { wch: 18 }, 
      { wch: 18 }  
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Marks Template');
    
    XLSX.writeFile(workbook, `${selectedExam.title}_${subjectName}_Marks_Template.xlsx`);
    toast.success('Excel Marks template downloaded successfully!');
  };

  // Parse uploaded Excel/CSV file and populate state
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Robust check to handle both templates with or without top metadata rows
        const cellA1 = worksheet['A1']?.v;
        const cellA1Str = String(cellA1 || '').trim().toLowerCase();
        const isMetadataTemplate = cellA1Str.includes('exam') || cellA1Str.includes('subject');
        
        const data = XLSX.utils.sheet_to_json<any>(worksheet, {
          range: isMetadataTemplate ? 3 : 0
        });
        
        if (!data || data.length === 0) {
          toast.error("No student records found in the uploaded file.");
          return;
        }

        handleApplyImportedMarks(data);
      } catch (err: any) {
        toast.error("Failed to parse Excel/CSV: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    // Reset file input value to allow uploading the same file again
    e.target.value = '';
  };

  // Apply imported lists (from CSV/Excel or OCR results) to the local marks state
  const handleApplyImportedMarks = (parsedList: any[]) => {
    let updatedLocalMarks = [...localMarks];
    let matchCount = 0;
    
    parsedList.forEach((row: any) => {
      // Find matching student by rollNumber or name (fuzzy/exact search)
      const student = students.find((s: any) => {
        // Direct ID match
        if (row.studentId && s.id === row.studentId) return true;
        
        // Roll number match
        const rowRoll = row.rollNumber || row['Roll Number'] || row['rollNumber'];
        if (rowRoll && s.rollNumber && String(s.rollNumber).trim() === String(rowRoll).trim()) {
          return true;
        }
        
        // Name match
        const rowName = row.studentName || row['Student Name'] || row['studentName'];
        if (rowName && s.name && s.name.trim().toLowerCase() === String(rowName).trim().toLowerCase()) {
          return true;
        }
        
        return false;
      });

      if (student) {
        matchCount++;
        const existingIdx = updatedLocalMarks.findIndex(m => m.studentId === student.id && m.subjectId === selectedSubject && m.examId === selectedExam?.id);
        
        const getVal = (val: any, field: string) => {
          if (val === undefined || val === null || val === '') return null;
          const strVal = String(val).trim().toUpperCase();
          if (strVal === 'A' || strVal === 'AB' || strVal === 'ABSENT') {
            return 'Absent';
          }
          let num = parseFloat(val);
          if (isNaN(num)) return null;
          const max = getFieldMax(field);
          if (num < 0) return 0;
          if (num > max) return max;
          return num;
        };

        const extracted: any = {};
        const sourceData = row.marks || row; // OCR returns nested marks object, XLSX is flat

        if (isFA) {
          if (isClass10Effective) {
            const faWrittenVal = getVal(sourceData.faWritten ?? sourceData['FA Written'] ?? sourceData['FA Written (Max 50)'] ?? sourceData['FA Written (50)'] ?? sourceData['Written'] ?? sourceData['Total'], 'faWritten');
            if (faWrittenVal !== null) extracted.faWritten = faWrittenVal;
          } else {
            const st1Val = getVal(sourceData.st1 ?? sourceData['ST-1'] ?? sourceData['ST-1 (Max 10)'], 'st1');
            if (st1Val !== null) extracted.st1 = st1Val;

            const st2Val = getVal(sourceData.st2 ?? sourceData['ST-2'] ?? sourceData['ST-2 (Max 10)'] ?? sourceData['ST-2 (Max 5)'], 'st2');
            if (st2Val !== null) extracted.st2 = st2Val;

            if (isPrimary) {
              const hwVal = getVal(sourceData.hw ?? sourceData['ST-3'] ?? sourceData['ST-3 / HW (Max 5)'] ?? sourceData['ST-3 / HW'] ?? sourceData['hw'], 'hw');
              if (hwVal !== null) extracted.hw = hwVal;

              const faWrittenVal = getVal(sourceData.faWritten ?? sourceData['FA Written'] ?? sourceData['FA-1 Written (25)'] ?? sourceData['FA Written (Max 25)'] ?? sourceData['faWritten'], 'faWritten');
              if (faWrittenVal !== null) extracted.faWritten = faWrittenVal;
            } else {
              const faWrittenVal = getVal(sourceData.faWritten ?? sourceData['FA Written'] ?? sourceData['FA-1 Written (35)'] ?? sourceData['FA Written (Max 35)'] ?? sourceData['faWritten'], 'faWritten');
              if (faWrittenVal !== null) extracted.faWritten = faWrittenVal;
            }
          }
        } else {
          const saWrittenVal = getVal(sourceData.saWritten ?? sourceData['SA Written'] ?? sourceData['Written (100)'] ?? sourceData['SA Written (Max 100)'] ?? sourceData['saWritten'], 'saWritten');
          if (saWrittenVal !== null) extracted.saWritten = saWrittenVal;
        }

        if (Object.keys(extracted).length > 0) {
          if (existingIdx > -1) {
            updatedLocalMarks[existingIdx] = {
              ...updatedLocalMarks[existingIdx],
              ...extracted
            };
          } else {
            updatedLocalMarks.push({
              studentId: student.id,
              subjectId: selectedSubject,
              examId: selectedExam?.id,
              ...extracted
            });
          }
        }
      }
    });

    setLocalMarks(updatedLocalMarks);
    toast.success(`Successfully matched and updated marks for ${matchCount} students!`);
  };

  // Webcam stream handlers
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setUseWebcam(true);
    } catch (err: any) {
      toast.error("Could not access camera: " + err.message);
    }
  };

  const stopWebcam = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setUseWebcam(false);
  };

  const captureWebcamFrame = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        setOcrImage(base64);
        stopWebcam();
      }
    }
  };

  const handleOcrFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setOcrImage(evt.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Trigger server-side Gemini OCR processing
  const runOcrAnalysis = async () => {
    if (!ocrImage) return;

    setIsOcrLoading(true);
    setOcrProgress('Initializing Gemini AI Core scanner...');
    
    const steps = [
      'Scanning physical layout and grids...',
      'Locating hand-written student names...',
      'Recognizing and parsing numeric marks...',
      'Aligning student roll numbers to ERP register...'
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length) {
        setOcrProgress(steps[stepIdx]);
        stepIdx++;
      }
    }, 2000);

    try {
      const expectedColumns = isFA 
        ? (isClass10Effective ? ['faWritten'] : (isPrimary ? ['st1', 'st2', 'hw', 'faWritten'] : ['st1', 'st2', 'faWritten']))
        : ['saWritten'];

      const response = await fetch('/api/exams/ocr-marks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: ocrImage,
          students: students.map((s: any) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber })),
          columns: expectedColumns
        })
      });

      clearInterval(interval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status} Error`);
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.marks)) {
        setOcrResultsPreview(result.marks);
        toast.success(`OCR scan finished! Located ${result.marks.length} marks entries.`);
      } else {
        throw new Error("Could not parse image coordinates correctly.");
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error("Primary server OCR failed, invoking local fallback...", err);
      
      try {
        setOcrProgress('Invoking offline secondary scanner...');
        const offlineResult = await extractHandwrittenMarks(ocrImage, students, selectedExam);
        if (offlineResult && Array.isArray(offlineResult.marks)) {
          const normalized = offlineResult.marks.map((m: any) => ({
            studentId: m.studentId,
            rollNumber: students.find((s: any) => s.id === m.studentId)?.rollNumber,
            studentName: students.find((s: any) => s.id === m.studentId)?.name,
            marks: {
              st1: m.st1,
              st2: m.st2,
              hw: m.hw,
              faWritten: m.faWritten,
              saWritten: m.saWritten
            }
          }));
          setOcrResultsPreview(normalized);
          toast.success("AI scan finished via offline backup channel!");
        } else {
          throw new Error("Local fallback scanner was unable to extract layout.");
        }
      } catch (fallbackErr: any) {
        toast.error("Scanning failed: " + (fallbackErr.message || err.message));
      }
    } finally {
      setIsOcrLoading(false);
    }
  };

  if (!selectedSubject || !selectedExam) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
          <Filter className="w-8 h-8" />
        </div>
        <p className="text-neutral-500 font-bold uppercase tracking-widest text-sm">Select Subject & Exam to Enter Marks</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Subject Entry Header */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-sidebar uppercase tracking-tight">Marks Entry: {subjects.find((s: any) => s.id === selectedSubject)?.name}</h3>
        <button 
          onClick={() => onSave(localMarks.filter(m => m.subjectId === selectedSubject && m.examId === selectedExam?.id))}
          disabled={loading}
          className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-black text-xs uppercase flex items-center gap-2 hover:bg-green-700 shadow-lg shadow-green-500/20 transition-colors"
        >
          <Save className="w-4 h-4" /> Save Marks
        </button>
      </div>

      {/* Modern Template Upload & AI Scanner Toolbar */}
      <div className="mb-6 bg-white border border-neutral-150 p-4 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-sidebar uppercase tracking-tight">Excel Template & AI OCR Photo Scanner</h4>
            <p className="text-xs text-neutral-400">Download formatted Excel templates, upload spreadsheets, or take a picture of student marks registers for automatic AI scanning.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden inputs */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleCSVUpload} 
            accept=".csv, .xlsx, .xls" 
            className="hidden" 
          />
          <input 
            type="file" 
            ref={ocrFileInputRef} 
            onChange={handleOcrFileSelect} 
            accept="image/*" 
            className="hidden" 
          />

          <button
            onClick={downloadTemplate}
            className="px-4 py-2 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all"
          >
            <Download className="w-4 h-4" /> Download Template
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all"
          >
            <UploadCloud className="w-4 h-4" /> Upload Excel/CSV
          </button>

          <button
            onClick={() => {
              setOcrImage(null);
              setOcrResultsPreview(null);
              setShowOcrModal(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-lg shadow-indigo-600/15 transition-all"
          >
            <Camera className="w-4 h-4" /> Take Picture & Scan Marks (AI)
          </button>
        </div>
      </div>

      {/* Marks Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-50 text-[10px] font-black uppercase text-neutral-400 tracking-widest border-b border-neutral-100">
              <th className="p-4 text-left">Roll No</th>
              <th className="p-4 text-left">Student Name</th>
              {isFA ? (
                isClass10Effective ? (
                  <>
                    <th className="p-4 text-center">FA Written (50)</th>
                    <th className="p-4 text-center text-emerald-600 bg-emerald-50/20">Total (50)</th>
                  </>
                ) : isPrimary ? (
                  <>
                    <th className="p-4 text-center">ST-1 (10)</th>
                    <th className="p-4 text-center">ST-2 (10)</th>
                    <th className="p-4 text-center">ST-3 (5)</th>
                    <th className="p-4 text-center text-indigo-600 bg-indigo-50/20">Total ST's (25)</th>
                    <th className="p-4 text-center">FA-1 Written (25)</th>
                    <th className="p-4 text-center text-emerald-600 bg-emerald-50/20">Total (ST's + FA) (50)</th>
                  </>
                ) : (
                  <>
                    <th className="p-4 text-center">ST-1 (10)</th>
                    <th className="p-4 text-center">ST-2 (5)</th>
                    <th className="p-4 text-center text-indigo-600 bg-indigo-50/20">Total ST's (15)</th>
                    <th className="p-4 text-center">FA-1 Written (35)</th>
                    <th className="p-4 text-center text-emerald-600 bg-emerald-50/20">Total (ST's + FA) (50)</th>
                  </>
                )
              ) : (
                <th className="p-4 text-center">Written (100)</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sortedStudents.map((s: any) => {
              const m = localMarks.find(mark => mark.studentId === s.id && mark.subjectId === selectedSubject && mark.examId === selectedExam?.id) || {};
              const isNonAttending = s.status === 'non_attending';

              // Calculate auto-totals
              const isFaWrittenAbsent = isMarkAbsent(m.faWritten);
              const st1Absent = isMarkAbsent(m.st1);
              const st2Absent = isMarkAbsent(m.st2);
              const hwAbsent = isMarkAbsent(m.hw);
              const st1Val = st1Absent ? 0 : (parseFloat(m.st1) || 0);
              const st2Val = st2Absent ? 0 : (parseFloat(m.st2) || 0);
              const hwVal = isPrimary ? (hwAbsent ? 0 : (parseFloat(m.hw) || 0)) : 0;
              const faWrittenVal = isFaWrittenAbsent ? 0 : (parseFloat(m.faWritten) || 0);

              const totalSts = isNonAttending ? '-' : formatDecimalMark(st1Val + st2Val + hwVal);
              const grandTotal = isNonAttending ? '-' : (isFaWrittenAbsent ? 'Absent' : formatDecimalMark(isClass10Effective ? faWrittenVal : (st1Val + st2Val + hwVal + faWrittenVal)));

              return (
                <tr key={s.id} className={`hover:bg-neutral-50 transition-colors ${isNonAttending ? 'bg-amber-50/20' : ''}`}>
                  <td className="p-4 text-sm font-black text-neutral-400">
                    {isNonAttending ? (
                      <span className="text-[10px] text-amber-600 uppercase tracking-widest font-black leading-none bg-amber-100 px-1.5 py-0.5 rounded">N/A</span>
                    ) : (
                      s.rollNumber || '-'
                    )}
                  </td>
                  <td className="p-4 text-sm font-black text-sidebar">
                    <div className="flex items-center gap-2">
                      <span>{s.name}</span>
                      {isNonAttending && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 font-black tracking-wider uppercase px-2 py-0.5 rounded-lg border border-amber-200">
                          Non-Attending
                        </span>
                      )}
                    </div>
                  </td>
                  {isFA ? (
                    isClass10Effective ? (
                      <>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.faWritten ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'faWritten', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'faWritten')}
                            disabled={isNonAttending} 
                            placeholder="Max 50"
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2 text-center">
                          <span className={`inline-block min-w-[60px] px-3 py-2 bg-emerald-50 border border-emerald-150 rounded-lg text-center font-black text-emerald-700 text-sm ${isNonAttending ? 'opacity-50 bg-neutral-100 text-neutral-400 border-neutral-200' : ''}`}>
                            {isNonAttending ? '-' : (isFaWrittenAbsent ? 'Absent' : formatDecimalMark(parseFloat(m.faWritten) || 0))}
                          </span>
                        </td>
                      </>
                    ) : isPrimary ? (
                      <>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.st1 ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'st1', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'st1')}
                            disabled={isNonAttending} 
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.st2 ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'st2', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'st2')}
                            disabled={isNonAttending} 
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.hw ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'hw', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'hw')}
                            disabled={isNonAttending} 
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2 text-center">
                          <span className={`inline-block min-w-[60px] px-3 py-2 bg-indigo-50 border border-indigo-150 rounded-lg text-center font-black text-indigo-700 text-sm ${isNonAttending ? 'opacity-50 bg-neutral-100 text-neutral-400 border-neutral-200' : ''}`}>
                            {totalSts}
                          </span>
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.faWritten ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'faWritten', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'faWritten')}
                            disabled={isNonAttending} 
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2 text-center">
                          <span className={`inline-block min-w-[60px] px-3 py-2 bg-emerald-50 border border-emerald-150 rounded-lg text-center font-black text-emerald-700 text-sm ${isNonAttending ? 'opacity-50 bg-neutral-100 text-neutral-400 border-neutral-200' : ''}`}>
                            {grandTotal}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.st1 ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'st1', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'st1')}
                            disabled={isNonAttending} 
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.st2 ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'st2', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'st2')}
                            disabled={isNonAttending} 
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2 text-center">
                          <span className={`inline-block min-w-[60px] px-3 py-2 bg-indigo-50 border border-indigo-150 rounded-lg text-center font-black text-indigo-700 text-sm ${isNonAttending ? 'opacity-50 bg-neutral-100 text-neutral-400 border-neutral-200' : ''}`}>
                            {totalSts}
                          </span>
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={m.faWritten ?? ''} 
                            onChange={(e) => handleMarkChange(s.id, 'faWritten', e.target.value)} 
                            onBlur={() => handleMarkBlur(s.id, 'faWritten')}
                            disabled={isNonAttending} 
                            className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                          />
                        </td>
                        <td className="p-2 text-center">
                          <span className={`inline-block min-w-[60px] px-3 py-2 bg-emerald-50 border border-emerald-150 rounded-lg text-center font-black text-emerald-700 text-sm ${isNonAttending ? 'opacity-50 bg-neutral-100 text-neutral-400 border-neutral-200' : ''}`}>
                            {grandTotal}
                          </span>
                        </td>
                      </>
                    )
                  ) : (
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={m.saWritten ?? ''} 
                        onChange={(e) => handleMarkChange(s.id, 'saWritten', e.target.value)} 
                        onBlur={() => handleMarkBlur(s.id, 'saWritten')}
                        disabled={isNonAttending} 
                        className={`w-full px-3 py-2 border rounded-lg text-center font-black ${isNonAttending ? 'bg-amber-50/50 text-amber-900 border-amber-200/55' : ''}`} 
                      />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* AI OCR Scanner Overlay Modal */}
      <AnimatePresence>
        {showOcrModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-neutral-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500 rounded-lg text-white">
                    <Sparkles className="w-4 h-4 animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm uppercase tracking-wider">AI Marks Register OCR Scanner</h3>
                    <p className="text-[10px] text-neutral-400">Extracts written scores using multi-modal Gemini AI vision.</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    stopWebcam();
                    setShowOcrModal(false);
                  }}
                  className="p-1.5 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto flex-1 bg-neutral-50 flex flex-col">
                
                {/* STATE 1: No Image Captured / Uploaded */}
                {!ocrImage && !useWebcam && !ocrResultsPreview && (
                  <div className="flex-1 flex flex-col justify-center items-center py-10">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm border border-indigo-100">
                      <Camera className="w-8 h-8" />
                    </div>
                    <h4 className="text-base font-black text-sidebar uppercase tracking-tight mb-1">Select Document Input</h4>
                    <p className="text-xs text-neutral-400 text-center max-w-sm mb-6">Drop a scanned image, browse files from your computer, or activate your webcam to scan papers.</p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                      <button
                        onClick={() => ocrFileInputRef.current?.click()}
                        className="flex-1 px-4 py-3 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-xl text-xs font-black uppercase text-neutral-700 flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <UploadCloud className="w-4 h-4 text-neutral-400" /> Browse Image File
                      </button>
                      <button
                        onClick={startWebcam}
                        className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-black uppercase text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/10"
                      >
                        <Camera className="w-4 h-4" /> Use Device Camera
                      </button>
                    </div>
                  </div>
                )}

                {/* STATE 2: Webcam Stream Active */}
                {useWebcam && (
                  <div className="flex-1 flex flex-col items-center justify-center bg-black rounded-2xl overflow-hidden p-2 relative min-h-[350px]">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full max-h-[350px] object-contain rounded-xl"
                    />
                    <div className="absolute bottom-6 flex gap-3">
                      <button
                        onClick={captureWebcamFrame}
                        className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-red-600/20"
                      >
                        <Camera className="w-4 h-4" /> Capture Frame
                      </button>
                      <button
                        onClick={stopWebcam}
                        className="px-4 py-2.5 bg-neutral-800 text-neutral-300 rounded-full text-xs font-black uppercase hover:bg-neutral-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* STATE 3: Image Selected & Ready to Scan or Displaying Results */}
                {ocrImage && !useWebcam && (
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    
                    {/* Left Panel: Image Preview with scanner effect */}
                    <div className="bg-white p-4 rounded-2xl border border-neutral-150 shadow-sm relative overflow-hidden flex flex-col items-center">
                      <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2 block self-start">Document Image Preview</span>
                      <div className="relative w-full aspect-[4/3] bg-neutral-900 rounded-xl overflow-hidden flex items-center justify-center">
                        <img 
                          src={ocrImage} 
                          alt="OCR marks target" 
                          className="max-w-full max-h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        {/* Laser Scanner Effect when loading */}
                        {isOcrLoading && (
                          <div className="absolute inset-x-0 h-1 bg-green-500 shadow-[0_0_15px_rgba(34,197,94,1)] animate-bounce z-10" style={{ animationDuration: '3s' }} />
                        )}
                      </div>

                      {!isOcrLoading && !ocrResultsPreview && (
                        <div className="flex gap-2 w-full mt-4">
                          <button
                            onClick={() => setOcrImage(null)}
                            className="flex-1 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-black uppercase rounded-xl transition-colors"
                          >
                            Retake / Clear
                          </button>
                          <button
                            onClick={runOcrAnalysis}
                            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase rounded-xl shadow-md shadow-indigo-600/10 flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> Scan marks with AI
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right Panel: Processing Loader OR Extracted Comparison Table */}
                    <div className="flex flex-col h-full justify-center">
                      
                      {/* Scanning State Loader */}
                      {isOcrLoading && (
                        <div className="bg-white p-8 rounded-2xl border border-neutral-150 shadow-sm flex flex-col items-center text-center justify-center flex-1 py-20">
                          <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                          <h4 className="text-base font-black text-sidebar uppercase tracking-tight mb-2 animate-pulse">Gemini AI OCR Analyzing...</h4>
                          <div className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg uppercase tracking-wide border border-indigo-100/50">
                            {ocrProgress}
                          </div>
                        </div>
                      )}

                      {/* OCR Parsing Complete - Preview Results and Apply */}
                      {ocrResultsPreview && (
                        <div className="bg-white p-4 rounded-2xl border border-neutral-150 shadow-sm flex flex-col flex-1">
                          <div className="flex justify-between items-center mb-3">
                            <div>
                              <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Detected Scores Register</span>
                              <h4 className="text-xs font-black text-sidebar uppercase tracking-tight">AI OCR Extraction Table</h4>
                            </div>
                            <button
                              onClick={() => {
                                setOcrResultsPreview(null);
                                setOcrImage(null);
                              }}
                              className="text-xs text-indigo-600 font-bold hover:underline"
                            >
                              Rescan sheet
                            </button>
                          </div>

                          <div className="overflow-y-auto max-h-[280px] border border-neutral-100 rounded-xl bg-neutral-50/50 mb-4">
                            <table className="w-full text-xs">
                              <thead className="bg-neutral-100/80 sticky top-0">
                                <tr>
                                  <th className="p-3 text-left font-black uppercase">Roll</th>
                                  <th className="p-3 text-left font-black uppercase">Student</th>
                                  <th className="p-3 text-center font-black uppercase">Scanned Marks</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {ocrResultsPreview.map((item, idx) => {
                                  const student = students.find((s: any) => s.id === item.studentId);
                                  return (
                                    <tr key={idx} className="hover:bg-neutral-100/50">
                                      <td className="p-3 font-bold text-neutral-500">{item.rollNumber || student?.rollNumber || '-'}</td>
                                      <td className="p-3 font-black text-sidebar">{item.studentName || student?.name}</td>
                                      <td className="p-3 text-center">
                                        <div className="flex justify-center gap-1 flex-wrap">
                                          {Object.entries(item.marks || {}).map(([col, val]: any) => (
                                            val !== null && val !== undefined ? (
                                              <span key={col} className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-100 uppercase text-[9px] whitespace-nowrap">
                                                {col}: <strong className="text-indigo-900">{val}</strong>
                                              </span>
                                            ) : null
                                          ))}
                                          {Object.values(item.marks || {}).every(v => v === null || v === undefined) && (
                                            <span className="text-neutral-400 italic text-[10px]">Absent / Missing</span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <button
                            onClick={() => {
                              handleApplyImportedMarks(ocrResultsPreview);
                              setShowOcrModal(false);
                            }}
                            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-black uppercase rounded-xl shadow-lg shadow-green-600/10 flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4" /> Confirm & Apply Scanned Marks
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
const ClassTeacherView = ({ students, marks, subjects, selectedExam, isPrimary, isClass10, selectedClass, classes, selectedBatch, batches, examSchedules: passedExamSchedules, onDeleteStudent }: any) => {
  const { settings } = useSettings();
  const [attendance, setAttendance] = useState<any[]>([]);
  const [workingDays, setWorkingDays] = useState<any>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [localExamSchedules, setLocalExamSchedules] = useState<any[]>([]);
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<'landscape' | 'portrait'>('landscape');

  useEffect(() => {
    let active = true;
    if (!passedExamSchedules || passedExamSchedules.length === 0) {
      dbService.list('examSchedules').then(data => {
        if (active) setLocalExamSchedules(data || []);
      }).catch(err => console.error("Failed to load localExamSchedules:", err));
    }
    return () => {
      active = false;
    };
  }, [passedExamSchedules]);

  const allExamSchedules = useMemo(() => {
    return (passedExamSchedules && passedExamSchedules.length > 0) ? passedExamSchedules : localExamSchedules;
  }, [passedExamSchedules, localExamSchedules]);

  const isFA = useMemo(() => {
    if (!selectedExam) return true;
    const t = String(selectedExam.type || '').toUpperCase();
    const title = String(selectedExam.title || '').toUpperCase();
    return t === 'FA' || t.includes('FA') || t.includes('FORMATIVE') || title.includes('FA') || title.includes('FORMATIVE') || title.startsWith('FA-');
  }, [selectedExam]);

  const isClass10Effective = useMemo(() => {
    if (isClass10) return true;
    if (selectedClass) {
      const clsObj = classes?.find((c: any) => c.id === selectedClass);
      if (clsObj && (isClass10NameOrId(clsObj.name) || isClass10NameOrId(clsObj.id) || isClass10NameOrId(clsObj.code))) {
        return true;
      }
    }
    if (selectedBatch) {
      const bObj = batches?.find((b: any) => b.id === selectedBatch || b.name === selectedBatch);
      if (bObj && (isClass10NameOrId(bObj.name) || isClass10NameOrId(bObj.id) || isClass10NameOrId(bObj.classId))) {
        return true;
      }
    }
    if (selectedExam && (isClass10NameOrId(selectedExam.className) || isClass10NameOrId(selectedExam.classId) || isClass10NameOrId(selectedExam.title))) {
      return true;
    }
    if (students && students.length > 0) {
      const c10Matches = students.filter((s: any) => 
        isClass10NameOrId(s.classId) || 
        isClass10NameOrId(s.className) || 
        isClass10NameOrId(s.class) || 
        isClass10NameOrId(s.batchName) || 
        isClass10NameOrId(s.batch)
      ).length;
      if (c10Matches > 0 && c10Matches >= Math.ceil(students.length / 2)) {
        return true;
      }
    }
    return false;
  }, [isClass10, selectedClass, classes, selectedBatch, batches, selectedExam, students]);

  useEffect(() => {
    const fetchAttendanceAndSettings = async () => {
      if (!selectedBatch) return;
      setLoadingAttendance(true);
      try {
        const yearPart = settings?.currentAcademicYear?.split('-')[0] || '2026';
        const startYearNum = parseInt(yearPart.length === 2 ? `20${yearPart}` : yearPart) || 2026;
        const start = `${startYearNum}-06-01`;
        const end = `${startYearNum + 1}-05-31`;
        
        // Fetch attendance
        const attRecords = await dbService.list('attendance', [
          where('date', '>=', start),
          where('date', '<=', end)
        ]);
        
        // Filter for current students
        const studentIds = new Set(students.map((s: any) => s.id || s.uid));
        const filteredAtt = (attRecords || []).filter((a: any) => studentIds.has(a.studentId));
        setAttendance(filteredAtt);

        // Fetch working days settings
        const [wDaysDoc, globalWDaysDoc] = await Promise.all([
          dbService.get('examSettings', `workingDays-${selectedBatch}`),
          dbService.get('examSettings', 'workingDays-school')
        ]);
        const wDays = globalWDaysDoc?.data || wDaysDoc?.data || {};
        setWorkingDays(wDays);
      } catch (err) {
        console.error('Failed to load attendance or working days', err);
      } finally {
        setLoadingAttendance(false);
      }
    };
    fetchAttendanceAndSettings();
  }, [selectedBatch, students, settings?.currentAcademicYear]);

  const examTitle = selectedExam?.title || (isFA ? 'FA' : 'SA');

  const getStudentTotal = (studentId: string, subjectId: string, subjectName?: string) => {
    const m = marks.find((mark: any) => 
      (mark.studentId === studentId) && 
      (mark.subjectId === subjectId || (subjectName && mark.subjectName && mark.subjectName.toLowerCase().trim() === subjectName.toLowerCase().trim()) || (mark.subjectId && subjectId && String(mark.subjectId).toLowerCase().trim() === String(subjectId).toLowerCase().trim())) && 
      mark.examId === selectedExam?.id
    );
    if (!m) return null;
    if (isFA) {
      const written = isMarkAbsent(m.faWritten) ? 0 : (parseFloat(m.faWritten) || 0);
      if (isClass10Effective) return Math.round((written + Number.EPSILON) * 100) / 100;
      const st1 = isMarkAbsent(m.st1) ? 0 : (parseFloat(m.st1) || 0);
      const st2 = isMarkAbsent(m.st2) ? 0 : (parseFloat(m.st2) || 0);
      const hw = isMarkAbsent(m.hw) ? 0 : (parseFloat(m.hw) || 0);
      const subTot = isPrimary ? (st1 + st2 + hw + written) : (st1 + st2 + written);
      return Math.round((subTot + Number.EPSILON) * 100) / 100;
    } else {
      const saVal = isMarkAbsent(m.saWritten) ? 0 : (parseFloat(m.saWritten) || 0);
      return Math.round((saVal + Number.EPSILON) * 100) / 100;
    }
  };

  const getSubjectMaxMarks = (subj: any, isFAExam: boolean) => {
    if (isFAExam) return 50;
    const name = (subj?.name || '').toLowerCase();
    if (name.includes('physics') || name.includes('biology') || name.includes('botany') || name.includes('zoology')) {
      return 40;
    }
    return 80; // default for SA is 80 to match the standard format shown in the image
  };

  const displaySubjects = useMemo(() => {
    if (!selectedExam) return [];

    const activeBatchObj = (batches || []).find((b: any) => 
      b.id === selectedBatch || 
      b.name === selectedBatch || 
      String(b.name || '').toLowerCase().trim() === String(selectedBatch || '').toLowerCase().trim()
    );
    const activeClassObj = (classes || []).find((c: any) => 
      c.id === selectedClass || 
      c.name === selectedClass || 
      String(c.name || '').toLowerCase().trim() === String(selectedClass || '').toLowerCase().trim()
    );

    const targetExamId = String(selectedExam.id || '');
    const targetExamTitle = String(selectedExam.title || '').toLowerCase().trim();
    const targetBatchId = activeBatchObj?.id || selectedBatch;
    const targetBatchName = (activeBatchObj?.name || selectedBatch || '').toLowerCase().trim();
    const targetClassId = activeClassObj?.id || selectedClass || activeBatchObj?.classId;
    const targetClassName = (activeClassObj?.name || selectedClass || '').toLowerCase().trim();

    // 1. Check if exam schedules exist for this specific exam and batch/class
    const matchingSchedules = (allExamSchedules || []).filter((sch: any) => {
      const schExamId = String(sch.examId || '');
      const schExamTitle = String(sch.examTitle || sch.examId || '').toLowerCase().trim();
      const matchesExam = 
        (targetExamId && schExamId === targetExamId) ||
        (targetExamTitle && (schExamTitle === targetExamTitle || schExamId.toLowerCase().trim() === targetExamTitle));
      
      if (!matchesExam) return false;

      // Match batch if selected
      if (targetBatchId || targetBatchName) {
        const schBatchId = String(sch.batchId || '');
        const schBatchName = String(sch.batchName || '').toLowerCase().trim();
        if (
          (targetBatchId && schBatchId === String(targetBatchId)) ||
          (targetBatchName && (schBatchName === targetBatchName || schBatchId.toLowerCase().trim() === targetBatchName))
        ) {
          return true;
        }
      }

      // Match class if batch didn't specify
      if (targetClassId || targetClassName) {
        const schClassId = String(sch.classId || '');
        const schClassName = String(sch.className || '').toLowerCase().trim();
        if (
          (targetClassId && schClassId === String(targetClassId)) ||
          (targetClassName && (schClassName === targetClassName || schClassId.toLowerCase().trim() === targetClassName))
        ) {
          return true;
        }
      }

      return false;
    });

    // If schedules are defined for this exam and batch, ONLY show scheduled subjects!
    if (matchingSchedules.length > 0) {
      const scheduledSubjectIds = new Set<string>();
      const scheduledSubjectNames = new Set<string>();
      const scheduledSubjectCleanNames = new Set<string>();

      matchingSchedules.forEach((sch: any) => {
        if (sch.subjectId) scheduledSubjectIds.add(String(sch.subjectId));
        if (sch.subjectName) {
          const raw = String(sch.subjectName).trim();
          scheduledSubjectNames.add(raw.toLowerCase());
          scheduledSubjectCleanNames.add(raw.toLowerCase().replace(/[^a-z0-9]/g, ''));
        }
      });

      const matched: any[] = (subjects || []).filter((s: any) => {
        const sId = String(s.id || '');
        const sName = (s.name || '').trim().toLowerCase();
        const sClean = (s.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        return (
          scheduledSubjectIds.has(sId) ||
          scheduledSubjectNames.has(sName) ||
          scheduledSubjectCleanNames.has(sClean)
        );
      });

      // Include any schedule item whose name or id was not directly in the `subjects` master list
      matchingSchedules.forEach((sch: any) => {
        const schId = String(sch.subjectId || '');
        const schName = (sch.subjectName || '').trim();
        const exists = matched.some((s: any) =>
          (schId && String(s.id) === schId) ||
          (schName && (s.name || '').toLowerCase().trim() === schName.toLowerCase()) ||
          (schName && (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === schName.toLowerCase().replace(/[^a-z0-9]/g, ''))
        );
        if (!exists && schName) {
          matched.push({
            id: sch.subjectId || `sched_${schName.replace(/\s+/g, '_')}`,
            name: schName,
            code: schName.toUpperCase()
          });
        }
      });

      return [...matched].sort(compareSubjectsStandard);
    }

    // 2. If NO exam schedules exist, filter by subjects that have recorded marks for this exam
    const marksSubjects = (subjects || []).filter((subj: any) => 
      marks.some((m: any) => m.subjectId === subj.id && m.examId === selectedExam?.id)
    );
    if (marksSubjects.length > 0) {
      return [...marksSubjects].sort(compareSubjectsStandard);
    }

    // 3. Otherwise fallback to class curriculum subjects
    const classFiltered = (subjects || []).filter((s: any) => 
      !s.classId || s.classId === selectedClass || (s.classes && s.classes.includes(selectedClass))
    );
    const rawList = classFiltered.length > 0 ? classFiltered : (subjects || []);
    return [...rawList].sort(compareSubjectsStandard);
  }, [allExamSchedules, selectedExam, selectedBatch, selectedClass, batches, classes, subjects, marks]);

  // Group attendance by month (with robust string-based matching to avoid timezone parsing bugs)
  const ACADEMIC_MONTHS = useMemo(() => [
    { name: 'June', index: 5, label: 'June', numStr: '06' },
    { name: 'July', index: 6, label: 'July', numStr: '07' },
    { name: 'August', index: 7, label: 'Aug', numStr: '08' },
    { name: 'September', index: 8, label: 'Sept', numStr: '09' },
    { name: 'October', index: 9, label: 'OCT', numStr: '10' },
    { name: 'November', index: 10, label: 'NOV', numStr: '11' },
    { name: 'December', index: 11, label: 'Dec', numStr: '12' },
    { name: 'January', index: 0, label: 'Jan', numStr: '01' },
    { name: 'February', index: 1, label: 'Feb', numStr: '02' },
    { name: 'March', index: 2, label: 'Mar', numStr: '03' },
    { name: 'April', index: 3, label: 'Apr', numStr: '04' },
    { name: 'May', index: 4, label: 'May', numStr: '05' },
  ], []);

  const activeMonths = useMemo(() => {
    if (attendance.length === 0) return [];
    const monthsWithRecords = new Set<string>();
    attendance.forEach(a => {
      if (!a.date) return;
      const parts = a.date.split('-');
      if (parts.length >= 2) {
        const monthNum = parts[1];
        const monthObj = ACADEMIC_MONTHS.find(m => m.numStr === monthNum);
        if (monthObj) {
          monthsWithRecords.add(monthObj.name);
        }
      }
    });
    return ACADEMIC_MONTHS.filter(m => monthsWithRecords.has(m.name));
  }, [attendance, ACADEMIC_MONTHS]);

  const defaultMonths = useMemo(() => {
    const examName = (selectedExam?.title || '').toLowerCase().trim();
    if (examName.includes('fa-1') || examName.includes('fa 1') || examName.includes('fa1') || examName.includes('formative-1') || examName.includes('formative 1') || examName.includes('formative - 1')) {
      return [
        { name: 'June', index: 5, label: 'June' },
        { name: 'July', index: 6, label: 'July' }
      ];
    } else if (examName.includes('fa-2') || examName.includes('fa 2') || examName.includes('fa2') || examName.includes('formative-2') || examName.includes('formative 2') || examName.includes('formative - 2')) {
      return [
        { name: 'August', index: 7, label: 'Aug' },
        { name: 'September', index: 8, label: 'Sept' }
      ];
    } else if (examName.includes('fa-3') || examName.includes('fa 3') || examName.includes('fa3') || examName.includes('formative-3') || examName.includes('formative 3') || examName.includes('formative - 3')) {
      return [
        { name: 'October', index: 9, label: 'Oct' },
        { name: 'November', index: 10, label: 'Nov' }
      ];
    } else if (examName.includes('fa-4') || examName.includes('fa 4') || examName.includes('fa4') || examName.includes('formative-4') || examName.includes('formative 4') || examName.includes('formative - 4')) {
      return [
        { name: 'December', index: 11, label: 'Dec' },
        { name: 'January', index: 0, label: 'Jan' }
      ];
    } else if (examName.includes('sa-1') || examName.includes('sa 1') || examName.includes('sa1') || examName.includes('summative-1') || examName.includes('summative 1') || examName.includes('summative - 1')) {
      return [
        { name: 'June', index: 5, label: 'June' },
        { name: 'July', index: 6, label: 'July' },
        { name: 'August', index: 7, label: 'Aug' },
        { name: 'September', index: 8, label: 'Sept' },
        { name: 'October', index: 9, label: 'OCT' },
        { name: 'November', index: 10, label: 'NOV' }
      ];
    } else if (examName.includes('sa-2') || examName.includes('sa 2') || examName.includes('sa2') || examName.includes('annual')) {
      return [
        { name: 'December', index: 11, label: 'Dec' },
        { name: 'January', index: 0, label: 'Jan' },
        { name: 'February', index: 1, label: 'FEB' },
        { name: 'March', index: 2, label: 'MAR' }
      ];
    }
    return [
      { name: 'June', index: 5, label: 'June' },
      { name: 'July', index: 6, label: 'July' }
    ];
  }, [selectedExam, isFA]);

  const displayMonths = defaultMonths;

  const getWorkingDaysForMonth = (monthName: string) => {
    const monthLower = (monthName || '').toLowerCase().trim();
    if (monthLower === 'june' || monthLower === 'jun') return 14;
    if (monthLower === 'july' || monthLower === 'jul') return 25;

    if (workingDays) {
      const key = Object.keys(workingDays).find(k => k.toLowerCase() === monthLower);
      if (key && workingDays[key] !== undefined && workingDays[key] !== null && Number(workingDays[key]) > 0) {
        return Number(workingDays[key]);
      }
    }
    
    const defaults: Record<string, number> = {
      june: 14, july: 25, august: 20, september: 16, october: 19, november: 25,
      december: 18, january: 20, february: 22, march: 24, april: 15, may: 5
    };
    return defaults[monthLower] || 20;
  };

  const getStudentPresentDays = (studentId: string, monthName: string) => {
    const monthLower = monthName.toLowerCase();
    const monthObj = ACADEMIC_MONTHS.find(m => m.name.toLowerCase() === monthLower);
    if (!monthObj) return 0;
    
    const studentAttendance = attendance.filter(a => {
      if (a.studentId !== studentId || !a.date) return false;
      const parts = a.date.split('-');
      return parts.length >= 2 && parts[1] === monthObj.numStr;
    });
    return studentAttendance.filter(a => a.status === 'present' || a.status === 'present_half').length;
  };

  // Rank calculation helper
  const rankedStudents = useMemo(() => {
    const studentTotals = students.map((s: any) => {
      const studentId = s.id || s.uid;
      let grandTotal = 0;
      let allEmpty = true;
      let isAnyAbsent = false;
      let hasFailSubject = false;

      displaySubjects.forEach((subj: any) => {
        const m = marks.find((mark: any) => 
          (mark.studentId === studentId || mark.studentId === s.id || mark.studentId === s.uid) && 
          (mark.subjectId === subj.id || (mark.subjectName && subj.name && mark.subjectName.toLowerCase().trim() === subj.name.toLowerCase().trim()) || (mark.subjectId && subj.id && String(mark.subjectId).toLowerCase().trim() === String(subj.id).toLowerCase().trim())) && 
          mark.examId === selectedExam?.id
        );
        if (m) {
          if (isFA) {
            const hasData = (m.st1 !== null && m.st1 !== undefined && m.st1 !== '') || 
                            (m.st2 !== null && m.st2 !== undefined && m.st2 !== '') || 
                            (m.hw !== null && m.hw !== undefined && m.hw !== '') || 
                            (m.faWritten !== null && m.faWritten !== undefined && m.faWritten !== '');
            if (hasData) {
              allEmpty = false;
              const faWrittenAbsent = isMarkAbsent(m.faWritten);
              if (faWrittenAbsent) {
                isAnyAbsent = true;
              }
              const st1Val = isMarkAbsent(m.st1) ? 0 : (parseFloat(m.st1) || 0);
              const st2Val = isMarkAbsent(m.st2) ? 0 : (parseFloat(m.st2) || 0);
              const hwVal = isMarkAbsent(m.hw) ? 0 : (parseFloat(m.hw) || 0);
              const faVal = faWrittenAbsent ? 0 : (parseFloat(m.faWritten) || 0);
              const numSubjectTotal = isClass10Effective ? faVal : (isPrimary ? (st1Val + st2Val + hwVal + faVal) : (st1Val + st2Val + faVal));
              grandTotal += numSubjectTotal;
              const maxMarks = getSubjectMaxMarks(subj, true);
              if (!faWrittenAbsent && numSubjectTotal < maxMarks * 0.35) {
                hasFailSubject = true;
              }
            }
          } else {
            if (m.saWritten !== null && m.saWritten !== undefined && m.saWritten !== '') {
              allEmpty = false;
              const saWrittenAbsent = isMarkAbsent(m.saWritten);
              if (saWrittenAbsent) {
                isAnyAbsent = true;
              } else {
                const saVal = parseFloat(m.saWritten) || 0;
                grandTotal += saVal;
                const maxMarks = getSubjectMaxMarks(subj, false);
                if (saVal < maxMarks * 0.35) {
                  hasFailSubject = true;
                }
              }
            }
          }
        }
      });

      return {
        studentId,
        grandTotal,
        allEmpty,
        isAnyAbsent,
        hasFailSubject,
        isNonAttending: s.status === 'non_attending'
      };
    });

    const activeTotals = studentTotals
      .filter(st => !st.allEmpty && !st.isAnyAbsent && !st.isNonAttending && !st.hasFailSubject)
      .sort((a, b) => b.grandTotal - a.grandTotal);

    const ranks: Record<string, number> = {};
    let currentRank = 1;
    for (let i = 0; i < activeTotals.length; i++) {
      if (i > 0 && activeTotals[i].grandTotal < activeTotals[i - 1].grandTotal) {
        currentRank = i + 1;
      }
      ranks[activeTotals[i].studentId] = currentRank;
    }
    return ranks;
  }, [students, displaySubjects, marks, selectedExam, isFA, isPrimary, isClass10Effective]);

  if (!selectedExam) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
          <Filter className="w-8 h-8" />
        </div>
        <p className="text-neutral-500 font-bold uppercase tracking-widest text-sm">Select an Exam to View Class Report</p>
      </div>
    );
  }

  const calculateGrade = (percentage: number) => {
    if (percentage >= 91) return 'A1';
    if (percentage >= 81) return 'A2';
    if (percentage >= 71) return 'B1';
    if (percentage >= 61) return 'B2';
    if (percentage >= 51) return 'C1';
    if (percentage >= 41) return 'C2';
    if (percentage >= 35) return 'D';
    return 'E';
  };

  const getStudentRowInfo = (s: any) => {
    const studentId = s.id || s.uid;
    const isNonAttending = s.status === 'non_attending';
    const rollDisplay = isNonAttending ? 'N/A' : (s.rollNumber || '-');
    const nameDisplay = s.name || '-';

    let grandTotal = 0;
    let allEmpty = true;
    let hasFailSubject = false;
    let isAnyAbsent = false;

    // Subject cells
    const subjectCells: any[] = [];
    if (isFA) {
      displaySubjects.forEach((subj: any) => {
        const m = marks.find((mark: any) => 
          (mark.studentId === studentId || mark.studentId === s.id || mark.studentId === s.uid) && 
          (mark.subjectId === subj.id || (mark.subjectName && subj.name && mark.subjectName.toLowerCase().trim() === subj.name.toLowerCase().trim()) || (mark.subjectId && subj.id && String(mark.subjectId).toLowerCase().trim() === String(subj.id).toLowerCase().trim())) && 
          mark.examId === selectedExam?.id
        );
        if (m) {
          allEmpty = false;
          const st1Absent = isMarkAbsent(m.st1);
          const st2Absent = isMarkAbsent(m.st2);
          const hwAbsent = isMarkAbsent(m.hw);
          const faWrittenAbsent = isMarkAbsent(m.faWritten);

          if (faWrittenAbsent) {
            isAnyAbsent = true;
          }

          const st1Val = st1Absent ? 0 : (parseFloat(m.st1) || 0);
          const st2Val = st2Absent ? 0 : (parseFloat(m.st2) || 0);
          const hwVal = hwAbsent ? 0 : (parseFloat(m.hw) || 0);
          const internalVal = isPrimary ? (st1Val + st2Val + hwVal) : (st1Val + st2Val);
          const examVal = faWrittenAbsent ? 0 : (parseFloat(m.faWritten) || 0);

          const numSubjectTotal = isClass10Effective ? examVal : (internalVal + examVal);
          grandTotal += numSubjectTotal;

          const isSubPass = typeof numSubjectTotal === 'number' ? numSubjectTotal >= 50 * 0.35 : false;
          if (!faWrittenAbsent && numSubjectTotal < 50 * 0.35) {
            hasFailSubject = true;
          }

          const isAllInternalAbsent = (st1Absent || m.st1 === null || m.st1 === undefined) && (st2Absent || m.st2 === null || m.st2 === undefined) && (!isPrimary || hwAbsent || m.hw === null || m.hw === undefined);
          const internalDisplay = (m.st1 === null && m.st2 === null && (!isPrimary || m.hw === null)) 
            ? '-' 
            : (isAllInternalAbsent && (st1Absent || st2Absent || hwAbsent) ? 'Absent' : formatDecimalMark(internalVal));
          const examDisplay = faWrittenAbsent 
            ? 'Absent' 
            : ((m.faWritten === null || m.faWritten === undefined || m.faWritten === '') ? '-' : formatDecimalMark(examVal));
          const subjectTotalDisplay = faWrittenAbsent ? 'Absent' : formatDecimalMark(numSubjectTotal);

          subjectCells.push({
            subjId: subj.id,
            internalDisplay,
            examDisplay,
            subjectTotalDisplay,
            isSubPass: !faWrittenAbsent && isSubPass,
            hasData: true
          });
        } else {
          subjectCells.push({
            subjId: subj.id,
            internalDisplay: '-',
            examDisplay: '-',
            subjectTotalDisplay: '-',
            isSubPass: true,
            hasData: false
          });
        }
      });
    } else {
      displaySubjects.forEach((subj: any) => {
        const m = marks.find((mark: any) => 
          (mark.studentId === studentId || mark.studentId === s.id || mark.studentId === s.uid) && 
          (mark.subjectId === subj.id || (mark.subjectName && subj.name && mark.subjectName.toLowerCase().trim() === subj.name.toLowerCase().trim()) || (mark.subjectId && subj.id && String(mark.subjectId).toLowerCase().trim() === String(subj.id).toLowerCase().trim())) && 
          mark.examId === selectedExam?.id
        );
        const maxMarks = getSubjectMaxMarks(subj, false);
        if (m && m.saWritten !== null && m.saWritten !== undefined && m.saWritten !== '') {
          allEmpty = false;
          const saWrittenAbsent = isMarkAbsent(m.saWritten);
          if (saWrittenAbsent) {
            isAnyAbsent = true;
            subjectCells.push({
              subjId: subj.id,
              saDisplay: 'Absent',
              isSubPass: false,
              hasData: true
            });
          } else {
            const saVal = parseFloat(m.saWritten) || 0;
            grandTotal += saVal;
            const isSubPass = saVal >= maxMarks * 0.35;
            if (!isSubPass) hasFailSubject = true;
            subjectCells.push({
              subjId: subj.id,
              saDisplay: formatDecimalMark(saVal),
              isSubPass,
              hasData: true
            });
          }
        } else {
          subjectCells.push({
            subjId: subj.id,
            saDisplay: '-',
            isSubPass: true,
            hasData: false
          });
        }
      });
    }

    let studentMaxPossible = 0;
    displaySubjects.forEach((subj: any) => {
      studentMaxPossible += getSubjectMaxMarks(subj, isFA);
    });

    const preciseGrandTotal = Math.round((grandTotal + Number.EPSILON) * 100) / 100;
    const roundedGrandTotal = Math.round(preciseGrandTotal);

    const percentage = studentMaxPossible > 0 ? Math.round(((preciseGrandTotal / studentMaxPossible) * 100) + Number.EPSILON) : 0;
    
    let gradeDisplay = "-";
    let rankDisplay: string | number = "-";
    let percentageDisplay = "-";

    if (!allEmpty) {
      if (isAnyAbsent) {
        percentageDisplay = "Absent";
        gradeDisplay = "Absent";
        rankDisplay = "Absent";
      } else if (hasFailSubject) {
        percentageDisplay = "Fail";
        gradeDisplay = "Fail";
        rankDisplay = "Fail";
      } else {
        percentageDisplay = `${percentage}%`;
        gradeDisplay = calculateGrade(percentage);
        rankDisplay = rankedStudents[studentId] ? rankedStudents[studentId] : "-";
      }
    }
    const grandTotalDisplay = allEmpty ? "-" : roundedGrandTotal;

    // Attendance
    const attendanceCells = displayMonths.map((m: any) => ({
      monthName: m.name,
      label: m.label,
      presentDays: getStudentPresentDays(studentId, m.name)
    }));

    return {
      studentId,
      isNonAttending,
      rollDisplay,
      nameDisplay,
      subjectCells,
      grandTotalDisplay,
      percentageDisplay,
      gradeDisplay,
      rankDisplay,
      attendanceCells,
      hasFailSubject
    };
  };

  const handleExportExcel = () => {
    try {
      const headers = ["Roll No", "Student Name"];
      
      if (isFA) {
        displaySubjects.forEach((subj: any) => {
          headers.push(`${subj.name} Internal`, `${subj.name} ${examTitle}`, `${subj.name} Total`);
        });
      } else {
        displaySubjects.forEach((subj: any) => {
          headers.push(`${subj.name} (Max ${getSubjectMaxMarks(subj, false)})`);
        });
      }
      
      headers.push("Total", "Percentage %", "Grade", "Rank");
      
      displayMonths.forEach((m: any) => {
        headers.push(`Attendance ${m.label} (Max ${getWorkingDaysForMonth(m.name)})`);
      });

      const sheetRows: any[][] = [headers];

      students.forEach((s: any) => {
        const rowInfo = getStudentRowInfo(s);
        const rowData: any[] = [rowInfo.rollDisplay, rowInfo.nameDisplay];

        if (isFA) {
          rowInfo.subjectCells.forEach((c: any) => {
            rowData.push(c.internalDisplay, c.examDisplay, c.subjectTotalDisplay);
          });
        } else {
          rowInfo.subjectCells.forEach((c: any) => {
            rowData.push(c.saDisplay);
          });
        }

        rowData.push(rowInfo.grandTotalDisplay, rowInfo.percentageDisplay, rowInfo.gradeDisplay, rowInfo.rankDisplay);

        rowInfo.attendanceCells.forEach((att: any) => {
          rowData.push(att.presentDays);
        });

        sheetRows.push(rowData);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Class Report");
      XLSX.writeFile(workbook, `${selectedExam.title.replace(/\s+/g, '_')}_Class_Teacher_Report.xlsx`);
      toast.success("Excel Class Report exported successfully");
    } catch (error) {
      console.error("Excel export error:", error);
      toast.error("Failed to export Excel report");
    }
  };

  const handleExportPDF = (orientation: 'landscape' | 'portrait' = pdfOrientation) => {
    try {
      const doc = new jsPDF({
        orientation: orientation,
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const activeClassObj = (classes || []).find((c: any) => c.id === selectedClass || c.name === selectedClass);
      const activeBatchObj = (batches || []).find((b: any) => b.id === selectedBatch || b.name === selectedBatch);
      const className = activeClassObj?.name || selectedClass || 'Class';
      const batchName = activeBatchObj?.name || selectedBatch || 'Batch';

      // Header title banner
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      const schoolName = settings?.schoolName || "ST. ANTONY'S HIGH SCHOOL";
      doc.text(schoolName.toUpperCase(), pageWidth / 2, 26, { align: 'center' });

      doc.setFontSize(10.5);
      doc.setTextColor(71, 85, 105);
      const reportTitle = `${selectedExam?.title || 'EXAMINATION'} - CLASS TEACHER REPORT`;
      doc.text(reportTitle.toUpperCase(), pageWidth / 2, 40, { align: 'center' });

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      const metaInfo = `Class: ${className} | Batch/Section: ${batchName} | Academic Year: ${settings?.currentAcademicYear || '2025-26'} | Total Students: ${students.length} | Format: A4 ${orientation.toUpperCase()}`;
      doc.text(metaInfo, pageWidth / 2, 53, { align: 'center' });

      // Table Headers
      const headers: string[] = ["Roll", "Student Name"];
      
      if (isFA) {
        displaySubjects.forEach((subj: any) => {
          headers.push(`${subj.name}\nInt`, `${subj.name}\n${examTitle}`, `${subj.name}\nTotal`);
        });
      } else {
        displaySubjects.forEach((subj: any) => {
          headers.push(`${subj.name}\n(${getSubjectMaxMarks(subj, false)})`);
        });
      }

      headers.push("Total", "Pct\n%", "Grade", "Rank");

      displayMonths.forEach((m: any) => {
        headers.push(`${m.label}\nAtt`);
      });

      const tableRows: any[][] = [];

      students.forEach((s: any) => {
        const rowInfo = getStudentRowInfo(s);
        const rowData: any[] = [rowInfo.rollDisplay, rowInfo.nameDisplay];

        if (isFA) {
          rowInfo.subjectCells.forEach((c: any) => {
            rowData.push(c.internalDisplay, c.examDisplay, c.subjectTotalDisplay);
          });
        } else {
          rowInfo.subjectCells.forEach((c: any) => {
            rowData.push(c.saDisplay);
          });
        }

        rowData.push(rowInfo.grandTotalDisplay, rowInfo.percentageDisplay, rowInfo.gradeDisplay, rowInfo.rankDisplay);

        rowInfo.attendanceCells.forEach((att: any) => {
          rowData.push(att.presentDays);
        });

        tableRows.push(rowData);
      });

      const totalCols = headers.length;
      const isManyCols = totalCols > 15;
      const fontSize = orientation === 'landscape' ? (isManyCols ? 6.5 : 7.5) : (isManyCols ? 5 : 6);
      const cellPadding = orientation === 'landscape' ? 2.5 : 1.8;

      autoTable(doc, {
        head: [headers],
        body: tableRows,
        startY: 62,
        margin: { top: 62, bottom: 25, left: 12, right: 12 },
        styles: {
          fontSize: fontSize,
          cellPadding: cellPadding,
          lineColor: [203, 213, 225],
          lineWidth: 0.4,
          halign: 'center',
          valign: 'middle',
          overflow: 'linebreak',
          cellWidth: 'auto'
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          fontSize: fontSize + 0.5
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: orientation === 'landscape' ? 24 : 18 },
          1: { halign: 'left', fontStyle: 'bold', cellWidth: orientation === 'landscape' ? 85 : 60 },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didDrawPage: (data: any) => {
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${data.pageNumber} of ${doc.getNumberOfPages()} | Generated on ${new Date().toLocaleDateString()}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }
      });

      const fileName = `${selectedExam.title.replace(/\s+/g, '_')}_${className}_${batchName}_Class_Report_${orientation.toUpperCase()}.pdf`;
      doc.save(fileName);
      toast.success(`Class Teacher Report PDF (${orientation.toUpperCase()}) exported successfully!`);
      setShowPDFModal(false);
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF report");
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-xl font-black text-sidebar uppercase tracking-tight">Class Teacher Report</h3>
          <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">
            Exam: {selectedExam.title} | Format: {isFA ? (isPrimary ? 'FA - Primary Format: ST1(10) + ST2(10) + ST3(5) + FA1(25) = 50 Marks' : 'FA - Secondary Format: ST1(10) + ST2(5) + FA1(35) = 50 Marks') : 'SA (Summative Assessment)'}
          </p>
        </div>
        
        <div className="flex items-center gap-2 self-start">
          <button 
            onClick={handleExportExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm rounded-xl text-xs font-black px-4 py-2.5 flex items-center gap-1.5 transition-all active:scale-95"
            title="Export Excel Sheet (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
          <button 
            onClick={() => setShowPDFModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white shadow-sm rounded-xl text-xs font-black px-4 py-2.5 flex items-center gap-1.5 transition-all active:scale-95"
            title="Export PDF Document (.pdf)"
          >
            <FileText className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-neutral-300 rounded-2xl shadow-inner bg-neutral-50/50">
        <table className="w-full border-collapse border border-neutral-300">
          <thead>
            {/* Header Row 1: Main Exam Banner & Subjects */}
            <tr className="bg-neutral-100 text-[11px] font-black uppercase text-neutral-600 tracking-wider">
              <th rowSpan={isFA ? 3 : 2} className="p-2 text-left border border-neutral-300 min-w-[70px] bg-neutral-200 text-neutral-800 font-extrabold text-center align-middle">Roll No</th>
              <th rowSpan={isFA ? 3 : 2} className="p-2 text-left border border-neutral-300 min-w-[150px] bg-neutral-200 text-neutral-800 font-extrabold align-middle">Student Name</th>
              
              {isFA ? (
                // FA layout has a row of subjects spanning 3 columns each
                displaySubjects.map((s: any) => (
                  <th key={s.id} colSpan={3} className="p-2 text-center border border-neutral-300 bg-[#ffeb3b]/90 text-neutral-900 font-black tracking-widest text-[12px]">
                    {s.name}
                  </th>
                ))
              ) : (
                // SA layout has a single banner for SA, and the subject names go to Row 2
                <th colSpan={displaySubjects.length} className="p-2 text-center border border-neutral-300 bg-sky-600 text-white font-black tracking-widest text-[12px]">
                  {examTitle}
                </th>
              )}

              {/* Summary columns */}
              <th rowSpan={isFA ? 3 : 2} className={`p-2 text-center border border-neutral-300 font-black text-xs align-middle ${isFA ? 'bg-[#dfff00] text-neutral-900' : 'bg-red-600 text-white'}`}>
                Total
              </th>
              <th rowSpan={isFA ? 3 : 2} className="p-2 text-center border border-neutral-300 bg-neutral-200 text-neutral-800 font-black text-[11px] align-middle">Percentage %</th>
              <th rowSpan={isFA ? 3 : 2} className="p-2 text-center border border-neutral-300 bg-neutral-200 text-neutral-800 font-black text-[11px] align-middle">Grade</th>
              <th rowSpan={isFA ? 3 : 2} className="p-2 text-center border border-neutral-300 bg-neutral-200 text-neutral-800 font-black text-[11px] align-middle">Rank</th>
              
              {/* Attendance month group */}
              <th colSpan={displayMonths.length} className="p-2 text-center border border-neutral-300 bg-amber-100 text-amber-900 font-black text-[11px] tracking-widest">
                Attendance
              </th>

              {/* Action Column */}
              {onDeleteStudent && (
                <th rowSpan={isFA ? 3 : 2} className="p-2 text-center border border-neutral-300 bg-neutral-200 text-neutral-800 font-black text-[11px] align-middle w-12">
                  Action
                </th>
              )}
            </tr>

            {/* Header Row 2: Sub-columns or Subject Names */}
            <tr className="bg-neutral-50 text-[10px] font-bold uppercase text-neutral-500 tracking-wider">
              {isFA ? (
                // Under FA, each subject has: Internal, FA-2, Subject Total
                displaySubjects.map((s: any) => (
                  <React.Fragment key={s.id}>
                    <th className="p-1.5 text-center border border-neutral-300 bg-neutral-100 text-neutral-700 font-black">Internal</th>
                    <th className="p-1.5 text-center border border-neutral-300 bg-neutral-100 text-neutral-700 font-black">{examTitle}</th>
                    <th className="p-1.5 text-center border border-neutral-300 bg-rose-100 text-rose-900 font-black">{s.name} Total</th>
                  </React.Fragment>
                ))
              ) : (
                // Under SA, this row has the subject names
                displaySubjects.map((s: any) => (
                  <th key={s.id} className="p-2 text-center border border-neutral-300 bg-[#ffeb3b]/90 text-neutral-950 font-black text-[11px]">
                    {s.name}
                  </th>
                ))
              )}

              {/* Under Attendance: month names */}
              {displayMonths.map((m: any) => (
                <th key={m.name} className="p-1.5 text-center border border-neutral-300 bg-amber-50 text-amber-800 font-black min-w-[60px]">
                  {m.label}
                </th>
              ))}
            </tr>

            {/* Header Row 3: Max Marks */}
            <tr className="bg-neutral-100 text-[10px] font-black text-emerald-800 text-center">
              {isFA ? (
                displaySubjects.map((s: any) => {
                  const maxInternal = isPrimary ? 25 : 15;
                  const maxExam = isPrimary ? 25 : 35;
                  return (
                    <React.Fragment key={s.id}>
                      <td className="p-1 border border-neutral-300 bg-neutral-55 font-mono">{maxInternal}</td>
                      <td className="p-1 border border-neutral-300 bg-neutral-55 font-mono">{maxExam}</td>
                      <td className="p-1 border border-neutral-300 bg-rose-50/55 font-mono text-rose-700">{50}</td>
                    </React.Fragment>
                  );
                })
              ) : (
                displaySubjects.map((s: any) => (
                  <td key={s.id} className="p-1.5 border border-neutral-300 bg-sky-50 text-sky-800 font-mono font-black">
                    {getSubjectMaxMarks(s, false)}
                  </td>
                ))
              )}

              {/* Working days for each month under Attendance */}
              {displayMonths.map((m: any) => (
                <td key={m.name} className="p-1.5 border border-neutral-300 bg-amber-50 text-amber-700 font-mono font-black text-center">
                  {getWorkingDaysForMonth(m.name)}
                </td>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-300 bg-white">
            {students.map((s: any) => {
              const rowInfo = getStudentRowInfo(s);
              return (
                <tr key={rowInfo.studentId} className={`hover:bg-neutral-50 transition-colors text-xs ${rowInfo.isNonAttending ? 'bg-amber-50/30' : ''}`}>
                  {/* Roll No */}
                  <td className="p-2 text-center border border-neutral-300 font-mono font-black text-neutral-600 bg-neutral-50/50">
                    {rowInfo.isNonAttending ? (
                      <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-black">N/A</span>
                    ) : (
                      rowInfo.rollDisplay
                    )}
                  </td>
                  
                  {/* Student Name */}
                  <td className="p-2 border border-neutral-300 font-black text-sidebar bg-neutral-50/20 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span>{rowInfo.nameDisplay}</span>
                      {rowInfo.isNonAttending && (
                        <span className="text-[8px] bg-amber-100 text-amber-700 font-black uppercase px-1.5 py-0.5 rounded border border-amber-200">
                          N/A
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Subject Marks */}
                  {isFA ? (
                    rowInfo.subjectCells.map((cell: any) => {
                      if (cell.hasData) {
                        return (
                          <React.Fragment key={cell.subjId}>
                            {/* Internal Column */}
                            <td className="p-2 text-center border border-neutral-300 font-mono font-bold text-neutral-800 bg-[#ffffdd]/20">
                              {cell.internalDisplay}
                            </td>
                            {/* Exam Column */}
                            <td className="p-2 text-center border border-neutral-300 font-mono font-bold text-neutral-800 bg-[#ffffdd]/20">
                              {cell.examDisplay}
                            </td>
                            {/* Subject Total Column */}
                            <td className={`p-2 text-center border border-neutral-300 font-mono font-black ${
                              cell.isSubPass ? 'bg-red-500 text-white' : 'bg-red-700 text-yellow-300'
                            }`}>
                              {cell.subjectTotalDisplay}
                            </td>
                          </React.Fragment>
                        );
                      } else {
                        return (
                          <React.Fragment key={cell.subjId}>
                            <td className="p-2 text-center border border-neutral-300 text-neutral-400 font-mono font-bold">-</td>
                            <td className="p-2 text-center border border-neutral-300 text-neutral-400 font-mono font-bold">-</td>
                            <td className="p-2 text-center border border-neutral-300 bg-red-15 text-neutral-400 font-mono font-bold">-</td>
                          </React.Fragment>
                        );
                      }
                    })
                  ) : (
                    rowInfo.subjectCells.map((cell: any) => {
                      return (
                        <td key={cell.subjId} className={`p-2 text-center border border-neutral-300 font-mono font-bold text-neutral-900 ${
                          cell.saDisplay !== '-' && cell.saDisplay !== 'Absent' && !cell.isSubPass ? 'text-red-600 bg-red-50/50' : ''
                        }`}>
                          {cell.saDisplay}
                        </td>
                      );
                    })
                  )}

                  {/* Summary Total */}
                  <td className={`p-2 text-center border border-neutral-300 font-mono font-black ${
                    rowInfo.grandTotalDisplay === '-' ? '-' : isFA ? 'bg-[#dfff00]/90 text-neutral-900' : 'bg-red-600 text-white font-extrabold'
                  }`}>
                    {rowInfo.grandTotalDisplay}
                  </td>

                  {/* Percentage */}
                  <td className="p-2 text-center border border-neutral-300 font-mono font-bold">
                    {rowInfo.percentageDisplay === 'Fail' ? (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded">
                        Fail
                      </span>
                    ) : rowInfo.percentageDisplay === 'Absent' ? (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded">
                        Absent
                      </span>
                    ) : (
                      <span className="text-neutral-700">{rowInfo.percentageDisplay}</span>
                    )}
                  </td>

                  {/* Grade */}
                  <td className="p-2 text-center border border-neutral-300 font-bold">
                    {rowInfo.gradeDisplay === 'Fail' ? (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded">
                        Fail
                      </span>
                    ) : rowInfo.gradeDisplay === 'Absent' ? (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded">
                        Absent
                      </span>
                    ) : (
                      <span className="text-neutral-800">{rowInfo.gradeDisplay}</span>
                    )}
                  </td>

                  {/* Rank */}
                  <td className="p-2 text-center border border-neutral-300 font-mono font-black">
                    {rowInfo.rankDisplay === 'Fail' ? (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded">
                        Fail
                      </span>
                    ) : rowInfo.rankDisplay === 'Absent' ? (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded">
                        Absent
                      </span>
                    ) : (
                      <span className="text-indigo-700 bg-indigo-50/20 px-1 py-0.5 rounded">{rowInfo.rankDisplay}</span>
                    )}
                  </td>

                  {/* Attendance Columns: Months */}
                  {rowInfo.attendanceCells.map((att: any) => {
                    return (
                      <td key={att.monthName} className="p-2 text-center border border-neutral-300 font-mono font-bold text-neutral-800 bg-amber-50/10">
                        {att.presentDays}
                      </td>
                    );
                  })}

                  {/* Action Cell */}
                  {onDeleteStudent && (
                    <td className="p-2 text-center border border-neutral-300 bg-neutral-50/30">
                      <button
                        type="button"
                        onClick={() => onDeleteStudent(s)}
                        title={`Permanently delete ${s.name || 'student'} from database`}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all active:scale-95 inline-flex items-center justify-center border border-red-200 shadow-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PDF Export Orientation Modal */}
      {showPDFModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-neutral-100 animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-gradient-to-br from-neutral-900 to-sidebar text-white relative">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Export PDF Report</h3>
                  <p className="text-xs text-neutral-300">Select page orientation for A4 print/export</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPDFModal(false)}
                className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block mb-3">
                  Page Orientation (A4 Paper)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPdfOrientation('landscape')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2.5 transition-all text-center relative ${
                      pdfOrientation === 'landscape'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-md shadow-indigo-600/10'
                        : 'border-neutral-200 hover:border-neutral-300 text-neutral-600 bg-white'
                    }`}
                  >
                    {pdfOrientation === 'landscape' && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center text-white">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                    <div className={`w-12 h-8 border-2 rounded-md flex items-center justify-center ${
                      pdfOrientation === 'landscape' ? 'border-indigo-600 bg-white' : 'border-neutral-300 bg-neutral-100'
                    }`}>
                      <FileText className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <span className="font-extrabold text-sm block">A4 Landscape</span>
                      <span className="text-[10px] text-neutral-500 font-semibold">(Recommended)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfOrientation('portrait')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2.5 transition-all text-center relative ${
                      pdfOrientation === 'portrait'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-md shadow-indigo-600/10'
                        : 'border-neutral-200 hover:border-neutral-300 text-neutral-600 bg-white'
                    }`}
                  >
                    {pdfOrientation === 'portrait' && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center text-white">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                    <div className={`w-8 h-12 border-2 rounded-md flex items-center justify-center ${
                      pdfOrientation === 'portrait' ? 'border-indigo-600 bg-white' : 'border-neutral-300 bg-neutral-100'
                    }`}>
                      <FileText className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <span className="font-extrabold text-sm block">A4 Portrait</span>
                      <span className="text-[10px] text-neutral-500 font-semibold">(Vertical)</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs text-neutral-600 space-y-1">
                <p className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  Export Details
                </p>
                <p className="text-[11px] text-neutral-500">
                  Absent subjects will be shown strictly as <strong className="text-red-600">Absent</strong>. Grand Total will display the real-time calculated total number.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPDFModal(false)}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-2xl font-bold transition-all text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPDF(pdfOrientation)}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-600/25 active:scale-95 text-xs flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Generate PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function normalizeIndianPhone(phone: string): string {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
}

function isValidIndianMobile(phone: string): boolean {
  const cleaned = normalizeIndianPhone(phone);
  return /^[6-9]\d{9}$/.test(cleaned);
}

const WhatsAppTab = ({
  students,
  selectedExam,
  selectedClass,
  selectedBatch,
  exams,
  subjects,
  classes,
  batches,
  isClass10,
  isClass6to9: propIsClass6to9,
  isPrimary,
  resolvedMarks,
  setActiveTab
}: any) => {
  const [loading, setLoading] = useState(false);
  const [forceSend, setForceSend] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [summaryDetails, setSummaryDetails] = useState<any>(null);
  const [resultsList, setResultsList] = useState<Record<string, { status: string; reason?: string }>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [sentStatusMap, setSentStatusMap] = useState<Record<string, { sent: boolean; sentAt?: string; status?: string; messageId?: string }>>({});
  const [fetchingSentStatus, setFetchingSentStatus] = useState(false);

  // Fetch persistent WhatsApp sent marks status whenever selectedExam changes
  useEffect(() => {
    if (!selectedExam) {
      setSentStatusMap({});
      return;
    }

    let active = true;
    setFetchingSentStatus(true);
    fetch(`/api/exams/marks-whatsapp-status?examId=${selectedExam}`)
      .then(r => r.json())
      .then(data => {
        if (active && data.success && data.sentMap) {
          setSentStatusMap(data.sentMap);
        }
      })
      .catch(err => console.warn('Failed to load marks whatsapp status:', err))
      .finally(() => {
        if (active) setFetchingSentStatus(false);
      });

    return () => { active = false; };
  }, [selectedExam]);

  // Itemized inspection and filtering state
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string | null>(null);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [modalCategory, setModalCategory] = useState<'duplicates' | 'marksMissing' | 'invalidPhone' | 'missingPhone' | 'queued' | 'optOut' | 'failed' | 'alreadySent' | 'all'>('marksMissing');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, label: string = 'Copied') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    toast.success(`${label}: ${text}`);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const sortedStudents = React.useMemo(() => {
    return [...(students || [])].sort(sortByRollNumber);
  }, [students]);

  const activeExam = exams.find((e: any) => e.id === selectedExam);
  const isFA = activeExam?.type === 'FA';

  // Pre-flight student & phone analysis to detect missing marks & duplicate numbers in class
  const preflightAnalysis = React.useMemo(() => {
    const marksMissing: any[] = [];
    const missingPhone: any[] = [];
    const invalidPhone: any[] = [];
    const phoneToStudents = new Map<string, any[]>();

    (sortedStudents || []).forEach((student: any) => {
      const sId = student.id || student.uid;
      const rawPhone = student.parentPhone || student.whatsappNumber || '';
      const normPhone = rawPhone ? normalizeIndianPhone(rawPhone) : '';

      // Check marks in resolvedMarks for activeExam
      const studentMarks = (resolvedMarks || []).filter((m: any) => {
        const matchStudent = m.studentId === sId || String(m.studentId) === String(sId);
        if (!matchStudent) return false;
        if (selectedExam && (m.examId === selectedExam || String(m.examId) === String(selectedExam))) return true;
        if (activeExam?.title && m.examTitle === activeExam.title) return true;
        return false;
      });

      if (studentMarks.length === 0) {
        marksMissing.push({
          studentId: sId,
          studentName: student.name || 'Unknown',
          rollNumber: student.rollNumber || '-',
          phone: rawPhone || 'Not Available',
          reason: `No marks entered for ${activeExam?.title || 'this exam'}`
        });
      }

      if (!rawPhone.trim()) {
        missingPhone.push({
          studentId: sId,
          studentName: student.name || 'Unknown',
          rollNumber: student.rollNumber || '-',
          reason: 'No parent phone registered in profile'
        });
      } else if (!isValidIndianMobile(normPhone)) {
        invalidPhone.push({
          studentId: sId,
          studentName: student.name || 'Unknown',
          rollNumber: student.rollNumber || '-',
          phone: normPhone,
          rawPhone,
          reason: `Invalid 10-digit mobile number format: "${rawPhone}"`
        });
      } else {
        if (!phoneToStudents.has(normPhone)) phoneToStudents.set(normPhone, []);
        phoneToStudents.get(normPhone)!.push(student);
      }
    });

    // Detect duplicate / shared numbers in this batch
    const sharedPhoneMap: Record<string, { count: number; students: any[]; rollNumbers: string[] }> = {};
    phoneToStudents.forEach((studs, phone) => {
      if (studs.length > 1) {
        sharedPhoneMap[phone] = {
          count: studs.length,
          students: studs,
          rollNumbers: studs.map(s => s.rollNumber || '-')
        };
      }
    });

    return {
      marksMissing,
      missingPhone,
      invalidPhone,
      sharedPhoneMap
    };
  }, [sortedStudents, resolvedMarks, selectedExam, activeExam]);

  // Merge authoritative server details with preflight detection
  const currentDuplicatesList = useMemo(() => {
    if (summaryDetails?.duplicates && summaryDetails.duplicates.length > 0) {
      return summaryDetails.duplicates;
    }
    // Pre-flight shared duplicate phone numbers in current roster
    const sharedList: any[] = [];
    Object.entries(preflightAnalysis.sharedPhoneMap).forEach(([phone, info]) => {
      info.students.forEach(st => {
        sharedList.push({
          studentId: st.id || st.uid,
          studentName: st.name,
          rollNumber: st.rollNumber || '-',
          phone,
          reason: `Duplicate phone shared by ${info.count} students: ${info.students.map(s => `${s.name} (Roll ${s.rollNumber || '-'})`).join(', ')}`
        });
      });
    });
    return sharedList;
  }, [summaryDetails, preflightAnalysis]);

  const currentMarksMissingList = useMemo(() => {
    if (summaryDetails?.marksMissing && summaryDetails.marksMissing.length > 0) {
      return summaryDetails.marksMissing;
    }
    return preflightAnalysis.marksMissing;
  }, [summaryDetails, preflightAnalysis]);

  const currentInvalidPhoneList = useMemo(() => {
    if (summaryDetails?.invalidPhone && summaryDetails.invalidPhone.length > 0) {
      return summaryDetails.invalidPhone;
    }
    return preflightAnalysis.invalidPhone;
  }, [summaryDetails, preflightAnalysis]);

  const currentMissingPhoneList = useMemo(() => {
    if (summaryDetails?.missingPhone && summaryDetails.missingPhone.length > 0) {
      return summaryDetails.missingPhone;
    }
    return preflightAnalysis.missingPhone;
  }, [summaryDetails, preflightAnalysis]);

  const currentQueuedList = useMemo(() => {
    return summaryDetails?.queued || [];
  }, [summaryDetails]);

  const currentOptOutList = useMemo(() => {
    return summaryDetails?.optOut || [];
  }, [summaryDetails]);

  const currentFailedList = useMemo(() => {
    return summaryDetails?.failed || [];
  }, [summaryDetails]);

  // Check whether marks for a specific student have already been sent to WhatsApp
  const isStudentMarksSent = React.useCallback((studentId: string) => {
    if (sentStatusMap[studentId]?.sent) return true;
    const resInfo = resultsList[studentId];
    if (resInfo && (resInfo.status === 'queued' || resInfo.status === 'sent')) return true;
    const hasMarkFlag = (resolvedMarks || []).some(
      (m: any) => (m.studentId === studentId || String(m.studentId) === String(studentId)) &&
                  (m.examId === selectedExam || (activeExam?.title && m.examTitle === activeExam.title)) &&
                  m.whatsappSent === true
    );
    return hasMarkFlag;
  }, [sentStatusMap, resultsList, resolvedMarks, selectedExam, activeExam]);

  // List of students whose marks have already been sent to WhatsApp (Deactivated to prevent double-sending)
  const currentAlreadySentList = useMemo(() => {
    return (sortedStudents || [])
      .filter((s: any) => isStudentMarksSent(s.id || s.uid))
      .map((s: any) => {
        const id = s.id || s.uid;
        const sentRec = sentStatusMap[id];
        return {
          studentId: id,
          studentName: s.name,
          rollNumber: s.rollNumber || '-',
          phone: s.parentPhone || s.whatsappNumber || '-',
          sentAt: sentRec?.sentAt,
          reason: sentRec?.sentAt 
            ? `Marks sent on ${new Date(sentRec.sentAt).toLocaleDateString('en-IN')}. Deactivated to prevent duplicate messages.` 
            : 'Marks sent via WhatsApp. Deactivated to prevent double-sending messages.'
        };
      });
  }, [sortedStudents, isStudentMarksSent, sentStatusMap]);

  // Students who have NOT received marks yet and have marks entered + valid phone
  const unsentStudentsWithMarks = useMemo(() => {
    return (sortedStudents || []).filter((student: any) => {
      const sId = student.id || student.uid;
      if (isStudentMarksSent(sId)) return false;
      const rawPhone = student.parentPhone || student.whatsappNumber;
      if (!rawPhone) return false;
      const studentMarks = (resolvedMarks || []).filter((m: any) => {
        const matchStudent = m.studentId === sId || String(m.studentId) === String(sId);
        if (!matchStudent) return false;
        if (selectedExam && (m.examId === selectedExam || String(m.examId) === String(selectedExam))) return true;
        if (activeExam?.title && m.examTitle === activeExam.title) return true;
        return false;
      });
      return studentMarks.length > 0;
    });
  }, [sortedStudents, isStudentMarksSent, resolvedMarks, selectedExam, activeExam]);

  // Filter student table based on summary card selection
  const filteredStudents = useMemo(() => {
    if (!selectedFilterCategory) return sortedStudents;

    if (selectedFilterCategory === 'already_sent') {
      return sortedStudents.filter((s: any) => isStudentMarksSent(s.id || s.uid));
    }

    if (selectedFilterCategory === 'duplicate') {
      const dupStudentIds = new Set(currentDuplicatesList.map((d: any) => d.studentId));
      return sortedStudents.filter((s: any) => {
        const id = s.id || s.uid;
        return dupStudentIds.has(id) || resultsList[id]?.status === 'duplicate';
      });
    }

    if (selectedFilterCategory === 'missing_marks') {
      const missingIds = new Set(currentMarksMissingList.map((m: any) => m.studentId));
      return sortedStudents.filter((s: any) => {
        const id = s.id || s.uid;
        return missingIds.has(id) || resultsList[id]?.status === 'missing_marks';
      });
    }

    if (selectedFilterCategory === 'invalid_phone') {
      const invalidIds = new Set(currentInvalidPhoneList.map((i: any) => i.studentId));
      return sortedStudents.filter((s: any) => {
        const id = s.id || s.uid;
        return invalidIds.has(id) || resultsList[id]?.status === 'invalid_phone';
      });
    }

    if (selectedFilterCategory === 'missing_phone') {
      const missingPhoneIds = new Set(currentMissingPhoneList.map((m: any) => m.studentId));
      return sortedStudents.filter((s: any) => {
        const id = s.id || s.uid;
        return missingPhoneIds.has(id) || resultsList[id]?.status === 'missing_phone';
      });
    }

    if (selectedFilterCategory === 'queued') {
      const queuedIds = new Set(currentQueuedList.map((q: any) => q.studentId));
      return sortedStudents.filter((s: any) => {
        const id = s.id || s.uid;
        return queuedIds.has(id) || resultsList[id]?.status === 'queued';
      });
    }

    if (selectedFilterCategory === 'optout') {
      const optOutIds = new Set(currentOptOutList.map((o: any) => o.studentId));
      return sortedStudents.filter((s: any) => {
        const id = s.id || s.uid;
        return optOutIds.has(id) || resultsList[id]?.status === 'optout';
      });
    }

    if (selectedFilterCategory === 'failed') {
      const failedIds = new Set(currentFailedList.map((f: any) => f.studentId));
      return sortedStudents.filter((s: any) => {
        const id = s.id || s.uid;
        return failedIds.has(id) || resultsList[id]?.status === 'failed';
      });
    }

    return sortedStudents;
  }, [
    sortedStudents,
    selectedFilterCategory,
    currentDuplicatesList,
    currentMarksMissingList,
    currentInvalidPhoneList,
    currentMissingPhoneList,
    currentQueuedList,
    currentOptOutList,
    currentFailedList,
    resultsList,
    isStudentMarksSent
  ]);

  const isClass6to9Effective = React.useMemo(() => {
    if (isClass10) return false;
    if (propIsClass6to9) return true;
    const activeClassObj = (classes || []).find((c: any) => c.id === selectedClass || c.name === selectedClass);
    const activeBatchObj = (batches || []).find((b: any) => b.id === selectedBatch || b.name === selectedBatch);
    if (activeClassObj && isClass6to9NameOrId(activeClassObj.name || activeClassObj.id || activeClassObj.code)) return true;
    if (activeBatchObj && isClass6to9NameOrId(activeBatchObj.name || activeBatchObj.id || activeBatchObj.classId)) return true;
    if (selectedClass && isClass6to9NameOrId(selectedClass)) return true;
    if (selectedBatch && isClass6to9NameOrId(selectedBatch)) return true;
    if (activeClassObj && !isPrimaryClass(activeClassObj.name) && !isClass10NameOrId(activeClassObj.name)) return true;
    return false;
  }, [isClass10, propIsClass6to9, classes, batches, selectedClass, selectedBatch]);

  const previewStudent = sortedStudents[0];
  const sampleMessage = React.useMemo(() => {
    if (!previewStudent || !activeExam) return '';
    const studentMarks = (resolvedMarks || []).filter((m: any) => m.studentId === (previewStudent.id || previewStudent.uid));
    
    // Check if preview student belongs to Class 6 to 9
    const studentIsClass6to9 = isClass6to9Effective || (
      previewStudent && (
        isClass6to9NameOrId(previewStudent.classId || previewStudent.className || previewStudent.class || previewStudent.grade || previewStudent.batchName || previewStudent.section) ||
        (!isPrimaryClass(previewStudent.className || '') && !isClass10NameOrId(previewStudent.className || ''))
      )
    );

    let text = `Dear ${previewStudent.fatherName || 'Parent'},\n`;
    text += `Exam result for *${previewStudent.name}* has been published.\n\n`;
    text += `📝 *Exam:* ${activeExam.title}\n`;
    text += `📌 *Roll No:* ${previewStudent.rollNumber || 'N/A'}\n\n`;
    text += `*Subject-wise Marks:*\n`;

    let totalObtained = 0;
    let totalMax = 0;

    // Sort subjects by standard curriculum order: Telugu, Hindi, English, Mathematics, Physics, Biology, Social Studies
    const sortedSubs = [...(subjects || [])].sort(compareSubjectsStandard);

    sortedSubs.forEach((sub: any) => {
      const m = studentMarks.find((mark: any) => mark.subjectId === sub.id);
      const maxMarks = isFA ? 50 : 100;
      if (m) {
        const faW = Number(m.faWritten) || 0;
        const saW = Number(m.saWritten) || 0;
        const st1 = Number(m.st1) || 0;
        const st2 = Number(m.st2) || 0;
        const hw = Number(m.hw) || 0;
        
        let subTotal = 0;
        if (isFA) {
          if (isClass10) {
            // Class 10 FA directly mentions only FA written test marks without (FA Written)
            subTotal = faW;
            text += `🔹 *${sub.name}*: ${subTotal}/${maxMarks}\n`;
          } else if (studentIsClass6to9) {
            // For Class 6 to 9: NO HW in subject marks entry, just ST-1 (Max 10) + ST-2 (Max 5) + FA Written (Max 35) = 50
            subTotal = st1 + st2 + faW;
            text += `🔹 *${sub.name}*: ${subTotal}/${maxMarks} (ST1(${st1}) + ST2(${st2}) + FA(${faW}))\n`;
          } else {
            // Primary classes: ST-1 (10) + ST-2 (10) + HW/ST-3 (5) + FA (25) = 50
            subTotal = st1 + st2 + hw + faW;
            text += `🔹 *${sub.name}*: ${subTotal}/${maxMarks} (ST1(${st1}) + ST2(${st2}) + HW(${hw}) + FA(${faW}))\n`;
          }
        } else {
          if (isClass10) {
            subTotal = saW;
            text += `🔹 *${sub.name}*: ${subTotal}/${maxMarks}\n`;
          } else if (studentIsClass6to9) {
            // Class 6 to 9 SA: NO HW
            subTotal = st1 + st2 + saW;
            const breakdown = (st1 > 0 || st2 > 0) ? ` (ST1(${st1}) + ST2(${st2}) + SA(${saW}))` : '';
            text += `🔹 *${sub.name}*: ${subTotal}/${maxMarks}${breakdown}\n`;
          } else {
            subTotal = st1 + st2 + hw + saW;
            text += `🔹 *${sub.name}*: ${subTotal}/${maxMarks} (ST1(${st1}) + ST2(${st2}) + HW(${hw}) + SA(${saW}))\n`;
          }
        }
        totalObtained += subTotal;
        totalMax += maxMarks;
      } else {
        text += `🔹 *${sub.name}*: Not entered\n`;
      }
    });

    const pct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
    const statusCategory = getPerformanceCategory(pct);
    text += `\n📊 *Total:* ${totalObtained}/${totalMax || 50}\n`;
    text += `📈 *Percentage:* ${pct}%\n`;
    text += `🏁 *Status:* ${statusCategory}\n\n`;
    text += `For more details, please contact St. Antony’s School office.\nThis is an automated message.`;
    return text;
  }, [previewStudent, activeExam, subjects, resolvedMarks, isClass10, isClass6to9Effective, isFA]);

  const handleSendSingle = async (student: any, bypassDup: boolean = forceSend) => {
    if (!selectedExam) {
      toast.error("Please select an exam first");
      return;
    }
    const studentId = student.id || student.uid;
    setResultsList(prev => ({
      ...prev,
      [studentId]: { status: 'loading' }
    }));

    try {
      const response = await fetch('/api/exams/send-marks-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: [studentId],
          examId: selectedExam,
          classId: selectedClass,
          section: selectedBatch,
          forceSend: bypassDup
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        const sums = data.summary;
        let finalStatus = 'failed';
        let reason = '';

        if (sums.queuedCount > 0) {
          finalStatus = 'queued';
          setSentStatusMap(prev => ({
            ...prev,
            [studentId]: { sent: true, status: 'sent', sentAt: new Date().toISOString() }
          }));
          toast.success(`Result queued successfully for ${student.name}!`);
        } else if (sums.duplicateSkipped > 0) {
          finalStatus = 'duplicate';
          reason = data.details?.duplicates?.[0]?.reason || 'Duplicate skipped (already sent/pending today)';
          setSentStatusMap(prev => ({
            ...prev,
            [studentId]: { sent: true, status: 'duplicate', sentAt: new Date().toISOString() }
          }));
          toast.warning(`Duplicate skipped for ${student.name} (already sent).`);
        } else if (sums.optOutSkipped > 0) {
          finalStatus = 'optout';
          reason = 'Parent opted out';
          toast.error(`${student.name}'s parent opted out of WhatsApp.`);
        } else if (sums.missingPhone > 0 || sums.invalidPhone > 0) {
          finalStatus = sums.missingPhone > 0 ? 'missing_phone' : 'invalid_phone';
          reason = 'Missing or invalid phone number';
          toast.error(`Invalid or missing phone number for ${student.name}.`);
        } else if (sums.marksMissing > 0) {
          finalStatus = 'missing_marks';
          reason = 'No marks entered for this exam';
          toast.error(`No marks entered for ${student.name}.`);
        }

        if (data.resultsByStudentId && data.resultsByStudentId[studentId]) {
          setResultsList(prev => ({
            ...prev,
            [studentId]: data.resultsByStudentId[studentId]
          }));
        } else {
          setResultsList(prev => ({
            ...prev,
            [studentId]: { status: finalStatus, reason }
          }));
        }

        if (data.summary) {
          setSummary(data.summary);
        }
        if (data.details) {
          setSummaryDetails(data.details);
        }
      } else {
        throw new Error(data.error || 'Server error');
      }
    } catch (err: any) {
      toast.error(`Failed to send: ${err.message}`);
      setResultsList(prev => ({
        ...prev,
        [studentId]: { status: 'failed', reason: err.message }
      }));
    }
  };

  const handleSendBulk = async () => {
    if (!selectedExam) {
      toast.error("Please select an exam first");
      return;
    }
    if (students.length === 0) {
      toast.error("No students to send to");
      return;
    }

    if (!forceSend && unsentStudentsWithMarks.length === 0) {
      toast.info("All eligible students have already received their marks via WhatsApp. Double-send prevention is active. Check 'Bypass Duplicate Check' if you need to resend.");
      return;
    }

    const ids = forceSend 
      ? sortedStudents.map((s: any) => s.id || s.uid)
      : unsentStudentsWithMarks.map((s: any) => s.id || s.uid);

    setLoading(true);
    setSummary(null);
    setSelectedFilterCategory(null);
    toast.info(`Starting production queue send for ${ids.length} students...`);

    try {
      const response = await fetch('/api/exams/send-marks-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: ids,
          examId: selectedExam,
          classId: selectedClass,
          section: selectedBatch,
          forceSend
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSummary(data.summary);
        if (data.details) {
          setSummaryDetails(data.details);
        }
        if (data.resultsByStudentId) {
          setResultsList(prev => ({
            ...prev,
            ...data.resultsByStudentId
          }));
        }

        // Refresh persistent sent status
        fetch(`/api/exams/marks-whatsapp-status?examId=${selectedExam}`)
          .then(r => r.json())
          .then(res => {
            if (res.success && res.sentMap) {
              setSentStatusMap(prev => ({ ...prev, ...res.sentMap }));
            }
          })
          .catch(() => {});

        toast.success(`Bulk queuing request completed!`);
      } else {
        toast.error(data.error || 'Server error occurred');
      }
    } catch (err: any) {
      toast.error(`Error in bulk send: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedClass || !selectedExam) {
    return (
      <div className="p-8 text-center bg-amber-50/50 border border-amber-200/60 rounded-xl m-4 flex flex-col items-center justify-center gap-4">
        <Filter className="w-12 h-12 text-amber-500 animate-pulse" />
        <div>
          <h3 className="text-base font-black text-amber-800 uppercase tracking-tight">Active Filters Required</h3>
          <p className="text-neutral-500 text-sm mt-1 max-w-sm font-bold leading-normal">
            Please use the filter bar above to select a Class, Batch, and Exam before using the Marks WhatsApp feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Banner */}
      <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-black text-emerald-900 uppercase tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600 animate-bounce" />
            WhatsApp Marks Engine
          </h2>
          <p className="text-emerald-700/80 text-xs font-bold leading-relaxed max-w-xl uppercase tracking-wider">
            Queue and trigger results safely to parents using the St. Antony’s School offline-first backend delivery queues.
          </p>
          {isFA && (
            <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-wider border shadow-sm ${
              isClass10 
                ? 'bg-amber-100/80 text-amber-900 border-amber-300' 
                : isClass6to9Effective 
                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200' 
                  : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}>
              {isClass10 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping inline-block" />
                  <span>Class 10 Direct FA Mode: Messages directly include FA Written Test marks only (Slip Tests disabled)</span>
                </>
              ) : isClass6to9Effective ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                  <span>Class 6 to 9 Format: Messages include Slip Tests ST-1 (Max 10), ST-2 (Max 5) & FA Written (Max 35) — No HW</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                  <span>Primary Format: Messages include Slip Tests (ST-1, ST-2, HW/ST-3) & Written Test</span>
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-2 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg text-xs font-black uppercase tracking-wider text-neutral-700 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-primary" />
            Preview Message
          </button>

          <label className="flex items-center gap-2 select-none cursor-pointer bg-white px-3.5 py-2 rounded-lg border border-neutral-200 text-xs font-black uppercase text-neutral-600 hover:bg-neutral-50 transition-colors">
            <input 
              type="checkbox" 
              checked={forceSend} 
              onChange={(e) => setForceSend(e.target.checked)}
              className="rounded text-primary focus:ring-primary w-4 h-4 border-neutral-300"
            />
            Bypass Duplicate Check
          </label>

          <button
            onClick={handleSendBulk}
            disabled={loading || (!forceSend && unsentStudentsWithMarks.length === 0)}
            className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              !forceSend && unsentStudentsWithMarks.length === 0
                ? 'bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/10 active:scale-95'
            }`}
            title={!forceSend && unsentStudentsWithMarks.length === 0 ? 'Deactivated: All eligible students have already received their marks via WhatsApp' : 'Queue marks for unsent students'}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : !forceSend && unsentStudentsWithMarks.length === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {!forceSend && unsentStudentsWithMarks.length === 0
              ? 'All Marks Sent (Deactivated)'
              : forceSend
                ? `Force Send All (${students.length})`
                : `Send Queue to Unsent (${unsentStudentsWithMarks.length})`}
          </button>
        </div>
      </div>

      {/* Duplicate Prevention Status Banner */}
      {currentAlreadySentList.length > 0 && (
        <div className="p-4 bg-emerald-50/90 border border-emerald-300/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="font-black uppercase tracking-wider text-emerald-900">Duplicate Prevention Active: </span>
              <span className="text-emerald-800">
                <strong>{currentAlreadySentList.length} of {sortedStudents.length}</strong> student(s) have already received marks on WhatsApp. Their send actions are <strong>deactivated</strong> to prevent double-sending messages.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedFilterCategory(prev => prev === 'already_sent' ? null : 'already_sent')}
              className="text-[11px] font-black uppercase tracking-wider text-emerald-800 hover:text-emerald-950 underline cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shadow-2xs"
            >
              {selectedFilterCategory === 'already_sent' ? 'Show All Students' : `Filter ${currentAlreadySentList.length} Sent`}
            </button>
            <span className="text-[11px] font-bold text-emerald-900 bg-emerald-200/80 px-2.5 py-1.5 rounded-lg border border-emerald-300">
              {unsentStudentsWithMarks.length} Ready to Send
            </span>
          </div>
        </div>
      )}

      {/* Message Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-black text-sidebar uppercase tracking-tight">WhatsApp Message Preview</h3>
              </div>
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-xs font-bold px-2 py-1 rounded-md hover:bg-neutral-100"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center justify-between">
                <span>Target: {previewStudent?.name || 'Sample Student'} ({previewStudent?.rollNumber || 'Roll No'})</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${isClass10 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                  {isClass10 ? 'Class 10 (Direct FA Marks)' : 'Standard Split Format'}
                </span>
              </div>
              <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-xl text-xs font-mono text-neutral-800 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto shadow-inner">
                {sampleMessage || 'No sample data available'}
              </div>

              {/* Performance Grading Scale Reference */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Performance Status Categories</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                  <div className="p-1.5 bg-white rounded border border-neutral-200"><span className="font-bold">90–100%:</span> 🌟 Outstanding</div>
                  <div className="p-1.5 bg-white rounded border border-neutral-200"><span className="font-bold">80–89%:</span> ⭐ Excellent</div>
                  <div className="p-1.5 bg-white rounded border border-neutral-200"><span className="font-bold">70–79%:</span> Very Good</div>
                  <div className="p-1.5 bg-white rounded border border-neutral-200"><span className="font-bold">60–69%:</span> Good</div>
                  <div className="p-1.5 bg-white rounded border border-neutral-200"><span className="font-bold">50–59%:</span> Average</div>
                  <div className="p-1.5 bg-white rounded border border-neutral-200"><span className="font-bold">40–49%:</span> Needs Improvement</div>
                  <div className="p-1.5 bg-white rounded border border-neutral-200 col-span-2"><span className="font-bold">Below 40%:</span> Poor / Fail</div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-5 py-2 bg-neutral-800 text-white text-xs font-black uppercase tracking-wider rounded-lg hover:bg-neutral-900 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards & Pre-flight Issue Header */}
      <div className="p-5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-3">
          <div>
            <h3 className="text-xs font-black text-sidebar uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Queue Response & Status Summary
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Click any card to filter students below, or click <strong className="text-sidebar">Inspect</strong> to see exact duplicate numbers and students with missing marks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setModalCategory(selectedFilterCategory === 'duplicate' ? 'duplicates' : selectedFilterCategory === 'missing_marks' ? 'marksMissing' : 'marksMissing');
                setShowBreakdownModal(true);
              }}
              className="px-3.5 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg text-xs font-bold text-sidebar flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              <Info className="w-3.5 h-3.5 text-primary" />
              Inspect Breakdown Modal
            </button>
          </div>
        </div>

        {/* 9 Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
          {[
            { label: 'Requested', key: 'totalRequested', value: summary?.totalRequested ?? sortedStudents.length, bg: 'bg-white text-neutral-800 border-neutral-200' },
            { label: 'Sent (Deactivated)', key: 'already_sent', value: currentAlreadySentList.length, bg: 'bg-emerald-100 text-emerald-950 border-emerald-300' },
            { label: 'Queued', key: 'queued', value: summary?.queuedCount ?? currentQueuedList.length, bg: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
            { label: 'Duplicates', key: 'duplicate', value: summary?.duplicateSkipped ?? currentDuplicatesList.length, bg: 'bg-amber-50 text-amber-900 border-amber-200' },
            { label: 'Opt-Outs', key: 'optout', value: summary?.optOutSkipped ?? currentOptOutList.length, bg: 'bg-rose-50 text-rose-900 border-rose-200' },
            { label: 'No Phone', key: 'missing_phone', value: summary?.missingPhone ?? currentMissingPhoneList.length, bg: 'bg-neutral-100 text-neutral-700 border-neutral-200' },
            { label: 'Invalid Phone', key: 'invalid_phone', value: summary?.invalidPhone ?? currentInvalidPhoneList.length, bg: 'bg-red-50 text-red-900 border-red-200' },
            { label: 'Marks Missing', key: 'missing_marks', value: summary?.marksMissing ?? currentMarksMissingList.length, bg: 'bg-orange-50 text-orange-900 border-orange-200' },
            { label: 'Failed', key: 'failed', value: summary?.failedCount ?? currentFailedList.length, bg: 'bg-rose-100 text-rose-950 border-rose-200' },
          ].map((stat, idx) => {
            const isSelected = selectedFilterCategory === stat.key;
            const count = Number(stat.value) || 0;
            const hasItems = count > 0;

            return (
              <div
                key={idx}
                onClick={() => {
                  if (stat.key === 'totalRequested') {
                    setSelectedFilterCategory(null);
                  } else {
                    setSelectedFilterCategory(prev => prev === stat.key ? null : stat.key);
                  }
                }}
                className={`p-3 rounded-lg border shadow-sm text-left transition-all cursor-pointer select-none group relative ${stat.bg} ${
                  isSelected ? 'ring-2 ring-primary ring-offset-2 scale-[1.02]' : 'hover:border-neutral-400'
                }`}
                title={`Click to filter table by ${stat.label}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500 leading-none truncate">
                    {stat.label}
                  </div>
                  {hasItems && stat.key !== 'totalRequested' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-pulse" />
                  )}
                </div>

                <div className="text-xl font-black tracking-tight">{stat.value}</div>

                <div className="mt-2 flex items-center justify-between text-[9px] font-bold border-t border-current/10 pt-1.5 opacity-90">
                  <span className="text-neutral-500">
                    {isSelected ? 'Active Filter' : 'Click to filter'}
                  </span>
                  {hasItems && stat.key !== 'totalRequested' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        let cat: any = 'all';
                        if (stat.key === 'already_sent') cat = 'alreadySent';
                        else if (stat.key === 'duplicate') cat = 'duplicates';
                        else if (stat.key === 'missing_marks') cat = 'marksMissing';
                        else if (stat.key === 'invalid_phone') cat = 'invalidPhone';
                        else if (stat.key === 'missing_phone') cat = 'missingPhone';
                        else if (stat.key === 'queued') cat = 'queued';
                        else if (stat.key === 'optout') cat = 'optOut';
                        else if (stat.key === 'failed') cat = 'failed';
                        setModalCategory(cat);
                        setShowBreakdownModal(true);
                      }}
                      className="underline font-black hover:opacity-100 flex items-center gap-0.5"
                    >
                      Inspect ↗
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Filter Banner */}
        {selectedFilterCategory && (
          <div className="p-3 bg-white border border-primary/30 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-neutral-500">Showing Filtered Students: </span>
                <span className="font-black text-primary uppercase underline tracking-wider">
                  {selectedFilterCategory === 'already_sent' ? 'Sent (Deactivated to Prevent Double Send)' :
                   selectedFilterCategory === 'duplicate' ? 'Duplicate Notices / Shared Phone' :
                   selectedFilterCategory === 'missing_marks' ? 'Marks Missing' :
                   selectedFilterCategory === 'invalid_phone' ? 'Invalid Phone Number' :
                   selectedFilterCategory === 'missing_phone' ? 'Missing Phone Number' :
                   selectedFilterCategory.replace('_', ' ')}
                </span>
                <span className="font-bold text-neutral-600 ml-1">({filteredStudents.length} Students)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  let cat: any = 'all';
                  if (selectedFilterCategory === 'duplicate') cat = 'duplicates';
                  else if (selectedFilterCategory === 'missing_marks') cat = 'marksMissing';
                  else if (selectedFilterCategory === 'invalid_phone') cat = 'invalidPhone';
                  else if (selectedFilterCategory === 'missing_phone') cat = 'missingPhone';
                  else if (selectedFilterCategory === 'queued') cat = 'queued';
                  setModalCategory(cat);
                  setShowBreakdownModal(true);
                }}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded text-xs font-bold text-sidebar flex items-center gap-1 transition-colors"
              >
                <Info className="w-3 h-3 text-primary" />
                View In Modal
              </button>
              <button
                type="button"
                onClick={() => setSelectedFilterCategory(null)}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-900 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear Filter ({sortedStudents.length} Total)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Students Table */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm bg-white">
        <div className="p-3 bg-neutral-50/70 border-b border-neutral-200 flex items-center justify-between text-xs text-neutral-500">
          <div className="font-bold">
            Showing <span className="text-sidebar font-black">{filteredStudents.length}</span> of <span className="text-sidebar font-black">{sortedStudents.length}</span> Students
            {selectedFilterCategory && <span className="text-primary font-bold ml-1">(Filtered)</span>}
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Queued</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Duplicate</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span> Marks Missing</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Invalid Phone</span>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-50/80 border-b border-neutral-200">
              <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider w-20">Roll No</th>
              <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider">Student Name</th>
              <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider">Parent Phone Number</th>
              <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider text-center">Queue Status</th>
              <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Filter className="w-6 h-6 text-neutral-300" />
                    <span>No students match the current filter selection</span>
                    {selectedFilterCategory && (
                      <button
                        type="button"
                        onClick={() => setSelectedFilterCategory(null)}
                        className="mt-2 px-3 py-1 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredStudents.map((student: any) => {
                const sId = student.id || student.uid;
                const statusInfo = resultsList[sId];
                const rawPhone = student.parentPhone || student.whatsappNumber;
                const normPhone = rawPhone ? normalizeIndianPhone(rawPhone) : '';
                const sharedInfo = normPhone ? preflightAnalysis.sharedPhoneMap[normPhone] : null;
                const alreadySent = isStudentMarksSent(sId);
                const sentDetails = sentStatusMap[sId];
                const sentDateFormatted = sentDetails?.sentAt 
                  ? new Date(sentDetails.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) 
                  : null;

                // Check marks for this student for activeExam
                const studentMarks = (resolvedMarks || []).filter((m: any) => {
                  const matchStudent = m.studentId === sId || String(m.studentId) === String(sId);
                  if (!matchStudent) return false;
                  if (selectedExam && (m.examId === selectedExam || String(m.examId) === String(selectedExam))) return true;
                  if (activeExam?.title && m.examTitle === activeExam.title) return true;
                  return false;
                });
                const hasMarks = studentMarks.length > 0;

                return (
                  <tr key={sId} className={`transition-colors ${alreadySent ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-neutral-50/50'}`}>
                    <td className="p-4 text-sm font-black text-neutral-400">{student.rollNumber || '-'}</td>
                    <td className="p-4">
                      <div className="font-black text-sidebar text-sm">{student.name}</div>
                      {!hasMarks && (
                        <div className="text-[10px] font-bold text-orange-600 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" />
                          <span>No marks entered for {activeExam?.title || 'this exam'}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 font-mono text-sm font-bold text-neutral-700">
                          <span className={!rawPhone ? 'text-neutral-400 italic font-sans text-xs' : ''}>
                            {rawPhone || 'Not Available'}
                          </span>
                          {rawPhone && (
                            <button
                              type="button"
                              title="Copy phone number"
                              onClick={() => handleCopy(rawPhone, 'Parent Phone')}
                              className="text-neutral-400 hover:text-primary transition-colors p-0.5 rounded hover:bg-neutral-100"
                            >
                              {copiedText === rawPhone ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>

                        {sharedInfo && sharedInfo.count > 1 && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-800 w-fit">
                            <span>Duplicate / Shared: Roll {sharedInfo.rollNumbers.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {statusInfo && statusInfo.status !== 'queued' && statusInfo.status !== 'duplicate' ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            statusInfo.status === 'optout' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                            statusInfo.status === 'invalid_phone' ? 'bg-red-100 text-red-800 border-red-200' :
                            statusInfo.status === 'missing_phone' ? 'bg-neutral-100 text-neutral-700 border-neutral-200' :
                            statusInfo.status === 'missing_marks' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                            statusInfo.status === 'loading' ? 'bg-neutral-100 text-neutral-800 border-neutral-200' :
                            'bg-neutral-100 text-neutral-800 border-neutral-200'
                          }`}>
                            {statusInfo.status === 'missing_marks' ? 'Marks Missing' :
                             statusInfo.status === 'invalid_phone' ? 'Invalid Phone' :
                             statusInfo.status === 'missing_phone' ? 'No Phone' :
                             statusInfo.status}
                          </span>
                          {statusInfo.reason && (
                            <span className="text-[9px] text-neutral-500 mt-1 font-bold italic block max-w-xs text-center leading-tight">
                              {statusInfo.reason}
                            </span>
                          )}
                        </div>
                      ) : alreadySent || statusInfo?.status === 'queued' || statusInfo?.status === 'duplicate' ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1 shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Sent (Deactivated)
                          </span>
                          <span className="text-[9px] text-emerald-700 mt-1 font-bold text-center leading-tight">
                            {sentDateFormatted ? `Sent on ${sentDateFormatted}` : 'Marks sent via WhatsApp'}
                          </span>
                        </div>
                      ) : (
                        <div>
                          {!hasMarks ? (
                            <div className="flex flex-col items-center">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200">
                                Marks Missing
                              </span>
                              <span className="text-[9px] text-orange-600 mt-0.5 font-bold">Unsent</span>
                            </div>
                          ) : !rawPhone ? (
                            <div className="flex flex-col items-center">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-600 border border-neutral-200">
                                No Phone
                              </span>
                              <span className="text-[9px] text-neutral-400 mt-0.5 font-bold">Unsent</span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-neutral-400 uppercase">Unsent (Ready)</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {!hasMarks && (
                          <button
                            type="button"
                            onClick={() => setActiveTab && setActiveTab('subject-entry')}
                            className="px-2.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1 shadow-xs"
                            title="Navigate to Subject Marks Entry tab"
                          >
                            <Edit2 className="w-3 h-3" />
                            Enter Marks
                          </button>
                        )}

                        {alreadySent && !forceSend ? (
                          <button
                            type="button"
                            disabled={true}
                            className="px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg text-[10px] font-black uppercase text-neutral-400 cursor-not-allowed inline-flex items-center gap-1.5 select-none opacity-80"
                            title="Deactivated: Marks for this student have already been sent to WhatsApp to prevent duplicate messages."
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Deactivated (Sent)
                          </button>
                        ) : alreadySent && forceSend ? (
                          <button
                            type="button"
                            onClick={() => handleSendSingle(student, true)}
                            disabled={statusInfo?.status === 'loading'}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1 shadow-xs active:scale-95"
                            title="Bypass duplicate check and resend marks"
                          >
                            {statusInfo?.status === 'loading' ? (
                              <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            Bypass & Resend
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSendSingle(student, forceSend)}
                            disabled={statusInfo?.status === 'loading' || !hasMarks}
                            className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-[10px] font-black uppercase text-neutral-600 hover:bg-neutral-100 hover:border-neutral-300 active:scale-95 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {statusInfo?.status === 'loading' ? (
                              <div className="w-3 h-3 border border-neutral-500/30 border-t-neutral-500 rounded-full animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            Queue Send
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Itemized Detail Breakdown Inspector Modal */}
      {showBreakdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-5 border border-neutral-200 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-sidebar">
                    Queue Response Inspector & Itemized Details
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Exam: <span className="font-bold text-sidebar">{activeExam?.title || 'Selected Exam'}</span>
                    {selectedClass && ` • Class: ${selectedClass}`}
                    {selectedBatch && ` • Section: ${selectedBatch}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBreakdownModal(false)}
                className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-neutral-200 shrink-0">
              {[
                { id: 'alreadySent', label: 'Sent (Deactivated)', count: currentAlreadySentList.length, color: 'text-emerald-700 border-emerald-600' },
                { id: 'marksMissing', label: 'Marks Missing', count: currentMarksMissingList.length, color: 'text-orange-600 border-orange-500' },
                { id: 'duplicates', label: 'Duplicates', count: currentDuplicatesList.length, color: 'text-amber-600 border-amber-500' },
                { id: 'invalidPhone', label: 'Invalid Phone', count: currentInvalidPhoneList.length, color: 'text-red-600 border-red-500' },
                { id: 'missingPhone', label: 'No Phone', count: currentMissingPhoneList.length, color: 'text-neutral-600 border-neutral-500' },
                { id: 'queued', label: 'Queued', count: currentQueuedList.length, color: 'text-emerald-600 border-emerald-500' },
                { id: 'optOut', label: 'Opt-Outs', count: currentOptOutList.length, color: 'text-rose-600 border-rose-500' },
                { id: 'failed', label: 'Failed', count: currentFailedList.length, color: 'text-rose-700 border-rose-700' },
              ].map((tab: any) => {
                const isActive = modalCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setModalCategory(tab.id)}
                    className={`px-3 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      isActive
                        ? 'bg-neutral-900 text-white shadow-xs'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-700'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Modal Tab Content Area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Category: Already Sent (Deactivated) */}
              {modalCategory === 'alreadySent' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Students Whose Marks Have Already Been Sent (Deactivated)
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-900/90">
                      To prevent double-sending messages to parents, marks send buttons for these students are <strong>automatically deactivated</strong>. If you explicitly wish to resend, you can click "Bypass & Resend" below or enable "Bypass Duplicate Check".
                    </p>
                  </div>

                  {currentAlreadySentList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      ℹ️ No marks sent via WhatsApp yet for this class & exam.
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Parent Phone</th>
                            <th className="p-3">Status / Timestamp</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentAlreadySentList.map((item: any, i: number) => {
                            const studentObj = sortedStudents.find((s: any) => (s.id || s.uid) === item.studentId);
                            const formattedDate = item.sentAt 
                              ? new Date(item.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                              : 'Marked as Sent';

                            return (
                              <tr key={i} className="hover:bg-neutral-50">
                                <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                                <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                                <td className="p-3 font-mono text-neutral-600">{item.phone}</td>
                                <td className="p-3">
                                  <div className="flex flex-col">
                                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      {formattedDate}
                                    </span>
                                    <span className="text-[10px] text-neutral-500 font-medium">Deactivated to prevent duplicates</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right">
                                  {studentObj && (
                                    <button
                                      type="button"
                                      onClick={() => handleSendSingle(studentObj, true)}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-black uppercase tracking-wider flex items-center gap-1 ml-auto transition-all active:scale-95 shadow-2xs"
                                      title="Bypass duplicate check and resend marks"
                                    >
                                      <Send className="w-3 h-3" />
                                      Bypass & Resend
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category 1: Marks Missing */}
              {modalCategory === 'marksMissing' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-orange-900">
                      <AlertTriangle className="w-4 h-4 text-orange-600" />
                      Which students have marks missing?
                    </div>
                    <p className="text-[11px] leading-relaxed text-orange-900/90">
                      The WhatsApp engine checks whether any marks records are saved for the selected exam (<strong>{activeExam?.title}</strong>). 
                      If 0 marks are entered for a student, result dispatch is skipped to prevent sending empty reports to parents.
                    </p>
                  </div>

                  {currentMarksMissingList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      ✅ All students have marks entered for {activeExam?.title}!
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Parent Phone</th>
                            <th className="p-3">Issue Reason</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentMarksMissingList.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-neutral-50">
                              <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                              <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                              <td className="p-3 font-mono text-neutral-600">
                                <div className="flex items-center gap-1.5">
                                  <span>{item.phone || 'Not Available'}</span>
                                  {item.phone && item.phone !== 'Not Available' && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(item.phone, 'Phone')}
                                      className="text-neutral-400 hover:text-primary"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-orange-700 font-medium">{item.reason || 'No marks entered'}</td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowBreakdownModal(false);
                                    if (setActiveTab) setActiveTab('subject-entry');
                                  }}
                                  className="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded text-[11px] font-black uppercase tracking-wider flex items-center gap-1 ml-auto"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Enter Marks
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category 2: Duplicates */}
              {modalCategory === 'duplicates' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-amber-900">
                      <TrendingUp className="w-4 h-4 text-amber-600" />
                      Which phone numbers or students are duplicates?
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900/90">
                      <strong>Duplicate Skipped:</strong> An automated notice was already queued or sent today for this student/exam to prevent duplicate billing and parent spam.
                      <br />
                      <strong>Shared Phone Number:</strong> In this roster, multiple siblings or students have the same mobile number registered.
                      <br />
                      <em>Tip: To force re-sending, check <strong>"Bypass Duplicate Check"</strong> on the main WhatsApp screen or click <strong>Force Send</strong> below.</em>
                    </p>
                  </div>

                  {currentDuplicatesList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      ✅ No duplicate notices or duplicate phone conflicts detected!
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Duplicate Phone Number</th>
                            <th className="p-3">Duplicate Reason</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentDuplicatesList.map((item: any, i: number) => {
                            const studentObj = sortedStudents.find((s: any) => (s.id || s.uid) === item.studentId);
                            return (
                              <tr key={i} className="hover:bg-neutral-50">
                                <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                                <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                                <td className="p-3">
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-bold">
                                    <span>{item.phone || '-'}</span>
                                    {item.phone && (
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(item.phone, 'Duplicate Phone')}
                                        className="text-amber-700 hover:text-amber-900"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 text-neutral-600 text-[11px] leading-tight">{item.reason}</td>
                                <td className="p-3 text-right">
                                  {studentObj && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleSendSingle(studentObj, true);
                                      }}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-black uppercase tracking-wider flex items-center gap-1 ml-auto"
                                    >
                                      <Send className="w-3 h-3" />
                                      Force Send
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category 3: Invalid Phone */}
              {modalCategory === 'invalidPhone' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-950 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-red-900">
                      <XCircle className="w-4 h-4 text-red-600" />
                      Students with Invalid Phone Numbers
                    </div>
                    <p className="text-[11px] leading-relaxed text-red-900/90">
                      Indian mobile numbers must be exactly 10 digits starting with 6, 7, 8, or 9 (optionally prefixed with +91). Numbers with missing digits or landlines cannot receive WhatsApp notices.
                    </p>
                  </div>

                  {currentInvalidPhoneList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      ✅ All registered phone numbers have valid formats!
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Entered Phone String</th>
                            <th className="p-3">Format Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentInvalidPhoneList.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-neutral-50">
                              <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                              <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                              <td className="p-3 font-mono font-bold text-red-700 bg-red-50/50">
                                {item.rawPhone || item.phone}
                              </td>
                              <td className="p-3 text-red-700 text-[11px]">{item.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category 4: No Phone */}
              {modalCategory === 'missingPhone' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-neutral-100 border border-neutral-200 rounded-xl text-xs text-neutral-800 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-neutral-900">
                      <Info className="w-4 h-4 text-neutral-600" />
                      Students with No Parent Phone Registered
                    </div>
                    <p className="text-[11px] leading-relaxed text-neutral-600">
                      These students do not have any mobile or WhatsApp contact number saved in their student profile.
                    </p>
                  </div>

                  {currentMissingPhoneList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      ✅ All students have registered parent phone numbers!
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentMissingPhoneList.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-neutral-50">
                              <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                              <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                              <td className="p-3 text-neutral-500 italic">No phone number in student profile</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category 5: Queued */}
              {modalCategory === 'queued' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Messages Successfully Queued for Delivery
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-900/90">
                      These student results have been submitted to the WhatsApp delivery queue and are pending transmission to parent handsets.
                    </p>
                  </div>

                  {currentQueuedList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      No queued messages in current session yet. Click "Send Queue to All" to queue marks.
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Parent Phone</th>
                            <th className="p-3">Delivery Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentQueuedList.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-neutral-50">
                              <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                              <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                              <td className="p-3 font-mono text-emerald-800 font-bold">{item.phone}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                                  Queued
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category 6: Opt-Outs */}
              {modalCategory === 'optOut' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-rose-900">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      Opted-Out Contacts
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-900/90">
                      Parents who have previously texted "STOP" or opted out of automated WhatsApp broadcasts.
                    </p>
                  </div>

                  {currentOptOutList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      ✅ No opted-out parent contacts in this class.
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Phone</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentOptOutList.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-neutral-50">
                              <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                              <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                              <td className="p-3 font-mono text-neutral-600">{item.phone}</td>
                              <td className="p-3 text-rose-700 font-bold">Parent Opted-Out</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category 7: Failed */}
              {modalCategory === 'failed' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-1">
                    <div className="font-black flex items-center gap-1.5 text-rose-900">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      Queue Errors & Server Failures
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-900/90">
                      Unexpected exceptions encountered while constructing or inserting items into the Baileys WhatsApp delivery queue.
                    </p>
                  </div>

                  {currentFailedList.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-400">
                      ✅ No server or queuing failures!
                    </div>
                  ) : (
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-black uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Roll No</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Error Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {currentFailedList.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-neutral-50">
                              <td className="p-3 font-mono font-bold text-neutral-500">{item.rollNumber || '-'}</td>
                              <td className="p-3 font-bold text-sidebar">{item.studentName}</td>
                              <td className="p-3 text-rose-700 font-mono text-[11px]">{item.error || 'Unknown error'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-between text-xs">
              <div className="text-neutral-500 text-[11px]">
                Total Students in Roster: <strong className="text-sidebar">{sortedStudents.length}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    let text = `Queue Breakdown for ${activeExam?.title || 'Exam'} (${selectedClass} - ${selectedBatch})\n\n`;
                    if (currentMarksMissingList.length > 0) {
                      text += `MARKS MISSING (${currentMarksMissingList.length}):\n`;
                      currentMarksMissingList.forEach((m: any) => {
                        text += `- Roll ${m.rollNumber}: ${m.studentName} (${m.phone || 'No phone'})\n`;
                      });
                      text += `\n`;
                    }
                    if (currentDuplicatesList.length > 0) {
                      text += `DUPLICATES / SHARED NUMBERS (${currentDuplicatesList.length}):\n`;
                      currentDuplicatesList.forEach((d: any) => {
                        text += `- Roll ${d.rollNumber}: ${d.studentName} (${d.phone}) - ${d.reason}\n`;
                      });
                      text += `\n`;
                    }
                    if (currentInvalidPhoneList.length > 0) {
                      text += `INVALID PHONE (${currentInvalidPhoneList.length}):\n`;
                      currentInvalidPhoneList.forEach((iv: any) => {
                        text += `- Roll ${iv.rollNumber}: ${iv.studentName} (${iv.rawPhone || iv.phone})\n`;
                      });
                      text += `\n`;
                    }
                    handleCopy(text, 'Breakdown Report copied to clipboard');
                  }}
                  className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg text-sidebar font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Full Summary Text
                </button>
                <button
                  type="button"
                  onClick={() => setShowBreakdownModal(false)}
                  className="px-4 py-2 bg-neutral-900 text-white font-bold rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Consolidated Marks Register (Central Marks Register) Component
const CentralRegister = ({ 
  students, 
  selectedClass, 
  selectedBatch, 
  subjects, 
  exams, 
  classes, 
  batches, 
  teachers,
  marks,
  examSchedules: passedExamSchedules = []
}: any) => {
  const [selectedExamId, setSelectedExamId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [failFilter, setFailFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'rollNumber' | 'name' | 'total'>('rollNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // High-fidelity central marks register state
  const [ledgerView, setLedgerView] = useState<'spreadsheet' | 'simplified'>('spreadsheet');
  
  // Custom states for Attendance view
  const [registerType, setRegisterType] = useState<'marks' | 'attendance'>('marks');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [workingDays, setWorkingDays] = useState<any>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const { settings } = useSettings();

  // PDF Export Modal State
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [pdfPaperSize, setPdfPaperSize] = useState<'a3_landscape' | 'a3_portrait' | 'a4_landscape' | 'a4_portrait'>('a3_landscape');

  // Real-time listener for exam schedules
  const [localExamSchedules, setLocalExamSchedules] = useState<any[]>([]);

  useEffect(() => {
    try {
      const unsub = dbService.subscribe('examSchedules', [], (items: any[]) => {
        if (items && Array.isArray(items)) {
          setLocalExamSchedules(items);
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    } catch (e) {
      console.warn("Failed to subscribe to examSchedules in CentralRegister", e);
    }
  }, []);

  const allExamSchedules = useMemo(() => {
    return (localExamSchedules && localExamSchedules.length > 0) ? localExamSchedules : (passedExamSchedules || []);
  }, [localExamSchedules, passedExamSchedules]);

  const activeClass = classes.find((c: any) => c.id === selectedClass);
  const activeBatch = batches.find((b: any) => b.id === selectedBatch);
  const classTeacher = teachers.find((t: any) => (t.uid && t.uid === activeBatch?.classTeacherId) || (t.id && t.id === activeBatch?.classTeacherId) || (t.customId && t.customId === activeBatch?.classTeacherId));
  const classTeacherName = classTeacher ? classTeacher.name : (activeBatch?.classTeacherName || activeBatch?.classTeacher || 'Not Assigned');

  // Filter exams that are scheduled / have some marks
  const scheduledExams = exams.filter((e: any) => {
    const statusLower = e.status?.toLowerCase();
    return statusLower === 'published' || statusLower === 'scheduled' || statusLower === 'ongoing' || statusLower === 'completed';
  });

  // Filter active subjects strictly to scheduled subjects for this batch/class/exam
  const activeSubjects = useMemo(() => {
    const activeBatchObj = (batches || []).find((b: any) => b.id === selectedBatch);
    const activeBatchName = (activeBatchObj?.name || selectedBatch || '').toLowerCase().trim();
    const activeClassObj = (classes || []).find((c: any) => c.id === selectedClass);
    const activeClassName = (activeClassObj?.name || selectedClass || '').toLowerCase().trim();

    // 1. Filter schedules for the selected batch / class
    const matchingSchedules = (allExamSchedules || []).filter((sch: any) => {
      const schExamId = String(sch.examId || '');
      const schExamTitle = String(sch.examTitle || sch.examId || '').toLowerCase().trim();

      if (selectedExamId !== 'all') {
        const activeExamObj = (exams || []).find((e: any) => e.id === selectedExamId);
        const targetExamTitle = String(activeExamObj?.title || selectedExamId || '').toLowerCase().trim();
        const matchesExam = (schExamId === selectedExamId) || (activeExamObj && schExamId === activeExamObj.id) || (schExamTitle && schExamTitle === targetExamTitle);
        if (!matchesExam) return false;
      }

      const schBatchId = String(sch.batchId || '');
      const schBatchName = String(sch.batchName || '').toLowerCase().trim();
      const schClassId = String(sch.classId || '');
      const schClassName = String(sch.className || '').toLowerCase().trim();

      if (selectedBatch && (schBatchId === selectedBatch || schBatchName === activeBatchName || schBatchId.toLowerCase().trim() === activeBatchName)) return true;
      if (selectedClass && (schClassId === selectedClass || schClassName === activeClassName || schClassId.toLowerCase().trim() === activeClassName)) return true;
      if (!selectedBatch && !selectedClass) return true;
      return false;
    });

    if (matchingSchedules.length > 0) {
      const scheduledSubjectIds = new Set(matchingSchedules.map((s: any) => String(s.subjectId || '')));
      const scheduledSubjectNames = new Set(matchingSchedules.map((s: any) => String(s.subjectName || '').toLowerCase().trim()));

      const matched = (subjects || []).filter((s: any) => 
        scheduledSubjectIds.has(String(s.id)) || 
        scheduledSubjectNames.has(String(s.name || '').toLowerCase().trim()) ||
        Array.from(scheduledSubjectNames).some((schName: string) => schName && ((s.name || '').toLowerCase().includes(schName) || schName.includes((s.name || '').toLowerCase())))
      );

      matchingSchedules.forEach((sch: any) => {
        const schName = (sch.subjectName || '').trim();
        const exists = matched.some((s: any) => 
          (sch.subjectId && String(s.id) === String(sch.subjectId)) ||
          (schName && (s.name || '').toLowerCase().trim() === schName.toLowerCase())
        );
        if (!exists && schName) {
          matched.push({
            id: sch.subjectId || `sched_${schName.replace(/\s+/g, '_')}`,
            name: schName,
            code: schName.toUpperCase()
          });
        }
      });

      return [...matched].sort(compareSubjectsStandard);
    }

    // Fallback: If no schedules configured yet, filter by class curriculum if available, or marks presence
    const marksSubjectIds = new Set((marks || []).map((m: any) => String(m.subjectId)));
    const classFiltered = (subjects || []).filter((s: any) => 
      marksSubjectIds.has(String(s.id)) || !s.classId || s.classId === selectedClass || (s.classes && s.classes.includes(selectedClass))
    );
    return (classFiltered.length > 0 ? classFiltered : (subjects || [])).sort(compareSubjectsStandard);
  }, [subjects, allExamSchedules, selectedBatch, selectedClass, selectedExamId, exams, batches, classes, marks]);

  // Load attendance data and settings
  useEffect(() => {
    const fetchAttendanceAndSettings = async () => {
      if (!selectedBatch) return;
      setLoadingAttendance(true);
      try {
        const yearPart = settings?.currentAcademicYear?.split('-')[0] || '2026';
        const startYearNum = parseInt(yearPart.length === 2 ? `20${yearPart}` : yearPart) || 2026;
        const start = `${startYearNum}-06-01`;
        const end = `${startYearNum + 1}-05-31`;
        
        // Fetch attendance
        const attRecords = await dbService.list('attendance', [
          where('date', '>=', start),
          where('date', '<=', end)
        ]);
        
        // Filter for current students
        const studentIds = new Set(students.map((s: any) => s.id || s.uid));
        const filteredAtt = (attRecords || []).filter((a: any) => studentIds.has(a.studentId));
        setAttendance(filteredAtt);

        // Fetch working days settings
        const [wDaysDoc, globalWDaysDoc] = await Promise.all([
          dbService.get('examSettings', `workingDays-${selectedBatch}`),
          dbService.get('examSettings', 'workingDays-school')
        ]);
        const wDays = globalWDaysDoc?.data || wDaysDoc?.data || {};
        setWorkingDays(wDays);
      } catch (err) {
        console.error('Failed to load attendance or working days in CentralRegister', err);
      } finally {
        setLoadingAttendance(false);
      }
    };
    fetchAttendanceAndSettings();
  }, [selectedBatch, students, settings?.currentAcademicYear]);

  const ACADEMIC_MONTHS = useMemo(() => [
    { name: 'June', index: 5, label: 'JUNE', numStr: '06', defaultDays: 14 },
    { name: 'July', index: 6, label: 'JULY', numStr: '07', defaultDays: 25 },
    { name: 'August', index: 7, label: 'AUGUST', numStr: '08', defaultDays: 20 },
    { name: 'September', index: 8, label: 'SEP.', numStr: '09', defaultDays: 16 },
    { name: 'October', index: 9, label: 'OCT.', numStr: '10', defaultDays: 19 },
    { name: 'November', index: 10, label: 'NOV.', numStr: '11', defaultDays: 25 },
    { name: 'December', index: 11, label: 'DEC.', numStr: '12', defaultDays: 24 },
    { name: 'January', index: 0, label: 'JAN.', numStr: '01', defaultDays: 18 },
    { name: 'February', index: 1, label: 'FEB.', numStr: '02', defaultDays: 24 },
    { name: 'March', index: 2, label: 'MAR.', numStr: '03', defaultDays: 20 },
    { name: 'April', index: 3, label: 'APRIL', numStr: '04', defaultDays: 18 },
  ], []);

  const getWorkingDaysForMonth = (monthName: string) => {
    const monthLower = (monthName || '').toLowerCase().trim();
    if (monthLower === 'june' || monthLower === 'jun') return 14;
    if (monthLower === 'july' || monthLower === 'jul') return 25;

    if (workingDays) {
      const key = Object.keys(workingDays).find(k => k.toLowerCase() === monthLower);
      if (key && workingDays[key] !== undefined && workingDays[key] !== null && Number(workingDays[key]) > 0) {
        return Number(workingDays[key]);
      }
    }
    const monthObj = ACADEMIC_MONTHS.find(m => m.name.toLowerCase() === monthLower);
    if (monthObj) return monthObj.defaultDays;
    
    const defaults: Record<string, number> = {
      june: 14, july: 25, august: 20, september: 16, october: 19, november: 25,
      december: 24, january: 18, february: 24, march: 20, april: 18
    };
    return defaults[monthLower] || 20;
  };

  const getStudentPresentDays = (studentId: string, monthName: string) => {
    const monthLower = monthName.toLowerCase();
    const monthObj = ACADEMIC_MONTHS.find(m => m.name.toLowerCase() === monthLower);
    if (!monthObj) return 0;
    
    const studentAttendance = attendance.filter(a => {
      if (a.studentId !== studentId || !a.date) return false;
      const parts = a.date.split('-');
      return parts.length >= 2 && parts[1] === monthObj.numStr;
    });
    return studentAttendance.filter(a => a.status === 'present' || a.status === 'present_half').length;
  };

  const attendanceTotals = useMemo(() => {
    const q1Days = getWorkingDaysForMonth('June') + getWorkingDaysForMonth('July') + getWorkingDaysForMonth('August');
    const q2Days = getWorkingDaysForMonth('September') + getWorkingDaysForMonth('October') + getWorkingDaysForMonth('November');
    const q3Days = getWorkingDaysForMonth('December') + getWorkingDaysForMonth('January') + getWorkingDaysForMonth('February');
    const q4Days = getWorkingDaysForMonth('March') + getWorkingDaysForMonth('April');
    const grandDays = q1Days + q2Days + q3Days + q4Days;
    return { q1Days, q2Days, q3Days, q4Days, grandDays };
  }, [workingDays, attendance]);

  useEffect(() => {
    if (scheduledExams.length > 0 && selectedExamId === 'all') {
      // Keep 'all' as default, but if user wants, they can select a specific exam
    }
  }, [scheduledExams]);

  const getStudentTotal = (studentId: string, examId: string, subjectId: string) => {
    const m = marks.find((mark: any) => mark.studentId === studentId && mark.examId === examId && mark.subjectId === subjectId);
    if (!m) return null;
    const exam = exams.find((e: any) => e.id === examId);
    const isFA = exam ? exam.type === 'FA' : true;
    if (isFA) {
      return (m.st1 || 0) + (m.st2 || 0) + (m.hw || 0) + (m.faWritten || 0);
    } else {
      return m.saWritten || 0;
    }
  };

  const getExamMaxMarks = (examId: string) => {
    const exam = exams.find((e: any) => e.id === examId);
    return exam?.type === 'SA' ? 100 : 50;
  };

  const calculateGrade = (percentage: number) => {
    if (percentage >= 91) return { grade: 'A1', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    if (percentage >= 81) return { grade: 'A2', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    if (percentage >= 71) return { grade: 'B1', color: 'bg-blue-100 text-blue-800 border-blue-200' };
    if (percentage >= 61) return { grade: 'B2', color: 'bg-blue-50 text-blue-700 border-blue-100' };
    if (percentage >= 51) return { grade: 'C1', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    if (percentage >= 41) return { grade: 'C2', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
    if (percentage >= 35) return { grade: 'D', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    return { grade: 'E', color: 'bg-red-100 text-red-800 border-red-200' };
  };

  // Process data for rendering
  const processedData = useMemo(() => {
    if (!selectedBatch) return [];

    const list = students.map((student: any) => {
      const studentId = student.id || student.uid;
      let grandTotal = 0;
      let maxPossibleMarks = 0;
      let hasFailedSubject = false;
      let subjectsScored = 0;

      const subjectMarksMap: Record<string, number | null> = {};
      const examTotalsMap: Record<string, number> = {};

      if (selectedExamId === 'all') {
        // Consolidated across all scheduled exams
        scheduledExams.forEach((exam: any) => {
          let examTotal = 0;
          let examMax = 0;
          activeSubjects.forEach((subj: any) => {
            const score = getStudentTotal(studentId, exam.id, subj.id);
            if (score !== null) {
              examTotal += score;
              examMax += getExamMaxMarks(exam.id);
              subjectsScored++;
              if (score < getExamMaxMarks(exam.id) * 0.35) {
                hasFailedSubject = true;
              }
            }
          });
          examTotalsMap[exam.id] = examTotal;
          grandTotal += examTotal;
          maxPossibleMarks += examMax;
        });
      } else {
        // Specific Exam View (subject-wise columns)
        activeSubjects.forEach((subj: any) => {
          const score = getStudentTotal(studentId, selectedExamId, subj.id);
          subjectMarksMap[subj.id] = score;
          if (score !== null) {
            grandTotal += score;
            maxPossibleMarks += getExamMaxMarks(selectedExamId);
            subjectsScored++;
            if (score < getExamMaxMarks(selectedExamId) * 0.35) {
              hasFailedSubject = true;
            }
          }
        });
      }

      const percentage = maxPossibleMarks > 0 ? Math.round((grandTotal / maxPossibleMarks) * 100) : 0;
      const isPass = subjectsScored > 0 && !hasFailedSubject;
      const gradeInfo = calculateGrade(percentage);

      return {
        student,
        rollNumber: student.rollNumber || student.rollNo || student.batchRollNo || student.batchRollNumber || '-',
        name: student.name || 'Unknown Student',
        subjectMarks: subjectMarksMap,
        examTotals: examTotalsMap,
        grandTotal,
        maxPossibleMarks,
        percentage,
        isPass,
        grade: gradeInfo.grade,
        gradeColor: gradeInfo.color,
        isNonAttending: student.status === 'non_attending'
      };
    });

    // Filtering
    const filtered = list.filter((row: any) => {
      const matchesSearch = row.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            row.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (row.student.admissionNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      if (failFilter === 'passed') return matchesSearch && row.isPass && !row.isNonAttending;
      if (failFilter === 'failed') return matchesSearch && !row.isPass && !row.isNonAttending;
      return matchesSearch;
    });

    // Sorting
    return filtered.sort((a: any, b: any) => {
      let comparison = 0;
      if (sortBy === 'rollNumber') {
        comparison = sortByRollNumber(a.student || a, b.student || b);
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'total') {
        comparison = b.grandTotal - a.grandTotal;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [students, selectedExamId, selectedBatch, activeSubjects, exams, marks, searchQuery, failFilter, sortBy, sortOrder]);

  const spreadsheetData = useMemo(() => {
    if (!selectedBatch) return [];

    const list = students.map((student: any) => {
      const studentId = student.id || student.uid;
      const studentSubjectMarks = marks.filter((m: any) => m.studentId === studentId);

      const subjectDetails: Record<string, { ave20: number; sa2_80: number | null; total: number }> = {};
      let studentGrandTotal = 0;

      const numFas = exams.filter((e: any) => e.type === 'FA').length || 4;

      activeSubjects.forEach((subj: any) => {
        // 1. FA average (out of 10)
        const faMarks = studentSubjectMarks.filter((m: any) => {
          if (m.subjectId !== subj.id) return false;
          const exam = exams.find((e: any) => e.id === m.examId);
          return exam?.type === 'FA';
        });
        const faSum = faMarks.reduce((acc: number, m: any) => acc + ((Number(m.st1) || 0) + (Number(m.st2) || 0) + (Number(m.hw) || 0) + (Number(m.faWritten) || 0)), 0);
        const faAvg_10 = faMarks.length > 0 ? (faSum / (faMarks.length * 50)) * 10 : (numFas > 0 ? (faSum / (numFas * 50)) * 10 : 0);

        // 2. SA1 (out of 10)
        const sa1MarkDoc = studentSubjectMarks.find((m: any) => {
          if (m.subjectId !== subj.id) return false;
          const exam = exams.find((e: any) => e.id === m.examId);
          return exam?.type === 'SA' && (exam.title?.includes('1') || exam.examNumber === 1);
        });
        const sa1Score = sa1MarkDoc ? Number(sa1MarkDoc.saWritten || 0) : 0;
        const sa1_10 = (sa1Score / 100) * 10;

        const ave20 = Math.round(faAvg_10 + sa1_10);

        // 3. SA2 (out of 80)
        const sa2MarkDoc = studentSubjectMarks.find((m: any) => {
          if (m.subjectId !== subj.id) return false;
          const exam = exams.find((e: any) => e.id === m.examId);
          return exam?.type === 'SA' && (exam.title?.includes('2') || exam.examNumber === 2);
        });
        const sa2Score = sa2MarkDoc ? Number(sa2MarkDoc.saWritten || 0) : null;
        const sa2_80 = sa2Score !== null ? Math.round((sa2Score / 100) * 80) : null;

        const subjectTotal = ave20 + (sa2_80 !== null ? sa2_80 : 0);
        subjectDetails[subj.id] = {
          ave20,
          sa2_80,
          total: subjectTotal
        };

        studentGrandTotal += subjectTotal;
      });

      // Calculate attendance
      const june = getStudentPresentDays(studentId, 'June');
      const july = getStudentPresentDays(studentId, 'July');
      const august = getStudentPresentDays(studentId, 'August');
      const q1Total = june + july + august;
      
      const september = getStudentPresentDays(studentId, 'September');
      const october = getStudentPresentDays(studentId, 'October');
      const november = getStudentPresentDays(studentId, 'November');
      const q2Total = september + october + november;
      
      const december = getStudentPresentDays(studentId, 'December');
      const january = getStudentPresentDays(studentId, 'January');
      const february = getStudentPresentDays(studentId, 'February');
      const q3Total = december + january + february;
      
      const march = getStudentPresentDays(studentId, 'March');
      const april = getStudentPresentDays(studentId, 'April');
      const q4Total = march + april;
      
      let grandTotalPresent = q1Total + q2Total + q3Total + q4Total;
      
      if (student.status === 'non_attending') {
        const hash = studentId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
        const attendancePercent = 80 + (hash % 13);
        grandTotalPresent = Math.round(attendanceTotals.grandDays * (attendancePercent / 100));
      }

      const attendancePct = attendanceTotals.grandDays > 0 ? Math.round((grandTotalPresent / attendanceTotals.grandDays) * 100) : 0;

      // Pass/Fail criteria: Total of each active subject is >= 35
      const isPass = activeSubjects.every((subj: any) => {
        return (subjectDetails[subj.id]?.total || 0) >= 35;
      });

      return {
        student,
        rollNumber: student.rollNumber || student.rollNo || student.batchRollNo || student.batchRollNumber || '-',
        name: student.name || 'Unknown Student',
        subjectDetails,
        grandTotal: studentGrandTotal,
        attendancePresent: grandTotalPresent,
        attendancePct,
        isPass,
        result: isPass ? 'Promoted' : 'Detained',
        admissionNo: student.admissionNumber || student.admissionNo || student.admNo || '---',
        fatherName: student.fatherName || student.parentName || student.father_name || '---',
        gender: student.gender || 'MALE',
        caste: student.caste || '-'
      };
    });

    // Filtering by Search Query & Pass/Fail filters
    const filtered = list.filter((row: any) => {
      const matchesSearch = row.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            row.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            row.admissionNo.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (failFilter === 'passed') return matchesSearch && row.isPass;
      if (failFilter === 'failed') return matchesSearch && !row.isPass;
      return matchesSearch;
    });

    // Sorting
    return filtered.sort((a: any, b: any) => {
      let comparison = 0;
      if (sortBy === 'rollNumber') {
        comparison = sortByRollNumber(a.student || a, b.student || b);
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'total') {
        comparison = b.grandTotal - a.grandTotal;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [students, selectedBatch, subjects, exams, marks, searchQuery, failFilter, sortBy, sortOrder, attendance, workingDays, activeSubjects, attendanceTotals]);

  // Column statistics
  const stats = useMemo(() => {
    if (processedData.length === 0) return null;

    const subjectStats: Record<string, { average: number; highest: number; passRate: number }> = {};
    const examStats: Record<string, { average: number; highest: number; passRate: number }> = {};

    if (selectedExamId === 'all') {
      scheduledExams.forEach((exam: any) => {
        const scores = processedData
          .map((row: any) => row.examTotals[exam.id])
          .filter((s: any) => s !== undefined && s !== null);

        if (scores.length > 0) {
          const sum = scores.reduce((acc, val) => acc + val, 0);
          const max = Math.max(...scores);
          const examMax = subjects.length * getExamMaxMarks(exam.id);
          const passCount = processedData.filter((row: any) => {
            const t = row.examTotals[exam.id];
            return t !== undefined && t >= examMax * 0.35;
          }).length;

          examStats[exam.id] = {
            average: parseFloat((sum / scores.length).toFixed(1)),
            highest: max,
            passRate: parseFloat(((passCount / scores.length) * 100).toFixed(1))
          };
        }
      });
    } else {
      subjects.forEach((subj: any) => {
        const scores = processedData
          .map((row: any) => row.subjectMarks[subj.id])
          .filter((s: any) => s !== null && s !== undefined);

        if (scores.length > 0) {
          const sum = scores.reduce((acc, val) => acc + val, 0);
          const max = Math.max(...scores);
          const maxMark = getExamMaxMarks(selectedExamId);
          const passCount = scores.filter((s: any) => s >= maxMark * 0.35).length;

          subjectStats[subj.id] = {
            average: parseFloat((sum / scores.length).toFixed(1)),
            highest: max,
            passRate: parseFloat(((passCount / scores.length) * 100).toFixed(1))
          };
        }
      });
    }

    return { subjectStats, examStats };
  }, [processedData, selectedExamId, subjects, scheduledExams]);

  if (!selectedBatch) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
          <Filter className="w-8 h-8" />
        </div>
        <p className="text-neutral-500 font-bold uppercase tracking-widest text-sm">Please select Class and Batch to view Consolidated Register</p>
      </div>
    );
  }

  // Export to Excel handler
  const handleExportExcel = () => {
    try {
      const dataRows: any[] = [];
      const isConsolidated = selectedExamId === 'all';
      const className = activeClass?.name || 'Class';
      const batchName = activeBatch?.name || 'Batch';

      if (registerType === 'marks' && ledgerView === 'spreadsheet') {
        const headerRow1 = [
          `ACADEMIC YEAR - ${settings?.currentAcademicYear || '2025-26'}`,
          "",
          `Name of the Class Teacher:- ${classTeacherName}`,
          "",
          "",
          `Class & Batch:- ${className}-${batchName}`,
        ];
        
        // Col Group Headers
        const headerRow2 = [
          "Admn.No", "SNo", "Name of the Student", "Father Name", "Gender", "Caste"
        ];
        activeSubjects.forEach((sub: any) => {
          headerRow2.push(sub.name.toUpperCase(), "", "");
        });
        headerRow2.push("Grand Total", "Annual Attendance", "Percentage", "Result");

        // Sub headers
        const headerRow3 = [
          "", "", "", "", "", ""
        ];
        activeSubjects.forEach(() => {
          headerRow3.push("FA's & SA1 Ave. 20%", "SA-2 80", "Total 100");
        });
        headerRow3.push("", "", "", "");

        const rows = [headerRow1, headerRow2, headerRow3];

        // Populate student rows
        spreadsheetData.forEach((row: any, idx: number) => {
          const studentRow = [
            row.admissionNo,
            idx + 1,
            row.name,
            row.fatherName,
            row.gender,
            row.caste
          ];
          activeSubjects.forEach((sub: any) => {
            const details = row.subjectDetails[sub.id] || { ave20: 0, sa2_80: null, total: 0 };
            studentRow.push(
              details.ave20,
              details.sa2_80 !== null ? details.sa2_80 : "-",
              details.total
            );
          });
          studentRow.push(
            row.grandTotal,
            row.attendancePresent,
            `${row.attendancePct}%`,
            row.result
          );
          rows.push(studentRow);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        
        // Add merges for headers
        const merges = [
          // Row 1 merges
          { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
          { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } },
          { s: { r: 0, c: 5 }, e: { r: 0, c: 12 } },
        ];
        
        // Merge subject group headers in Row 2
        let colIndex = 6;
        activeSubjects.forEach(() => {
          merges.push({ s: { r: 1, c: colIndex }, e: { r: 1, c: colIndex + 2 } });
          colIndex += 3;
        });

        worksheet['!merges'] = merges;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Central Marks Register");
        XLSX.writeFile(workbook, `${className}_${batchName}_Central_Marks_Register.xlsx`);
        toast.success("Spreadsheet ledger exported to Excel successfully");
        return;
      }

      if (registerType === 'attendance') {
        processedData.forEach((row: any, idx: number) => {
          const studentId = row.student.id || row.student.uid;
          const admnNo = row.student.admissionNumber || row.student.admissionNo || row.student.admNo || '---';
          const sName = row.student.name || '---';
          const fName = row.student.fatherName || row.student.parentName || row.student.father_name || '---';
          
          const june = getStudentPresentDays(studentId, 'June');
          const july = getStudentPresentDays(studentId, 'July');
          const august = getStudentPresentDays(studentId, 'August');
          const q1Total = june + july + august;
          
          const september = getStudentPresentDays(studentId, 'September');
          const october = getStudentPresentDays(studentId, 'October');
          const november = getStudentPresentDays(studentId, 'November');
          const q2Total = september + october + november;
          
          const december = getStudentPresentDays(studentId, 'December');
          const january = getStudentPresentDays(studentId, 'January');
          const february = getStudentPresentDays(studentId, 'February');
          const q3Total = december + january + february;
          
          const march = getStudentPresentDays(studentId, 'March');
          const april = getStudentPresentDays(studentId, 'April');
          const q4Total = march + april;
          
          const grandTotalPresent = q1Total + q2Total + q3Total + q4Total;
          const percentage = Math.round((grandTotalPresent / attendanceTotals.grandDays) * 100) || 0;

          dataRows.push({
            "Admn.No": admnNo,
            "SNo": idx + 1,
            "Name of the Student": sName,
            "Name of the Father": fName,
            "June": june,
            "July": july,
            "August": august,
            "Q1 Total": q1Total,
            "September": september,
            "October": october,
            "November": november,
            "Q2 Total": q2Total,
            "December": december,
            "January": january,
            "February": february,
            "Q3 Total": q3Total,
            "March": march,
            "April": april,
            "Q4 Total": q4Total,
            "Grand Total Present": grandTotalPresent,
            "Attendance %": `${percentage}%`
          });
        });

        const worksheet = XLSX.utils.json_to_sheet(dataRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Quarterly Attendance");
        XLSX.writeFile(workbook, `${className}_${batchName}_Quarterly_Attendance.xlsx`);
        toast.success("Attendance sheet exported to Excel successfully");
        return;
      }

      processedData.forEach((row: any, idx: number) => {
        const baseRow: any = {
          "SNo": idx + 1,
          "Admn.No": row.student.admissionNumber || row.student.admissionNo || row.student.admNo || '---',
          "Roll No": row.rollNumber,
          "Student Name": row.name,
          "Father's Name": row.student.fatherName || row.student.parentName || row.student.father_name || '---',
          "Status": row.isNonAttending ? "Non-Attending" : "Active"
        };

        if (isConsolidated) {
          scheduledExams.forEach((exam: any) => {
            baseRow[`${exam.title} (Max ${subjects.length * getExamMaxMarks(exam.id)})`] = row.examTotals[exam.id] || 0;
          });
        } else {
          subjects.forEach((subj: any) => {
            baseRow[`${subj.name} (Max ${getExamMaxMarks(selectedExamId)})`] = row.subjectMarks[subj.id] ?? '-';
          });
        }

        baseRow["Grand Total"] = row.grandTotal;
        baseRow["Max Possible"] = row.maxPossibleMarks;
        baseRow["Percentage"] = `${row.percentage}%`;
        baseRow["Grade"] = row.grade;
        baseRow["Result"] = row.isPass ? "PASS" : "FAIL/COMP";

        dataRows.push(baseRow);
      });

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Consolidated Marks");

      // Auto-fit columns
      const maxColWidth = dataRows.reduce((widths: any, row: any) => {
        Object.keys(row).forEach((key, colIndex) => {
          const value = String(row[key] ?? '');
          widths[colIndex] = Math.max(widths[colIndex] || 10, value.length + 2, key.length + 2);
        });
        return widths;
      }, []);
      worksheet['!cols'] = maxColWidth.map((w: number) => ({ wch: w }));

      XLSX.writeFile(workbook, `${className}_${batchName}_Consolidated_Marks_Register.xlsx`);
      toast.success("Excel sheet exported successfully");
    } catch (error) {
      console.error("Excel export error:", error);
      toast.error("Failed to export Excel document");
    }
  };

  // Export to PDF handler
  const handleExportPDF = () => {
    try {
      const isConsolidated = selectedExamId === 'all';
      const className = activeClass?.name || 'Class';
      const batchName = activeBatch?.name || 'Batch';

      if (registerType === 'marks' && ledgerView === 'spreadsheet') {
        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'pt',
          format: 'A3' // Use A3 for maximum clarity and width to accommodate all columns
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        
        // Document Header banner in Yellow
        doc.setFillColor(255, 255, 0);
        doc.rect(40, 30, pageWidth - 80, 25, 'F');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        
        const bannerText = `ACADEMIC YEAR - ${settings?.currentAcademicYear || '2025-26'}    |    Name of the Class Teacher:- ${classTeacherName}    |    Class & Batch:- ${className}-${batchName}`;
        doc.text(bannerText, pageWidth / 2, 46, { align: 'center' });

        // Build table headers (Group headers)
        const headersRow1 = ["Admn.No", "SNo", "Name of the Student", "Father Name", "Gender", "Caste"];
        activeSubjects.forEach((sub: any) => {
          headersRow1.push(`${sub.name.toUpperCase()} (FA+SA1 20%)`, `${sub.name.toUpperCase()} (SA-2 80)`, `${sub.name.toUpperCase()} (Total 100)`);
        });
        headersRow1.push("Grand Total", "Annual Attendance", "Percentage", "Result");

        const tableRows = spreadsheetData.map((row: any, idx: number) => {
          const cells: any[] = [
            row.admissionNo,
            idx + 1,
            row.name.toUpperCase(),
            row.fatherName.toUpperCase(),
            row.gender,
            row.caste
          ];
          activeSubjects.forEach((sub: any) => {
            const details = row.subjectDetails[sub.id] || { ave20: 0, sa2_80: null, total: 0 };
            cells.push(
              details.ave20,
              details.sa2_80 !== null ? details.sa2_80 : "-",
              details.total
            );
          });
          cells.push(
            row.grandTotal,
            row.attendancePresent,
            `${row.attendancePct}%`,
            row.result
          );
          return cells;
        });

        autoTable(doc, {
          head: [headersRow1],
          body: tableRows,
          startY: 65,
          styles: { fontSize: 7, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.5 },
          headStyles: { fillColor: [189, 215, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          columnStyles: {
            2: { cellWidth: 100 }, // Student name
            3: { cellWidth: 100 }  // Father name
          }
        });

        doc.save(`${className}_${batchName}_Central_Marks_Register.pdf`);
        toast.success("Spreadsheet PDF generated successfully");
        return;
      }

      if (registerType === 'attendance') {
        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'pt',
          format: 'A4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        
        // Document Header
        doc.setFontSize(14);
        doc.setTextColor(0, 32, 96);
        doc.setFont("helvetica", "bold");
        doc.text(`ACADEMIC YEAR - ${settings?.currentAcademicYear || '2025-26'}`, pageWidth / 2, 35, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Class & Batch: ${className} - ${batchName} | Class Teacher: ${classTeacherName}`, pageWidth / 2, 55, { align: 'center' });
        doc.text("QUARTERLY ATTENDANCE REGISTER", pageWidth / 2, 75, { align: 'center' });

        const headers = ["Admn.No", "SNo", "Student Name", "Father Name", "Jun", "Jul", "Aug", "Q1", "Sep", "Oct", "Nov", "Q2", "Dec", "Jan", "Feb", "Q3", "Mar", "Apr", "Q4", "Total", "%"];
        const tableRows = processedData.map((row: any, idx: number) => {
          const studentId = row.student.id || row.student.uid;
          const admnNo = row.student.admissionNumber || row.student.admissionNo || row.student.admNo || '---';
          const sName = row.student.name || '---';
          const fName = row.student.fatherName || row.student.parentName || row.student.father_name || '---';
          
          const june = getStudentPresentDays(studentId, 'June');
          const july = getStudentPresentDays(studentId, 'July');
          const august = getStudentPresentDays(studentId, 'August');
          const q1Total = june + july + august;
          
          const september = getStudentPresentDays(studentId, 'September');
          const october = getStudentPresentDays(studentId, 'October');
          const november = getStudentPresentDays(studentId, 'November');
          const q2Total = september + october + november;
          
          const december = getStudentPresentDays(studentId, 'December');
          const january = getStudentPresentDays(studentId, 'January');
          const february = getStudentPresentDays(studentId, 'February');
          const q3Total = december + january + february;
          
          const march = getStudentPresentDays(studentId, 'March');
          const april = getStudentPresentDays(studentId, 'April');
          const q4Total = march + april;
          
          const grandTotalPresent = q1Total + q2Total + q3Total + q4Total;
          const percentage = Math.round((grandTotalPresent / attendanceTotals.grandDays) * 100) || 0;

          return [
            admnNo,
            idx + 1,
            sName,
            fName,
            june,
            july,
            august,
            q1Total,
            september,
            october,
            november,
            q2Total,
            december,
            january,
            february,
            q3Total,
            march,
            april,
            q4Total,
            grandTotalPresent,
            `${percentage}%`
          ];
        });

        autoTable(doc, {
          head: [headers],
          body: tableRows,
          startY: 95,
          styles: { fontSize: 7, cellPadding: 4 },
          headStyles: { fillColor: [255, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          columnStyles: {
            2: { cellWidth: 80 }, // Student name
            3: { cellWidth: 80 }  // Father name
          }
        });

        doc.save(`${className}_${batchName}_Attendance_Register.pdf`);
        toast.success("Attendance PDF generated successfully");
        return;
      }

      const examTitle = isConsolidated ? 'Consolidated (All Exams)' : exams.find((e: any) => e.id === selectedExamId)?.title || 'Exam';

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'A4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Document Header
      doc.setFontSize(16);
      doc.setTextColor(33, 43, 54);
      doc.text("CONSOLIDATED MARKS REGISTER", pageWidth / 2, 40, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(99, 115, 129);
      doc.text(`Class: ${className} | Batch: ${batchName}`, 40, 60);
      doc.text(`Exam Context: ${examTitle} | Date: ${new Date().toLocaleDateString()}`, pageWidth - 40, 60, { align: 'right' });

      // Construct columns
      const headers = ["Admn.No", "SNo", "Roll No", "Student Name", "Father's Name"];
      if (isConsolidated) {
        scheduledExams.forEach((exam: any) => {
          headers.push(exam.title);
        });
      } else {
        subjects.forEach((subj: any) => {
          headers.push(subj.name);
        });
      }
      headers.push("Total", "%", "Grade", "Result");

      // Construct rows
      const tableRows = processedData.map((row: any, idx: number) => {
        const cells: any[] = [
          row.student.admissionNumber || row.student.admissionNo || row.student.admNo || '---',
          idx + 1,
          row.rollNumber,
          row.name,
          row.student.fatherName || row.student.parentName || row.student.father_name || '---'
        ];
        if (isConsolidated) {
          scheduledExams.forEach((exam: any) => {
            cells.push(row.examTotals[exam.id] || 0);
          });
        } else {
          subjects.forEach((subj: any) => {
            cells.push(row.subjectMarks[subj.id] ?? '-');
          });
        }
        cells.push(row.grandTotal, `${row.percentage}%`, row.grade, row.isPass ? "PASS" : "FAIL/COMP");
        return cells;
      });

      // Add a stats row at the end of PDF table
      if (stats) {
        const statsRow: any[] = ["-", "-", "-", "CLASS AVERAGE", "-"];
        if (isConsolidated) {
          scheduledExams.forEach((exam: any) => {
            statsRow.push(stats.examStats[exam.id]?.average || 0);
          });
        } else {
          subjects.forEach((subj: any) => {
            statsRow.push(stats.subjectStats[subj.id]?.average || 0);
          });
        }
        statsRow.push("-", "-", "-", "-");
        tableRows.push(statsRow);
      }

      autoTable(doc, {
        head: [headers],
        body: tableRows,
        startY: 80,
        styles: { fontSize: 8, cellPadding: 6 },
        headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
          3: { cellWidth: 100 }, // Student name gets more space
          4: { cellWidth: 100 }  // Father name
        },
        didParseCell: (data) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [236, 240, 241];
          }
        }
      });

      doc.save(`${className}_${batchName}_Consolidated_Register.pdf`);
      toast.success("PDF report generated successfully");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF document");
    }
  };

  const isConsolidated = selectedExamId === 'all';

  return (
    <div className="p-6 bg-white rounded-3xl border border-neutral-100 shadow-sm">
      {/* View Switcher Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-neutral-100">
        <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-2xl border border-neutral-200 w-fit shrink-0">
          <button
            onClick={() => setRegisterType('marks')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
              registerType === 'marks'
                ? 'bg-primary text-white shadow-md shadow-primary/25'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Subject Marks Ledger</span>
          </button>
          <button
            onClick={() => setRegisterType('attendance')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
              registerType === 'attendance'
                ? 'bg-primary text-white shadow-md shadow-primary/25'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Quarterly Attendance Register</span>
          </button>
        </div>

        {registerType === 'marks' && (
          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-2xl border border-neutral-200 w-fit shrink-0 sm:mr-auto sm:ml-4">
            <button
              onClick={() => setLedgerView('spreadsheet')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                ledgerView === 'spreadsheet'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Spreadsheet Ledger</span>
            </button>
            <button
              onClick={() => setLedgerView('simplified')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                ledgerView === 'simplified'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Standard grid</span>
            </button>
          </div>
        )}

        {/* Export buttons and Exam switcher (if marks register) */}
        <div className="flex flex-wrap items-center gap-3">
          {registerType === 'marks' && (
            <div className="flex items-center gap-2 bg-neutral-150/50 p-1 rounded-xl border border-neutral-200/50">
              <button
                onClick={() => setSelectedExamId('all')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  selectedExamId === 'all' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                All Exams
              </button>
              {scheduledExams.map((e: any) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedExamId(e.id)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                    selectedExamId === e.id ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {e.title}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto sm:ml-0">
            <button 
              onClick={handleExportExcel}
              className="px-4 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Export Excel</span>
            </button>
            <button 
              onClick={handleExportPDF}
              className="px-4 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <Printer className="w-4 h-4 text-primary" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid Sub-Header with search & custom results filter */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-5 items-center">
        {/* Search */}
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={registerType === 'marks' ? "Search students by name, roll, or admission number..." : "Search students by name or admission number..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs font-bold pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary text-sidebar"
          />
        </div>

        {/* Pass/Fail Filter (Only applicable for Marks view) */}
        {registerType === 'marks' ? (
          <div className="md:col-span-3">
            <select
              value={failFilter}
              onChange={(e: any) => setFailFilter(e.target.value)}
              className="w-full text-xs font-bold px-3 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary text-neutral-600 uppercase tracking-wider font-sans"
            >
              <option value="all">Filter: All Results</option>
              <option value="passed">Filter: Passed Students Only</option>
              <option value="failed">Filter: Failed/Compartment Only</option>
            </select>
          </div>
        ) : (
          <div className="md:col-span-3">
            <div className="w-full text-xs font-bold px-3 py-3 bg-neutral-50 text-neutral-400 rounded-xl border border-neutral-200 uppercase tracking-wider text-center select-none">
              Attendance Filters
            </div>
          </div>
        )}

        {/* Sort Controls */}
        <div className="md:col-span-3 flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="flex-1 text-xs font-bold px-3 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary text-neutral-600 uppercase tracking-wider font-sans"
          >
            <option value="rollNumber">Sort by Roll No</option>
            <option value="name">Sort by Name</option>
            {registerType === 'marks' && <option value="total">Sort by Grand Total</option>}
          </select>
          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-3 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-xl text-neutral-500 transition-colors shrink-0"
            title="Toggle Sort Direction"
          >
            {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {loadingAttendance && registerType === 'attendance' ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Loading student attendance matrix...</p>
        </div>
      ) : registerType === 'attendance' ? (
        /* ==================== ATTENDANCE REGISTER VIEW (High Fidelity to Image) ==================== */
        <div className="overflow-x-auto border border-neutral-200 rounded-2xl shadow-sm">
          {/* Top Header Banner matching the image */}
          <div className="bg-[#002060] text-white font-black text-center py-3 px-4 flex flex-col md:flex-row justify-between items-center text-xs uppercase tracking-wider gap-2">
            <span>ACADEMIC YEAR - {settings?.currentAcademicYear || '2025-26'}</span>
            <span>Name of the Class Teacher:- <span className="text-yellow-300 font-extrabold">{classTeacherName}</span></span>
            <span>Class & Batch:- <span className="text-yellow-300 font-extrabold">{activeClass?.name} - {activeBatch?.name}</span></span>
          </div>

          <table className="w-full border-collapse border-t border-neutral-200 text-center">
            <thead>
              {/* Row 1: Quarters headers */}
              <tr className="bg-neutral-100 text-[10px] font-black uppercase text-neutral-600 border-b border-neutral-200">
                <th className="p-2 border border-neutral-200 bg-neutral-50 text-neutral-700 min-w-[70px]" rowSpan={4}>Admn.No</th>
                <th className="p-2 border border-neutral-200 bg-neutral-50 text-neutral-700 min-w-[40px]" rowSpan={4}>Sno</th>
                <th className="p-2 border border-neutral-200 bg-white text-[#FF0000] font-black text-left sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] min-w-[150px]" rowSpan={4}>Name of the Student</th>
                <th className="p-2 border border-neutral-200 bg-neutral-50 text-neutral-700 text-left min-w-[120px]" rowSpan={4}>Name of the Father</th>
                
                {/* Quarters (Red highlight exactly as shown in the uploaded register) */}
                <th className="p-1 border border-neutral-200 bg-[#FF0000] text-white font-extrabold tracking-widest text-xs uppercase" colSpan={4}>I-QUARTER</th>
                <th className="p-1 border border-neutral-200 bg-[#FF0000] text-white font-extrabold tracking-widest text-xs uppercase" colSpan={4}>II-QUARTER</th>
                <th className="p-1 border border-neutral-200 bg-[#FF0000] text-white font-extrabold tracking-widest text-xs uppercase" colSpan={4}>III-QUARTER</th>
                <th className="p-1 border border-neutral-200 bg-[#FF0000] text-white font-extrabold tracking-widest text-xs uppercase" colSpan={3}>IV-QUARTE</th>
                
                <th className="p-2 border border-neutral-200 bg-[#FF0000] text-white font-black uppercase tracking-wider text-[11px] min-w-[60px]" rowSpan={2}>GRAND TOTAL</th>
                <th className="p-2 border border-neutral-200 bg-[#FF0000] text-white font-black uppercase tracking-wider text-[11px] min-w-[60px]" rowSpan={4}>PERCENTAGE</th>
              </tr>

              {/* Row 2: Months Headers */}
              <tr className="text-[10px] font-extrabold border-b border-neutral-200 bg-white">
                {/* Q1 */}
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">JUNE</th>
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">JULY</th>
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">AUGUST</th>
                <th className="p-1.5 border border-neutral-200 text-neutral-900 font-black">TOTAL</th>
                {/* Q2 */}
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">SEP.</th>
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">OCT.</th>
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">NOV.</th>
                <th className="p-1.5 border border-neutral-200 text-neutral-900 font-black">TOTAL</th>
                {/* Q3 */}
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">DEC.</th>
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">JAN.</th>
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">FEB.</th>
                <th className="p-1.5 border border-neutral-200 text-neutral-900 font-black">TOTAL</th>
                {/* Q4 */}
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">MAR.</th>
                <th className="p-1.5 border border-neutral-200 text-[#FF0000]">APRIL</th>
                <th className="p-1.5 border border-neutral-200 text-neutral-900 font-black">TOTAL</th>
              </tr>

              {/* Row 3: Working Days headers (Yellow background exactly as in the image) */}
              <tr className="text-[11px] font-black border-b border-neutral-200 bg-[#FFF2CC] text-neutral-800">
                {/* Q1 */}
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('June')}</th>
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('July')}</th>
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('August')}</th>
                <th className="p-1.5 border border-neutral-200 bg-neutral-100 font-black">{attendanceTotals.q1Days}</th>
                {/* Q2 */}
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('September')}</th>
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('October')}</th>
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('November')}</th>
                <th className="p-1.5 border border-neutral-200 bg-neutral-100 font-black">{attendanceTotals.q2Days}</th>
                {/* Q3 */}
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('December')}</th>
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('January')}</th>
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('February')}</th>
                <th className="p-1.5 border border-neutral-200 bg-neutral-100 font-black">{attendanceTotals.q3Days}</th>
                {/* Q4 */}
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('March')}</th>
                <th className="p-1.5 border border-neutral-200">{getWorkingDaysForMonth('April')}</th>
                <th className="p-1.5 border border-neutral-200 bg-neutral-100 font-black">{attendanceTotals.q4Days}</th>

                <th className="p-1.5 border border-neutral-200 bg-[#E2EFDA] text-neutral-900">{attendanceTotals.grandDays}</th>
              </tr>

              {/* Row 4: D.P (Days Present) indicators (Greenish background exactly as in the image) */}
              <tr className="text-[8px] font-bold border-b border-neutral-200 bg-[#E2EFDA] text-neutral-600">
                {/* Q1 */}
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200 bg-neutral-100/50"></th>
                {/* Q2 */}
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200 bg-neutral-100/50"></th>
                {/* Q3 */}
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200 bg-neutral-100/50"></th>
                {/* Q4 */}
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200">D.P</th>
                <th className="p-1 border border-neutral-200 bg-neutral-100/50"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200 bg-white">
              {processedData.length === 0 ? (
                <tr>
                  <td colSpan={21} className="p-12 text-center text-neutral-400 font-bold italic uppercase tracking-wider text-xs">
                    No student records found in this batch
                  </td>
                </tr>
              ) : (
                processedData.map((row: any, idx: number) => {
                  const studentId = row.student.id || row.student.uid;
                  const admnNo = row.student.admissionNumber || row.student.admissionNo || row.student.admNo || '---';
                  const sName = row.student.name || '---';
                  const fName = row.student.fatherName || row.student.parentName || row.student.father_name || '---';
                  
                  // Calculate student attendance for each month
                  const june = getStudentPresentDays(studentId, 'June');
                  const july = getStudentPresentDays(studentId, 'July');
                  const august = getStudentPresentDays(studentId, 'August');
                  const q1Total = june + july + august;
                  
                  const september = getStudentPresentDays(studentId, 'September');
                  const october = getStudentPresentDays(studentId, 'October');
                  const november = getStudentPresentDays(studentId, 'November');
                  const q2Total = september + october + november;
                  
                  const december = getStudentPresentDays(studentId, 'December');
                  const january = getStudentPresentDays(studentId, 'January');
                  const february = getStudentPresentDays(studentId, 'February');
                  const q3Total = december + january + february;
                  
                  const march = getStudentPresentDays(studentId, 'March');
                  const april = getStudentPresentDays(studentId, 'April');
                  const q4Total = march + april;
                  
                  const grandTotalPresent = q1Total + q2Total + q3Total + q4Total;
                  const percentage = Math.round((grandTotalPresent / attendanceTotals.grandDays) * 100) || 0;

                  return (
                    <tr key={studentId} className="hover:bg-neutral-50/50 transition-colors">
                      {/* Admission Number */}
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700 bg-neutral-50/20">
                        {admnNo}
                      </td>
                      {/* SNo */}
                      <td className="p-2 border border-neutral-200 text-xs font-bold text-neutral-500 bg-neutral-50/20">
                        {idx + 1}
                      </td>
                      {/* Name of the Student (exactly red bold uppercase from image!) */}
                      <td className="p-2 border border-neutral-200 text-xs font-bold text-[#FF0000] uppercase text-left sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.01)]">
                        {sName}
                      </td>
                      {/* Father's Name */}
                      <td className="p-2 border border-neutral-200 text-xs text-neutral-600 text-left">
                        {fName}
                      </td>

                      {/* Q1 Days Present */}
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{june}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{july}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{august}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-black text-neutral-900 bg-neutral-100/70">{q1Total}</td>

                      {/* Q2 Days Present */}
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{september}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{october}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{november}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-black text-neutral-900 bg-neutral-100/70">{q2Total}</td>

                      {/* Q3 Days Present */}
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{december}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{january}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{february}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-black text-neutral-900 bg-neutral-100/70">{q3Total}</td>

                      {/* Q4 Days Present */}
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{march}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-bold text-neutral-700">{april}</td>
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-black text-neutral-900 bg-neutral-100/70">{q4Total}</td>

                      {/* GRAND TOTAL (Green highlight column) */}
                      <td className="p-2 border border-neutral-200 text-xs font-mono font-black text-neutral-900 bg-[#E2EFDA]">{grandTotalPresent}</td>

                      {/* PERCENTAGE (Cyan/Green highlight column) */}
                      <td className={`p-2 border border-neutral-200 text-xs font-mono font-black ${percentage >= 75 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>{percentage}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : ledgerView === 'spreadsheet' ? (
        /* ==================== HIGH-FIDELITY EXCEL SPREADSHEET LEDGER VIEW ==================== */
        <div className="overflow-x-auto border border-neutral-300 rounded-2xl shadow-md bg-white p-4">
          <table className="w-full border-collapse border border-black text-xs font-sans">
            <thead>
              {/* Row 1: Academic Year Banner */}
              <tr className="bg-[#FFFF00] text-black text-center font-black border border-black">
                <th colSpan={6 + activeSubjects.length * 3 + 4} className="py-2.5 px-4 text-xs tracking-wider uppercase border border-black">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 font-black">
                    <span>ACADEMIC YEAR - {settings?.currentAcademicYear || '2025-26'}</span>
                    <span>Name of the Class Teacher:- {classTeacherName}</span>
                    <span>Class & Batch:- {activeClass?.name || 'Class'}-{activeBatch?.name || 'Batch'}</span>
                  </div>
                </th>
              </tr>

              {/* Row 2: Group Headers */}
              <tr className="bg-[#BDD7EE] text-black font-black border border-black">
                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px]" rowSpan={2}>Admn.No</th>
                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px]" rowSpan={2}>SNo</th>
                <th className="p-2 border border-black text-left pl-3 uppercase tracking-tight text-[10px] min-w-[150px]" rowSpan={2}>Name of the Student</th>
                <th className="p-2 border border-black text-left pl-3 uppercase tracking-tight text-[10px] min-w-[120px]" rowSpan={2}>Father Name</th>
                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px]" rowSpan={2}>Gender</th>
                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px]" rowSpan={2}>Caste</th>

                {activeSubjects.map((sub: any, idx: number) => {
                  const colors = ['bg-[#DDEBF7]', 'bg-[#FFF2CC]', 'bg-[#F2DCDB]', 'bg-[#E2EFDA]', 'bg-[#E1D5E7]', 'bg-[#FCE4D6]'];
                  const bgColor = colors[idx % colors.length];
                  return (
                    <th key={sub.id} colSpan={3} className={`p-2 border border-black text-center font-black uppercase text-[10px] ${bgColor}`}>
                      {sub.name}
                    </th>
                  );
                })}

                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px] bg-[#FFF2CC]" rowSpan={2}>Grand Total</th>
                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px] bg-[#FFF2CC]" rowSpan={2}>Annual Attendance</th>
                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px] bg-[#FFF2CC]" rowSpan={2}>Percentage</th>
                <th className="p-2 border border-black text-center uppercase tracking-tight text-[10px] bg-[#FFF2CC]" rowSpan={2}>Result</th>
              </tr>

              {/* Row 3: Sub Group Headers */}
              <tr className="bg-neutral-50 text-neutral-600 font-bold border border-black text-[9px]">
                {activeSubjects.map((sub: any) => (
                  <React.Fragment key={sub.id}>
                    <th className="p-1.5 border border-black text-center font-bold">FA's & SA1 Ave. 20%</th>
                    <th className="p-1.5 border border-black text-center font-bold">SA-2 80</th>
                    <th className="p-1.5 border border-black text-center font-bold bg-neutral-100/80">Total 100</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200">
              {spreadsheetData.length === 0 ? (
                <tr>
                  <td colSpan={6 + activeSubjects.length * 3 + 4} className="p-12 text-center text-neutral-400 font-bold italic uppercase tracking-wider text-xs">
                    No student records matched your filters
                  </td>
                </tr>
              ) : (
                spreadsheetData.map((row: any, idx: number) => {
                  return (
                    <tr key={row.student.id || row.student.uid} className="hover:bg-neutral-50/50 transition-colors bg-white font-medium text-neutral-800">
                      {/* Admn No */}
                      <td className="p-2 border border-black text-center font-mono font-bold text-neutral-600 bg-neutral-50/30">
                        {row.admissionNo}
                      </td>
                      {/* SNo */}
                      <td className="p-2 border border-black text-center font-bold text-neutral-500">
                        {idx + 1}
                      </td>
                      {/* Student Name */}
                      <td className="p-2 border border-black text-left pl-3 font-extrabold text-blue-900 uppercase">
                        {row.name}
                      </td>
                      {/* Father Name */}
                      <td className="p-2 border border-black text-left pl-3 font-semibold uppercase text-neutral-600">
                        {row.fatherName}
                      </td>
                      {/* Gender */}
                      <td className={`p-2 border border-black text-center font-bold text-[10px] ${
                        row.gender?.toLowerCase() === 'female' ? 'text-rose-600 bg-rose-50/40' : 'text-emerald-700 bg-emerald-50/40'
                      }`}>
                        {row.gender?.toUpperCase() || 'MALE'}
                      </td>
                      {/* Caste */}
                      <td className="p-2 border border-black text-center font-bold text-neutral-600">
                        {row.caste}
                      </td>

                      {/* Subject Marks Columns */}
                      {activeSubjects.map((sub: any) => {
                        const details = row.subjectDetails[sub.id] || { ave20: 0, sa2_80: null, total: 0 };
                        const isFailed = details.total < 35;
                        return (
                          <React.Fragment key={sub.id}>
                            <td className="p-2 border border-black text-center font-mono font-bold text-neutral-500 bg-neutral-50/10">
                              {details.ave20}
                            </td>
                            <td className="p-2 border border-black text-center font-mono font-bold text-neutral-700">
                              {details.sa2_80 !== null ? details.sa2_80 : '-'}
                            </td>
                            <td className={`p-2 border border-black text-center font-mono font-extrabold bg-neutral-100/40 ${
                              isFailed ? 'text-red-600 bg-red-50/50 font-black' : 'text-neutral-900'
                            }`}>
                              {details.total}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Grand Total */}
                      <td className="p-2 border border-black text-center font-mono font-black text-neutral-900 bg-[#FFF2CC]/40">
                        {row.grandTotal}
                      </td>
                      {/* Annual Attendance */}
                      <td className="p-2 border border-black text-center font-mono font-bold text-neutral-700">
                        {row.attendancePresent}
                      </td>
                      {/* Percentage */}
                      <td className={`p-2 border border-black text-center font-mono font-black ${
                        row.attendancePct >= 75 ? 'text-emerald-700 bg-emerald-50/20' : 'text-red-700 bg-red-50/20'
                      }`}>
                        {row.attendancePct}%
                      </td>
                      {/* Result */}
                      <td className="p-2 border border-black text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide border ${
                          row.isPass 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {row.result?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ==================== STANDARD GRID VIEW ==================== */
        <div className="overflow-x-auto border border-neutral-150 rounded-2xl shadow-inner bg-neutral-50/50">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-100 text-[10px] font-black uppercase text-neutral-500 tracking-widest border-b border-neutral-200">
                <th className="p-4 text-center">SNo</th>
                <th className="p-4 text-left">Admn.No</th>
                <th className="p-4 text-left">Roll No</th>
                <th className="p-4 text-left sticky left-0 bg-neutral-100 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Student Name</th>
                <th className="p-4 text-left">Name of the Father</th>
                
                {/* Dynamic Headers */}
                {isConsolidated ? (
                  scheduledExams.map((exam: any) => (
                    <th key={exam.id} className="p-4 text-center border-l border-neutral-200/50">
                      <div>{exam.title}</div>
                      <div className="text-[8px] font-bold text-neutral-400 mt-0.5 font-mono">Max {subjects.length * getExamMaxMarks(exam.id)}</div>
                    </th>
                  ))
                ) : (
                  subjects.map((subj: any) => (
                    <th key={subj.id} className="p-4 text-center border-l border-neutral-200/50">
                      <div>{subj.name}</div>
                      <div className="text-[8px] font-bold text-neutral-400 mt-0.5 font-mono">Max {getExamMaxMarks(selectedExamId)}</div>
                    </th>
                  ))
                )}

                {/* End Summary Columns */}
                <th className="p-4 text-center border-l border-neutral-200 font-black text-sidebar">Grand Total</th>
                <th className="p-4 text-center border-l border-neutral-200 font-black text-sidebar">Average %</th>
                <th className="p-4 text-center border-l border-neutral-200 font-black text-sidebar">Grade</th>
                <th className="p-4 text-center border-l border-neutral-200 font-black text-sidebar">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-150 bg-white">
              {processedData.length === 0 ? (
                <tr>
                  <td colSpan={12 + (isConsolidated ? scheduledExams.length : subjects.length)} className="p-12 text-center text-neutral-400 font-bold italic uppercase tracking-wider text-xs">
                    No student records matched your filters
                  </td>
                </tr>
              ) : (
                processedData.map((row: any, idx: number) => {
                  return (
                    <tr 
                      key={row.student.id || row.student.uid} 
                      className={`hover:bg-neutral-50/50 transition-colors ${row.isNonAttending ? 'bg-amber-50/20' : ''} ${!row.isPass && !row.isNonAttending ? 'bg-red-50/10' : ''}`}
                    >
                      <td className="p-4 text-center text-xs font-bold text-neutral-400 font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-4 text-xs font-bold text-neutral-500 font-mono">
                        {row.student.admissionNumber || row.student.admissionNo || row.student.admNo || '---'}
                      </td>
                      <td className="p-4 text-xs font-black text-neutral-400 font-mono">
                        {row.rollNumber}
                      </td>
                      <td className="p-4 text-sm font-bold text-sidebar sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[150px]">
                        <div className="flex flex-col">
                          <span>{row.name}</span>
                          {row.isNonAttending && (
                            <span className="text-[8px] text-amber-600 font-black uppercase tracking-widest mt-0.5">Non-Attending</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-xs text-neutral-500 font-bold uppercase tracking-tight">
                        {row.student.fatherName || row.student.parentName || row.student.father_name || '---'}
                      </td>

                      {/* Dynamic Mark Cells */}
                      {isConsolidated ? (
                        scheduledExams.map((exam: any) => {
                          const total = row.examTotals[exam.id];
                          const examMax = subjects.length * getExamMaxMarks(exam.id);
                          const failedExam = total !== undefined && total < examMax * 0.35;
                          return (
                            <td key={exam.id} className={`p-4 text-center border-l border-neutral-100 font-mono font-extrabold text-xs ${failedExam ? 'text-red-500 bg-red-50/20' : 'text-neutral-600'}`}>
                              {total !== undefined ? total : '-'}
                            </td>
                          );
                        })
                      ) : (
                        subjects.map((subj: any) => {
                          const mark = row.subjectMarks[subj.id];
                          const maxMark = getExamMaxMarks(selectedExamId);
                          const isFailedSubj = mark !== null && mark < maxMark * 0.35;
                          return (
                            <td key={subj.id} className={`p-4 text-center border-l border-neutral-100 font-mono font-extrabold text-xs ${isFailedSubj ? 'text-red-500 bg-red-50/30 font-black' : 'text-neutral-600'}`}>
                              {mark !== null ? mark : '-'}
                            </td>
                          );
                        })
                      )}

                      {/* Summary statistics cells */}
                      <td className="p-4 text-center border-l border-neutral-200 font-mono font-black text-xs text-sidebar">
                        {row.grandTotal} <span className="text-[9px] text-neutral-400 font-normal">/ {row.maxPossibleMarks}</span>
                      </td>
                      <td className="p-4 text-center border-l border-neutral-100 font-mono font-extrabold text-xs text-neutral-600">
                        {row.percentage}%
                      </td>
                      <td className="p-4 text-center border-l border-neutral-100">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black font-mono border ${row.gradeColor}`}>
                          {row.grade}
                        </span>
                      </td>
                      <td className="p-4 text-center border-l border-neutral-200">
                        {row.isNonAttending ? (
                          <span className="text-[9px] bg-neutral-100 text-neutral-500 font-black px-2 py-0.5 rounded border border-neutral-200">N/A</span>
                        ) : row.isPass ? (
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 font-black px-2 py-0.5 rounded border border-emerald-200">PASS</span>
                        ) : (
                          <span className="text-[9px] bg-red-50 text-red-700 font-black px-2 py-0.5 rounded border border-red-200">FAIL/COMP</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}

              {/* Statistics Bottom Row */}
              {stats && processedData.length > 0 && (
                <>
                  {/* 1. Class Average Row */}
                  <tr className="bg-neutral-100/70 border-t-2 border-neutral-350 font-bold text-neutral-700 text-xs">
                    <td className="p-4 font-black text-[10px]" colSpan={5}>CLASS AVERAGE</td>
                    {isConsolidated ? (
                      scheduledExams.map((exam: any) => (
                        <td key={exam.id} className="p-4 text-center border-l border-neutral-200/50 font-mono font-extrabold text-primary">
                          {stats.examStats[exam.id]?.average || 0}
                        </td>
                      ))
                    ) : (
                      subjects.map((subj: any) => (
                        <td key={subj.id} className="p-4 text-center border-l border-neutral-200/50 font-mono font-extrabold text-primary">
                          {stats.subjectStats[subj.id]?.average || 0}
                        </td>
                      ))
                    )}
                    <td className="p-4 text-center border-l border-neutral-200 font-mono font-black" colSpan={4}>-</td>
                  </tr>

                  {/* 2. Highest Score Row */}
                  <tr className="bg-neutral-50/80 text-neutral-600 text-xs font-bold">
                    <td className="p-4 font-black text-[10px]" colSpan={5}>HIGHEST MARK</td>
                    {isConsolidated ? (
                      scheduledExams.map((exam: any) => (
                        <td key={exam.id} className="p-4 text-center border-l border-neutral-200/50 font-mono font-extrabold text-emerald-600">
                          {stats.examStats[exam.id]?.highest || 0}
                        </td>
                      ))
                    ) : (
                      subjects.map((subj: any) => (
                        <td key={subj.id} className="p-4 text-center border-l border-neutral-200/50 font-mono font-extrabold text-emerald-600">
                          {stats.subjectStats[subj.id]?.highest || 0}
                        </td>
                      ))
                    )}
                    <td className="p-4 text-center border-l border-neutral-200 font-mono" colSpan={4}>-</td>
                  </tr>

                  {/* 3. Pass Percentage Row */}
                  <tr className="bg-neutral-100/40 text-neutral-600 text-xs font-bold">
                    <td className="p-4 font-black text-[10px]" colSpan={5}>SUBJECT PASS RATE</td>
                    {isConsolidated ? (
                      scheduledExams.map((exam: any) => (
                        <td key={exam.id} className="p-4 text-center border-l border-neutral-200/50 font-mono font-extrabold text-indigo-600">
                          {stats.examStats[exam.id]?.passRate || 0}%
                        </td>
                      ))
                    ) : (
                      subjects.map((subj: any) => (
                        <td key={subj.id} className="p-4 text-center border-l border-neutral-200/50 font-mono font-extrabold text-indigo-600">
                          {stats.subjectStats[subj.id]?.passRate || 0}%
                        </td>
                      ))
                    )}
                    <td className="p-4 text-center border-l border-neutral-200 font-mono" colSpan={4}>-</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Abstract Class Summary Tab Component
const AbstractSummaryTab = ({ 
  students: passedStudents = [], 
  selectedClass: passedSelectedClass, 
  selectedBatch: passedSelectedBatch, 
  subjects: passedSubjects = [], 
  exams = [], 
  marks: passedMarks = [], 
  classes = [], 
  batches = [],
  examSchedules: passedExamSchedules = []
}: any) => {
  const { settings } = useSettings();
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedScope, setSelectedScope] = useState<string>('all'); // 'all' or batchId
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'analytics'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Real-time Firestore state
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allMarks, setAllMarks] = useState<any[]>([]);
  const [allSchedules, setAllSchedules] = useState<any[]>([]);
  const [masterSubjects, setMasterSubjects] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  const scheduledExams = useMemo(() => {
    return (exams || []).filter((e: any) => {
      const statusLower = e.status?.toLowerCase();
      return statusLower === 'published' || statusLower === 'scheduled' || statusLower === 'ongoing' || statusLower === 'completed';
    });
  }, [exams]);

  useEffect(() => {
    if (scheduledExams.length > 0 && !selectedExamId) {
      setSelectedExamId(scheduledExams[0].id);
    }
  }, [scheduledExams, selectedExamId]);

  // Set initial selectedScope if user selected a batch in top selector
  useEffect(() => {
    if (passedSelectedBatch && passedSelectedBatch !== 'all' && selectedScope === 'all') {
      // Keep 'all' as default or allow user to toggle
    }
  }, [passedSelectedBatch]);

  // Helper to establish logical academic class order (Nursery -> LKG -> UKG -> 1st -> 2nd -> ... -> 10th)
  const getClassRankOrder = (name: string): number => {
    const lower = (name || '').toLowerCase().trim();
    if (lower.includes('nursery') || lower.includes('nurs')) return 1;
    if (lower.includes('lkg') || lower.includes('l.k.g')) return 2;
    if (lower.includes('ukg') || lower.includes('u.k.g')) return 3;
    const numMatch = lower.match(/\b(\d+)\b/);
    if (numMatch) return 10 + parseInt(numMatch[1], 10);
    return 100;
  };

  const getBatchRankOrder = (name: string): number => {
    const lower = (name || '').toLowerCase().trim();
    if (lower.includes('ipl')) return 1;
    if (lower.includes('m-batch') || lower.includes('m batch') || lower.includes('m_batch')) return 2;
    if (lower.includes('s-batch') || lower.includes('s batch') || lower.includes('s_batch')) return 3;
    if (lower.includes('section a') || lower.includes('sec a') || lower.includes('a')) return 10;
    if (lower.includes('section b') || lower.includes('sec b') || lower.includes('b')) return 11;
    if (lower.includes('section c') || lower.includes('sec c') || lower.includes('c')) return 12;
    return 50;
  };

  // 1. Subscribe to ALL students in real-time
  useEffect(() => {
    const unsubStudents = dbService.subscribe('students', [], (data) => {
      setAllStudents(data || []);
      setLoadingData(false);
    });
    return () => {
      if (unsubStudents) unsubStudents();
    };
  }, []);

  // 2. Subscribe to ALL exam schedules in real-time
  useEffect(() => {
    const unsubSchedules = dbService.subscribe('examSchedules', [], (data) => {
      setAllSchedules(data || []);
    });
    return () => {
      if (unsubSchedules) unsubSchedules();
    };
  }, []);

  // 3. Subscribe to master subjects in real-time
  useEffect(() => {
    const unsubSubjects = dbService.subscribe('subjects', [], (data) => {
      setMasterSubjects(data || []);
    });
    return () => {
      if (unsubSubjects) unsubSubjects();
    };
  }, []);

  // 4. Subscribe to marks for selected exam in real-time (supporting various exam ID variants)
  useEffect(() => {
    if (!selectedExamId) {
      setAllMarks([]);
      return;
    }
    setLoadingData(true);
    
    // Subscribe to all exam marks for real-time aggregation across classes
    const unsubMarks = dbService.subscribe('examMarks', [], (data) => {
      setAllMarks(data || []);
      setLoadingData(false);
    });
    return () => {
      if (unsubMarks) unsubMarks();
    };
  }, [selectedExamId]);

  const activeExam = useMemo(() => {
    return exams.find((e: any) => e.id === selectedExamId) || scheduledExams[0];
  }, [exams, scheduledExams, selectedExamId]);

  const selectedExamName = activeExam?.title || 'EXAM';
  const isFA = activeExam?.type === 'FA' || !activeExam?.type;
  const isSA = activeExam?.type === 'SA';
  const activeExamMaxMarks = isSA ? 100 : 50;

  const resolvedSubjects = useMemo(() => {
    return (masterSubjects && masterSubjects.length > 0) ? masterSubjects : passedSubjects;
  }, [masterSubjects, passedSubjects]);

  const resolvedStudents = useMemo(() => {
    return (allStudents && allStudents.length > 0) ? allStudents : passedStudents;
  }, [allStudents, passedStudents]);

  const resolvedMarks = useMemo(() => {
    return (allMarks && allMarks.length > 0) ? allMarks : passedMarks;
  }, [allMarks, passedMarks]);

  const resolvedSchedules = useMemo(() => {
    return (allSchedules && allSchedules.length > 0) ? allSchedules : passedExamSchedules;
  }, [allSchedules, passedExamSchedules]);

  // Helper function to extract student mark for a subject accurately
  const getSubjectMarkValue = (studentId: string, subjId: string, subjName?: string) => {
    const targetExamIds = new Set<string>();
    if (selectedExamId) targetExamIds.add(String(selectedExamId));
    if (activeExam?.id) targetExamIds.add(String(activeExam.id));
    if (activeExam?.title) targetExamIds.add(String(activeExam.title));

    const m = resolvedMarks.find((mark: any) => {
      const stuMatch = mark.studentId === studentId || String(mark.studentId) === String(studentId);
      if (!stuMatch) return false;

      const subMatch = (subjId && mark.subjectId === subjId) ||
        (subjName && mark.subjectName && mark.subjectName.toLowerCase().trim() === subjName.toLowerCase().trim()) ||
        (subjName && mark.subjectId && subjName.toLowerCase().trim().includes(mark.subjectId.toLowerCase().trim()));
      if (!subMatch) return false;

      const examMatch = !mark.examId || targetExamIds.has(String(mark.examId)) ||
        (activeExam?.title && String(mark.examId).toLowerCase().includes(activeExam.title.toLowerCase()));

      return examMatch;
    });

    if (!m) return null;

    if (isFA) {
      const isAbsent = m.faWritten === 'Absent' || String(m.faWritten).toLowerCase() === 'ab' ||
        (m.st1 === 'Absent' && m.st2 === 'Absent' && (m.faWritten === undefined || m.faWritten === ''));
      
      const st1 = (m.st1 === 'Absent' || String(m.st1).toLowerCase() === 'ab') ? 0 : (parseFloat(m.st1) || 0);
      const st2 = (m.st2 === 'Absent' || String(m.st2).toLowerCase() === 'ab') ? 0 : (parseFloat(m.st2) || 0);
      const hw = (m.hw === 'Absent' || String(m.hw).toLowerCase() === 'ab') ? 0 : (parseFloat(m.hw) || 0);
      const faWritten = (m.faWritten === 'Absent' || String(m.faWritten).toLowerCase() === 'ab') ? 0 : (parseFloat(m.faWritten) || 0);
      
      const total = st1 + st2 + hw + faWritten;
      return { total, isAbsent, max: 50, raw: m };
    } else {
      const isAbsent = m.saWritten === 'Absent' || String(m.saWritten).toLowerCase() === 'ab';
      const saWritten = isAbsent ? 0 : (parseFloat(m.saWritten) || 0);
      const isScienceSplit = subjName && (
        subjName.toLowerCase().includes('physics') ||
        subjName.toLowerCase().includes('biology') ||
        subjName.toLowerCase().includes('botany') ||
        subjName.toLowerCase().includes('zoology')
      );
      const maxMarks = isScienceSplit ? 40 : 100;
      return { total: saWritten, isAbsent, max: maxMarks, raw: m };
    }
  };

  // Compile real-time abstract data for a specific class & batch strictly for scheduled subjects
  const computeBatchAbstract = (cls: any, batch: any, activeExamSchedulesList?: any[]) => {
    const className = cls?.name || 'Class';
    const batchName = batch?.name || 'Section';
    const classId = cls?.id;
    const batchId = batch?.id;

    // Filter students belonging to this class & batch with standard resolution
    const batchStudents = resolvedStudents.filter((s: any) => {
      if (!s) return false;
      const sStatus = s.status || 'active';
      if (sStatus !== 'active') return false;

      const resolved = resolveStudentClassAndBatch(s, classes, batches);
      const classMatch = 
        resolved.classId === cls.id || 
        resolved.className.toLowerCase().trim() === className.toLowerCase().trim();
      if (!classMatch) return false;

      if (batch.id !== 'Main' && batch.id !== cls.id) {
        const batchMatch = 
          resolved.batchId === batch.id || 
          resolved.batchName.toLowerCase().trim() === batchName.toLowerCase().trim();
        if (!batchMatch) return false;
      }

      return true;
    });

    const targetExamId = String(selectedExamId || '').trim();
    const targetExamTitle = String(selectedExamName || activeExam?.title || '').toLowerCase().trim();

    // Source of truth for schedules: activeExamSchedulesList or resolvedSchedules
    const scheduleSource = activeExamSchedulesList || resolvedSchedules;

    // Determine scheduled subjects for this class/batch strictly from examSchedules
    const matchingSchedules = scheduleSource.filter((sch: any) => {
      if (!sch) return false;

      // 1. Exam matching
      const schExamId = String(sch.examId || '').trim();
      const schExamTitle = String(sch.examTitle || '').toLowerCase().trim();

      const matchesExam = 
        (targetExamId && schExamId === targetExamId) ||
        (activeExam?.id && schExamId === String(activeExam.id)) ||
        (targetExamTitle && schExamTitle === targetExamTitle) ||
        (targetExamTitle && schExamId.toLowerCase() === targetExamTitle) ||
        (targetExamTitle && schExamId.toLowerCase().includes(targetExamTitle)) ||
        (schExamTitle && targetExamId.toLowerCase().includes(schExamTitle));

      if (!matchesExam) return false;

      // 2. Class & Batch matching
      const targetBatchId = String(batchId || '').trim();
      const targetBatchName = String(batchName || '').toLowerCase().trim();
      const targetClassId = String(classId || '').trim();
      const targetClassName = String(className || '').toLowerCase().trim();

      const schBatchId = String(sch.batchId || '').trim();
      const schBatchName = String(sch.batchName || '').toLowerCase().trim();
      const schClassId = String(sch.classId || '').trim();
      const schClassName = String(sch.className || '').toLowerCase().trim();

      // Direct exact matches
      if (targetBatchId && schBatchId && targetBatchId === schBatchId) return true;
      if (targetBatchName && schBatchName && targetBatchName === schBatchName) return true;
      if (targetBatchName && schBatchId && targetBatchName === schBatchId.toLowerCase()) return true;

      // Normalized comparisons
      const normTargetBatchId = targetBatchId.toLowerCase().replace(/[-_\s]/g, '');
      const normTargetBatchName = targetBatchName.toLowerCase().replace(/[-_\s]/g, '');
      const normSchBatchId = schBatchId.toLowerCase().replace(/[-_\s]/g, '');
      const normSchBatchName = schBatchName.toLowerCase().replace(/[-_\s]/g, '');

      if (normTargetBatchId && normSchBatchId && normTargetBatchId === normSchBatchId) return true;
      if (normTargetBatchName && normSchBatchName && normTargetBatchName === normSchBatchName) return true;

      // Class + Batch combination (e.g. "1 Class_IPL" or "2 Class_M-Batch")
      const normClassBatch = `${targetClassName}${targetBatchName}`.replace(/[-_\s]/g, '');
      const normClassBatchId = `${targetClassId}${targetBatchId}`.replace(/[-_\s]/g, '');
      if (normClassBatch && normSchBatchId && (normSchBatchId === normClassBatch || normSchBatchId === `${targetClassName}_${targetBatchName}`.toLowerCase().replace(/[-_\s]/g, ''))) return true;
      if (normClassBatchId && normSchBatchId && normSchBatchId === normClassBatchId) return true;

      // If standalone/Main class
      if (batch.id === cls.id || batch.name === 'Main') {
        if (schClassId && targetClassId && schClassId === targetClassId) return true;
        if (schClassName && targetClassName && schClassName === targetClassName) return true;
        if (schBatchId && targetClassId && schBatchId === targetClassId) return true;
        if (schBatchId && targetClassName && schBatchId.toLowerCase() === targetClassName) return true;
      }

      return false;
    });

    // RULE: If this class/batch is NOT scheduled in exam schedules tab for this exam, DO NOT SHOW it
    if (matchingSchedules.length === 0) {
      return null;
    }

    // RULE: ONLY include subjects that are scheduled in matchingSchedules
    const scheduledSubjectMap = new Map<string, { id: string; name: string; code?: string }>();

    matchingSchedules.forEach((sch: any) => {
      const sId = String(sch.subjectId || '').trim();
      const sName = String(sch.subjectName || '').trim();

      const masterSub = resolvedSubjects.find((s: any) => 
        (sId && String(s.id) === sId) ||
        (sName && (s.name || '').toLowerCase().trim() === sName.toLowerCase()) ||
        (sName && s.name && s.name.toLowerCase().replace(/[-_\s]/g, '') === sName.toLowerCase().replace(/[-_\s]/g, ''))
      );

      const subjectKey = (masterSub?.id || sId || sName).toLowerCase();
      if (!scheduledSubjectMap.has(subjectKey)) {
        scheduledSubjectMap.set(subjectKey, {
          id: masterSub?.id || sId || `sched_${sName.replace(/\s+/g, '_')}`,
          name: masterSub?.name || sName || sId,
          code: masterSub?.code || (sName || sId).toUpperCase()
        });
      }
    });

    const displaySubjects = Array.from(scheduledSubjectMap.values()).sort(compareSubjectsStandard);

    if (displaySubjects.length === 0) {
      return null;
    }

    // Determine primary/high-school status exactly as ClassTeacherView
    const isPrimary = isPrimaryClass(className);
    const isClass10 = isClass10NameOrId(className);

    // Helper to evaluate a student's marks in a subject with 100% parity to Class Teacher View
    const getStudentSubjectInfo = (studentId: string, sObj: any, subj: any) => {
      const targetExamIds = new Set<string>();
      if (selectedExamId) targetExamIds.add(String(selectedExamId));
      if (activeExam?.id) targetExamIds.add(String(activeExam.id));
      if (activeExam?.title) targetExamIds.add(String(activeExam.title));

      const subjId = String(subj.id || '').trim();
      const subjName = String(subj.name || '').trim().toLowerCase();

      const m = resolvedMarks.find((mark: any) => {
        const stuMatch = mark.studentId === studentId || mark.studentId === sObj?.id || mark.studentId === sObj?.uid || String(mark.studentId) === String(studentId);
        if (!stuMatch) return false;

        const subMatch = 
          (subjId && String(mark.subjectId).trim() === subjId) ||
          (subjName && mark.subjectName && mark.subjectName.toLowerCase().trim() === subjName) ||
          (subjName && mark.subjectName && mark.subjectName.toLowerCase().replace(/[-_\s]/g, '') === subjName.replace(/[-_\s]/g, '')) ||
          (subjId && mark.subjectId && String(mark.subjectId).toLowerCase().trim() === subjId.toLowerCase());
        if (!subMatch) return false;

        const examMatch = !mark.examId || targetExamIds.has(String(mark.examId)) ||
          (activeExam?.title && String(mark.examId).toLowerCase().includes(activeExam.title.toLowerCase()));

        return examMatch;
      });

      const isScienceSplit = subjName.includes('physics') || subjName.includes('biology') || subjName.includes('botany') || subjName.includes('zoology');
      const maxMarks = isFA ? 50 : (isScienceSplit ? 40 : 80);

      if (!m) {
        return { hasData: false, isAbsent: false, total: 0, maxMarks, isPass: true };
      }

      if (isFA) {
        const hasData = (m.st1 !== null && m.st1 !== undefined && m.st1 !== '') ||
                        (m.st2 !== null && m.st2 !== undefined && m.st2 !== '') ||
                        (m.hw !== null && m.hw !== undefined && m.hw !== '') ||
                        (m.faWritten !== null && m.faWritten !== undefined && m.faWritten !== '');

        if (!hasData) {
          return { hasData: false, isAbsent: false, total: 0, maxMarks: 50, isPass: true };
        }

        const faWrittenAbsent = isMarkAbsent(m.faWritten);
        const st1Absent = isMarkAbsent(m.st1);
        const st2Absent = isMarkAbsent(m.st2);
        const hwAbsent = isMarkAbsent(m.hw);

        const isAbsent = faWrittenAbsent;

        const st1Val = st1Absent ? 0 : (parseFloat(m.st1) || 0);
        const st2Val = st2Absent ? 0 : (parseFloat(m.st2) || 0);
        const hwVal = hwAbsent ? 0 : (parseFloat(m.hw) || 0);
        const internalVal = isPrimary ? (st1Val + st2Val + hwVal) : (st1Val + st2Val);
        const faVal = faWrittenAbsent ? 0 : (parseFloat(m.faWritten) || 0);

        const total = isClass10 ? faVal : (internalVal + faVal);
        const isPass = !isAbsent && (total >= 50 * 0.35);

        return { hasData: true, isAbsent, total, maxMarks: 50, isPass };
      } else {
        const hasData = m.saWritten !== null && m.saWritten !== undefined && m.saWritten !== '';
        if (!hasData) {
          return { hasData: false, isAbsent: false, total: 0, maxMarks, isPass: true };
        }

        const isAbsent = isMarkAbsent(m.saWritten);
        const total = isAbsent ? 0 : (parseFloat(m.saWritten) || 0);
        const isPass = !isAbsent && (total >= maxMarks * 0.35);

        return { hasData: true, isAbsent, total, maxMarks, isPass };
      }
    };

    let totalPassed = 0;
    let totalFailed = 0;
    let totalAbsent = 0;
    let totalMarksSum = 0;
    let maxPossibleSum = 0;
    let studentAppearedCount = 0;
    const studentPerformanceList: any[] = [];

    batchStudents.forEach((student: any) => {
      const studentId = student.id || student.uid;
      let studentGrandTotal = 0;
      let studentMaxMarks = 0;
      let hasFailedSubject = false;
      let isAnyAbsent = false;
      let allEmpty = true;

      displaySubjects.forEach((subj: any) => {
        const res = getStudentSubjectInfo(studentId, student, subj);
        if (res.hasData) {
          allEmpty = false;
          if (res.isAbsent) {
            isAnyAbsent = true;
          }
          studentGrandTotal += res.total;
          studentMaxMarks += res.maxMarks;

          // Pass threshold is 35% of max marks (only if not absent)
          if (!res.isAbsent && !res.isPass) {
            hasFailedSubject = true;
          }
        }
      });

      if (!allEmpty) {
        if (isAnyAbsent) {
          totalAbsent++;
          // Student was absent for one or more exams (treated as Absent in Class Teacher View, not Fail)
          studentPerformanceList.push({
            id: studentId,
            name: student.name || 'Student',
            rollNumber: student.rollNumber || student.rollNo || '-',
            total: studentGrandTotal,
            max: studentMaxMarks,
            percentage: 0,
            isPass: false,
            isAbsent: true
          });
        } else {
          studentAppearedCount++;
          totalMarksSum += studentGrandTotal;
          maxPossibleSum += studentMaxMarks;
          const percentage = studentMaxMarks > 0 ? Math.round((studentGrandTotal / studentMaxMarks) * 100) : 0;
          const isPass = !hasFailedSubject;

          if (isPass) {
            totalPassed++;
          } else {
            totalFailed++;
          }

          studentPerformanceList.push({
            id: studentId,
            name: student.name || 'Student',
            rollNumber: student.rollNumber || student.rollNo || '-',
            total: studentGrandTotal,
            max: studentMaxMarks,
            percentage,
            isPass,
            isAbsent: false
          });
        }
      }
    });

    // Calculate subject-wise failures accurately for scheduled subjects ONLY (excluding absent students)
    const subjectFailures: any[] = displaySubjects.map((subj: any) => {
      let failCount = 0;
      let appearedCount = 0;
      let sumMarks = 0;

      batchStudents.forEach((student: any) => {
        const studentId = student.id || student.uid;
        const res = getStudentSubjectInfo(studentId, student, subj);
        if (res.hasData && !res.isAbsent) {
          appearedCount++;
          sumMarks += res.total;
          if (!res.isPass) {
            failCount++;
          }
        }
      });

      const passCount = Math.max(0, appearedCount - failCount);
      const passRate = appearedCount > 0 ? Math.round((passCount / appearedCount) * 100) : 0;
      const avgMark = appearedCount > 0 ? parseFloat((sumMarks / appearedCount).toFixed(1)) : 0;
      const subjMax = isFA ? 50 : (subj.name?.toLowerCase().includes('physics') || subj.name?.toLowerCase().includes('biology') ? 40 : 80);

      return {
        id: subj.id,
        name: subj.name,
        code: subj.code || subj.name,
        failCount,
        appearedCount,
        passCount,
        passRate,
        avgMark,
        maxMark: subjMax
      };
    });

    // Sort toppers: Students who passed ALL scheduled subjects first, ranked by total marks
    const passedStudentsList = studentPerformanceList.filter((s: any) => s.isPass && !s.isAbsent);
    const sortedPassedToppers = [...passedStudentsList].sort((a, b) => b.total - a.total || b.percentage - a.percentage);
    const sortedAllScorers = [...studentPerformanceList].filter((s: any) => !s.isAbsent).sort((a, b) => b.total - a.total || b.percentage - a.percentage);

    // Prefer passed students for toppers; fallback to highest total marks if no one passed all
    const topPerformer1 = sortedPassedToppers[0] || sortedAllScorers[0] || null;
    const topPerformer2 = sortedPassedToppers[1] || (sortedPassedToppers.length === 0 ? sortedAllScorers[1] : null) || null;

    const noOnRoll = batchStudents.length;
    const noAppeared = studentAppearedCount;
    const noPassed = totalPassed;
    const noFailed = totalFailed;
    const passPercentage = noAppeared > 0 ? Math.round((noPassed / noAppeared) * 100) : 0;
    const exactPassPercentage = noAppeared > 0 ? parseFloat(((noPassed / noAppeared) * 100).toFixed(1)) : 0;
    const classAveragePct = maxPossibleSum > 0 ? parseFloat(((totalMarksSum / maxPossibleSum) * 100).toFixed(1)) : 0;

    return {
      classId,
      batchId,
      className,
      batchName,
      fullName: `${className} - ${batchName}`,
      isScheduled: true,
      hasMarks: studentAppearedCount > 0,
      isScheduledOrActive: true,
      noOnRoll,
      noAppeared,
      noPassed,
      noFailed,
      noAbsent: totalAbsent,
      passPercentage,
      exactPassPercentage,
      classAveragePct,
      subjectFailures,
      topPerformer1,
      topPerformer2,
      topPerformers: sortedPassedToppers.slice(0, 5),
      displaySubjects,
      studentsList: batchStudents
    };
  };

  // Compile all classes and batches abstract list sorted systematically (Scheduled ONLY)
  const allAbstractSummaries = useMemo(() => {
    const list: any[] = [];
    const targetExamId = String(selectedExamId || '').trim();
    const targetExamTitle = String(selectedExamName || activeExam?.title || '').toLowerCase().trim();

    // 1. Find all schedules matching the active/selected exam
    const activeExamSchedules = resolvedSchedules.filter((sch: any) => {
      if (!sch) return false;
      const schExamId = String(sch.examId || '').trim();
      const schExamTitle = String(sch.examTitle || '').toLowerCase().trim();

      return (
        (targetExamId && schExamId === targetExamId) ||
        (activeExam?.id && schExamId === String(activeExam.id)) ||
        (targetExamTitle && schExamTitle === targetExamTitle) ||
        (targetExamTitle && schExamId.toLowerCase() === targetExamTitle) ||
        (targetExamTitle && schExamId.toLowerCase().includes(targetExamTitle)) ||
        (schExamTitle && targetExamId.toLowerCase().includes(schExamTitle))
      );
    });

    if (activeExamSchedules.length === 0) {
      return [];
    }

    // 2. Identify unique batches/classes that are actually scheduled in activeExamSchedules
    const scheduledBatchMap = new Map<string, { batchId: string; classId?: string; className?: string; batchName?: string; schedules: any[] }>();

    activeExamSchedules.forEach((sch: any) => {
      const bId = String(sch.batchId || sch.classId || '').trim();
      if (!bId) return;

      if (!scheduledBatchMap.has(bId)) {
        scheduledBatchMap.set(bId, {
          batchId: bId,
          classId: sch.classId,
          className: sch.className,
          batchName: sch.batchName,
          schedules: []
        });
      }
      scheduledBatchMap.get(bId)!.schedules.push(sch);
    });

    const sortedClasses = [...classes].sort((a, b) => {
      const rankA = getClassRankOrder(a.name);
      const rankB = getClassRankOrder(b.name);
      if (rankA !== rankB) return rankA - rankB;
      return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name);
    });

    const sortedBatches = [...batches].sort((a, b) => {
      const rankA = getBatchRankOrder(a.name);
      const rankB = getBatchRankOrder(b.name);
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    });

    const processedSummaryKeys = new Set<string>();

    sortedClasses.forEach((cls: any) => {
      const clsBatches = sortedBatches.filter((b: any) => 
        b.classId === cls.id || 
        b.classId === cls.name || 
        (b.className && b.className === cls.name) ||
        (b.id && b.id.toLowerCase().includes(cls.name.toLowerCase().replace(/\s+/g, '_')))
      );

      if (clsBatches.length > 0) {
        clsBatches.forEach((batch: any) => {
          // Check if this batch is scheduled in activeExamSchedules
          const isScheduled = Array.from(scheduledBatchMap.keys()).some(schBId => {
            const normSch = schBId.toLowerCase().replace(/[-_\s]/g, '');
            const normBatchId = String(batch.id || '').toLowerCase().replace(/[-_\s]/g, '');
            const normBatchName = String(batch.name || '').toLowerCase().replace(/[-_\s]/g, '');
            const normClassBatch = `${cls.name}${batch.name}`.toLowerCase().replace(/[-_\s]/g, '');
            const normClassBatchId = `${cls.id}${batch.id}`.toLowerCase().replace(/[-_\s]/g, '');

            return (
              schBId === batch.id ||
              schBId === batch.name ||
              (normBatchId && normSch === normBatchId) ||
              (normClassBatch && (normSch === normClassBatch || normSch.includes(normClassBatch) || normClassBatch.includes(normSch))) ||
              (normClassBatchId && (normSch === normClassBatchId || normSch.includes(normClassBatchId))) ||
              (normBatchName && normSch.includes(normBatchName) && normSch.includes(cls.name.toLowerCase().replace(/[-_\s]/g, '')))
            );
          });

          if (isScheduled) {
            const summary = computeBatchAbstract(cls, batch, activeExamSchedules);
            if (summary && !processedSummaryKeys.has(`${summary.classId}_${summary.batchId}`)) {
              list.push(summary);
              processedSummaryKeys.add(`${summary.classId}_${summary.batchId}`);
              processedSummaryKeys.add(summary.fullName.toLowerCase().replace(/[-_\s]/g, ''));
            }
          }
        });
      } else {
        // Standalone class
        const isScheduled = Array.from(scheduledBatchMap.keys()).some(schBId => {
          const normSch = schBId.toLowerCase().replace(/[-_\s]/g, '');
          const normClassId = String(cls.id || '').toLowerCase().replace(/[-_\s]/g, '');
          const normClassName = String(cls.name || '').toLowerCase().replace(/[-_\s]/g, '');
          return schBId === cls.id || schBId === cls.name || normSch === normClassId || normSch === normClassName;
        });

        if (isScheduled) {
          const summary = computeBatchAbstract(cls, { id: cls.id, name: 'Main' }, activeExamSchedules);
          if (summary && !processedSummaryKeys.has(`${summary.classId}_${summary.batchId}`)) {
            list.push(summary);
            processedSummaryKeys.add(`${summary.classId}_${summary.batchId}`);
            processedSummaryKeys.add(summary.fullName.toLowerCase().replace(/[-_\s]/g, ''));
          }
        }
      }
    });

    // Also process any scheduled batches from activeExamSchedules that didn't match the pre-existing classes/batches list
    scheduledBatchMap.forEach((info, schBId) => {
      const normSch = schBId.toLowerCase().replace(/[-_\s]/g, '');
      const alreadyProcessed = Array.from(processedSummaryKeys).some(k => k.toLowerCase().replace(/[-_\s]/g, '').includes(normSch) || normSch.includes(k.toLowerCase().replace(/[-_\s]/g, '')));

      if (!alreadyProcessed) {
        const matchedCls = classes.find((c: any) => c.id === info.classId || c.name === info.className || schBId.toLowerCase().includes(c.name.toLowerCase())) || { id: info.classId || schBId, name: info.className || schBId.split('_')[0] || 'Class' };
        const matchedBatch = batches.find((b: any) => b.id === schBId || b.name === info.batchName) || { id: schBId, name: info.batchName || schBId.split('_')[1] || 'Section' };

        const summary = computeBatchAbstract(matchedCls, matchedBatch, activeExamSchedules);
        if (summary && !processedSummaryKeys.has(`${summary.classId}_${summary.batchId}`)) {
          list.push(summary);
          processedSummaryKeys.add(`${summary.classId}_${summary.batchId}`);
          processedSummaryKeys.add(summary.fullName.toLowerCase().replace(/[-_\s]/g, ''));
        }
      }
    });

    return list;
  }, [classes, batches, resolvedStudents, resolvedMarks, resolvedSchedules, resolvedSubjects, selectedExamId, selectedExamName, activeExamMaxMarks]);

  // Reset or adjust selectedScope if current scope is not in allAbstractSummaries
  useEffect(() => {
    if (selectedScope !== 'all') {
      const exists = allAbstractSummaries.some((s: any) => s.batchId === selectedScope || s.classId === selectedScope);
      if (!exists) {
        setSelectedScope('all');
      }
    }
  }, [allAbstractSummaries, selectedScope]);

  // Overall School-Wide Statistics
  const schoolStats = useMemo(() => {
    let totalRoll = 0;
    let totalAppeared = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    allAbstractSummaries.forEach((s: any) => {
      totalRoll += s.noOnRoll;
      totalAppeared += s.noAppeared;
      totalPassed += s.noPassed;
      totalFailed += s.noFailed;
    });

    const schoolPassPercentage = totalAppeared > 0 ? parseFloat(((totalPassed / totalAppeared) * 100).toFixed(1)) : 0;

    return {
      totalClasses: allAbstractSummaries.length,
      totalRoll,
      totalAppeared,
      totalPassed,
      totalFailed,
      schoolPassPercentage
    };
  }, [allAbstractSummaries]);

  // Filter summaries based on search and scope
  const filteredSummaries = useMemo(() => {
    return allAbstractSummaries.filter((s: any) => {
      if (selectedScope !== 'all' && s.batchId !== selectedScope && s.classId !== selectedScope) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return s.fullName.toLowerCase().includes(q) || s.className.toLowerCase().includes(q) || s.batchName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allAbstractSummaries, selectedScope, searchQuery]);

  // Currently focused single abstract (when single batch is selected)
  const singleActiveAbstract = useMemo(() => {
    if (selectedScope === 'all') {
      return filteredSummaries[0] || allAbstractSummaries[0] || null;
    }
    return allAbstractSummaries.find((s: any) => s.batchId === selectedScope || s.classId === selectedScope) || filteredSummaries[0] || null;
  }, [allAbstractSummaries, selectedScope, filteredSummaries]);

  // ==================== EXPORT HANDLERS ====================

  // Helper function to draw a single batch abstract card in PDF (Card Width: 268pt, Height: 368pt)
  const drawBatchAbstractCardPDF = (doc: any, cs: any, x: number, y: number, cardWidth: number, cardHeight: number, examTitle: string) => {
    // 1. Outer Border
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1.2);
    doc.rect(x, y, cardWidth, cardHeight, 'D');

    // 2. Yellow Title Header (Height: 22pt)
    const headerH = 22;
    doc.setFillColor(255, 255, 0); // Yellow
    doc.rect(x, y, cardWidth, headerH, 'F');
    doc.rect(x, y, cardWidth, headerH, 'D');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`${(examTitle || 'EXAM').toUpperCase()} ABSTRACT`, x + (cardWidth / 2), y + 15, { align: 'center' });

    // 3. Blue Sub-Header Row (Height: 20pt)
    const subHeaderH = 20;
    const subHeaderY = y + headerH;
    doc.setFillColor(189, 215, 238); // Soft Blue #BDD7EE
    doc.rect(x, subHeaderY, cardWidth, subHeaderH, 'F');
    doc.rect(x, subHeaderY, cardWidth, subHeaderH, 'D');

    const colSnoW = 24;
    const colLeftW = 126; // up to x + 150
    const colRightW = cardWidth - (colSnoW + colLeftW); // 268 - 150 = 118

    // Dividers
    doc.line(x + colSnoW, subHeaderY, x + colSnoW, subHeaderY + subHeaderH);
    doc.line(x + colSnoW + colLeftW, subHeaderY, x + colSnoW + colLeftW, subHeaderY + subHeaderH);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("Sno", x + (colSnoW / 2), subHeaderY + 13.5, { align: 'center' });
    
    // Class & Batch Name (truncated/scaled if long)
    const classBatchTitle = `Class & Batch : ${cs.fullName || `${cs.className} - ${cs.batchName}`}`;
    doc.text(doc.splitTextToSize(classBatchTitle, colLeftW - 6)[0] || classBatchTitle, x + colSnoW + 4, subHeaderY + 13.5);
    
    doc.text("Subject wise Failure", x + colSnoW + colLeftW + (colRightW / 2), subHeaderY + 13.5, { align: 'center' });

    // 4. Data Rows (7 rows, height: 20pt each -> total: 140pt)
    const rowH = 20;
    const dataStartY = subHeaderY + subHeaderH;
    const totalRows = 7;
    const metricLabelW = 82;
    const metricValW = 44;
    const subjNameW = 74;
    const subjFailW = 44;

    for (let i = 0; i < totalRows; i++) {
      const rowY = dataStartY + (i * rowH);

      // Cream background for row
      doc.setFillColor(255, 242, 204); // #FFF2CC
      doc.rect(x, rowY, cardWidth, rowH, 'F');
      doc.rect(x, rowY, cardWidth, rowH, 'D');

      // Vertical lines
      doc.line(x + colSnoW, rowY, x + colSnoW, rowY + rowH);
      doc.line(x + colSnoW + metricLabelW, rowY, x + colSnoW + metricLabelW, rowY + rowH);
      doc.line(x + colSnoW + colLeftW, rowY, x + colSnoW + colLeftW, rowY + rowH);
      doc.line(x + colSnoW + colLeftW + subjNameW, rowY, x + colSnoW + colLeftW + subjNameW, rowY + rowH);

      // SNo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text(String(i + 1), x + (colSnoW / 2), rowY + 13.5, { align: 'center' });

      // Metric Label & Value
      let leftLabel = "";
      let leftVal = "";
      if (i === 0) { leftLabel = "No. On Roll"; leftVal = String(cs.noOnRoll ?? 0); }
      else if (i === 1) { leftLabel = "No. Appeared"; leftVal = String(cs.noAppeared ?? 0); }
      else if (i === 2) { leftLabel = "No. Passed"; leftVal = String(cs.noPassed ?? 0); }
      else if (i === 3) { leftLabel = "Passed Percentage"; leftVal = cs.noAppeared > 0 ? `${cs.passPercentage}%` : "0%"; }
      else if (i === 4) { leftLabel = "No. Failed"; leftVal = String(cs.noFailed ?? 0); }

      if (leftLabel) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text(leftLabel, x + colSnoW + 4, rowY + 13.5);

        // White cell for value
        doc.setFillColor(255, 255, 255);
        doc.rect(x + colSnoW + metricLabelW, rowY, metricValW, rowH, 'F');
        doc.rect(x + colSnoW + metricLabelW, rowY, metricValW, rowH, 'D');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(leftVal, x + colSnoW + metricLabelW + (metricValW / 2), rowY + 13.5, { align: 'center' });
      }

      // Subject Name & Failure Count
      const sub = cs.subjectFailures ? cs.subjectFailures[i] : null;
      if (sub) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        const subNameTrim = (sub.name || '').trim();
        const shortSubName = subNameTrim.length > 14 ? `${subNameTrim.slice(0, 13)}.` : subNameTrim;
        doc.text(shortSubName, x + colSnoW + colLeftW + 4, rowY + 13.5);

        // White cell for failure count
        doc.setFillColor(255, 255, 255);
        doc.rect(x + colSnoW + colLeftW + subjNameW, rowY, subjFailW, rowH, 'F');
        doc.rect(x + colSnoW + colLeftW + subjNameW, rowY, subjFailW, rowH, 'D');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        if (sub.failCount > 0) {
          doc.setTextColor(200, 0, 0); // Red for failures
        } else {
          doc.setTextColor(0, 0, 0);
        }
        doc.text(String(sub.failCount ?? 0), x + colSnoW + colLeftW + subjNameW + (subjFailW / 2), rowY + 13.5, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(x + colSnoW + colLeftW + subjNameW, rowY, subjFailW, rowH, 'F');
        doc.rect(x + colSnoW + colLeftW + subjNameW, rowY, subjFailW, rowH, 'D');
      }
    }

    // 5. Class First Block (Height: 93pt)
    const blockFirstY = dataStartY + (totalRows * rowH);
    const blockH = 93;
    const blockSubH = 31;

    // Left Block (#F2DCDB)
    doc.setFillColor(242, 220, 219); // #F2DCDB
    doc.rect(x, blockFirstY, colSnoW + colLeftW, blockH, 'F');
    doc.rect(x, blockFirstY, colSnoW + colLeftW, blockH, 'D');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("CLASS FIRST", x + ((colSnoW + colLeftW) / 2), blockFirstY + 38, { align: 'center' });
    doc.setFontSize(8);
    doc.text("TOTAL :", x + ((colSnoW + colLeftW) / 2), blockFirstY + 56, { align: 'center' });

    // Right 3 Sub-Rows (White cells)
    for (let j = 0; j < 3; j++) {
      const subRowY = blockFirstY + (j * blockSubH);
      doc.setFillColor(255, 255, 255);
      doc.rect(x + colSnoW + colLeftW, subRowY, subjNameW, blockSubH, 'F');
      doc.rect(x + colSnoW + colLeftW, subRowY, subjNameW, blockSubH, 'D');
      doc.rect(x + colSnoW + colLeftW + subjNameW, subRowY, subjFailW, blockSubH, 'F');
      doc.rect(x + colSnoW + colLeftW + subjNameW, subRowY, subjFailW, blockSubH, 'D');

      if (j === 0 && cs.topPerformer1) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        const nameLines = doc.splitTextToSize(cs.topPerformer1.name || '', subjNameW - 6);
        doc.text(nameLines.slice(0, 2), x + colSnoW + colLeftW + 3, subRowY + 13);

        doc.setFontSize(8.5);
        doc.text(String(cs.topPerformer1.total || ''), x + colSnoW + colLeftW + subjNameW + (subjFailW / 2), subRowY + 18, { align: 'center' });
      }
    }

    // 6. Class Second Block (Height: 93pt)
    const blockSecY = blockFirstY + blockH;

    // Left Block (#F2DCDB)
    doc.setFillColor(242, 220, 219);
    doc.rect(x, blockSecY, colSnoW + colLeftW, blockH, 'F');
    doc.rect(x, blockSecY, colSnoW + colLeftW, blockH, 'D');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("CLASS SECOND", x + ((colSnoW + colLeftW) / 2), blockSecY + 38, { align: 'center' });
    doc.setFontSize(8);
    doc.text("TOTAL :", x + ((colSnoW + colLeftW) / 2), blockSecY + 56, { align: 'center' });

    // Right 3 Sub-Rows
    for (let j = 0; j < 3; j++) {
      const subRowY = blockSecY + (j * blockSubH);
      doc.setFillColor(255, 255, 255);
      doc.rect(x + colSnoW + colLeftW, subRowY, subjNameW, blockSubH, 'F');
      doc.rect(x + colSnoW + colLeftW, subRowY, subjNameW, blockSubH, 'D');
      doc.rect(x + colSnoW + colLeftW + subjNameW, subRowY, subjFailW, blockSubH, 'F');
      doc.rect(x + colSnoW + colLeftW + subjNameW, subRowY, subjFailW, blockSubH, 'D');

      if (j === 0 && cs.topPerformer2) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        const nameLines = doc.splitTextToSize(cs.topPerformer2.name || '', subjNameW - 6);
        doc.text(nameLines.slice(0, 2), x + colSnoW + colLeftW + 3, subRowY + 13);

        doc.setFontSize(8.5);
        doc.text(String(cs.topPerformer2.total || ''), x + colSnoW + colLeftW + subjNameW + (subjFailW / 2), subRowY + 18, { align: 'center' });
      }
    }
  };

  // 1. Export ALL Classes & Batches PDF (4 Batches Abstract Per A4 Page)
  const handleExportAllClassesPDF = (direct4in1Only: boolean = false) => {
    if (allAbstractSummaries.length === 0) {
      toast.error("No class abstract data available for export");
      return;
    }

    const toastId = toast.loading("Generating All Batches Abstract PDF (4 per A4 page)...");

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Chunk allAbstractSummaries into groups of 4
      const batchChunks: any[][] = [];
      for (let i = 0; i < allAbstractSummaries.length; i += 4) {
        batchChunks.push(allAbstractSummaries.slice(i, i + 4));
      }

      let startPageIndex = 1;

      // Optional Page 1: Consolidated Executive Summary
      if (!direct4in1Only) {
        doc.setFillColor(30, 41, 59); // Slate-800
        doc.rect(0, 0, pageWidth, 100, 'F');

        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text("ST. ANTONY'S HIGH SCHOOL", pageWidth / 2, 40, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`${selectedExamName.toUpperCase()} - CONSOLIDATED SCHOOL ABSTRACT REPORT`, pageWidth / 2, 65, { align: 'center' });
        doc.setFontSize(9);
        doc.text(`Academic Year: 2026-27 | Total Sections: ${schoolStats.totalClasses} | Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 85, { align: 'center' });

        // School Metric Summary Badges
        const summaryBadges = [
          ['Total On Roll', String(schoolStats.totalRoll)],
          ['Total Appeared', String(schoolStats.totalAppeared)],
          ['Total Passed', String(schoolStats.totalPassed)],
          ['Total Failed', String(schoolStats.totalFailed)],
          ['School Pass Rate', `${schoolStats.schoolPassPercentage}%`]
        ];

        autoTable(doc, {
          startY: 115,
          head: [['School Metric', 'Overall Count / Value']],
          body: summaryBadges,
          theme: 'grid',
          headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 9 },
          bodyStyles: { halign: 'center', fontSize: 9 },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: 200 }
          }
        });

        const finalYBadges = (doc as any).lastAutoTable.finalY || 200;

        // School Master Table
        const masterHeaders = [['SNo', 'Class & Section', 'On Roll', 'Appeared', 'Passed', 'Failed', 'Pass %', 'Class 1st Topper', 'Marks']];
        const masterRows = allAbstractSummaries.map((s, idx) => [
          idx + 1,
          s.fullName,
          s.noOnRoll,
          s.noAppeared,
          s.noPassed,
          s.noFailed,
          `${s.passPercentage}%`,
          s.topPerformer1 ? s.topPerformer1.name : '---',
          s.topPerformer1 ? `${s.topPerformer1.total}` : '---'
        ]);

        autoTable(doc, {
          startY: finalYBadges + 16,
          head: masterHeaders,
          body: masterRows,
          theme: 'striped',
          headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: 'center', fontSize: 8.5 },
          bodyStyles: { halign: 'center', fontSize: 8 },
          columnStyles: {
            1: { halign: 'left', fontStyle: 'bold' },
            7: { halign: 'left' }
          }
        });

        startPageIndex = 2;
      }

      // ================= INDIVIDUAL BATCH ABSTRACT LEDGERS (4 PER A4 PAGE) =================
      const cardWidth = 268;
      const cardHeight = 368;
      const col0X = 20;
      const col1X = 307;
      const row0Y = 44;
      const row1Y = 426;

      const totalPages = direct4in1Only ? batchChunks.length : batchChunks.length + 1;

      batchChunks.forEach((chunk, pIdx) => {
        if (!direct4in1Only || pIdx > 0) {
          doc.addPage();
        }

        const currentPageNum = direct4in1Only ? pIdx + 1 : pIdx + 2;

        // Top Page Title Header
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(`ST. ANTONY'S HIGH SCHOOL - ${selectedExamName.toUpperCase()} BATCH ABSTRACT SUMMARY`, pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`ACADEMIC YEAR: 2026-27 | 4-IN-1 SECTION LEDGER | PAGE ${currentPageNum} OF ${totalPages}`, pageWidth / 2, 32, { align: 'center' });

        // Draw up to 4 cards in a 2x2 grid
        chunk.forEach((cs, cIdx) => {
          const col = cIdx % 2; // 0: left, 1: right
          const row = Math.floor(cIdx / 2); // 0: top, 1: bottom

          const cardX = col === 0 ? col0X : col1X;
          const cardY = row === 0 ? row0Y : row1Y;

          drawBatchAbstractCardPDF(doc, cs, cardX, cardY, cardWidth, cardHeight, selectedExamName);
        });

        // Bottom Signature Strip
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 80, 80);
        doc.text("CLASS TEACHER SIGNATURE", 50, 818);
        doc.text("EXAMINATION INCHARGE", pageWidth / 2, 818, { align: 'center' });
        doc.text("PRINCIPAL / HM SIGNATURE", pageWidth - 50, 818, { align: 'right' });
      });

      doc.save(`all_batches_abstract_summary_${selectedExamName.replace(/\s+/g, '_')}.pdf`);
      toast.success("School-wide 4-in-1 Batches Abstract PDF exported successfully!", { id: toastId });
    } catch (error: any) {
      console.error("Export all classes PDF error:", error);
      toast.error(`Failed to export PDF: ${error.message || error}`, { id: toastId });
    }
  };

  // 2. Export ALL Classes & Batches Excel / CSV
  const handleExportAllClassesExcel = () => {
    if (allAbstractSummaries.length === 0) {
      toast.error("No class abstract data to export");
      return;
    }

    try {
      // Create master workbook
      const wb = XLSX.utils.book_new();

      // Master Summary Sheet
      const masterRows = allAbstractSummaries.map((s, idx) => {
        const row: any = {
          'SNo': idx + 1,
          'Class & Section': s.fullName,
          'No. On Roll': s.noOnRoll,
          'No. Appeared': s.noAppeared,
          'No. Passed': s.noPassed,
          'No. Failed': s.noFailed,
          'Passed Percentage %': `${s.passPercentage}%`,
          'Class Average %': `${s.classAveragePct}%`,
          'Class 1st Topper Name': s.topPerformer1 ? s.topPerformer1.name : '---',
          'Class 1st Total Marks': s.topPerformer1 ? s.topPerformer1.total : '---',
          'Class 1st Percentage %': s.topPerformer1 ? `${s.topPerformer1.percentage}%` : '---',
          'Class 2nd Topper Name': s.topPerformer2 ? s.topPerformer2.name : '---',
          'Class 2nd Total Marks': s.topPerformer2 ? s.topPerformer2.total : '---',
          'Class 2nd Percentage %': s.topPerformer2 ? `${s.topPerformer2.percentage}%` : '---'
        };

        // Add Subject failure counts as columns
        s.subjectFailures.forEach((sub: any) => {
          row[`Failures in ${sub.name}`] = sub.failCount;
        });

        return row;
      });

      const wsMaster = XLSX.utils.json_to_sheet(masterRows);
      XLSX.utils.book_append_sheet(wb, wsMaster, "Consolidated Summary");

      // Write file
      XLSX.writeFile(wb, `all_classes_abstract_${selectedExamName.replace(/\s+/g, '_')}.xlsx`);
      toast.success("All Classes Abstract Excel exported successfully!");
    } catch (err: any) {
      console.error("Export Excel error:", err);
      toast.error("Failed to export Excel spreadsheet");
    }
  };

  // 3. Export Single Class Abstract PDF
  const handleExportSingleAbstractPDF = (targetSummary?: any) => {
    const cs = targetSummary || singleActiveAbstract;
    if (!cs) {
      toast.error("No class abstract data available for export");
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);
      let currentY = 50;

      // Yellow Title Banner
      doc.setFillColor(255, 255, 0); // Yellow
      doc.rect(margin, currentY, contentWidth, 35, 'F');
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.5);
      doc.rect(margin, currentY, contentWidth, 35, 'D');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(`${selectedExamName.toUpperCase()} ABSTRACT`, pageWidth / 2, currentY + 23, { align: 'center' });

      currentY += 35;

      // Sub-header Row (Soft Blue)
      doc.setFillColor(189, 215, 238); // #BDD7EE
      doc.rect(margin, currentY, contentWidth, 30, 'F');
      doc.rect(margin, currentY, contentWidth, 30, 'D');

      doc.setFontSize(10);
      doc.text("Sno", margin + 15, currentY + 19, { align: 'center' });
      doc.text(`Class & Batch : ${cs.fullName}`, margin + 40, currentY + 19);
      doc.text("Subject wise Failure", margin + 300, currentY + 19);

      currentY += 30;

      // Data Rows
      const rowHeight = 22;
      const totalRows = Math.max(7, cs.subjectFailures.length);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      for (let i = 0; i < totalRows; i++) {
        doc.setFillColor(255, 242, 204); // #FFF2CC
        doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
        doc.rect(margin, currentY, contentWidth, rowHeight, 'D');

        doc.line(margin + 30, currentY, margin + 30, currentY + rowHeight);
        doc.line(margin + 170, currentY, margin + 170, currentY + rowHeight);
        doc.line(margin + 230, currentY, margin + 230, currentY + rowHeight);
        doc.line(margin + 370, currentY, margin + 370, currentY + rowHeight);

        doc.text(String(i + 1), margin + 15, currentY + 15, { align: 'center' });

        let leftLabel = "";
        let leftValue = "";
        if (i === 0) { leftLabel = "No. On Roll"; leftValue = String(cs.noOnRoll); }
        else if (i === 1) { leftLabel = "No. Appeared"; leftValue = String(cs.noAppeared); }
        else if (i === 2) { leftLabel = "No. Passed"; leftValue = String(cs.noPassed); }
        else if (i === 3) { leftLabel = "Passed Percentage"; leftValue = `${cs.passPercentage}`; }

        if (leftLabel) {
          doc.setFont("helvetica", "bold");
          doc.text(leftLabel, margin + 40, currentY + 15);
          doc.setFont("helvetica", "normal");

          doc.setFillColor(255, 255, 255);
          doc.rect(margin + 170, currentY, 60, rowHeight, 'F');
          doc.rect(margin + 170, currentY, 60, rowHeight, 'D');
          doc.setFont("helvetica", "bold");
          doc.text(leftValue, margin + 200, currentY + 15, { align: 'center' });
          doc.setFont("helvetica", "normal");
        }

        const sub = cs.subjectFailures[i];
        if (sub) {
          doc.setFont("helvetica", "bold");
          doc.text(sub.name, margin + 240, currentY + 15);
          doc.setFont("helvetica", "normal");

          doc.setFillColor(255, 255, 255);
          doc.rect(margin + 370, currentY, contentWidth - 370, rowHeight, 'F');
          doc.rect(margin + 370, currentY, contentWidth - 370, rowHeight, 'D');
          doc.setFont("helvetica", "bold");
          doc.text(String(sub.failCount), margin + 410, currentY + 15, { align: 'center' });
          doc.setFont("helvetica", "normal");
        }

        currentY += rowHeight;
      }

      // Class First Block
      const blockHeight = rowHeight * 3;
      doc.setFillColor(242, 220, 219); // #F2DCDB
      doc.rect(margin, currentY, 230, blockHeight, 'F');
      doc.rect(margin, currentY, 230, blockHeight, 'D');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Class First", margin + 115, currentY + (blockHeight / 2) - 2, { align: 'center' });
      doc.setFontSize(9);
      doc.text("Total :", margin + 115, currentY + (blockHeight / 2) + 12, { align: 'center' });

      for (let j = 0; j < 3; j++) {
        const rowY = currentY + (j * rowHeight);
        doc.setFillColor(255, 255, 255);
        doc.rect(margin + 230, rowY, 140, rowHeight, 'F');
        doc.rect(margin + 230, rowY, 140, rowHeight, 'D');
        doc.rect(margin + 370, rowY, contentWidth - 370, rowHeight, 'F');
        doc.rect(margin + 370, rowY, contentWidth - 370, rowHeight, 'D');

        if (j === 0 && cs.topPerformer1) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(cs.topPerformer1.name, margin + 240, rowY + 15);
          doc.text(String(cs.topPerformer1.total), margin + 410, rowY + 15, { align: 'center' });
        }
      }

      currentY += blockHeight;

      // Class Second Block
      doc.setFillColor(242, 220, 219); // #F2DCDB
      doc.rect(margin, currentY, 230, blockHeight, 'F');
      doc.rect(margin, currentY, 230, blockHeight, 'D');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Class Second", margin + 115, currentY + (blockHeight / 2) - 2, { align: 'center' });
      doc.setFontSize(9);
      doc.text("Total :", margin + 115, currentY + (blockHeight / 2) + 12, { align: 'center' });

      for (let j = 0; j < 3; j++) {
        const rowY = currentY + (j * rowHeight);
        doc.setFillColor(255, 255, 255);
        doc.rect(margin + 230, rowY, 140, rowHeight, 'F');
        doc.rect(margin + 230, rowY, 140, rowHeight, 'D');
        doc.rect(margin + 370, rowY, contentWidth - 370, rowHeight, 'F');
        doc.rect(margin + 370, rowY, contentWidth - 370, rowHeight, 'D');

        if (j === 0 && cs.topPerformer2) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(cs.topPerformer2.name, margin + 240, rowY + 15);
          doc.text(String(cs.topPerformer2.total), margin + 410, rowY + 15, { align: 'center' });
        }
      }

      doc.save(`abstract_summary_${cs.className}_${cs.batchName}_${selectedExamName.replace(/\s+/g, '_')}.pdf`);
      toast.success(`${cs.fullName} Abstract PDF exported successfully!`);
    } catch (err: any) {
      console.error("Export single PDF error:", err);
      toast.error("Failed to export PDF");
    }
  };

  // Render individual Excel Ledger Card
  const renderExcelLedgerCard = (cs: any) => {
    const totalRows = Math.max(7, cs.subjectFailures.length);

    return (
      <div key={`${cs.classId}_${cs.batchId}`} className="flex flex-col bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
        {/* Card Top Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-100/80 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-black text-sidebar uppercase tracking-tight">{cs.fullName}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-mono">
              {cs.passPercentage}% Pass
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleExportSingleAbstractPDF(cs)}
              title="Download PDF"
              className="p-1.5 bg-white hover:bg-neutral-50 text-neutral-700 hover:text-primary rounded-lg border border-neutral-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="text-[10px] hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>

        {/* Excel Ledger Sheet */}
        <div className="p-4 bg-neutral-50/50 overflow-x-auto">
          <table className="w-full min-w-[580px] border-collapse border-[2.5px] border-black text-xs font-sans bg-white text-black shadow-xs">
            <thead>
              {/* Row 1: Header Banner (Yellow) */}
              <tr>
                <th colSpan={5} className="bg-[#FFFF00] text-black font-black text-center py-2 text-xs sm:text-sm border-[2px] border-black tracking-widest uppercase">
                  {selectedExamName || 'FA-1'} ABSTRACT
                </th>
              </tr>
              {/* Row 2: Sub-headers (Light Blue) */}
              <tr className="bg-[#BDD7EE] text-black font-bold border-b-[2px] border-black text-center">
                <th className="p-1.5 border-[2px] border-black w-12 text-center text-[11px] font-black">Sno</th>
                <th colSpan={2} className="p-1.5 border-[2px] border-black text-left pl-3 text-[11px] font-black uppercase tracking-tight">
                  Class & Batch : <span className="font-extrabold text-blue-900 underline">{cs.fullName}</span>
                </th>
                <th colSpan={2} className="p-1.5 border-[2px] border-black text-left pl-3 text-[11px] font-black uppercase tracking-tight">
                  Subject wise Failure
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: totalRows }).map((_, i) => {
                let leftLabel = "";
                let leftValue: string | number = "";
                if (i === 0) { leftLabel = "No. On Roll"; leftValue = cs.noOnRoll; }
                else if (i === 1) { leftLabel = "No. Appeared"; leftValue = cs.noAppeared; }
                else if (i === 2) { leftLabel = "No. Passed"; leftValue = cs.noPassed; }
                else if (i === 3) { leftLabel = "Passed Percentage"; leftValue = cs.noAppeared > 0 ? `${cs.passPercentage}%` : "0%"; }
                else if (i === 4) { leftLabel = "No. Failed"; leftValue = cs.noFailed; }

                const sub = cs.subjectFailures[i];
                const rightSubName = sub ? sub.name : "";
                const rightFailCount = sub ? sub.failCount : "";

                return (
                  <tr key={i} className="bg-[#FFF2CC] border-b border-black font-bold text-neutral-800">
                    <td className="p-1.5 border-[1.5px] border-black text-center w-12 bg-[#FFF2CC] text-[11px]">{i + 1}</td>
                    <td className="p-1.5 border-[1.5px] border-black text-left pl-3 bg-[#FFF2CC] w-1/3 text-[11px]">{leftLabel}</td>
                    <td className="p-1.5 border-[1.5px] border-black text-center w-20 bg-white font-black text-neutral-900 text-[11px]">{leftValue}</td>
                    <td className="p-1.5 border-[1.5px] border-black text-left pl-3 bg-[#FFF2CC] w-1/3 uppercase text-[11px]">{rightSubName}</td>
                    <td className={`p-1.5 border-[1.5px] border-black text-center w-20 bg-white font-black text-[11px] ${rightFailCount && rightFailCount > 0 ? 'text-red-600' : 'text-neutral-800'}`}>
                      {rightFailCount !== "" ? rightFailCount : ""}
                    </td>
                  </tr>
                );
              })}

              {/* Class First Total Section (#F2DCDB) */}
              <tr className="border-t-[2px] border-black">
                <td colSpan={3} rowSpan={3} className="bg-[#F2DCDB] text-center font-black p-2 border-[2px] border-black align-middle text-red-900 uppercase tracking-wider">
                  <div className="flex flex-col items-center justify-center min-h-[44px]">
                    <span className="text-xs font-black tracking-wide">Class First</span>
                    <span className="text-[10px] font-bold text-neutral-600 mt-0.5">Total :</span>
                  </div>
                </td>
                <td className="p-1.5 border-[1.5px] border-black text-left pl-3 bg-white font-bold text-neutral-900 text-[11px] uppercase truncate max-w-[140px]">
                  {cs.topPerformer1 ? cs.topPerformer1.name : "---"}
                </td>
                <td className="p-1.5 border-[1.5px] border-black text-center bg-white font-black text-blue-900 text-xs w-20">
                  {cs.topPerformer1 ? cs.topPerformer1.total : "---"}
                </td>
              </tr>
              <tr>
                <td className="p-1 border-[1.5px] border-black bg-white">&nbsp;</td>
                <td className="p-1 border-[1.5px] border-black bg-white w-20">&nbsp;</td>
              </tr>
              <tr>
                <td className="p-1 border-[1.5px] border-black bg-white">&nbsp;</td>
                <td className="p-1 border-[1.5px] border-black bg-white w-20">&nbsp;</td>
              </tr>

              {/* Class Second Total Section (#F2DCDB) */}
              <tr className="border-t-[2px] border-black">
                <td colSpan={3} rowSpan={3} className="bg-[#F2DCDB] text-center font-black p-2 border-[2px] border-black align-middle text-red-900 uppercase tracking-wider">
                  <div className="flex flex-col items-center justify-center min-h-[44px]">
                    <span className="text-xs font-black tracking-wide">Class Second</span>
                    <span className="text-[10px] font-bold text-neutral-600 mt-0.5">Total :</span>
                  </div>
                </td>
                <td className="p-1.5 border-[1.5px] border-black text-left pl-3 bg-white font-bold text-neutral-900 text-[11px] uppercase truncate max-w-[140px]">
                  {cs.topPerformer2 ? cs.topPerformer2.name : "---"}
                </td>
                <td className="p-1.5 border-[1.5px] border-black text-center bg-white font-black text-neutral-900 text-xs w-20">
                  {cs.topPerformer2 ? cs.topPerformer2.total : "---"}
                </td>
              </tr>
              <tr>
                <td className="p-1 border-[1.5px] border-black bg-white">&nbsp;</td>
                <td className="p-1 border-[1.5px] border-black bg-white w-20">&nbsp;</td>
              </tr>
              <tr>
                <td className="p-1 border-[1.5px] border-black bg-white">&nbsp;</td>
                <td className="p-1 border-[1.5px] border-black bg-white w-20">&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-6">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-neutral-100">
        <div>
          <div className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-black text-sidebar uppercase tracking-tight">
              Class & Batch Abstract Performance Summary
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-primary/10 text-primary border border-primary/20">
              Live Real-Time Sync
            </span>
          </div>
          <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">
            School-wide executive abstract ledgers, rankings, and subject failure indices
          </p>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Exam Selector */}
          <div className="flex items-center gap-1 bg-neutral-50 px-2 py-1 rounded-xl border border-neutral-200">
            <span className="text-[10px] font-black text-neutral-400 uppercase">Exam:</span>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="bg-transparent text-xs font-black uppercase tracking-wider outline-none text-sidebar cursor-pointer py-1"
            >
              {scheduledExams.map((e: any) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>

          {/* Scope Selector: All Classes vs Specific Batch */}
          <div className="flex items-center gap-1 bg-neutral-50 px-2 py-1 rounded-xl border border-neutral-200">
            <span className="text-[10px] font-black text-neutral-400 uppercase">Scope:</span>
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="bg-transparent text-xs font-black uppercase tracking-wider outline-none text-sidebar cursor-pointer py-1 max-w-[180px]"
            >
              <option value="all">🌟 All Classes & Batches ({allAbstractSummaries.length})</option>
              <optgroup label="Individual Sections">
                {allAbstractSummaries.map((s: any) => (
                  <option key={`${s.classId}_${s.batchId}`} value={s.batchId || s.classId}>
                    {s.fullName} ({s.noOnRoll} Students)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                viewMode === 'grid' ? 'bg-primary text-white shadow-2xs' : 'text-neutral-500 hover:text-neutral-700'
              }`}
              title="Excel Abstract Ledgers"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ledgers</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                viewMode === 'table' ? 'bg-primary text-white shadow-2xs' : 'text-neutral-500 hover:text-neutral-700'
              }`}
              title="Consolidated Table"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Master Table</span>
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                viewMode === 'analytics' ? 'bg-primary text-white shadow-2xs' : 'text-neutral-500 hover:text-neutral-700'
              }`}
              title="Analytics Charts"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>

          {/* Export All Classes PDF (4 Batches / A4 Page) */}
          <button
            onClick={() => handleExportAllClassesPDF(false)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-indigo-700"
            title="Download All Batches 4-in-1 per A4 Page PDF"
          >
            <Printer className="w-4 h-4" />
            <span>Export All 4-in-1 PDF</span>
          </button>

          {/* Export All Classes Excel */}
          <button
            onClick={handleExportAllClassesExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-emerald-700"
            title="Export All Classes & Batches to XLSX Excel"
          >
            <Download className="w-4 h-4" />
            <span>Export All Excel</span>
          </button>
        </div>
      </div>

      {/* School-Wide Executive Stats Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200/80 text-center">
          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Total Sections</span>
          <h4 className="text-xl sm:text-2xl font-black text-sidebar mt-1 font-mono">{schoolStats.totalClasses}</h4>
          <p className="text-[9px] text-neutral-500 font-bold uppercase mt-0.5">Classes & Batches</p>
        </div>

        <div className="bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100 text-center">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Total On Roll</span>
          <h4 className="text-xl sm:text-2xl font-black text-blue-900 mt-1 font-mono">{schoolStats.totalRoll}</h4>
          <p className="text-[9px] text-blue-500 font-bold uppercase mt-0.5">Active Students</p>
        </div>

        <div className="bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-100 text-center">
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Appeared Students</span>
          <h4 className="text-xl sm:text-2xl font-black text-indigo-900 mt-1 font-mono">{schoolStats.totalAppeared}</h4>
          <p className="text-[9px] text-indigo-500 font-bold uppercase mt-0.5">Assessed In Exam</p>
        </div>

        <div className="bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-100 text-center">
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">School Pass Rate</span>
          <h4 className="text-xl sm:text-2xl font-black text-emerald-800 mt-1 font-mono">{schoolStats.schoolPassPercentage}%</h4>
          <p className="text-[9px] text-emerald-600 font-bold uppercase mt-0.5">{schoolStats.totalPassed} Passed</p>
        </div>

        <div className="bg-red-50/50 p-3.5 rounded-2xl border border-red-100 text-center col-span-2 sm:col-span-1">
          <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Compartmental</span>
          <h4 className="text-xl sm:text-2xl font-black text-red-800 mt-1 font-mono">{schoolStats.totalFailed}</h4>
          <p className="text-[9px] text-red-500 font-bold uppercase mt-0.5">Requiring Support</p>
        </div>
      </div>

      {/* Filter / Search Bar if multiple sections */}
      {selectedScope === 'all' && allAbstractSummaries.length > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-neutral-50 rounded-2xl border border-neutral-200/80">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by class name or section (e.g. 7-IPL, 10, Nursery)..."
              className="bg-transparent border-none outline-none text-xs font-bold text-sidebar placeholder-neutral-400 w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-[11px] font-bold text-neutral-500">
            Showing <span className="font-black text-sidebar font-mono">{filteredSummaries.length}</span> of <span className="font-black text-sidebar font-mono">{allAbstractSummaries.length}</span> Sections
          </div>
        </div>
      )}

      {/* ==================== VIEW MODE 1: GRID VIEW (ALL CLASSES AT A TIME) ==================== */}
      {viewMode === 'grid' && (
        <div className="space-y-6">
          {filteredSummaries.length === 0 ? (
            <div className="p-12 text-center bg-neutral-50/70 rounded-3xl border border-neutral-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-sidebar uppercase tracking-tight">
                No Scheduled Classes or Subjects for {selectedExamName}
              </h4>
              <p className="text-xs text-neutral-500 font-bold max-w-md mx-auto">
                The Abstract Summary only displays classes and subjects that are scheduled in the <span className="text-primary font-black">Exam Schedule</span> tab. Please configure exam schedules to view their abstract performance ledger.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {filteredSummaries.map((cs) => renderExcelLedgerCard(cs))}
            </div>
          )}
        </div>
      )}

      {/* ==================== VIEW MODE 2: CONSOLIDATED MASTER REGISTER TABLE ==================== */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-900 text-white font-black uppercase tracking-wider text-[11px]">
                  <th className="p-3.5 text-center w-12">SNo</th>
                  <th className="p-3.5">Class & Section</th>
                  <th className="p-3.5 text-center font-mono">On Roll</th>
                  <th className="p-3.5 text-center font-mono">Appeared</th>
                  <th className="p-3.5 text-center font-mono">Passed</th>
                  <th className="p-3.5 text-center font-mono">Failed</th>
                  <th className="p-3.5 text-center font-mono">Pass %</th>
                  <th className="p-3.5">Class 1st Topper</th>
                  <th className="p-3.5 text-center font-mono">Topper Marks</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-bold text-neutral-700">
                {filteredSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-xs text-neutral-400 font-bold uppercase tracking-wider">
                      No scheduled classes or subjects found for {selectedExamName}
                    </td>
                  </tr>
                ) : (
                  filteredSummaries.map((s, idx) => (
                    <tr key={`${s.classId}_${s.batchId}`} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="p-3.5 text-center text-neutral-400 font-mono text-xs">{idx + 1}</td>
                      <td className="p-3.5 font-black text-sidebar text-xs">{s.fullName}</td>
                      <td className="p-3.5 text-center font-mono font-bold">{s.noOnRoll}</td>
                      <td className="p-3.5 text-center font-mono font-bold text-blue-900">{s.noAppeared}</td>
                      <td className="p-3.5 text-center font-mono font-black text-emerald-700">{s.noPassed}</td>
                      <td className="p-3.5 text-center font-mono font-black text-red-600">{s.noFailed}</td>
                      <td className="p-3.5 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          s.passPercentage >= 75 ? 'bg-emerald-100 text-emerald-800' :
                          s.passPercentage >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {s.passPercentage}%
                        </span>
                      </td>
                      <td className="p-3.5 text-xs text-neutral-800">
                        {s.topPerformer1 ? (
                          <div className="flex items-center gap-1.5">
                            <Trophy className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            <span className="font-bold">{s.topPerformer1.name}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">---</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center font-mono font-black text-blue-900 text-xs">
                        {s.topPerformer1 ? s.topPerformer1.total : '---'}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => handleExportSingleAbstractPDF(s)}
                          className="px-2.5 py-1 bg-white hover:bg-neutral-100 text-sidebar border border-neutral-200 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== VIEW MODE 3: SCHOOL-WIDE ANALYTICS & INSIGHTS ==================== */}
      {viewMode === 'analytics' && (
        <div className="space-y-6">
          {filteredSummaries.length === 0 ? (
            <div className="p-16 text-center text-neutral-400 font-bold uppercase tracking-wider text-xs bg-neutral-50 rounded-2xl border border-neutral-200">
              No scheduled classes or marks found for {selectedExamName} to generate analytics.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Class Pass Rate Ranking comparison (6 cols) */}
              <div className="lg:col-span-6 bg-neutral-50/50 p-5 rounded-2xl border border-neutral-200 space-y-4">
                <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Section Pass Rate Comparative Index
                </h4>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {[...filteredSummaries].sort((a, b) => b.passPercentage - a.passPercentage).map((s, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-xl border border-neutral-100 shadow-2xs space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold text-neutral-700">
                        <span className="font-black text-sidebar">{s.fullName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-neutral-400 font-mono">{s.noPassed}/{s.noAppeared} Passed</span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono ${
                            s.passPercentage >= 75 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            s.passPercentage >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            {s.passPercentage}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.passPercentage >= 75 ? 'bg-emerald-500' :
                            s.passPercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${s.passPercentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: School-wide Toppers Honor Roll (6 cols) */}
              <div className="lg:col-span-6 bg-neutral-50/50 p-5 rounded-2xl border border-neutral-200 space-y-4">
                <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Class 1st & 2nd Rank Toppers Honor Roll
                </h4>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredSummaries.map((s, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-xl border border-neutral-100 shadow-2xs space-y-2">
                      <div className="flex justify-between items-center border-b border-neutral-100 pb-1.5">
                        <span className="text-xs font-black text-sidebar">{s.fullName}</span>
                        <span className="text-[10px] font-bold text-neutral-400">{s.noAppeared} Appeared</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Rank 1 */}
                        <div className="p-2 bg-amber-50/60 rounded-lg border border-amber-200/60">
                          <div className="flex items-center gap-1 text-[10px] font-black text-amber-800 uppercase">
                            <Medal className="w-3 h-3 text-amber-600" />
                            <span>Class 1st</span>
                          </div>
                          <p className="font-bold text-neutral-800 text-[11px] truncate mt-0.5">
                            {s.topPerformer1 ? s.topPerformer1.name : '---'}
                          </p>
                          <p className="text-[10px] font-black text-blue-900 font-mono mt-0.5">
                            {s.topPerformer1 ? `${s.topPerformer1.total} Marks (${s.topPerformer1.percentage}%)` : '---'}
                          </p>
                        </div>

                        {/* Rank 2 */}
                        <div className="p-2 bg-neutral-100/60 rounded-lg border border-neutral-200/60">
                          <div className="flex items-center gap-1 text-[10px] font-black text-neutral-700 uppercase">
                            <Medal className="w-3 h-3 text-neutral-500" />
                            <span>Class 2nd</span>
                          </div>
                          <p className="font-bold text-neutral-800 text-[11px] truncate mt-0.5">
                            {s.topPerformer2 ? s.topPerformer2.name : '---'}
                          </p>
                          <p className="text-[10px] font-black text-neutral-700 font-mono mt-0.5">
                            {s.topPerformer2 ? `${s.topPerformer2.total} Marks (${s.topPerformer2.percentage}%)` : '---'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


export default Exams;