import React, { useEffect, useState } from 'react';
import { 
  X, 
  TrendingUp, 
  Calendar, 
  CreditCard, 
  Truck, 
  Sparkles, 
  Award, 
  AlertCircle,
  CheckCircle2,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  User,
  Banknote
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { dbService } from '../services/dbService';
import { where } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, AttendanceRecord, ResultRecord, FeeRecord, SubjectRecord, FeeStructure, FeeConcession } from '../types';
import { normalizeUrl, getGravatarUrl } from '../lib/utils';
import { calculateStudentFee, normalizeYear } from '../lib/feeUtils';
import { usePermissions } from '../hooks/usePermissions';
import { toast } from 'sonner';

interface Student360ViewProps {
  student: UserProfile;
  isOpen: boolean;
  onClose: () => void;
}

const Student360View: React.FC<Student360ViewProps> = ({ student, isOpen, onClose }) => {
  const [activeStudent, setActiveStudent] = useState<UserProfile>(student);
  const { isVicePrincipal, isAdmin, isSuperAdmin } = usePermissions();
  const canModifyConcession = isAdmin || isSuperAdmin || isVicePrincipal;
  const [savingConcession, setSavingConcession] = useState(false);

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [concessions, setConcessions] = useState<FeeConcession[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveStudent(student);
      fetchStudentData();
    }
  }, [isOpen, student.uid]);

  const handleUpdateConcession = async (concessionId: string) => {
    setSavingConcession(true);
    try {
      const studentId = student.uid || student.id;
      if (!studentId) throw new Error("Missing student ID");

      const finalConcessionId = concessionId === 'none' ? '' : concessionId;
      const updatePayload = { feeConcessionType: finalConcessionId };
      
      await Promise.all([
        dbService.update('users', studentId, updatePayload),
        dbService.update('students', studentId, updatePayload)
      ]);

      setActiveStudent(prev => ({ ...prev, feeConcessionType: finalConcessionId }));
      
      // Re-trigger student fee calculation and AI analysis re-trigger
      const attData = attendance;
      const resData = results;
      const feeData = fees;
      const structData = feeStructures;
      // Find updated concessions list
      const updatedConc = concessions;
      
      generateAIAnalysis(
        attData, 
        resData, 
        feeData,
        structData,
        updatedConc,
        classes,
        batches,
        { ...activeStudent, feeConcessionType: finalConcessionId }
      );

      toast.success("Fee Concession updated successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update concession");
    } finally {
      setSavingConcession(false);
    }
  };

  const handleUpdateCustomConcession = async (amount: number) => {
    setSavingConcession(true);
    try {
      const studentId = student.uid || student.id;
      if (!studentId) throw new Error("Missing student ID");

      const updatePayload = { 
        feeConcessionType: 'custom',
        feeConcessionAmount: amount
      };
      
      await Promise.all([
        dbService.update('users', studentId, updatePayload),
        dbService.update('students', studentId, updatePayload)
      ]);

      setActiveStudent(prev => ({ 
        ...prev, 
        feeConcessionType: 'custom',
        feeConcessionAmount: amount
      }));
      
      toast.success(`Custom Concession of ₹${amount} applied successfully!`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to update custom concession");
    } finally {
      setSavingConcession(false);
    }
  };

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const [attData, resData, subData, feeData, structData, concData, classData, batchData, payData, holidayData, schoolSettings] = await Promise.all([
        dbService.list('attendance', [where('studentId', '==', student.uid)]),
        dbService.list('examMarks', [where('studentId', '==', student.uid)]),
        dbService.list('subjects'),
        dbService.list('fees', [where('studentId', '==', student.uid)]),
        dbService.list('feeStructures'),
        dbService.list('concessions'),
        dbService.list('classes'),
        dbService.list('batches'),
        dbService.list('payments', [where('studentId', '==', student.uid)]),
        dbService.list('holidays'),
        dbService.get('settings', 'school')
      ]);

      const currentYear = schoolSettings?.currentAcademicYear || '2026-27';
      const currentYearDetails = schoolSettings?.academicYearDetails?.find((y: any) => y.name === currentYear);
      const academicYearStartDate = currentYearDetails?.startDate || `${currentYear.slice(0, 4)}-06-01`;

      const filteredAtt = (attData as any[]).filter(a => {
        if (a.date < academicYearStartDate) return false;
        const isHoliday = (holidayData as any[]).find(h => {
          const start = h.date;
          const end = h.toDate || h.date;
          return a.date >= start && a.date <= end && h.type !== 'working_day';
        });
        if (isHoliday) return false;
        return true;
      });

      setAttendance(filteredAtt as AttendanceRecord[]);
      setResults(resData as ResultRecord[]);
      setSubjects(subData as SubjectRecord[]);
      setFees(feeData as FeeRecord[]);
      setFeeStructures(structData as FeeStructure[]);
      setConcessions(concData as FeeConcession[]);
      setClasses(classData as any[]);
      setBatches(batchData as any[]);
      setPayments(payData as any[]);
      
      // Auto-trigger analysis if not already done
      generateAIAnalysis(
        attData as AttendanceRecord[], 
        resData as ResultRecord[], 
        feeData as FeeRecord[],
        structData as FeeStructure[],
        concData as FeeConcession[],
        classData as any[],
        batchData as any[]
      );
    } catch (error) {
      console.error("Error fetching 360 data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateAIAnalysis = async (
    att: AttendanceRecord[], 
    res: ResultRecord[], 
    fee: FeeRecord[],
    structs: FeeStructure[],
    concs: FeeConcession[],
    cls: any[],
    btch: any[],
    overrideStudent?: UserProfile
  ) => {
    setAnalyzing(true);
    try {
      const currentStudent = overrideStudent || activeStudent;
      const schoolSettings = await dbService.get('settings', 'school');
      const currentYear = schoolSettings?.currentAcademicYear || '2026-27';

      const attendanceSummary = {
        present: att.filter(a => a.status === 'present').length,
        total: att.length,
        percentage: att.length > 0 ? (att.filter(a => a.status === 'present').length / att.length * 100).toFixed(1) : '0'
      };

      const getMarksTotal = (r: any) => {
        if (typeof r.marks === 'number') return r.marks;
        const st1 = Number(r.st1) || 0;
        const st2 = Number(r.st2) || 0;
        const hw = Number(r.hw) || 0;
        const faWritten = Number(r.faWritten) || 0;
        const saWritten = Number(r.saWritten) || 0;
        return saWritten || (st1 + st2 + hw + faWritten);
      };

      const resultSummary = res.map(r => ({
        subject: subjects.find(s => s.id === r.subjectId)?.name || 'Unknown',
        marks: getMarksTotal(r),
        total: (r as any).totalMarks || (Number((r as any).saWritten) > 0 ? 100 : 50),
        grade: r.grade || 'N/A'
      }));

      // Calculate true fee status using shared logic
      const feeDetails = calculateStudentFee(currentStudent, currentYear, structs, concs, cls, btch, true);
      const currentYearFeeRecord = fee.find(f => f.academicYear === currentYear);
      
      const paidAmount = currentYearFeeRecord?.paidAmount || 0;
      const oldFee = currentYearFeeRecord?.oldFee || 0;
      const oldFeeConcession = currentYearFeeRecord?.oldFeeConcession || 0;
      const netOldFee = Math.max(0, oldFee - oldFeeConcession);
      const carryForward = (currentStudent as any).lastClassFeeDue || 0;
      
      const totalPayable = feeDetails.total + netOldFee + carryForward;
      const pendingAmount = Math.max(0, totalPayable - paidAmount);

      const isAIEnabled = schoolSettings?.aiApiKeyEnabled ?? true;
      const customKey = schoolSettings?.aiApiKey;
      const envKey = import.meta.env.VITE_GEMINI_API_KEY;
      const key = isAIEnabled ? (customKey || envKey) : null;
      
      if (!key || key === 'YOUR_GEMINI_API_KEY') {
        // Fallback static analysis if key is missing or disabled
        const gpa = res.length > 0 
          ? (res.reduce((acc, curr) => acc + (typeof curr.marks === 'number' ? curr.marks : 0), 0) / res.reduce((acc, curr) => acc + curr.totalMarks, 0) * 100)
          : 0;

        let mood: 'excellent' | 'good' | 'average' | 'concerning' = 'average';
        if (gpa > 85) mood = 'excellent';
        else if (gpa > 70) mood = 'good';
        else if (gpa < 50) mood = 'concerning';

        setAnalysis(JSON.stringify({
          strengths: `${currentStudent.name} shows ${gpa > 70 ? 'strong' : 'steady'} academic progress. ${Number(attendanceSummary.percentage) > 90 ? 'Attendance is excellent.' : ''}`,
          improvements: gpa < 75 ? "Focus on core subjects to improve overall percentage." : "Maintain current performance and participate more in activities.",
          suggestion: isAIEnabled ? "Gemini AI API key is not configured. Review charts below for detailed breakdown." : "AI Analysis is disabled in settings. Review data manually.",
          mood: mood
        }));
        return;
      }

      const ai = new GoogleGenAI({ apiKey: key });
      
      const prompt = `
        Analyze this student's data and provide a professional, encouraging internal school report.
        Student Name: ${currentStudent.name}
        Attendance: ${attendanceSummary.percentage}% (${attendanceSummary.present}/${attendanceSummary.total} days)
        Academic Results: ${JSON.stringify(resultSummary)}
        Fee Status: Paid ${paidAmount} out of ${totalPayable}. Pending: ${pendingAmount}
        Transport: ${currentStudent.transportType === 'school' ? 'Uses School Bus' : 'Private Transport'}
        
        Provide the analysis in JSON format with these exact keys:
        - strengths: string (A brief paragraph about what the student is doing well)
        - improvements: string (Areas where the student needs focus)
        - suggestion: string (Actionable advice for teachers/parents)
        - mood: 'excellent' | 'good' | 'average' | 'concerning' (Status based on all data)
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
      });

      setAnalysis(response.text || '');
    } catch (error) {
      console.error("AI Analysis error:", error);
      setAnalysis(JSON.stringify({
        strengths: "Information not available at the moment.",
        improvements: "Please check back later.",
        suggestion: "Monitor student's progress manually.",
        mood: "average"
      }));
    } finally {
      setAnalyzing(false);
    }
  };

  const parsedAnalysis = analysis ? JSON.parse(analysis) : null;

  // Calculate Fee Summary for UI
  const getFeeSummary = () => {
    // We need current academic year
    const currentYear = feeStructures[0]?.academicYear || '2026-27';
    
    const feeDetails = calculateStudentFee(activeStudent, currentYear, feeStructures, concessions, classes, batches, true);
    const currentYearFeeRecord = fees.find(f => normalizeYear(f.academicYear) === normalizeYear(currentYear));
    
    const dynamicPaid = payments
      .filter(p => !p.reference || !p.reference.startsWith('EXP'))
      .filter(p => normalizeYear(p.academicYear) === normalizeYear(currentYear))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const paidAmount = dynamicPaid || currentYearFeeRecord?.paidAmount || 0;
    const oldFee = currentYearFeeRecord?.oldFee || 0;
    const oldFeeConcession = currentYearFeeRecord?.oldFeeConcession || 0;
    const netOldFee = Math.max(0, oldFee - oldFeeConcession);
    const carryForward = Number((activeStudent as any).lastClassFeeDue || 0);
    
    const totalPayable = feeDetails.total + netOldFee + carryForward;
    const pendingAmount = Math.max(0, totalPayable - paidAmount);

    return {
      total: totalPayable,
      paid: paidAmount,
      pending: pendingAmount,
      feeDetails,
      netOldFee,
      carryForward
    };
  };

  const feeSummary = getFeeSummary();

  // Dynamic breakdown of details
  const getDetailedBreakdown = () => {
    const details = feeSummary.feeDetails; // From getFeeSummary()
    if (!details) return [];

    const currentYear = feeStructures[0]?.academicYear || '2026-27';
    const dynamicPaidComponents: Record<string, number> = {};
    payments
      .filter(p => !p.reference || !p.reference.startsWith('EXP'))
      .filter(p => normalizeYear(p.academicYear) === normalizeYear(currentYear))
      .forEach(p => {
        const comp = p.component || 'other';
        dynamicPaidComponents[comp] = (dynamicPaidComponents[comp] || 0) + (Number(p.amount) || 0);
      });

    const items = [
      {
        name: 'School / Academic Fee',
        total: Number(details.schoolFee) || 0,
        paid: Number(dynamicPaidComponents.term1 || 0) + Number(dynamicPaidComponents.term2 || 0) + Number(dynamicPaidComponents.term3 || 0),
      },
      {
        name: 'Transport Service Fee',
        total: Number(details.transportFee) || 0,
        paid: Number(dynamicPaidComponents.transport || 0) + Number(dynamicPaidComponents.transport_term1 || 0) + Number(dynamicPaidComponents.transport_term2 || 0) + Number(dynamicPaidComponents.transport_term3 || 0),
      },
      {
        name: 'Hostel Service Fee',
        total: Number(details.hostelFee) || 0,
        paid: Number(dynamicPaidComponents.hostel_term1 || 0) + Number(dynamicPaidComponents.hostel_term2 || 0) + Number(dynamicPaidComponents.hostel_term3 || 0),
      },
      {
        name: 'Previous Academic Year Dues',
        total: feeSummary.carryForward,
        paid: Number(dynamicPaidComponents.lastClassFeeDue || 0),
      },
      {
        name: 'Admission & Miscellaneous Fee',
        total: (Number(details.iplFee) || 0) + (Number(details.admissionFee) || 0) + (Number(details.healthCardFee) || 0),
        paid: Number(dynamicPaidComponents.other || 0) + Number(dynamicPaidComponents.admission || 0) + Number(dynamicPaidComponents.ipl || 0) + Number(dynamicPaidComponents.healthCard || 0) + Number(dynamicPaidComponents.lastClassFeeDue || 0),
      }
    ];

    return items.filter(item => item.total > 0);
  };

  const detailedBreakdown = getDetailedBreakdown();

  const sortedPaymentsPrev = [...payments]
    .filter(p => !p.reference || !p.reference.startsWith('EXP'))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  // Data for Charts
  const attendanceData = [
    { name: 'Present', value: attendance.filter(a => a.status === 'present').length },
    { name: 'Absent', value: attendance.filter(a => a.status === 'absent').length },
  ];

  const marksData = results.map(r => {
    const marksValue = (typeof r.marks === 'number') ? r.marks : (Number((r as any).st1) || 0) + (Number((r as any).st2) || 0) + (Number((r as any).hw) || 0) + (Number((r as any).faWritten) || 0) + (Number((r as any).saWritten) || 0);
    const totalPossible = r.totalMarks || (Number((r as any).saWritten) > 0 ? 100 : 50);
    return {
      subject: subjects.find(s => s.id === r.subjectId)?.name || 'Unknown',
      percentage: (marksValue / totalPossible * 100)
    };
  }).slice(0, 8);

  const COLORS = ['#22c55e', '#ef4444'];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-sidebar/80 backdrop-blur-md" 
            onClick={onClose} 
          />
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-neutral-50 w-full max-w-6xl max-h-[90vh] rounded-[40px] shadow-2xl relative z-10 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-white p-6 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden">
                    {normalizeUrl(activeStudent.photoURL || activeStudent.photoUrl || activeStudent.facePhotoURL || activeStudent.facePhotoUrl) ? (
                      <img src={normalizeUrl(activeStudent.photoURL || activeStudent.photoUrl || activeStudent.facePhotoURL || activeStudent.facePhotoUrl)} alt={activeStudent.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      activeStudent.email ? (
                        <img src={getGravatarUrl(activeStudent.email)} alt={activeStudent.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-8 h-8 text-primary" />
                      )
                    )}
                  </div>
                <div>
                  <h2 className={`text-2xl font-black ${(String(activeStudent.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{activeStudent.name}</h2>
                  <p className="text-sm font-bold text-neutral-400">Roll No: {activeStudent.rollNumber || (activeStudent as any).rollNo || 'N/A'} • Admission: {activeStudent.admissionNumber || 'N/A'}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-neutral-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {loading ? (
                <div className="h-96 flex flex-col items-center justify-center gap-4">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className="font-bold text-neutral-400">Assembling 360° Data Profile...</p>
                </div>
              ) : (
                <>
                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="p-2 bg-green-50 text-green-600 rounded-xl">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Attendance</span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-3xl font-black text-sidebar">
                          {attendance.length > 0 
                            ? ((attendance.filter(a => a.status === 'present').length / attendance.length) * 100).toFixed(1) 
                            : '0'}%
                        </h3>
                        <p className="text-xs font-bold text-neutral-400">
                          {attendance.filter(a => a.status === 'present').length} Present / {attendance.length} Days
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">GPA / Performance</span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-3xl font-black text-sidebar">
                          {results.length > 0 
                            ? (results.reduce((acc, curr) => acc + (typeof curr.marks === 'number' ? curr.marks : 0), 0) / results.reduce((acc, curr) => acc + curr.totalMarks, 0) * 100).toFixed(1)
                            : '0.0'}%
                        </h3>
                        <p className="text-xs font-bold text-neutral-400">Based on {results.length} exams</p>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
                            <Banknote className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Fees Status</span>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-3xl font-black text-sidebar">
                            ₹{feeSummary.pending.toLocaleString()}
                          </h3>
                          <p className={`text-xs font-bold ${feeSummary.pending > 0 ? 'text-orange-400' : 'text-green-500'}`}>
                            {feeSummary.pending > 0 ? 'Pending Dues' : 'Fees Cleared'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Active Concession</span>
                        <span className="text-xs font-black text-indigo-600">
                          {activeStudent.feeConcessionType === 'custom' 
                            ? `Custom Concession (₹${activeStudent.feeConcessionAmount || 0})` 
                            : (concessions.find(c => c.id === activeStudent.feeConcessionType)?.name || 'None')}
                        </span>
                      </div>

                      {canModifyConcession && (
                        <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                          <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest block">Update Concession</label>
                          <select
                            disabled={savingConcession}
                            value={activeStudent.feeConcessionType || 'none'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                const currentAmt = activeStudent.feeConcessionAmount || 0;
                                const input = prompt("Enter Custom Discount override amount (₹):", String(currentAmt));
                                if (input !== null) {
                                  handleUpdateCustomConcession(Number(input) || 0);
                                }
                              } else {
                                handleUpdateConcession(val);
                              }
                            }}
                            className="w-full text-xs font-bold p-2 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 transition-all text-sidebar"
                          >
                            <option value="none">None (No Concession)</option>
                            <option value="custom">Custom Concession Amount</option>
                            {concessions.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.type === 'percentage' ? `${c.value}%` : `₹${c.value}`})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                          <Truck className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Transport</span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-black text-sidebar capitalize">{activeStudent.transportType || 'Private'}</h3>
                        <p className="text-xs font-bold text-neutral-400">
                          {activeStudent.busRoute ? `Route: ${activeStudent.busRoute}` : 'Self Arranged'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* AI Analysis Section */}
                  <div className="bg-white rounded-[32px] border border-primary/20 shadow-xl shadow-primary/5 overflow-hidden">
                    <div className="bg-primary/5 p-6 border-b border-primary/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center">
                          <Sparkles className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-sidebar">Smart Analysis</h3>
                          <p className="text-xs font-bold text-primary/60">Powered by System AI</p>
                        </div>
                      </div>
                      {analyzing && <span className="text-xs font-black text-primary animate-bounce text-right">Analyzing data...</span>}
                    </div>
                    <div className="p-8">
                       {analyzing ? (
                         <div className="space-y-6">
                            <div className="h-4 bg-neutral-100 rounded-full w-3/4 animate-pulse" />
                            <div className="h-4 bg-neutral-100 rounded-full w-1/2 animate-pulse" />
                            <div className="h-20 bg-neutral-100 rounded-3xl animate-pulse" />
                         </div>
                       ) : parsedAnalysis ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                               <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-green-600">
                                     <Award className="w-5 h-5" />
                                     <h4 className="font-black text-sm uppercase tracking-widest">Core Strengths</h4>
                                  </div>
                                  <p className="text-neutral-600 text-sm leading-relaxed font-medium bg-green-50/50 p-4 rounded-2xl border border-green-100">
                                    {parsedAnalysis.strengths}
                                  </p>
                               </div>
                               <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-orange-600">
                                     <AlertCircle className="w-5 h-5" />
                                     <h4 className="font-black text-sm uppercase tracking-widest">Areas for Improvement</h4>
                                  </div>
                                  <p className="text-neutral-600 text-sm leading-relaxed font-medium bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                                    {parsedAnalysis.improvements}
                                  </p>
                               </div>
                            </div>
                            <div className="bg-sidebar rounded-3xl p-8 text-white space-y-6 flex flex-col justify-between">
                               <div className="space-y-4">
                                  <div className="flex items-center gap-2 opacity-60">
                                     <TrendingUp className="w-5 h-5" />
                                     <h4 className="font-black text-xs uppercase tracking-widest">AI Suggestion</h4>
                                  </div>
                                  <p className="text-lg font-bold leading-tight italic">
                                    "{parsedAnalysis.suggestion}"
                                  </p>
                               </div>
                               <div className="flex items-center justify-between pt-6 border-t border-white/10">
                                  <div className="space-y-1">
                                     <p className="text-[10px] font-black uppercase text-white/40">Overall Mood</p>
                                     <p className="text-sm font-black capitalize">{parsedAnalysis.mood}</p>
                                  </div>
                                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-xl ${
                                    parsedAnalysis.mood === 'excellent' ? 'bg-green-400' : 
                                    parsedAnalysis.mood === 'good' ? 'bg-blue-400' : 
                                    parsedAnalysis.mood === 'average' ? 'bg-orange-400' : 'bg-red-400'
                                  }`}>
                                     {parsedAnalysis.mood === 'excellent' ? '🏆' : 
                                      parsedAnalysis.mood === 'good' ? '✨' : 
                                      parsedAnalysis.mood === 'average' ? '📔' : '⚠️'}
                                  </div>
                               </div>
                            </div>
                         </div>
                       ) : (
                         <div className="text-center py-10 opacity-50 font-bold">No AI analysis available yet.</div>
                       )}
                    </div>
                  </div>

                  {/* Charts Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8">
                    <div className="bg-white p-8 rounded-[32px] border border-neutral-200 shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black text-sidebar flex items-center gap-2">
                          <PieChartIcon className="w-5 h-5 text-primary" />
                          Attendance Mix
                        </h3>
                      </div>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                               <Pie
                                  data={attendanceData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                               >
                                  {attendanceData.map((entry, index) => (
                                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                               </Pie>
                               <Tooltip />
                            </PieChart>
                         </ResponsiveContainer>
                         <div className="flex justify-center gap-6 mt-4">
                            {attendanceData.map((d, i) => (
                              <div key={d.name} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                                <span className="text-xs font-bold text-neutral-500">{d.name} ({d.value})</span>
                              </div>
                            ))}
                         </div>
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-[32px] border border-neutral-200 shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black text-sidebar flex items-center gap-2">
                          <BarChartIcon className="w-5 h-5 text-primary" />
                          Academic Performance (%)
                        </h3>
                      </div>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={marksData}>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                               <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280', fontWeight: 'bold' }} />
                               <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280', fontWeight: 'bold' }} />
                               <Tooltip 
                                  cursor={{ fill: '#F3F4F6' }}
                                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                               />
                               <Bar dataKey="percentage" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={24} />
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Fee Breakdown & Payment History */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-8">
                    {/* Fee Ledger Breakdown */}
                    <div className="bg-white p-8 rounded-[32px] border border-neutral-200 shadow-sm space-y-6">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                        <div>
                          <h3 className="text-lg font-black text-sidebar">Detailed Fee Breakdown</h3>
                          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-0.5">Session {feeStructures[0]?.academicYear || '2026-27'}</p>
                        </div>
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black uppercase tracking-wider">
                          Ledger Audit
                        </span>
                      </div>

                      <div className="space-y-4">
                        {detailedBreakdown.map((item, index) => {
                          const outstanding = Math.max(0, item.total - item.paid);
                          return (
                            <div key={index} className="p-4 bg-neutral-50 rounded-2xl space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="text-sm font-bold text-sidebar">{item.name}</h4>
                                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                    outstanding === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {outstanding === 0 ? 'Paid' : 'Pending'}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] text-neutral-400 font-bold uppercase leading-none">Total Charge</p>
                                  <p className="text-sm font-black text-sidebar">₹{item.total.toLocaleString()}</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-neutral-200/50 text-xs font-medium text-neutral-500">
                                <div className="space-y-0.5">
                                  <p className="text-[9px] text-neutral-400 font-bold uppercase">Settled</p>
                                  <p className="font-extrabold text-emerald-600">₹{item.paid.toLocaleString()}</p>
                                </div>
                                <div className="space-y-0.5 text-right">
                                  <p className="text-[9px] text-neutral-400 font-bold uppercase">Balance due</p>
                                  <p className={`font-extrabold ${outstanding > 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                                    ₹{outstanding.toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {detailedBreakdown.length === 0 && (
                          <div className="text-center py-10 opacity-50 font-bold">No active fees allocated to this profile.</div>
                        )}
                      </div>
                    </div>

                    {/* Payment History Log */}
                    <div className="bg-white p-8 rounded-[32px] border border-neutral-200 shadow-sm space-y-6 flex flex-col">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-4 shrink-0">
                        <div>
                          <h3 className="text-lg font-black text-sidebar">Payment History</h3>
                          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-0.5">Transactions registry</p>
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-black uppercase tracking-wider">
                          Real-Time Logs
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[380px] space-y-3 pr-2 scrollbar-thin">
                        {sortedPaymentsPrev.map((p, index) => (
                          <div key={index} className="p-4 border border-neutral-100 rounded-2xl flex justify-between items-center bg-white hover:bg-neutral-50/55 transition-all">
                            <div className="space-y-1">
                              <p className="text-xs font-extrabold text-sidebar capitalize">{p.component?.replace(/_/g, ' ') || 'General Fee'}</p>
                              <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-bold">
                                <span>{p.date ? new Date(p.date).toLocaleDateString() : 'N/A'}</span>
                                <span className="w-1 h-1 bg-neutral-300 rounded-full" />
                                <span className="uppercase text-[9px] px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded-md font-mono">{p.method || 'online'}</span>
                              </div>
                              <p className="text-[10px] text-indigo-500 font-mono font-bold leading-none">{p.reference || 'N/A'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-neutral-400 font-bold uppercase leading-none">Amount Settled</p>
                              <p className="text-base font-black text-emerald-600 mt-1">₹{Number(p.amount || 0).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}

                        {sortedPaymentsPrev.length === 0 && (
                          <div className="text-center py-20 opacity-45 font-bold flex flex-col items-center justify-center gap-2">
                            <CreditCard className="w-10 h-10 text-neutral-300" />
                            <span>No payment histories logged.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Student360View;
