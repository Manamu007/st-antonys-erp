import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Download, 
  Edit2, 
  Search, 
  Printer, 
  UserPlus, 
  RefreshCw, 
  FileSpreadsheet, 
  SlidersHorizontal,
  ChevronDown,
  X,
  Save,
  Building,
  Maximize2,
  Upload
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { useSettings } from '../context/SettingsContext';
import { usePermissions } from '../hooks/usePermissions';
import { toast } from 'sonner';
import { uploadService } from '../services/uploadService';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const formatNameInput = (val: string): string => {
  if (!val) return '';
  return val
    .split(/(\s+)/)
    .map(part => {
      if (!part.trim()) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
};

// Extension interface for Student with admission register specific details
interface RegisterStudent {
  id: string;
  uid: string;
  name: string;
  rollNumber?: string;
  admissionNumber?: string;
  aadharNumber?: string;
  motherTongue?: string;
  dob?: string;
  nationality?: string;
  state?: string;
  religion?: string;
  studentCaste?: string;
  studentSubCaste?: string;
  fatherName?: string;
  motherName?: string;
  address?: string;
  village?: string;
  fatherOccupation?: string;
  previousSchool?: string;
  dateOfAdmission?: string;
  admissionDate?: string;
  classId?: string;
  batchId?: string;
  status?: string;
  dropDate?: string;
  
  // Custom ledger register properties
  reg_recordSheetProduced?: 'YES' | 'NO' | 'N/A' | string;
  reg_tcProducedDetails?: string;
  reg_smallPoxProtected?: 'YES' | 'NO' | string;
  reg_marksOfId1?: string;
  reg_marksOfId2?: string;
  reg_mediumOfInstruction?: string;
  reg_hmInitialAdmission?: string;
  
  reg_classOnLeaving?: string;
  reg_reasonForLeaving?: string;
  reg_tcDetailsIssued?: string;
  reg_schoolToWhichGone?: string;
  reg_hmInitialLeaving?: string;
  reg_remarks?: string;

  // We keep a hook to access database properties
  [key: string]: any;
}

export default function AdmissionRegister() {
  const { settings } = useSettings();
  const { isAdmin, isPrincipal, isVicePrincipal, isClerk, profile, isTeacher } = usePermissions();

  const isTeacherRole = isTeacher || profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject' || profile?.isTeacherPortal === true || (typeof profile?.role === 'string' && profile.role.toLowerCase().includes('teacher'));
  const canEditRegister = (isAdmin || isPrincipal || isVicePrincipal || isClerk) && !isTeacherRole;

  if (profile?.role === 'play_school_incharge') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <h2 className="text-2xl font-black text-sidebar uppercase tracking-tight">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2 text-[15px] font-bold">
          You do not have permission to view the Admission Register.
        </p>
      </div>
    );
  }

  const [students, setStudents] = useState<RegisterStudent[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [academicYear, setAcademicYear] = useState(settings?.currentAcademicYear || '2026-27');
  const [folioPage, setFolioPage] = useState('48');
  const [vintageTheme, setVintageTheme] = useState(true);

  // Editing Drawer State
  const [editingStudent, setEditingStudent] = useState<RegisterStudent | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingSigAdm, setUploadingSigAdm] = useState(false);
  const [uploadingSigLv, setUploadingSigLv] = useState(false);

  const handleHMAdmissionSigUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingStudent) return;
    try {
      setUploadingSigAdm(true);
      const url = await uploadService.uploadFile(file);
      setEditingStudent(prev => prev ? { ...prev, reg_hmInitialAdmission: url } : null);
      toast.success("Headmaster admission signature uploaded!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload signature. Please try again.");
    } finally {
      setUploadingSigAdm(false);
    }
  };

  const handleHMLeavingSigUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingStudent) return;
    try {
      setUploadingSigLv(true);
      const url = await uploadService.uploadFile(file);
      setEditingStudent(prev => prev ? { ...prev, reg_hmInitialLeaving: url } : null);
      toast.success("Headmaster leaving signature uploaded!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload signature. Please try again.");
    } finally {
      setUploadingSigLv(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [studentsData, classesData, batchesData] = await Promise.all([
        dbService.list('students'),
        dbService.list('classes'),
        dbService.list('batches'),
      ]);

      setClasses(classesData);
      setBatches(batchesData);

      // Clean load students with register fallback defaults
      const mappedStudents: RegisterStudent[] = (studentsData as any[]).map(s => {
        const computedName = s.name || (s.firstName ? (s.secondName ? `${s.secondName} ${s.firstName}` : s.firstName) : '') || '';
        return {
          ...s,
          name: computedName,
          motherTongue: s.motherTongue || '',
          nationality: s.nationality || '',
          state: s.state || '',
          religion: s.religion || '',
          studentCaste: s.studentCaste || s.caste || '',
          studentSubCaste: s.studentSubCaste || s.subCaste || '',
          fatherOccupation: s.fatherOccupation || '',
          previousSchool: s.previousSchool || '',
          reg_recordSheetProduced: s.reg_recordSheetProduced || '',
          reg_tcProducedDetails: s.reg_tcProducedDetails || '',
          reg_smallPoxProtected: s.reg_smallPoxProtected || '',
          reg_marksOfId1: s.reg_marksOfId1 || '',
          reg_marksOfId2: s.reg_marksOfId2 || '',
          reg_mediumOfInstruction: s.reg_mediumOfInstruction || '',
          reg_hmInitialAdmission: s.reg_hmInitialAdmission || '',
          reg_classOnLeaving: s.reg_classOnLeaving || '',
          reg_reasonForLeaving: s.reg_reasonForLeaving || '',
          reg_tcDetailsIssued: s.reg_tcDetailsIssued || '',
          reg_schoolToWhichGone: s.reg_schoolToWhichGone || '',
          reg_hmInitialLeaving: s.reg_hmInitialLeaving || '',
          reg_remarks: s.reg_remarks || s.remarks || '',
        };
      });

      setStudents(mappedStudents);
    } catch (err: any) {
      console.error('Error loading admission register data:', err);
      toast.error('Failed to load student data for register');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    try {
      setSaving(true);
      
      const formattedName = formatNameInput(editingStudent.name || '');
      const formattedFatherName = formatNameInput(editingStudent.fatherName || '');
      const formattedMotherName = formatNameInput(editingStudent.motherName || '');

      // Split name into first and second names for student module profile sync
      let initialFirstName = '';
      let initialSecondName = '';
      const fullNameClean = formattedName.trim();
      const nameParts = fullNameClean.split(/\s+/).filter(Boolean);
      if (nameParts.length > 1) {
        // Telugu/Indian convention: Surname comes first
        initialSecondName = nameParts[0];
        initialFirstName = nameParts.slice(1).join(' ');
      } else if (nameParts.length === 1) {
        initialFirstName = nameParts[0];
        initialSecondName = '';
      }

      // Separate basic fields from layout specific ones
      const updateData = {
        name: formattedName,
        firstName: initialFirstName,
        secondName: initialSecondName,
        rollNumber: editingStudent.rollNumber || '',
        admissionNumber: editingStudent.admissionNumber || '',
        aadharNumber: editingStudent.aadharNumber || '',
        motherTongue: editingStudent.motherTongue || '',
        dob: editingStudent.dob || '',
        nationality: editingStudent.nationality || '',
        state: editingStudent.state || '',
        religion: editingStudent.religion || '',
        studentCaste: editingStudent.studentCaste || '',
        studentSubCaste: editingStudent.studentSubCaste || '',
        fatherName: formattedFatherName,
        motherName: formattedMotherName,
        address: editingStudent.address || '',
        village: editingStudent.village || '',
        fatherOccupation: editingStudent.fatherOccupation || '',
        previousSchool: editingStudent.previousSchool || '',
        dateOfAdmission: editingStudent.dateOfAdmission || editingStudent.admissionDate || '',
        admissionDate: editingStudent.dateOfAdmission || editingStudent.admissionDate || '',
        classId: editingStudent.classId || '',
        batchId: editingStudent.batchId || '',
        status: editingStudent.status || 'active',
        dropDate: editingStudent.dropDate || '',
        
        // Ledger registry specific fields
        reg_recordSheetProduced: editingStudent.reg_recordSheetProduced || '',
        reg_tcProducedDetails: editingStudent.reg_tcProducedDetails || '',
        reg_smallPoxProtected: editingStudent.reg_smallPoxProtected || '',
        reg_marksOfId1: editingStudent.reg_marksOfId1 || '',
        reg_marksOfId2: editingStudent.reg_marksOfId2 || '',
        reg_mediumOfInstruction: editingStudent.reg_mediumOfInstruction || '',
        reg_hmInitialAdmission: editingStudent.reg_hmInitialAdmission || '',
        reg_classOnLeaving: editingStudent.reg_classOnLeaving || '',
        reg_reasonForLeaving: editingStudent.reg_reasonForLeaving || '',
        reg_tcDetailsIssued: editingStudent.reg_tcDetailsIssued || '',
        reg_schoolToWhichGone: editingStudent.reg_schoolToWhichGone || '',
        reg_hmInitialLeaving: editingStudent.reg_hmInitialLeaving || '',
        reg_remarks: editingStudent.reg_remarks || '',
      };

      await dbService.update('students', editingStudent.id, updateData);
      
      // Update in local state
      setStudents(prev => prev.map(s => s.id === editingStudent.id ? { ...s, ...updateData } : s));
      toast.success(`Successfully saved register details for ${editingStudent.name}`);
      setEditingStudent(null);
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Failed to update ledger records');
    } finally {
      setSaving(false);
    }
  };

  // Date Parsing Helpers
  const parseDayMonthYear = (dateStr?: string) => {
    if (!dateStr) return { day: '-', month: '-', year: '-' };
    try {
      const parts = dateStr.split('-'); // Expected: YYYY-MM-DD
      if (parts.length === 3) {
        return {
          day: parts[2],
          month: parts[1],
          year: parts[0]
        };
      }
      // Alternate slash format fallback
      const slashParts = dateStr.split('/');
      if (slashParts.length === 3) {
        return {
          day: slashParts[0],
          month: slashParts[1],
          year: slashParts[2]
        };
      }
    } catch {}
    return { day: '-', month: '-', year: '-' };
  };

  // Filter students
  const filteredStudents = students.filter(student => {
    const sName = (student.name || '').toLowerCase();
    const sSearch = (searchTerm || '').toLowerCase().trim();
    const sAdm = (student.admissionNumber || '').toLowerCase();
    const sRoll = (student.rollNumber || '').toLowerCase();
    const sAadhar = String(student.aadharNumber || '');

    const matchesSearch = !sSearch || 
      sName.includes(sSearch) ||
      sAadhar.includes(sSearch) ||
      sAdm.includes(sSearch) ||
      sRoll.includes(sSearch);

    const matchesClass = selectedClass === 'all' || student.classId === selectedClass;
    const matchesBatch = selectedBatch === 'all' || student.batchId === selectedBatch;
    const matchesStatus = selectedStatus === 'all' || student.status === selectedStatus;

    return matchesSearch && matchesClass && matchesBatch && matchesStatus;
  });

  // Get Class Name by ID
  const getClassName = (classId?: string) => {
    const cls = classes.find(c => c.id === classId);
    return cls ? cls.name : (classId || '-');
  };

  // Export to PDF (A3 landscape or portrait)
  const exportPDF = (orientation: 'landscape' | 'portrait') => {
    try {
      const doc = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: 'a3'
      });

      // Layout width computation
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Antique ledger theme colors
      doc.setFillColor(253, 251, 242); // Clean linen cream
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Title & Appendix Headers
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(110, 80, 40);
      doc.text("Appendix 19 (Rule 123, Chap. III) A.E. Rules", 15, 12);
      doc.text(`FOLIO: ${folioPage}`, pageWidth - 35, 12);

      doc.setFontSize(22);
      doc.text("REGISTER OF ADMISSIONS AND WITHDRAWALS", pageWidth / 2, 22, { align: 'center' });
      doc.setFontSize(12);
      doc.text("ప్రవేశిక మరియు నిష్క్రమణల పుస్తకము", pageWidth / 2, 28, { align: 'center' });

      doc.setFontSize(11);
      doc.text(`Academic Year: ${academicYear}   |   School: ${settings.schoolName || 'St. Antony\'s EM High School'}`, pageWidth / 2, 35, { align: 'center' });

      // Create pristine tabular columns
      const headers = [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27"],
        [
          "Admn No.",
          "Pupil Name / Aadhar",
          "MT",
          "DOB D",
          "DOB M",
          "DOB Y",
          "Nat/St",
          "Relg",
          "Caste Code",
          "Father & Mother Name",
          "Residence",
          "Parent Occup",
          "Prev School & Class",
          "Adm D",
          "Adm M",
          "Adm Y",
          "Class Adm",
          "Rec Sheet?",
          "TC Produced/Date",
          "Small Pox?",
          "Iden Marks",
          "Medium",
          "HM Init",
          "Leaving Cls",
          "Leaving Date",
          "Reason Leaving",
          "TC issued / Remarks"
        ]
      ];

      const rows = filteredStudents.map((s) => {
        const dob = parseDayMonthYear(s.dob);
        const adm = parseDayMonthYear(s.dateOfAdmission);
        const leave = parseDayMonthYear(s.dropDate);

        return [
          s.admissionNumber || '-',
          `${s.name}\nAadhar: ${s.aadharNumber || 'N/A'}`,
          s.motherTongue || '-',
          dob.day,
          dob.month,
          dob.year,
          `${s.nationality || '-'}/${s.state || '-'}`,
          s.religion || '-',
          `${s.studentCaste || '-'} ${s.studentSubCaste ? `(${s.studentSubCaste})` : ''}`,
          `1) ${s.fatherName || '-'}\n2) ${s.motherName || '-'}`,
          s.village || s.address || '-',
          s.fatherOccupation || '-',
          s.previousSchool || '-',
          adm.day,
          adm.month,
          adm.year,
          getClassName(s.classId),
          s.reg_recordSheetProduced || '-',
          s.reg_tcProducedDetails || '-',
          s.reg_smallPoxProtected || '-',
          `${s.reg_marksOfId1 || '-'}\n${s.reg_marksOfId2 || ''}`,
          s.reg_mediumOfInstruction || '-',
          s.reg_hmInitialAdmission || '',
          s.reg_classOnLeaving || '-',
          s.dropDate ? `${leave.day}/${leave.month}/${leave.year}` : '-',
          s.reg_reasonForLeaving || '-',
          `${s.reg_tcDetailsIssued || '-'}\n${s.reg_remarks || ''}`
        ];
      });

      autoTable(doc, {
        head: headers,
        body: rows,
        startY: 42,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 2,
          valign: 'middle',
          halign: 'center',
          textColor: [40, 30, 20],
          lineColor: [210, 195, 175],
          lineWidth: 0.15,
          font: 'Helvetica'
        },
        headStyles: {
          fillColor: [242, 234, 218],
          textColor: [100, 70, 30],
          fontStyle: 'bold',
          fontSize: 7.5
        },
        alternateRowStyles: {
          fillColor: [249, 246, 238]
        },
        columnStyles: {
          1: { halign: 'left', cellWidth: 35 },
          9: { halign: 'left', cellWidth: 35 },
          10: { halign: 'left', cellWidth: 25 },
          12: { halign: 'left', cellWidth: 30 },
          20: { halign: 'left', cellWidth: 30 },
          26: { halign: 'left', cellWidth: 30 }
        },
        margin: { left: 10, right: 10 }
      });

      // Save output
      doc.save(`Admission_Register_A3_${orientation}_Folio_${folioPage}.pdf`);
      toast.success(`Successfully exported A3 ${orientation} Official Register!`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Export to PDF failed: ${err.message}`);
    }
  };

  // Export to Excel Ledger
  const exportExcel = () => {
    try {
      const dataToExport = filteredStudents.map((s, idx) => {
        const dob = parseDayMonthYear(s.dob);
        const adm = parseDayMonthYear(s.dateOfAdmission);
        const leave = parseDayMonthYear(s.dropDate);

        return {
          "Col 1: Admission Serial No": s.admissionNumber || '',
          "Col 2: Name of the Pupil": s.name,
          "Col 2: Aadhar card No.": s.aadharNumber || '',
          "Col 3: Mother-Tongue": s.motherTongue || '',
          "Col 4: DOB Day": dob.day,
          "Col 5: DOB Month": dob.month,
          "Col 6: DOB Year": dob.year,
          "Col 7: Nationality": s.nationality || '',
          "Col 7: State": s.state || '',
          "Col 8: Religion": s.religion || '',
          "Col 9: Caste Code": s.studentCaste || '',
          "Col 9: Sub-Caste": s.studentSubCaste || '',
          "Col 10: Parent (Father)": s.fatherName || '',
          "Col 10: Parent (Mother)": s.motherName || '',
          "Col 11: Residence": s.village || s.address || '',
          "Col 12: Parent Occupation": s.fatherOccupation || '',
          "Col 13: Previous School": s.previousSchool || '',
          "Col 14: Admission Day": adm.day,
          "Col 15: Admission Month": adm.month,
          "Col 16: Admission Year": adm.year,
          "Col 17: Class on Admission": getClassName(s.classId),
          "Col 18: Record Sheet Produced?": s.reg_recordSheetProduced || '',
          "Col 19: TC Produced Details": s.reg_tcProducedDetails || '',
          "Col 20: Small-Pox Protected?": s.reg_smallPoxProtected || '',
          "Col 21: Mark of ID 1": s.reg_marksOfId1 || '',
          "Col 21: Mark of ID 2": s.reg_marksOfId2 || '',
          "Col 22: Medium Of Instruction": s.reg_mediumOfInstruction || '',
          "Col 23: HM Initial (Adm)": s.reg_hmInitialAdmission || '',
          "Col 24: Class on Leaving": s.reg_classOnLeaving || '',
          "Col 25: Leaving Day": leave.day,
          "Col 26: Leaving Month": leave.month,
          "Col 27: Leaving Year": leave.year,
          "Col 28: Reason for Leaving": s.reg_reasonForLeaving || '',
          "Col 29: TC issued No & Date": s.reg_tcDetailsIssued || '',
          "Col 30: Destination School": s.reg_schoolToWhichGone || '',
          "Col 31: HM Initial (Leaving)": s.reg_hmInitialLeaving || '',
          "Remarks": s.reg_remarks || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Admission Register");
      XLSX.writeFile(wb, `Admission_Register_Folio_${folioPage}.xlsx`);
      toast.success("Successfully exported Excel Ledger!");
    } catch (err: any) {
      console.error(err);
      toast.error(`Excel export failed: ${err.message}`);
    }
  };

  return (
    <div id="admission-register-root" className="space-y-8 animate-in fade-in duration-300 p-1">
      {/* Visual Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-sidebar/50 rounded-[2rem] border border-white/10 p-8 backdrop-blur-md">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-500/10 rounded-2xl text-rose-400">
              <BookOpen className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">Admission Register Portal</h1>
              <p className="text-sm text-neutral-400 font-mono">ప్రవేశిక మరియు నిష్క్రమణల పుస్తకము (Official School Archival Book)</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setVintageTheme(!vintageTheme)}
            className={`px-5 py-3 rounded-xl font-bold font-mono text-xs uppercase flex items-center gap-2 border transition-all ${
              vintageTheme 
                ? 'bg-amber-100/10 border-amber-500/30 text-amber-300 shadow-amber-500/10 shadow-lg' 
                : 'bg-white/5 border-white/10 text-neutral-400'
            }`}
          >
            <Maximize2 className="w-4 h-4" />
            Theme: {vintageTheme ? 'Vintage Ledger' : 'Modern Slate'}
          </button>

          <button 
            onClick={fetchInitialData}
            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 transition-all"
            title="Refresh Ledger"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {/* Export Dropdown buttons in elegant layouts */}
          <div className="flex items-center gap-1.5 bg-neutral-900 border border-white/10 p-1 rounded-2xl">
            <button
              onClick={() => exportPDF('landscape')}
              className="px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              A3 Landscape
            </button>
            <button
              onClick={() => exportPDF('portrait')}
              className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold uppercase flex items-center gap-1 transition-all"
            >
              A3 Portrait
            </button>
            <button
              onClick={exportExcel}
              className="p-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 rounded-xl transition-all"
              title="Export Excel Ledger"
            >
              <FileSpreadsheet className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and settings bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 bg-sidebar/20 border border-white/5 p-6 rounded-3xl">
        <div className="lg:col-span-2 space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Search Student Ledger</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 w-4 font-black h-4 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Name, Roll No, Admn No, Aadhar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-900/60 border border-white/10 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Select Class</label>
          <select 
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setSelectedBatch('all'); // reset batch on class change
            }}
            className="w-full px-4 py-2.5 bg-neutral-900/60 border border-white/10 rounded-xl text-sm text-neutral-300 focus:outline-none focus:border-rose-500"
          >
            <option value="all">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Select Batch</label>
          <select 
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            disabled={selectedClass === 'all'}
            className="w-full px-4 py-2.5 bg-neutral-900/60 border border-white/10 rounded-xl text-sm text-neutral-300 focus:outline-none focus:border-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <option value="all">All Batches</option>
            {batches
              .filter(b => b.classId === selectedClass)
              .map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))
            }
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Status</label>
          <select 
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-900/60 border border-white/10 rounded-xl text-sm text-neutral-300 focus:outline-none focus:border-rose-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive / TC Issued</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Academic Year</label>
          <input 
            type="text"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="w-full px-4 py-2 bg-neutral-900/60 border border-white/10 rounded-xl text-sm text-white font-mono placeholder-neutral-500 font-bold focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Folio Number</label>
          <input 
            type="text"
            value={folioPage}
            onChange={(e) => setFolioPage(e.target.value)}
            placeholder="e.g. 48"
            className="w-full px-4 py-2 bg-neutral-900/60 border border-white/10 rounded-xl text-sm text-white font-mono placeholder-neutral-500 font-bold focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="w-10 h-10 text-rose-500 animate-spin" />
          <p className="text-sm font-mono text-neutral-400">Loading historical registers from student database...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-mono text-neutral-400">
              Displaying <strong className="text-neutral-200">{filteredStudents.length}</strong> pupil rows matching query constraints.
            </span>
            <div className="text-[11px] font-mono text-amber-500/80 bg-amber-500/5 px-3 py-1 rounded-full border border-amber-500/20">
              ⚡ Action: Select edit icon to fill required official columns
            </div>
          </div>

          {/* Genuine 27 Column Ledger Table Area */}
          <div className="relative rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
            <div className={`overflow-x-auto select-text custom-scrollbar ${
              vintageTheme 
                ? 'bg-[#fcfbf7] border-amber-200' 
                : 'bg-neutral-950/80'
            }`}>
              <table className="w-full border-collapse text-left min-w-[3200px]">
                
                {/* Visual Ledger Upper Header Bar */}
                <thead>
                  <tr className={vintageTheme ? 'bg-[#f5f2e8] border-b-2 border-amber-200' : 'bg-neutral-900 border-b border-white/10'}>
                    <th colSpan={3} className={`p-4 border-r uppercase tracking-widest text-xs font-black text-center ${
                      vintageTheme ? 'border-amber-200 text-amber-900' : 'border-white/5 text-white'
                    }`}>
                      1. Basic Pupil Registry
                    </th>
                    <th colSpan={3} className={`p-4 border-r uppercase tracking-widest text-xs font-black text-center ${
                      vintageTheme ? 'border-amber-200 text-amber-900' : 'border-white/5 text-white'
                    }`}>
                      2. Birth Particulars
                    </th>
                    <th colSpan={3} className={`p-4 border-r uppercase tracking-widest text-xs font-black text-center ${
                      vintageTheme ? 'border-amber-200 text-amber-900' : 'border-white/5 text-white'
                    }`}>
                      3. Identity / Caste Detail
                    </th>
                    <th colSpan={4} className={`p-4 border-r uppercase tracking-widest text-xs font-black text-center ${
                      vintageTheme ? 'border-amber-200 text-amber-900' : 'border-white/5 text-white'
                    }`}>
                      4. Parentage & Home Details
                    </th>
                    <th colSpan={6} className={`p-4 border-r uppercase tracking-widest text-xs font-black text-center ${
                      vintageTheme ? 'border-amber-200 text-amber-900' : 'border-white/5 text-white'
                    }`}>
                      5. Admission Enrollment Data
                    </th>
                    <th colSpan={4} className={`p-4 border-r uppercase tracking-widest text-xs font-black text-center ${
                      vintageTheme ? 'border-amber-200 text-amber-900' : 'border-white/5 text-white'
                    }`}>
                      6. Medical & Identification
                    </th>
                    <th colSpan={4} className={`p-4 border-r uppercase tracking-widest text-xs font-black text-center ${
                      vintageTheme ? 'border-amber-200 text-amber-900' : 'border-white/5 text-white'
                    }`}>
                      7. Exit / Leaving Particulars
                    </th>
                    <th className="p-4 text-center">Settings</th>
                  </tr>

                  {/* Comprehensive Column Labels */}
                  <tr className={`text-[11px] font-black uppercase font-mono ${
                    vintageTheme ? 'bg-[#ebe5d5]/80 text-[#5c462b]' : 'bg-neutral-900/60 text-neutral-300'
                  }`}>
                    {/* basic */}
                    <th className={`p-3 border-r ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Admission Serial No. / ప్రవేశిక సంఖ్య</th>
                    <th className={`p-3 border-r min-w-[240px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Name of pupil / Aadhar Number</th>
                    <th className={`p-3 border-r min-w-[120px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Mother-Tongue / మాతృభాష</th>
                    
                    {/* dob */}
                    <th className={`p-3 border-r text-center ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>DOB Day</th>
                    <th className={`p-3 border-r text-center ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>DOB Month</th>
                    <th className={`p-3 border-r text-center ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>DOB Year</th>

                    {/* caste */}
                    <th className={`p-3 border-r min-w-[140px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Nationality & State / జాతీయత</th>
                    <th className={`p-3 border-r min-w-[110px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Religion / మతం</th>
                    <th className={`p-3 border-r min-w-[140px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Caste / SC/ST/BC/OC</th>

                    {/* parentage */}
                    <th className={`p-3 border-r min-w-[200px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>1. Father Name, 2. Mother Name</th>
                    <th className={`p-3 border-r min-w-[170px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Residence / నివాస స్థలము</th>
                    <th className={`p-3 border-r min-w-[130px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Parent Occupation / వృత్తి</th>
                    <th className={`p-3 border-r min-w-[190px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>School & Class previously come</th>

                    {/* admission */}
                    <th className={`p-3 border-r text-center ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Adm Day</th>
                    <th className={`p-3 border-r text-center ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Adm Month</th>
                    <th className={`p-3 border-r text-center ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Adm Year</th>
                    <th className={`p-3 border-r min-w-[110px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Class on Admission</th>
                    <th className={`p-3 border-r min-w-[120px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Rec Sheet produced?</th>
                    <th className={`p-3 border-r min-w-[200px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>TC Produced / Record No. & Date</th>

                    {/* medical */}
                    <th className={`p-3 border-r min-w-[110px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Protected Small-Pox?</th>
                    <th className={`p-3 border-r min-w-[220px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Marks of Identification</th>
                    <th className={`p-3 border-r min-w-[110px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Medium</th>
                    <th className={`p-3 border-r min-w-[110px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>HM Init (Adm)</th>

                    {/* exit */}
                    <th className={`p-3 border-r min-w-[120px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Class on Leaving</th>
                    <th className={`p-3 border-r min-w-[150px] text-center ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Date of Leaving</th>
                    <th className={`p-3 border-r min-w-[150px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>Reason for Leaving</th>
                    <th className={`p-3 border-r min-w-[250px] ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>No & Date of TC Issued / Destination School</th>

                    <th className="p-3 text-center min-w-[100px]">Action</th>
                  </tr>

                  {/* Printed Index Columns from 1 to 27 in circle format to mimic high-fidelity photos */}
                  <tr className={`text-xs font-black font-mono border-y ${
                    vintageTheme ? 'bg-[#ebe5d5] text-amber-900/60 border-amber-200' : 'bg-neutral-900 text-neutral-500 border-white/5'
                  }`}>
                    {Array.from({ length: 27 }).map((_, i) => (
                      <td key={i} className={`p-1.5 text-center border-r ${vintageTheme ? 'border-amber-200' : 'border-white/5'}`}>
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${
                          vintageTheme ? 'border-amber-300 bg-amber-50 text-amber-900 font-bold' : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                    ))}
                    <td className="p-1.5 text-center font-bold">INFO</td>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y text-xs font-mono">
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map((s, idx) => {
                      const dob = parseDayMonthYear(s.dob);
                      const adm = parseDayMonthYear(s.dateOfAdmission);
                      const leave = parseDayMonthYear(s.dropDate);

                      return (
                        <tr 
                          key={s.id} 
                          className={`hover:bg-rose-500/5 transition-colors ${
                            vintageTheme 
                              ? `${idx % 2 === 0 ? 'bg-[#faf8f2]' : 'bg-[#f4efe3]'} text-neutral-800 border-amber-100` 
                              : `${idx % 2 === 0 ? 'bg-[#18181b]/30' : 'bg-[#09090b]/40'} text-neutral-300 border-white/5`
                          }`}
                        >
                          {/* 1 - Admn No */}
                          <td className={`p-4 font-black border-r text-center ${vintageTheme ? 'border-amber-100 text-amber-800' : 'border-white/5 text-rose-400'}`}>
                            {s.admissionNumber || '-'}
                          </td>

                          {/* 2 - Pupil name + Aadhar */}
                          <td className={`p-4 border-r space-y-1 ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            <div className="font-sans font-black text-neutral-900 dark:text-white uppercase leading-none">{s.name}</div>
                            {s.aadharNumber && (
                              <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                                <span>★ Validated Aadhar:</span>
                                <span className="font-bold underline tracking-wider">{s.aadharNumber}</span>
                              </div>
                            )}
                          </td>

                          {/* 3 - MT */}
                          <td className={`p-4 border-r text-center ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.motherTongue || '-'}
                          </td>

                          {/* 4, 5, 6 - DOB */}
                          <td className={`p-4 border-r text-center font-bold ${vintageTheme ? 'border-amber-100 text-amber-700' : 'border-white/5'}`}>{dob.day}</td>
                          <td className={`p-4 border-r text-center font-bold ${vintageTheme ? 'border-amber-100 text-amber-700' : 'border-white/5'}`}>{dob.month}</td>
                          <td className={`p-4 border-r text-center font-bold ${vintageTheme ? 'border-amber-100 text-amber-700' : 'border-white/5'}`}>{dob.year}</td>

                          {/* 7 - Nat/St */}
                          <td className={`p-4 border-r ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.nationality || '-'} / {s.state || '-'}
                          </td>

                          {/* 8 - Rel */}
                          <td className={`p-4 border-r ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.religion || '-'}
                          </td>

                          {/* 9 - Category / Caste */}
                          <td className={`p-4 border-r ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            <span className="font-bold uppercase text-amber-850 dark:text-amber-500">{s.studentCaste || '-'}</span>
                            {s.studentSubCaste && <span className="text-[10px] text-neutral-500 block">({s.studentSubCaste})</span>}
                          </td>

                          {/* 10 - parent name */}
                          <td className={`p-4 border-r leading-tight ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            <div className="text-neutral-800 dark:text-neutral-300">1) <span className="font-sans font-bold">{s.fatherName || 'N/A'}</span></div>
                            <div className="text-neutral-600 dark:text-neutral-400">2) <span className="font-sans">{s.motherName || 'N/A'}</span></div>
                          </td>

                          {/* 11 - Residence */}
                          <td className={`p-4 border-r ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.village || s.address || '-'}
                          </td>

                          {/* 12 - parent occup */}
                          <td className={`p-4 border-r ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.fatherOccupation || '-'}
                          </td>

                          {/* 13 - Prev School & Class */}
                          <td className={`p-4 border-r text-neutral-700 dark:text-neutral-400 ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.previousSchool || '-'}
                          </td>

                          {/* 14, 15, 16 - Admission Date */}
                          <td className={`p-4 border-r text-center ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>{adm.day}</td>
                          <td className={`p-4 border-r text-center ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>{adm.month}</td>
                          <td className={`p-4 border-r text-center ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>{adm.year}</td>

                          {/* 17 - Class on Adm */}
                          <td className={`p-4 border-r text-center font-bold font-sans ${vintageTheme ? 'border-amber-100 text-teal-800' : 'border-white/5 text-teal-400'}`}>
                            {getClassName(s.classId)}
                          </td>

                          {/* 18 - Record Sheet Produced */}
                          <td className={`p-4 border-r text-center font-bold ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${
                              s.reg_recordSheetProduced === 'YES' 
                                ? 'bg-emerald-500/10 text-emerald-500' 
                                : 'bg-red-500/10 text-red-500'
                            }`}>
                              {s.reg_recordSheetProduced || '-'}
                            </span>
                          </td>

                          {/* 19 - TC produced description */}
                          <td className={`p-4 border-r max-w-xs truncate ${vintageTheme ? 'border-amber-100 text-amber-900/80' : 'border-white/5'}`}>
                            {s.reg_tcProducedDetails || '-'}
                          </td>

                          {/* 20 - Small Pox Protected */}
                          <td className={`p-4 border-r text-center font-bold ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            <span className="text-emerald-500">{s.reg_smallPoxProtected || '-'}</span>
                          </td>

                          {/* 21 - Identification Marks */}
                          <td className={`p-4 border-r leading-tight text-[10px] ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.reg_marksOfId1 ? (
                              <div className="space-y-1">
                                <p className="truncate"><span className="text-amber-700 font-bold">1)</span> {s.reg_marksOfId1}</p>
                                {s.reg_marksOfId2 && <p className="truncate"><span className="text-amber-700 font-bold">2)</span> {s.reg_marksOfId2}</p>}
                              </div>
                            ) : '-'}
                          </td>

                          {/* 22 - Medium */}
                          <td className={`p-4 border-r text-center font-black ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.reg_mediumOfInstruction || '-'}
                          </td>

                          {/* 23 - HM Init Admission */}
                          <td className={`p-4 border-r text-center italic text-[11px] ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {(s.reg_hmInitialAdmission?.startsWith('http') || s.reg_hmInitialAdmission?.startsWith('data:image/')) ? (
                              <img 
                                src={s.reg_hmInitialAdmission} 
                                className="max-h-8 max-w-[80px] object-contain mx-auto" 
                                alt="HM Signature" 
                                referrerPolicy="no-referrer" 
                              />
                            ) : (
                              s.reg_hmInitialAdmission || '-'
                            )}
                          </td>

                          {/* 24 - Class on leaving */}
                          <td className={`p-4 border-r text-center ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.reg_classOnLeaving || (s.status === 'inactive' ? getClassName(s.classId) : '-')}
                          </td>

                          {/* 25 - Leaving Date */}
                          <td className={`p-4 border-r text-center ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.dropDate ? `${leave.day}/${leave.month}/${leave.year}` : '-'}
                          </td>

                          {/* 26 - Reason for leaving */}
                          <td className={`p-4 border-r max-w-xs truncate ${vintageTheme ? 'border-amber-100' : 'border-white/5'}`}>
                            {s.reg_reasonForLeaving || '-'}
                          </td>

                          {/* 27 - TC Issued & destination school */}
                          <td className={`p-4 border-r leading-tight text-[10px] ${vintageTheme ? 'border-amber-100 text-neutral-600 dark:text-neutral-400' : 'border-white/5'}`}>
                            {s.reg_tcDetailsIssued && <div>No: {s.reg_tcDetailsIssued}</div>}
                            {s.reg_schoolToWhichGone && <div>To: <span className="underline">{s.reg_schoolToWhichGone}</span></div>}
                            {s.reg_remarks && <div className="italic text-rose-500">Remarks: {s.reg_remarks}</div>}
                            {!s.reg_tcDetailsIssued && !s.reg_schoolToWhichGone && !s.reg_remarks && '-'}
                          </td>

                          {/* Actions - Edit registry details */}
                          <td className="p-4 text-center">
                            {canEditRegister ? (
                              <button
                                onClick={() => setEditingStudent(s)}
                                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[11px] font-bold uppercase inline-flex items-center gap-1 transition-all"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Update
                              </button>
                            ) : (
                              <span className="text-neutral-400 text-xs font-mono font-bold">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={28} className="p-16 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Building className="w-12 h-12 text-rose-400 animate-bounce" />
                          <p className="text-base font-black text-white uppercase font-mono">No matching student ledger entries found</p>
                          <p className="text-xs text-neutral-400">Try modifying filter criteria or search phrase to discover catalogued items</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Editing Drawer Modal Container */}
      <AnimatePresence>
        {editingStudent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/70 backdrop-blur-sm">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-4xl h-full bg-neutral-950 border-l border-white/10 flex flex-col shadow-2xl relative select-text"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/5 bg-sidebar/55">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono tracking-widest font-black text-rose-400 uppercase bg-rose-500/10 px-2.5 py-1 rounded-full">
                    Official Editing Desk
                  </span>
                  <h3 className="text-xl font-black text-white uppercase font-sans">
                    Ledger Update: {editingStudent.name}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Aadhar Number: <span className="font-mono text-neutral-200">{editingStudent.aadharNumber || 'NOT CONFIGURED'}</span>
                  </p>
                </div>
                <button
                  onClick={() => setEditingStudent(null)}
                  className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleUpdateStudent} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                
                {/* Section A: Basic student info sync */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#cfaf76] border-b border-neutral-800 pb-2 font-mono">Section I: Basic & Parent Particulars</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Admission Number / Serial</label>
                      <input 
                        type="text"
                        value={editingStudent.admissionNumber || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, admissionNumber: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Pupil Full Name</label>
                      <input 
                        type="text"
                        value={editingStudent.name || ''}
                        required
                        onChange={(e) => setEditingStudent({ ...editingStudent, name: formatNameInput(e.target.value) })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Aadhar Card Number</label>
                      <input 
                        type="text"
                        value={editingStudent.aadharNumber || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, aadharNumber: e.target.value })}
                        placeholder="e.g. 5432-1098-7654"
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Mother Tongue</label>
                      <input 
                        type="text"
                        value={editingStudent.motherTongue || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, motherTongue: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Date of Birth</label>
                      <input 
                        type="date"
                        value={editingStudent.dob || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, dob: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Religion & Caste Info</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={editingStudent.religion || ''}
                          onChange={(e) => setEditingStudent({ ...editingStudent, religion: e.target.value })}
                          placeholder="Religion"
                          className="w-1/2 px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                        />
                        <input 
                          type="text"
                          value={editingStudent.studentCaste || ''}
                          onChange={(e) => setEditingStudent({ ...editingStudent, studentCaste: e.target.value })}
                          placeholder="Caste / SC/ST/BC"
                          className="w-1/2 px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Caste Sub-Category</label>
                      <input 
                        type="text"
                        value={editingStudent.studentSubCaste || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, studentSubCaste: e.target.value })}
                        placeholder="e.g. BC-D / Kapu"
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Father Name</label>
                      <input 
                        type="text"
                        value={editingStudent.fatherName || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, fatherName: formatNameInput(e.target.value) })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Mother Name</label>
                      <input 
                        type="text"
                        value={editingStudent.motherName || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, motherName: formatNameInput(e.target.value) })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Parent Occupation</label>
                      <input 
                        type="text"
                        value={editingStudent.fatherOccupation || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, fatherOccupation: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Residence / Residence Village</label>
                      <input 
                        type="text"
                        value={editingStudent.village || editingStudent.address || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, village: e.target.value, address: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Previous School Joined</label>
                      <input 
                        type="text"
                        value={editingStudent.previousSchool || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, previousSchool: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Section B: Official ledger controls */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#cfaf76] border-b border-neutral-800 pb-2 font-mono">Section II: Official Admission & Health Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Admission Date</label>
                      <input 
                        type="date"
                        value={editingStudent.dateOfAdmission || editingStudent.admissionDate || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, dateOfAdmission: e.target.value, admissionDate: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Record Sheet Produced?</label>
                      <select 
                        value={editingStudent.reg_recordSheetProduced || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_recordSheetProduced: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      >
                        <option value="">-- Select --</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                        <option value="N/A">N/A / EXEMPTED</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Transfer Certificate No & Record Date</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_tcProducedDetails || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_tcProducedDetails: e.target.value })}
                        placeholder="e.g. TC 115516 - 06/07/2022"
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Protected From Small-Pox/Immunised?</label>
                      <select 
                        value={editingStudent.reg_smallPoxProtected || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_smallPoxProtected: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      >
                        <option value="">-- Select --</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Personal Mark Of Identification 1</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_marksOfId1 || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_marksOfId1: e.target.value })}
                        placeholder="Mole on left side collar bone"
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Personal Mark Of Identification 2</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_marksOfId2 || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_marksOfId2: e.target.value })}
                        placeholder="Dark scar near right elbow"
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Medium of Instruction</label>
                      <select 
                        value={editingStudent.reg_mediumOfInstruction || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_mediumOfInstruction: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      >
                        <option value="">-- Select --</option>
                        <option value="ENGLISH">ENGLISH</option>
                        <option value="TELUGU">TELUGU</option>
                        <option value="HINDI">HINDI</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold flex items-center justify-between">
                        <span>HM Initial at Admission</span>
                        {uploadingSigAdm && <span className="text-[10px] text-teal-400 animate-pulse">Uploading...</span>}
                      </label>
                      <div className="space-y-2 p-3 bg-neutral-900 border border-white/5 rounded-xl">
                        {(editingStudent.reg_hmInitialAdmission?.startsWith('http') || editingStudent.reg_hmInitialAdmission?.startsWith('data:image/')) ? (
                          <div className="flex flex-col items-center justify-center border border-dashed border-white/10 bg-black/40 p-2 rounded-lg relative group">
                            <img 
                              src={editingStudent.reg_hmInitialAdmission} 
                              alt="Admission HM" 
                              className="h-10 object-contain"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => setEditingStudent({ ...editingStudent, reg_hmInitialAdmission: '' })}
                              className="absolute top-1 right-1 p-1 bg-red-950/80 hover:bg-red-900 text-red-500 rounded-md text-[10px]"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <input 
                            type="text"
                            value={editingStudent.reg_hmInitialAdmission || ''}
                            placeholder="Type initials or select upload"
                            onChange={(e) => setEditingStudent({ ...editingStudent, reg_hmInitialAdmission: e.target.value })}
                            className="w-full px-3 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-white"
                          />
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <label className="cursor-pointer px-2 py-1 bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold rounded-md transition-all flex items-center gap-1">
                            <Upload className="w-3 h-3" />
                            Upload Sig
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*" 
                              onChange={handleHMAdmissionSigUpload} 
                            />
                          </label>

                          {settings.hmSignatureUrl && (
                            <button
                              type="button"
                              onClick={() => setEditingStudent({ ...editingStudent, reg_hmInitialAdmission: settings.hmSignatureUrl })}
                              className="px-2 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-[10px] font-bold rounded-md transition-all flex items-center gap-1"
                            >
                              Apply Global HM Sig
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section C: Student Exit criteria */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#cfaf76] border-b border-neutral-800 pb-2 font-mono">Section III: Archive & Leaving Particulars</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Status of student</label>
                      <select 
                        value={editingStudent.status || 'active'}
                        onChange={(e) => setEditingStudent({ ...editingStudent, status: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive / TC Issued</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Class on Leaving</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_classOnLeaving || ''}
                        placeholder="e.g. Class IX"
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_classOnLeaving: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Leaving Date</label>
                      <input 
                        type="date"
                        value={editingStudent.dropDate || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, dropDate: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Reason for Leaving</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_reasonForLeaving || ''}
                        placeholder="e.g. Higher studies, Relocation"
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_reasonForLeaving: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">TC Issued Details (Number / Date)</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_tcDetailsIssued || ''}
                        placeholder="e.g. TC 214320 / 28-06-2024"
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_tcDetailsIssued: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold">Destination school gone to</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_schoolToWhichGone || ''}
                        placeholder="e.g. Government Junior College, Porumamilla"
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_schoolToWhichGone: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-400 font-bold flex items-center justify-between">
                        <span>HM Initial at Leaving</span>
                        {uploadingSigLv && <span className="text-[10px] text-teal-400 animate-pulse">Uploading...</span>}
                      </label>
                      <div className="space-y-2 p-3 bg-neutral-900 border border-white/5 rounded-xl">
                        {(editingStudent.reg_hmInitialLeaving?.startsWith('http') || editingStudent.reg_hmInitialLeaving?.startsWith('data:image/')) ? (
                          <div className="flex flex-col items-center justify-center border border-dashed border-white/10 bg-black/40 p-2 rounded-lg relative group">
                            <img 
                              src={editingStudent.reg_hmInitialLeaving} 
                              alt="Leaving HM" 
                              className="h-10 object-contain"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => setEditingStudent({ ...editingStudent, reg_hmInitialLeaving: '' })}
                              className="absolute top-1 right-1 p-1 bg-red-950/80 hover:bg-red-900 text-red-500 rounded-md text-[10px]"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <input 
                            type="text"
                            value={editingStudent.reg_hmInitialLeaving || ''}
                            placeholder="Type initials or select upload"
                            onChange={(e) => setEditingStudent({ ...editingStudent, reg_hmInitialLeaving: e.target.value })}
                            className="w-full px-3 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-white"
                          />
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <label className="cursor-pointer px-2 py-1 bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold rounded-md transition-all flex items-center gap-1">
                            <Upload className="w-3 h-3" />
                            Upload Sig
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*" 
                              onChange={handleHMLeavingSigUpload} 
                            />
                          </label>

                          {settings.hmSignatureUrl && (
                            <button
                              type="button"
                              onClick={() => setEditingStudent({ ...editingStudent, reg_hmInitialLeaving: settings.hmSignatureUrl })}
                              className="px-2 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-[10px] font-bold rounded-md transition-all flex items-center gap-1"
                            >
                              Apply Global HM Sig
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs text-neutral-400 font-bold">Official Remarks / Bookkeeping notes</label>
                      <input 
                        type="text"
                        value={editingStudent.reg_remarks || ''}
                        placeholder="e.g. Excellent conduct / Cleared all school dues"
                        onChange={(e) => setEditingStudent({ ...editingStudent, reg_remarks: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-sm text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="pt-6 border-t border-white/5 flex items-center justify-end gap-3 sticky bottom-0 bg-neutral-950 p-4">
                  <button 
                    type="button"
                    onClick={() => setEditingStudent(null)}
                    className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-300 font-bold text-sm rounded-xl uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="px-8 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-black text-sm rounded-xl uppercase flex items-center gap-2 shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Persist Ledger
                      </>
                    )}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
