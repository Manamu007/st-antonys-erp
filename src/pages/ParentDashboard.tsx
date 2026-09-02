import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../lib/profileUtils';
import { dbService } from '../services/dbService';
import { where, orderBy, limit } from 'firebase/firestore';
import { useSettings } from '../context/SettingsContext';
import { 
  Users, 
  Calendar, 
  CheckCircle, 
  Clock, 
  CreditCard, 
  BookOpen, 
  Bell,
  ChevronRight,
  TrendingUp,
  Award,
  Book,
  Bus,
  ShieldCheck,
  FileText,
  Mail,
  Zap,
  MapPin,
  Plus,
  LayoutDashboard,
  Phone
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { calculateStudentFee, normalizeYear } from '../lib/feeUtils';

import Student360View from '../components/Student360View';

const ParentDashboard: React.FC = () => {
  const { profile, availableProfiles, switchProfile, hasPermission, isParent, isStudent, isAdmin } = useAuth();
  const { settings } = useSettings();
  
  // Role-based visibility flags
  const canViewFees = hasPermission('portal_student_view_fees') || isAdmin;
  const canViewSchoolFee = hasPermission('portal_student_view_school_fee') || isAdmin;
  const canViewTransportFee = hasPermission('portal_student_view_transport_fee') || isAdmin;
  const canViewHostelFee = hasPermission('portal_student_view_hostel_fee') || isAdmin;
  const canViewOtherFee = hasPermission('portal_student_view_other_fee') || isAdmin;
  
  const canPayFees = hasPermission('portal_student_pay_fees') || isAdmin;
  const canViewSubjects = hasPermission('portal_student_view_subjects') || isAdmin;
  const canViewMarks = hasPermission('portal_student_view_marks') || isAdmin;
  const canViewTimetable = hasPermission('portal_student_view_timetable') || isAdmin;
  const canViewAttendance = hasPermission('portal_student_view_attendance') || isAdmin;
  const canApplyLeave = hasPermission('portal_student_apply_leave') || isAdmin;
  const canViewTransport = hasPermission('portal_student_view_transport') || isAdmin;
  const canViewTeachers = hasPermission('portal_student_view_teachers') || isAdmin;
  const canViewHomework = hasPermission('portal_student_view_homework') || isAdmin;
  const canViewHostel = hasPermission('portal_student_view_hostel') || isAdmin;

  const [children, setChildren] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [fullStudentData, setFullStudentData] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [feeStructures, setFeeStructures] = useState<any[]>([]);
  const [concessions, setConcessions] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [examResults, setExamResults] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [transport, setTransport] = useState<any | null>(null);
  const [notices, setNotices] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [classDetail, setClassDetail] = useState<any | null>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [is360Open, setIs360Open] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  const handleRequestWhatsAppLink = async () => {
    const studentUid = fullStudentData?.uid || selectedChild?.uid || profile?.uid;
    if (!studentUid) {
      toast.error("Student profile is not fully initialized.");
      return;
    }
    
    setRequestLoading(true);
    try {
      const response = await fetch('/api/transport/request-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: studentUid
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request tracking link');
      }
      
      toast.success(`Success! Live tracking link sent over WhatsApp to ${data.recipient}`);
    } catch (error: any) {
      toast.error(error.message || "An unexpected error occurred");
    } finally {
      setRequestLoading(false);
    }
  };

  const navigate = useNavigate();

  useEffect(() => {
    dbService.list('holidays').then(setHolidays).catch((err) => console.error("Error fetching holidays:", err));
  }, []);

  const filteredAttendance = useMemo(() => {
    const currentYear = settings?.currentAcademicYear || '2026-27';
    const currentYearDetails = settings?.academicYearDetails?.find((y: any) => y.name === currentYear);
    const academicYearStartDate = currentYearDetails?.startDate || `${currentYear.slice(0, 4)}-06-01`;

    return attendance.filter((a: any) => {
      if (a.date < academicYearStartDate) return false;

      // Filter out Sundays and Second Saturdays
      try {
        const parts = a.date.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const dateObj = new Date(year, month, day);
          const dayOfWeek = dateObj.getDay();
          const isSunday = dayOfWeek === 0;
          const isSecondSaturday = dayOfWeek === 6 && day >= 8 && day <= 14;
          if (isSunday || isSecondSaturday) return false;
        }
      } catch (e) {}

      const isHoliday = holidays.find(h => {
        const start = h.date;
        const end = h.toDate || h.date;
        return a.date >= start && a.date <= end && h.type !== 'working_day';
      });
      if (isHoliday) return false;
      return true;
    });
  }, [attendance, holidays, settings]);

  useEffect(() => {
    if (availableProfiles.length > 0) {
      const raw = availableProfiles.filter(p => normalizeRole(p.role) === 'student');
      const uniqueMap = new Map<string, any>();
      raw.forEach(p => {
        const pId = p.id || p.uid;
        const pEmail = (p.email || '').toLowerCase().trim();
        const pName = (p.name || '').toLowerCase().trim();
        const pFather = (p.fatherName || '').toLowerCase().trim();
        const pAdmission = (p.admissionNumber || '').toLowerCase().trim();

        let dedupeKey = pId;
        if (pAdmission) {
          dedupeKey = `adm_${pAdmission}`;
        } else if (pEmail && pEmail.includes('@') && !pEmail.includes('bypass')) {
          dedupeKey = `email_${pEmail}`;
        } else if (pName && pFather) {
          dedupeKey = `name_${pName}_${pFather}`;
        } else if (pName) {
          dedupeKey = `name_${pName}`;
        }

        if (dedupeKey && !uniqueMap.has(dedupeKey)) {
          uniqueMap.set(dedupeKey, p);
        }
      });
      const studentProfiles = Array.from(uniqueMap.values());
      setChildren(studentProfiles);
      // Automatically select the student profile
      const currentChild = studentProfiles.find(p => (p.id || p.uid) === (profile?.id || profile?.uid)) || studentProfiles[0] || availableProfiles[0];
      setSelectedChild(currentChild);
    }
  }, [availableProfiles.length, profile?.uid, profile?.id]);

  useEffect(() => {
    if (!selectedChild) return;

    setLoading(true);
    let isCancelled = false;

    const initialCandidateIds = Array.from(new Set([
      selectedChild.id,
      selectedChild.uid,
      (selectedChild as any).studentId,
      (selectedChild as any).docId,
      profile?.id,
      profile?.uid,
      (profile as any)?.studentId
    ].filter(Boolean))) as string[];

    const loadParentDashboardData = async () => {
      try {
        const [
          allStudents,
          allAttendance,
          allFees,
          allPayments,
          allExams,
          allLeaves,
          structData,
          concData,
          classData,
          batchData,
          noticesData
        ] = await Promise.all([
          dbService.list('students', []).catch(() => []),
          dbService.list('attendance', []).catch(() => []),
          dbService.list('fees', []).catch(() => []),
          dbService.list('payments', []).catch(() => []),
          dbService.list('examMarks', []).catch(() => []),
          dbService.list('leaves', []).catch(() => []),
          dbService.list('feeStructures', []).catch(() => []),
          dbService.list('concessions', []).catch(() => []),
          dbService.list('classes', []).catch(() => []),
          dbService.list('batches', []).catch(() => []),
          dbService.list('notices', [limit(5)]).catch(() => [])
        ]);

        if (isCancelled) return;

        // 1. Find matching full student document
        const matched = allStudents.find((s: any) => 
          initialCandidateIds.includes(s.id) ||
          initialCandidateIds.includes(s.uid) ||
          initialCandidateIds.includes(s.studentId) ||
          (s.email && (selectedChild.email || profile?.email) && s.email.toLowerCase() === (selectedChild.email || profile?.email || '').toLowerCase()) ||
          (s.rollNumber && (selectedChild.rollNumber || (profile as any)?.rollNumber) && String(s.rollNumber) === String(selectedChild.rollNumber || (profile as any)?.rollNumber)) ||
          (s.name && (selectedChild.name || profile?.name) && s.name.toLowerCase() === (selectedChild.name || profile?.name || '').toLowerCase())
        );
        setFullStudentData(matched || null);

        const targetIds = new Set([
          ...initialCandidateIds,
          matched?.id,
          matched?.uid,
          (matched as any)?.studentId
        ].filter(Boolean));

        // 2. Attendance
        const filteredAtt = allAttendance.filter((a: any) => targetIds.has(a.studentId) || targetIds.has(a.studentUid));
        const sortedAtt = [...filteredAtt].sort((a, b) => {
          const dateA = new Date(a.date || 0).getTime();
          const dateB = new Date(b.date || 0).getTime();
          return dateB - dateA;
        });
        setAttendance(sortedAtt);

        // 3. Fees & Payments
        setFees(allFees.filter((f: any) => targetIds.has(f.studentId) || targetIds.has(f.studentUid)));
        setPayments(allPayments.filter((p: any) => targetIds.has(p.studentId) || targetIds.has(p.studentUid)));

        // 4. Exam marks
        const filteredExams = allExams.filter((e: any) => targetIds.has(e.studentId) || targetIds.has(e.studentUid));
        const sortedExams = [...filteredExams].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setExamResults(sortedExams.slice(0, 3));

        // 5. Leaves
        const filteredLeaves = allLeaves.filter((l: any) => targetIds.has(l.applicantId) || targetIds.has(l.studentId));
        const sortedLeaves = [...filteredLeaves].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
        setLeaves(sortedLeaves.slice(0, 5));

        // 6. Metadata
        setFeeStructures(structData);
        setConcessions(concData);
        setClasses(classData);
        setBatches(batchData);
        setNotices(noticesData);

        // 7. Homework & Timetable for child's class
        const targetClassId = matched?.classId || selectedChild.classId;
        const targetBatchId = matched?.batchId || selectedChild.batchId;
        if (targetClassId) {
          const [hwData, ttData] = await Promise.all([
            dbService.list('homework', [where('class', '==', targetClassId), limit(50)]).catch(() => []),
            dbService.list('timetableSlots', [where('classId', '==', targetClassId)]).catch(() => [])
          ]);
          if (!isCancelled) {
            const sortedHw = [...hwData].sort((a, b) => new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime());
            const filteredHw = targetBatchId ? sortedHw.filter(h => !h.batchId || h.batchId === targetBatchId) : sortedHw;
            setHomework(filteredHw.slice(0, 5));

            const filteredTt = targetBatchId ? ttData.filter((t: any) => !t.batchId || t.batchId === targetBatchId) : ttData;
            setTimetable(filteredTt);
          }
        }
      } catch (error) {
        console.error("Error loading parent dashboard data:", error);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadParentDashboardData();

    return () => {
      isCancelled = true;
    };
  }, [selectedChild?.uid || selectedChild?.id]);

  const activeClassId = fullStudentData?.classId || selectedChild?.classId;
  const activeTransportBusId = fullStudentData?.transportBusId || selectedChild?.transportBusId;

  // Smart resolver for classId:
  // 1. static profile classId
  // 2. fuzzy text matching based on class name
  // 3. first available class as safe default
  const resolvedClassId = activeClassId || (classes.length > 0 ? (
    classes.find(c => {
      const studentClassStr = String(fullStudentData?.class || selectedChild?.class || '').toLowerCase().trim();
      if (!studentClassStr) return false;
      const classNameStr = String(c.name || '').toLowerCase().trim();
      return classNameStr.includes(studentClassStr) || studentClassStr.includes(classNameStr);
    })?.id || classes[0]?.id
  ) : '');

  // Reactively fetch class details of active switched student profile
  useEffect(() => {
    if (!resolvedClassId) {
      setClassDetail(null);
      setTeachers([]);
      return;
    }
    const unsubClass = dbService.subscribeDoc('classes', resolvedClassId, (data) => {
      setClassDetail(data);
      if (data?.subjects) {
        const teacherIds = data.subjects.map((s: any) => s.teacherId).filter(Boolean);
        if (teacherIds.length > 0) {
          dbService.list('staff', [where('uid', 'in', teacherIds.slice(0, 30))]).then(setTeachers).catch(err => {
            console.error("Error loading teachers:", err);
            setTeachers([]);
          });
        } else {
          setTeachers([]);
        }
      } else {
        setTeachers([]);
      }
    });
    return () => unsubClass();
  }, [resolvedClassId]);

  // Reactively fetch transport bus details of active switched student profile
  useEffect(() => {
    if (!activeTransportBusId) {
      setTransport(null);
      return;
    }
    const unsubTransport = dbService.subscribeDoc('buses', activeTransportBusId, setTransport);
    return () => unsubTransport();
  }, [activeTransportBusId]);

  if (!profile) return null;

  const activeStudent = fullStudentData ? { ...selectedChild, ...fullStudentData } : selectedChild;

  const currentYear = settings.currentAcademicYear || '2026-27';
  const calculation = activeStudent ? calculateStudentFee(activeStudent, currentYear, feeStructures, concessions, classes, batches, true) : null;
  const existingFeeRecord = fees.find(f => 
    (f.studentId === activeStudent?.uid || f.studentId === activeStudent?.id || (f as any).studentUid === activeStudent?.uid || (f as any).studentUid === activeStudent?.id) && 
    normalizeYear(f.academicYear) === normalizeYear(currentYear)
  );

  const activeStudentPaymentSumMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!activeStudent || !payments) return map;
    const targetIds = [activeStudent.id, activeStudent.uid, activeStudent.studentId].filter(Boolean);
    payments
      .filter(p => !p.reference || !p.reference.startsWith('EXP'))
      .filter(p => targetIds.includes(p.studentId) || targetIds.includes((p as any).studentUid))
      .filter(p => normalizeYear(p.academicYear) === normalizeYear(currentYear))
      .forEach(p => {
        const comp = p.component || 'other';
        map[comp] = (map[comp] || 0) + (Number(p.amount) || 0);
      });
    return map;
  }, [activeStudent, payments, currentYear]);

  const effectivePaidComponents = useMemo(() => {
    const pc: Record<string, number> = { ...(existingFeeRecord?.paidComponents || {}) };
    Object.entries(activeStudentPaymentSumMap).forEach(([cKey, cVal]) => {
      pc[cKey] = Math.max(pc[cKey] || 0, cVal);
    });
    return pc;
  }, [existingFeeRecord, activeStudentPaymentSumMap]);

  const getFeeComponents = useCallback((student: any, feeType: string): any[] => {
    if (!student) return [];
    
    const targetYear = currentYear;
    const { 
      schoolFee, hostelFee, transportFee, admissionFee, iplFee, healthCardFee,
      schoolStructure, hostelStructure, transportStructure,
      schoolFeeTerms, hostelFeeTerms, transportFeeTerms
    } = calculation || { schoolFee: 0, hostelFee: 0, transportFee: 0, admissionFee: 0, iplFee: 0, healthCardFee: 0 };

    let components: any[] = [];

    if (feeType === 'school' || feeType === 'all') {
      if (schoolFeeTerms) {
        const { term1, term2, term3 } = schoolFeeTerms;
        if (term1 > 0) components.push({ id: 'term1', label: 'Term 1 Academic Fee', amount: term1, academicYear: targetYear, dueDate: schoolStructure?.term1DueDate });
        if (term2 > 0) components.push({ id: 'term2', label: 'Term 2 Academic Fee', amount: term2, academicYear: targetYear, dueDate: schoolStructure?.term2DueDate });
        if (term3 > 0) components.push({ id: 'term3', label: 'Term 3 Academic Fee', amount: term3, academicYear: targetYear, dueDate: schoolStructure?.term3DueDate });
      } else if (schoolStructure) {
        const originalSchoolTotal = (schoolStructure.term1 || 0) + (schoolStructure.term2 || 0) + (schoolStructure.term3 || 0);
        const ratio = originalSchoolTotal > 0 ? (schoolFee / originalSchoolTotal) : 1;

        const t1Payable = Math.round((schoolStructure.term1 || 0) * ratio);
        const t2Payable = Math.round((schoolStructure.term2 || 0) * ratio);
        const t3Payable = Math.max(0, schoolFee - t1Payable - t2Payable);

        if (t1Payable > 0) components.push({ id: 'term1', label: 'Term 1 Academic Fee', amount: t1Payable, academicYear: targetYear, dueDate: schoolStructure.term1DueDate });
        if (t2Payable > 0) components.push({ id: 'term2', label: 'Term 2 Academic Fee', amount: t2Payable, academicYear: targetYear, dueDate: schoolStructure.term2DueDate });
        if (t3Payable > 0) components.push({ id: 'term3', label: 'Term 3 Academic Fee', amount: t3Payable, academicYear: targetYear, dueDate: schoolStructure.term3DueDate });
      } else if (schoolFee > 0) {
        components.push({ id: 'term1', label: 'General School Fee', amount: schoolFee, academicYear: targetYear });
      }
    }

    if ((feeType === 'transport' || feeType === 'all') && transportFee > 0) {
      if (transportFeeTerms) {
        const { term1, term2, term3 } = transportFeeTerms;
        if (term1 > 0) components.push({ id: 'transport_term1', label: 'Term 1 Transport Fee', amount: term1, academicYear: targetYear, dueDate: transportStructure?.term1DueDate || '2026-07-05' });
        if (term2 > 0) components.push({ id: 'transport_term2', label: 'Term 2 Transport Fee', amount: term2, academicYear: targetYear, dueDate: transportStructure?.term2DueDate || '2026-10-05' });
        if (term3 > 0) components.push({ id: 'transport_term3', label: 'Term 3 Transport Fee', amount: term3, academicYear: targetYear, dueDate: transportStructure?.term3DueDate || '2027-01-05' });
      } else if (transportStructure) {
        const originalTransportTotal = (transportStructure.term1 || 0) + (transportStructure.term2 || 0) + (transportStructure.term3 || 0);
        const ratio = originalTransportTotal > 0 ? (transportFee / originalTransportTotal) : 1;

        const t1Payable = Math.round((transportStructure.term1 || 0) * ratio);
        const t2Payable = Math.round((transportStructure.term2 || 0) * ratio);
        const t3Payable = Math.max(0, transportFee - t1Payable - t2Payable);

        if (t1Payable > 0) components.push({ id: 'transport_term1', label: 'Term 1 Transport Fee', amount: t1Payable, academicYear: targetYear, dueDate: transportStructure.term1DueDate || '2026-07-05' });
        if (t2Payable > 0) components.push({ id: 'transport_term2', label: 'Term 2 Transport Fee', amount: t2Payable, academicYear: targetYear, dueDate: transportStructure.term2DueDate || '2026-10-05' });
        if (t3Payable > 0) components.push({ id: 'transport_term3', label: 'Term 3 Transport Fee', amount: t3Payable, academicYear: targetYear, dueDate: transportStructure.term3DueDate || '2027-01-05' });
      } else {
        const termValue = Math.round(transportFee / 3);
        const t1 = termValue;
        const t2 = termValue;
        const t3 = Math.max(0, transportFee - t1 - t2);
        components.push({ id: 'transport_term1', label: 'Term 1 Transport Fee', amount: t1, academicYear: targetYear, dueDate: '2026-07-05' });
        components.push({ id: 'transport_term2', label: 'Term 2 Transport Fee', amount: t2, academicYear: targetYear, dueDate: '2026-10-05' });
        components.push({ id: 'transport_term3', label: 'Term 3 Transport Fee', amount: t3, academicYear: targetYear, dueDate: '2027-01-05' });
      }
    }

    if ((feeType === 'hostel' || feeType === 'all') && hostelFee > 0) {
      if (hostelFeeTerms) {
        const { term1, term2, term3 } = hostelFeeTerms;
        if (term1 > 0) components.push({ id: 'hostel_term1', label: 'Term 1 Hostel Fee', amount: term1, academicYear: targetYear, dueDate: hostelStructure?.term1DueDate || '2026-07-05' });
        if (term2 > 0) components.push({ id: 'hostel_term2', label: 'Term 2 Hostel Fee', amount: term2, academicYear: targetYear, dueDate: hostelStructure?.term2DueDate || '2026-10-05' });
        if (term3 > 0) components.push({ id: 'hostel_term3', label: 'Term 3 Hostel Fee', amount: term3, academicYear: targetYear, dueDate: hostelStructure?.term3DueDate || '2027-01-05' });
      } else if (hostelStructure) {
        const originalHostelTotal = (hostelStructure.term1 || 0) + (hostelStructure.term2 || 0) + (hostelStructure.term3 || 0);
        const ratio = originalHostelTotal > 0 ? (hostelFee / originalHostelTotal) : 1;

        const t1Payable = Math.round((hostelStructure.term1 || 0) * ratio);
        const t2Payable = Math.round((hostelStructure.term2 || 0) * ratio);
        const t3Payable = Math.max(0, hostelFee - t1Payable - t2Payable);

        if (t1Payable > 0) components.push({ id: 'hostel_term1', label: 'Term 1 Hostel Fee', amount: t1Payable, academicYear: targetYear, dueDate: hostelStructure.term1DueDate || '2026-07-05' });
        if (t2Payable > 0) components.push({ id: 'hostel_term2', label: 'Term 2 Hostel Fee', amount: t2Payable, academicYear: targetYear, dueDate: hostelStructure.term2DueDate || '2026-10-05' });
        if (t3Payable > 0) components.push({ id: 'hostel_term3', label: 'Term 3 Hostel Fee', amount: t3Payable, academicYear: targetYear, dueDate: hostelStructure.term3DueDate || '2027-01-05' });
      } else {
        const t1 = Math.round(hostelFee * 0.5);
        const t2 = Math.round(hostelFee * 0.25);
        const t3 = Math.max(0, hostelFee - t1 - t2);
        components.push({ id: 'hostel_term1', label: 'Term 1 Hostel Fee', amount: t1, academicYear: targetYear, dueDate: '2026-07-05' });
        components.push({ id: 'hostel_term2', label: 'Term 2 Hostel Fee', amount: t2, academicYear: targetYear, dueDate: '2026-10-05' });
        components.push({ id: 'hostel_term3', label: 'Term 3 Hostel Fee', amount: t3, academicYear: targetYear, dueDate: '2027-01-05' });
      }
    }

    if (feeType === 'other' || feeType === 'all') {
      const oldDuesNum = Number(student?.lastClassFeeDue || 0);
      if (oldDuesNum > 0) {
        components.push({
          id: 'lastClassFeeDue',
          label: 'Previous Academic Year Dues',
          amount: oldDuesNum,
          academicYear: targetYear,
          isOldFee: true
        });
      }
      if (admissionFee > 0) components.push({ id: 'admission', label: 'Admission Enrollment Fee', amount: admissionFee, academicYear: targetYear });
      if (iplFee > 0) components.push({ id: 'ipl', label: 'IPL Special Batch Fee', amount: iplFee, academicYear: targetYear });
      if (healthCardFee > 0) components.push({ id: 'healthCard', label: 'Student Health Card Fee', amount: healthCardFee, academicYear: targetYear });
    }

    return components;
  }, [calculation, currentYear]);

  const schoolComponents = canViewSchoolFee ? getFeeComponents(activeStudent, 'school') : [];
  const transportComponents = canViewTransportFee ? getFeeComponents(activeStudent, 'transport') : [];
  const hostelComponents = canViewHostelFee ? getFeeComponents(activeStudent, 'hostel') : [];
  const otherComponents = canViewOtherFee ? getFeeComponents(activeStudent, 'other') : [];

  const allRelevantComponents = useMemo(() => {
    return [
      ...schoolComponents,
      ...transportComponents,
      ...hostelComponents,
      ...otherComponents
    ];
  }, [schoolComponents, transportComponents, hostelComponents, otherComponents]);

  const totalPayable = useMemo(() => {
    return allRelevantComponents.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [allRelevantComponents]);

  const paidAmount = useMemo(() => {
    const pc = effectivePaidComponents;
    return (Object.values(pc) as any[]).reduce((sum, val) => sum + Number(val || 0), 0);
  }, [effectivePaidComponents]);

  const totalDues = Math.max(0, totalPayable - paidAmount);

  const dueDate = existingFeeRecord?.dueDate || calculation?.schoolStructure?.term1DueDate || null;

  const baseSchoolFee = calculation?.schoolStructure ? Number(calculation.schoolStructure.total || (Number(calculation.schoolStructure.term1 || 0) + Number(calculation.schoolStructure.term2 || 0) + Number(calculation.schoolStructure.term3 || 0))) : 0;
  const concessionApplied = Math.max(0, baseSchoolFee - (Number(calculation?.schoolFee) || 0));

  const parentConcessionName = useMemo(() => {
    const type = activeStudent?.feeConcessionType || '';
    if (!type || type.toString().toLowerCase() === 'none' || type.toString().toLowerCase() === 'no concession' || type.toString().trim() === '') {
      return '';
    }
    if (type === 'custom') {
      const amt = activeStudent?.feeConcessionAmount || concessionApplied || 0;
      return `Custom Concession: ₹${amt.toLocaleString()}`;
    }
    const foundConcession = concessions.find(c => c.id === type);
    if (foundConcession) {
      return foundConcession.name;
    }
    return 'Institutional Concession';
  }, [activeStudent, concessions, concessionApplied]);

  const feeDetails = useMemo(() => {
    const pc = effectivePaidComponents;
    const paidAcademic = Number(pc.term1 || 0) + Number(pc.term2 || 0) + Number(pc.term3 || 0) + Number(pc.school || 0);
    const paidTransport = Number(pc.transport || 0) + Number(pc.transport_term1 || 0) + Number(pc.transport_term2 || 0) + Number(pc.transport_term3 || 0);
    const paidHostel = Number(pc.hostel || 0) + Number(pc.hostel_term1 || 0) + Number(pc.hostel_term2 || 0) + Number(pc.hostel_term3 || 0);
    const paidOther = Number(pc.other || 0) + Number(pc.admission || 0) + Number(pc.ipl || 0) + Number(pc.healthCard || 0) + Number(pc.lastClassFeeDue || 0);

    return {
      totalAmount: Number(calculation?.schoolFee) || 0,
      paidAmount: paidAcademic,
      transportTotal: Number(calculation?.transportFee) || 0,
      transportPaid: paidTransport,
      hostelTotal: Number(calculation?.hostelFee) || 0,
      hostelPaid: paidHostel,
      otherTotal: (Number(calculation?.iplFee) || 0) + (Number(calculation?.admissionFee) || 0) + (Number(calculation?.healthCardFee) || 0) + (Number(activeStudent?.lastClassFeeDue) || 0),
      otherPaid: paidOther
    };
  }, [calculation, effectivePaidComponents, activeStudent]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Actions & Child Selector */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 px-2">
        <div className="flex items-center gap-4">
          {children.length > 1 && (
            <div className="flex flex-col gap-1.5 align-start">
              <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest leading-none font-mono">Select Sibling Profile</span>
              <div className="flex items-center gap-2 p-1 bg-white rounded-2xl border border-neutral-150 shadow-sm flex-wrap">
                {children.map((child) => (
                  <button
                    key={child.uid || child.id}
                    onClick={() => switchProfile(child.uid || child.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      (profile.uid || profile.id) === (child.uid || child.id)
                        ? 'bg-primary text-white shadow-lg'
                        : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700'
                    }`}
                  >
                    {child.name?.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {canApplyLeave && (
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/dashboard/leaves')}
            className="flex items-center gap-2 px-6 py-2.5 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-xl shadow-rose-200"
          >
            <Plus className="w-4 h-4" />
            Apply Leave
          </motion.button>
        )}
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {canViewAttendance && (
          <motion.div 
            whileHover={{ y: -3, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}
            className="bg-white p-4.5 rounded-2xl shadow-sm border border-neutral-250 flex items-center gap-3.5"
          >
            <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center shrink-0 border border-green-100/50">
              <Calendar className="w-5.5 h-5.5 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest leading-none font-mono mb-1">Attendance</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-sidebar font-mono tracking-tight leading-none mt-0.5">
                {filteredAttendance.length > 0 
                  ? `${Math.round((filteredAttendance.filter(a => a.status === 'present').length / filteredAttendance.length) * 100)}%`
                  : '100%'}
              </p>
            </div>
          </motion.div>
        )}

        {canViewFees && (
          <motion.div 
            whileHover={{ y: -3, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}
            className="bg-white p-4.5 rounded-2xl shadow-sm border border-neutral-250 flex items-center gap-3.5"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 border border-amber-100/50">
              <CreditCard className="w-5.5 h-5.5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest leading-none font-mono mb-1">Outstanding</p>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 font-mono tracking-tight leading-none mt-0.5">₹{totalDues}</p>
                {concessionApplied > 0 && (
                  <span className="text-[9px] text-emerald-600 font-black uppercase tracking-wider font-mono">concession</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {canViewMarks && (
          <motion.div 
            whileHover={{ y: -3, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}
            className="bg-white p-4.5 rounded-2xl shadow-sm border border-neutral-250 flex items-center gap-3.5"
          >
            <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center shrink-0 border border-purple-100/50">
              <Award className="w-5.5 h-5.5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest leading-none font-mono mb-1">Performance</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-purple-700 font-mono tracking-tight leading-none mt-0.5">
                {examResults[0]?.marks ? `${examResults[0].marks}/${examResults[0].maxMarks}` : 'N/A'}
              </p>
            </div>
          </motion.div>
        )}

        {canViewMarks && (
          <motion.div 
            whileHover={{ y: -3, boxShadow: '0 10px 20px -3px rgba(0, 0, 0, 0.15)' }}
            className="bg-neutral-900 p-4.5 rounded-2xl shadow-md border border-neutral-850 flex items-center gap-3.5 text-white"
          >
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/5">
              <Zap className="w-5.5 h-5.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-white/30 tracking-widest leading-none font-mono mb-1">Next Exam</p>
              <p className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none mt-1">May 24th</p>
            </div>
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Academic Profile - NEW Section */}
          {(canViewSubjects || canViewTeachers) && (
            <section className="bg-white p-5 sm:p-6 rounded-2xl border border-neutral-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-50/30 rounded-full blur-2xl -mr-24 -mt-24 pointer-events-none" />
              <div className="relative z-10 flex flex-col justify-between gap-6">
                <div>
                  <h3 className="text-base font-black text-sidebar tracking-tight uppercase flex items-center gap-2 mb-4">
                    <BookOpen className="w-5 h-5 text-indigo-650" />
                    Academic Faculty & Curriculum
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {canViewSubjects && (
                       <div className="space-y-3">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-1.5 font-mono">Active Subjects</p>
                          <div className="flex flex-wrap gap-1.5">
                            {classDetail?.subjects?.map((s: any, idx: number) => (
                              <span key={idx} className="px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 rounded-xl text-[11px] font-black text-sidebar uppercase tracking-tight border border-neutral-200 transition-colors">
                                 {s.name}
                              </span>
                            )) || <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider italic">Loading curriculum schedule...</p>}
                          </div>
                       </div>
                     )}
 
                     {canViewTeachers && (
                       <div className="space-y-3">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-1.5 font-mono">Faculty Members</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {teachers.length > 0 ? teachers.map((t, idx) => (
                              <div key={idx} className="flex items-center gap-2.5 p-1 bg-neutral-50/50 rounded-xl border border-neutral-150">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center font-black text-xs text-indigo-600 shrink-0">
                                  {t.name?.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-extrabold text-sidebar truncate leading-tight uppercase">{t.name}</p>
                                  <p className="text-[9px] text-neutral-400 font-black uppercase tracking-wider font-mono truncate leading-none mt-0.5">
                                    {classDetail?.subjects?.find((s: any) => s.teacherId === t.uid)?.name || 'Faculty'}
                                  </p>
                                </div>
                              </div>
                            )) : <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider italic">Faculty database syncing...</p>}
                          </div>
                       </div>
                     )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Micro-Level Exploration Matrix */}
          <section className="space-y-4">
            <div>
              <h3 className="text-base font-black text-sidebar tracking-tight uppercase flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                Student Portal Services
              </h3>
              <p className="text-[10px] text-neutral-400 font-extrabold tracking-widest uppercase font-mono mt-0.5">Direct Management Shortcuts</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {[
                canViewAttendance && { label: 'Attendance', icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600 border-emerald-100/50', path: '/dashboard/attendance' },
                canViewHomework && { label: 'Homework', icon: Book, color: 'bg-orange-50 text-orange-600 border-orange-100/50', path: '/dashboard/homework' },
                canViewMarks && { label: 'Exams', icon: Award, color: 'bg-purple-50 text-purple-600 border-purple-100/50', path: '/dashboard/exams' },
                canViewFees && { label: 'Fees & Dues', icon: CreditCard, color: 'bg-amber-50 text-amber-655 border-amber-100/50', path: '/dashboard/fees' },
                canViewTimetable && { label: 'Timetable', icon: Clock, color: 'bg-blue-50 text-blue-600 border-blue-100/50', path: '/dashboard/timetable' },
                { label: 'Library', icon: BookOpen, color: 'bg-indigo-50 text-indigo-600 border-indigo-100/50', path: '/dashboard/library' },
                canViewTransport && { label: 'Transport', icon: Bus, color: 'bg-rose-50 text-rose-600 border-rose-100/50', path: '/dashboard/transport' },
                canApplyLeave && { label: 'Leaves', icon: FileText, color: 'bg-yellow-50 text-yellow-600 border-yellow-105-50', path: '/dashboard/leaves' },
                canViewHostel && { label: 'Hostel', icon: Users, color: 'bg-cyan-50 text-cyan-600 border-cyan-100/50', path: '/dashboard/hostel' },
                { label: 'Notices', icon: Bell, color: 'bg-neutral-50 text-neutral-600 border-neutral-150', path: '/dashboard/communication' },
              ].filter(Boolean).map((module: any, i) => (
                <motion.button
                  key={i}
                  whileHover={{ y: -3, scale: 1.015, boxShadow: '0 8px 20px -6px rgba(0,0,0,0.06)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(module.path)}
                  className="bg-white p-4.5 rounded-2xl border border-neutral-250 hover:border-indigo-200 transition-all flex flex-col items-center text-center gap-3 group relative cursor-pointer"
                >
                  <div className={`p-3.5 rounded-xl border ${module.color} group-hover:scale-110 transition-transform shadow-sm`}>
                    <module.icon className="w-5.5 h-5.5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-800 group-hover:text-indigo-650 transition-colors">{module.label}</span>
                </motion.button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Homework Board - Side 2 (Replacing old schedule placeholder) */}
            {canViewHomework && (
              <section className="bg-white p-5 sm:p-6 rounded-2xl border border-neutral-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-5 border-b border-neutral-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-100/50">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-sidebar uppercase tracking-tight">Recent Homework</h3>
                        <p className="text-[9px] text-neutral-400 font-black uppercase tracking-wider font-mono">Assignments & Academic Tasks</p>
                      </div>
                    </div>
                    <button onClick={() => navigate('/dashboard/homework')} className="text-indigo-600 text-[10px] font-black uppercase tracking-wider hover:underline font-mono">View All</button>
                  </div>

                  <div className="space-y-3.5">
                    {homework.length > 0 ? homework.map((hw, i) => (
                      <div key={i} className="p-3.5 bg-neutral-50/50 rounded-xl border border-neutral-150 hover:bg-neutral-50 transition-all cursor-pointer group">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest bg-orange-100 px-2 py-0.5 rounded font-mono">{hw.subject}</span>
                          <span className="text-[10px] text-neutral-550 font-black uppercase tracking-wider font-mono">Due: {hw.dueDate}</span>
                        </div>
                        <h4 className="text-xs sm:text-[13px] font-black text-neutral-800 group-hover:text-indigo-600 transition-colors uppercase leading-snug">{hw.title}</h4>
                        <p className="text-[11px] text-neutral-400 line-clamp-1 mt-1 font-semibold">{hw.description}</p>
                      </div>
                    )) : (
                      <div className="text-center py-8">
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest font-mono italic">No pending assignments found</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Notice Board - Side 2 */}
            <section className="bg-neutral-900 p-5 sm:p-6 rounded-2xl text-white shadow-xl relative overflow-hidden group flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-[60px] -mr-24 -mt-24 pointer-events-none" />
              
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-5 border-b border-neutral-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shadow-inner">
                        <Bell className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-black uppercase tracking-tight">Board Notices</h3>
                        <p className="text-[9px] text-white/40 font-black uppercase tracking-widest font-mono">School Notifications</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => navigate('/dashboard/communication')}
                      className="bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border border-white/5 transition-all text-white/70"
                    >
                      View Feed
                    </button>
                  </div>

                  <div className="space-y-3">
                    {notices.length > 0 ? notices.map((notice, i) => (
                      <div key={i} className="p-3.5 bg-white/5 rounded-xl border border-white/5 hover:border-primary/20 hover:bg-white/[0.08] transition-all cursor-pointer group/item">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest font-mono ${
                            notice.category === 'event' ? 'bg-primary/20 text-primary' : 
                            notice.category === 'holiday' ? 'bg-amber-400/20 text-amber-300' : 
                            'bg-blue-400/20 text-blue-300'
                          }`}>
                            {notice.category || 'General'}
                          </span>
                          <span className="text-[9px] text-white/30 font-black uppercase tracking-widest font-mono">{new Date(notice.createdAt).toLocaleDateString()}</span>
                        </div>
                        <h4 className="text-xs font-black mb-1.5 group-hover/item:text-primary transition-colors uppercase leading-snug">{notice.title}</h4>
                        <p className="text-[11px] text-white/50 font-medium leading-relaxed line-clamp-1">{notice.content}</p>
                      </div>
                    )) : (
                      <div className="text-center py-8 opacity-40">
                        <p className="text-[10px] font-black uppercase tracking-widest font-mono italic">No announcements broadcasted</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {notices.length > 0 && (
                  <button 
                    onClick={() => navigate('/dashboard/communication')}
                    className="mt-4 w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/5 rounded-xl hover:bg-white/5 transition-all font-mono"
                  >
                    Browse Notice Archive
                  </button>
                )}
              </div>
            </section>
          </div>

          <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden h-full">
            <div className="p-4.5 bg-neutral-900 text-white flex flex-col md:flex-row gap-5 items-center justify-between">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 p-0.5 shrink-0">
                  {(selectedChild?.photoURL || selectedChild?.photoUrl || selectedChild?.facePhotoURL || selectedChild?.facePhotoUrl) ? (
                    <img src={selectedChild.photoURL || selectedChild.photoUrl || selectedChild.facePhotoURL || selectedChild.facePhotoUrl} alt={selectedChild.name} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-black text-xl text-white/50">
                      {selectedChild?.name?.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="text-center md:text-left space-y-1">
                  <h2 className="text-lg font-black tracking-tight uppercase">{selectedChild?.name}</h2>
                  <div className="flex flex-wrap justify-center md:justify-start gap-2">
                    <span className="bg-white/10 px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider uppercase">
                      Class {selectedChild?.class || classes.find(c => c.id === selectedChild?.classId)?.name || 'N/A'}
                    </span>
                    <span className="bg-white/10 px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider uppercase font-mono">
                      {selectedChild?.batch || batches.find(b => b.id === selectedChild?.batchId)?.name || 'N/A'}
                    </span>
                    <span className="bg-white/10 px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider uppercase font-mono">
                      Roll {selectedChild?.rollNumber || selectedChild?.rollNo || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIs360Open(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors">
                Open 360° Report Card
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
              {/* Daily Attendance */}
              {canViewAttendance && (
                <div className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100">
                      <h3 className="font-extrabold text-neutral-850 flex items-center gap-1.5 uppercase tracking-wider text-xs font-mono">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        Attendance Log
                      </h3>
                      <button onClick={() => navigate('/dashboard/attendance')} className="text-indigo-650 text-[10px] font-black uppercase tracking-wider hover:underline font-mono">More</button>
                    </div>
                    <div className="space-y-2">
                      {filteredAttendance.slice(0, 5).map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-150">
                          <span className="text-xs font-black text-neutral-700 uppercase font-mono">{att.date}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono ${
                            att.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {att.status}
                          </span>
                        </div>
                      ))}
                      {filteredAttendance.length === 0 && <p className="text-xs text-neutral-400 italic font-mono uppercase">No attendance data found.</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Exam Marks */}
              {canViewMarks && (
                <div className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100">
                      <h3 className="font-extrabold text-neutral-850 flex items-center gap-1.5 uppercase tracking-wider text-xs font-mono">
                        <Award className="w-4 h-4 text-purple-600" />
                        Academic Marks
                      </h3>
                      <button onClick={() => setIs360Open(true)} className="text-indigo-650 text-[10px] font-black uppercase tracking-wider hover:underline font-mono">360°</button>
                    </div>
                    <div className="space-y-2">
                      {examResults.map((result, idx) => (
                        <div key={idx} className="p-2 bg-neutral-50 rounded-lg border border-neutral-150 hover:bg-neutral-100 hover:shadow-xs transition-all cursor-pointer flex justify-between items-center" onClick={() => setIs360Open(true)}>
                          <span className="text-xs font-black text-neutral-700 uppercase">{result.subjectName || 'Exam Result'}</span>
                          <span className="text-xs font-black text-purple-750 font-mono tracking-tight">{result.marks || result.totalMarks}/{result.maxMarks}</span>
                        </div>
                      ))}
                      {examResults.length === 0 && <p className="text-xs text-neutral-400 italic font-mono uppercase">No exam marks published.</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Transport Details */}
              {canViewTransport && (
                <div className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100">
                      <h3 className="font-extrabold text-neutral-850 flex items-center gap-1.5 uppercase tracking-wider text-xs font-mono">
                        <Bus className="w-4 h-4 text-blue-600" />
                        Transport Service
                      </h3>
                      <button onClick={() => navigate('/dashboard/transport')} className="text-indigo-650 text-[10px] font-black uppercase tracking-wider hover:underline font-mono">Track</button>
                    </div>
                    {transport ? (
                      <div className="space-y-3">
                        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-150">
                          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest font-mono">Assigned Bus</p>
                          <h4 className="text-base font-black text-neutral-800 uppercase tracking-tight font-mono mt-0.5">{transport.busNumber || transport.id}</h4>
                          <p className="text-[10px] text-blue-500 font-extrabold uppercase mt-1 leading-none">{transport.routeName || 'Official Route'}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-1 pt-1.5 border-t border-neutral-100">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest font-mono">Last Seen: Just Now</p>
                          </div>
                          <button
                            onClick={handleRequestWhatsAppLink}
                            disabled={requestLoading}
                            className="text-[9px] font-black uppercase text-emerald-600 hover:text-emerald-700 font-mono tracking-widest flex items-center gap-1 border border-emerald-200 hover:border-emerald-300 bg-emerald-50 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50"
                          >
                            <Phone className="w-2.5 h-2.5 fill-emerald-600 text-emerald-60 shrink-0" />
                            {requestLoading ? 'Sending...' : 'WA Link'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                        <p className="text-[9px] text-neutral-400 font-black uppercase tracking-widest font-mono italic">No Transport Assigned</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Fee Summary */}
          {canViewFees && (
            <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
              <h3 className="font-black text-sidebar uppercase tracking-widest text-[10px] mb-8 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-500" />
                Fees Breakdown
              </h3>
              
              <div className="space-y-6 mb-8">
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 shadow-inner">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black text-amber-700/50 uppercase tracking-widest">Total Outstanding</span>
                    {dueDate && (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100/50 px-2 py-0.5 rounded-full">
                        Due: {new Date(dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-4xl font-black text-amber-900 tracking-tighter flex items-center gap-1">
                    <span className="text-lg opacity-50">₹</span>{totalDues}
                  </p>
                  {concessionApplied > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 text-emerald-700 bg-emerald-500/15 w-fit px-2 py-0.5 rounded-md border border-emerald-500/20">
                      <span className="text-[9px] font-black uppercase tracking-widest">Concession: ₹{concessionApplied}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-amber-200/30">
                    <div className="text-[9px] font-bold">
                      <p className="text-amber-700/50 uppercase tracking-tighter">Total Fee</p>
                      <p className="text-amber-900">₹{totalPayable}</p>
                    </div>
                    <div className="text-[9px] font-bold pl-3 border-l border-amber-200/30">
                      <p className="text-amber-700/50 uppercase tracking-tighter">Paid Fee</p>
                      <p className="text-emerald-600 font-black">₹{paidAmount}</p>
                    </div>
                  </div>
                  {totalDues > 0 && <p className="text-[9px] text-amber-600 font-bold mt-2 uppercase tracking-widest leading-none">Payment overdue for current term</p>}
                </div>

                <div className="space-y-1">
                  {[
                    ...(concessionApplied > 0 ? [
                      { label: 'Academic Fee (Base)', amt: baseSchoolFee, paid: 0, visible: canViewSchoolFee },
                      { label: `Concession (${parentConcessionName || 'Scholarship'})`, amt: concessionApplied, paid: 0, isConcession: true, visible: canViewSchoolFee }
                    ] : []),
                    { label: concessionApplied > 0 ? 'Academic Fee (Net)' : 'Academic Fee', amt: feeDetails.totalAmount || 0, paid: feeDetails.paidAmount || 0, visible: canViewSchoolFee },
                    { label: 'Transport Fee', amt: feeDetails.transportTotal || 0, paid: feeDetails.transportPaid || 0, visible: canViewTransportFee },
                    { label: 'Hostel Fee', amt: feeDetails.hostelTotal || 0, paid: feeDetails.hostelPaid || 0, visible: canViewHostelFee },
                    { label: 'Other/Misc', amt: feeDetails.otherTotal || 0, paid: feeDetails.otherPaid || 0, visible: canViewOtherFee },
                  ].filter(f => f.amt > 0 && f.visible).map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-neutral-50/50 rounded-2xl hover:bg-neutral-50 transition-colors">
                      <span className={`text-[10px] font-bold uppercase ${f.isConcession ? 'text-emerald-600' : 'text-neutral-500'}`}>{f.label}</span>
                      <div className="text-right">
                        <p className={`text-[11px] font-black tracking-tight leading-none ${f.isConcession ? 'text-emerald-600' : 'text-sidebar'}`}>
                          {f.isConcession ? `-₹${f.amt}` : `₹${f.amt - (f.paid || 0)}`}
                        </p>
                        {!f.isConcession && f.paid > 0 && <p className="text-[9px] text-emerald-500 font-bold uppercase mt-0.5 tracking-tighter">₹{f.paid} paid</p>}
                      </div>
                    </div>
                  ))}
                  {/* Fallback if fees are visible but no sub-categories allowed */}
                  {canViewFees && !canViewSchoolFee && !canViewTransportFee && !canViewHostelFee && !canViewOtherFee && (
                    <div className="p-4 bg-neutral-50 rounded-2xl text-center">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest italic">Detailed breakdown restricted</p>
                    </div>
                  )}
                </div>
              </div>

              {canPayFees && (
                <button 
                  onClick={() => navigate('/dashboard/fees')}
                  className="w-full bg-sidebar text-white py-5 rounded-3xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-primary transition-all shadow-xl shadow-sidebar/20"
                >
                  Pay Dues Now
                </button>
              )}
            </section>
          )}

          {/* Quick Support / Feedback Section */}
          <section className="bg-neutral-900 p-8 rounded-[2.5rem] text-white overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-sidebar to-black opacity-50" />
            <div className="relative z-10">
              <Mail className="w-10 h-10 text-primary mb-4" />
              <h4 className="text-lg font-black uppercase tracking-tight">Need Support?</h4>
              <p className="text-xs text-white/40 mt-2 font-medium leading-relaxed mb-6 italic">Direct communication channel with school administration.</p>
              <button className="w-full py-4 rounded-2xl bg-white/10 hover:bg-white text-[10px] font-black uppercase tracking-widest text-white hover:text-sidebar border border-white/5 transition-all">
                Send Inquiry
              </button>
            </div>
          </section>
        </div>
      </div>

      {selectedChild && (
        <Student360View 
          student={activeStudent}
          isOpen={is360Open}
          onClose={() => setIs360Open(false)}
        />
      )}
    </div>
  );
};

export default ParentDashboard;
