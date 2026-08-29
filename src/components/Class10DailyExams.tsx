import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, BookOpen, TrendingUp, TrendingDown, CheckCircle, Save, 
  Edit3, Award, Sparkles, Search, RefreshCw, UserCheck, 
  ArrowUpRight, ArrowDownRight, Minus, AlertCircle, FileText, Check, X, Users, Plus,
  Hash, User, CalendarCheck, ArrowUpDown, Target, BarChart2, Filter, Trash2
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { where, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { format, subDays, parseISO } from 'date-fns';

interface Class10DailyExamsProps {
  students: any[];
  classes: any[];
  batches: any[];
  subjects: any[];
  teachers: any[];
  profile: any;
}

// Calculate standard academic grade from percentage
export const calculateGrade = (pct: number): { grade: string; color: string; bg: string } => {
  if (isNaN(pct) || pct < 0) return { grade: 'N/A', color: 'text-neutral-500', bg: 'bg-neutral-100' };
  if (pct >= 90) return { grade: 'A+', color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (pct >= 80) return { grade: 'A', color: 'text-green-700', bg: 'bg-green-100' };
  if (pct >= 70) return { grade: 'B+', color: 'text-blue-700', bg: 'bg-blue-100' };
  if (pct >= 60) return { grade: 'B', color: 'text-indigo-700', bg: 'bg-indigo-100' };
  if (pct >= 50) return { grade: 'C', color: 'text-amber-700', bg: 'bg-amber-100' };
  if (pct >= 35) return { grade: 'D', color: 'text-orange-700', bg: 'bg-orange-100' };
  return { grade: 'F', color: 'text-rose-700', bg: 'bg-rose-100' };
};

export const Class10DailyExams: React.FC<Class10DailyExamsProps> = ({
  students,
  classes,
  batches,
  subjects,
  teachers,
  profile,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [maxMarks, setMaxMarks] = useState<number>(25);
  const [testId, setTestId] = useState<string>('');
  const [examTitle, setExamTitle] = useState<string>('Daily Test');
  const [topic, setTopic] = useState<string>('');
  const [assignedTeacherId, setAssignedTeacherId] = useState<string>('');

  const [schedules, setSchedules] = useState<any[]>([]);
  const [allDailyMarks, setAllDailyMarks] = useState<any[]>([]);
  const [selectedExamKey, setSelectedExamKey] = useState<string>('');
  const [currentMarks, setCurrentMarks] = useState<Record<string, { marksObtained: number | ''; isAbsent: boolean }>>({});
  const [pastMarksForSubject, setPastMarksForSubject] = useState<any[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(false);
  const [savingMarks, setSavingMarks] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'entry' | 'all_subjects' | 'analytics' | 'schedule_list'>('entry');

  // Master marks across all subjects for selected date (Admin overview)
  const [allSubjectsMarks, setAllSubjectsMarks] = useState<any[]>([]);
  const [loadingAllSubjectsMarks, setLoadingAllSubjectsMarks] = useState<boolean>(false);

  // Table sorting state for soft header buttons
  const [sortColumn, setSortColumn] = useState<'roll' | 'name' | 'attendance' | 'marks' | 'percentage' | 'grade'>('roll');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleHeaderClick = (col: 'roll' | 'name' | 'attendance' | 'marks' | 'percentage' | 'grade') => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  // Helper to retrieve student roll number automatically from the Class Batch
  const getStudentRollNumber = useCallback((student: any, globalIndex: number, list: any[]) => {
    if (!student) return '-';
    // 1. Explicit roll number if available
    const explicitRoll = student.rollNumber || student.rollNo || student.batchRollNo || student.batchRollNumber;
    if (explicitRoll !== undefined && explicitRoll !== null && String(explicitRoll).trim() !== '' && String(explicitRoll) !== '0') {
      return String(explicitRoll).trim();
    }

    // 2. Derive 1-based roll number within the student's Class Batch automatically
    const sBatch = String(student.batchId || student.batch || student.section || student.batchName || 'General Batch').toLowerCase().trim();
    let batchIndex = 1;
    for (let i = 0; i < globalIndex; i++) {
      const prev = list[i];
      if (!prev) continue;
      const prevBatch = String(prev.batchId || prev.batch || prev.section || prev.batchName || 'General Batch').toLowerCase().trim();
      if (prevBatch === sBatch) {
        batchIndex++;
      }
    }
    return String(batchIndex);
  }, []);

  // Direct student fetching from Firestore to ensure students are always visible
  const [fetchedStudents, setFetchedStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);

  // Live attendance and leaves data from Attendance module
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [leavesRecords, setLeavesRecords] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const fetchAttendanceData = async () => {
      try {
        const [attList, leaveList] = await Promise.all([
          dbService.list('attendance', [where('date', '==', selectedDate)], true),
          dbService.list('leaves', [], true)
        ]);
        if (active) {
          setAttendanceRecords(attList || []);
          setLeavesRecords(leaveList || []);
        }
      } catch (err) {
        console.error('Error fetching attendance records for daily exams:', err);
      }
    };
    fetchAttendanceData();
    return () => { active = false; };
  }, [selectedDate]);

  // Compute student attendance status directly from Attendance module
  const getStudentAttendanceInfo = (studentId: string) => {
    const rec = attendanceRecords.find(a => (a.studentId === studentId || a.userId === studentId) && a.date === selectedDate);
    if (rec) {
      const st = String(rec.status || '').toLowerCase().trim();
      if (st === 'absent' || st === 'on_leave' || st === 'leave') {
        return { isAbsent: true, label: 'Absent (A)', color: 'bg-rose-100 text-rose-800 border-rose-300' };
      }
      if (st === 'present' || st === 'late' || st === 'half_day') {
        return { isAbsent: false, label: 'Present (P)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      }
    }

    const onLeave = leavesRecords.find(l => 
      (l.applicantId === studentId || l.studentId === studentId || l.userId === studentId) && 
      l.status === 'approved' && 
      l.startDate <= selectedDate && 
      l.endDate >= selectedDate
    );
    if (onLeave) {
      return { isAbsent: true, label: 'On Leave', color: 'bg-amber-100 text-amber-800 border-amber-300' };
    }

    const stObj = allAvailableStudents.find(s => (s.uid || s.id) === studentId);
    if (stObj && (stObj.status === 'non_attending' || stObj.status === 'non-attending')) {
      return { isAbsent: false, label: 'Present (P)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }

    return { isAbsent: false, label: 'Present (P)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  };

  useEffect(() => {
    let active = true;
    const loadClass10Students = async () => {
      setLoadingStudents(true);
      try {
        const list = await dbService.list('students');
        if (active && Array.isArray(list)) {
          setFetchedStudents(list);
        }
      } catch (err) {
        console.error('Error fetching students for Class 10 Daily Exams:', err);
      } finally {
        if (active) setLoadingStudents(false);
      }
    };
    loadClass10Students();
    return () => { active = false; };
  }, []);

  // Combine parent prop students + fetched students without duplicates
  const allAvailableStudents = useMemo(() => {
    const map = new Map<string, any>();
    (fetchedStudents || []).forEach(s => {
      const sid = s.uid || s.id;
      if (sid) map.set(sid, s);
    });
    (students || []).forEach(s => {
      const sid = s.uid || s.id;
      if (sid) {
        const existing = map.get(sid);
        if (!existing) {
          map.set(sid, s);
        } else {
          // Merge, giving fresh fetched database record precedence for section/class/batch
          map.set(sid, { ...s, ...existing });
        }
      }
    });
    return Array.from(map.values());
  }, [students, fetchedStudents]);

  // Admin role check
  const isAdminUser = useMemo(() => {
    if (!profile) return true;
    const role = String(profile.role || '').toLowerCase().trim();
    return (
      role === 'admin' ||
      role === 'superadmin' ||
      role === 'principal' ||
      role === 'director' ||
      profile.isAdmin === true
    );
  }, [profile]);

  // Filter for Class 10 classes only
  const targetClasses = useMemo(() => {
    const class10 = classes.filter(c => {
      const name = String(c.name || '').toLowerCase().trim();
      return name.includes('10') || name === 'x' || name.includes('tenth') || name.includes('ssc');
    });
    if (class10.length > 0) return class10;
    return [{ id: 'class_10', name: '10 Class' }];
  }, [classes]);

  // Filter subjects for Class 10
  const class10Subjects = useMemo(() => {
    if (!subjects || subjects.length === 0) return [];
    const activeClass = targetClasses.find(c => c.id === selectedClassId);

    if (activeClass?.subjectIds && Array.isArray(activeClass.subjectIds) && activeClass.subjectIds.length > 0) {
      const matched = subjects.filter(s => activeClass.subjectIds.includes(s.id));
      if (matched.length > 0) return matched;
    }
    if (activeClass?.subjects && Array.isArray(activeClass.subjects) && activeClass.subjects.length > 0) {
      const subIds = activeClass.subjects.map((s: any) => typeof s === 'string' ? s : (s.id || s.subjectId)).filter(Boolean);
      const matched = subjects.filter(s => subIds.includes(s.id));
      if (matched.length > 0) return matched;
    }

    const matchingClassId = subjects.filter(s => {
      if (s.classId === selectedClassId) return true;
      if (Array.isArray(s.classIds) && s.classIds.includes(selectedClassId)) return true;
      return false;
    });
    if (matchingClassId.length > 0) return matchingClassId;

    return subjects;
  }, [subjects, targetClasses, selectedClassId]);

  // Filter teachers to show ONLY Class 10 related teachers in dropdown
  const class10Teachers = useMemo(() => {
    if (!teachers || teachers.length === 0) return [];

    const targetClassIds = new Set(targetClasses.map(tc => tc.id));
    const targetSubjectIds = new Set(class10Subjects.map(s => s.id));
    const targetSubjectNames = new Set(class10Subjects.map(s => String(s.name || '').toLowerCase().trim()));

    const class10SubjectTeacherIds = new Set<string>();
    class10Subjects.forEach(s => {
      if (s.teacherId) class10SubjectTeacherIds.add(s.teacherId);
    });

    const filtered = teachers.filter(t => {
      const tid = t.uid || t.id;
      if (!tid) return false;

      // 1. Explicitly assigned to a Class 10 subject
      if (class10SubjectTeacherIds.has(tid)) return true;

      // 2. Teacher classId or classIds matches Class 10
      if (t.classId && targetClassIds.has(t.classId)) return true;
      if (Array.isArray(t.classIds) && t.classIds.some((cid: string) => targetClassIds.has(cid))) return true;

      // 3. Subject assignments for Class 10
      if (Array.isArray(t.subjectAssignments)) {
        const matchesSA = t.subjectAssignments.some((sa: any) => {
          if (sa.classId && targetClassIds.has(sa.classId)) return true;
          if (sa.subjectId && targetSubjectIds.has(sa.subjectId)) return true;
          if (sa.subjectName && targetSubjectNames.has(String(sa.subjectName).toLowerCase().trim())) return true;
          return false;
        });
        if (matchesSA) return true;
      }

      // 4. Subjects array matching Class 10 subjects
      if (Array.isArray(t.subjects)) {
        const matchesSub = t.subjects.some((s: any) => {
          const subStr = typeof s === 'string' ? s.toLowerCase().trim() : String(s?.name || s?.id || '').toLowerCase().trim();
          return targetSubjectNames.has(subStr) || targetSubjectIds.has(subStr);
        });
        if (matchesSub) return true;
      }

      // 5. Profile fields indicating Class 10
      const textToSearch = [
        t.designation, t.department, t.class, t.className, t.qualification,
        ...(Array.isArray(t.staffBatches) ? t.staffBatches : []),
        ...(Array.isArray(t.batchIds) ? t.batchIds : [])
      ].map(v => String(v || '').toLowerCase()).join(' ');

      if (
        textToSearch.includes('10') || 
        textToSearch.includes('tenth') || 
        textToSearch.includes(' class x') || 
        textToSearch.includes('ssc') || 
        textToSearch.includes('ipl') || 
        textToSearch.includes('m-batch') || 
        textToSearch.includes('s-batch')
      ) {
        return true;
      }

      return false;
    });

    return filtered;
  }, [teachers, targetClasses, class10Subjects]);

  // Auto-sync assigned teacher whenever selectedSubjectId changes
  useEffect(() => {
    if (selectedSubjectId) {
      const activeSub = class10Subjects.find(s => s.id === selectedSubjectId);
      if (activeSub?.teacherId && class10Teachers.some(t => (t.uid || t.id) === activeSub.teacherId)) {
        setAssignedTeacherId(activeSub.teacherId);
      } else if (!assignedTeacherId && class10Teachers.length > 0) {
        setAssignedTeacherId(class10Teachers[0].uid || class10Teachers[0].id);
      }
    }
  }, [selectedSubjectId, class10Subjects, class10Teachers]);

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
      if (profile.uid) ids.add(profile.uid);
      if (profile.id) ids.add(profile.id);
      if ((profile as any)?.staffId) ids.add((profile as any).staffId);
      if (profile.email) ids.add(profile.email);
      if (profile.name) names.add(String(profile.name).toLowerCase().trim());
    }

    if (currentTeacherObj) {
      if (currentTeacherObj.uid) ids.add(currentTeacherObj.uid);
      if (currentTeacherObj.id) ids.add(currentTeacherObj.id);
      if (currentTeacherObj.staffId) ids.add(currentTeacherObj.staffId);
      if (currentTeacherObj.email) ids.add(currentTeacherObj.email);
      if (currentTeacherObj.name) names.add(String(currentTeacherObj.name).toLowerCase().trim());
    }

    return { ids, names };
  }, [profile, currentTeacherObj]);

  // Teacher portal subject filter: Show ONLY assigned subject(s) for a Class 10 teacher
  const teacherClass10Subjects = useMemo(() => {
    if (isAdminUser) return class10Subjects;

    const teacherSubjectNames = new Set<string>();
    const teacherSubjectIds = new Set<string>();

    const addSub = (s: any) => {
      if (!s) return;
      if (typeof s === 'string') {
        const tr = s.trim();
        if (tr) {
          teacherSubjectNames.add(tr.toLowerCase());
          teacherSubjectIds.add(tr);
        }
      } else if (Array.isArray(s)) {
        s.forEach(addSub);
      } else if (typeof s === 'object') {
        if (s.id) teacherSubjectIds.add(String(s.id));
        if (s.subjectId) teacherSubjectIds.add(String(s.subjectId));
        if (s.code) teacherSubjectIds.add(String(s.code));
        if (s.name) teacherSubjectNames.add(String(s.name).toLowerCase().trim());
        if (s.subjectName) teacherSubjectNames.add(String(s.subjectName).toLowerCase().trim());
        if (s.title) teacherSubjectNames.add(String(s.title).toLowerCase().trim());
        if (s.subject) teacherSubjectNames.add(String(s.subject).toLowerCase().trim());
      }
    };

    if (profile) {
      addSub(profile.subject);
      addSub(profile.subjectName);
      addSub(profile.assignedSubject);
      addSub(profile.assignedSubjects);
      addSub(profile.primarySubject);
      addSub(profile.department);
      if (Array.isArray(profile.subjects)) addSub(profile.subjects);
      if (Array.isArray(profile.subjectAssignments)) addSub(profile.subjectAssignments);
    }

    if (currentTeacherObj) {
      addSub(currentTeacherObj.subject);
      addSub(currentTeacherObj.subjectName);
      addSub(currentTeacherObj.assignedSubject);
      addSub(currentTeacherObj.assignedSubjects);
      addSub(currentTeacherObj.primarySubject);
      addSub(currentTeacherObj.department);
      if (Array.isArray(currentTeacherObj.subjects)) addSub(currentTeacherObj.subjects);
      if (Array.isArray(currentTeacherObj.subjectAssignments)) addSub(currentTeacherObj.subjectAssignments);
    }

    // 1. Match against class10Subjects
    const matched = class10Subjects.filter(s => {
      if (!s) return false;
      if (s.teacherId && teacherIdentifiers.ids.has(String(s.teacherId))) return true;
      if (s.teacherName && teacherIdentifiers.names.has(String(s.teacherName).toLowerCase().trim())) return true;
      if (teacherSubjectIds.has(String(s.id))) return true;
      if (s.code && teacherSubjectIds.has(String(s.code))) return true;
      if (s.name) {
        const sName = String(s.name).toLowerCase().trim();
        if (teacherSubjectNames.has(sName)) return true;
        for (const tName of teacherSubjectNames) {
          if (tName && (sName.includes(tName) || tName.includes(sName))) return true;
        }
      }
      return false;
    });

    if (matched.length > 0) return matched;

    // 2. Match against global subjects list if class10Subjects didn't match directly
    if (subjects && subjects.length > 0) {
      const globalMatched = subjects.filter(s => {
        if (!s) return false;
        if (s.teacherId && teacherIdentifiers.ids.has(String(s.teacherId))) return true;
        if (s.teacherName && teacherIdentifiers.names.has(String(s.teacherName).toLowerCase().trim())) return true;
        if (teacherSubjectIds.has(String(s.id))) return true;
        if (s.code && teacherSubjectIds.has(String(s.code))) return true;
        if (s.name) {
          const sName = String(s.name).toLowerCase().trim();
          if (teacherSubjectNames.has(sName)) return true;
          for (const tName of teacherSubjectNames) {
            if (tName && (sName.includes(tName) || tName.includes(sName))) return true;
          }
        }
        return false;
      });
      if (globalMatched.length > 0) return globalMatched;
    }

    // 3. Fallback to teacher subject names explicitly if present
    if (teacherSubjectNames.size > 0) {
      const artificial = Array.from(teacherSubjectNames).map(name => {
        const title = name.charAt(0).toUpperCase() + name.slice(1);
        return {
          id: title,
          name: title,
          code: title.slice(0, 3).toUpperCase(),
          classId: selectedClassId || 'class_10'
        };
      });
      return artificial;
    }

    // 4. For non-admin teacher without assigned subjects, return [] (NEVER return all class10Subjects)
    return [];
  }, [class10Subjects, subjects, isAdminUser, profile, currentTeacherObj, teacherIdentifiers, selectedClassId]);

  useEffect(() => {
    if (teacherClass10Subjects.length > 0 && (!selectedSubjectId || !teacherClass10Subjects.some(s => s.id === selectedSubjectId))) {
      setSelectedSubjectId(teacherClass10Subjects[0].id);
    }
  }, [teacherClass10Subjects, selectedSubjectId]);

  // Set default selected class to Class 10
  useEffect(() => {
    if (targetClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(targetClasses[0].id);
    }
  }, [targetClasses, selectedClassId]);

  // Dynamically discover all batches/sections for Class 10 (IPL, M-Batch, S-Batch, etc.)
  const classBatches = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const added = new Set<string>();

    // 1. Batches from batches prop matching Class 10
    batches.filter(b => !selectedClassId || b.classId === selectedClassId).forEach(b => {
      if (b.name) {
        const trimmed = b.name.trim();
        if (!added.has(trimmed.toLowerCase())) {
          added.add(trimmed.toLowerCase());
          list.push({ id: b.id, name: trimmed });
        }
      }
    });

    // 2. Discover sections/batches directly from student records
    allAvailableStudents.forEach(s => {
      const isClass10 = selectedClassId ? s.classId === selectedClassId : targetClasses.some(tc => tc.id === s.classId);
      if (isClass10) {
        const val = s.batch || s.section || s.batchName;
        if (val && typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed && !added.has(trimmed.toLowerCase())) {
            added.add(trimmed.toLowerCase());
            list.push({ id: trimmed, name: trimmed });
          }
        }
      }
    });

    // 3. Ensure standard Class 10 sections (IPL, M-Batch, S-Batch) exist
    ['IPL', 'M-Batch', 'S-Batch'].forEach(def => {
      if (!added.has(def.toLowerCase())) {
        added.add(def.toLowerCase());
        list.push({ id: def, name: def });
      }
    });

    return list;
  }, [batches, selectedClassId, allAvailableStudents, targetClasses]);

  // Filter students for Class 10 strictly and sort batch-wise
  const class10Students = useMemo(() => {
    const targetClassIds = new Set(targetClasses.map(tc => tc.id));
    const targetClassNames = new Set(targetClasses.map(tc => String(tc.name || '').toLowerCase().trim()));

    // Set of non-Class 10 class IDs
    const nonClass10ClassIds = new Set(
      (classes || [])
        .filter(c => {
          const name = String(c.name || '').toLowerCase().trim();
          return !name.includes('10') && name !== 'x' && !name.includes('tenth') && !name.includes('ssc');
        })
        .map(c => c.id)
    );

    return allAvailableStudents.filter(s => {
      if (s.status && s.status !== 'active' && s.status !== 'non_attending') {
        return false;
      }

      // 1. Check s.classId
      if (s.classId) {
        if (nonClass10ClassIds.has(s.classId)) {
          // Explicitly assigned to another class (e.g., Class 9, Class 8)
          return false;
        }
        if (!targetClassIds.has(s.classId) && selectedClassId && s.classId !== selectedClassId && classes.length > 0) {
          // Assigned to a class ID that is NOT Class 10
          return false;
        }
      }

      // 2. Check student's class name / grade / standard string
      const studentClassStr = String(s.className || s.class || s.grade || s.standard || s.currentClass || '').toLowerCase().trim();
      
      if (studentClassStr) {
        const isOtherClass = (
          studentClassStr.includes('class 9') || studentClassStr.includes('9th') || studentClassStr.includes('grade 9') || studentClassStr.includes('ssc 9') || studentClassStr.includes('9 class') ||
          studentClassStr.includes('class 8') || studentClassStr.includes('8th') || studentClassStr.includes('grade 8') || studentClassStr.includes('8 class') ||
          studentClassStr.includes('class 7') || studentClassStr.includes('7th') || studentClassStr.includes('grade 7') || studentClassStr.includes('7 class') ||
          studentClassStr.includes('class 6') || studentClassStr.includes('6th') || studentClassStr.includes('grade 6') || studentClassStr.includes('6 class') ||
          studentClassStr.includes('class 5') || studentClassStr.includes('5th') || studentClassStr.includes('5 class') ||
          studentClassStr.includes('class 4') || studentClassStr.includes('4th') ||
          studentClassStr.includes('class 3') || studentClassStr.includes('3rd') ||
          studentClassStr.includes('class 2') || studentClassStr.includes('2nd') ||
          studentClassStr.includes('class 1') || studentClassStr.includes('1st') ||
          studentClassStr.includes('class 11') || studentClassStr.includes('11th') ||
          studentClassStr.includes('class 12') || studentClassStr.includes('12th') ||
          studentClassStr.includes('nursery') || studentClassStr.includes('ukg') || studentClassStr.includes('lkg')
        );

        if (isOtherClass && !studentClassStr.includes('10') && studentClassStr !== 'x' && !studentClassStr.includes('tenth') && !studentClassStr.includes('ssc')) {
          return false;
        }
      }

      // 3. Verify Class 10 match
      let matchesClass10 = false;

      if (s.classId && (targetClassIds.has(s.classId) || s.classId === selectedClassId)) {
        matchesClass10 = true;
      }

      if (!matchesClass10 && studentClassStr) {
        if (
          targetClassNames.has(studentClassStr) ||
          studentClassStr.includes('10') ||
          studentClassStr === 'x' ||
          studentClassStr.includes('tenth') ||
          studentClassStr.includes('ssc')
        ) {
          matchesClass10 = true;
        }
      }

      // Fallback for unassigned students (no classId and no className string) whose section/batch matches Class 10
      if (!matchesClass10 && !s.classId && !studentClassStr) {
        const studentBatchStr = String(s.batch || s.section || s.batchName || '').toLowerCase().trim();
        if (studentBatchStr === 'ipl' || studentBatchStr === 'm-batch' || studentBatchStr === 's-batch' || studentBatchStr.includes('10')) {
          matchesClass10 = true;
        }
      }

      if (!matchesClass10) return false;

      // 4. Batch-wise filtering for selected section/batch
      if (!selectedBatchId) return true;

      const targetBatch = classBatches.find(
        b => b.id === selectedBatchId || b.name.toLowerCase().trim() === selectedBatchId.toLowerCase().trim()
      ) || batches.find(
        b => b.id === selectedBatchId || b.name.toLowerCase().trim() === selectedBatchId.toLowerCase().trim()
      );

      const targetName = targetBatch ? targetBatch.name.toLowerCase().trim() : selectedBatchId.toLowerCase().trim();
      const targetId = targetBatch ? targetBatch.id : selectedBatchId;
      const normTarget = targetName.replace(/[-_\s]/g, '');

      const sBatchId = String(s.batchId || '').trim();
      const sBatch = String(s.batch || '').toLowerCase().trim();
      const sSection = String(s.section || '').toLowerCase().trim();
      const sBatchName = String(s.batchName || '').toLowerCase().trim();

      // Check if student's sBatchId matches target batch ID
      if (sBatchId) {
        if (sBatchId === targetId || sBatchId === selectedBatchId) {
          return true;
        }
        const studentBatchObj = batches.find(b => b.id === sBatchId) || classBatches.find(b => b.id === sBatchId);
        if (studentBatchObj && studentBatchObj.name) {
          const sBatchObjName = studentBatchObj.name.toLowerCase().trim().replace(/[-_\s]/g, '');
          if (sBatchObjName !== normTarget) {
            return false;
          }
        } else {
          return false;
        }
      }

      // Check exact string or normalized string matches for student batch/section
      const normBatch = sBatch.replace(/[-_\s]/g, '');
      const normSection = sSection.replace(/[-_\s]/g, '');
      const normBatchName = sBatchName.replace(/[-_\s]/g, '');

      if (sBatch === targetName || sSection === targetName || sBatchName === targetName) return true;
      if (normBatch === normTarget || normSection === normTarget || normBatchName === normTarget) return true;

      // Also check if the student's sBatchId resolves to a batch object whose name matches targetName
      if (sBatchId) {
        const studentBatchObj = batches.find(b => b.id === sBatchId) || classBatches.find(b => b.id === sBatchId);
        if (studentBatchObj && studentBatchObj.name) {
          const sBatchObjName = studentBatchObj.name.toLowerCase().trim().replace(/[-_\s]/g, '');
          if (sBatchObjName === normTarget) return true;
        }
      }

      return false;
    }).sort((a, b) => {
      const getBatchName = (st: any) => {
        const match = classBatches.find(bt => bt.id === st.batchId || bt.name.toLowerCase() === String(st.batch || st.section || st.batchName || '').toLowerCase());
        return match?.name || st.batch || st.section || st.batchName || 'General';
      };
      const batchA = getBatchName(a);
      const batchB = getBatchName(b);
      const batchComp = batchA.localeCompare(batchB);
      if (batchComp !== 0 && !selectedBatchId) return batchComp;

      const rollAStr = String(a.rollNumber || a.rollNo || a.batchRollNo || a.batchRollNumber || '').trim();
      const rollBStr = String(b.rollNumber || b.rollNo || b.batchRollNo || b.batchRollNumber || '').trim();

      if (!rollAStr && !rollBStr) return String(a.name || '').localeCompare(String(b.name || ''));
      if (!rollAStr) return 1;
      if (!rollBStr) return -1;

      const numA = Number(rollAStr);
      const numB = Number(rollBStr);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return rollAStr.localeCompare(rollBStr, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [allAvailableStudents, selectedClassId, selectedBatchId, targetClasses, classBatches, classes]);

  // Filtered and sorted students
  const filteredStudents = useMemo(() => {
    let list = class10Students;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = class10Students.filter((s) => {
        const globalIdx = class10Students.indexOf(s);
        const roll = getStudentRollNumber(s, globalIdx, class10Students);
        return (
          String(s.name || '').toLowerCase().includes(term) ||
          roll.toLowerCase().includes(term) ||
          String(s.admissionNumber || s.admissionNo || '').toLowerCase().includes(term)
        );
      });
    }

    if (!sortColumn) return list;

    return [...list].sort((a, b) => {
      const aIdx = class10Students.indexOf(a);
      const bIdx = class10Students.indexOf(b);
      const rollA = getStudentRollNumber(a, aIdx, class10Students);
      const rollB = getStudentRollNumber(b, bIdx, class10Students);

      let comp = 0;
      if (sortColumn === 'roll') {
        const numA = Number(rollA);
        const numB = Number(rollB);
        if (!isNaN(numA) && !isNaN(numB)) comp = numA - numB;
        else comp = rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortColumn === 'name') {
        comp = String(a.name || '').localeCompare(String(b.name || ''));
      } else if (sortColumn === 'attendance') {
        const attA = getStudentAttendanceInfo(a.uid || a.id);
        const attB = getStudentAttendanceInfo(b.uid || b.id);
        comp = (attA.isAbsent ? 1 : 0) - (attB.isAbsent ? 1 : 0);
      } else if (sortColumn === 'marks') {
        const entryA = currentMarks[a.uid || a.id];
        const entryB = currentMarks[b.uid || b.id];
        const marksA = entryA && typeof entryA.marksObtained === 'number' ? entryA.marksObtained : -1;
        const marksB = entryB && typeof entryB.marksObtained === 'number' ? entryB.marksObtained : -1;
        comp = marksA - marksB;
      } else if (sortColumn === 'percentage') {
        const entryA = currentMarks[a.uid || a.id];
        const entryB = currentMarks[b.uid || b.id];
        const marksA = entryA && typeof entryA.marksObtained === 'number' ? entryA.marksObtained : -1;
        const marksB = entryB && typeof entryB.marksObtained === 'number' ? entryB.marksObtained : -1;
        const pctA = (marksA >= 0 && maxMarks > 0) ? (marksA / maxMarks) * 100 : -1;
        const pctB = (marksB >= 0 && maxMarks > 0) ? (marksB / maxMarks) * 100 : -1;
        comp = pctA - pctB;
      } else if (sortColumn === 'grade') {
        const entryA = currentMarks[a.uid || a.id];
        const entryB = currentMarks[b.uid || b.id];
        const marksA = entryA && typeof entryA.marksObtained === 'number' ? entryA.marksObtained : -1;
        const marksB = entryB && typeof entryB.marksObtained === 'number' ? entryB.marksObtained : -1;
        comp = marksA - marksB;
      }

      return sortDirection === 'asc' ? comp : -comp;
    });
  }, [class10Students, searchTerm, getStudentRollNumber, sortColumn, sortDirection, currentMarks, maxMarks]);

  // Master matrix data for All Subjects Performance Overview
  const masterMatrixData = useMemo(() => {
    return filteredStudents.map((student) => {
      const sId = student.uid || student.id;
      const globalIdx = class10Students.indexOf(student);
      const assignedRoll = getStudentRollNumber(student, globalIdx, class10Students);

      let totalObtained = 0;
      let totalMax = 0;
      let subjectsAttempted = 0;

      const subjectMap: Record<string, { marksObtained: number | ''; maxMarks: number; isAbsent: boolean; percentage: number | null }> = {};

      class10Subjects.forEach(sub => {
        const rec = allSubjectsMarks.find((m: any) => m.studentId === sId && m.subjectId === sub.id);
        if (rec) {
          const isAbs = !!rec.isAbsent;
          const marksObt = (!isAbs && typeof rec.marksObtained === 'number') ? rec.marksObtained : '';
          const mx = Number(rec.maxMarks) || 25;
          const pct = (!isAbs && typeof marksObt === 'number') ? Math.round((marksObt / mx) * 100) : null;

          subjectMap[sub.id] = {
            marksObtained: marksObt,
            maxMarks: mx,
            isAbsent: isAbs,
            percentage: pct
          };

          if (!isAbs && typeof marksObt === 'number') {
            totalObtained += marksObt;
            totalMax += mx;
            subjectsAttempted++;
          }
        } else {
          subjectMap[sub.id] = {
            marksObtained: '',
            maxMarks: 25,
            isAbsent: false,
            percentage: null
          };
        }
      });

      const overallPct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : null;
      const gradeObj = overallPct !== null ? calculateGrade(overallPct) : { grade: '-', color: 'text-neutral-400', bg: 'bg-neutral-50' };

      return {
        student,
        sId,
        assignedRoll,
        subjectMap,
        totalObtained,
        totalMax,
        subjectsAttempted,
        overallPct,
        gradeObj
      };
    });
  }, [filteredStudents, class10Students, class10Subjects, allSubjectsMarks, getStudentRollNumber]);

  // Fetch all schedules & saved daily exam marks for Class 10
  const loadSchedules = async () => {
    setLoadingSchedule(true);
    try {
      const [schedulesList, marksList] = await Promise.all([
        dbService.list('class10_daily_schedules', [], true),
        dbService.list('class10_daily_marks', [], true)
      ]);
      setSchedules(schedulesList || []);
      setAllDailyMarks(marksList || []);

      // Check if there is already a schedule for selectedDate + selectedClassId
      const existing = (schedulesList || []).find((s: any) => 
        s.date === selectedDate && 
        (selectedClassId ? s.classId === selectedClassId : true) &&
        (selectedBatchId ? s.batchId === selectedBatchId : true)
      );

      if (existing) {
        if (existing.subjectId && (isAdminUser || teacherClass10Subjects.some(s => s.id === existing.subjectId))) {
          if (!selectedSubjectId) setSelectedSubjectId(existing.subjectId);
        } else if (teacherClass10Subjects.length > 0 && (!selectedSubjectId || !teacherClass10Subjects.some(s => s.id === selectedSubjectId))) {
          setSelectedSubjectId(teacherClass10Subjects[0].id);
        }
        setMaxMarks(existing.maxMarks || 25);
        setTestId(existing.testId || '');
        setExamTitle(existing.examTitle || existing.title || 'Daily Test');
        setTopic(existing.topic || '');
        setAssignedTeacherId(existing.teacherId || '');
      } else {
        // Default to first assigned subject if not set
        if (teacherClass10Subjects.length > 0 && (!selectedSubjectId || !teacherClass10Subjects.some(s => s.id === selectedSubjectId))) {
          setSelectedSubjectId(teacherClass10Subjects[0].id);
        }
        if (!testId) {
          setTestId(`DT-${selectedDate.replace(/-/g, '').slice(2)}`);
        }
      }
    } catch (e) {
      console.error("Failed to load Class 10 daily schedules:", e);
    } finally {
      setLoadingSchedule(false);
    }
  };

  // Discover all unique saved exams (Exam Title + Date) for dropdown menu selection
  const availableExams = useMemo(() => {
    const map = new Map<string, { key: string; testId?: string; title: string; date: string; subjectNames: string[]; subjectIds: string[]; maxMarks?: number; topic?: string }>();

    const teacherSubIds = new Set(teacherClass10Subjects.map(s => s.id));
    const teacherSubNames = new Set(teacherClass10Subjects.map(s => String(s.name || '').toLowerCase().trim()));

    // 1. Gather from schedules
    (schedules || []).forEach((sch: any) => {
      const title = sch.examTitle || sch.title || 'Daily Test';
      const tId = sch.testId || '';
      const date = sch.date;
      if (!date) return;
      const subName = sch.subjectName || '';
      const subId = sch.subjectId || '';

      if (!isAdminUser && teacherClass10Subjects.length > 0) {
        const matchesId = subId && teacherSubIds.has(subId);
        const matchesName = subName && teacherSubNames.has(String(subName).toLowerCase().trim());
        if (!matchesId && !matchesName) return;
      }

      const key = tId ? `${tId}___${title}___${date}` : `${title}___${date}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          testId: tId,
          title,
          date,
          subjectNames: subName ? [subName] : [],
          subjectIds: subId ? [subId] : [],
          maxMarks: sch.maxMarks,
          topic: sch.topic
        });
      } else {
        const item = map.get(key)!;
        if (tId && !item.testId) item.testId = tId;
        if (subName && !item.subjectNames.includes(subName)) item.subjectNames.push(subName);
        if (subId && !item.subjectIds.includes(subId)) item.subjectIds.push(subId);
        if (sch.maxMarks && !item.maxMarks) item.maxMarks = sch.maxMarks;
        if (sch.topic && !item.topic) item.topic = sch.topic;
      }
    });

    // 2. Gather from daily marks
    (allDailyMarks || []).forEach((m: any) => {
      const title = m.examTitle || 'Daily Test';
      const tId = m.testId || '';
      const date = m.date;
      if (!date) return;
      const subName = m.subjectName || '';
      const subId = m.subjectId || '';

      if (!isAdminUser && teacherClass10Subjects.length > 0) {
        const matchesId = subId && teacherSubIds.has(subId);
        const matchesName = subName && teacherSubNames.has(String(subName).toLowerCase().trim());
        if (!matchesId && !matchesName) return;
      }

      const key = tId ? `${tId}___${title}___${date}` : `${title}___${date}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          testId: tId,
          title,
          date,
          subjectNames: subName ? [subName] : [],
          subjectIds: subId ? [subId] : [],
          maxMarks: m.maxMarks,
          topic: ''
        });
      } else {
        const item = map.get(key)!;
        if (tId && !item.testId) item.testId = tId;
        if (subName && !item.subjectNames.includes(subName)) item.subjectNames.push(subName);
        if (subId && !item.subjectIds.includes(subId)) item.subjectIds.push(subId);
        if (m.maxMarks && !item.maxMarks) item.maxMarks = m.maxMarks;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [schedules, allDailyMarks, isAdminUser, teacherClass10Subjects]);

  // Handler when user selects an exam name from the dropdown menu
  const handleSelectExam = (key: string) => {
    setSelectedExamKey(key);
    if (!key || key === 'NEW_EXAM') {
      setTestId(`DT-${selectedDate.replace(/-/g, '').slice(2)}`);
      setExamTitle('Daily Test');
      setTopic('');
      return;
    }
    const found = availableExams.find(e => e.key === key);
    if (found) {
      setSelectedDate(found.date);
      setTestId(found.testId || `DT-${found.date.replace(/-/g, '').slice(2)}`);
      setExamTitle(found.title || 'Daily Test');
      if (found.maxMarks) setMaxMarks(found.maxMarks);
      if (found.topic) setTopic(found.topic);

      if (found.subjectIds.length > 0) {
        if (!isAdminUser && teacherClass10Subjects.length > 0) {
          const teacherSub = found.subjectIds.find(id => teacherClass10Subjects.some(ts => ts.id === id));
          if (teacherSub) {
            setSelectedSubjectId(teacherSub);
          } else if (!teacherClass10Subjects.some(ts => ts.id === selectedSubjectId)) {
            setSelectedSubjectId(teacherClass10Subjects[0].id);
          }
        } else if (!selectedSubjectId || !found.subjectIds.includes(selectedSubjectId)) {
          setSelectedSubjectId(found.subjectIds[0]);
        }
      }
    }
  };

  // Sync selectedExamKey when selectedDate or examTitle changes externally
  useEffect(() => {
    if (availableExams.length > 0) {
      const currentKey = testId ? `${testId}___${examTitle}___${selectedDate}` : `${examTitle}___${selectedDate}`;
      const exactMatch = availableExams.find(e => e.key === currentKey || (e.testId && e.testId === testId && e.date === selectedDate));
      if (exactMatch) {
        setSelectedExamKey(exactMatch.key);
      } else {
        const dateMatch = availableExams.find(e => e.date === selectedDate);
        if (dateMatch && !selectedExamKey) {
          setSelectedExamKey(dateMatch.key);
        }
      }
    }
  }, [selectedDate, testId, examTitle, availableExams]);

  useEffect(() => {
    loadSchedules();
  }, [selectedDate, selectedClassId, selectedBatchId]);

  // Load master marks across all subjects for selectedDate (Admin overview)
  useEffect(() => {
    let active = true;
    const fetchAllSubjectsMarks = async () => {
      setLoadingAllSubjectsMarks(true);
      try {
        const records = await dbService.list('class10_daily_marks', [
          where('date', '==', selectedDate)
        ], true);
        if (active) {
          setAllSubjectsMarks(records || []);
        }
      } catch (err) {
        console.error('Error fetching all subjects marks for Class 10 overview:', err);
      } finally {
        if (active) setLoadingAllSubjectsMarks(false);
      }
    };
    if (viewMode === 'all_subjects' || viewMode === 'analytics') {
      fetchAllSubjectsMarks();
    }
    return () => { active = false; };
  }, [selectedDate, viewMode]);

  // Find active schedule for selected date
  const activeSchedule = useMemo(() => {
    return schedules.find((s: any) => 
      s.date === selectedDate && 
      s.classId === selectedClassId &&
      (!selectedBatchId || s.batchId === selectedBatchId)
    );
  }, [schedules, selectedDate, selectedClassId, selectedBatchId]);

  // Load existing marks for active schedule & load past subject marks for comparison
  useEffect(() => {
    const loadMarksData = async () => {
      if (!selectedSubjectId) return;

      try {
        // 1. Load current schedule's marks if schedule exists
        if (activeSchedule) {
          const marksList = await dbService.list('class10_daily_marks', [
            where('scheduleId', '==', activeSchedule.id)
          ], true);

          const marksMap: Record<string, { marksObtained: number | ''; isAbsent: boolean }> = {};
          (marksList || []).forEach((m: any) => {
            marksMap[m.studentId] = {
              marksObtained: m.isAbsent ? '' : (m.marksObtained ?? ''),
              isAbsent: !!m.isAbsent
            };
          });
          setCurrentMarks(marksMap);
        } else {
          setCurrentMarks({});
        }

        // 2. Load all past marks for this subject to calculate LAST WEEK's score
        // We query marks for this subject across dates earlier than selectedDate
        const allSubjectMarks = await dbService.list('class10_daily_marks', [
          where('subjectId', '==', selectedSubjectId)
        ], true);

        // Filter out marks for selectedDate and filter for dates strictly before selectedDate
        const past = (allSubjectMarks || []).filter((m: any) => m.date < selectedDate);
        setPastMarksForSubject(past);

      } catch (e) {
        console.error("Error loading daily exam marks:", e);
      }
    };

    loadMarksData();
  }, [activeSchedule, selectedSubjectId, selectedDate]);

  // Save/Update Daily Schedule on the day
  const handleSaveSchedule = async () => {
    if (!selectedClassId) {
      toast.error("Please select Class 10.");
      return null;
    }
    if (!selectedSubjectId) {
      toast.error("Please select a subject.");
      return null;
    }
    if (!maxMarks || maxMarks <= 0) {
      toast.error("Please enter valid maximum marks.");
      return null;
    }

    const selectedSubObj = subjects.find(s => s.id === selectedSubjectId);
    const selectedTeacherObj = teachers.find(t => t.uid === assignedTeacherId || t.id === assignedTeacherId);

    const scheduleId = activeSchedule?.id || `c10_sch_${selectedDate}_${selectedClassId}_${selectedBatchId || 'all'}`;

    const scheduleData = {
      date: selectedDate,
      classId: selectedClassId,
      batchId: selectedBatchId || '',
      subjectId: selectedSubjectId,
      subjectName: selectedSubObj?.name || 'Subject',
      maxMarks: Number(maxMarks),
      testId: testId.trim() || `DT-${selectedDate.replace(/-/g, '').slice(2)}`,
      examTitle: examTitle.trim() || 'Daily Test',
      topic: topic.trim() || '',
      teacherId: assignedTeacherId || '',
      teacherName: selectedTeacherObj?.name || '',
      updatedAt: new Date().toISOString()
    };

    try {
      await dbService.set('class10_daily_schedules', scheduleId, scheduleData);
      toast.success(`Subject schedule for ${selectedDate} saved successfully! (${selectedSubObj?.name || 'Subject'})`);
      loadSchedules();
      return { id: scheduleId, ...scheduleData };
    } catch (e: any) {
      console.error("Error saving daily exam schedule:", e);
      toast.error("Failed to save schedule.");
      return null;
    }
  };

  // Delete a scheduled exam and its associated marks
  const handleDeleteSchedule = async (scheduleId: string, scheduleInfo?: string) => {
    const confirmMsg = scheduleInfo 
      ? `Are you sure you want to delete the scheduled exam for "${scheduleInfo}"?\n\nThis will permanently remove the schedule and any student marks logged under it.`
      : `Are you sure you want to delete this scheduled exam?\n\nThis will permanently remove the schedule and any student marks logged under it.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      // 1. Delete schedule record
      await dbService.delete('class10_daily_schedules', scheduleId);

      // 2. Find and delete associated marks for this schedule
      const associatedMarks = await dbService.list('class10_daily_marks', [
        where('scheduleId', '==', scheduleId)
      ], true);

      if (associatedMarks && associatedMarks.length > 0) {
        await Promise.all(
          associatedMarks.map((m: any) => dbService.delete('class10_daily_marks', m.id))
        );
      }

      toast.success('Scheduled exam deleted successfully!');

      if (activeSchedule?.id === scheduleId) {
        setCurrentMarks({});
      }

      await loadSchedules();
    } catch (e: any) {
      console.error('Error deleting schedule:', e);
      toast.error('Failed to delete scheduled exam.');
    }
  };

  // Helper to calculate student's last week percentage in THIS subject
  const getLastWeekSubjectPerformance = (studentId: string): { lastWeekPct: number | null; lastWeekDate: string | null } => {
    if (!pastMarksForSubject || pastMarksForSubject.length === 0) {
      return { lastWeekPct: null, lastWeekDate: null };
    }

    // Filter student's past records for this subject
    const studentRecords = pastMarksForSubject.filter((m: any) => m.studentId === studentId && !m.isAbsent && m.maxMarks > 0);
    if (studentRecords.length === 0) {
      return { lastWeekPct: null, lastWeekDate: null };
    }

    // Sort descending by date to find the most recent past test for this subject (last week)
    studentRecords.sort((a, b) => b.date.localeCompare(a.date));

    const mostRecent = studentRecords[0];
    const pct = typeof mostRecent.percentage === 'number' 
      ? mostRecent.percentage 
      : (mostRecent.marksObtained / mostRecent.maxMarks) * 100;

    return {
      lastWeekPct: Math.round(pct * 10) / 10,
      lastWeekDate: mostRecent.date
    };
  };

  // Update mark in state
  const handleMarkChange = (studentId: string, val: string) => {
    const num = val === '' ? '' : Math.min(Number(val), maxMarks);
    setCurrentMarks(prev => ({
      ...prev,
      [studentId]: {
        marksObtained: num === '' ? '' : Math.max(0, Number(num)),
        isAbsent: false
      }
    }));
  };

  // Toggle absent state
  const handleToggleAbsent = (studentId: string) => {
    setCurrentMarks(prev => {
      const curr = prev[studentId] || { marksObtained: '', isAbsent: false };
      return {
        ...prev,
        [studentId]: {
          marksObtained: '',
          isAbsent: !curr.isAbsent
        }
      };
    });
  };

  // Quick mark all present with default score or clear
  const handleMarkAllPresent = () => {
    const updated: Record<string, { marksObtained: number | ''; isAbsent: boolean }> = {};
    class10Students.forEach(s => {
      const sid = s.uid || s.id;
      const existing = currentMarks[sid];
      updated[sid] = {
        marksObtained: existing && existing.marksObtained !== '' ? existing.marksObtained : '',
        isAbsent: false
      };
    });
    setCurrentMarks(updated);
    toast.success("All students marked as Present.");
  };

  // Batch Save All Student Marks to Firestore
  const handleSaveMarks = async () => {
    let targetSchedule = activeSchedule;

    if (!targetSchedule) {
      targetSchedule = await handleSaveSchedule();
      if (!targetSchedule) return;
    }

    setSavingMarks(true);
    const updates: any[] = [];
    const currentSubObj = subjects.find(s => s.id === selectedSubjectId);

    class10Students.forEach(student => {
      const sid = student.uid || student.id;
      const attInfo = getStudentAttendanceInfo(sid);
      const entry = currentMarks[sid];
      const isAbsent = entry && typeof entry.isAbsent === 'boolean' ? entry.isAbsent : attInfo.isAbsent;
      const marksObtained = (!isAbsent && typeof entry?.marksObtained === 'number') ? entry.marksObtained : 0;
      const pct = isAbsent ? 0 : Math.round(((marksObtained / maxMarks) * 100) * 10) / 10;
      const gradeObj = isAbsent ? { grade: 'ABSENT', color: 'text-rose-600', bg: 'bg-rose-100' } : calculateGrade(pct);

      const docId = `${targetSchedule.id}_${sid}`;
      updates.push({
        id: docId,
        data: {
          scheduleId: targetSchedule.id,
          testId: targetSchedule.testId || testId || '',
          examTitle: targetSchedule.examTitle || examTitle || 'Daily Test',
          topic: targetSchedule.topic || topic || '',
          date: selectedDate,
          classId: selectedClassId,
          batchId: selectedBatchId || '',
          subjectId: selectedSubjectId,
          subjectName: currentSubObj?.name || 'Subject',
          studentId: sid,
          studentName: student.name || '',
          rollNumber: getStudentRollNumber(student, class10Students.indexOf(student), class10Students),
          marksObtained: isAbsent ? 0 : marksObtained,
          maxMarks: Number(maxMarks),
          percentage: pct,
          grade: gradeObj.grade,
          isAbsent,
          enteredBy: profile?.name || profile?.email || 'Teacher',
          updatedAt: new Date().toISOString()
        }
      });
    });

    try {
      await Promise.all(updates.map(u => dbService.set('class10_daily_marks', u.id, u.data)));
      toast.success(`Class 10 ${currentSubObj?.name} daily exam marks saved successfully! (${updates.length} students)`);
      
      // Refresh past subject marks
      const allSubjectMarks = await dbService.list('class10_daily_marks', [
        where('subjectId', '==', selectedSubjectId)
      ], true);
      const past = (allSubjectMarks || []).filter((m: any) => m.date < selectedDate);
      setPastMarksForSubject(past);
    } catch (e: any) {
      console.error("Error saving daily exam marks:", e);
      toast.error("Failed to save marks.");
    } finally {
      setSavingMarks(false);
    }
  };

  const isRawIdString = (val?: any): boolean => {
    if (!val || typeof val !== 'string') return true;
    const str = val.trim();
    if (str.length >= 15 && !str.includes(' ') && /^[a-zA-Z0-9_-]+$/.test(str)) {
      return true;
    }
    return false;
  };

  // Class 10 Subject selection helper
  const activeSubjectObj = useMemo(() => {
    if (!selectedSubjectId) {
      return teacherClass10Subjects[0] || class10Subjects[0] || subjects[0];
    }
    const selLower = String(selectedSubjectId).toLowerCase().trim();
    return subjects.find(s => s.id === selectedSubjectId || String(s.name || '').toLowerCase().trim() === selLower) || 
      teacherClass10Subjects.find(s => s.id === selectedSubjectId || String(s.name || '').toLowerCase().trim() === selLower) || 
      class10Subjects.find(s => s.id === selectedSubjectId || String(s.name || '').toLowerCase().trim() === selLower) ||
      teacherClass10Subjects[0] ||
      class10Subjects[0];
  }, [subjects, teacherClass10Subjects, class10Subjects, selectedSubjectId]);

  const activeClassObj = targetClasses.find(c => c.id === selectedClassId);

  const currentSubjectName = useMemo(() => {
    // For non-admin teachers, strictly prefer active item in teacherClass10Subjects or first assigned subject
    if (!isAdminUser && teacherClass10Subjects.length > 0) {
      const activeInTeacher = teacherClass10Subjects.find(s => s.id === selectedSubjectId);
      if (activeInTeacher?.name && !isRawIdString(activeInTeacher.name)) return activeInTeacher.name;
      const firstValid = teacherClass10Subjects.find(s => s.name && !isRawIdString(s.name));
      if (firstValid?.name) return firstValid.name;
    }

    // 1. Try activeSubjectObj name/title/displayName if not a raw ID
    if (activeSubjectObj) {
      if (activeSubjectObj.name && !isRawIdString(activeSubjectObj.name)) return activeSubjectObj.name;
      if (activeSubjectObj.title && !isRawIdString(activeSubjectObj.title)) return activeSubjectObj.title;
      if (activeSubjectObj.subjectName && !isRawIdString(activeSubjectObj.subjectName)) return activeSubjectObj.subjectName;
      if (activeSubjectObj.displayName && !isRawIdString(activeSubjectObj.displayName)) return activeSubjectObj.displayName;
    }

    // 2. Try activeSchedule.subjectName if not a raw ID
    if (activeSchedule?.subjectName && !isRawIdString(activeSchedule.subjectName)) {
      return activeSchedule.subjectName;
    }

    // 3. Try selected exam in availableExams
    if (selectedExamKey) {
      const found = availableExams.find(e => e.key === selectedExamKey);
      if (found && found.subjectNames.length > 0) {
        const cleanName = found.subjectNames.find(n => !isRawIdString(n));
        if (cleanName) return cleanName;
      }
    }

    // 4. Try teacher's assigned subjects list
    if (teacherClass10Subjects.length > 0) {
      const foundSub = teacherClass10Subjects.find(s => s.name && !isRawIdString(s.name));
      if (foundSub?.name) return foundSub.name;
    }

    // 5. Try profile subjects
    if (Array.isArray(profile?.subjects) && profile.subjects.length > 0) {
      for (const s of profile.subjects) {
        const candidate = typeof s === 'string' ? s : (s?.name || s?.subjectName);
        if (candidate && !isRawIdString(candidate)) return candidate;
      }
    }

    // 6. Try profile subject assignments
    if (Array.isArray(profile?.subjectAssignments) && profile.subjectAssignments.length > 0) {
      for (const sa of profile.subjectAssignments) {
        if (sa?.subjectName && !isRawIdString(sa.subjectName)) return sa.subjectName;
      }
    }

    // 7. For admins, try class10Subjects or master subjects list
    if (isAdminUser) {
      const masterClean = (class10Subjects || []).find(s => s.name && !isRawIdString(s.name)) ||
        (subjects || []).find(s => s.name && !isRawIdString(s.name));
      if (masterClean?.name) return masterClean.name;
    }

    return 'Subject';
  }, [isAdminUser, selectedSubjectId, activeSubjectObj, activeSchedule, selectedExamKey, availableExams, teacherClass10Subjects, class10Subjects, subjects, profile]);

  return (
    <div className="space-y-6">
      {/* Compact Top Banner & Nav */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-xl p-2.5 px-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Award className="w-5 h-5 text-emerald-400 shrink-0" />
          <h1 className="text-sm sm:text-base font-black tracking-tight">
            Class 10 Daily Exam Marks
          </h1>
          <span className="bg-amber-400/20 text-amber-300 text-xs font-black uppercase px-2.5 py-0.5 rounded-md border border-amber-400/40 flex items-center gap-1 shadow-2xs">
            <BookOpen className="w-3.5 h-3.5 text-amber-300" />
            Subject: {currentSubjectName}
          </span>
          {!isAdminUser && profile?.name && (
            <span className="bg-emerald-500/20 text-emerald-200 text-xs font-bold px-2.5 py-0.5 rounded-md border border-emerald-400/30 flex items-center gap-1">
              <User className="w-3 h-3 text-emerald-300" />
              Teacher: {profile.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-xl border border-white/15 shrink-0 flex-wrap">
          <button
            onClick={() => setViewMode('entry')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              viewMode === 'entry' ? 'bg-emerald-500 text-white shadow-xs' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" /> Marks Entry
          </button>
          <button
            onClick={() => setViewMode('all_subjects')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              viewMode === 'all_subjects' ? 'bg-emerald-500 text-white shadow-xs' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" /> All Subjects Performance
          </button>
          <button
            onClick={() => setViewMode('analytics')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              viewMode === 'analytics' ? 'bg-emerald-500 text-white shadow-xs' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Weekly Performance
          </button>
          <button
            onClick={() => setViewMode('schedule_list')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              viewMode === 'schedule_list' ? 'bg-emerald-500 text-white shadow-xs' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Schedules List
          </button>
        </div>
      </div>

      {/* Single Unified Filter & Control Bar */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 shadow-sm space-y-3">
        {/* Primary Row: Exam Selection & Test Identifiers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2.5 items-end">
          {/* 1. Select Existing Exam Schedule */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Select Saved Exam
            </label>
            <select
              value={selectedExamKey}
              onChange={(e) => handleSelectExam(e.target.value)}
              className="w-full text-xs font-black bg-emerald-50/90 border border-emerald-300 hover:border-emerald-500 rounded-xl px-2.5 py-1.5 text-emerald-950 focus:bg-white outline-none shadow-2xs cursor-pointer transition-all"
            >
              <option value="">-- Choose Saved Exam --</option>
              {availableExams.map((exam) => {
                let formattedDate = exam.date;
                try {
                  formattedDate = format(parseISO(exam.date), 'dd MMM yyyy');
                } catch (e) {}
                return (
                  <option key={exam.key} value={exam.key}>
                    {exam.testId ? `[${exam.testId}] ` : ''}{exam.title} ({formattedDate})
                  </option>
                );
              })}
              <option value="NEW_EXAM">+ Schedule New Exam</option>
            </select>
          </div>

          {/* 2. Test ID / Code Input */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-extrabold text-neutral-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-emerald-600" /> Test ID / Code
            </label>
            <input
              type="text"
              value={testId}
              onChange={(e) => setTestId(e.target.value)}
              placeholder="e.g. DT-101"
              className="w-full text-xs font-black bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-900 focus:bg-white focus:border-emerald-500 outline-none uppercase tracking-wide"
            />
          </div>

          {/* 3. Test Name / Title Input */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-extrabold text-neutral-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-emerald-600" /> Test Name / Title
            </label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="e.g. Daily Slip Test 1"
              className="w-full text-xs font-extrabold bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-900 focus:bg-white focus:border-emerald-500 outline-none"
            />
          </div>

          {/* 4. Subject */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> Subject
            </label>
            {teacherClass10Subjects.length > 1 ? (
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full text-xs font-black bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-900 focus:bg-white outline-none cursor-pointer"
              >
                {teacherClass10Subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <div className="w-full text-xs font-black bg-emerald-100/80 text-emerald-950 border border-emerald-300 rounded-xl px-3 py-1.5 flex items-center justify-between">
                <span>{currentSubjectName}</span>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
              </div>
            )}
          </div>

          {/* 5. Exam Date */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Exam Date</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-1.5 text-neutral-800 focus:bg-white focus:border-emerald-500 outline-none"
            />
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border transition-all cursor-pointer ${
                  selectedDate === format(new Date(), 'yyyy-MM-dd')
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                }`}
                title="Select Today"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
                className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border transition-all cursor-pointer ${
                  selectedDate === format(subDays(new Date(), 1), 'yyyy-MM-dd')
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                }`}
                title="Select Yesterday"
              >
                Yesterday
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Row: Syllabus, Section, Max Marks & Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2.5 items-end pt-1 border-t border-neutral-100">
          {/* Syllabus / Topic Input */}
          <div className="md:col-span-4">
            <label className="block text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider mb-1">
              Syllabus / Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Ch-2 Quadratic Equations formulas"
              className="w-full text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-800 focus:bg-white focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Section / Batch */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider mb-1">
              Section / Batch
            </label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-800 focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
            >
              <option value="">All Sections</option>
              {classBatches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Max Marks */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider mb-1 text-center">
              Max Marks
            </label>
            <input
              type="number"
              min={5}
              max={100}
              value={maxMarks}
              onChange={(e) => setMaxMarks(Number(e.target.value))}
              className="w-full text-xs font-black bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-1.5 text-neutral-900 focus:bg-white focus:border-emerald-500 outline-none text-center"
            />
          </div>

          {/* Save / Update Schedule Button */}
          <div className="md:col-span-2">
            <button
              onClick={handleSaveSchedule}
              className="w-full py-1.5 px-2.5 bg-neutral-800 hover:bg-neutral-900 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Save Schedule
            </button>
          </div>

          {/* Save Marks Primary Action */}
          <div className="md:col-span-2">
            <button
              onClick={handleSaveMarks}
              disabled={savingMarks}
              className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {savingMarks ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" /> Save Marks
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search Student & Total Count Row */}
        <div className="pt-2 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-xs font-bold text-neutral-600 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Class 10 Students ({class10Students.length})</span>
          </div>

          <div className="relative shrink-0">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search student name/roll..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl w-full sm:w-64 focus:bg-white focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Active Schedule Status & Management Banner */}
        {activeSchedule && (
          <div className="mt-2 bg-emerald-50/90 border border-emerald-200 rounded-xl p-2.5 px-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 font-bold text-emerald-950">
              <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-md text-[10px] uppercase font-black tracking-wider">
                Active Schedule
              </span>
              {activeSchedule.testId && (
                <span className="bg-emerald-200/90 text-emerald-900 font-mono px-2 py-0.5 rounded text-[11px] font-black">
                  ID: {activeSchedule.testId}
                </span>
              )}
              <span>
                {activeSchedule.examTitle || 'Daily Test'} — {activeSchedule.subjectName || currentSubjectName}
              </span>
              <span className="text-emerald-700 font-semibold">
                (Max Marks: {activeSchedule.maxMarks})
              </span>
              {activeSchedule.topic && (
                <span className="text-emerald-800 text-[11px] font-medium bg-emerald-100/80 px-2 py-0.5 rounded-md">
                  Topic: {activeSchedule.topic}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveSchedule}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                title="Update schedule details"
              >
                <Save className="w-3.5 h-3.5" /> Save / Update Schedule
              </button>
              <button
                onClick={() => handleDeleteSchedule(activeSchedule.id, `${activeSchedule.date} - ${activeSchedule.subjectName || currentSubjectName}`)}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                title="Delete this Scheduled Exam"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Schedule
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main View Modes */}
      {viewMode === 'entry' && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs space-y-3">
          {/* Student Marks Entry Table */}
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-neutral-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-100/90 text-neutral-700 text-xs uppercase font-black tracking-wider border-b border-neutral-200/80">
                    <th className="p-2.5 text-center w-20">
                      <button
                        type="button"
                        onClick={() => handleHeaderClick('roll')}
                        className={`mx-auto px-2.5 py-1.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1 shadow-2xs border cursor-pointer select-none ${
                          sortColumn === 'roll'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-102'
                            : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 border-neutral-200/90'
                        }`}
                        title="Sort by Roll Number"
                      >
                        <Hash className={`w-3.5 h-3.5 ${sortColumn === 'roll' ? 'text-white' : 'text-emerald-600'}`} />
                        <span>Roll</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortColumn === 'roll' ? 'text-white' : 'text-neutral-400'}`} />
                      </button>
                    </th>
                    <th className="p-2.5">
                      <button
                        type="button"
                        onClick={() => handleHeaderClick('name')}
                        className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-1.5 shadow-2xs border cursor-pointer select-none ${
                          sortColumn === 'name'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-102'
                            : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 border-neutral-200/90'
                        }`}
                        title="Sort by Student Name"
                      >
                        <User className={`w-3.5 h-3.5 ${sortColumn === 'name' ? 'text-white' : 'text-emerald-600'}`} />
                        <span>Student Name & Details</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortColumn === 'name' ? 'text-white' : 'text-neutral-400'}`} />
                      </button>
                    </th>
                    <th className="p-2.5 text-center w-36">
                      <button
                        type="button"
                        onClick={() => handleHeaderClick('attendance')}
                        className={`mx-auto px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs border cursor-pointer select-none ${
                          sortColumn === 'attendance'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-102'
                            : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 border-neutral-200/90'
                        }`}
                        title="Sort by Attendance Status"
                      >
                        <CalendarCheck className={`w-3.5 h-3.5 ${sortColumn === 'attendance' ? 'text-white' : 'text-emerald-600'}`} />
                        <span>Attendance</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortColumn === 'attendance' ? 'text-white' : 'text-neutral-400'}`} />
                      </button>
                    </th>
                    <th className="p-2.5 text-center w-36">
                      <button
                        type="button"
                        onClick={() => handleHeaderClick('marks')}
                        className={`mx-auto px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs border cursor-pointer select-none ${
                          sortColumn === 'marks'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-102'
                            : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 border-neutral-200/90'
                        }`}
                        title="Sort by Marks"
                      >
                        <Award className={`w-3.5 h-3.5 ${sortColumn === 'marks' ? 'text-white' : 'text-emerald-600'}`} />
                        <span>Marks Obtained</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortColumn === 'marks' ? 'text-white' : 'text-neutral-400'}`} />
                      </button>
                    </th>
                    <th className="p-2.5 text-center w-28">
                      <div className="mx-auto px-3 py-1.5 rounded-xl font-extrabold text-xs bg-white text-neutral-700 border border-neutral-200/90 inline-flex items-center gap-1.5 shadow-2xs">
                        <Target className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Max Marks</span>
                      </div>
                    </th>
                    <th className="p-2.5 text-center w-48">
                      <button
                        type="button"
                        onClick={() => handleHeaderClick('percentage')}
                        className={`mx-auto px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs border cursor-pointer select-none ${
                          sortColumn === 'percentage'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-102'
                            : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 border-neutral-200/90'
                        }`}
                        title="Sort by Percentage"
                      >
                        <BarChart2 className={`w-3.5 h-3.5 ${sortColumn === 'percentage' ? 'text-white' : 'text-emerald-600'}`} />
                        <span>Percentage & Comparison</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortColumn === 'percentage' ? 'text-white' : 'text-neutral-400'}`} />
                      </button>
                    </th>
                    <th className="p-2.5 text-center w-24">
                      <button
                        type="button"
                        onClick={() => handleHeaderClick('grade')}
                        className={`mx-auto px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs border cursor-pointer select-none ${
                          sortColumn === 'grade'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-102'
                            : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 border-neutral-200/90'
                        }`}
                        title="Sort by Grade"
                      >
                        <Award className={`w-3.5 h-3.5 ${sortColumn === 'grade' ? 'text-white' : 'text-emerald-600'}`} />
                        <span>Grade</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortColumn === 'grade' ? 'text-white' : 'text-neutral-400'}`} />
                      </button>
                    </th>
                    <th className="p-2.5 text-center">
                      <div className="mx-auto px-3 py-1.5 rounded-xl font-extrabold text-xs bg-white text-neutral-700 border border-neutral-200/90 inline-flex items-center gap-1.5 shadow-2xs">
                        <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Progress Note</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-sm font-medium text-neutral-800">
                  {loadingStudents ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-neutral-500 font-bold">
                        <RefreshCw className="w-5 h-5 animate-spin inline-block mr-2 text-emerald-600" />
                        Loading Class 10 students...
                      </td>
                    </tr>
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-neutral-400 font-bold">
                        No Class 10 students found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student, idx) => {
                      const sId = student.uid || student.id;
                      const globalIdx = class10Students.indexOf(student);
                      const assignedRoll = getStudentRollNumber(student, globalIdx, class10Students);
                      const attInfo = getStudentAttendanceInfo(sId);
                      const entry = currentMarks[sId] || { marksObtained: '', isAbsent: false };
                      const isAbsent = entry && typeof entry.isAbsent === 'boolean' ? entry.isAbsent : attInfo.isAbsent;
                      const marksObtained = (!isAbsent && typeof entry.marksObtained === 'number') ? entry.marksObtained : null;
                      
                      const currentPct = (marksObtained !== null && maxMarks > 0)
                        ? Math.round(((marksObtained / maxMarks) * 100) * 10) / 10
                        : null;

                      // Fetch last week's subject score for this student
                      const { lastWeekPct, lastWeekDate } = getLastWeekSubjectPerformance(sId);

                      // Comparison logic
                      let comparisonType: 'improved' | 'decreased' | 'same' | 'none' = 'none';
                      let diffPct = 0;

                      if (currentPct !== null && lastWeekPct !== null) {
                        diffPct = Math.round((currentPct - lastWeekPct) * 10) / 10;
                        if (diffPct > 0) comparisonType = 'improved';
                        else if (diffPct < 0) comparisonType = 'decreased';
                        else comparisonType = 'same';
                      }

                      const gradeObj = isAbsent 
                        ? { grade: 'ABSENT', color: 'text-rose-600', bg: 'bg-rose-100' } 
                        : (currentPct !== null ? calculateGrade(currentPct) : { grade: '-', color: 'text-neutral-400', bg: 'bg-neutral-50' });

                      const studentBatch = batches.find(b => b.id === student.batchId);
                      const isFirstInBatch = !selectedBatchId && sortColumn === 'roll' && (idx === 0 || student.batchId !== filteredStudents[idx - 1]?.batchId);

                      return (
                        <React.Fragment key={sId}>
                          {isFirstInBatch && (
                            <tr className="bg-emerald-50/70 border-y border-emerald-200">
                              <td colSpan={8} className="py-2.5 px-4 font-black text-xs text-emerald-900 uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-emerald-600" />
                                  <span>Batch / Section: {studentBatch?.name || student.batch || student.section || 'General Batch'}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr 
                            className={`hover:bg-neutral-50/80 transition-colors ${isAbsent ? 'bg-rose-50/30' : idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/20'}`}
                          >
                            {/* Auto Roll Number from Class Batch */}
                            <td className="p-3 text-center">
                              <span className="font-extrabold text-xs font-mono text-neutral-800 bg-neutral-100/90 border border-neutral-200 px-2 py-1 rounded-md shadow-2xs inline-block min-w-[28px]">
                                {assignedRoll}
                              </span>
                            </td>

                            {/* Student Name */}
                            <td className="p-3">
                              <div className="font-extrabold text-neutral-900 flex items-center gap-2">
                                <span>{student.name}</span>
                                {(studentBatch || student.batch || student.section) && (
                                  <span className="text-[10px] font-bold text-neutral-600 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded">
                                    {studentBatch?.name || student.batch || student.section}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-neutral-400 font-medium">
                                Admn: {student.admissionNumber || student.admissionNo || 'N/A'} • {student.fatherName || student.parentName ? `S/O ${student.fatherName || student.parentName}` : ''}
                              </div>
                            </td>

                        {/* Attendance Status from Attendance Module */}
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-xl font-extrabold text-xs border inline-flex items-center gap-1 mx-auto shadow-2xs ${attInfo.color}`}>
                            {attInfo.isAbsent ? (
                              <X className="w-3.5 h-3.5 text-rose-600" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                            {attInfo.label}
                          </span>
                        </td>

                        {/* Marks Obtained Input */}
                        <td className="p-3 text-center">
                          {isAbsent ? (
                            <span className="text-xs font-black text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                              ABSENT
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={maxMarks}
                              step={0.5}
                              placeholder="0"
                              value={entry.marksObtained}
                              onChange={(e) => handleMarkChange(sId, e.target.value)}
                              className="w-24 text-center font-black text-base bg-neutral-50 border border-neutral-300 focus:border-emerald-500 focus:bg-white rounded-xl py-1.5 px-2 text-neutral-900 outline-none"
                            />
                          )}
                        </td>

                        {/* Max Marks */}
                        <td className="p-3 text-center font-bold text-neutral-500 text-xs">
                          / {maxMarks}
                        </td>

                        {/* Percentage & GREEN / RED Highlight based on Subject Comparison */}
                        <td className="p-3 text-center">
                          {isAbsent || currentPct === null ? (
                            <span className="text-xs text-neutral-400 font-medium">-</span>
                          ) : (
                            <div className="flex flex-col items-center">
                              {/* HIGHLIGHT BOX FOR PERCENTAGE */}
                              <div className={`px-3 py-1.5 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 shadow-xs border transition-all ${
                                comparisonType === 'improved'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-black'
                                  : comparisonType === 'decreased'
                                  ? 'bg-rose-100 text-rose-900 border-rose-400 font-black'
                                  : 'bg-neutral-100 text-neutral-800 border-neutral-200'
                              }`}>
                                {comparisonType === 'improved' && (
                                  <ArrowUpRight className="w-4 h-4 text-emerald-700 stroke-[3]" />
                                )}
                                {comparisonType === 'decreased' && (
                                  <ArrowDownRight className="w-4 h-4 text-rose-700 stroke-[3]" />
                                )}
                                <span>{currentPct}%</span>
                              </div>

                              {/* COMPARISON DETAILS BADGE */}
                              {lastWeekPct !== null ? (
                                <span className={`text-[10px] font-extrabold mt-1 px-1.5 py-0.5 rounded ${
                                  comparisonType === 'improved'
                                    ? 'text-emerald-700 bg-emerald-50'
                                    : comparisonType === 'decreased'
                                    ? 'text-rose-700 bg-rose-50'
                                    : 'text-neutral-500'
                                }`}>
                                  {comparisonType === 'improved' && `Last week (${lastWeekPct}%): +${diffPct}% improved`}
                                  {comparisonType === 'decreased' && `Last week (${lastWeekPct}%): ${diffPct}% decreased`}
                                  {comparisonType === 'same' && `Last week (${lastWeekPct}%): No change`}
                                </span>
                              ) : (
                                <span className="text-[10px] text-neutral-400 font-medium mt-0.5">
                                  No previous data
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Grade */}
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-lg font-black text-xs uppercase ${gradeObj.bg} ${gradeObj.color}`}>
                            {gradeObj.grade}
                          </span>
                        </td>

                        {/* Performance Notes */}
                        <td className="p-3 text-center text-xs">
                          {comparisonType === 'improved' && (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              🌟 Improved
                            </span>
                          )}
                          {comparisonType === 'decreased' && (
                            <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              ⚠️ Needs Focus
                            </span>
                          )}
                          {comparisonType === 'same' && (
                            <span className="text-neutral-500 font-medium">Stable</span>
                          )}
                          {comparisonType === 'none' && !isAbsent && (
                            <span className="text-neutral-400 font-medium">First Exam</span>
                          )}
                          {isAbsent && (
                            <span className="text-rose-500 font-bold">Absent</span>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

          {/* Bottom Save Action Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
            <p className="text-xs text-neutral-500 font-bold">
              Total Students: {class10Students.length}
            </p>

            <button
              onClick={handleSaveMarks}
              disabled={savingMarks}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <Save className="w-5 h-5" /> Save All Marks
            </button>
          </div>
        </div>
      )}

      {/* View Mode: All Subjects Master Performance Overview (Admin View) */}
      {viewMode === 'all_subjects' && (
        <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart2 className="w-6 h-6 text-emerald-600" />
                <h2 className="text-xl font-black text-neutral-900">
                  Class 10 All Subjects Daily Exam Master Matrix
                </h2>
              </div>
              <p className="text-xs font-medium text-neutral-500 mt-1">
                Admin & Faculty Master Overview • Exam Date: <strong className="text-neutral-900">{selectedDate}</strong> • {selectedBatchId ? batches.find(b => b.id === selectedBatchId)?.name || 'Batch' : 'All Batches/Sections'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Select Exam Name Dropdown in All Subjects Overview */}
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-xl">
                <span className="text-[11px] font-extrabold text-emerald-900 uppercase tracking-wider shrink-0">
                  Exam Name:
                </span>
                <select
                  value={selectedExamKey}
                  onChange={(e) => handleSelectExam(e.target.value)}
                  className="bg-white text-xs font-black text-emerald-950 border border-emerald-300 rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option value="">-- Choose Exam Name --</option>
                  {availableExams.map((exam) => {
                    let formattedDate = exam.date;
                    try {
                      formattedDate = format(parseISO(exam.date), 'dd MMM yyyy');
                    } catch (e) {}
                    return (
                      <option key={exam.key} value={exam.key}>
                        {exam.title} ({formattedDate})
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-2xs border border-neutral-200 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-emerald-600" /> Print / PDF Master Report
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50/80 border border-emerald-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">Class 10 Pass Rate</span>
              <div className="text-2xl font-black text-emerald-950 mt-1">
                {(() => {
                  const attempted = masterMatrixData.filter(m => m.overallPct !== null);
                  if (attempted.length === 0) return '0%';
                  const passed = attempted.filter(m => (m.overallPct || 0) >= 35);
                  return `${Math.round((passed.length / attempted.length) * 100)}%`;
                })()}
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">Overall Class Pass %</span>
            </div>

            <div className="bg-teal-50/80 border border-teal-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-extrabold text-teal-800 uppercase tracking-wider block">Total Class 10 Subjects</span>
              <div className="text-2xl font-black text-teal-950 mt-1">
                {class10Subjects.length}
              </div>
              <span className="text-[10px] text-teal-700 font-semibold mt-0.5 block">Subjects Tracked</span>
            </div>

            <div className="bg-blue-50/80 border border-blue-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider block">Total Students Evaluated</span>
              <div className="text-2xl font-black text-blue-950 mt-1">
                {masterMatrixData.length}
              </div>
              <span className="text-[10px] text-blue-700 font-semibold mt-0.5 block">Enrolled in Class 10</span>
            </div>

            <div className="bg-purple-50/80 border border-purple-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-extrabold text-purple-800 uppercase tracking-wider block">Top Performer</span>
              <div className="text-sm font-black text-purple-950 mt-1 truncate">
                {(() => {
                  const sorted = [...masterMatrixData].sort((a, b) => (b.overallPct || 0) - (a.overallPct || 0));
                  return sorted[0] ? `${sorted[0].student.name} (${sorted[0].overallPct ?? 0}%)` : 'N/A';
                })()}
              </div>
              <span className="text-[10px] text-purple-700 font-semibold mt-0.5 block">Highest Overall Score</span>
            </div>
          </div>

          {/* Subject Average Score Pill Bar */}
          <div className="bg-neutral-50 p-3 rounded-2xl border border-neutral-200 space-y-1.5">
            <span className="text-[11px] font-extrabold text-neutral-600 uppercase tracking-wider block">
              Class 10 Subject-wise Class Averages ({selectedDate}):
            </span>
            <div className="flex flex-wrap gap-2">
              {class10Subjects.map(sub => {
                const class10StudentIds = new Set(class10Students.map(s => s.uid || s.id));
                const subMarks = allSubjectsMarks.filter((m: any) => 
                  m.subjectId === sub.id && 
                  class10StudentIds.has(m.studentId) && 
                  !m.isAbsent && 
                  typeof m.marksObtained === 'number'
                );
                let avgPct: number | string = 'N/A';
                if (subMarks.length > 0) {
                  const totalPct = subMarks.reduce((acc: number, curr: any) => acc + ((curr.marksObtained / (curr.maxMarks || 25)) * 100), 0);
                  avgPct = `${Math.round(totalPct / subMarks.length)}%`;
                }
                return (
                  <div key={sub.id} className="bg-white border border-neutral-200 px-3 py-1 rounded-xl shadow-2xs flex items-center gap-2">
                    <span className="font-bold text-xs text-neutral-800">{sub.name}</span>
                    <span className="font-black text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{avgPct}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Master Table Matrix */}
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-900 text-white text-xs uppercase font-black tracking-wider border-b border-neutral-800">
                  <th className="p-3 text-center w-14">Roll</th>
                  <th className="p-3 min-w-[180px]">Student Details</th>
                  <th className="p-3 text-center min-w-[110px]">Section</th>
                  {class10Subjects.map(sub => (
                    <th key={sub.id} className="p-3 text-center min-w-[110px] border-l border-neutral-800">
                      <div className="font-black text-emerald-300">{sub.name}</div>
                      <div className="text-[9px] text-neutral-400 font-medium font-mono">{sub.code || 'SUB'}</div>
                    </th>
                  ))}
                  <th className="p-3 text-center border-l border-neutral-800 min-w-[110px] bg-neutral-800">Total Marks</th>
                  <th className="p-3 text-center border-l border-neutral-800 min-w-[100px] bg-neutral-800">Overall %</th>
                  <th className="p-3 text-center border-l border-neutral-800 w-24 bg-neutral-800">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-xs font-medium text-neutral-800 bg-white">
                {loadingAllSubjectsMarks ? (
                  <tr>
                    <td colSpan={5 + class10Subjects.length} className="p-8 text-center text-neutral-500 font-bold">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                      Loading Class 10 all subjects marks matrix...
                    </td>
                  </tr>
                ) : masterMatrixData.length === 0 ? (
                  <tr>
                    <td colSpan={5 + class10Subjects.length} className="p-8 text-center text-neutral-400 font-bold">
                      No Class 10 students found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  masterMatrixData.map((row, idx) => (
                    <tr key={row.sId} className={`hover:bg-neutral-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/40'}`}>
                      {/* Roll No */}
                      <td className="p-3 text-center">
                        <span className="font-extrabold font-mono text-neutral-800 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded shadow-2xs">
                          {row.assignedRoll}
                        </span>
                      </td>

                      {/* Student Details */}
                      <td className="p-3">
                        <div className="font-extrabold text-neutral-900 text-sm">{row?.student?.name || 'Unknown Student'}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">
                          Admn: {row?.student?.admissionNumber || row?.student?.admissionNo || 'N/A'}
                        </div>
                      </td>

                      {/* Section */}
                      <td className="p-3 text-center">
                        <span className="font-bold text-[11px] text-neutral-700 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded">
                          {batches.find(b => b.id === row?.student?.batchId)?.name || row?.student?.batch || row?.student?.section || 'General'}
                        </span>
                      </td>

                      {/* Individual Subject Columns */}
                      {class10Subjects.map(sub => {
                        const subData = row.subjectMap[sub.id];
                        if (!subData) return <td key={sub.id} className="p-3 text-center border-l border-neutral-100 text-neutral-300">-</td>;

                        if (subData.isAbsent) {
                          return (
                            <td key={sub.id} className="p-3 text-center border-l border-neutral-100 bg-rose-50/50">
                              <span className="text-rose-600 font-extrabold text-[11px] bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded">
                                ABS
                              </span>
                            </td>
                          );
                        }

                        if (typeof subData.marksObtained === 'number') {
                          return (
                            <td key={sub.id} className="p-3 text-center border-l border-neutral-100">
                              <div className="font-black text-sm text-neutral-900">{subData.marksObtained}</div>
                              <div className="text-[10px] font-bold text-emerald-700">{subData.percentage}%</div>
                            </td>
                          );
                        }

                        return (
                          <td key={sub.id} className="p-3 text-center border-l border-neutral-100 text-neutral-300 font-mono">
                            -
                          </td>
                        );
                      })}

                      {/* Total Marks */}
                      <td className="p-3 text-center border-l border-neutral-200 bg-neutral-50/80 font-extrabold">
                        {row.totalMax > 0 ? (
                          <span className="text-neutral-900 text-sm">
                            {row.totalObtained} <span className="text-[10px] text-neutral-400">/ {row.totalMax}</span>
                          </span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>

                      {/* Overall % */}
                      <td className="p-3 text-center border-l border-neutral-200 bg-neutral-50/80">
                        {row.overallPct !== null ? (
                          <span className={`px-2.5 py-1 rounded-xl font-black text-xs border shadow-2xs ${
                            row.overallPct >= 80 ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                            row.overallPct >= 60 ? 'bg-blue-100 text-blue-900 border-blue-300' :
                            row.overallPct >= 35 ? 'bg-amber-100 text-amber-900 border-amber-300' :
                            'bg-rose-100 text-rose-900 border-rose-300'
                          }`}>
                            {row.overallPct}%
                          </span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>

                      {/* Grade */}
                      <td className="p-3 text-center border-l border-neutral-200 bg-neutral-50/80">
                        <span className={`px-2 py-0.5 rounded font-black text-xs uppercase ${row.gradeObj.bg} ${row.gradeObj.color}`}>
                          {row.gradeObj.grade}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Mode 2: Subject Weekly Comparison Analytics */}
      {viewMode === 'analytics' && (
        <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-6">
          <div className="border-b border-neutral-100 pb-4">
            <h2 className="text-xl font-black text-neutral-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Weekly Subject Performance Analytics
            </h2>
            <p className="text-xs font-medium text-neutral-500 mt-1">
              Showing performance trend for <strong className="text-neutral-800">{activeSubjectObj?.name}</strong> compared to previous test
            </p>
          </div>

          {/* Cards Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 uppercase">Improved Students</span>
                <ArrowUpRight className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-900 mt-2">
                {class10Students.filter(s => {
                  const entry = currentMarks[s.uid];
                  if (!entry || entry.isAbsent || typeof entry.marksObtained !== 'number') return false;
                  const currentPct = (entry.marksObtained / maxMarks) * 100;
                  const { lastWeekPct } = getLastWeekSubjectPerformance(s.uid);
                  return lastWeekPct !== null && currentPct > lastWeekPct;
                }).length}
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-800 uppercase">Needs Focus</span>
                <ArrowDownRight className="w-5 h-5 text-rose-600" />
              </div>
              <div className="text-2xl font-black text-rose-900 mt-2">
                {class10Students.filter(s => {
                  const entry = currentMarks[s.uid];
                  if (!entry || entry.isAbsent || typeof entry.marksObtained !== 'number') return false;
                  const currentPct = (entry.marksObtained / maxMarks) * 100;
                  const { lastWeekPct } = getLastWeekSubjectPerformance(s.uid);
                  return lastWeekPct !== null && currentPct < lastWeekPct;
                }).length}
              </div>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700 uppercase">Stable / Baseline</span>
                <Minus className="w-5 h-5 text-neutral-500" />
              </div>
              <div className="text-2xl font-black text-neutral-800 mt-2">
                {class10Students.filter(s => {
                  const entry = currentMarks[s.uid];
                  if (!entry || entry.isAbsent || typeof entry.marksObtained !== 'number') return true;
                  const currentPct = (entry.marksObtained / maxMarks) * 100;
                  const { lastWeekPct } = getLastWeekSubjectPerformance(s.uid);
                  return lastWeekPct === null || currentPct === lastWeekPct;
                }).length}
              </div>
            </div>
          </div>

          {/* List of top improvers & drop cases */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Improvers */}
            <div className="border border-emerald-200 rounded-2xl p-4 bg-emerald-50/30">
              <h3 className="text-sm font-black text-emerald-900 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" /> Top Improved Students
              </h3>
              <div className="space-y-2">
                {class10Students
                  .map(s => {
                    const entry = currentMarks[s.uid];
                    if (!entry || entry.isAbsent || typeof entry.marksObtained !== 'number') return null;
                    const currentPct = Math.round(((entry.marksObtained / maxMarks) * 100) * 10) / 10;
                    const { lastWeekPct } = getLastWeekSubjectPerformance(s.uid);
                    if (lastWeekPct === null || currentPct <= lastWeekPct) return null;
                    return { student: s, currentPct, lastWeekPct, diff: Math.round((currentPct - lastWeekPct) * 10) / 10 };
                  })
                  .filter(Boolean)
                  .sort((a, b) => (b?.diff || 0) - (a?.diff || 0))
                  .slice(0, 10)
                  .map(item => item && (
                    <div key={item.student.uid} className="bg-white p-3 rounded-xl border border-emerald-200 flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-sm text-neutral-900">{item.student.name}</div>
                        <div className="text-xs text-neutral-500">Roll: {getStudentRollNumber(item.student, class10Students.indexOf(item.student), class10Students)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-300">
                          {item.currentPct}% (+{item.diff}%)
                        </div>
                        <div className="text-[10px] text-neutral-400 font-medium">Prev: {item.lastWeekPct}%</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Students Needing Attention */}
            <div className="border border-rose-200 rounded-2xl p-4 bg-rose-50/30">
              <h3 className="text-sm font-black text-rose-900 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <ArrowDownRight className="w-4 h-4 text-rose-600" /> Needs Attention
              </h3>
              <div className="space-y-2">
                {class10Students
                  .map(s => {
                    const entry = currentMarks[s.uid];
                    if (!entry || entry.isAbsent || typeof entry.marksObtained !== 'number') return null;
                    const currentPct = Math.round(((entry.marksObtained / maxMarks) * 100) * 10) / 10;
                    const { lastWeekPct } = getLastWeekSubjectPerformance(s.uid);
                    if (lastWeekPct === null || currentPct >= lastWeekPct) return null;
                    return { student: s, currentPct, lastWeekPct, diff: Math.round((currentPct - lastWeekPct) * 10) / 10 };
                  })
                  .filter(Boolean)
                  .sort((a, b) => (a?.diff || 0) - (b?.diff || 0))
                  .slice(0, 10)
                  .map(item => item && (
                    <div key={item.student.uid} className="bg-white p-3 rounded-xl border border-rose-200 flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-sm text-neutral-900">{item.student.name}</div>
                        <div className="text-xs text-neutral-500">Roll: {getStudentRollNumber(item.student, class10Students.indexOf(item.student), class10Students)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-300">
                          {item.currentPct}% ({item.diff}%)
                        </div>
                        <div className="text-[10px] text-neutral-400 font-medium">Prev: {item.lastWeekPct}%</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Mode 3: Schedule History & Adjustment List */}
      {viewMode === 'schedule_list' && (
        <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
          <div className="border-b border-neutral-100 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-neutral-900">
                Class 10 Daily Schedules List
              </h2>
              <p className="text-xs font-semibold text-neutral-500">
                View all scheduled daily exams with Test IDs, exam titles, and topics
              </p>
            </div>
            <button
              onClick={() => {
                setTestId(`DT-${format(new Date(), 'yyMMdd')}`);
                setExamTitle('Daily Test');
                setTopic('');
                setViewMode('entry');
              }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" /> Schedule New Exam
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 text-xs uppercase font-black">
                  <th className="p-3">Date</th>
                  <th className="p-3">Test ID</th>
                  <th className="p-3">Test Name / Title</th>
                  <th className="p-3">Class / Section</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3 text-center">Max Marks</th>
                  <th className="p-3">Syllabus / Topic</th>
                  <th className="p-3">Subject Teacher</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {schedules.filter((sch: any) => {
                  if (!sch.classId) return true;
                  return targetClasses.some(tc => tc.id === sch.classId) || sch.classId === selectedClassId;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-neutral-400 font-bold">
                      No Class 10 schedules recorded.
                    </td>
                  </tr>
                ) : (
                  schedules
                    .filter((sch: any) => {
                      if (!sch.classId) return true;
                      return targetClasses.some(tc => tc.id === sch.classId) || sch.classId === selectedClassId;
                    })
                    .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')))
                    .map((sch: any) => (
                      <tr key={sch.id} className="hover:bg-neutral-50">
                        <td className="p-3 font-bold text-neutral-900">{sch.date}</td>
                        <td className="p-3 font-mono text-xs font-black">
                          <span className="bg-neutral-100 border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded">
                            {sch.testId || 'N/A'}
                          </span>
                        </td>
                        <td className="p-3 font-extrabold text-neutral-900">
                          {sch.examTitle || sch.title || 'Daily Test'}
                        </td>
                        <td className="p-3 font-semibold text-neutral-700">
                          {classes.find(c => c.id === sch.classId)?.name || 'Class 10'}
                        </td>
                        <td className="p-3 font-black text-emerald-800">{sch.subjectName}</td>
                        <td className="p-3 text-center font-bold">{sch.maxMarks}</td>
                        <td className="p-3 text-xs font-medium text-neutral-600">{sch.topic || 'N/A'}</td>
                        <td className="p-3 text-xs font-medium text-neutral-600">{sch.teacherName || 'N/A'}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedDate(sch.date);
                                if (sch.classId) setSelectedClassId(sch.classId);
                                if (sch.batchId) setSelectedBatchId(sch.batchId);
                                if (sch.subjectId) setSelectedSubjectId(sch.subjectId);
                                if (sch.maxMarks) setMaxMarks(sch.maxMarks);
                                setTestId(sch.testId || '');
                                setExamTitle(sch.examTitle || sch.title || 'Daily Test');
                                setTopic(sch.topic || '');
                                setViewMode('entry');
                              }}
                              className="px-3 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" /> Edit / Enter Marks
                            </button>
                            <button
                              onClick={() => handleDeleteSchedule(sch.id, `${sch.date} - ${sch.subjectName}`)}
                              className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Delete Scheduled Exam"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
