import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from '../services/dbService';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  Search,
  Send,
  AlertCircle,
  ShieldCheck,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  Banknote,
  Upload,
  Download,
  TrendingUp,
  Users,
  User,
  Smartphone,
  RefreshCw,
  Printer,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { getTeacherAssignments, filterClassesForTeacher, filterBatchesForTeacher, checkIsTeacherAccount } from '../utils/teacherFilter';
import Papa from 'papaparse';
import { FeeStructure, FeeConcession, FeeRecord, PaymentRecord, Expenditure } from '../types';
import { where, limit, startAfter, orderBy } from 'firebase/firestore';
import { calculateStudentFee, normalizeYear } from '../lib/feeUtils';
import StudentPortalFees from '../components/fees/StudentPortalFees';
import { AdminFeesView } from '../components/fees/AdminFeesView';

const getComponentNameLabel = (id: string) => {
  if (!id) return 'OTHER FEE COMPONENT';
  if (id.includes(',') || id.startsWith('multi_')) {
    return id.replace('multi_', '').toUpperCase();
  }
  switch (id) {
    case 'term1': return 'TERM 1 ACADEMIC FEE';
    case 'term2': return 'TERM 2 ACADEMIC FEE';
    case 'term3': return 'TERM 3 ACADEMIC FEE';
    case 'school': return 'ACADEMIC FEE';
    case 'transport': return 'TRANSPORT FEE';
    case 'transport_term1': return 'TERM 1 TRANSPORT FEE';
    case 'transport_term2': return 'TERM 2 TRANSPORT FEE';
    case 'transport_term3': return 'TERM 3 TRANSPORT FEE';
    case 'hostel': return 'HOSTEL ACCOMMODATION FEE';
    case 'hostel_term1': return 'TERM 1 HOSTEL FEE';
    case 'hostel_term2': return 'TERM 2 HOSTEL FEE';
    case 'hostel_term3': return 'TERM 3 HOSTEL FEE';
    case 'admission': return 'ADMISSION ENROLLMENT FEE';
    case 'ipl': return 'IPL SPECIAL BATCH FEE';
    case 'healthCard': return 'STUDENT HEALTH CARD FEE';
    case 'lastClassFeeDue': return 'PREVIOUS ACADEMIC YEAR DUES';
    default: return id.toUpperCase();
  }
};

const resolveCompKeyAndLabel = (token: string) => {
  const t = token.trim();
  const tLower = t.toLowerCase();
  const knownIds = [
    'term1', 'term2', 'term3', 
    'transport_term1', 'transport_term2', 'transport_term3', 
    'hostel_term1', 'hostel_term2', 'hostel_term3',
    'transport', 'hostel', 'school',
    'admission', 'ipl', 'healthCard', 'lastClassFeeDue'
  ];
  if (knownIds.includes(t)) {
    return {
      compKey: t,
      label: getComponentNameLabel(t)
    };
  }
  let compKey = 'school';
  if (tLower.includes('term 1 academic') || tLower === 'term1') compKey = 'term1';
  else if (tLower.includes('term 2 academic') || tLower === 'term2') compKey = 'term2';
  else if (tLower.includes('term 3 academic') || tLower === 'term3') compKey = 'term3';
  else if (tLower.includes('term 1 transport') || tLower === 'transport_term1') compKey = 'transport_term1';
  else if (tLower.includes('term 2 transport') || tLower === 'transport_term2') compKey = 'transport_term2';
  else if (tLower.includes('term 3 transport') || tLower === 'transport_term3') compKey = 'transport_term3';
  else if (tLower.includes('term 1 hostel') || tLower === 'hostel_term1') compKey = 'hostel_term1';
  else if (tLower.includes('term 2 hostel') || tLower === 'hostel_term2') compKey = 'hostel_term2';
  else if (tLower.includes('term 3 hostel') || tLower === 'hostel_term3') compKey = 'hostel_term3';
  else if (tLower.includes('transport facility') || tLower === 'transport') compKey = 'transport';
  else if (tLower.includes('hostel accommodation') || tLower === 'hostel') compKey = 'hostel';
  else if (tLower.includes('admission enrollment') || tLower === 'admission') compKey = 'admission';
  else if (tLower.includes('ipl special') || tLower === 'ipl') compKey = 'ipl';
  else if (tLower.includes('student health') || tLower === 'healthcard') compKey = 'healthCard';
  else if (tLower.includes('previous academic') || tLower === 'lastclassfeedue') compKey = 'lastClassFeeDue';
  
  return {
    compKey,
    label: getComponentNameLabel(compKey)
  };
};

const Fees: React.FC = () => {
  const { user, isStudent, isParent, profile, availableProfiles, isAdmin, isAccountant } = useAuth();
  const { settings } = useSettings();
  
  const [students, setStudents] = useState<any[]>(availableProfiles.filter((p: any) => (p.role || '').toLowerCase() === 'student'));
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [concessions, setConcessions] = useState<FeeConcession[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [filterAcademicYear, setFilterAcademicYear] = useState(settings.currentAcademicYear || '2026-27');
  const [printingPayment, setPrintingPayment] = useState<PaymentRecord | null>(null);
  const [previewPayment, setPreviewPayment] = useState<PaymentRecord | null>(null);
  const [showPrinterHint, setShowPrinterHint] = useState(false);
  const [printPaperSize, setPrintPaperSize] = useState<'2in' | '3in' | 'a5'>(() => {
    return (localStorage.getItem('fees_print_paper_size') as any) || '3in';
  });

  const handlePaperSizeChange = (size: '2in' | '3in' | 'a5') => {
    setPrintPaperSize(size);
    localStorage.setItem('fees_print_paper_size', size);
  };

  const handleTestPrint = () => {
    const mockPayment: PaymentRecord = {
      id: "rcpt_TEST_12345",
      studentId: "test_student",
      amount: 5500,
      component: "term1",
      method: "cash",
      reference: "TXN-TEST-777",
      date: new Date().toISOString(),
      academicYear: filterAcademicYear
    };
    
    setPreviewPayment(mockPayment);
  };

  // 1. డేటా లోడింగ్ పైప్‌లైన్
  const fetchDuesData = async () => {
    if (!initialLoaded) {
      setLoading(true);
    }
    try {
      const currentId = profile?.id || profile?.uid || '';
      
      const [structureRes, concessionRes, classesRes, batchesRes] = await Promise.all([
        dbService.list('feeStructures', []),
        dbService.list('concessions', []),
        dbService.list('classes', []),
        dbService.list('batches', [])
      ]);
      let finalStructures = structureRes as FeeStructure[];
      if (isAdmin || isAccountant) {
        const hasNonAttending = finalStructures.some(s => {
          const nameNorm = (s.name || '').toLowerCase().trim();
          return s.type === 'school' && (nameNorm === 'non-attending student' || nameNorm === 'non attending student' || nameNorm === 'non_attending_student');
        });
        if (!hasNonAttending) {
          const targetYear = filterAcademicYear || settings.currentAcademicYear || '2026-27';
          const newId = 'non_attending_student_class';
          const nonAttendingStruct: FeeStructure = {
            id: newId,
            name: "Non-Attending Student",
            type: "school",
            academicYear: targetYear,
            term1: 10000,
            term2: 0,
            term3: 0,
            term1DueDate: "2026-07-05",
            term2DueDate: "",
            term3DueDate: "",
            admissionFee: 0,
            iplFee: 0,
            healthCardFee: 0,
            hostelTuitionFee: 0,
            total: 10000,
            createdAt: new Date().toISOString()
          };
          try {
            await dbService.create('feeStructures', newId, nonAttendingStruct);
            finalStructures = [nonAttendingStruct, ...finalStructures];
          } catch (err) {
            console.error("Failed to automatically create Non-Attending Student fee structure:", err);
          }
        }
      }
      const assignedClassIds = new Set<string>();
      const assignedBatchIds = new Set<string>();

      if (profile?.role === 'play_school_incharge') {
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

        batchesRes.forEach((b: any) => {
          if (b.classTeacherId === profile?.uid) {
            if (b.id) assignedBatchIds.add(b.id);
            if (b.classId) assignedClassIds.add(b.classId);
          }
        });

        // Fallback to nursery/lkg/ukg check if no classes or batches are explicitly assigned
        if (assignedClassIds.size === 0 && assignedBatchIds.size === 0) {
          classesRes
            .filter((c: any) => c.name && (
              c.name.toLowerCase().includes('nursery') ||
              c.name.toLowerCase().includes('lkg') ||
              c.name.toLowerCase().includes('ukg')
            ))
            .forEach((c: any) => assignedClassIds.add(c.id));

          batchesRes
            .filter((b: any) => b.classId && assignedClassIds.has(b.classId))
            .forEach((b: any) => assignedBatchIds.add(b.id));
        } else {
          // Ensure any batch's classId is also in assignedClassIds
          batchesRes.forEach((b: any) => {
            if (b.id && assignedBatchIds.has(b.id) && b.classId) {
              assignedClassIds.add(b.classId);
            }
          });
        }

        setClasses(classesRes.filter((c: any) => assignedClassIds.has(c.id)));
        setBatches(batchesRes.filter((b: any) => assignedBatchIds.has(b.id)));
      } else if (checkIsTeacherAccount(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name)) {
        const assignments = await getTeacherAssignments(user, profile, profile?.role || '');
        setClasses(filterClassesForTeacher(classesRes, assignments));
        setBatches(filterBatchesForTeacher(batchesRes, assignments));
      } else {
        setClasses(classesRes);
        setBatches(batchesRes);
      }

      setFeeStructures(finalStructures);
      setConcessions(concessionRes as FeeConcession[]);

      if (isStudent || isParent) {
        const studentProfileData = await dbService.get('students', currentId);
        if (studentProfileData) {
          const formattedStudent = { ...studentProfileData, uid: currentId, id: currentId };
          setStudents([formattedStudent]);
          
          const studentEmail = (studentProfileData as any)?.email;
          const [allStudents, allFees, allPayments] = await Promise.all([
            dbService.list('students'),
            dbService.list('fees'),
            dbService.list('payments')
          ]);

          const matchedStudents = allStudents.filter((s: any) => 
            s.id === currentId || s.uid === currentId ||
            (studentEmail && s.email && s.email.toLowerCase() === studentEmail.toLowerCase())
          );

          const targetIds = Array.from(new Set([
            currentId,
            (studentProfileData as any)?.id,
            (studentProfileData as any)?.uid,
            (studentProfileData as any)?.studentId,
            ...matchedStudents.map((s: any) => s.id),
            ...matchedStudents.map((s: any) => s.uid)
          ].filter(Boolean)));

          const feesData = allFees.filter((f: any) => targetIds.includes(f.studentId) || targetIds.includes(f.studentUid));
          setFees(feesData as FeeRecord[]);
          
          const paymentsData = allPayments.filter((p: any) => targetIds.includes(p.studentId) || targetIds.includes(p.studentUid));

          feesData.forEach((f: any) => {
            if (f.paymentHistory && Array.isArray(f.paymentHistory)) {
              f.paymentHistory.forEach((ph: any, idx: number) => {
                const ref = ph.reference || ph.orderId || `ph_${f.id}_${idx}`;
                const exists = paymentsData.some((p: any) => p.reference === ref || p.id === ref || p.id === ph.id);
                if (!exists) {
                  paymentsData.push({
                    id: ph.id || ref,
                    studentId: currentId,
                    studentUid: currentId,
                    amount: Number(ph.amount) || 0,
                    date: ph.date || f.updatedAt || new Date().toISOString(),
                    method: ph.method || 'online',
                    reference: ref,
                    academicYear: ph.academicYear || f.academicYear || '2026-2027',
                    component: ph.component || 'term1'
                  } as any);
                }
              });
            }
          });

          setPayments(paymentsData as PaymentRecord[]);
        }
      } else if (isAdmin || isAccountant || profile?.role === 'play_school_incharge') {
        const [studentsData, feesData, paymentsData] = await Promise.all([
          dbService.list('students'),
          dbService.list('fees'),
          dbService.list('payments')
        ]);
        
        if (profile?.role === 'play_school_incharge') {
          const filteredStudents = (studentsData || []).filter((s: any) => 
            s && ((s.classId && assignedClassIds.has(s.classId)) || (s.batchId && assignedBatchIds.has(s.batchId)))
          );
          const filteredStudentIds = filteredStudents.map((s: any) => s.id || s.uid);

          setStudents(filteredStudents);
          setFees((feesData as FeeRecord[]).filter(f => filteredStudentIds.includes(f.studentId)));
          setPayments((paymentsData as PaymentRecord[]).filter(p => filteredStudentIds.includes(p.studentId)));
        } else {
          setStudents(studentsData);
          setFees(feesData as FeeRecord[]);
          setPayments(paymentsData as PaymentRecord[]);
        }
      }
    } catch (error) {
      console.error("Data pipeline sync error:", error);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  };

  useEffect(() => {
    fetchDuesData();
  }, [profile?.id, profile?.uid, filterAcademicYear]);

  const activeStudentData = useMemo(() => {
    if (students.length > 0) {
      const target = students[0];
      return {
        ...target,
        uid: target.id || target.uid || profile?.id || profile?.uid,
        id: target.id || target.uid || profile?.id || profile?.uid,
        role: 'student',
        academicYear: target.academicYear || filterAcademicYear
      };
    }
    return profile ? { ...profile, uid: profile.id || profile.uid, id: profile.id || profile.uid, role: 'student' } : null;
  }, [students, profile, filterAcademicYear]);

  // 2. డైనమిక్ టర్మ్ ఫీజు & కన్సెషన్ కాలిక్యులేటర్ లాజిక్ (Dashboard తో సింక్ చేయబడింది)
  const getFeeComponents = useCallback((student: any, feeType: string): any[] => {
    if (!student) return [];
    
    const targetYear = filterAcademicYear || settings.currentAcademicYear || '2026-27';
    const { 
      schoolFee, hostelFee, transportFee, admissionFee, iplFee, healthCardFee,
      schoolStructure, hostelStructure, transportStructure,
      schoolFeeTerms, hostelFeeTerms, transportFeeTerms
    } = calculateStudentFee(student, targetYear, feeStructures, concessions, classes, batches, isAdmin || isAccountant);

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
      const oldFeeConcession = Number(student?.oldFeeConcession || 0);
      const oldDuesNum = Math.max(0, Number(student?.lastClassFeeDue || 0) - oldFeeConcession);
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
  }, [feeStructures, concessions, fees, filterAcademicYear, settings.currentAcademicYear]);

  const handleTakePayment = async (amount: number, component: string, method: string, reference?: string) => {
    try {
      // Check if reference already exists in payments (e.g. created by backend verification)
      if (reference) {
        const existing = payments.find(p => p.reference === reference && p.component === component);
        if (existing) {
          fetchDuesData();
          return;
        }
      }

      const studentId = activeStudentData?.id || activeStudentData?.uid || profile?.id || profile?.uid;
      const payload = { studentId, amount, date: new Date().toISOString(), method, reference, academicYear: filterAcademicYear, component };
      await dbService.create('payments', `pay_${Date.now()}_${component}`, payload);
      toast.success("Payment registered successfully!");
      fetchDuesData();
    } catch (e) {
      toast.error("Failed to register payment");
    }
  };

  const printReceipt = (payment: PaymentRecord) => {
    setPreviewPayment(payment);
  };

  useEffect(() => {
    if (printingPayment) {
      const timer = setTimeout(() => {
        const originalTitle = document.title;
        document.title = "Fees Receipt";
        window.print();
        document.title = originalTitle;
        // Clear printing state after print is initiated
        setPrintingPayment(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [printingPayment]);

  if (isStudent || isParent) {
    const studentId = activeStudentData?.uid || activeStudentData?.id;
    
    // కన్సెషన్ మరియు పెయిడ్ అమౌంట్ ఖచ్చితంగా సింక్ అవ్వడానికి మెట్రిక్స్ మ్యాపింగ్
    const targetYear = filterAcademicYear || settings.currentAcademicYear || '2026-27';
    const feeCalculation = calculateStudentFee(activeStudentData, targetYear, feeStructures, concessions, classes, batches, isAdmin || isAccountant);
    
    // Dynamically group payments for the active academic year to build full paid components
    const dynamicPaidComponents = (() => {
      const existingRecord = fees.find(f => 
        (f.studentId === studentId || (f as any).studentUid === studentId || f.studentId === activeStudentData?.id || f.studentId === activeStudentData?.uid) &&
        normalizeYear(f.academicYear) === normalizeYear(targetYear)
      );

      const targetIds = [studentId, activeStudentData?.id, activeStudentData?.uid, (activeStudentData as any)?.studentId].filter(Boolean);
      const sumPayments: Record<string, number> = {};
      
      payments
        .filter(p => !p.reference || !p.reference.startsWith('EXP'))
        .filter(p => targetIds.includes(p.studentId) || targetIds.includes((p as any).studentUid))
        .filter(p => normalizeYear(p.academicYear) === normalizeYear(targetYear))
        .forEach(p => {
          const comp = p.component || 'other';
          sumPayments[comp] = (sumPayments[comp] || 0) + (Number(p.amount) || 0);
        });

      const comps: Record<string, number> = {};
      const allCompKeys = new Set([
        ...Object.keys(sumPayments),
        ...Object.keys(existingRecord?.paidComponents || {})
      ]);

      allCompKeys.forEach(compKey => {
        comps[compKey] = Math.max(
          sumPayments[compKey] || 0,
          Number(existingRecord?.paidComponents?.[compKey as keyof typeof existingRecord.paidComponents] || 0)
        );
      });

      return comps;
    })();

    const oldFeeConcession = Number(activeStudentData?.oldFeeConcession || 0);
    const oldDuesVal = Math.max(0, Number(activeStudentData?.lastClassFeeDue || 0) - oldFeeConcession);
    const totalAmountFromCalc = (feeCalculation.total || activeStudentData?.totalFee || 57000) + oldDuesVal;
    const totalPaidFromDatabase = Object.values(dynamicPaidComponents).reduce((sum: number, amt: any) => sum + Number(amt || 0), 0);
    
    const remainingDue = Math.max(0, totalAmountFromCalc - totalPaidFromDatabase);

    const currentFeeRecord = {
      totalAmount: totalAmountFromCalc,
      paidAmount: totalPaidFromDatabase,
      status: (remainingDue <= 0 ? 'paid' : 'partial') as 'paid' | 'partial',
      id: 'dynamic_portal_fee_id',
      studentId: studentId,
      academicYear: filterAcademicYear,
      dueDate: feeCalculation.schoolStructure?.term1DueDate || '',
      concessionAmount: Math.max(0, feeCalculation.originalTotal - feeCalculation.total) + oldFeeConcession,
      paidComponents: dynamicPaidComponents
    };

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-sidebar tracking-tight uppercase flex items-center gap-2.5">
              <CreditCard className="w-7 h-7 text-emerald-500 shrink-0" />
              Fee Portal
            </h1>
            <p className="text-neutral-500 font-bold uppercase tracking-wider text-xs mt-0.5">
              Centralized Billing & Settlement Hub
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <select 
              className="px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-sm font-bold outline-none shadow-3xs uppercase tracking-wider"
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
            >
              {settings.academicYears?.map((year: string) => (
                <option key={year} value={year}>{year}</option>
              )) || <option value="2026-27">2026-27</option>}
            </select>

            <div className="bg-neutral-900 text-white rounded-xl px-4 py-2.5 shadow-sm border border-neutral-800 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-neutral-400 uppercase tracking-wider leading-none">Authenticated As</p>
                <p className="font-bold text-sm sm:text-base uppercase tracking-tight flex items-center gap-2 mt-1">
                  <span>{activeStudentData?.name || profile?.name || 'Authorized Student'}</span>
                  {((isStudent || isParent) && students.length > 1) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500/25 text-rose-300 text-[10px] font-bold uppercase tracking-wider rounded">
                      <Users className="w-3 h-3 text-rose-400" /> Sibling
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {activeStudentData && !loading ? (
          <div className="space-y-8">
            <StudentPortalFees 
              student={activeStudentData}
              feeRecord={currentFeeRecord as FeeRecord}
              payments={payments}
              onTakePayment={handleTakePayment}
              printReceipt={printReceipt}
              getFeeComponents={getFeeComponents}
              academicYear={filterAcademicYear}
              concessions={concessions}
            />
          </div>
        ) : (
          <div className="p-20 text-center bg-white rounded-[3rem] border border-dashed border-neutral-200">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
             <h3 className="text-xl font-black text-sidebar uppercase">Updating Payment Ledger Metrics...</h3>
          </div>
        )}

        {/* Dynamic Periperi / Standard Thermal Printer Stylesheet & Container */}
        <style>{`
          @media screen {
            .fees-thermal-print-container {
              display: none !important;
            }
          }
          @media print {
            body * {
              visibility: hidden !important;
            }
            .fees-thermal-print-container,
            .fees-thermal-print-container * {
              visibility: visible !important;
              color: #000000 !important;
              background-color: transparent !important;
              text-shadow: none !important;
              box-shadow: none !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            /* High density solid pure black overrides for everything inside receipt to prevent halftone smudging */
            .fees-thermal-print-container text,
            .fees-thermal-print-container span,
            .fees-thermal-print-container div,
            .fees-thermal-print-container td,
            .fees-thermal-print-container th,
            .fees-thermal-print-container p,
            .fees-thermal-print-container h2,
            .fees-thermal-print-container h3 {
              color: #000000 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            /* Avoid rendering shaded gray box backgrounds on thermal paper */
            .fees-thermal-print-container .bg-neutral-100,
            .fees-thermal-print-container .bg-neutral-50 {
              background-color: transparent !important;
              background: transparent !important;
              border: 1px solid #000000 !important;
            }
            /* Convert dithered dotted/dashed borders into clean sharp 1px solid black separators */
            .fees-thermal-print-container .border-dashed,
            .fees-thermal-print-container .border-dotted,
            .fees-thermal-print-container .border-neutral-200,
            .fees-thermal-print-container .border-neutral-300 {
              border-style: solid !important;
              border-color: #000000 !important;
              border-width: 1px 0 0 0 !important; 
            }
            .fees-thermal-print-container .border-black {
              border-color: #000000 !important;
              border-style: solid !important;
              border-width: 1px !important;
            }
            .fees-thermal-print-container {
              display: flex !important;
              flex-direction: column !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              background: white !important;
              color: black !important;
              margin: 0 !important;
              box-sizing: border-box !important;

              ${printPaperSize === '2in' ? `
                width: 58mm !important;
                max-width: 58mm !important;
                padding: 2mm !important;
                font-family: Arial, Helvetica, sans-serif !important;
                font-size: 10px !important;
                line-height: 1.15 !important;
              ` : ''}

              ${printPaperSize === '3in' ? `
                width: 80mm !important;
                max-width: 80mm !important;
                padding: 2mm !important;
                font-family: Arial, Helvetica, sans-serif !important;
                font-size: 11px !important;
                line-height: 1.15 !important;
              ` : ''}

              ${printPaperSize === 'a5' ? `
                width: 138mm !important;
                max-width: 138mm !important;
                min-height: 195mm !important;
                padding: 8mm !important;
                font-family: Arial, Helvetica, sans-serif !important;
                font-size: 14px !important;
                line-height: 1.3 !important;
                border: 2px solid #000000 !important;
                border-radius: 8px;
              ` : ''}
            }
            @page {
              ${printPaperSize === '2in' ? `
                size: 58mm auto !important;
                margin: 0 !important;
              ` : ''}
              ${printPaperSize === '3in' ? `
                size: 80mm auto !important;
                margin: 0 !important;
              ` : ''}
              ${printPaperSize === 'a5' ? `
                size: A5 portrait !important;
                margin: 4mm !important;
              ` : ''}
            }
            img {
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
          }
        `}</style>

        {(printingPayment || previewPayment) && (() => {
          const currentPrintPayment = printingPayment || previewPayment;
          if (!currentPrintPayment) return null;

          // Find the student details
          const pStudent = students.find(s => s.id === currentPrintPayment.studentId || s.uid === currentPrintPayment.studentId) || {
            name: "HARDWARE TEST STUDENT",
            classId: "test_class",
            batchId: "test_batch",
            admissionNumber: "ADM-999-TEST",
            rollNumber: "99",
            fatherName: "Test Father Name",
            parentName: "Test Father Name"
          };

          const pClass = classes.find(c => c.id === pStudent.classId)?.name || 'TEST CLASS';
          const pBatch = batches.find(b => b.id === pStudent.batchId)?.name || 'TEST BATCH';

          // Call calculateStudentFee to get general dues structure
          const targetYear = currentPrintPayment.academicYear || filterAcademicYear || '2026-27';
          const feeCalc = calculateStudentFee(pStudent as any, targetYear, feeStructures, concessions, classes, batches, false);

          // Get all payments for this student to calculate exact balances remaining
          const studentPayments = payments.filter(p => p.studentId === pStudent.id || p.studentId === pStudent.uid);

          const isConsolidated = currentPrintPayment.component && currentPrintPayment.component.startsWith('multi_');

          // Render detailed components paid list:
          let paidFeesList: Array<{ id: string; label: string; paid: number; balance: number }> = [];

          if (isConsolidated) {
            const rawComponent = currentPrintPayment.component || '';
            const cleanStr = rawComponent.replace('multi_CONSOLIDATED CHECKOUT [', '').replace(']', '').replace('multi_', '');
            const componentTokens = cleanStr.split(/[+&]/).map(t => t.trim());

            componentTokens.forEach(token => {
              const { compKey, label } = resolveCompKeyAndLabel(token);

              // Let's find outstanding balance for this component
              let totalForComp = 0;
              const ck = compKey as any;
              if (ck === 'term1') totalForComp = feeCalc.schoolFeeTerms?.term1 || 0;
              else if (ck === 'term2') totalForComp = feeCalc.schoolFeeTerms?.term2 || 0;
              else if (ck === 'term3') totalForComp = feeCalc.schoolFeeTerms?.term3 || 0;
              else if (ck === 'transport_term1') totalForComp = feeCalc.transportFeeTerms?.term1 || 0;
              else if (ck === 'transport_term2') totalForComp = feeCalc.transportFeeTerms?.term2 || 0;
              else if (ck === 'transport_term3') totalForComp = feeCalc.transportFeeTerms?.term3 || 0;
              else if (ck === 'hostel_term1') totalForComp = feeCalc.hostelFeeTerms?.term1 || 0;
              else if (ck === 'hostel_term2') totalForComp = feeCalc.hostelFeeTerms?.term2 || 0;
              else if (ck === 'hostel_term3') totalForComp = feeCalc.hostelFeeTerms?.term3 || 0;

              // Total paid so far for this component
              const totalPaidForComp = studentPayments
                .filter(p => p.component === compKey)
                .reduce((sum, p) => sum + Number(p.amount || 0), 0);

              const balanceLeft = Math.max(0, totalForComp - totalPaidForComp);

              paidFeesList.push({
                id: compKey,
                label: label,
                paid: currentPrintPayment.amount / componentTokens.length,
                balance: balanceLeft
              });
            });
          } else {
            const compKey = currentPrintPayment.component || 'school';
            const ck = compKey as any;
            let label = pStudent ? getComponentNameLabel(compKey) : 'School Tuition Dues';
            
            let totalForComp = currentPrintPayment.amount; // default
            if (ck === 'term1') totalForComp = feeCalc.schoolFeeTerms?.term1 || 0;
            else if (ck === 'term2') totalForComp = feeCalc.schoolFeeTerms?.term2 || 0;
            else if (ck === 'term3') totalForComp = feeCalc.schoolFeeTerms?.term3 || 0;
            else if (ck === 'transport_term1') totalForComp = feeCalc.transportFeeTerms?.term1 || 0;
            else if (ck === 'transport_term2') totalForComp = feeCalc.transportFeeTerms?.term2 || 0;
            else if (ck === 'transport_term3') totalForComp = feeCalc.transportFeeTerms?.term3 || 0;
            else if (ck === 'hostel_term1') totalForComp = feeCalc.hostelFeeTerms?.term1 || 0;
            else if (ck === 'hostel_term2') totalForComp = feeCalc.hostelFeeTerms?.term2 || 0;
            else if (ck === 'hostel_term3') totalForComp = feeCalc.hostelFeeTerms?.term3 || 0;
            else if (ck === 'school') totalForComp = feeCalc.schoolFee || 0;
            else if (ck === 'transport') totalForComp = feeCalc.transportFee || 0;
            else if (ck === 'hostel') totalForComp = feeCalc.hostelFee || 0;

            const totalPaidForComp = studentPayments
              .filter(p => p.component === compKey)
              .reduce((sum, p) => sum + Number(p.amount || 0), 0);

            const balanceLeft = Math.max(0, totalForComp - totalPaidForComp);

            paidFeesList.push({
              id: compKey,
              label: label,
              paid: Number(currentPrintPayment.amount),
              balance: balanceLeft
            });
          }

          // Let's construct due dates info & upcoming term fees
          const upcomingTerms: Array<{ label: string; amount: number; dueDate: string }> = [];
          if (feeCalc) {
            const schoolT1Paid = studentPayments.filter(p => p.component === 'term1').reduce((sum, p) => sum + Number(p.amount), 0);
            const schoolT2Paid = studentPayments.filter(p => p.component === 'term2').reduce((sum, p) => sum + Number(p.amount), 0);
            const schoolT3Paid = studentPayments.filter(p => p.component === 'term3').reduce((sum, p) => sum + Number(p.amount), 0);

            if (feeCalc.schoolFeeTerms?.term1 > schoolT1Paid) {
              upcomingTerms.push({ label: 'Term 1 Academic Fee', amount: feeCalc.schoolFeeTerms.term1 - schoolT1Paid, dueDate: feeCalc.schoolStructure?.term1DueDate || '08/06/2026' });
            }
            if (feeCalc.schoolFeeTerms?.term2 > schoolT2Paid) {
              upcomingTerms.push({ label: 'Term 2 Academic Fee', amount: feeCalc.schoolFeeTerms.term2 - schoolT2Paid, dueDate: feeCalc.schoolStructure?.term2DueDate || '05/10/2026' });
            }
            if (feeCalc.schoolFeeTerms?.term3 > schoolT3Paid) {
              upcomingTerms.push({ label: 'Term 3 Academic Fee', amount: feeCalc.schoolFeeTerms.term3 - schoolT3Paid, dueDate: feeCalc.schoolStructure?.term3DueDate || '05/01/2027' });
            }

            const transT1Paid = studentPayments.filter(p => p.component === 'transport_term1').reduce((sum, p) => sum + Number(p.amount), 0);
            const transT2Paid = studentPayments.filter(p => p.component === 'transport_term2').reduce((sum, p) => sum + Number(p.amount), 0);
            const transT3Paid = studentPayments.filter(p => p.component === 'transport_term3').reduce((sum, p) => sum + Number(p.amount), 0);

            if (feeCalc.transportFeeTerms?.term1 > transT1Paid) {
              upcomingTerms.push({ label: 'Term 1 Transport Fee', amount: feeCalc.transportFeeTerms.term1 - transT1Paid, dueDate: feeCalc.transportStructure?.term1DueDate || '05/07/2026' });
            }
            if (feeCalc.transportFeeTerms?.term2 > transT2Paid) {
              upcomingTerms.push({ label: 'Term 2 Transport Fee', amount: feeCalc.transportFeeTerms.term2 - transT2Paid, dueDate: '05/10/2026' });
            }
            if (feeCalc.transportFeeTerms?.term3 > transT3Paid) {
              upcomingTerms.push({ label: 'Term 3 Transport Fee', amount: feeCalc.transportFeeTerms.term3 - transT3Paid, dueDate: '05/01/2027' });
            }
          }

          return (
            <div className="fees-thermal-print-container text-black bg-white p-2 text-[11px] sm:text-[12px] leading-tight">
              {/* Header section with logo to the left of host/school name */}
              <div className="flex flex-row items-center justify-center gap-2 w-full border-b-[2px] border-black pb-1.5 select-none">
                {settings.logoUrl ? (
                  <img 
                    src={settings.logoUrl} 
                    className="w-12 h-12 object-contain shrink-0" 
                    alt="Logo" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center border border-red-200 shrink-0">
                    <span className="text-red-600 font-bold text-xs">St.A</span>
                  </div>
                )}
                <div className="text-left">
                  <h2 className="font-bold uppercase tracking-tight text-left text-black font-sans leading-none text-[16px] m-0 p-0">
                    St.Antony's School
                  </h2>
                  <p className="font-bold uppercase text-left font-sans leading-normal text-neutral-800 text-[9px] mt-0.5 m-0 p-0">
                    Porumamilla, Mobile: 8822269999, 8822279999
                  </p>
                </div>
              </div>

              {/* Receipt No and Date & Time as a single non-wrapping line with compact font */}
              <div className="w-full flex flex-row justify-between items-center text-black font-sans select-none pt-1.5 pb-1 whitespace-nowrap tracking-tight text-[10px] sm:text-[11px] border-b border-dashed border-neutral-300">
                <div className="flex flex-row items-center gap-0.5 shrink-0 uppercase">
                  <span className="text-neutral-500 font-bold">RECEIPT NO:</span>
                  <span className="text-[#E11D48] font-bold font-mono">
                    #{currentPrintPayment.serialNumber || currentPrintPayment.reference || currentPrintPayment.id}
                  </span>
                </div>
                <div className="flex flex-row items-center gap-0.5 shrink-0 text-right uppercase">
                  <span className="text-neutral-500 font-bold font-mono">DATE:</span>
                  <span className="text-neutral-900 font-mono font-normal">
                    {currentPrintPayment.date ? (currentPrintPayment.date.includes('T') ? currentPrintPayment.date.split('T')[0] : currentPrintPayment.date) : 'N/A'}
                    {currentPrintPayment.paymentTime ? ` | ${currentPrintPayment.paymentTime}` : ''}
                  </span>
                </div>
              </div>

              {/* Centered Fees Receipt Box styled elegantly, framed under a line */}
              <div className="w-full my-1.5 flex justify-center">
                <div className="border border-black bg-white text-black px-3 py-0.5 text-center font-bold uppercase text-[10px] tracking-wider font-sans">
                  Fees Receipt
                </div>
              </div>

              {/* Student Metadata List */}
              <div className="w-full text-left space-y-1 pb-1.5 border-b border-black text-[11px] font-sans text-black leading-tight">
                <div className="uppercase font-bold">NAME OF THE STUDENT: <span className="font-normal text-black ml-1">{pStudent.name}</span></div>
                <div className="uppercase font-bold">FATHER NAME: <span className="font-normal text-black ml-1">{pStudent.fatherName || pStudent.parentName || 'N/A'}</span></div>
                <div className="uppercase font-bold">CLASS & BATCH: <span className="font-normal text-black ml-1">{pClass} - {pBatch}</span></div>
                <div className="uppercase font-bold">RECEIPT BOOK NO: <span className="font-normal text-black ml-1">{currentPrintPayment.receiptBookName || "Main Institutional Book"}</span></div>
                {pStudent.admissionNumber && (
                  <div className="uppercase font-bold text-neutral-800">ADMISSION NO: <span className="font-normal ml-1">{pStudent.admissionNumber}</span></div>
                )}
              </div>

              {/* Centered Paid Fees Section */}
              <div className="my-1.5 text-center border-b border-dashed border-neutral-300 pb-1">
                <span className="font-bold uppercase tracking-wider text-[10px] text-black bg-neutral-100 px-3 py-0.5 rounded">Paid Fees</span>
              </div>

              {/* Itemised Paid Components */}
              <div className="w-full text-left text-[11px] space-y-1.5 my-1">
                {paidFeesList.map((item, idx) => {
                  const cId = item.id;
                  let displayCat = "Academic Fee";
                  if (cId.includes("transport")) {
                    displayCat = "Transport Fee";
                  } else if (cId.includes("hostel")) {
                    displayCat = "Hostel Fee";
                  } else if (cId === "ipl") {
                    displayCat = "IPL Special Batch Fee";
                  } else if (cId === "healthCard") {
                    displayCat = "Student Health Card Fee";
                  } else if (cId === "admission") {
                    displayCat = "Admission Fee";
                  } else if (cId === "lastClassFeeDue") {
                    displayCat = "Previous Dues";
                  }

                  return (
                    <div key={idx} className="space-y-0.5 pb-1 border-b border-dotted border-neutral-200">
                      <div className="flex justify-between font-bold text-black">
                        <span>{displayCat}: {item.label}:</span>
                        <span className="font-normal">₹{item.paid.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pl-3 text-[10px] text-neutral-500 font-normal italic">
                        <span>{item.label} balance:</span>
                        <span className="font-normal text-black">₹{item.balance.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Emphasis Box with thin solid border and light grey background */}
                <div className="flex justify-between items-center text-[11px] font-bold border border-black p-1.5 mt-2 bg-neutral-100 text-black">
                  <span className="font-bold">TOTAL PAID AMOUNT:</span>
                  <span className="text-[13px] font-mono font-bold">₹{Number(currentPrintPayment.amount || 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Present Term and old Terms Due dates (Modern Table Layout) */}
              <div className="text-left font-sans text-black pt-1.5 pb-1.5 mt-1.5 border-t border-black">
                <div className="text-center font-bold uppercase tracking-wider text-[10px] text-black border-b border-dashed border-neutral-300 pb-0.5 mb-1.5">
                  Present Term and old Terms Due dates
                </div>
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-black text-[9px] uppercase font-bold text-neutral-500">
                      <th className="py-0.5 text-left font-bold">Fee Category</th>
                      <th className="py-0.5 text-right font-bold w-[80px]">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeCalc?.schoolStructure?.term1DueDate && (
                      <tr className="border-b border-dotted border-neutral-200 text-[10px]">
                        <td className="py-0.5 font-bold">Term 1 Academic</td>
                        <td className="py-0.5 text-right font-normal text-neutral-800">{feeCalc.schoolStructure.term1DueDate}</td>
                      </tr>
                    )}
                    {feeCalc?.schoolStructure?.term2DueDate && (
                      <tr className="border-b border-dotted border-neutral-200 text-[10px]">
                        <td className="py-0.5 font-bold">Term 2 Academic</td>
                        <td className="py-0.5 text-right font-normal text-neutral-800">{feeCalc.schoolStructure.term2DueDate}</td>
                      </tr>
                    )}
                    {feeCalc?.schoolStructure?.term3DueDate && (
                      <tr className="border-b border-dotted border-neutral-200 text-[10px]">
                        <td className="py-0.5 font-bold">Term 3 Academic</td>
                        <td className="py-0.5 text-right font-normal text-neutral-800">{feeCalc.schoolStructure.term3DueDate}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Upcoming term fees with amount (Modern Table Layout) */}
              <div className="border-t border-black py-1.5 mt-1.5">
                <div className="text-center font-bold uppercase text-[10px] tracking-wider text-black pb-0.5 border-b border-dashed border-neutral-300 mb-1.5">
                  Upcoming term fees with amount
                </div>
                {upcomingTerms.length === 0 ? (
                  <div className="text-center text-neutral-500 italic py-0.5 text-[9px] font-normal">No pending upcoming terms left.</div>
                ) : (
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-black text-[9px] uppercase font-bold text-neutral-500">
                        <th className="py-0.5 text-left font-bold">Fee Category (Due)</th>
                        <th className="py-0.5 text-right font-bold w-[80px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingTerms.map((term, tIdx) => (
                        <tr key={tIdx} className="border-b border-dotted border-neutral-200 text-[10px]">
                          <td className="py-0.5 font-bold">
                            {term.label} <span className="font-normal text-neutral-500 text-[9px]">(Due: {term.dueDate})</span>
                          </td>
                          <td className="py-0.5 text-right font-normal text-neutral-800">
                            ₹{term.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Bottom Footer Section */}
              <div className="border-t border-black pt-1.5 mt-2 text-center">
                <p className="font-bold uppercase text-[10px] text-black tracking-tight leading-none">
                  Thank you St.Antony's School, Porumamilla
                </p>
                <p className="text-[8px] text-neutral-400 font-mono tracking-widest mt-1 uppercase">SYSTEM_SECURED_CHECKOUT</p>
              </div>
            </div>
          );
        })()}

        {/* MODAL: INTERACTIVE RECEIPT PREVIEW */}
        <AnimatePresence>
          {previewPayment && (
            <div className="fixed inset-0 bg-neutral-900/65 backdrop-blur-sm z-[150] flex items-center justify-center p-4 no-print">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden border border-neutral-200 flex flex-col max-h-[90vh]"
              >
                <div className="p-4 bg-neutral-50 border-b border-neutral-150 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <Printer className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-black uppercase tracking-tight text-neutral-800 font-sans">Direct Thermal Print Receipt</span>
                  </div>
                  <button 
                    onClick={() => setPreviewPayment(null)}
                    className="p-1.5 hover:bg-neutral-200 rounded-full text-neutral-400 hover:text-neutral-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-neutral-100 flex justify-center">
                  {(() => {
                    // Re-use content rendering block here to keep 100% look match
                    const pStudent = students.find(s => s.id === previewPayment.studentId || s.uid === previewPayment.studentId) || {
                      name: "HARDWARE TEST STUDENT",
                      classId: "test_class",
                      batchId: "test_batch",
                      admissionNumber: "ADM-999-TEST",
                      rollNumber: "99",
                      fatherName: "Test Father Name",
                      parentName: "Test Father Name"
                    };

                    const pClass = classes.find(c => c.id === pStudent.classId)?.name || 'TEST CLASS';
                    const pBatch = batches.find(b => b.id === pStudent.batchId)?.name || 'TEST BATCH';

                    const targetYear = previewPayment.academicYear || filterAcademicYear || '2026-27';
                    const feeCalc = calculateStudentFee(pStudent as any, targetYear, feeStructures, concessions, classes, batches, false);
                    const studentPayments = payments.filter(p => p.studentId === pStudent.id || p.studentId === pStudent.uid);

                    const isConsolidated = previewPayment.component && previewPayment.component.startsWith('multi_');

                    let paidFeesList: Array<{ id: string; label: string; paid: number; balance: number }> = [];

                    if (isConsolidated) {
                      const rawComponent = previewPayment.component || '';
                      const cleanStr = rawComponent.replace('multi_CONSOLIDATED CHECKOUT [', '').replace(']', '').replace('multi_', '');
                      const componentTokens = cleanStr.split(/[+&]/).map(t => t.trim());

                      componentTokens.forEach(token => {
                        const { compKey, label } = resolveCompKeyAndLabel(token);

                        let totalForComp = 0;
                        const ck = compKey as any;
                        if (ck === 'term1') totalForComp = feeCalc.schoolFeeTerms?.term1 || 0;
                        else if (ck === 'term2') totalForComp = feeCalc.schoolFeeTerms?.term2 || 0;
                        else if (ck === 'term3') totalForComp = feeCalc.schoolFeeTerms?.term3 || 0;
                        else if (ck === 'transport_term1') totalForComp = feeCalc.transportFeeTerms?.term1 || 0;
                        else if (ck === 'transport_term2') totalForComp = feeCalc.transportFeeTerms?.term2 || 0;
                        else if (ck === 'transport_term3') totalForComp = feeCalc.transportFeeTerms?.term3 || 0;
                        else if (ck === 'hostel_term1') totalForComp = feeCalc.hostelFeeTerms?.term1 || 0;
                        else if (ck === 'hostel_term2') totalForComp = feeCalc.hostelFeeTerms?.term2 || 0;
                        else if (ck === 'hostel_term3') totalForComp = feeCalc.hostelFeeTerms?.term3 || 0;

                        const totalPaidForComp = studentPayments
                          .filter(p => p.component === compKey)
                          .reduce((sum, p) => sum + Number(p.amount || 0), 0);

                        const balanceLeft = Math.max(0, totalForComp - totalPaidForComp);

                        paidFeesList.push({
                          id: compKey,
                          label: label,
                          paid: previewPayment.amount / componentTokens.length,
                          balance: balanceLeft
                        });
                      });
                    } else {
                      const compKey = previewPayment.component || 'school';
                      const ck = compKey as any;
                      let label = pStudent ? getComponentNameLabel(compKey) : 'School Tuition Dues';

                      let totalForComp = previewPayment.amount; // default
                      if (ck === 'term1') totalForComp = feeCalc.schoolFeeTerms?.term1 || 0;
                      else if (ck === 'term2') totalForComp = feeCalc.schoolFeeTerms?.term2 || 0;
                      else if (ck === 'term3') totalForComp = feeCalc.schoolFeeTerms?.term3 || 0;
                      else if (ck === 'transport_term1') totalForComp = feeCalc.transportFeeTerms?.term1 || 0;
                      else if (ck === 'transport_term2') totalForComp = feeCalc.transportFeeTerms?.term2 || 0;
                      else if (ck === 'transport_term3') totalForComp = feeCalc.transportFeeTerms?.term3 || 0;
                      else if (ck === 'hostel_term1') totalForComp = feeCalc.hostelFeeTerms?.term1 || 0;
                      else if (ck === 'hostel_term2') totalForComp = feeCalc.hostelFeeTerms?.term2 || 0;
                      else if (ck === 'hostel_term3') totalForComp = feeCalc.hostelFeeTerms?.term3 || 0;
                      else if (ck === 'school') totalForComp = feeCalc.schoolFee || 0;
                      else if (ck === 'transport') totalForComp = feeCalc.transportFee || 0;
                      else if (ck === 'hostel') totalForComp = feeCalc.hostelFee || 0;

                      const totalPaidForComp = studentPayments
                        .filter(p => p.component === compKey)
                        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

                      const balanceLeft = Math.max(0, totalForComp - totalPaidForComp);

                      paidFeesList.push({
                        id: compKey,
                        label: label,
                        paid: Number(previewPayment.amount),
                        balance: balanceLeft
                      });
                    }

                    const upcomingTerms: Array<{ label: string; amount: number; dueDate: string }> = [];
                    if (feeCalc) {
                      const schoolT1Paid = studentPayments.filter(p => p.component === 'term1').reduce((sum, p) => sum + Number(p.amount), 0);
                      const schoolT2Paid = studentPayments.filter(p => p.component === 'term2').reduce((sum, p) => sum + Number(p.amount), 0);
                      const schoolT3Paid = studentPayments.filter(p => p.component === 'term3').reduce((sum, p) => sum + Number(p.amount), 0);

                      if (feeCalc.schoolFeeTerms?.term1 > schoolT1Paid) {
                        upcomingTerms.push({ label: 'Term 1 Academic Fee', amount: feeCalc.schoolFeeTerms.term1 - schoolT1Paid, dueDate: feeCalc.schoolStructure?.term1DueDate || '08/06/2026' });
                      }
                      if (feeCalc.schoolFeeTerms?.term2 > schoolT2Paid) {
                        upcomingTerms.push({ label: 'Term 2 Academic Fee', amount: feeCalc.schoolFeeTerms.term2 - schoolT2Paid, dueDate: feeCalc.schoolStructure?.term2DueDate || '05/10/2026' });
                      }
                      if (feeCalc.schoolFeeTerms?.term3 > schoolT3Paid) {
                        upcomingTerms.push({ label: 'Term 3 Academic Fee', amount: feeCalc.schoolFeeTerms.term3 - schoolT3Paid, dueDate: feeCalc.schoolStructure?.term3DueDate || '05/01/2027' });
                      }

                      const transT1Paid = studentPayments.filter(p => p.component === 'transport_term1').reduce((sum, p) => sum + Number(p.amount), 0);
                      const transT2Paid = studentPayments.filter(p => p.component === 'transport_term2').reduce((sum, p) => sum + Number(p.amount), 0);
                      const transT3Paid = studentPayments.filter(p => p.component === 'transport_term3').reduce((sum, p) => sum + Number(p.amount), 0);

                      if (feeCalc.transportFeeTerms?.term1 > transT1Paid) {
                        upcomingTerms.push({ label: 'Term 1 Transport Fee', amount: feeCalc.transportFeeTerms.term1 - transT1Paid, dueDate: feeCalc.transportStructure?.term1DueDate || '05/07/2026' });
                      }
                      if (feeCalc.transportFeeTerms?.term2 > transT2Paid) {
                        upcomingTerms.push({ label: 'Term 2 Transport Fee', amount: feeCalc.transportFeeTerms.term2 - transT2Paid, dueDate: '05/10/2026' });
                      }
                      if (feeCalc.transportFeeTerms?.term3 > transT3Paid) {
                        upcomingTerms.push({ label: 'Term 3 Transport Fee', amount: feeCalc.transportFeeTerms.term3 - transT3Paid, dueDate: '05/01/2027' });
                      }
                    }

                    return (
                      <div className="bg-white w-[85mm] p-4 shadow-sm border border-neutral-200 rounded-2xl text-black space-y-3 font-sans text-[11px] sm:text-[12px] leading-tight">
                        {/* Header Section with logo on the left of school name */}
                        <div className="flex flex-row items-center justify-center gap-2 w-full border-b-[2px] border-black pb-1.5 select-none">
                          {settings.logoUrl ? (
                            <img 
                              src={settings.logoUrl} 
                              className="w-12 h-12 object-contain shrink-0" 
                              alt="Logo" 
                              referrerPolicy="no-referrer" 
                            />
                          ) : (
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center border border-red-200 shrink-0">
                              <span className="text-red-600 font-bold text-xs">St.A</span>
                            </div>
                          )}
                          <div className="text-left">
                            <h4 className="font-bold uppercase tracking-tight text-left text-black font-sans leading-none text-[16px] m-0 p-0">
                              St.Antony's School
                            </h4>
                            <p className="font-bold uppercase text-left font-sans leading-normal text-neutral-800 text-[9px] mt-0.5 m-0 p-0">
                              Porumamilla, Mobile: 8822269999, 8822279999
                            </p>
                          </div>
                        </div>

                        {/* Receipt No and Date & Time as a single non-wrapping line with compact font */}
                        <div className="w-full flex flex-row justify-between items-center text-black font-sans select-none pt-1.5 pb-1 whitespace-nowrap tracking-tight text-[10px] sm:text-[11px] border-b border-dashed border-neutral-300">
                          <div className="flex flex-row items-center gap-0.5 shrink-0 uppercase font-bold">
                            <span className="text-neutral-500">RECEIPT NO:</span>
                            <span className="text-[#E11D48] font-bold font-mono">
                              #{previewPayment.serialNumber || previewPayment.reference || previewPayment.id}
                            </span>
                          </div>
                          <div className="flex flex-row items-center gap-0.5 shrink-0 text-right uppercase font-bold">
                            <span className="text-neutral-500 font-mono">DATE:</span>
                            <span className="text-neutral-900 font-mono font-normal">
                              {previewPayment.date ? (previewPayment.date.includes('T') ? previewPayment.date.split('T')[0] : previewPayment.date) : 'N/A'}
                              {previewPayment.paymentTime ? ` | ${previewPayment.paymentTime}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Centered Fees Receipt Box styled elegantly, framed under a line */}
                        <div className="w-full my-1.5 flex justify-center">
                          <div className="border border-black bg-white text-black px-3 py-0.5 text-center font-bold uppercase text-[10px] tracking-wider font-sans">
                            Fees Receipt
                          </div>
                        </div>

                        {/* Metadata fields */}
                        <div className="w-full text-left space-y-1 pb-1.5 border-b border-black text-[11px] font-sans text-black leading-tight">
                          <div className="uppercase font-bold">NAME OF THE STUDENT: <span className="font-normal text-black ml-1">{pStudent.name}</span></div>
                          <div className="uppercase font-bold">FATHER NAME: <span className="font-normal text-black ml-1">{pStudent.fatherName || pStudent.parentName || 'N/A'}</span></div>
                          <div className="uppercase font-bold">CLASS & BATCH: <span className="font-normal text-black ml-1">{pClass} - {pBatch}</span></div>
                          <div className="uppercase font-bold">RECEIPT BOOK NO: <span className="font-normal text-black ml-1">{previewPayment.receiptBookName || "Main Institutional Book"}</span></div>
                          {pStudent.admissionNumber && (
                            <div className="uppercase font-bold text-neutral-800">ADMISSION NO: <span className="font-normal ml-1">{pStudent.admissionNumber}</span></div>
                          )}
                        </div>

                        {/* Centered Paid Fees Section */}
                        <div className="my-1.5 text-center border-b border-dashed border-neutral-300 pb-1">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-black bg-neutral-100 px-3 py-0.5 rounded">Paid Fees</span>
                        </div>

                        {/* Itemised lists */}
                        <div className="w-full text-left text-[11px] space-y-1.5">
                          {paidFeesList.map((item, idx) => {
                            const cId = item.id;
                            let displayCat = "Academic Fee";
                            if (cId.includes("transport")) {
                              displayCat = "Transport Fee";
                            } else if (cId.includes("hostel")) {
                              displayCat = "Hostel Fee";
                            } else if (cId === "ipl") {
                              displayCat = "IPL Special Batch Fee";
                            } else if (cId === "healthCard") {
                              displayCat = "Student Health Card Fee";
                            } else if (cId === "admission") {
                              displayCat = "Admission Fee";
                            } else if (cId === "lastClassFeeDue") {
                              displayCat = "Previous Dues";
                            }

                            return (
                              <div key={idx} className="space-y-0.5 pb-1 border-b border-dotted border-neutral-200">
                                <div className="flex justify-between font-bold text-black">
                                  <span>{displayCat}: {item.label}:</span>
                                  <span className="font-normal">₹{item.paid.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between pl-3 text-[10px] text-neutral-500 font-normal italic">
                                  <span>{item.label} balance:</span>
                                  <span className="font-normal text-black">₹{item.balance.toLocaleString()}</span>
                                </div>
                              </div>
                            );
                          })}

                          {/* Focus box for Total Paid Amount */}
                          <div className="flex justify-between items-center text-[11px] font-bold border border-black p-1.5 mt-2 bg-neutral-100 text-black">
                            <span className="font-bold">TOTAL PAID AMOUNT:</span>
                            <span className="text-[13px] font-mono font-bold">₹{Number(previewPayment.amount || 0).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Due dates block (Modern Table Layout) */}
                        <div className="text-left font-sans text-black pt-1.5 pb-1.5 mt-1.5 border-t border-black">
                          <div className="text-center font-bold uppercase tracking-wider text-[10px] text-black border-b border-dashed border-neutral-300 pb-0.5 mb-1.5">
                            Present Term and old Terms Due dates
                          </div>
                          <table className="w-full text-left text-[11px] border-collapse font-sans font-medium text-black">
                            <thead>
                              <tr className="border-b border-black text-[9px] uppercase font-bold text-neutral-500">
                                <th className="py-0.5 text-left font-bold">Fee Category</th>
                                <th className="py-0.5 text-right font-bold w-[80px]">Due Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {feeCalc?.schoolStructure?.term1DueDate && (
                                <tr className="border-b border-dotted border-neutral-200 text-[10px]">
                                  <td className="py-0.5 font-bold">Term 1 Academic</td>
                                  <td className="py-0.5 text-right font-normal text-neutral-800">{feeCalc.schoolStructure.term1DueDate}</td>
                                </tr>
                              )}
                              {feeCalc?.schoolStructure?.term2DueDate && (
                                <tr className="border-b border-dotted border-neutral-200 text-[10px]">
                                  <td className="py-0.5 font-bold">Term 2 Academic</td>
                                  <td className="py-0.5 text-right font-normal text-neutral-800">{feeCalc.schoolStructure.term2DueDate}</td>
                                </tr>
                              )}
                              {feeCalc?.schoolStructure?.term3DueDate && (
                                <tr className="border-b border-dotted border-neutral-200 text-[10px]">
                                  <td className="py-0.5 font-bold">Term 3 Academic</td>
                                  <td className="py-0.5 text-right font-normal text-neutral-800">{feeCalc.schoolStructure.term3DueDate}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Upcoming terms block (Modern Table Layout) */}
                        <div className="border-t border-black py-1.5 mt-1.5">
                          <div className="text-center font-bold uppercase text-[10px] tracking-wider text-black pb-0.5 border-b border-dashed border-neutral-300 mb-1.5">
                            Upcoming term fees with amount
                          </div>
                          {upcomingTerms.length === 0 ? (
                            <div className="text-center text-neutral-500 italic py-0.5 text-[9px] font-normal">No upcoming terms due left.</div>
                          ) : (
                            <table className="w-full text-left text-[11px] border-collapse font-sans font-medium text-black">
                              <thead>
                                <tr className="border-b border-black text-[9px] uppercase font-bold text-neutral-500">
                                  <th className="py-0.5 text-left font-bold">Fee Category (Due)</th>
                                  <th className="py-0.5 text-right font-bold w-[80px]">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {upcomingTerms.map((term, tIdx) => (
                                  <tr key={tIdx} className="border-b border-dotted border-neutral-200 text-[10px]">
                                    <td className="py-0.5 font-bold">
                                      {term.label} <span className="font-normal text-neutral-500 text-[9px]">(Due: {term.dueDate})</span>
                                    </td>
                                    <td className="py-0.5 text-right font-normal text-neutral-800">
                                      ₹{term.amount.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Footer section matching image bottom line */}
                        <div className="border-t border-black pt-1.5 mt-2 text-center">
                          <p className="font-bold uppercase text-[10px] text-black tracking-tight leading-none">
                            Thank you St.Antony's School, Porumamilla
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="p-4 bg-neutral-50 border-t border-neutral-150 flex flex-col gap-2 shrink-0">
                  <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pb-2 mb-1">
                    <span className="text-[10px] font-black uppercase text-neutral-400">Paper Width:</span>
                    <div className="flex bg-neutral-200 p-0.5 rounded-lg border border-neutral-300">
                      {(['2in', '3in', 'a5'] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handlePaperSizeChange(sz)}
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md ${
                            printPaperSize === sz 
                              ? 'bg-neutral-900 text-white shadow-sm' 
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      window.focus();
                      const originalTitle = document.title;
                      document.title = "Fees Receipt";
                      window.print();
                      document.title = originalTitle;
                    }}
                    className="w-full py-3 bg-neutral-900 hover:bg-neutral-850 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
                  >
                    <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
                    Print Receipt
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPrinterHint(true);
                        setPreviewPayment(null);
                      }}
                      className="py-2.5 bg-indigo-50 border border-indigo-150 text-indigo-600 rounded-xl font-black text-[9px] uppercase tracking-wider text-center"
                    >
                      Setup Guide
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPayment(null)}
                      className="py-2.5 bg-neutral-200 border border-neutral-300 text-neutral-600 rounded-xl font-black text-[9px] uppercase tracking-wider text-center"
                    >
                      Close Preview
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Printer Setup Instructions Modal */}
        {showPrinterHint && (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-100 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-500" />
                  Periperi 3" Printer Guide
                </h3>
                <button 
                  onClick={() => setShowPrinterHint(false)}
                  className="p-1.5 hover:bg-neutral-100 rounded-full transition-colors text-neutral-400 hover:text-neutral-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4 text-xs text-neutral-600 font-sans leading-relaxed">
                <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 text-indigo-800 font-medium">
                  This school ERP web application generates raw ESC/POS-compatible 3-inch thermal receipts (80mm width) directly from your screen layout. Follow the device instructions below.
                </div>

                <div className="space-y-2">
                  <p className="font-bold text-indigo-650 uppercase tracking-wider text-[10px] text-indigo-600">📱 Mobile & iPad / iOS Integration</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Turn on Bluetooth/Wi-Fi:</strong> Ensure your Periperi thermal printer is switched on and connected to your device.</li>
                    <li><strong>Recommended App (Android):</strong> Install the free <em>Escrow ESC/POS Print Service</em> or <em>RawBT</em> app to bridge Chrome print commands directly to Bluetooth.</li>
                    <li><strong>Recommended App (iOS / iPad):</strong> Use <em>Print n Share</em> or standard AirPrint thermal adapters.</li>
                    <li>Select active paper size as <strong>80mm x Receipt</strong> or <strong>3 inch</strong> width inside the print dialog.</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <p className="font-bold text-emerald-650 uppercase tracking-wider text-[10px] text-emerald-600">💻 Desktop (Windows / macOS) Integration</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Install the manufacturer thermal printer driver (XP-80, POS-80, or Periperi driver).</li>
                    <li>Open the web system, select <strong>"Print Receipt"</strong>, and choose your thermal printer from the destination list.</li>
                    <li>Under <strong>More Settings</strong>:
                      <ul className="list-circle pl-4 mt-1 space-y-1">
                        <li>Set <strong>Paper Size</strong> to <strong>80mm * 297mm</strong> (or 3-inch standard roll).</li>
                        <li>Set <strong>Margins</strong> to <strong>None</strong> or <strong>Minimal</strong>.</li>
                        <li>Uncheck <strong>Headers and Footers</strong> to prevent web links from printing.</li>
                      </ul>
                    </li>
                  </ul>
                </div>
              </div>

              <button 
                onClick={() => setShowPrinterHint(false)}
                className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all"
              >
                I understand
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isAdmin || isAccountant || profile?.role === 'play_school_incharge') {
    return (
      <div className="w-full px-2 sm:px-4 lg:px-6 pt-2 pb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
          <div>
            <h1 className="text-base sm:text-lg font-black text-sidebar tracking-tight uppercase flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-500" />
              Administrative Fees Console
            </h1>
            <p className="text-neutral-500 font-bold uppercase tracking-widest text-[8px] mt-0.5">
              Granting Admin & Accountant Full Management Access
            </p>
          </div>
          
          <div className="flex items-center gap-1.5">
            <select 
              className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-[9px] sm:text-[10px] font-black outline-none shadow-xs uppercase tracking-wider cursor-pointer"
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
            >
              {settings.academicYears?.map((year: string) => (
                <option key={year} value={year}>{year}</option>
              )) || <option value="2026-27">2026-27</option>}
            </select>
          </div>
        </div>

        {loading && !initialLoaded ? (
          <div className="p-20 text-center bg-white rounded-[3rem] border border-dashed border-neutral-200">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
             <h3 className="text-xl font-black text-sidebar uppercase">Generating Administrative Finance Ledger...</h3>
          </div>
        ) : (
          <div className="space-y-8">
            <AdminFeesView 
              students={students}
              fees={fees}
              feeStructures={feeStructures}
              concessions={concessions}
              payments={payments}
              classes={classes}
              batches={batches}
              academicYear={filterAcademicYear}
              onRefresh={fetchDuesData}
            />

            {/* Periperi Thermal Printer Quick Setup & Configuration banner */}
            <div className="bg-gradient-to-br from-indigo-50 to-neutral-50 border border-indigo-100/50 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print animate-fade-in">
              <div className="space-y-1">
                <h4 className="text-sm font-black text-indigo-900 uppercase tracking-tight flex items-center gap-2 font-sans">
                  <Printer className="w-4 h-4 text-indigo-500" />
                  Thermal Printer Setup Panel
                </h4>
                <p className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider font-sans">
                  Configure sheet size dimensions and launch hardware test patterns.
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-indigo-50/70 px-3.5 py-2 border border-indigo-100 rounded-xl">
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest font-sans">Sheet Size:</span>
                  <select
                    value={printPaperSize}
                    onChange={(e) => handlePaperSizeChange(e.target.value as any)}
                    className="bg-transparent focus:outline-none text-xs font-black uppercase text-indigo-900 hover:text-indigo-950 transition-colors cursor-pointer"
                  >
                    <option value="2in">2" Thermal Slip</option>
                    <option value="3in">3" Periperi / Thermal Slip</option>
                    <option value="a5">A5 Leaflet / Page</option>
                  </select>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => setShowPrinterHint(true)}
                    className="flex-1 sm:flex-none px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-neutral-200"
                  >
                    Setup Guide
                  </button>
                  <button 
                    onClick={handleTestPrint}
                    className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                  >
                    Test Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-12 text-center font-bold text-red-500 text-sm">View Restricted. Unauthorized Access.</div>
  );
};

export default Fees;