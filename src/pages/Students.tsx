import React, { useEffect, useState, useRef, type FC } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IndexNoticeBanner } from '../components/IndexNoticeBanner';
import { dbService, checkQuotaStatus } from '../services/dbService';
import { where, orderBy, limit, startAfter } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { 
  Users, 
  Search, 
  RefreshCw,
  User,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Plus,
  Edit,
  Trash2,
  X,
  AlertTriangle,
  Camera,
  Upload,
  Download,
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { getTeacherAssignments, filterClassesForTeacher, filterBatchesForTeacher, filterStudentsForTeacher, checkIsTeacherAccount } from '../utils/teacherFilter';
import { uploadService } from '../services/uploadService';
import Papa from 'papaparse';
import { ClassRecord, BatchRecord, FeeConcession } from '../types';
import { normalizeUrl, getGravatarUrl, sortAlphabetically, resolveStudentClassAndBatch } from '../lib/utils';
import { isDemoStudentRecord, isKnownDemoName } from '../constants/systemAccounts';
import { purgeAllDemoDataFromDatabase } from '../services/demoDataPurgeService';
import { calculateStudentFee, normalizeYear } from '../lib/feeUtils';
import { generateUniqueStudentId } from '../lib/studentUtils';
import Student360View from '../components/Student360View';

const AP_CASTES = [
  { value: 'OC', label: 'OC (Open Category)' },
  { value: 'BC-A', label: 'BC-A (Backward Class - Group A)' },
  { value: 'BC-B', label: 'BC-B (Backward Class - Group B)' },
  { value: 'BC-C', label: 'BC-C (Backward Class - Group C - Converts to Christianity)' },
  { value: 'BC-D', label: 'BC-D (Backward Class - Group D)' },
  { value: 'BC-E', label: 'BC-E (Socially & Educationally Backward Muslims)' },
  { value: 'EBC', label: 'EBC (Economically Backward Class)' },
  { value: 'SC', label: 'SC (Scheduled Caste)' },
  { value: 'ST', label: 'ST (Scheduled Tribe)' }
];

const AP_SUB_CASTES: Record<string, string[]> = {
  'OC': ['Reddy', 'Kamma', 'Kapu', 'Vysya', 'Velama', 'Brahmin', 'Raju (Kshatriya)', 'Other OC'],
  'BC-A': ['Agnikulakshatriya', 'Nayee Brahmin', 'Rajaka (Chakali)', 'Valmiki (Boyar)', 'Vada Balija', 'Other BC-A'],
  'BC-B': ['Kuruba', 'Devanga', 'Padmashali', 'Goud', 'Ediga', 'Setti Balija', 'Other BC-B'],
  'BC-C': ['Scheduled Caste Converts to Christianity'],
  'BC-D': ['Yadava (Golla)', 'Munnuru Kapu', 'Koppula Velama', 'Turupu Kapu', 'Kamsali', 'Other BC-D'],
  'BC-E': ['Shaik', 'Syed', 'Pathan', 'Mughal', 'Other Socially Backward Muslim'],
  'EBC': ['Kapu', 'Telaga', 'Balija', 'Ontari', 'Other EBC'],
  'SC': ['SC-A', 'SC-B', 'SC-C', 'SC-D', 'Madiga', 'Mala', 'Adi Andhra', 'Relli', 'Other SC'],
  'ST': ['Sugali (Lambada)', 'Yerukala', 'Yanadi', 'Konda Dora', 'Chenchu', 'Other ST']
};

const RELIGIONS = [
  'Hindu',
  'Islam',
  'Christian',
  'Sikh',
  'Buddhist',
  'Jain',
  'Other'
];

const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'
];

const SearchableSelect: FC<{
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}> = ({ value, onChange, options, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronize internal input with selected value
  useEffect(() => {
    const selectedOpt = options.find(o => o.value === value);
    setSearchTerm(selectedOpt ? selectedOpt.label : '');
  }, [value, options]);

  // Handle clicking outside to preserve selected term or close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        const selectedOpt = options.find(o => o.value === value);
        setSearchTerm(selectedOpt ? selectedOpt.label : '');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, options]);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-bold text-[14px] text-neutral-700 disabled:opacity-60 disabled:cursor-not-allowed pr-10"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setSearchTerm(''); // Clear text so typing shows all options
            setIsOpen(true);
          }}
        />
        <div className="absolute right-4 pointer-events-none text-neutral-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50 transition-colors font-bold ${
                  opt.value === value ? 'text-primary bg-primary/5' : 'text-neutral-700'
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))
          ) : (
            <div className="px-4 py-2.5 text-xs text-neutral-400 font-medium">No results found</div>
          )}
        </div>
      )}
    </div>
  );
};

const normalizeStudentStatus = (statusOrStudent?: any): 'active' | 'inactive' | 'non_attending' => {
  if (!statusOrStudent) return 'active';
  if (typeof statusOrStudent === 'object') {
    if (statusOrStudent.nonAttending === true || statusOrStudent.isNonAttending === true || statusOrStudent.attendanceStatus === 'non_attending') {
      return 'non_attending';
    }
    if (statusOrStudent.isActive === false || statusOrStudent.is_active === false) {
      return 'inactive';
    }
    return normalizeStudentStatus(statusOrStudent.status);
  }
  const clean = String(statusOrStudent).toLowerCase().trim().replace(/[- ]/g, '_');
  if (clean === 'non_attending' || clean === 'nonattending' || clean === 'non_attending_student') return 'non_attending';
  if (
    clean === 'inactive' ||
    clean === 'dropped' ||
    clean === 'tc_issued' ||
    clean === 'withdrawn' ||
    clean === 'left' ||
    clean === 'archived' ||
    clean === 'deleted' ||
    clean.includes('inactive') ||
    clean.includes('dropped') ||
    clean.includes('tc_issued') ||
    clean.includes('withdrawn') ||
    clean.includes('left')
  ) {
    return 'inactive';
  }
  return 'active';
};

const getNormalizedFather = (s: any) => {
  const name = s.fatherName || s.parentName || s.father_name || '';
  if (!name) return null;
  const f = name
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/\b[a-z]\b/g, ' ')
    .replace(/[^a-z]/g, '')
    .trim();
  return f.length >= 3 ? f : null;
};

const getNormalizedSecondName = (s: any) => {
  const name = s.secondName || s.lastName || s.surname || s.family_name || '';
  if (!name) return null;
  const sn = name
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/\b[a-z]\b/g, ' ')
    .replace(/[^a-z]/g, '')
    .trim();
  return sn.length >= 3 ? sn : null;
};

const getNormalizedPhones = (student: any) => {
  const fields = [
    student.phone,
    student.parentPhone,
    student.whatsappNumber,
    student.fatherPhone,
    student.motherPhone,
    student.mobile,
    student.parent_phone,
    student.contact
  ];
  const res: string[] = [];
  fields.forEach(f => {
    if (!f) return;
    let sVal = String(f).trim();
    if (sVal.toLowerCase().includes('e+')) {
      const num = Number(sVal);
      if (!isNaN(num)) {
        sVal = String(Math.round(num));
      }
    }
    const cleaned = sVal.replace(/[^0-9]/g, '');
    if (cleaned.length >= 10 && !cleaned.startsWith('000') && cleaned !== '1234567890' && !/^(.)\1+$/.test(cleaned)) {
      res.push(cleaned.slice(-10));
    }
  });
  return Array.from(new Set(res));
};

const getNormalizedEmails = (student: any) => {
  const fields = [
    student.email,
    student.parentEmail,
    student.fatherEmail,
    student.motherEmail,
    student.parent_email
  ];
  const res: string[] = [];
  fields.forEach(e => {
    const em = String(e || '').toLowerCase().trim();
    if (em.includes('@') && em.length > 5 && !em.endsWith('@school.com') && !em.endsWith('@example.com') && !em.includes('placeholder') && !em.includes('temp')) {
      res.push(em);
    }
  });
  return Array.from(new Set(res));
};

const analyzeMatches = (student: any, group: any[]) => {
  const matches: { type: string; value: string; matchDetail: string }[] = [];
  
  const f1 = getNormalizedFather(student);
  const sn1 = getNormalizedSecondName(student);
  const p1 = getNormalizedPhones(student);
  const e1 = getNormalizedEmails(student);

  group.forEach(other => {
    if ((other.uid || other.id) === (student.uid || student.id)) return;
    
    const otherName = other.name || `${other.firstName || ''} ${other.secondName || ''}`.trim();
    
    // Check Father Name
    const f2 = getNormalizedFather(other);
    const sn2 = getNormalizedSecondName(other);
    
    if (f1 && f2 && f1 === f2) {
      if (sn1 && sn2 && sn1 === sn2) {
        const displayedSurname = student.secondName || student.lastName || '';
        if (displayedSurname && !matches.some(m => m.type === 'Family Name & Surname' && m.value === displayedSurname)) {
          matches.push({
            type: 'Family Name & Surname',
            value: `${student.fatherName || ''} (${displayedSurname})`,
            matchDetail: `Father's Name and Surname match for "${otherName}"`
          });
        }
      } else {
        const displayedFather = student.fatherName || student.parentName || student.father_name || '';
        if (displayedFather && !matches.some(m => m.type === 'Father Name' && m.value === displayedFather)) {
          matches.push({
            type: 'Father Name',
            value: displayedFather,
            matchDetail: `Father's Name matches "${otherName}"`
          });
        }
      }
    }
    
    // Check Phones
    const p2 = getNormalizedPhones(other);
    const sharedPhones = p1.filter(phone => p2.includes(phone));
    sharedPhones.forEach(phone => {
      const findActualPhone = () => {
        const fields = [
          student.phone,
          student.parentPhone,
          student.whatsappNumber,
          student.fatherPhone,
          student.motherPhone,
          student.mobile,
          student.parent_phone,
          student.contact
        ];
        return fields.find(f => f && String(f).includes(phone)) || phone;
      };
      const displayedPhone = String(findActualPhone());
      if (displayedPhone && !matches.some(m => m.type === 'Phone Number' && m.value === displayedPhone)) {
        matches.push({
          type: 'Phone Number',
          value: displayedPhone,
          matchDetail: `Shared phone contact with "${otherName}"`
        });
      }
    });

    // Check Emails
    const e2 = getNormalizedEmails(other);
    const sharedEmails = e1.filter(email => e2.includes(email));
    sharedEmails.forEach(email => {
      if (email && !matches.some(m => m.type === 'Email Address' && m.value === email)) {
        matches.push({
          type: 'Email Address',
          value: email,
          matchDetail: `Shared email contact with "${otherName}"`
        });
      }
    });
  });

  return matches;
};

let globalCachedStudentsForSiblings: any[] | null = null;

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

const Students: FC = () => {
  const { user, profile, hasPermission, isAdmin, isTeacher } = useAuth();
  const { settings } = useSettings();

  // ఉపాధ్యాయులను ఖచ్చితంగా ఐసోలేట్ చేసే ప్రొటెక్షన్ వేరియబుల్ (Divya గారి లాగిన్ ఇక్కడ పక్కాగా లాక్ అవుతుంది)
  const isTeacherPortal = (profile?.role !== 'principal' && profile?.role !== 'vice_principal') && (profile?.isTeacherPortal === true || (!isAdmin && (
    isTeacher ||
    profile?.role === 'teacher' ||
    profile?.role === 'teacher_class' ||
    profile?.role === 'teacher_subject' ||
    profile?.role === 'play_school_incharge' ||
    profile?.role?.toLowerCase().includes('teacher') || 
    profile?.role?.toLowerCase().includes('coordinator') || 
    profile?.role?.toLowerCase().includes('staff') ||
    (profile as any)?.staffType === 'teaching' ||
    checkIsTeacherAccount(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name)
  )));

  const looseAccess = (isAdmin || profile?.role === 'admin' || profile?.role === 'principal' || profile?.role === 'vice_principal' || hasPermission('students_view_all')) && !isTeacherPortal;

  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [concessions, setConcessions] = useState<FeeConcession[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingSigAdm, setUploadingSigAdm] = useState(false);
  const [uploadingSigLv, setUploadingSigLv] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [filterClass, setFilterClass] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterAcademicYear, setFilterAcademicYear] = useState(settings.currentAcademicYear || '');
  const [activeTab, setActiveTab] = useState<'active' | 'inactive' | 'non_attending'>('active');

  const isVicePrincipal = profile?.role === 'vice_principal';
  const isPrincipal = profile?.role === 'principal';
  const isPrincipalOrVicePrincipal = isPrincipal || isVicePrincipal;
  const isTeacherRole = isTeacher || isTeacherPortal || profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject' || profile?.role?.toLowerCase().includes('teacher') || checkIsTeacherAccount(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name);

  useEffect(() => {
    if (isTeacherPortal || isTeacherRole) {
      if (activeTab !== 'active') {
        setActiveTab('active');
      }
    }
  }, [isTeacherPortal, isTeacherRole, activeTab]);
  const [show360View, setShow360View] = useState(false);
  const [selectedStudentFor360, setSelectedStudentFor360] = useState<any>(null);
  const [indexError, setIndexError] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [extendingStudent, setExtendingStudent] = useState<any | null>(null);
  const [extendedDueDate, setExtendedDueDate] = useState<string>('');
  const [extendedDueDateNotes, setExtendedDueDateNotes] = useState<string>('');

  useEffect(() => {
    setCurrentPage(1);
  }, [filterClass, filterBatch, filterAcademicYear, activeTab, searchTerm]);

  useEffect(() => {
    // Clear global cache on mount so user sees fresh database entries when opening students view
    globalCachedStudentsForSiblings = null;
  }, []);

  // Safety refs to track session active writes to prevent remote query index synchronization delay
  const recentlyAddedStudents = useRef<any[]>([]);
  const recentlyUpdatedStudents = useRef<Record<string, any>>({});

  // Dynamic complete active student cache for dynamic parent/sibling connection calculations
  const [allStudentsForSiblings, setAllStudentsForSiblings] = useState<any[]>([]);

  const fetchAllStudentsForSiblings = async () => {
    if (!filterAcademicYear) return;
    if (checkQuotaStatus()) return;
    if (globalCachedStudentsForSiblings && globalCachedStudentsForSiblings.length > 0) {
      setAllStudentsForSiblings(globalCachedStudentsForSiblings);
      return;
    }
    try {
      const constraints = [
        where('status', '==', 'active'),
        limit(5000)
      ];
      const result = await dbService.listPaginated('students', constraints);
      if (result && result.data) {
        globalCachedStudentsForSiblings = result.data;
        setAllStudentsForSiblings(result.data);
      }
    } catch (err) {
      console.error("Error loading full background students dataset for siblings grouping:", err);
    }
  };

  useEffect(() => {
    if (profile?.uid && filterAcademicYear) {
      const timer = setTimeout(() => {
        fetchAllStudentsForSiblings();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [profile?.uid, filterAcademicYear]);

  // States for Student registration form/page
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'personal' | 'academic' | 'contact_transport' | 'admission_register'>('personal');
  const [initialConcessions, setInitialConcessions] = useState({ feeConcessionType: '', admissionConcessionType: '' });

  // Custom delete confirmation modal states
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<{ id: string; name: string } | null>(null);

  const [expandedStudentIds, setExpandedStudentIds] = useState<Record<string, boolean>>({});

  const handleDirectStudentPhotoUpload = async (student: any, file: File) => {
    if (!file) return;
    const studentId = student.uid || student.id;
    const toastId = toast.loading(`Uploading photo for ${student.name}...`);
    try {
      const processedFile = await uploadService.processProfileImage(file);
      const url = await uploadService.uploadFile(processedFile);
      
      await dbService.update('students', studentId, { 
        photoURL: url,
        photoUrl: url
      });

      // Update local state
      setStudents(prev => prev.map(s => (s.uid === studentId || s.id === studentId) ? { ...s, photoURL: url, photoUrl: url } : s));
      setAllStudentsForSiblings(prev => {
        const next = prev.map(s => (s.uid === studentId || s.id === studentId) ? { ...s, photoURL: url, photoUrl: url } : s);
        if (typeof window !== 'undefined') {
          (window as any).globalCachedStudentsForSiblings = next;
        }
        return next;
      });

      toast.success(`Photo uploaded for ${student.name}!`, { id: toastId });
    } catch (err: any) {
      console.error('[StudentPhotoUpload]', err);
      toast.error(`Failed to upload photo: ${err.message || 'Unknown error'}`, { id: toastId });
    }
  };

  const [studentFormData, setStudentFormData] = useState({
    photoURL: '',
    firstName: '',
    secondName: '',
    name: '',
    admissionNumber: '',
    rollNumber: '',
    fatherName: '',
    gender: 'male',
    dob: '',
    email: '',
    phone: '',
    whatsappNumber: '',
    classId: '',
    batchId: '',
    academicYear: settings.currentAcademicYear || '',
    bloodGroup: '',
    aadharNumber: '',
    address: '',
    status: 'active',
    feeType: 'day_schooler',
    transportType: 'private',
    busRoute: '',
    transportStopId: '',
    village: '',
    feeConcessionType: '',
    feeConcessionAmount: 0,
    admissionConcessionType: '',
    admissionConcessionAmount: 0,
    childId: '',
    penNumber: '',
    aparId: '',
    motherAadhar: '',
    fatherAadhar: '',
    motherBankDetails: '',
    rationCardNumber: '',
    studentCaste: '',
    studentSubCaste: '',
    religion: '',
    // Requested New academic and personal fields
    motherTongue: '',
    nationality: 'Indian',
    state: 'ANDHRA PRADESH',
    dateOfAdmission: '',
    fatherOccupation: '',
    motherName: '',
    previousSchool: '',
    lastClassFeeDue: 0,
    oldFeeConcession: 0,
    // Admission register ledger specific fields
    reg_recordSheetProduced: 'YES',
    reg_tcProducedDetails: '',
    reg_smallPoxProtected: 'YES',
    reg_marksOfId1: '',
    reg_marksOfId2: '',
    reg_mediumOfInstruction: 'ENGLISH',
    reg_hmInitialAdmission: '',
    reg_classOnLeaving: '',
    reg_reasonForLeaving: '',
    reg_tcDetailsIssued: '',
    reg_schoolToWhichGone: '',
    reg_hmInitialLeaving: '',
    reg_remarks: '',
    dropDate: ''
  });

  const [sortField, setSortField] = useState<string>('rollNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const canSetAdmissionConcession = !isTeacherRole && !isTeacherPortal && (isAdmin || isPrincipalOrVicePrincipal || ['admin', 'accountant'].includes(profile?.role || ''));
  const canEdit = !isTeacherRole && !isTeacherPortal && (isAdmin || isPrincipalOrVicePrincipal || profile?.role === 'admin' || hasPermission('students_edit_basic'));
  const canDelete = !isTeacherRole && !isTeacherPortal && (isAdmin || isPrincipalOrVicePrincipal || profile?.role === 'admin' || hasPermission('students_delete'));
  const canCreate = !isTeacherRole && !isTeacherPortal && (isAdmin || isPrincipalOrVicePrincipal || profile?.role === 'admin' || hasPermission('students_create'));

  const handleOpenModal = (studentItem: any = null) => {
    if (isTeacherPortal || isTeacherRole) {
      toast.error('Teachers do not have permission to edit or create student records.');
      return;
    }
    setModalActiveTab('personal');
    if (studentItem) {
      setIsEditing(true);
      setEditingId(studentItem.uid || studentItem.id);
      setInitialConcessions({
        feeConcessionType: studentItem.feeConcessionType || '',
        admissionConcessionType: studentItem.admissionConcessionType || ''
      });
      
      // For whatsapp number, if it is stored starting with '+91' or '91', strip it for 10-digit display in form
      let displayWhatsapp = studentItem.whatsappNumber || '';
      if (displayWhatsapp.startsWith('+91')) {
        displayWhatsapp = displayWhatsapp.substring(3);
      } else if (displayWhatsapp.length === 12 && displayWhatsapp.startsWith('91')) {
        displayWhatsapp = displayWhatsapp.substring(2);
      }

      // Reconstruct first and second names if secondName (Surname) is missing but we have a full name
      let initialFirstName = studentItem.firstName || '';
      let initialSecondName = studentItem.secondName || '';
      const fullNameClean = (studentItem.name || '').trim();

      if (!initialSecondName && fullNameClean) {
        const parts = fullNameClean.split(/\s+/).filter(Boolean);
        if (parts.length > 1) {
          // Telugu/Indian convention: Surname comes first
          initialSecondName = parts[0];
          initialFirstName = parts.slice(1).join(' ');
        } else if (parts.length === 1) {
          initialFirstName = parts[0];
          initialSecondName = '';
        }
      }

      setStudentFormData({
        photoURL: studentItem.photoURL || studentItem.photoUrl || '',
        firstName: initialFirstName,
        secondName: initialSecondName,
        name: studentItem.name || '',
        admissionNumber: studentItem.admissionNumber || '',
        rollNumber: studentItem.rollNumber || '',
        fatherName: studentItem.fatherName || '',
        gender: studentItem.gender || 'male',
        dob: studentItem.dob || '',
        email: studentItem.email || '',
        phone: studentItem.phone || '',
        whatsappNumber: displayWhatsapp,
        classId: studentItem.classId || '',
        batchId: studentItem.batchId || '',
        academicYear: studentItem.academicYear || settings.currentAcademicYear || '',
        bloodGroup: studentItem.bloodGroup || '',
        aadharNumber: studentItem.aadharNumber || '',
        address: studentItem.address || '',
        status: studentItem.status || 'active',
        feeType: studentItem.feeType || 'day_schooler',
        transportType: studentItem.transportType || 'private',
        busRoute: studentItem.busRoute || '',
        transportStopId: studentItem.transportStopId || '',
        village: studentItem.village || '',
        feeConcessionType: studentItem.feeConcessionType || '',
        feeConcessionAmount: studentItem.feeConcessionAmount || 0,
        admissionConcessionType: studentItem.admissionConcessionType || '',
        admissionConcessionAmount: studentItem.admissionConcessionAmount || 0,
        childId: studentItem.childId || '',
        penNumber: studentItem.penNumber || '',
        aparId: studentItem.aparId || '',
        motherAadhar: studentItem.motherAadhar || '',
        fatherAadhar: studentItem.fatherAadhar || '',
        motherBankDetails: studentItem.motherBankDetails || '',
        rationCardNumber: studentItem.rationCardNumber || '',
        studentCaste: studentItem.studentCaste || '',
        studentSubCaste: studentItem.studentSubCaste || studentItem.subCaste || '',
        religion: studentItem.religion || '',
        motherTongue: studentItem.motherTongue || '',
        nationality: studentItem.nationality || 'Indian',
        state: studentItem.state || 'ANDHRA PRADESH',
        dateOfAdmission: studentItem.dateOfAdmission || '',
        fatherOccupation: studentItem.fatherOccupation || '',
        motherName: studentItem.motherName || studentItem.motherOccupation || '',
        previousSchool: studentItem.previousSchool || '',
        lastClassFeeDue: Number(studentItem.lastClassFeeDue) || 0,
        oldFeeConcession: Number(studentItem.oldFeeConcession) || 0,
        // Admission register ledger specific fields
        reg_recordSheetProduced: studentItem.reg_recordSheetProduced || 'YES',
        reg_tcProducedDetails: studentItem.reg_tcProducedDetails || '',
        reg_smallPoxProtected: studentItem.reg_smallPoxProtected || 'YES',
        reg_marksOfId1: studentItem.reg_marksOfId1 || '',
        reg_marksOfId2: studentItem.reg_marksOfId2 || '',
        reg_mediumOfInstruction: studentItem.reg_mediumOfInstruction || 'ENGLISH',
        reg_hmInitialAdmission: studentItem.reg_hmInitialAdmission || '',
        reg_classOnLeaving: studentItem.reg_classOnLeaving || '',
        reg_reasonForLeaving: studentItem.reg_reasonForLeaving || '',
        reg_tcDetailsIssued: studentItem.reg_tcDetailsIssued || '',
        reg_schoolToWhichGone: studentItem.reg_schoolToWhichGone || '',
        reg_hmInitialLeaving: studentItem.reg_hmInitialLeaving || '',
        reg_remarks: studentItem.reg_remarks || '',
        dropDate: studentItem.dropDate || ''
      });
    } else {
      setIsEditing(false);
      setEditingId(null);
      setInitialConcessions({
        feeConcessionType: '',
        admissionConcessionType: ''
      });
      setStudentFormData({
        photoURL: '',
        firstName: '',
        secondName: '',
        name: '',
        admissionNumber: '',
        rollNumber: '',
        fatherName: '',
        gender: 'male',
        dob: '',
        email: '',
        phone: '',
        whatsappNumber: '',
        classId: filterClass || '',
        batchId: filterBatch || '',
        academicYear: filterAcademicYear || settings.currentAcademicYear || '',
        bloodGroup: '',
        aadharNumber: '',
        address: '',
        status: 'active',
        feeType: 'day_schooler',
        transportType: 'private',
        busRoute: '',
        transportStopId: '',
        village: '',
        feeConcessionType: '',
        feeConcessionAmount: 0,
        admissionConcessionType: '',
        admissionConcessionAmount: 0,
        childId: '',
        penNumber: '',
        aparId: '',
        motherAadhar: '',
        fatherAadhar: '',
        motherBankDetails: '',
        rationCardNumber: '',
        studentCaste: '',
        studentSubCaste: '',
        religion: '',
        motherTongue: '',
        nationality: 'Indian',
        state: 'ANDHRA PRADESH',
        dateOfAdmission: '',
        fatherOccupation: '',
        motherName: '',
        previousSchool: '',
        lastClassFeeDue: 0,
        oldFeeConcession: 0,
        // Admission register ledger specific fields
        reg_recordSheetProduced: 'YES',
        reg_tcProducedDetails: '',
        reg_smallPoxProtected: 'YES',
        reg_marksOfId1: '',
        reg_marksOfId2: '',
        reg_mediumOfInstruction: 'ENGLISH',
        reg_hmInitialAdmission: '',
        reg_classOnLeaving: '',
        reg_reasonForLeaving: '',
        reg_tcDetailsIssued: '',
        reg_schoolToWhichGone: '',
        reg_hmInitialLeaving: '',
        reg_remarks: '',
        dropDate: ''
      });
    }
    setShowAddModal(true);
  };

  // Camera state and handlers for ID Card photo capture
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const toggleCamera = async () => {
    if (isCameraOpen) {
      stopCamera();
    } else {
      setIsCameraOpen(true);
      setTimeout(async () => {
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            let stream: MediaStream;
            try {
              // Attempt 1: High quality 3:4 portrait style
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
              });
            } catch (err1) {
              console.warn("Students camera high-res failed, trying simpler constraints:", err1);
              try {
                // Attempt 2: Simple user-facing stream
                stream = await navigator.mediaDevices.getUserMedia({
                  video: { facingMode: 'user' }
                });
              } catch (err2) {
                console.warn("Students camera facingMode failed, trying generic video:", err2);
                // Attempt 3: Any video
                stream = await navigator.mediaDevices.getUserMedia({
                  video: true
                });
              }
            }
            
            streamRef.current = stream;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } else {
            toast.error("Camera access not supported on this browser/environment. Please use file upload instead.");
            setIsCameraOpen(false);
          }
        } catch (err) {
          console.error("Failed to access camera: ", err);
          toast.error("Could not open camera. Please check browser permissions or try uploading a photo instead.");
          setIsCameraOpen(false);
        }
      }, 120);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Standard 3:4 ID card resolution (high rendering quality)
    const targetWidth = 360;
    const targetHeight = 480;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const vWidth = video.videoWidth || 640;
    const vHeight = video.videoHeight || 480;
    const srcAspect = vWidth / vHeight;
    const targetAspect = 3 / 4;

    let sx = 0, sy = 0, sWidth = vWidth, sHeight = vHeight;

    if (srcAspect > targetAspect) {
      sWidth = vHeight * targetAspect;
      sx = (vWidth - sWidth) / 2;
    } else {
      sHeight = vWidth / targetAspect;
      sy = (vHeight - sHeight) / 2;
    }

    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
    const capturedBase64 = canvas.toDataURL('image/jpeg', 0.9);

    setStudentFormData(prev => ({ ...prev, photoURL: capturedBase64 }));
    stopCamera();
    toast.success("Profile photo captured! Perfectly formatted for student ID cards.");
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const targetWidth = 360;
        const targetHeight = 480; // 3:4 aspect ratio

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const srcAspect = img.width / img.height;
        const targetAspect = 3 / 4;

        let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

        if (srcAspect > targetAspect) {
          sWidth = img.height * targetAspect;
          sx = (img.width - sWidth) / 2;
        } else {
          sHeight = img.width / targetAspect;
          sy = (img.height - sHeight) / 2;
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
        const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
        setStudentFormData(prev => ({ ...prev, photoURL: croppedBase64 }));
        toast.success("Profile photo uploaded! Automatically crop-aligned to 3:4 for ID cards.");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleHMAdmissionSigUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingSigAdm(true);
      const url = await uploadService.uploadFile(file);
      setStudentFormData(prev => ({ ...prev, reg_hmInitialAdmission: url }));
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
    if (!file) return;
    try {
      setUploadingSigLv(true);
      const url = await uploadService.uploadFile(file);
      setStudentFormData(prev => ({ ...prev, reg_hmInitialLeaving: url }));
      toast.success("Headmaster leaving signature uploaded!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload signature. Please try again.");
    } finally {
      setUploadingSigLv(false);
    }
  };

  // Auto clean camera on modal change or component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!showAddModal) {
      stopCamera();
    }
  }, [showAddModal]);

  // CSV Import States and Handlers
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadCSVTemplate = () => {
    const headers = [
      "Unique Student ID", "Admission Number", "Roll Number", "First Name", "Second Name", "Father Name", "Mother Name",
      "Gender", "Date of Birth (YYYY-MM-DD)", "Email", "Phone", "WhatsApp Number", "Class Name or ID",
      "Batch Name or ID", "Academic Year", "Blood Group", "Aadhar Number", "Address", "Fee Type (day_schooler/hostel)",
      "Transport Type (private/school)", "Bus Route", "Transport Stop ID/Name", "Village", "Fee Concession Type",
      "Fee Concession Amount", "Pen Number", "Apar ID", "Mother Aadhar", "Father Aadhar", "Mother Bank Details",
      "Ration Card Number", "Caste/Category (OC/BC-A/BC-B/etc)", "Sub Caste", "Religion", "Mother Tongue", "Nationality"
    ];
    const templateRows = [
      {
        "Unique Student ID": "STU-100234", "Admission Number": "ADM2026001", "Roll Number": "1", "First Name": "John", "Second Name": "Doe",
        "Father Name": "Robert Doe", "Mother Name": "Mary Doe", "Gender": "male", "Date of Birth (YYYY-MM-DD)": "2015-05-15",
        "Email": "john.doe@example.com", "Phone": "9876543210", "WhatsApp Number": "919876543210",
        "Class Name or ID": classes[0]?.name || "Class 1", "Batch Name or ID": batches[0]?.name || "Section A",
        "Academic Year": settings.currentAcademicYear || "2026-27", "Blood Group": "O+", "Aadhar Number": "123456789012",
        "Address": "123 Main Street", "Fee Type (day_schooler/hostel)": "day_schooler", "Transport Type (private/school)": "school",
        "Bus Route": "Route 5", "Transport Stop ID/Name": "Bus Stop A", "Village": "Chittor", "Fee Concession Type": "None",
        "Fee Concession Amount": "0", "Pen Number": "PEN123456", "Apar ID": "APAR123456", "Mother Aadhar": "123456789013",
        "Father Aadhar": "123456789014", "Mother Bank Details": "SBI Branch 1", "Ration Card Number": "RAT1234567",
        "Caste/Category (OC/BC-A/BC-B/etc)": "OC", "Sub Caste": "Reddy", "Religion": "Hindu", "Mother Tongue": "English", "Nationality": "Indian"
      },
      {
        "Unique Student ID": "STU-100456", "Admission Number": "ADM2026002", "Roll Number": "2", "First Name": "Aisha", "Second Name": "Khan",
        "Father Name": "Ibrahim Khan", "Mother Name": "Zarina Khan", "Gender": "female", "Date of Birth (YYYY-MM-DD)": "2016-08-20",
        "Email": "aisha@example.com", "Phone": "8765432109", "WhatsApp Number": "918765432109",
        "Class Name or ID": classes[0]?.name || "Class 1", "Batch Name or ID": batches[0]?.name || "Section A",
        "Academic Year": settings.currentAcademicYear || "2026-27", "Blood Group": "A+", "Aadhar Number": "987654321098",
        "Address": "456 Greenfield Road", "Fee Type (day_schooler/hostel)": "hostel", "Transport Type (private/school)": "private",
        "Bus Route": "", "Transport Stop ID/Name": "", "Village": "Vijayawada", "Fee Concession Type": "Sibling Discount",
        "Fee Concession Amount": "500", "Pen Number": "PEN789012", "Apar ID": "APAR789012", "Mother Aadhar": "987654321099",
        "Father Aadhar": "987654321100", "Mother Bank Details": "HDFC Branch A", "Ration Card Number": "RAT9876543",
        "Caste/Category (OC/BC-A/BC-B/etc)": "BC-E", "Sub Caste": "Shaik", "Religion": "Islam", "Mother Tongue": "Urdu", "Nationality": "Indian"
      }
    ];

    const csv = Papa.unparse({ fields: headers, data: templateRows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'student_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Student CSV Import Template downloaded successfully!");
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rawRows = results.data as any[];
        if (rawRows.length === 0) {
          toast.error("The selected CSV file has no records.");
          return;
        }

        const processedRows = rawRows.map((row, idx) => {
          const rawClass = String(row["Class Name or ID"] || "").trim();
          let matchedClass = classes.find(c => c.name.toLowerCase() === rawClass.toLowerCase() || c.id === rawClass);
          let classId = matchedClass ? matchedClass.id : '';

          const rawBatch = String(row["Batch Name or ID"] || "").trim();
          let matchedBatch = batches.find(b => b.name.toLowerCase() === rawBatch.toLowerCase() || b.id === rawBatch);
          let batchId = matchedBatch ? matchedBatch.id : '';

          const fName = String(row["First Name"] || "").trim();
          const sName = String(row["Second Name"] || "").trim();
          const fullName = fName && sName ? `${fName} ${sName}` : (fName || sName || "Unnamed Student");

          const uniqueIdVal = String(row["Unique Student ID"] || "").trim();

          return {
            uniqueStudentId: uniqueIdVal || `STU-${Math.floor(100000 + Math.random() * 900000)}`,
            admissionNumber: String(row["Admission Number"] || "").trim() || `ADM_${Date.now()}_${idx}`,
            rollNumber: String(row["Roll Number"] || "").trim(),
            firstName: fName,
            secondName: sName,
            name: fullName,
            fatherName: String(row["Father Name"] || row["Father's Name"] || "").trim(),
            motherName: String(row["Mother Name"] || row["Mother's Name"] || "").trim(),
            gender: (String(row["Gender"] || "male")).toLowerCase().trim(),
            dob: String(row["Date of Birth (YYYY-MM-DD)"] || row["Date of Birth"] || "").trim(),
            email: String(row["Email"] || "").trim(),
            phone: String(row["Phone"] || "").trim(),
            whatsappNumber: (() => {
              let rawNum = String(row["WhatsApp Number"] || "").trim().replace(/\D/g, '');
              if (!rawNum) return '';
              if (rawNum.length === 10) return '+91' + rawNum;
              if (rawNum.length === 12 && rawNum.startsWith('91')) return '+' + rawNum;
              if (rawNum.startsWith('91')) return '+' + rawNum;
              return '+91' + rawNum;
            })(),
            classId: classId || rawClass,
            batchId: batchId || rawBatch,
            academicYear: String(row["Academic Year"] || settings.currentAcademicYear || "").trim(),
            bloodGroup: String(row["Blood Group"] || "").trim(),
            aadharNumber: String(row["Aadhar Number"] || "").trim(),
            address: String(row["Address"] || "").trim(),
            status: "active",
            feeType: String(row["Fee Type (day_schooler/hostel)"] || row["Fee Type"] || "day_schooler").trim().toLowerCase() === 'hostel' ? 'hostel' : 'day_schooler',
            transportType: String(row["Transport Type (private/school)"] || row["Transport Type"] || "private").trim().toLowerCase() === 'school' ? 'school' : 'private',
            busRoute: String(row["Bus Route"] || "").trim(),
            transportStopId: String(row["Transport Stop ID/Name"] || "").trim(),
            village: String(row["Village"] || "").trim(),
            feeConcessionType: String(row["Fee Concession Type"] || "").trim(),
            feeConcessionAmount: Number(row["Fee Concession Amount"] || 0),
            penNumber: String(row["Pen Number"] || "").trim(),
            aparId: String(row["Apar ID"] || "").trim(),
            motherAadhar: String(row["Mother Aadhar"] || "").trim(),
            fatherAadhar: String(row["Father Aadhar"] || "").trim(),
            motherBankDetails: String(row["Mother Bank Details"] || "").trim(),
            rationCardNumber: String(row["Ration Card Number"] || "").trim(),
            studentCaste: String(row["Caste/Category (OC/BC-A/BC-B/etc)"] || row["Caste"] || "").trim(),
            studentSubCaste: String(row["Sub Caste"] || "").trim(),
            religion: String(row["Religion"] || "").trim(),
            motherTongue: String(row["Mother Tongue"] || "").trim(),
            nationality: String(row["Nationality"] || "Indian").trim(),
            dateOfAdmission: String(row["Date of Admission"] || "").trim()
          };
        });

        setImportRows(processedRows);
        setShowImportPreview(true);
      }
    });

    if (e.target) {
      e.target.value = '';
    }
  };

  const executeBulkImport = async () => {
    if (importRows.length === 0) return;
    setImportLoading(true);

    try {
      let successCount = 0;
      for (const row of importRows) {
        const customId = `stud_csv_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const record = {
          ...row,
          uniqueStudentId: row.uniqueStudentId || generateUniqueStudentId({ id: customId }),
          id: customId,
          uid: customId,
          createdAt: new Date().toISOString()
        };
        await dbService.create('students', customId, record);
        successCount++;
      }

      toast.success(`${successCount} student profiles imported successfully!`);
      setShowImportPreview(false);
      
      const freshStudents = await dbService.list('students');
      if (freshStudents) {
        setStudents(freshStudents);
        fetchAllStudentsForSiblings();
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to compile batch student records. Please verify internet connectivity.");
    } finally {
      setImportLoading(false);
    }
  };

  // CSV Custom Export States and Handlers
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSiblingModal, setShowSiblingModal] = useState(false);
  const [siblingSearchQuery, setSiblingSearchQuery] = useState('');
  
  // States to handle interactive sibling dialog clicks
  const [selectedSiblingGroup, setSelectedSiblingGroup] = useState<any[] | null>(null);
  const [selectedSiblingBaseStudent, setSelectedSiblingBaseStudent] = useState<any | null>(null);
  const [showActiveSiblingDialog, setShowActiveSiblingDialog] = useState(false);

  // Function to calculate sibling groups on the fly - highly optimized to O(N)
  const siblingGroups = React.useMemo(() => {
    if (!allStudentsForSiblings || allStudentsForSiblings.length === 0) return [];
    
    // Precompute normalized values for all students
    const studentDataList = allStudentsForSiblings.map((s, index) => {
      const father = getNormalizedFather(s);
      const secondName = getNormalizedSecondName(s);
      const phones = getNormalizedPhones(s);
      const emails = getNormalizedEmails(s);
      const id = s.uid || s.id || String(index);
      return { s, id, father, secondName, phones, emails };
    });

    const parent: Record<string, string> = {};
    const find = (i: string): string => {
      if (!parent[i]) {
        parent[i] = i;
        return i;
      }
      let root = i;
      while (root !== parent[root]) {
        root = parent[root];
      }
      // Path compression
      let curr = i;
      while (curr !== root) {
        const nxt = parent[curr];
        parent[curr] = root;
        curr = nxt;
      }
      return root;
    };

    const union = (i: string, j: string) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
      }
    };

    const keyToStudentIds: Map<string, string[]> = new Map();

    studentDataList.forEach(item => {
      const { id, father, secondName, phones, emails } = item;
      
      // Combinations of match criteria
      if (father) {
        if (secondName) {
          const key = `fs_${father}_${secondName}`;
          let arr = keyToStudentIds.get(key);
          if (!arr) {
            arr = [];
            keyToStudentIds.set(key, arr);
          }
          arr.push(id);
        }

        emails.forEach(email => {
          const key = `fe_${father}_${email}`;
          let arr = keyToStudentIds.get(key);
          if (!arr) {
            arr = [];
            keyToStudentIds.set(key, arr);
          }
          arr.push(id);
        });

        phones.forEach(phone => {
          const key = `fp_${father}_${phone}`;
          let arr = keyToStudentIds.get(key);
          if (!arr) {
            arr = [];
            keyToStudentIds.set(key, arr);
          }
          arr.push(id);
        });
      }

      emails.forEach(email => {
        phones.forEach(phone => {
          const key = `ep_${email}_${phone}`;
          let arr = keyToStudentIds.get(key);
          if (!arr) {
            arr = [];
            keyToStudentIds.set(key, arr);
          }
          arr.push(id);
        });
      });
    });

    // Union find for all students sharing any combination key
    keyToStudentIds.forEach(studentIds => {
      if (studentIds.length > 1) {
        const first = studentIds[0];
        for (let i = 1; i < studentIds.length; i++) {
          union(first, studentIds[i]);
        }
      }
    });

    // Group students by their Union-Find root
    const rootToStudents: Map<string, any[]> = new Map();
    studentDataList.forEach(item => {
      const root = find(item.id);
      let list = rootToStudents.get(root);
      if (!list) {
        list = [];
        rootToStudents.set(root, list);
      }
      list.push(item.s);
    });

    // Sibling groups are those roots with more than 1 student
    const groups: any[][] = [];
    rootToStudents.forEach(list => {
      if (list.length > 1) {
        groups.push(list);
      }
    });

    return groups;
  }, [allStudentsForSiblings]);

  const siblingStudentIdsSet = React.useMemo(() => {
    const ids = new Set<string>();
    siblingGroups.forEach(group => {
      group.forEach(s => {
        const id = s.uid || s.id;
        if (id) {
          ids.add(id);
        }
      });
    });
    return ids;
  }, [siblingGroups]);

  const handleDownloadAllSiblingsCSV = () => {
    try {
      const exportRows: any[] = [];
      siblingGroups.forEach((group, index) => {
        const familyId = `FAM-${String(1000 + index + 1)}`;
        const father = group[0]?.fatherName || group[0]?.parentName || 'N/A';
        const mother = group[0]?.motherName || 'N/A';
        const phone = group[0]?.phone || group[0]?.parentPhone || group[0]?.whatsappNumber || 'N/A';
        const village = group[0]?.village || 'N/A';

        group.forEach(s => {
          const classRecord = classes.find(c => c.id === s.classId);
          const batchRecord = batches.find(b => b.id === s.batchId);
          
          exportRows.push({
            "Family ID": familyId,
            "Father Name": father,
            "Mother Name": mother,
            "Contact Phone": phone,
            "Village": village,
            "Student Name": s.name || `${s.firstName || ''} ${s.secondName || ''}`.trim(),
            "Admission Number": s.admissionNumber || s.uniqueStudentId || '',
            "Roll Number": s.rollNumber || '',
            "Class Name": classRecord ? classRecord.name : s.classId || '',
            "Section/Batch": batchRecord ? batchRecord.name : s.batch || s.batchId || '',
            "Status": s.status || 'Active'
          });
        });
      });

      if (exportRows.length === 0) {
        toast.info("No sibling records found to export.");
        return;
      }

      const csv = Papa.unparse(exportRows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `all_sibling_students_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Successfully exported ${exportRows.length} sibling students under ${siblingGroups.length} families!`);
    } catch (error) {
      console.error("Sibling export error:", error);
      toast.error("Failed to generate siblings CSV.");
    }
  };

  const handleDownloadFamilyCSV = (group: any[], index: number) => {
    try {
      const familyId = `FAM-${String(1000 + index + 1)}`;
      const father = group[0]?.fatherName || group[0]?.parentName || 'N/A';
      const mother = group[0]?.motherName || 'N/A';
      const phone = group[0]?.phone || group[0]?.parentPhone || group[0]?.whatsappNumber || 'N/A';
      const village = group[0]?.village || 'N/A';

      const exportRows = group.map(s => {
        const classRecord = classes.find(c => c.id === s.classId);
        const batchRecord = batches.find(b => b.id === s.batchId);
        return {
          "Family ID": familyId,
          "Father Name": father,
          "Mother Name": mother,
          "Contact Phone": phone,
          "Village": village,
          "Student Name": s.name || `${s.firstName || ''} ${s.secondName || ''}`.trim(),
          "Admission Number": s.admissionNumber || s.uniqueStudentId || '',
          "Roll Number": s.rollNumber || '',
          "Class Name": classRecord ? classRecord.name : s.classId || '',
          "Section/Batch": batchRecord ? batchRecord.name : s.batch || s.batchId || '',
          "Status": s.status || 'Active'
        };
      });

      const csv = Papa.unparse(exportRows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `family_${father.replace(/[^a-zA-Z0-9]/g, '_')}_siblings.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported family record of ${father}!`);
    } catch (err) {
      toast.error("Failed to export family record.");
    }
  };
  const [exportFilters, setExportFilters] = useState({
    classId: '',
    batchId: '',
    busRoute: '',
    feeType: 'all',
    village: '',
    status: 'active'
  });

  const [exportSelectedFields, setExportSelectedFields] = useState<Record<string, boolean>>({
    uniqueStudentId: true,
    admissionNumber: true,
    rollNumber: true,
    name: true,
    firstName: true,
    secondName: true,
    gender: true,
    dob: true,
    email: true,
    phone: true,
    whatsappNumber: true,
    classId: true,
    batchId: true,
    academicYear: true,
    bloodGroup: true,
    aadharNumber: true,
    address: true,
    feeType: true,
    transportType: true,
    busRoute: true,
    transportStopId: true,
    village: true,
    feeConcessionType: true,
    nonAttending: true,
    feeConcessionAmount: true,
    penNumber: true,
    aparId: true,
    motherAadhar: true,
    fatherAadhar: true,
    motherBankDetails: true,
    rationCardNumber: true,
    studentCaste: true,
    studentSubCaste: true,
    religion: true,
    motherTongue: true,
    nationality: true,
    dateOfAdmission: true,
    fatherName: true,
    fatherOccupation: true,
    motherName: true,
    previousSchool: true,
    term1Due: true,
    term2Due: true,
    term3Due: true,
    prevYearFeeDue: true,
    admissionFeeDue: true,
    iplFeeDue: true,
    healthCardFeeDue: true,
    totalFeeDue: true,
    concessionTypeWise: true
  });

  const handleExportCSV = async () => {
    const toastId = toast.loading("Loading complete student records...", { duration: 99999 });

    try {
      // Fetch ALL students directly to ensure we have active records
      const allDbStudents = await dbService.list('students') as any[];
      let filteredList = [...allDbStudents];

      if (exportFilters.classId) {
        filteredList = filteredList.filter(s => s.classId === exportFilters.classId);
      }
      if (exportFilters.batchId) {
        filteredList = filteredList.filter(s => s.batchId === exportFilters.batchId);
      }
      if (exportFilters.busRoute) {
        filteredList = filteredList.filter(s => s.busRoute && s.busRoute.toLowerCase().includes(exportFilters.busRoute.toLowerCase()));
      }
      if (exportFilters.feeType !== 'all') {
        filteredList = filteredList.filter(s => s.feeType === exportFilters.feeType);
      }
      if (exportFilters.village) {
        filteredList = filteredList.filter(s => s.village && s.village.toLowerCase().includes(exportFilters.village.toLowerCase()));
      }
      if (isTeacherPortal || isTeacherRole) {
        filteredList = filteredList.filter(s => (s.status || 'active') === 'active');
      } else if (exportFilters.status !== 'all') {
        filteredList = filteredList.filter(s => {
          const sStatus = s.status || 'active';
          if (exportFilters.status === 'active_and_non_attending') {
            return sStatus === 'active' || sStatus === 'non_attending';
          }
          return sStatus === exportFilters.status;
        });
      }

      if (filteredList.length === 0) {
        toast.error("No student records matched the export filters!");
        toast.dismiss(toastId);
        return;
      }

      toast.loading("Calculating student fee dues and concessions...", { id: toastId });

      const [feeStructures, payments, fetchedConcessions] = await Promise.all([
        dbService.list('feeStructures') as Promise<any[]>,
        dbService.list('payments') as Promise<any[]>,
        concessions.length > 0 ? Promise.resolve(concessions) : dbService.list('concessions') as Promise<any[]>
      ]);

      // Construct the explicit column order for perfect headers representation
      const selectedHeaders: string[] = [];
      if (exportSelectedFields.uniqueStudentId) selectedHeaders.push("Unique Student ID");
      if (exportSelectedFields.admissionNumber) selectedHeaders.push("Admission Number");
      if (exportSelectedFields.rollNumber) selectedHeaders.push("Roll Number");
      if (exportSelectedFields.name) selectedHeaders.push("Full Name");
      if (exportSelectedFields.firstName) selectedHeaders.push("First Name");
      if (exportSelectedFields.secondName) selectedHeaders.push("Second Name");
      if (exportSelectedFields.gender) selectedHeaders.push("Gender");
      if (exportSelectedFields.dob) selectedHeaders.push("Date of Birth");
      if (exportSelectedFields.email) selectedHeaders.push("Email");
      if (exportSelectedFields.phone) selectedHeaders.push("Phone");
      if (exportSelectedFields.whatsappNumber) selectedHeaders.push("WhatsApp Number");
      if (exportSelectedFields.classId) selectedHeaders.push("Class Name");
      if (exportSelectedFields.batchId) selectedHeaders.push("Batch Name");
      if (exportSelectedFields.academicYear) selectedHeaders.push("Academic Year");
      if (exportSelectedFields.bloodGroup) selectedHeaders.push("Blood Group");
      if (exportSelectedFields.aadharNumber) selectedHeaders.push("Aadhar Number");
      if (exportSelectedFields.address) selectedHeaders.push("Address");
      if (exportSelectedFields.feeType) selectedHeaders.push("Fee Type");
      if (exportSelectedFields.transportType) selectedHeaders.push("Transport Type");
      if (exportSelectedFields.busRoute) selectedHeaders.push("Bus Route");
      if (exportSelectedFields.transportStopId) selectedHeaders.push("Transport Stop");
      if (exportSelectedFields.village) selectedHeaders.push("Village");
      if (exportSelectedFields.feeConcessionType) selectedHeaders.push("Fee Concession Type");
      if (exportSelectedFields.nonAttending) selectedHeaders.push("Non-Attending Students");
      if (exportSelectedFields.feeConcessionAmount) selectedHeaders.push("Concession Amount");
      if (exportSelectedFields.penNumber) selectedHeaders.push("Pen Number");
      if (exportSelectedFields.aparId) selectedHeaders.push("Apar ID");
      if (exportSelectedFields.motherAadhar) selectedHeaders.push("Mother Aadhar");
      if (exportSelectedFields.fatherAadhar) selectedHeaders.push("Father Aadhar");
      if (exportSelectedFields.motherBankDetails) selectedHeaders.push("Mother Bank Details");
      if (exportSelectedFields.rationCardNumber) selectedHeaders.push("Ration Card Number");
      if (exportSelectedFields.studentCaste) selectedHeaders.push("Caste");
      if (exportSelectedFields.studentSubCaste) selectedHeaders.push("Sub Caste");
      if (exportSelectedFields.religion) selectedHeaders.push("Religion");
      if (exportSelectedFields.motherTongue) selectedHeaders.push("Mother Tongue");
      if (exportSelectedFields.nationality) selectedHeaders.push("Nationality");
      if (exportSelectedFields.dateOfAdmission) selectedHeaders.push("Date of Admission");
      if (exportSelectedFields.fatherName) selectedHeaders.push("Father Name");
      if (exportSelectedFields.fatherOccupation) selectedHeaders.push("Father Occupation");
      if (exportSelectedFields.motherName) selectedHeaders.push("Mother Name");
      if (exportSelectedFields.previousSchool) selectedHeaders.push("Previous School");

      if (exportSelectedFields.term1Due) selectedHeaders.push("Term 1 Fee Due");
      if (exportSelectedFields.term2Due) selectedHeaders.push("Term 2 Fee Due");
      if (exportSelectedFields.term3Due) selectedHeaders.push("Term 3 Fee Due");
      if (exportSelectedFields.prevYearFeeDue) selectedHeaders.push("Previous Year Fee Due");
      if (exportSelectedFields.admissionFeeDue) selectedHeaders.push("Admission Fee Due");
      if (exportSelectedFields.iplFeeDue) selectedHeaders.push("IPL Fee Due");
      if (exportSelectedFields.healthCardFeeDue) selectedHeaders.push("Health Card Fee Due");
      if (exportSelectedFields.totalFeeDue) selectedHeaders.push("Total Fee Due");

      if (exportSelectedFields.concessionTypeWise) {
        selectedHeaders.push("School Concession Type");
        selectedHeaders.push("Admission Concession Type");
        selectedHeaders.push("School Concession Amount");
      }

      const exportRows = filteredList.map(s => {
        const row: Record<string, any> = {};
        
        // Pre-populate all selected headers with empty strings to guarantee symmetry
        selectedHeaders.forEach(col => {
          row[col] = '';
        });

        const classRecord = classes.find(c => c.id === s.classId);
        const batchRecord = batches.find(b => b.id === s.batchId);

        if (exportSelectedFields.uniqueStudentId) row["Unique Student ID"] = s.uniqueStudentId || '';
        if (exportSelectedFields.admissionNumber) row["Admission Number"] = s.admissionNumber || '';
        if (exportSelectedFields.rollNumber) row["Roll Number"] = s.rollNumber || '';
        if (exportSelectedFields.name) row["Full Name"] = s.name || '';
        if (exportSelectedFields.firstName) row["First Name"] = s.firstName || '';
        if (exportSelectedFields.secondName) row["Second Name"] = s.secondName || '';
        if (exportSelectedFields.gender) row["Gender"] = s.gender || '';
        if (exportSelectedFields.dob) row["Date of Birth"] = s.dob || '';
        if (exportSelectedFields.email) row["Email"] = s.email || '';
        if (exportSelectedFields.phone) row["Phone"] = s.phone || '';
        if (exportSelectedFields.whatsappNumber) row["WhatsApp Number"] = s.whatsappNumber || '';
        if (exportSelectedFields.classId) row["Class Name"] = classRecord ? classRecord.name : (s.classId || '');
        if (exportSelectedFields.batchId) row["Batch Name"] = batchRecord ? batchRecord.name : (s.batch || s.batchId || '');
        if (exportSelectedFields.academicYear) row["Academic Year"] = s.academicYear || '';
        if (exportSelectedFields.bloodGroup) row["Blood Group"] = s.bloodGroup || '';
        if (exportSelectedFields.aadharNumber) row["Aadhar Number"] = s.aadharNumber || '';
        if (exportSelectedFields.address) row["Address"] = s.address || '';
        if (exportSelectedFields.feeType) row["Fee Type"] = s.feeType || '';
        if (exportSelectedFields.transportType) row["Transport Type"] = s.transportType || '';
        if (exportSelectedFields.busRoute) {
          const busRecord = buses.find(b => b.id === s.busRoute);
          row["Bus Route"] = busRecord ? `${busRecord.busNumber} - ${busRecord.routeName || ''}` : (s.busRoute || '');
        }
        if (exportSelectedFields.transportStopId) {
          const stopRecord = stops.find(stop => stop.id === s.transportStopId);
          row["Transport Stop"] = stopRecord ? stopRecord.villageName : (s.transportStopId || '');
        }
        if (exportSelectedFields.village) {
          const stopRecord = stops.find(stop => stop.id === s.transportStopId);
          row["Village"] = s.village || (stopRecord ? stopRecord.villageName : '');
        }
        if (exportSelectedFields.feeConcessionType) {
          const schoolConc = fetchedConcessions.find(c => c.id === s.feeConcessionType);
          row["Fee Concession Type"] = s.feeConcessionType === 'custom'
            ? 'Custom (Flat Discount)'
            : (schoolConc ? `${schoolConc.name} (${schoolConc.type === 'percentage' ? `${schoolConc.value}%` : `₹${schoolConc.value}`})` : (s.feeConcessionType || 'None'));
        }
        if (exportSelectedFields.nonAttending) {
          row["Non-Attending Students"] = s.status === 'non_attending' ? 'Yes' : 'No';
        }
        if (exportSelectedFields.feeConcessionAmount) row["Concession Amount"] = s.feeConcessionAmount || '';
        if (exportSelectedFields.penNumber) row["Pen Number"] = s.penNumber || '';
        if (exportSelectedFields.aparId) row["Apar ID"] = s.aparId || '';
        if (exportSelectedFields.motherAadhar) row["Mother Aadhar"] = s.motherAadhar || '';
        if (exportSelectedFields.fatherAadhar) row["Father Aadhar"] = s.fatherAadhar || '';
        if (exportSelectedFields.motherBankDetails) row["Mother Bank Details"] = s.motherBankDetails || '';
        if (exportSelectedFields.rationCardNumber) row["Ration Card Number"] = s.rationCardNumber || '';
        if (exportSelectedFields.studentCaste) row["Caste"] = s.studentCaste || '';
        if (exportSelectedFields.studentSubCaste) row["Sub Caste"] = s.studentSubCaste || '';
        if (exportSelectedFields.religion) row["Religion"] = s.religion || '';
        if (exportSelectedFields.motherTongue) row["Mother Tongue"] = s.motherTongue || '';
        if (exportSelectedFields.nationality) row["Nationality"] = s.nationality || '';
        if (exportSelectedFields.dateOfAdmission) row["Date of Admission"] = s.dateOfAdmission || '';
        if (exportSelectedFields.fatherName) row["Father Name"] = s.fatherName || '';
        if (exportSelectedFields.fatherOccupation) row["Father Occupation"] = s.fatherOccupation || '';
        if (exportSelectedFields.motherName) row["Mother Name"] = s.motherName || '';
        if (exportSelectedFields.previousSchool) row["Previous School"] = s.previousSchool || '';

        // Standard or dynamically calculated fee metrics
        if (
          exportSelectedFields.term1Due ||
          exportSelectedFields.term2Due ||
          exportSelectedFields.term3Due ||
          exportSelectedFields.prevYearFeeDue ||
          exportSelectedFields.admissionFeeDue ||
          exportSelectedFields.iplFeeDue ||
          exportSelectedFields.healthCardFeeDue ||
          exportSelectedFields.totalFeeDue ||
          exportSelectedFields.concessionTypeWise
        ) {
          const targetYearOff = s.academicYear || '2026-27';
          const calc = calculateStudentFee(
            s, 
            targetYearOff, 
            feeStructures || [], 
            fetchedConcessions || [], 
            classes || [], 
            batches || [], 
            true
          );

          // Get payments for this student
          const studPayments = (payments || []).filter(p => 
            (p.studentId === s.id || p.studentId === s.uid) && 
            (!p.reference || !p.reference.startsWith('EXP')) &&
            normalizeYear(p.academicYear) === normalizeYear(targetYearOff)
          );

          const paidComponents: Record<string, number> = {};
          studPayments.forEach(p => {
            const comp = p.component || 'other';
            paidComponents[comp] = (paidComponents[comp] || 0) + (Number(p.amount) || 0);
          });

          // Term-wise calculations matching active algorithms
          let t1Payable = 0;
          let t2Payable = 0;
          let t3Payable = 0;

          // 1. School Fee
          const schoolFee = calc.schoolFee || 0;
          const schoolStructure = calc.schoolStructure;
          if (calc.schoolFeeTerms) {
            t1Payable += calc.schoolFeeTerms.term1 || 0;
            t2Payable += calc.schoolFeeTerms.term2 || 0;
            t3Payable += calc.schoolFeeTerms.term3 || 0;
          } else if (schoolStructure) {
            const originalSchoolTotal = (Number(schoolStructure.term1) || 0) + (Number(schoolStructure.term2) || 0) + (Number(schoolStructure.term3) || 0);
            const ratio = originalSchoolTotal > 0 ? (schoolFee / originalSchoolTotal) : 1;
            const t1 = Math.round((Number(schoolStructure.term1) || 0) * ratio);
            const t2 = Math.round((Number(schoolStructure.term2) || 0) * ratio);
            const t3 = Math.max(0, schoolFee - t1 - t2);
            t1Payable += t1;
            t2Payable += t2;
            t3Payable += t3;
          } else {
            t1Payable += schoolFee;
          }

          // 2. Transport Fee
          const transportFee = calc.transportFee || 0;
          const transportStructure = calc.transportStructure;
          if (calc.transportFeeTerms) {
            t1Payable += calc.transportFeeTerms.term1 || 0;
            t2Payable += calc.transportFeeTerms.term2 || 0;
            t3Payable += calc.transportFeeTerms.term3 || 0;
          } else if (transportFee > 0) {
            if (transportStructure) {
              const originalTransportTotal = (Number(transportStructure.term1) || 0) + (Number(transportStructure.term2) || 0) + (Number(transportStructure.term3) || 0);
              const ratio = originalTransportTotal > 0 ? (transportFee / originalTransportTotal) : 1;
              const t1 = Math.round((Number(transportStructure.term1) || 0) * ratio);
              const t2 = Math.round((Number(transportStructure.term2) || 0) * ratio);
              const t3 = Math.max(0, transportFee - t1 - t2);
              t1Payable += t1;
              t2Payable += t2;
              t3Payable += t3;
            } else {
              const termValue = Math.round(transportFee / 3);
              const t1 = termValue;
              const t2 = termValue;
              const t3 = Math.max(0, transportFee - t1 - t2);
              t1Payable += t1;
              t2Payable += t2;
              t3Payable += t3;
            }
          }

          // 3. Hostel Fee
          const hostelFee = calc.hostelFee || 0;
          const hostelStructure = calc.hostelStructure;
          if (calc.hostelFeeTerms) {
            t1Payable += calc.hostelFeeTerms.term1 || 0;
            t2Payable += calc.hostelFeeTerms.term2 || 0;
            t3Payable += calc.hostelFeeTerms.term3 || 0;
          } else if (hostelFee > 0) {
            if (hostelStructure) {
              const originalHostelTotal = (Number(hostelStructure.term1) || 0) + (Number(hostelStructure.term2) || 0) + (Number(hostelStructure.term3) || 0);
              const ratio = originalHostelTotal > 0 ? (hostelFee / originalHostelTotal) : 1;
              const t1 = Math.round((Number(hostelStructure.term1) || 0) * ratio);
              const t2 = Math.round((Number(hostelStructure.term2) || 0) * ratio);
              const t3 = Math.max(0, hostelFee - t1 - t2);
              t1Payable += t1;
              t2Payable += t2;
              t3Payable += t3;
            } else {
              const t1 = Math.round(hostelFee * 0.5);
              const t2 = Math.round(hostelFee * 0.25);
              const t3 = Math.max(0, hostelFee - t1 - t2);
              t1Payable += t1;
              t2Payable += t2;
              t3Payable += t3;
            }
          }

          // Payments per term
          const t1Paid = (paidComponents['term1'] || 0) + (paidComponents['transport_term1'] || 0) + (paidComponents['hostel_term1'] || 0);
          const t2Paid = (paidComponents['term2'] || 0) + (paidComponents['transport_term2'] || 0) + (paidComponents['hostel_term2'] || 0);
          const t3Paid = (paidComponents['term3'] || 0) + (paidComponents['transport_term3'] || 0) + (paidComponents['hostel_term3'] || 0);

          const t1Due = Math.max(0, t1Payable - t1Paid);
          const t2Due = Math.max(0, t2Payable - t2Paid);
          const t3Due = Math.max(0, t3Payable - t3Paid);

          // Get other due amounts as well
          const oldDues = Number(s.lastClassFeeDue || 0);
          const oldDuesPaid = paidComponents['lastClassFeeDue'] || 0;
          const oldDuesOutstanding = Math.max(0, oldDues - oldDuesPaid);

          const admissionDue = Math.max(0, (calc.admissionFee || 0) - (paidComponents['admission'] || 0));
          const iplDue = Math.max(0, (calc.iplFee || 0) - (paidComponents['ipl'] || 0));
          const healthCardDue = Math.max(0, (calc.healthCardFee || 0) - (paidComponents['healthCard'] || 0));

          if (exportSelectedFields.term1Due) row["Term 1 Fee Due"] = t1Due;
          if (exportSelectedFields.term2Due) row["Term 2 Fee Due"] = t2Due;
          if (exportSelectedFields.term3Due) row["Term 3 Fee Due"] = t3Due;
          if (exportSelectedFields.prevYearFeeDue) row["Previous Year Fee Due"] = oldDuesOutstanding;
          if (exportSelectedFields.admissionFeeDue) row["Admission Fee Due"] = admissionDue;
          if (exportSelectedFields.iplFeeDue) row["IPL Fee Due"] = iplDue;
          if (exportSelectedFields.healthCardFeeDue) row["Health Card Fee Due"] = healthCardDue;
          if (exportSelectedFields.totalFeeDue) row["Total Fee Due"] = t1Due + t2Due + t3Due + oldDuesOutstanding + admissionDue + iplDue + healthCardDue;

          if (exportSelectedFields.concessionTypeWise) {
            const schoolConc = fetchedConcessions.find(c => c.id === s.feeConcessionType);
            const admissionConc = fetchedConcessions.find(c => c.id === s.admissionConcessionType);

            row["School Concession Type"] = s.feeConcessionType === 'custom' 
              ? 'Custom (Flat Discount)' 
              : (schoolConc ? `${schoolConc.name} (${schoolConc.type === 'percentage' ? `${schoolConc.value}%` : `₹${schoolConc.value}`})` : 'None');
            row["Admission Concession Type"] = s.admissionConcessionType === 'custom'
              ? 'Custom (Flat Admission Discount)'
              : (admissionConc ? `${admissionConc.name} (${admissionConc.type === 'percentage' ? `${admissionConc.value}%` : `₹${admissionConc.value}`})` : 'None');
            row["School Concession Amount"] = s.feeConcessionType === 'custom'
              ? (Number(s.feeConcessionAmount) || 0)
              : (schoolConc ? (schoolConc.type === 'fixed' ? Number(schoolConc.value) : Math.round(Number(schoolFee) * (Number(schoolConc.value) / 100))) : 0);
          }
        }

        return row;
      });

      // Papa.unparse with strict dynamic field configuration guarantees correct key ordering
      const csv = Papa.unparse({
        fields: selectedHeaders,
        data: exportRows.map(row => selectedHeaders.map(col => row[col] !== undefined ? row[col] : ''))
      });

      // Include UTF-8 Byte Order Mark (\ufeff) to ensure Excel and spreadsheet apps open the file cleanly instantly
      const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `students_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Successfully exported ${filteredList.length} student records!`);
      setShowExportModal(false);
    } catch (error: any) {
      console.error("Custom export error:", error);
      toast.error("An error occurred during fee due calculation: " + error.message);
    } finally {
      toast.dismiss(toastId);
    }
  };

  const handleExportA4PDF = async () => {
    const toastId = toast.loading("Loading complete student records...", { duration: 99999 });

    try {
      // Fetch ALL students directly to ensure we have active records
      const allDbStudents = await dbService.list('students') as any[];
      let filteredList = [...allDbStudents];

      if (exportFilters.classId) {
        filteredList = filteredList.filter(s => s.classId === exportFilters.classId);
      }
      if (exportFilters.batchId) {
        filteredList = filteredList.filter(s => s.batchId === exportFilters.batchId);
      }
      if (exportFilters.busRoute) {
        filteredList = filteredList.filter(s => s.busRoute && s.busRoute.toLowerCase().includes(exportFilters.busRoute.toLowerCase()));
      }
      if (exportFilters.feeType !== 'all') {
        filteredList = filteredList.filter(s => s.feeType === exportFilters.feeType);
      }
      if (exportFilters.village) {
        filteredList = filteredList.filter(s => s.village && s.village.toLowerCase().includes(exportFilters.village.toLowerCase()));
      }
      if (isTeacherPortal || isTeacherRole) {
        filteredList = filteredList.filter(s => (s.status || 'active') === 'active');
      } else if (exportFilters.status !== 'all') {
        filteredList = filteredList.filter(s => {
          const sStatus = s.status || 'active';
          if (exportFilters.status === 'active_and_non_attending') {
            return sStatus === 'active' || sStatus === 'non_attending';
          }
          return sStatus === exportFilters.status;
        });
      }

      if (filteredList.length === 0) {
        toast.error("No student records matched the export filters!");
        toast.dismiss(toastId);
        return;
      }

      toast.loading("Generating A4 printable PDF and calculating fee details...", { id: toastId });

      const [feeStructures, payments, fetchedConcessions] = await Promise.all([
        dbService.list('feeStructures') as Promise<any[]>,
        dbService.list('payments') as Promise<any[]>,
        concessions.length > 0 ? Promise.resolve(concessions) : dbService.list('concessions') as Promise<any[]>
      ]);

      const selectedHeaders: string[] = [];
      if (exportSelectedFields.uniqueStudentId) selectedHeaders.push("Unique Student ID");
      if (exportSelectedFields.admissionNumber) selectedHeaders.push("Admission Number");
      if (exportSelectedFields.rollNumber) selectedHeaders.push("Roll Number");
      if (exportSelectedFields.name) selectedHeaders.push("Full Name");
      if (exportSelectedFields.firstName) selectedHeaders.push("First Name");
      if (exportSelectedFields.secondName) selectedHeaders.push("Second Name");
      if (exportSelectedFields.gender) selectedHeaders.push("Gender");
      if (exportSelectedFields.dob) selectedHeaders.push("Date of Birth");
      if (exportSelectedFields.email) selectedHeaders.push("Email");
      if (exportSelectedFields.phone) selectedHeaders.push("Phone");
      if (exportSelectedFields.whatsappNumber) selectedHeaders.push("WhatsApp Number");
      if (exportSelectedFields.classId) selectedHeaders.push("Class Name");
      if (exportSelectedFields.batchId) selectedHeaders.push("Batch Name");
      if (exportSelectedFields.academicYear) selectedHeaders.push("Academic Year");
      if (exportSelectedFields.bloodGroup) selectedHeaders.push("Blood Group");
      if (exportSelectedFields.aadharNumber) selectedHeaders.push("Aadhar Number");
      if (exportSelectedFields.address) selectedHeaders.push("Address");
      if (exportSelectedFields.feeType) selectedHeaders.push("Fee Type");
      if (exportSelectedFields.transportType) selectedHeaders.push("Transport Type");
      if (exportSelectedFields.busRoute) selectedHeaders.push("Bus Route");
      if (exportSelectedFields.transportStopId) selectedHeaders.push("Transport Stop");
      if (exportSelectedFields.village) selectedHeaders.push("Village");
      if (exportSelectedFields.feeConcessionType) selectedHeaders.push("Fee Concession Type");
      if (exportSelectedFields.nonAttending) selectedHeaders.push("Non-Attending Students");
      if (exportSelectedFields.feeConcessionAmount) selectedHeaders.push("Concession Amount");
      if (exportSelectedFields.penNumber) selectedHeaders.push("Pen Number");
      if (exportSelectedFields.aparId) selectedHeaders.push("Apar ID");
      if (exportSelectedFields.motherAadhar) selectedHeaders.push("Mother Aadhar");
      if (exportSelectedFields.fatherAadhar) selectedHeaders.push("Father Aadhar");
      if (exportSelectedFields.motherBankDetails) selectedHeaders.push("Mother Bank Details");
      if (exportSelectedFields.rationCardNumber) selectedHeaders.push("Ration Card Number");
      if (exportSelectedFields.studentCaste) selectedHeaders.push("Caste");
      if (exportSelectedFields.studentSubCaste) selectedHeaders.push("Sub Caste");
      if (exportSelectedFields.religion) selectedHeaders.push("Religion");
      if (exportSelectedFields.motherTongue) selectedHeaders.push("Mother Tongue");
      if (exportSelectedFields.nationality) selectedHeaders.push("Nationality");
      if (exportSelectedFields.dateOfAdmission) selectedHeaders.push("Date of Admission");
      if (exportSelectedFields.fatherName) selectedHeaders.push("Father Name");
      if (exportSelectedFields.fatherOccupation) selectedHeaders.push("Father Occupation");
      if (exportSelectedFields.motherName) selectedHeaders.push("Mother Name");
      if (exportSelectedFields.previousSchool) selectedHeaders.push("Previous School");

      if (exportSelectedFields.term1Due) selectedHeaders.push("Term 1 Fee Due");
      if (exportSelectedFields.term2Due) selectedHeaders.push("Term 2 Fee Due");
      if (exportSelectedFields.term3Due) selectedHeaders.push("Term 3 Fee Due");
      if (exportSelectedFields.prevYearFeeDue) selectedHeaders.push("Previous Year Fee Due");
      if (exportSelectedFields.admissionFeeDue) selectedHeaders.push("Admission Fee Due");
      if (exportSelectedFields.iplFeeDue) selectedHeaders.push("IPL Fee Due");
      if (exportSelectedFields.healthCardFeeDue) selectedHeaders.push("Health Card Fee Due");
      if (exportSelectedFields.totalFeeDue) selectedHeaders.push("Total Fee Due");

      if (exportSelectedFields.concessionTypeWise) {
        selectedHeaders.push("School Concession Type");
        selectedHeaders.push("Admission Concession Type");
        selectedHeaders.push("School Concession Amount");
      }

      // If no columns are selected, default to a few important columns
      const finalHeaders = selectedHeaders.length > 0 
        ? selectedHeaders 
        : ["Admission Number", "Roll Number", "Full Name", "Class Name", "Batch Name", "Phone", "Total Fee Due"];

      const exportRows = filteredList.map(s => {
        const row: Record<string, any> = {};
        
        finalHeaders.forEach(col => {
          row[col] = '';
        });

        const classRecord = classes.find(c => c.id === s.classId);
        const batchRecord = batches.find(b => b.id === s.batchId);

        if (finalHeaders.includes("Unique Student ID")) row["Unique Student ID"] = s.uniqueStudentId || '';
        if (finalHeaders.includes("Admission Number")) row["Admission Number"] = s.admissionNumber || '';
        if (finalHeaders.includes("Roll Number")) row["Roll Number"] = s.rollNumber || '';
        if (finalHeaders.includes("Full Name")) row["Full Name"] = s.name || '';
        if (finalHeaders.includes("First Name")) row["First Name"] = s.firstName || '';
        if (finalHeaders.includes("Second Name")) row["Second Name"] = s.secondName || '';
        if (finalHeaders.includes("Gender")) row["Gender"] = s.gender || '';
        if (finalHeaders.includes("Date of Birth")) row["Date of Birth"] = s.dob || '';
        if (finalHeaders.includes("Email")) row["Email"] = s.email || '';
        if (finalHeaders.includes("Phone")) row["Phone"] = s.phone || '';
        if (finalHeaders.includes("WhatsApp Number")) row["WhatsApp Number"] = s.whatsappNumber || '';
        if (finalHeaders.includes("Class Name")) row["Class Name"] = classRecord ? classRecord.name : (s.classId || '');
        if (finalHeaders.includes("Batch Name")) row["Batch Name"] = batchRecord ? batchRecord.name : (s.batch || s.batchId || '');
        if (finalHeaders.includes("Academic Year")) row["Academic Year"] = s.academicYear || '';
        if (finalHeaders.includes("Blood Group")) row["Blood Group"] = s.bloodGroup || '';
        if (finalHeaders.includes("Aadhar Number")) row["Aadhar Number"] = s.aadharNumber || '';
        if (finalHeaders.includes("Address")) row["Address"] = s.address || '';
        if (finalHeaders.includes("Fee Type")) row["Fee Type"] = s.feeType || '';
        if (finalHeaders.includes("Transport Type")) row["Transport Type"] = s.transportType || '';
        if (finalHeaders.includes("Bus Route")) {
          const busRecord = buses.find(b => b.id === s.busRoute);
          row["Bus Route"] = busRecord ? `${busRecord.busNumber} - ${busRecord.routeName || ''}` : (s.busRoute || '');
        }
        if (finalHeaders.includes("Transport Stop")) {
          const stopRecord = stops.find(stop => stop.id === s.transportStopId);
          row["Transport Stop"] = stopRecord ? stopRecord.villageName : (s.transportStopId || '');
        }
        if (finalHeaders.includes("Village")) {
          const stopRecord = stops.find(stop => stop.id === s.transportStopId);
          row["Village"] = s.village || (stopRecord ? stopRecord.villageName : '');
        }
        if (finalHeaders.includes("Fee Concession Type") || finalHeaders.includes("Concession Type")) {
          const schoolConc = fetchedConcessions.find(c => c.id === s.feeConcessionType);
          const formattedVal = s.feeConcessionType === 'custom'
            ? 'Custom (Flat Discount)'
            : (schoolConc ? `${schoolConc.name} (${schoolConc.type === 'percentage' ? `${schoolConc.value}%` : `₹${schoolConc.value}`})` : (s.feeConcessionType || 'None'));
          if (finalHeaders.includes("Fee Concession Type")) {
            row["Fee Concession Type"] = formattedVal;
          } else {
            row["Concession Type"] = formattedVal;
          }
        }
        if (finalHeaders.includes("Non-Attending Students")) {
          row["Non-Attending Students"] = s.status === 'non_attending' ? 'Yes' : 'No';
        }
        if (finalHeaders.includes("Concession Amount")) row["Concession Amount"] = s.feeConcessionAmount || '';
        if (finalHeaders.includes("Pen Number")) row["Pen Number"] = s.penNumber || '';
        if (finalHeaders.includes("Apar ID")) row["Apar ID"] = s.aparId || '';
        if (finalHeaders.includes("Mother Aadhar")) row["Mother Aadhar"] = s.motherAadhar || '';
        if (finalHeaders.includes("Father Aadhar")) row["Father Aadhar"] = s.fatherAadhar || '';
        if (finalHeaders.includes("Mother Bank Details")) row["Mother Bank Details"] = s.motherBankDetails || '';
        if (finalHeaders.includes("Ration Card Number")) row["Ration Card Number"] = s.rationCardNumber || '';
        if (finalHeaders.includes("Caste")) row["Caste"] = s.studentCaste || '';
        if (finalHeaders.includes("Sub Caste")) row["Sub Caste"] = s.studentSubCaste || '';
        if (finalHeaders.includes("Religion")) row["Religion"] = s.religion || '';
        if (finalHeaders.includes("Mother Tongue")) row["Mother Tongue"] = s.motherTongue || '';
        if (finalHeaders.includes("Nationality")) row["Nationality"] = s.nationality || '';
        if (finalHeaders.includes("Date of Admission")) row["Date of Admission"] = s.dateOfAdmission || '';
        if (finalHeaders.includes("Father Name")) row["Father Name"] = s.fatherName || '';
        if (finalHeaders.includes("Father Occupation")) row["Father Occupation"] = s.fatherOccupation || '';
        if (finalHeaders.includes("Mother Name")) row["Mother Name"] = s.motherName || '';
        if (finalHeaders.includes("Previous School")) row["Previous School"] = s.previousSchool || '';

        const targetYearOff = s.academicYear || '2026-27';
        const calc = calculateStudentFee(
          s, 
          targetYearOff, 
          feeStructures || [], 
          fetchedConcessions || [], 
          classes || [], 
          batches || [], 
          true
        );

        const studPayments = (payments || []).filter(p => 
          (p.studentId === s.id || p.studentId === s.uid) && 
          (!p.reference || !p.reference.startsWith('EXP')) &&
          normalizeYear(p.academicYear) === normalizeYear(targetYearOff)
        );

        const paidComponents: Record<string, number> = {};
        studPayments.forEach(p => {
          const comp = p.component || 'other';
          paidComponents[comp] = (paidComponents[comp] || 0) + (Number(p.amount) || 0);
        });

        let t1Payable = 0;
        let t2Payable = 0;
        let t3Payable = 0;

        const schoolFee = calc.schoolFee || 0;
        const schoolStructure = calc.schoolStructure;
        if (calc.schoolFeeTerms) {
          t1Payable += calc.schoolFeeTerms.term1 || 0;
          t2Payable += calc.schoolFeeTerms.term2 || 0;
          t3Payable += calc.schoolFeeTerms.term3 || 0;
        } else if (schoolStructure) {
          const originalSchoolTotal = (Number(schoolStructure.term1) || 0) + (Number(schoolStructure.term2) || 0) + (Number(schoolStructure.term3) || 0);
          const ratio = originalSchoolTotal > 0 ? (schoolFee / originalSchoolTotal) : 1;
          const t1 = Math.round((Number(schoolStructure.term1) || 0) * ratio);
          const t2 = Math.round((Number(schoolStructure.term2) || 0) * ratio);
          const t3 = Math.max(0, schoolFee - t1 - t2);
          t1Payable += t1;
          t2Payable += t2;
          t3Payable += t3;
        } else {
          t1Payable += schoolFee;
        }

        const transportFee = calc.transportFee || 0;
        const transportStructure = calc.transportStructure;
        if (calc.transportFeeTerms) {
          t1Payable += calc.transportFeeTerms.term1 || 0;
          t2Payable += calc.transportFeeTerms.term2 || 0;
          t3Payable += calc.transportFeeTerms.term3 || 0;
        } else if (transportFee > 0) {
          if (transportStructure) {
            const originalTransportTotal = (Number(transportStructure.term1) || 0) + (Number(transportStructure.term2) || 0) + (Number(transportStructure.term3) || 0);
            const ratio = originalTransportTotal > 0 ? (transportFee / originalTransportTotal) : 1;
            const t1 = Math.round((Number(transportStructure.term1) || 0) * ratio);
            const t2 = Math.round((Number(transportStructure.term2) || 0) * ratio);
            const t3 = Math.max(0, transportFee - t1 - t2);
            t1Payable += t1;
            t2Payable += t2;
            t3Payable += t3;
          } else {
            const termValue = Math.round(transportFee / 3);
            const t1 = termValue;
            const t2 = termValue;
            const t3 = Math.max(0, transportFee - t1 - t2);
            t1Payable += t1;
            t2Payable += t2;
            t3Payable += t3;
          }
        }

        const hostelFee = calc.hostelFee || 0;
        const hostelStructure = calc.hostelStructure;
        if (calc.hostelFeeTerms) {
          t1Payable += calc.hostelFeeTerms.term1 || 0;
          t2Payable += calc.hostelFeeTerms.term2 || 0;
          t3Payable += calc.hostelFeeTerms.term3 || 0;
        } else if (hostelFee > 0) {
          if (hostelStructure) {
            const originalHostelTotal = (Number(hostelStructure.term1) || 0) + (Number(hostelStructure.term2) || 0) + (Number(hostelStructure.term3) || 0);
            const ratio = originalHostelTotal > 0 ? (hostelFee / originalHostelTotal) : 1;
            const t1 = Math.round((Number(hostelStructure.term1) || 0) * ratio);
            const t2 = Math.round((Number(hostelStructure.term2) || 0) * ratio);
            const t3 = Math.max(0, hostelFee - t1 - t2);
            t1Payable += t1;
            t2Payable += t2;
            t3Payable += t3;
          } else {
            const t1 = Math.round(hostelFee * 0.5);
            const t2 = Math.round(hostelFee * 0.25);
            const t3 = Math.max(0, hostelFee - t1 - t2);
            t1Payable += t1;
            t2Payable += t2;
            t3Payable += t3;
          }
        }

        const t1Paid = (paidComponents['term1'] || 0) + (paidComponents['transport_term1'] || 0) + (paidComponents['hostel_term1'] || 0);
        const t2Paid = (paidComponents['term2'] || 0) + (paidComponents['transport_term2'] || 0) + (paidComponents['hostel_term2'] || 0);
        const t3Paid = (paidComponents['term3'] || 0) + (paidComponents['transport_term3'] || 0) + (paidComponents['hostel_term3'] || 0);

        const t1Due = Math.max(0, t1Payable - t1Paid);
        const t2Due = Math.max(0, t2Payable - t2Paid);
        const t3Due = Math.max(0, t3Payable - t3Paid);

        const oldDues = Number(s.lastClassFeeDue || 0);
        const oldDuesPaid = paidComponents['lastClassFeeDue'] || 0;
        const oldDuesOutstanding = Math.max(0, oldDues - oldDuesPaid);

        const admissionDue = Math.max(0, (calc.admissionFee || 0) - (paidComponents['admission'] || 0));
        const iplDue = Math.max(0, (calc.iplFee || 0) - (paidComponents['ipl'] || 0));
        const healthCardDue = Math.max(0, (calc.healthCardFee || 0) - (paidComponents['healthCard'] || 0));

        if (finalHeaders.includes("Term 1 Fee Due")) row["Term 1 Fee Due"] = t1Due;
        if (finalHeaders.includes("Term 2 Fee Due")) row["Term 2 Fee Due"] = t2Due;
        if (finalHeaders.includes("Term 3 Fee Due")) row["Term 3 Fee Due"] = t3Due;
        if (finalHeaders.includes("Previous Year Fee Due")) row["Previous Year Fee Due"] = oldDuesOutstanding;
        if (finalHeaders.includes("Admission Fee Due")) row["Admission Fee Due"] = admissionDue;
        if (finalHeaders.includes("IPL Fee Due")) row["IPL Fee Due"] = iplDue;
        if (finalHeaders.includes("Health Card Fee Due")) row["Health Card Fee Due"] = healthCardDue;
        if (finalHeaders.includes("Total Fee Due")) row["Total Fee Due"] = t1Due + t2Due + t3Due + oldDuesOutstanding + admissionDue + iplDue + healthCardDue;

        if (finalHeaders.includes("School Concession Type")) {
          const schoolConc = fetchedConcessions.find(c => c.id === s.feeConcessionType);
          row["School Concession Type"] = s.feeConcessionType === 'custom' 
            ? 'Custom (Flat Discount)' 
            : (schoolConc ? `${schoolConc.name} (${schoolConc.type === 'percentage' ? `${schoolConc.value}%` : `₹${schoolConc.value}`})` : 'None');
        }
        if (finalHeaders.includes("Admission Concession Type")) {
          const admissionConc = fetchedConcessions.find(c => c.id === s.admissionConcessionType);
          row["Admission Concession Type"] = s.admissionConcessionType === 'custom'
            ? 'Custom (Flat Admission Discount)'
            : (admissionConc ? `${admissionConc.name} (${admissionConc.type === 'percentage' ? `${admissionConc.value}%` : `₹${admissionConc.value}`})` : 'None');
        }
        if (finalHeaders.includes("School Concession Amount")) {
          const schoolConc = fetchedConcessions.find(c => c.id === s.feeConcessionType);
          row["School Concession Amount"] = s.feeConcessionType === 'custom'
            ? (Number(s.feeConcessionAmount) || 0)
            : (schoolConc ? (schoolConc.type === 'fixed' ? Number(schoolConc.value) : Math.round(Number(schoolFee) * (Number(schoolConc.value) / 100))) : 0);
        }

        return row;
      });

      const doc = new jsPDF({
        orientation: finalHeaders.length > 6 ? 'landscape' : 'portrait',
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
      doc.text("Student Directory Audit Report", 14, 11);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Generated on: ${new Date().toLocaleDateString()} | Matches found: ${filteredList.length}`, 14, 18);

      const tableData = exportRows.map(row => finalHeaders.map(col => row[col] !== undefined ? String(row[col]) : ''));

      autoTable(doc, {
        startY: 28,
        head: [finalHeaders],
        body: tableData,
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

      doc.save(`students_export_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success(`Successfully exported ${filteredList.length} student records and aligned cleanly within A4 dimensions!`);
      setShowExportModal(false);
    } catch (error: any) {
      console.error("Custom export PDF error:", error);
      toast.error("An error occurred during print export: " + error.message);
    } finally {
      toast.dismiss(toastId);
    }
  };
 
  const autoAssignRollNumbersForClassBatch = async (
    classId: string,
    batchId: string,
    academicYear: string
  ) => {
    if (!classId || !batchId || !academicYear) return;
    try {
      // Safely fetch all students in this class using simple single-property querying to prevent any compound index errors
      const classStudents = await dbService.list('students', [
        where('classId', '==', classId)
      ]);
 
      if (!classStudents || classStudents.length === 0) return;
 
      // Filter in memory for batch, academic year, and active status
      const targetStudents = classStudents.filter((s: any) => 
        s.batchId === batchId && 
        s.academicYear === academicYear && 
        s.status === 'active'
      );
 
      if (targetStudents.length === 0) return;
 
      // Separate into males and females
      const males = targetStudents.filter((s: any) => (s.gender || 'male').toLowerCase() === 'male');
      const females = targetStudents.filter((s: any) => (s.gender || 'male').toLowerCase() === 'female');
      const others = targetStudents.filter((s: any) => {
        const g = (s.gender || 'male').toLowerCase();
        return g !== 'male' && g !== 'female';
      });
 
      // Sort each group alphabetically by name
      const sortByNameLocal = (list: any[]) => {
        return [...list].sort((a, b) => {
          const nameA = (a.name || `${a.firstName || ''} ${a.secondName || ''}`).trim();
          const nameB = (b.name || `${b.firstName || ''} ${b.secondName || ''}`).trim();
          return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        });
      };
 
      const sortedMales = sortByNameLocal(males);
      const sortedFemales = sortByNameLocal(females);
      const sortedOthers = sortByNameLocal(others);
 
      // Males alphabetically first, then females alphabetically, then others alphabetically
      const resolvedOrder = [...sortedMales, ...sortedFemales, ...sortedOthers];
 
      const updates: Promise<any>[] = [];
      resolvedOrder.forEach((student: any, idx: number) => {
        const expectedRollNo = String(idx + 1);
        const sId = student.id || student.uid;
        if (String(student.rollNumber) !== expectedRollNo || String(student.rollNo) !== expectedRollNo) {
          student.rollNumber = expectedRollNo;
          student.rollNo = expectedRollNo;
          updates.push(
            dbService.update('students', sId, {
              rollNumber: expectedRollNo,
              rollNo: expectedRollNo,
              updatedAt: new Date().toISOString()
            })
          );
          // Sync immediately to safety ref for instant local update consistency
          recentlyUpdatedStudents.current[sId] = {
            ...recentlyUpdatedStudents.current[sId],
            rollNumber: expectedRollNo,
            rollNo: expectedRollNo
          };
        }
      });
 
      if (updates.length > 0) {
        await Promise.all(updates);
      }
    } catch (err) {
      console.error("Error auto-assigning roll numbers: ", err);
    }
  };
 
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentFormData.firstName) {
      toast.error('First Name is required.');
      return;
    }
    if (!studentFormData.classId || !studentFormData.batchId) {
      toast.error('Class and Batch Selection is required.');
      return;
    }
 
    setLoading(true);
    try {
      const formattedFirstName = formatNameInput(studentFormData.firstName);
      const formattedSecondName = formatNameInput(studentFormData.secondName);
      const formattedFatherName = formatNameInput(studentFormData.fatherName || '');
      const computedFullName = `${formattedFirstName} ${formattedSecondName}`.trim();
      const normalizedName = computedFullName.toLowerCase().replace(/\s+/g, ' ');
      const normalizedFatherName = formattedFatherName.toLowerCase().replace(/\s+/g, ' ');
      const currentClassId = studentFormData.classId;
 
      // 1. Check in our local active list of students for immediate duplicate verification
      const isLocalDuplicate = students.some(s => {
        const sId = s.id || s.uid;
        if (isEditing && editingId && sId === editingId) {
          return false;
        }
        const sName = (s.name || '').toLowerCase().replace(/\s+/g, ' ');
        const sFather = (s.fatherName || '').toLowerCase().replace(/\s+/g, ' ');
        return sName === normalizedName && sFather === normalizedFatherName && s.classId === currentClassId;
      });
 
      if (isLocalDuplicate) {
        toast.error(`Duplicate Student Detected: A student named "${computedFullName}" with father's name "${studentFormData.fatherName}" is already registered in this class.`);
        setLoading(false);
        return;
      }
 
      // 2. Scan all students registered in this class through database search
      const classStudents = await dbService.list('students', [
        where('classId', '==', currentClassId)
      ]);
 
      const isRemoteDuplicate = classStudents.some((s: any) => {
        const sId = s.id || s.uid;
        if (isEditing && editingId && sId === editingId) {
          return false;
        }
        const sName = (s.name || '').toLowerCase().replace(/\s+/g, ' ');
        const sFather = (s.fatherName || '').toLowerCase().replace(/\s+/g, ' ');
        return sName === normalizedName && sFather === normalizedFatherName;
      });
 
      if (isRemoteDuplicate) {
        toast.error(`Duplicate Student Detected: A student named "${computedFullName}" with father's name "${studentFormData.fatherName}" is already registered in this class.`);
        setLoading(false);
        return;
      }
 
      // Track original class info for transfer roll number recalculation
      let oldClassId = '';
      let oldBatchId = '';
      let oldAcademicYear = '';
 
      if (isEditing && editingId) {
        const existingStudent = students.find(s => s.id === editingId || s.uid === editingId);
        if (existingStudent) {
          oldClassId = existingStudent.classId || '';
          oldBatchId = existingStudent.batchId || '';
          oldAcademicYear = existingStudent.academicYear || '';
        }
      }
 
      // Format whatsapp number: automatically prepend "+91"
      let finalWhatsapp = studentFormData.whatsappNumber ? studentFormData.whatsappNumber.replace(/\D/g, '') : '';
      if (finalWhatsapp.length === 10) {
        finalWhatsapp = '+91' + finalWhatsapp;
      } else if (finalWhatsapp.length === 12 && finalWhatsapp.startsWith('91')) {
        finalWhatsapp = '+' + finalWhatsapp;
      } else if (finalWhatsapp && !finalWhatsapp.startsWith('+')) {
        if (finalWhatsapp.startsWith('91')) {
          finalWhatsapp = '+' + finalWhatsapp;
        } else {
          finalWhatsapp = '+91' + finalWhatsapp;
        }
      }
 
      const computedRollNum = studentFormData.status === 'non_attending' ? '' : studentFormData.rollNumber;
      
      const targetClassObj = classes.find(c => c.id === studentFormData.classId);
      const targetBatchObj = batches.find(b => b.id === studentFormData.batchId);
      const targetClassName = targetClassObj?.name || studentFormData.classId || '';
      const targetBatchName = targetBatchObj?.name || studentFormData.batchId || '';

      const submissionData = {
        ...studentFormData,
        firstName: formattedFirstName,
        secondName: formattedSecondName,
        fatherName: formattedFatherName,
        rollNumber: computedRollNum,
        rollNo: computedRollNum,
        name: computedFullName,
        whatsappNumber: finalWhatsapp,
        class: targetClassName,
        className: targetClassName,
        batch: targetBatchName,
        batchName: targetBatchName,
        section: targetBatchName,
        updatedAt: new Date().toISOString()
      };
 
      let assignedId = editingId;
      if (isEditing && editingId) {
        const originalStudent = students.find(s => s.uid === editingId || s.id === editingId);
        const finalSubmissionData = {
          ...submissionData,
          uniqueStudentId: originalStudent?.uniqueStudentId || generateUniqueStudentId(originalStudent || { id: editingId })
        };

        // Update BOTH 'students' and 'users' collections so data is completely in sync
        await Promise.all([
          dbService.update('students', editingId, finalSubmissionData),
          dbService.update('users', editingId, finalSubmissionData).catch(() => {})
        ]);

        // If section/batch or class was changed, sync examMarks records for this student
        try {
          const studentMarks = await dbService.list('examMarks', [where('studentId', '==', editingId)]);
          if (Array.isArray(studentMarks) && studentMarks.length > 0) {
            const markUpdates = studentMarks.map((m: any) => ({
              id: m.id,
              data: {
                classId: studentFormData.classId,
                batchId: studentFormData.batchId,
                className: targetClassName,
                batchName: targetBatchName,
                section: targetBatchName,
                updatedAt: new Date().toISOString()
              }
            }));
            await dbService.updateBatch('examMarks', markUpdates);
          }
        } catch (mErr) {
          console.error("Error syncing student examMarks on section shift:", mErr);
        }

        toast.success(`Student profile for "${computedFullName}" updated successfully.`);
        
        // Save to safety ref to preserve edits upon immediate subsequent fetch
        recentlyUpdatedStudents.current[editingId] = finalSubmissionData;
 
        // Update local state immediately
        setStudents(prev => prev.map(item => (item.uid === editingId || item.id === editingId) ? { ...item, ...finalSubmissionData } : item));
        setAllStudentsForSiblings(prev => {
          const next = prev.map(item => (item.uid === editingId || item.id === editingId) ? { ...item, ...finalSubmissionData } : item);
          globalCachedStudentsForSiblings = next;
          return next;
        });
      } else {
        assignedId = `stud_${Date.now()}`;
        const newRecord = {
          ...submissionData,
          uniqueStudentId: generateUniqueStudentId({ id: assignedId }),
          uid: assignedId,
          id: assignedId,
          status: studentFormData.status || 'active',
          admissionDate: new Date().toISOString().split('T')[0],
          isNewStudent: true,
          createdAt: new Date().toISOString()
        };
        await dbService.create('students', assignedId, newRecord);
        toast.success(`New student profile "${computedFullName}" created successfully.`);
        
        // Save to safety ref to preserve new record upon immediate subsequent fetch
        recentlyAddedStudents.current = [newRecord, ...recentlyAddedStudents.current];
 
        // Immediately make sure we are looking at correct tab matching status
        if (studentFormData.status === 'non_attending') {
          setActiveTab('non_attending');
        } else if (studentFormData.status === 'inactive') {
          setActiveTab('inactive');
        } else {
          setActiveTab('active');
        }
        // Add the new record directly to the front of students list so it displays instantly
        setStudents(prev => [newRecord, ...prev]);
        setAllStudentsForSiblings(prev => {
          const next = [newRecord, ...prev];
          globalCachedStudentsForSiblings = next;
          return next;
        });
      }
 
      // Trigger automatic roll numbers adjustments for this class & batch in the background for instant responsiveness
      autoAssignRollNumbersForClassBatch(
        studentFormData.classId,
        studentFormData.batchId,
        studentFormData.academicYear
      ).catch(err => console.error("Background roll number assignment failed:", err));
 
      // In case they were moved to a different class/batch, clean up the original class & batch's roll numbers as well
      if (
        isEditing &&
        (oldClassId !== studentFormData.classId ||
          oldBatchId !== studentFormData.batchId ||
          oldAcademicYear !== studentFormData.academicYear)
      ) {
        autoAssignRollNumbersForClassBatch(oldClassId, oldBatchId, oldAcademicYear)
          .catch(err => console.error("Background roll number adjustment failed:", err));
      }
 
      setShowAddModal(false);
      fetchStudents(true);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save student profile: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };
 
  const handleSaveDueDateExtension = async () => {
    if (!extendingStudent) return;
    const studentId = extendingStudent.uid || extendingStudent.id;
    if (!extendedDueDate) {
      toast.error("Please select a valid date.");
      return;
    }
    setLoading(true);
    try {
      const updateData = {
        extendedDueDate,
        extendedDueDateNotes
      };
      await dbService.update('students', studentId, updateData);
      
      // Update local state immediately
      setStudents(prev => prev.map(s => (s.uid === studentId || s.id === studentId) ? { ...s, ...updateData } : s));
      setAllStudentsForSiblings(prev => {
        const next = prev.map(s => (s.uid === studentId || s.id === studentId) ? { ...s, ...updateData } : s);
        globalCachedStudentsForSiblings = next;
        return next;
      });

      toast.success(`Successfully extended due date for "${extendingStudent.name}" to ${extendedDueDate}`);
      setExtendingStudent(null);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to extend due date: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickStatusChange = async (student: any, newStatus: 'active' | 'inactive' | 'non_attending') => {
    const studentId = student.uid || student.id;
    if (!studentId) return;

    const currentNormalized = normalizeStudentStatus(student.status);
    if (currentNormalized === newStatus) return;

    try {
      const updatePayload: any = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };

      // Save to safety ref to preserve update upon immediate fetch
      recentlyUpdatedStudents.current[studentId] = {
        ...(recentlyUpdatedStudents.current[studentId] || {}),
        ...updatePayload
      };

      // Update local state immediately
      setStudents(prev => prev.map(s => (s.uid === studentId || s.id === studentId) ? { ...s, ...updatePayload } : s));
      setAllStudentsForSiblings(prev => {
        const next = prev.map(s => (s.uid === studentId || s.id === studentId) ? { ...s, ...updatePayload } : s);
        globalCachedStudentsForSiblings = next;
        return next;
      });

      // Update in Firestore
      await dbService.update('students', studentId, updatePayload);

      const statusLabels: Record<string, string> = {
        active: 'Active Students',
        non_attending: 'Non-Attending Students',
        inactive: 'Inactive / Dropped'
      };

      toast.success(`${student.name} moved to ${statusLabels[newStatus]}!`);
    } catch (err: any) {
      console.error("Error shifting student status:", err);
      toast.error("Failed to update status: " + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteStudent = (id: string, name: string) => {
    if (isTeacherPortal || isTeacherRole) {
      toast.error('Teachers do not have permission to delete student records.');
      return;
    }
    setStudentToDelete({ id, name });
    setShowDeleteConfirmModal(true);
  };
 
  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    const { id, name } = studentToDelete;
 
    const deletedStudent = students.find(s => s.id === id || s.uid === id);
    const delClassId = deletedStudent?.classId || '';
    const delBatchId = deletedStudent?.batchId || '';
    const delAcademicYear = deletedStudent?.academicYear || '';
 
    setLoading(true);
    try {
      await Promise.all([
        dbService.delete('students', id).catch(() => {}),
        dbService.delete('users', id).catch(() => {})
      ]);
      toast.success(`Student "${name}" deleted permanently.`);
      setStudents(prev => prev.filter(item => item.uid !== id && item.id !== id));
      setAllStudentsForSiblings(prev => {
        const next = prev.filter(item => item.uid !== id && item.id !== id);
        globalCachedStudentsForSiblings = next;
        return next;
      });
 
      // Auto assign and update roll numbers for this class, batch, and academic year in the background
      if (delClassId && delBatchId && delAcademicYear) {
        autoAssignRollNumbersForClassBatch(delClassId, delBatchId, delAcademicYear)
          .catch(err => console.error("Background roll number assignment failed:", err));
      }
 
      setShowDeleteConfirmModal(false);
      setStudentToDelete(null);
      fetchStudents(true);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to delete student: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const getConcessionText = (student: any) => {
    if (student.feeConcessionType === 'custom') {
      return `Custom (₹${(student.feeConcessionAmount || 0).toLocaleString()})`;
    }
    const conc = concessions.find(c => c.id === student.feeConcessionType);
    if (conc) {
      return `${conc.name} (${conc.type === 'percentage' ? `${conc.value}%` : `₹${conc.value}`})`;
    }
    return 'None';
  };

  const teacherBatchIds = useRef<string[]>([]);
  const teacherClassIds = useRef<string[]>([]);

  useEffect(() => {
    if (profile && !isTeacherPortal) {
      console.log("[Students] Profile useEffect: setting default refs because isTeacherPortal is false");
      teacherBatchIds.current = Array.from(new Set([profile?.batchId, ...(profile as any)?.batchIds || []].filter(Boolean))) as string[];
      teacherClassIds.current = Array.from(new Set([profile?.classId, ...(profile as any)?.classIds || []].filter(Boolean))) as string[];
    }
  }, [profile, isTeacherPortal]);

  useEffect(() => {
    if (settings.currentAcademicYear && !filterAcademicYear) {
      setFilterAcademicYear(settings.currentAcademicYear);
    }
  }, [settings.currentAcademicYear]);

  useEffect(() => {
    const fetchMetadata = async () => {
      if (checkQuotaStatus()) return;
      try {
        console.log("[Students] fetchMetadata starting for profile:", profile?.uid, "role:", profile?.role, "isTeacherPortal:", isTeacherPortal);
        const [cData, bData, concessionData, busesData, stopsData] = await Promise.all([
          dbService.list('classes', [limit(200)]),
          dbService.list('batches', [limit(200)]),
          dbService.list('concessions', [limit(200)]),
          dbService.list('buses', [limit(200)]),
          dbService.list('stops', [limit(500)])
        ]);

        let filteredBatches = bData as BatchRecord[] || [];
        let filteredClasses = cData as ClassRecord[] || [];

        if (profile?.role === 'play_school_incharge') {
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
              if (assignment?.classId) assignedClassIds.add(assignment.classId);
              if (assignment?.batchId) assignedBatchIds.add(assignment.batchId);
            });
          }

          bData.forEach((b: any) => {
            if (b.classTeacherId === profile?.uid) {
              if (b.id) assignedBatchIds.add(b.id);
              if (b.classId) assignedClassIds.add(b.classId);
            }
          });

          // Fallback to nursery/lkg/ukg check if no classes or batches are explicitly assigned
          if (assignedClassIds.size === 0 && assignedBatchIds.size === 0) {
            cData
              .filter((c: any) => c.name && (
                c.name.toLowerCase().includes('nursery') ||
                c.name.toLowerCase().includes('lkg') ||
                c.name.toLowerCase().includes('ukg')
              ))
              .forEach((c: any) => assignedClassIds.add(c.id));

            bData
              .filter((b: any) => b.classId && assignedClassIds.has(b.classId))
              .forEach((b: any) => assignedBatchIds.add(b.id));
          } else {
            // Ensure any batch's classId is also in assignedClassIds
            bData.forEach((b: any) => {
              if (b.id && assignedBatchIds.has(b.id) && b.classId) {
                assignedClassIds.add(b.classId);
              }
            });
          }

          const resolvedClassIds = Array.from(assignedClassIds);
          const resolvedBatchIds = Array.from(assignedBatchIds);

          teacherClassIds.current = resolvedClassIds;
          teacherBatchIds.current = resolvedBatchIds;

          filteredClasses = (cData as ClassRecord[]).filter(c => c.id && resolvedClassIds.includes(c.id));
          filteredBatches = (bData as BatchRecord[]).filter(b => b.id && resolvedBatchIds.includes(b.id));
        } else if (isTeacherPortal || checkIsTeacherAccount(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name)) {
          const assignments = await getTeacherAssignments(user, profile, profile?.role || '');
          filteredBatches = filterBatchesForTeacher(bData as any[], assignments);
          filteredClasses = filterClassesForTeacher(cData as any[], assignments, bData as any[]);

          // Direct fallback if teacher assignments resolution was empty
          if (filteredBatches.length === 0) {
            const uid = (profile?.uid || user?.uid || profile?.id || '').toLowerCase().trim();
            const email = (user?.email || profile?.email || '').toLowerCase().trim();
            const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const nameNorm = norm(user?.displayName || profile?.name || '');

            const directBatches = (bData as any[]).filter(b => {
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
              filteredClasses = (cData as any[]).filter(c => directClassIds.has(c.id));
            }
          }

          teacherClassIds.current = Array.from(new Set(filteredClasses.map(c => c.id).filter(Boolean)));
          teacherBatchIds.current = Array.from(new Set(filteredBatches.map(b => b.id).filter(Boolean)));
        }

        const finalSortedClasses = sortAlphabetically(filteredClasses, 'name', 'asc');
        const finalSortedBatches = sortAlphabetically(filteredBatches, 'name', 'asc');

        console.log("[Students] fetchMetadata complete. teacherClassIds:", teacherClassIds.current, "teacherBatchIds:", teacherBatchIds.current);
        console.log("[Students] finalSortedClasses names:", finalSortedClasses.map(c => c.name), "finalSortedBatches names:", finalSortedBatches.map(b => b.name));

        setBatches(finalSortedBatches);
        setClasses(finalSortedClasses);
        setConcessions(concessionData as FeeConcession[] || []);
        setBuses(busesData || []);
        setStops(stopsData || []);

        if (isTeacherPortal && finalSortedClasses.length > 0) {
          const targetCId = finalSortedClasses[0].id || '';
          setFilterClass(targetCId);
          const defaultBatch = finalSortedBatches.find(b => b.classId === targetCId);
          if (defaultBatch) setFilterBatch(defaultBatch.id || '');
        }
      } catch (error) {
        console.error(error);
      }
    };

    if (profile?.uid) {
      fetchMetadata();
    }
  }, [profile?.uid, isTeacherPortal]);

  const fetchStudents = async (isNewSearch = false) => {
    // Wait if filterAcademicYear is empty on initialization, but allow it if academic years are loaded (meaning All Academic Years is explicitly selected)
    if (!filterAcademicYear && (!settings.academicYears || settings.academicYears.length === 0)) {
      setLoading(false);
      return;
    }
    if (checkQuotaStatus()) return;

    const isSearching = !!debouncedSearch.trim();
    const hasFilters = !!(filterClass || filterBatch);
    console.log("[Students] fetchStudents called. filterClass:", filterClass, "filterBatch:", filterBatch, "filterAcademicYear:", filterAcademicYear, "isTeacherPortal:", isTeacherPortal);
    let showedCache = false;
    if (!isSearching && !hasFilters && !isTeacherPortal && globalCachedStudentsForSiblings && globalCachedStudentsForSiblings.length > 0) {
      setStudents(globalCachedStudentsForSiblings);
      showedCache = true;
    }

    if (!showedCache) {
      setLoading(true);
    }
    try {
      const constraints: any[] = [];
      
      if (isTeacherPortal) {
        const classTeacherBatches = batches.filter((b: any) => b.classTeacherId === profile?.uid).map((b: any) => b.id);
        const finalTeacherBatches = Array.from(new Set([...teacherBatchIds.current, ...classTeacherBatches]));
        console.log("[Students] fetchStudents (Teacher Portal). teacherBatchIds.current:", teacherBatchIds.current, "classTeacherBatches:", classTeacherBatches, "finalTeacherBatches:", finalTeacherBatches);
        
        if (isSearching) {
          // If searching, search in all teacher's allowed batches (respect role-based privacy)
          if (finalTeacherBatches.length > 0) {
            constraints.push(where('batchId', 'in', finalTeacherBatches.slice(0, 10)));
          } else {
            console.log("[Students] Empty finalTeacherBatches for search");
            setStudents([]);
            setLoading(false);
            return;
          }
        } else {
          // Normal filtering
          if (filterBatch) {
            constraints.push(where('batchId', '==', filterBatch));
          } else if (filterClass) {
            constraints.push(where('classId', '==', filterClass));
            const allowedBatchesInClass = batches.filter(b => b.id && (b.classId === filterClass) && finalTeacherBatches.includes(b.id)).map(b => b.id!);
            console.log("[Students] normal filtering by filterClass:", filterClass, "allowedBatchesInClass:", allowedBatchesInClass);
            if (allowedBatchesInClass.length > 0) {
              constraints.push(where('batchId', 'in', allowedBatchesInClass.slice(0, 10)));
            } else {
              constraints.push(where('batchId', '==', 'BLOCK_SECURE_REPOSITORY_OVERFLOW'));
            }
          } else {
            if (finalTeacherBatches.length > 0) {
              constraints.push(where('batchId', 'in', finalTeacherBatches.slice(0, 10)));
            } else {
              console.log("[Students] Empty finalTeacherBatches for normal filter (no class/batch select)");
              setStudents([]);
              setLoading(false);
              return;
            }
          }
        }
      } else {
        // If we are searching, we only apply class/batch filters if some search filter is explicitly selected.
        const hasFiltersSet = !!(filterClass || filterBatch || filterAcademicYear);
        if (!isSearching || hasFiltersSet) {
          if (filterClass) constraints.push(where('classId', '==', filterClass));
          if (filterBatch) constraints.push(where('batchId', '==', filterBatch));
        }
      }

      // Status and sorting are handled smoothly without causing Firestore composite index requirements.
      constraints.push(limit(5000)); // Raised to 5000 so we fetch all students matching the criteria for exact counts and pagination

      let result;
      const updateStudentListState = async (res: any) => {
        if (!res) return;
        const fetched = res.data || [];
        
        // Resolve modified/updated values from the safety edits map
        const resolvedFetched = fetched.map((s: any) => {
          const id = s.id || s.uid;
          if (id && recentlyUpdatedStudents.current[id]) {
            return { ...s, ...recentlyUpdatedStudents.current[id] };
          }
          return s;
        });

        // Inject any newly created students that match the filtering conditions and are not yet returned by Firestore
        const hasFiltersSet = !!(filterClass || filterBatch || filterAcademicYear);
        const matchingRecent = recentlyAddedStudents.current.filter(s => {
          const shouldEnforceFilters = !isSearching || hasFiltersSet;
          const matchesClass = !shouldEnforceFilters || (!filterClass || s.classId === filterClass);
          const matchesBatch = !shouldEnforceFilters || (!filterBatch || s.batchId === filterBatch);
          const matchesAcademicYear = !shouldEnforceFilters || (!filterAcademicYear || s.academicYear === filterAcademicYear);
          const matchesStatus = !shouldEnforceFilters || (normalizeStudentStatus(s.status) === activeTab);
          const alreadyFetched = resolvedFetched.some((f: any) => f.id === s.id || f.uid === s.uid);
          
          const matchesSearch = !isSearching || 
            (String(s.name || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) || 
            (String(s.firstName || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) || 
            (String(s.studentName || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) || 
            (String(s.rollNumber || s.rollNo || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (String(s.admissionNumber || s.admissionNo || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (String(s.uniqueStudentId || s.customId || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (String(s.email || s.studentEmail || s.parentEmail || s.fatherEmail || s.motherEmail || s.guardianEmail || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (String(s.fatherName || s.parentName || s.motherName || "")).toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (String(s.phone || s.whatsappNumber || s.parentPhone || s.fatherPhone || s.motherPhone || "")).toLowerCase().includes(debouncedSearch.toLowerCase());
            
          return matchesClass && matchesBatch && matchesAcademicYear && matchesStatus && matchesSearch && !alreadyFetched;
        });

        let finalStudentList = [...matchingRecent, ...resolvedFetched].filter((s: any) => {
          if (!s) return false;
          if (isDemoStudentRecord(s)) return false;
          const sName = (s.name || s.studentName || s.fullName || '').trim();
          if (isKnownDemoName(sName)) return false;
          return true;
        });
        const isTeacherAcc = checkIsTeacherAccount(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name);
        if (isTeacherAcc || isTeacherPortal) {
          const assignments = await getTeacherAssignments(user, profile, profile?.role || '');
          finalStudentList = filterStudentsForTeacher(finalStudentList, assignments);
        }
        setStudents(finalStudentList);

        if (!isSearching && !filterClass && !filterBatch && !isTeacherPortal) {
          globalCachedStudentsForSiblings = finalStudentList;
          setAllStudentsForSiblings(finalStudentList);
        }
      };

      try {
        result = await dbService.listPaginated('students', constraints, false);
      } catch (err: any) {
        console.warn("Students fetch with orderBy failed, retrying without sorting/indexing restrictions:", err);
        const fallbackConstraints = constraints.filter(c => {
          const type = (c as any).type || (c as any)._type;
          return type !== 'orderBy';
        });
        result = await dbService.listPaginated('students', fallbackConstraints, false);
        if (result && result.data) {
          result.data.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
        }
      }

      if (result) {
        updateStudentListState(result);
        setLoading(false); // Stop spinner early!
      }

      // Background revalidation to update UI silently with fresh data from server
      setTimeout(async () => {
        try {
          let freshResult;
          try {
            freshResult = await dbService.listPaginated('students', constraints, true);
          } catch (err: any) {
            const fallbackConstraints = constraints.filter(c => {
              const type = (c as any).type || (c as any)._type;
              return type !== 'orderBy';
            });
            freshResult = await dbService.listPaginated('students', fallbackConstraints, true);
            if (freshResult && freshResult.data) {
              freshResult.data.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
            }
          }
          if (freshResult) {
            updateStudentListState(freshResult);
          }
        } catch (e) {
          console.warn("Background students revalidation failed:", e);
        }
      }, 50);
    } catch (error) {
      setIndexError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filterClass || filterBatch || debouncedSearch || !isTeacherPortal || (isTeacherPortal && (teacherBatchIds.current.length > 0 || teacherClassIds.current.length > 0))) {
      fetchStudents(true);
    }
  }, [filterClass, filterBatch, filterAcademicYear, activeTab, debouncedSearch]);

  const getFilterMatch = (s: any) => {
    if (!s) return false;
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;

    if (isTeacherPortal) {
      const classTeacherBatches = batches.filter((b: any) => b.classTeacherId === profile?.uid).map((b: any) => b.id || b.uid);
      const finalTeacherBatches = new Set([...teacherBatchIds.current, ...classTeacherBatches]);
      if (!finalTeacherBatches.has(s.batchId)) return false;
    }

    // Name search
    const nameMatches = (String(s.name || "")).toLowerCase().includes(term) ||
                        (String(s.firstName || "")).toLowerCase().includes(term) ||
                        (String(s.secondName || "")).toLowerCase().includes(term) ||
                        (String(s.studentName || "")).toLowerCase().includes(term) ||
                        (String(s.fullName || "")).toLowerCase().includes(term);

    // Email search: student email, parent email, father email, mother email, guardian email, user email
    const emailMatches = (String(s.email || "")).toLowerCase().includes(term) ||
                         (String(s.studentEmail || "")).toLowerCase().includes(term) ||
                         (String(s.parentEmail || "")).toLowerCase().includes(term) ||
                         (String(s.fatherEmail || "")).toLowerCase().includes(term) ||
                         (String(s.motherEmail || "")).toLowerCase().includes(term) ||
                         (String(s.guardianEmail || "")).toLowerCase().includes(term) ||
                         (String(s.userEmail || "")).toLowerCase().includes(term) ||
                         (String(s.loginEmail || "")).toLowerCase().includes(term);

    // Father's, Mother's, Guardian's name search
    const parentMatches = (String(s.fatherName || s.parentName || s.father_name || "")).toLowerCase().includes(term) ||
                          (String(s.motherName || s.mother_name || "")).toLowerCase().includes(term) ||
                          (String(s.guardianName || "")).toLowerCase().includes(term);

    // Mobile number search: phone, whatsappNumber, parentPhone, mobile, WhatsApp
    const phoneMatches = (String(s.phone || "")).toLowerCase().includes(term) ||
                         (String(s.whatsappNumber || s.whatsapp || "")).toLowerCase().includes(term) ||
                         (String(s.parentPhone || s.parent_phone || "")).toLowerCase().includes(term) ||
                         (String(s.fatherPhone || "")).toLowerCase().includes(term) ||
                         (String(s.motherPhone || "")).toLowerCase().includes(term) ||
                         (String(s.emergencyContact || s.contact || "")).toLowerCase().includes(term);

    // Village search: village, address, city
    const villageMatches = (String(s.village || "")).toLowerCase().includes(term) ||
                           (String(s.villageOrAddress || s.address || s.city || "")).toLowerCase().includes(term);

    // Roll number, Admission number, Unique Student ID, Aadhar search
    const rollNoMatches = (String(s.rollNumber || s.rollNo || "")).toLowerCase().includes(term) ||
                          (String(s.admissionNumber || s.admissionNo || "")).toLowerCase().includes(term) ||
                          (String(s.uniqueStudentId || s.customId || s.studentId || "")).toLowerCase().includes(term) ||
                          (String(s.aadharNumber || s.aadhar || "")).toLowerCase().includes(term);

    return nameMatches || emailMatches || parentMatches || phoneMatches || villageMatches || rollNoMatches;
  };

  const isClassBatchMatch = React.useCallback((s: any) => {
    if (!s) return false;
    const resolved = resolveStudentClassAndBatch(s, classes, batches);

    if (filterClass) {
      const classMatches = resolved.classId === filterClass;
      if (!classMatches) return false;
    }

    if (filterBatch) {
      const batchMatches = resolved.batchId === filterBatch;
      if (!batchMatches) return false;
    }

    return true;
  }, [filterClass, filterBatch, classes, batches]);

  const filteredList = React.useMemo(() => {
    const rawFiltered = students.filter(s => {
      if (!getFilterMatch(s)) return false;
      if (!isClassBatchMatch(s)) return false;

      // Classify and filter by activeTab status client-side using robust normalization
      const sStatus = normalizeStudentStatus(s.status);
      if ((isTeacherPortal || isTeacherRole) && sStatus !== 'active') return false;

      const shouldEnforceStatus = !(isTeacherPortal || isTeacherRole);

      if (shouldEnforceStatus && sStatus !== activeTab) return false;

      if (filterAcademicYear) {
        const sYearNorm = normalizeYear(s.academicYear || '');
        const targetYearNorm = normalizeYear(filterAcademicYear);
        if (sYearNorm !== targetYearNorm) return false;
      }
      return true;
    });
    
    // Group active target year students by normalized name to safely deduplicate stubs without merging different real students sharing the same name
    const nameGroups = new Map<string, any[]>();
    rawFiltered.forEach(s => {
      const normName = (s.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
      if (!normName) return;
      if (!nameGroups.has(normName)) {
        nameGroups.set(normName, []);
      }
      nameGroups.get(normName)!.push(s);
    });

    const targetStudents: any[] = [];
    nameGroups.forEach((group) => {
      if (group.length === 1) {
        targetStudents.push(group[0]);
        return;
      }

      // Partition into validates (has a valid class mapping) and stubs (N/A or empty classId)
      const valids: any[] = [];
      const stubs: any[] = [];
      group.forEach(s => {
        const hasClass = s.classId && s.classId !== 'N/A' && s.classId !== '';
        if (hasClass) {
          valids.push(s);
        } else {
          stubs.push(s);
        }
      });

      if (valids.length === 0) {
        // If all are stubs, only deduplicate if they are actually duplicates (e.g. same father name, phone or email)
        const seenStubKeys = new Set<string>();
        stubs.forEach(s => {
          const father = (s.fatherName || s.parentName || '').toLowerCase().trim();
          const email = (s.email || '').toLowerCase().trim();
          const key = `${father}_${email || (s.id || s.uid)}`;
          if (!seenStubKeys.has(key)) {
            seenStubKeys.add(key);
            targetStudents.push(s);
          }
        });
        return;
      }

      // Merge stubs into valids if they represent the same person using conflict-checking matching logic
      const unmatchedStubs: any[] = [];
      stubs.forEach(stub => {
        const stubFather = (stub.fatherName || stub.parentName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const stubEmail = (stub.email || '').toLowerCase().trim();
        const stubPhone = (stub.phone || stub.parentPhone || '').toLowerCase().trim().replace(/[^0-9]/g, '');

        const hasMatch = valids.some(v => {
          const vFather = (v.fatherName || v.parentName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
          const vEmail = (v.email || '').toLowerCase().trim();
          const vPhone = (v.phone || v.parentPhone || '').toLowerCase().trim().replace(/[^0-9]/g, '');

          const isStubFatherValid = stubFather && stubFather !== 'na' && stubFather !== 'nan' && stubFather !== 'nil';
          const isVFatherValid = vFather && vFather !== 'na' && vFather !== 'nan' && vFather !== 'nil';

          // Explicit field alignment
          if (stubEmail && vEmail && stubEmail === vEmail && stubEmail !== 'n/a') return true;
          if (stubPhone && vPhone && stubPhone === vPhone && stubPhone.length >= 10) return true;
          if (isStubFatherValid && isVFatherValid && stubFather === vFather) return true;

          // If there's only 1 valid student with this name, match unless there is an explicit, defined contradiction
          if (valids.length === 1) {
            const fatherConflict = isStubFatherValid && isVFatherValid && stubFather !== vFather;
            const phoneConflict = stubPhone && vPhone && stubPhone.length >= 10 && vPhone.length >= 10 && stubPhone !== vPhone;
            const emailConflict = stubEmail && vEmail && stubEmail !== 'n/a' && vEmail !== 'n/a' && stubEmail !== vEmail;

            if (!fatherConflict && !phoneConflict && !emailConflict) {
              return true;
            }
          }

          return false;
        });

        if (!hasMatch) {
          unmatchedStubs.push(stub);
        }
      });

      targetStudents.push(...valids, ...unmatchedStubs);
    });

    const seenIds = new Set<string>();
    const finalUniqueStudents: any[] = [];
    targetStudents.forEach(s => {
      const sId = s.uid || s.id;
      if (sId && !seenIds.has(sId)) {
        seenIds.add(sId);
        finalUniqueStudents.push(s);
      }
    });

    return finalUniqueStudents;
  }, [students, searchTerm, classes, batches, filterAcademicYear, activeTab, isClassBatchMatch]);

  const activeCount = React.useMemo(() => {
    return students.filter(s => getFilterMatch(s) && isClassBatchMatch(s) && normalizeStudentStatus(s.status) === 'active' && (!filterAcademicYear || normalizeYear(s.academicYear || '') === normalizeYear(filterAcademicYear))).length;
  }, [students, searchTerm, filterAcademicYear, classes, batches, isClassBatchMatch]);

  const nonAttendingCount = React.useMemo(() => {
    return students.filter(s => getFilterMatch(s) && isClassBatchMatch(s) && normalizeStudentStatus(s.status) === 'non_attending' && (!filterAcademicYear || normalizeYear(s.academicYear || '') === normalizeYear(filterAcademicYear))).length;
  }, [students, searchTerm, filterAcademicYear, classes, batches, isClassBatchMatch]);

  const inactiveCount = React.useMemo(() => {
    return students.filter(s => getFilterMatch(s) && isClassBatchMatch(s) && normalizeStudentStatus(s.status) === 'inactive' && (!filterAcademicYear || normalizeYear(s.academicYear || '') === normalizeYear(filterAcademicYear))).length;
  }, [students, searchTerm, filterAcademicYear, classes, batches, isClassBatchMatch]);

  const sortedList = [...filteredList].sort((a, b) => {
    let valA = '';
    let valB = '';
    if (sortField === 'name') {
      valA = a.name || '';
      valB = b.name || '';
    } else if (sortField === 'rollNumber') {
      valA = a.rollNumber || a.rollNo || '';
      valB = b.rollNumber || b.rollNo || '';
    } else if (sortField === 'class') {
      valA = (classes.find(c => c.id === a?.classId)?.name || '') + ' ' + (batches.find(bat => bat.id === a?.batchId)?.name || a?.batch || '');
      valB = (classes.find(c => c.id === b?.classId)?.name || '') + ' ' + (batches.find(bat => bat.id === b?.batchId)?.name || b?.batch || '');
    } else if (sortField === 'fatherName') {
      valA = a.fatherName || '';
      valB = b.fatherName || '';
    } else if (sortField === 'feeConcession') {
      valA = getConcessionText(a);
      valB = getConcessionText(b);
    }
    const comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const boysCount = sortedList.filter(s => s.gender === 'male').length;
  const girlsCount = sortedList.filter(s => s.gender === 'female').length;

  // Pagination parameters (50 entries per page, with bottom-side design page selector)
  const itemsPerPage = 50;
  const totalItems = sortedList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages));
  const paginatedList = sortedList.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  const availableClasses = classes.filter(c => {
    if (!isTeacherPortal) return true;
    return c.id && (teacherClassIds.current.includes(c.id) || teacherClassIds.current.includes((c as any).name));
  });
  
  const availableBatches = batches.filter(b => {
    const classId = b.classId || (b as any).class_id || '';
    const isVisibleInClass = !filterClass || (classId === filterClass) || 
                             ((classes.find(c => c.id === filterClass)?.name || '') === (b as any).class);

    if (!isTeacherPortal) return isVisibleInClass;
    const isAssignedBatch = b.id && (teacherBatchIds.current.includes(b.id) || teacherBatchIds.current.includes((b as any).name) || b.classTeacherId === profile?.uid);

    return isVisibleInClass && isAssignedBatch;
  });

  const exportAvailableBatches = batches.filter(b => {
    const classId = b.classId || (b as any).class_id || '';
    const isVisibleInClass = !exportFilters.classId || (classId === exportFilters.classId) || 
                             ((classes.find(c => c.id === exportFilters.classId)?.name || '') === (b as any).class);

    if (!isTeacherPortal) return isVisibleInClass;
    const isAssignedBatch = b.id && (teacherBatchIds.current.includes(b.id) || teacherBatchIds.current.includes((b as any).name) || b.classTeacherId === profile?.uid);

    return isVisibleInClass && isAssignedBatch;
  });

  if (!hasPermission('students_view') && !hasPermission('students_view_all') && !isTeacherPortal) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <Users className="w-12 h-12 text-primary mb-4" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have permission to view students. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <IndexNoticeBanner error={indexError} />
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-[32px] font-bold text-sidebar">Student Management</h1>
          <p className="text-neutral-500 text-base">Manage profiles, track performance, and handle admissions.</p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center justify-end flex-1 w-full">
          {/* Stats Display */}
          <div className="flex bg-neutral-100/50 p-1 rounded-2xl border border-neutral-200 shadow-sm h-fit items-center">
            <div className="bg-white px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2 border border-neutral-100">
               <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <User className="w-4 h-4" />
               </div>
               <div className="text-left leading-tight">
                  <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-tight">Boys</p>
                  <p className="text-sm font-black text-sidebar">{boysCount}</p>
               </div>
            </div>
            <div className="px-3 py-1.5 flex items-center gap-2 border-l border-neutral-200">
               <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-500">
                  <User className="w-4 h-4" />
               </div>
               <div className="text-left leading-tight">
                  <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-tight">Girls</p>
                  <p className="text-sm font-black text-blue-600">{girlsCount}</p>
               </div>
            </div>
          </div>

          {looseAccess && !isTeacherPortal && (
            <div className="flex flex-wrap gap-2">
              {!isPrincipalOrVicePrincipal && (
                <div className="flex gap-1 bg-white border border-neutral-200 p-1 rounded-2xl shadow-sm">
                  <button
                    type="button"
                    onClick={downloadCSVTemplate}
                    className="px-3.5 py-1.5 hover:bg-neutral-50 rounded-xl font-bold text-xs text-neutral-600 transition-all flex items-center gap-1.5"
                    title="Download CSV Import Template with clean guides"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Template</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 self-stretch my-1" />
                  <label className="px-3.5 py-1.5 hover:bg-neutral-50 rounded-xl font-bold text-xs text-primary transition-all flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCSVImport}
                      ref={fileInputRef}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  globalCachedStudentsForSiblings = null;
                  await toast.promise(Promise.all([
                    fetchStudents(true),
                    fetchAllStudentsForSiblings()
                  ]), {
                    loading: 'Fetching fresh database records...',
                    success: 'Loaded fresh students database successfully!',
                    error: 'Failed to refresh records.'
                  });
                }}
                className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-700 shadow-sm rounded-2xl text-[13px] font-bold px-4 py-2 flex items-center gap-1.5 transition-all mr-1"
              >
                <RefreshCw className="w-3.5 h-3.5 text-neutral-500" />
                <span>Refresh Data</span>
              </button>

              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 shadow-sm rounded-2xl text-[13px] font-bold px-4 py-2 flex items-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-neutral-500" />
                <span>Custom Export</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSiblingModal(true)}
                className="bg-rose-50 border border-rose-200/50 hover:bg-rose-100 text-rose-700 shadow-sm rounded-2xl text-[13px] font-bold px-4 py-2 flex items-center gap-1.5 transition-all"
              >
                <Users className="w-3.5 h-3.5 text-rose-500" />
                <span>Siblings Portal</span>
              </button>

              {canCreate && (
                <button
                  onClick={() => handleOpenModal()}
                  type="button"
                  className="bg-primary hover:bg-primary/95 text-white shadow-md active:scale-95 transition-all text-[13px] font-black px-4 py-2 rounded-2xl flex items-center gap-1.5"
                  id="student-add-btn"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Student</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-neutral-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input 
            type="text" 
            placeholder="Search by name, email, roll no, mobile, father name..." 
            className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all font-medium text-[15px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {looseAccess && (
            <select
              className="px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl text-[15px] font-bold text-neutral-600 outline-none focus:border-primary"
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
            >
              <option value="">All Academic Years</option>
              {settings.academicYears?.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          )}

          <select
            className="px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl text-[15px] font-bold text-neutral-600 outline-none focus:border-primary"
            value={filterClass}
            onChange={(e) => {
              setFilterClass(e.target.value);
              setFilterBatch('');
            }}
          >
            {!isTeacherPortal && <option value="">All Classes</option>}
            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className="px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl text-[15px] font-bold text-neutral-600 outline-none focus:border-primary pr-10"
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
            disabled={!filterClass}
          >
            {!isTeacherPortal && <option value="">All Batches</option>}
            {availableBatches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {(filterClass || filterBatch || searchTerm) && looseAccess && (
            <button 
              onClick={() => {
                setFilterClass('');
                setFilterBatch('');
                setSearchTerm('');
              }}
              className="p-3 bg-red-50 text-red-500 border border-red-100 rounded-xl hover:bg-red-100 transition-all flex items-center justify-center"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Active / Inactive Tabs */}
      <div className="flex gap-4 border-b border-neutral-100 px-2 justify-between items-center flex-wrap gap-y-2">
        <div className="flex gap-2 sm:gap-4 items-center flex-wrap">
          <button
            onClick={() => setActiveTab('active')}
            className={`pb-3 px-3 sm:px-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === 'active' ? 'text-emerald-700 font-extrabold' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${activeTab === 'active' ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
              <span>Active Students</span>
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black transition-colors ${activeTab === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>
              {activeCount}
            </span>
            {activeTab === 'active' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />}
          </button>
          {(!isTeacherPortal && !isTeacherRole) && (
            <>
              <button
                onClick={() => setActiveTab('non_attending')}
                className={`pb-3 px-3 sm:px-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === 'non_attending' ? 'text-amber-700 font-extrabold' : 'text-neutral-500 hover:text-neutral-700'}`}
                title="Enrolled students who study remotely or do not attend daily physical classes"
              >
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${activeTab === 'non_attending' ? 'bg-amber-500' : 'bg-neutral-300'}`} />
                  <span>Non-Attending Students</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-black transition-colors ${activeTab === 'non_attending' ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600'}`}>
                  {nonAttendingCount}
                </span>
                {activeTab === 'non_attending' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600 rounded-full" />}
              </button>
              <button
                onClick={() => setActiveTab('inactive')}
                className={`pb-3 px-3 sm:px-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === 'inactive' ? 'text-rose-700 font-extrabold' : 'text-neutral-500 hover:text-neutral-700'}`}
                title="Dropped, TC issued, or withdrawn students"
              >
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${activeTab === 'inactive' ? 'bg-rose-500' : 'bg-neutral-300'}`} />
                  <span>Inactive / Dropped</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-black transition-colors ${activeTab === 'inactive' ? 'bg-rose-100 text-rose-800' : 'bg-neutral-100 text-neutral-600'}`}>
                  {inactiveCount}
                </span>
                {activeTab === 'inactive' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600 rounded-full" />}
              </button>
            </>
          )}
        </div>

        <div className="flex gap-2 mb-2">
          <button
            onClick={() => {
              globalCachedStudentsForSiblings = null;
              fetchStudents(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 shadow-xs"
            title="Reload students list directly from database"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
            <span>డేటా రిఫ్రెష్ (Sync List)</span>
          </button>
        </div>
      </div>

      {/* Students Data Table Layout */}
      <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b-2 border-indigo-500 text-[13px] font-extrabold uppercase text-white shadow-md">
                <th 
                  className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all rounded-tl-2xl text-indigo-300 hover:text-indigo-200" 
                  onClick={() => toggleSort('rollNumber')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Roll No</span>
                    {sortField === 'rollNumber' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-300" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-300" />
                    ) : (
                      <ArrowUp className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-emerald-300 hover:text-emerald-200" 
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Student (Total: {sortedList.length})</span>
                    {sortField === 'name' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-300" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-300" />
                    ) : (
                      <ArrowUp className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-amber-300 hover:text-amber-200" 
                  onClick={() => toggleSort('fatherName')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Father Name</span>
                    {sortField === 'fatherName' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-300" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-300" />
                    ) : (
                      <ArrowUp className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none group hover:bg-white/15 transition-all text-sky-300 hover:text-sky-200" 
                  onClick={() => toggleSort('class')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Class & Batch</span>
                    {sortField === 'class' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-300" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-300" />
                    ) : (
                      <ArrowUp className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                {!isTeacherPortal && (
                  <th 
                    className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-pink-300 hover:text-pink-200" 
                    onClick={() => toggleSort('feeConcession')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Fee Concession</span>
                      {sortField === 'feeConcession' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-pink-300" /> : <ArrowDown className="w-3.5 h-3.5 text-pink-300" />
                      ) : (
                        <ArrowUp className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                )}
                <th className="px-6 py-4 text-right rounded-tr-2xl text-purple-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-sm font-medium">
              {sortedList.length === 0 ? (
                <tr>
                  <td colSpan={isTeacherPortal ? 5 : 6} className="px-6 py-16 text-center text-neutral-400 font-bold italic">
                    No matching student records found.
                  </td>
                </tr>
              ) : (
                paginatedList.map((student) => (
                  <React.Fragment key={student.uid || student.id}>
                    <tr className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-neutral-600">{student.rollNumber || '---'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-xs overflow-hidden border border-neutral-100 relative group/avatar cursor-pointer hover:border-primary/50 transition-colors" title="Click to upload profile photo">
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="absolute inset-0 opacity-0 cursor-pointer z-10 font-sans text-xs" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleDirectStudentPhotoUpload(student, file);
                                }
                              }}
                            />
                            {(student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl) ? (
                              <img src={student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl} alt={student.name} className="w-full h-full object-cover" />
                            ) : (
                              (String(student.name || "")).charAt(0)
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                              <Upload className="w-4 h-4 text-white" />
                            </div>
                          </div>
                          <div>
                            <p className={`font-black text-[15px] uppercase tracking-tight flex items-center gap-1.5 flex-wrap ${(String(student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>
                              <span 
                                className="hover:underline cursor-pointer hover:text-primary transition-all flex items-center gap-1.5"
                                onClick={() => {
                                  const sId = student.uid || student.id;
                                  setExpandedStudentIds(prev => ({ ...prev, [sId]: !prev[sId] }));
                                }}
                              >
                                {student.name}
                                {expandedStudentIds[student.uid || student.id] ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                                )}
                              </span>
                              {siblingStudentIdsSet.has(student.uid || student.id) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const studentId = student.uid || student.id;
                                    const group = siblingGroups.find(g => g.some(s => (s.uid || s.id) === studentId)) || [];
                                    setSelectedSiblingBaseStudent(student);
                                    setSelectedSiblingGroup(group);
                                    setShowActiveSiblingDialog(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-600 text-[9.5px] font-extrabold uppercase tracking-wider rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
                                  title="Click to view sibling branches/children"
                                >
                                  <Users className="w-3 h-3 text-rose-500" />
                                  <span>Sibling</span>
                                </button>
                              )}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {normalizeStudentStatus(student.status) === 'active' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Active
                                </span>
                              )}
                              {normalizeStudentStatus(student.status) === 'non_attending' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-black bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  Non-Attending
                                </span>
                              )}
                              {normalizeStudentStatus(student.status) === 'inactive' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-black bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Inactive / Dropped
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className="text-[13px] text-neutral-600 font-bold uppercase">{student.fatherName || '---'}</span></td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-accent/10 text-accent text-[12px] font-black rounded-md uppercase">
                          {(classes.find(c => c.id === student.classId)?.name) || student.class || '---'} - {(batches.find(b => b.id === student.batchId)?.name) || student.batch || '---'}
                        </span>
                      </td>
                      {!isTeacherPortal && (
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[12px] font-bold rounded-lg border border-indigo-100 uppercase font-mono">
                            {getConcessionText(student)}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => {
                              setSelectedStudentFor360(student);
                              setShow360View(true);
                            }}
                            className="px-3 py-1.5 bg-neutral-100 hover:bg-primary hover:text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5"
                            title="View 360° Profile"
                          >
                            <TrendingUp className="w-4 h-4" />
                            <span>360° Profile</span>
                          </button>

                          {!isTeacherPortal && !isTeacherRole && (isAdmin || isPrincipalOrVicePrincipal || profile?.role === 'admin' || profile?.role === 'accountant') && (
                            <button 
                              onClick={() => {
                                setExtendingStudent(student);
                                setExtendedDueDate(student.extendedDueDate || '');
                                setExtendedDueDateNotes(student.extendedDueDateNotes || '');
                              }}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-700 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border border-amber-200 hover:border-amber-500"
                              title="Extend Fee Due Date"
                            >
                              <Calendar className="w-4 h-4" />
                              <span>Extend Due Date</span>
                            </button>
                          )}

                          {canEdit && !isTeacherPortal && !isTeacherRole && (
                            <div className="relative group/status">
                              <button
                                type="button"
                                className="px-2 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 border border-neutral-200"
                                title="Change student category tab"
                              >
                                <span>Move Tab</span>
                                <ChevronDown className="w-3 h-3 text-neutral-400" />
                              </button>
                              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-30 hidden group-hover/status:block animate-in fade-in zoom-in-95">
                                <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                                  Move to Tab
                                </div>
                                <button
                                  type="button"
                                  disabled={normalizeStudentStatus(student.status) === 'active'}
                                  onClick={() => handleQuickStatusChange(student, 'active')}
                                  className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-emerald-50 hover:text-emerald-700 transition-colors ${normalizeStudentStatus(student.status) === 'active' ? 'opacity-40 cursor-not-allowed text-emerald-600 font-black' : 'text-neutral-700'}`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                  <span>Active Students</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={normalizeStudentStatus(student.status) === 'non_attending'}
                                  onClick={() => handleQuickStatusChange(student, 'non_attending')}
                                  className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-amber-50 hover:text-amber-800 transition-colors ${normalizeStudentStatus(student.status) === 'non_attending' ? 'opacity-40 cursor-not-allowed text-amber-600 font-black' : 'text-neutral-700'}`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                  <span>Non-Attending</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={normalizeStudentStatus(student.status) === 'inactive'}
                                  onClick={() => handleQuickStatusChange(student, 'inactive')}
                                  className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-rose-50 hover:text-rose-700 transition-colors ${normalizeStudentStatus(student.status) === 'inactive' ? 'opacity-40 cursor-not-allowed text-rose-600 font-black' : 'text-neutral-700'}`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                  <span>Inactive / Dropped</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {canEdit && (
                            <button
                              onClick={() => handleOpenModal(student)}
                              className="p-1.5 bg-neutral-100 hover:text-primary rounded-xl text-neutral-500 transition-all border border-neutral-200"
                              title="Edit Student Profile"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(student.uid || student.id, student.name)}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all border border-red-200"
                              title="Delete Student Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedStudentIds[student.uid || student.id] && (
                      <tr className="bg-neutral-50/40">
                        <td colSpan={isTeacherPortal ? 5 : 6} className="px-6 py-6 border-b border-neutral-100">
                          <div className="bg-white p-6 rounded-2xl border border-neutral-150 shadow-sm max-w-4xl space-y-6">
                            <div className="flex justify-between items-start border-b border-neutral-100 pb-4">
                              <div>
                                <h4 className="text-sm font-black uppercase text-sidebar tracking-wider">Complete Student Profile Sheet</h4>
                                <p className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5 tracking-wider font-mono font-sans">ID: {student.uid || student.id}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                {canEdit && (
                                  <button
                                    onClick={() => handleOpenModal(student)}
                                    className="px-3 py-1.5 bg-primary text-white hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md shadow-primary/25 cursor-pointer font-sans"
                                  >
                                    <Edit className="w-3.5 h-3.5" /> Edit Profile
                                  </button>
                                )}
                                <button 
                                  onClick={() => {
                                    const sId = student.uid || student.id;
                                    setExpandedStudentIds(prev => ({ ...prev, [sId]: false }));
                                  }}
                                  className="text-neutral-400 hover:text-neutral-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1 font-sans cursor-pointer"
                                >
                                  <X className="w-4 h-4" /> Close Details
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* Section 1: Academic Profile */}
                              <div className="space-y-3 bg-neutral-50/55 p-4 rounded-xl border border-neutral-100">
                                <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest font-mono">Academic Parameters</h5>
                                <div className="space-y-2 text-xs text-neutral-600">
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Class & Batch:</span>
                                    <span className="font-black text-neutral-700 uppercase">{(classes.find(c => c.id === student.classId)?.name) || student.class || '---'} - {(batches.find(b => b.id === student.batchId)?.name) || student.batch || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Roll Number:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.rollNumber || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Admission No:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.admissionNumber || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">PEN Number:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.penNumber || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">APAR ID:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.aparId || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Date of Admission:</span>
                                    <span className="font-black text-neutral-700">{student.dateOfAdmission || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Previous School:</span>
                                    <span className="font-black text-neutral-700 uppercase truncate max-w-[120px]">{student.previousSchool || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Billing Category:</span>
                                    <span className="font-black text-neutral-700 uppercase">{String(student.feeType || 'day_schooler').replace('_', ' ')}</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-1">
                                    <span className="font-bold text-neutral-400">Status Category:</span>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                      normalizeStudentStatus(student.status) === 'active' 
                                        ? 'bg-emerald-100 text-emerald-800' 
                                        : normalizeStudentStatus(student.status) === 'non_attending'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}>
                                      {normalizeStudentStatus(student.status) === 'active' ? 'Active Student' : normalizeStudentStatus(student.status) === 'non_attending' ? 'Non-Attending' : 'Inactive / Dropped'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Section 2: Personal & Identity */}
                              <div className="space-y-3 bg-neutral-50/55 p-4 rounded-xl border border-neutral-100">
                                <h5 className="text-[10px] font-black text-sky-600 uppercase tracking-widest font-mono">Personal Profile</h5>
                                <div className="space-y-2 text-xs text-neutral-600">
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Gender:</span>
                                    <span className="font-black text-neutral-700 uppercase">{student.gender || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Date of Birth:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.dob || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Blood Group:</span>
                                    <span className="font-black text-neutral-700 font-mono uppercase">{student.bloodGroup || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Aadhar Number:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.aadharNumber || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Nationality:</span>
                                    <span className="font-black text-neutral-700 uppercase">{student.nationality || 'Indian'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Religion:</span>
                                    <span className="font-black text-neutral-700 uppercase">{student.religion || '---'}</span>
                                  </div>
                                  <div className="flex justify-between pb-1">
                                    <span className="font-bold text-neutral-400">Caste / Subcaste:</span>
                                    <span className="font-black text-neutral-700 uppercase truncate max-w-[120px]">{student.studentCaste || '---'} {student.studentSubCaste ? `/ ${student.studentSubCaste}` : ''}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Section 3: Contact & Logistics */}
                              <div className="space-y-3 bg-neutral-50/55 p-4 rounded-xl border border-neutral-100">
                                <h5 className="text-[10px] font-black text-purple-600 uppercase tracking-widest font-mono">Contact & Family</h5>
                                <div className="space-y-2 text-xs text-neutral-600">
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Father's Name:</span>
                                    <span className="font-black text-neutral-700 uppercase">{student.fatherName || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Mother's Name:</span>
                                    <span className="font-black text-neutral-700 uppercase">{student.motherName || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Contact Number:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.phone || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">WhatsApp:</span>
                                    <span className="font-black text-neutral-700 font-mono">{student.whatsappNumber || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Village:</span>
                                    <span className="font-black text-neutral-700 uppercase truncate max-w-[120px]">{student.village || '---'}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                    <span className="font-bold text-neutral-400">Transport:</span>
                                    <span className="font-black text-neutral-700 uppercase">{student.transportType || 'private'}</span>
                                  </div>
                                  {student.transportType === 'bus' && (
                                    <div className="flex justify-between pb-1">
                                      <span className="font-bold text-rose-500">Bus / Route:</span>
                                      <span className="font-black text-rose-700 uppercase">Route #{student.busRoute || '---'}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white rounded-3xl border border-neutral-100 shadow-sm animate-in fade-in duration-200">
          <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider font-mono">
            Showing <span className="text-sidebar font-black">{(safeCurrentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="text-sidebar font-black">
              {Math.min(safeCurrentPage * itemsPerPage, totalItems)}
            </span>{' '}
            of <span className="text-primary font-black">{totalItems}</span> students
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
              className="px-3.5 py-2 rounded-xl border border-neutral-200 text-xs font-black uppercase tracking-wider text-neutral-500 hover:text-sidebar hover:bg-neutral-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-neutral-500 transition-all select-none cursor-pointer flex items-center gap-1"
            >
              ← Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              if (totalPages > 6) {
                if (
                  page !== 1 &&
                  page !== totalPages &&
                  Math.abs(page - safeCurrentPage) > 1
                ) {
                  if (page === 2 || page === totalPages - 1) {
                    return <span key={page} className="px-2 text-neutral-400 font-mono font-bold select-none">...</span>;
                  }
                  return null;
                }
              }

              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`min-w-9 h-9 flex items-center justify-center rounded-xl text-xs font-black font-mono transition-all uppercase select-none cursor-pointer border ${
                    safeCurrentPage === page
                      ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-sidebar'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-3.5 py-2 rounded-xl border border-neutral-200 text-xs font-black uppercase tracking-wider text-neutral-500 hover:text-sidebar hover:bg-neutral-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-neutral-500 transition-all select-none cursor-pointer flex items-center gap-1"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Student 360 View Modal Container */}
      {selectedStudentFor360 && (
        <Student360View 
          student={selectedStudentFor360}
          isOpen={show360View}
          onClose={() => {
            setShow360View(false);
            setSelectedStudentFor360(null);
          }}
        />
      )}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {showDeleteConfirmModal && studentToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-sidebar/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl border border-neutral-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-sidebar">Delete Student Record</h3>
                <p className="text-sm text-neutral-500">
                  Are you sure you want to delete the student record for <span className="font-extrabold text-sidebar">"{studentToDelete.name}"</span>?
                </p>
                <div className="text-xs text-red-500 font-bold bg-red-50/50 p-3 rounded-xl border border-red-100 flex items-center gap-2 justify-center">
                  <span>⚠️ This action is irreversible and cannot be undone.</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-neutral-50 flex justify-end gap-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setStudentToDelete(null);
                }}
                className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition-all text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteStudent}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all text-sm shadow-md"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT STUDENT MODAL DIALOG */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-sidebar/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl border border-neutral-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-neutral-50/50 border-b border-neutral-100 flex justify-between items-center sm:px-8">
              <div>
                <h3 className="text-xl font-bold text-sidebar">
                  {isEditing ? '🖋️ Edit Student Profile' : '👤 Register New Student'}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  {isEditing ? 'Modify student profile settings and details.' : 'Fill primary, academic, and transport settings to create a student.'}
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddModal(false)}
                className="p-2 text-neutral-400 hover:text-neutral-600 rounded-xl hover:bg-neutral-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-neutral-100 bg-neutral-50/30 px-6 sm:px-8">
              {[
                { id: 'personal', name: '📋 Personal Info' },
                { id: 'academic', name: '🎓 Academic Info' },
                { id: 'contact_transport', name: '🚚 Contact & Transport' },
                { id: 'admission_register', name: '📖 Admission Ledger' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalActiveTab(tab.id as any)}
                  className={`py-3 px-4 text-xs font-bold tracking-tight uppercase relative border-b-2 transition-all mr-2 ${
                    modalActiveTab === tab.id 
                      ? 'border-primary text-primary' 
                      : 'border-transparent text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            {/* Modal Form Contained */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
              
              {/* TAB 1: PERSONAL DETAILS */}
              {modalActiveTab === 'personal' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* BEAUTIFUL PORTRAIT / ID PHOTO PICKER */}
                  <div className="md:col-span-2 bg-neutral-50 p-6 rounded-2xl border border-neutral-100 flex flex-col md:flex-row items-center gap-6">
                    {/* Left: ID Card standard aspect template */}
                    <div className="flex flex-col items-center">
                      <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">ID Photo Guide (3:4)</div>
                      <div className="w-28 h-36 bg-white border-4 border-white shadow-md rounded-2xl overflow-hidden relative group">
                        {studentFormData.photoURL ? (
                          <>
                            <img src={studentFormData.photoURL} alt="Student Portrait" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setStudentFormData(prev => ({ ...prev, photoURL: '' }))}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 transition-all opacity-0 group-hover:opacity-100"
                              title="Delete Photo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-100 text-neutral-400">
                            <User className="w-10 h-10 opacity-40 mb-1" />
                            <span className="text-[10px] font-bold">No Image</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Camera and file selectors */}
                    <div className="flex-1 space-y-3 w-full text-center md:text-left">
                      <h4 className="font-extrabold text-[#111827] text-sm">Student Profile Photo</h4>
                      <p className="text-xs text-neutral-500 leading-relaxed">
                        To generate perfect student ID cards, upload a photo or capture a live shot. This helper automatically trims the portrait to standard 3:4 aspect ratio.
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1 justify-center md:justify-start">
                        {/* File Upload Trigger */}
                        <label className="flex items-center gap-1.5 px-4 py-2.5 bg-neutral-900 border border-neutral-950 text-white hover:bg-neutral-800 rounded-xl font-bold text-xs cursor-pointer shadow active:scale-[0.98] transition-all">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Portrait</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handlePhotoUpload}
                          />
                        </label>

                        {/* Native mobile camera capture button */}
                        <label className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-600/10 cursor-pointer active:scale-[0.98] transition-all select-none">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Take Mobile Photo</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            capture="user"
                            className="hidden" 
                            onChange={handlePhotoUpload} 
                          />
                        </label>

                        {/* Live Camera Capture button */}
                        <button
                          type="button"
                          onClick={toggleCamera}
                          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs border shadow-sm active:scale-[0.98] transition-all ${
                            isCameraOpen
                              ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                              : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{isCameraOpen ? 'Turn Off Camera' : 'Live Webcam'}</span>
                        </button>
                      </div>

                      {/* Video streaming view */}
                      {isCameraOpen && (
                        <div className="mt-4 p-4 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-col items-center relative shadow-inner">
                          <div className="relative w-48 h-64 bg-black rounded-xl overflow-hidden shadow border border-neutral-800 flex items-center justify-center">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                            />
                            {/* Guideline Overlay */}
                            <div className="absolute inset-4 border border-dashed border-primary/70 rounded-2xl pointer-events-none flex flex-col items-center justify-center">
                              <div className="w-[70%] aspect-[1/1.2] border border-white/30 rounded-full opacity-60 flex items-center justify-center">
                                <span className="text-[9px] text-white/40 uppercase font-black tracking-widest text-center">Face Guide</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="mt-3 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-extrabold text-xs rounded-xl shadow-lg hover:shadow-primary/25 transition-all flex items-center gap-1.5"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Capture Perfect Profile</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">First Name *</label>
                    <input 
                      type="text"
                      required
                      value={studentFormData.firstName}
                      onChange={(e) => setStudentFormData({ ...studentFormData, firstName: formatNameInput(e.target.value) })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Raju"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Last / Surname Name</label>
                    <input 
                      type="text"
                      value={studentFormData.secondName}
                      onChange={(e) => setStudentFormData({ ...studentFormData, secondName: formatNameInput(e.target.value) })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Manam"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Father's Name</label>
                    <input 
                      type="text"
                      value={studentFormData.fatherName}
                      onChange={(e) => setStudentFormData({ ...studentFormData, fatherName: formatNameInput(e.target.value) })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Father's Full Name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Father's Occupation</label>
                    <input 
                      type="text"
                      value={studentFormData.fatherOccupation}
                      onChange={(e) => setStudentFormData({ ...studentFormData, fatherOccupation: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Business, Farmer, at etc."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Mother's Name</label>
                    <input 
                      type="text"
                      value={studentFormData.motherName}
                      onChange={(e) => setStudentFormData({ ...studentFormData, motherName: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Mother's Full Name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Mother Tongue</label>
                    <input 
                      type="text"
                      value={studentFormData.motherTongue}
                      onChange={(e) => setStudentFormData({ ...studentFormData, motherTongue: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Telugu, English, Hindi"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Nationality</label>
                    <input 
                      type="text"
                      value={studentFormData.nationality}
                      onChange={(e) => setStudentFormData({ ...studentFormData, nationality: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Indian"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Gender</label>
                    <select
                      value={studentFormData.gender}
                      onChange={(e) => setStudentFormData({ ...studentFormData, gender: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Date of Birth</label>
                    <input 
                      type="date"
                      value={studentFormData.dob}
                      onChange={(e) => setStudentFormData({ ...studentFormData, dob: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Blood Group</label>
                    <SearchableSelect
                      value={studentFormData.bloodGroup}
                      onChange={(val) => setStudentFormData({ ...studentFormData, bloodGroup: val })}
                      options={BLOOD_GROUPS.map(bg => ({ value: bg, label: bg }))}
                      placeholder="Search or Select Blood Group"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Caste / Category</label>
                    <SearchableSelect
                      value={studentFormData.studentCaste}
                      onChange={(val) => {
                        setStudentFormData({
                          ...studentFormData,
                          studentCaste: val,
                          studentSubCaste: '' // reset subcaste on category change
                        });
                      }}
                      options={AP_CASTES.map(c => ({ value: c.value, label: c.label }))}
                      placeholder="Search or Select Caste / Category"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Sub-Caste</label>
                    <SearchableSelect
                      value={
                        studentFormData.studentSubCaste &&
                        studentFormData.studentCaste &&
                        !(AP_SUB_CASTES[studentFormData.studentCaste] || []).includes(studentFormData.studentSubCaste)
                          ? 'Other'
                          : (studentFormData.studentSubCaste || '')
                      }
                      onChange={(val) => {
                        if (val === 'Other') {
                          setStudentFormData({ ...studentFormData, studentSubCaste: 'Custom Sub-Caste' });
                        } else {
                          setStudentFormData({ ...studentFormData, studentSubCaste: val });
                        }
                      }}
                      disabled={!studentFormData.studentCaste}
                      options={[
                        ...(studentFormData.studentCaste
                          ? (AP_SUB_CASTES[studentFormData.studentCaste] || []).map(sub => ({ value: sub, label: sub }))
                          : []),
                        ...(studentFormData.studentCaste ? [{ value: 'Other', label: 'Other (Type custom sub-caste)' }] : [])
                      ]}
                      placeholder={studentFormData.studentCaste ? "Search or Select Sub-Caste" : "Select Caste/Category first"}
                    />
                    {(studentFormData.studentSubCaste === 'Custom Sub-Caste' ||
                      (studentFormData.studentSubCaste &&
                        studentFormData.studentCaste &&
                        !(AP_SUB_CASTES[studentFormData.studentCaste] || []).includes(studentFormData.studentSubCaste))) && (
                      <input 
                        type="text"
                        value={studentFormData.studentSubCaste === 'Custom Sub-Caste' ? '' : studentFormData.studentSubCaste}
                        onChange={(e) => setStudentFormData({ ...studentFormData, studentSubCaste: e.target.value })}
                        className="w-full mt-2 px-4 py-2 bg-white border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[13px]"
                        placeholder="Type custom sub-caste"
                        autoFocus
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Religion</label>
                    <SearchableSelect
                      value={studentFormData.religion}
                      onChange={(val) => setStudentFormData({ ...studentFormData, religion: val })}
                      options={RELIGIONS.map(rel => ({ value: rel, label: rel }))}
                      placeholder="Search or Select Religion"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Student Aadhar Number</label>
                    <input 
                      type="text"
                      maxLength={12}
                      value={studentFormData.aadharNumber}
                      onChange={(e) => {
                        const numericVal = e.target.value.replace(/\D/g, '');
                        setStudentFormData({ ...studentFormData, aadharNumber: numericVal });
                      }}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="12 digit numeric Aadhar ID"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: ACADEMIC DETAILS */}
              {modalActiveTab === 'academic' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Admission Number</label>
                    <input 
                      type="text"
                      value={studentFormData.admissionNumber}
                      onChange={(e) => setStudentFormData({ ...studentFormData, admissionNumber: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Admission Ref ID"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Date of Admission</label>
                    <input 
                      type="date"
                      value={studentFormData.dateOfAdmission}
                      onChange={(e) => setStudentFormData({ ...studentFormData, dateOfAdmission: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Roll Number</label>
                    <input 
                      type="text"
                      value={studentFormData.rollNumber}
                      onChange={(e) => setStudentFormData({ ...studentFormData, rollNumber: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Roll Number"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Academic Year *</label>
                    <select
                      value={studentFormData.academicYear}
                      onChange={(e) => setStudentFormData({ ...studentFormData, academicYear: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700"
                    >
                      {settings.academicYears?.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Class *</label>
                    <select
                      value={studentFormData.classId}
                      required
                      onChange={(e) => {
                        const cId = e.target.value;
                        setStudentFormData({ ...studentFormData, classId: cId, batchId: '' });
                      }}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 font-bold"
                    >
                      <option value="">-- Choose Class --</option>
                      {availableClasses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Batch / Section *</label>
                    <select
                      value={studentFormData.batchId}
                      required
                      disabled={!studentFormData.classId}
                      onChange={(e) => setStudentFormData({ ...studentFormData, batchId: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 font-bold"
                    >
                      <option value="">-- Choose Batch --</option>
                      {batches
                        .filter(b => b.classId === studentFormData.classId)
                        .map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))
                      }
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Status</label>
                    <select
                      value={studentFormData.status}
                      onChange={(e) => setStudentFormData({ ...studentFormData, status: e.target.value as any })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700"
                    >
                      <option value="active">Active</option>
                      <option value="non_attending">Non-Attending Student</option>
                      <option value="inactive">Inactive / Dropped</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Child ID (State Portal ID)</label>
                    <input 
                      type="text"
                      value={studentFormData.childId}
                      onChange={(e) => setStudentFormData({ ...studentFormData, childId: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Child State ID Ref"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">PEN Number</label>
                    <input 
                      type="text"
                      value={studentFormData.penNumber}
                      onChange={(e) => setStudentFormData({ ...studentFormData, penNumber: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Permanent Education Number"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">APAR ID</label>
                    <input 
                      type="text"
                      value={studentFormData.aparId}
                      onChange={(e) => setStudentFormData({ ...studentFormData, aparId: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Automated Permanent Academic Reg ID"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Ration Card Number</label>
                    <input 
                      type="text"
                      value={studentFormData.rationCardNumber}
                      onChange={(e) => setStudentFormData({ ...studentFormData, rationCardNumber: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="White / Pink Ration Card Ref"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Previous Studied School</label>
                    <input 
                      type="text"
                      value={studentFormData.previousSchool}
                      onChange={(e) => setStudentFormData({ ...studentFormData, previousSchool: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Govt Primary School, Hyd"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Fee Concession Type</label>
                    <select
                      disabled={
                        isTeacherPortal || 
                        profile?.role === 'clerk' || 
                        (!isAdmin && profile?.role !== 'admin' && (
                          (isEditing && initialConcessions.feeConcessionType !== '') || 
                          (studentFormData.admissionConcessionType !== '')
                        ))
                      }
                      value={studentFormData.feeConcessionType}
                      onChange={(e) => setStudentFormData({ ...studentFormData, feeConcessionType: e.target.value, feeConcessionAmount: e.target.value === 'custom' ? studentFormData.feeConcessionAmount : 0 })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 disabled:opacity-50 disabled:bg-neutral-100"
                    >
                      <option value="">No Concession Applied</option>
                      <option value="custom">Custom Flat Waiver (₹ - Fixed)</option>
                      {concessions.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.type === 'percentage' ? `${c.value}%` : `₹${c.value}`})</option>
                      ))}
                    </select>
                    {studentFormData.admissionConcessionType && (
                      <p className="text-[11px] text-amber-600 font-bold mt-1.5 flex items-center gap-1">
                        <span>{isAdmin || profile?.role === 'admin' ? '🔓 Override Active (Admin can edit)' : '⚠️ Admission concession is already assigned'}</span>
                      </p>
                    )}
                    {isEditing && initialConcessions.feeConcessionType !== '' && (
                      <p className="text-[11px] text-rose-500 font-bold mt-1.5 flex items-center gap-1">
                        <span>{isAdmin || profile?.role === 'admin' ? '🔓 Override Active (Admin can edit)' : '🔒 Regular concession is locked (assigned)'}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Custom Wave Amount (₹)</label>
                    <input 
                      type="number"
                      disabled={
                        isTeacherPortal || 
                        profile?.role === 'clerk' || 
                        (!isAdmin && profile?.role !== 'admin' && (
                          (isEditing && initialConcessions.feeConcessionType !== '') || 
                          (studentFormData.admissionConcessionType !== '')
                        )) || 
                        studentFormData.feeConcessionType !== 'custom'
                      }
                      value={studentFormData.feeConcessionAmount}
                      onChange={(e) => setStudentFormData({ ...studentFormData, feeConcessionAmount: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] disabled:opacity-50 disabled:bg-neutral-100"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Admission Fee Concession Type</label>
                    <select
                      disabled={
                        !canSetAdmissionConcession || 
                        isTeacherPortal || 
                        profile?.role === 'clerk' || 
                        (!isAdmin && profile?.role !== 'admin' && (
                          (isEditing && initialConcessions.admissionConcessionType !== '') || 
                          (studentFormData.feeConcessionType !== '')
                        ))
                      }
                      value={studentFormData.admissionConcessionType || ''}
                      onChange={(e) => setStudentFormData({ ...studentFormData, admissionConcessionType: e.target.value, admissionConcessionAmount: e.target.value === 'custom' ? studentFormData.admissionConcessionAmount : 0 })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 disabled:opacity-50 disabled:bg-neutral-100"
                    >
                      <option value="">No Concession Applied</option>
                      <option value="custom">Custom Flat Waiver (₹ - Fixed)</option>
                      {concessions.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.type === 'percentage' ? `${c.value}%` : `₹${c.value}`})</option>
                      ))}
                    </select>
                    {studentFormData.feeConcessionType && (
                      <p className="text-[11px] text-amber-600 font-bold mt-1.5 flex items-center gap-1">
                        <span>{isAdmin || profile?.role === 'admin' ? '🔓 Override Active (Admin can edit)' : '⚠️ Regular fee concession is already assigned'}</span>
                      </p>
                    )}
                    {isEditing && initialConcessions.admissionConcessionType !== '' && (
                      <p className="text-[11px] text-rose-500 font-bold mt-1.5 flex items-center gap-1">
                        <span>{isAdmin || profile?.role === 'admin' ? '🔓 Override Active (Admin can edit)' : '🔒 Admission concession is locked (assigned)'}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Admission Cust. Wave Amount (₹)</label>
                    <input 
                      type="number"
                      disabled={
                        !canSetAdmissionConcession || 
                        isTeacherPortal || 
                        profile?.role === 'clerk' || 
                        (isEditing && initialConcessions.admissionConcessionType !== '') || 
                        (studentFormData.feeConcessionType !== '') || 
                        studentFormData.admissionConcessionType !== 'custom'
                      }
                      value={studentFormData.admissionConcessionAmount || 0}
                      onChange={(e) => setStudentFormData({ ...studentFormData, admissionConcessionAmount: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] disabled:opacity-50 disabled:bg-neutral-100"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Last Academic Year Fees / Old Fees Due (₹)</label>
                    <input 
                      type="number"
                      value={studentFormData.lastClassFeeDue || ''}
                      onChange={(e) => setStudentFormData({ ...studentFormData, lastClassFeeDue: Number(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Old Fees Concession Amount (₹)</label>
                    <input 
                      type="number"
                      value={studentFormData.oldFeeConcession || ''}
                      onChange={(e) => setStudentFormData({ ...studentFormData, oldFeeConcession: Number(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-amber-50/50 border border-amber-200 focus:border-amber-500 focus:bg-white rounded-xl outline-none transition-all font-mono font-bold text-[14px]"
                      placeholder="0"
                    />
                    <p className="text-[11px] text-amber-600 font-bold uppercase mt-1 font-mono">
                      Concession to be applied to the Previous Academic Year Dues balance only.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 3: CONTACT & TRANSPORT */}
              {modalActiveTab === 'contact_transport' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Primary Contact Phone</label>
                    <input 
                      type="tel"
                      value={studentFormData.phone}
                      onChange={(e) => setStudentFormData({ ...studentFormData, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Parent primary phone"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">WhatsApp Number (10 Numbers Only)</label>
                    <input 
                      type="tel"
                      maxLength={10}
                      value={studentFormData.whatsappNumber}
                      onChange={(e) => {
                        const numericVal = e.target.value.replace(/\D/g, '');
                        setStudentFormData({ ...studentFormData, whatsappNumber: numericVal });
                      }}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="10 digit number (+91 auto-prepended on save)"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Father Aadhar ID</label>
                    <input 
                      type="text"
                      maxLength={12}
                      value={studentFormData.fatherAadhar}
                      onChange={(e) => {
                        const numericVal = e.target.value.replace(/\D/g, '');
                        setStudentFormData({ ...studentFormData, fatherAadhar: numericVal });
                      }}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="12 digit Father Aadhar ID"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Mother Aadhar ID</label>
                    <input 
                      type="text"
                      maxLength={12}
                      value={studentFormData.motherAadhar}
                      onChange={(e) => {
                        const numericVal = e.target.value.replace(/\D/g, '');
                        setStudentFormData({ ...studentFormData, motherAadhar: numericVal });
                      }}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="12 digit Mother Aadhar ID"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Email Address</label>
                    <input 
                      type="email"
                      value={studentFormData.email}
                      onChange={(e) => setStudentFormData({ ...studentFormData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Parent email"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Mother's Bank Details</label>
                    <input 
                      type="text"
                      value={studentFormData.motherBankDetails}
                      onChange={(e) => setStudentFormData({ ...studentFormData, motherBankDetails: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., State Bank, Acc: xxxx, IFSC: xxxx"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Fee Type</label>
                    <select
                      value={studentFormData.feeType}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setStudentFormData(prev => ({
                          ...prev,
                          feeType: val,
                          ...(val === 'hostel' ? { transportType: 'private', busRoute: '', transportStopId: '' } : {})
                        }));
                      }}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 font-bold"
                    >
                      <option value="day_schooler">Day Schooler</option>
                      <option value="hostel">Hostel Resident</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                      Transport Type {studentFormData.feeType === 'hostel' && <span className="text-red-500 text-[10px] normal-case font-medium">(Not available for hostelers)</span>}
                    </label>
                    <select
                      value={studentFormData.transportType}
                      disabled={studentFormData.feeType === 'hostel'}
                      onChange={(e) => setStudentFormData({ ...studentFormData, transportType: e.target.value as any })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="private">Private (Self Arrangement)</option>
                      <option value="school">School Bus Arrangement</option>
                    </select>
                  </div>

                  {studentFormData.transportType === 'school' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">School Bus Route</label>
                        <select
                          value={studentFormData.busRoute}
                          onChange={(e) => setStudentFormData({ ...studentFormData, busRoute: e.target.value, transportStopId: '' })}
                          className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 font-bold"
                        >
                          <option value="">-- Select Bus Route --</option>
                          {buses.map(bus => (
                            <option key={bus.id} value={bus.id}>{bus.busNumber} ({bus.driverName})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Boarding Stop / Village Stop</label>
                        <select
                          value={studentFormData.transportStopId}
                          disabled={!studentFormData.busRoute}
                          onChange={(e) => {
                            const stopItem = stops.find(s => s.id === e.target.value);
                            setStudentFormData({ 
                              ...studentFormData, 
                              transportStopId: e.target.value,
                              village: stopItem ? stopItem.villageName : studentFormData.village
                            });
                          }}
                          className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700 font-bold"
                        >
                          <option value="">-- Choose Stop --</option>
                          {stops
                            .filter(s => s.busId === studentFormData.busRoute)
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.villageName} - ₹{Number(s.fee).toLocaleString()}</option>
                            ))
                          }
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Village / Location</label>
                    <input 
                      type="text"
                      value={studentFormData.village}
                      onChange={(e) => setStudentFormData({ ...studentFormData, village: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Village Name"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Residential Address</label>
                    <textarea 
                      rows={3}
                      value={studentFormData.address}
                      onChange={(e) => setStudentFormData({ ...studentFormData, address: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Detailed address layout..."
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: ADMISSION REGISTER LEDGER DETAILS */}
              {modalActiveTab === 'admission_register' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2 border-b border-neutral-100 pb-2 mb-2">
                    <h4 className="text-sm font-bold text-neutral-800">🏛️ Ledger & Identity Invariants</h4>
                    <p className="text-xs text-neutral-500">Essential details for the official Admission Register booklet.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">State of Origin</label>
                    <input 
                      type="text"
                      value={studentFormData.state}
                      onChange={(e) => setStudentFormData({ ...studentFormData, state: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., ANDHRA PRADESH"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Mother Tongue</label>
                    <input 
                      type="text"
                      value={studentFormData.motherTongue}
                      onChange={(e) => setStudentFormData({ ...studentFormData, motherTongue: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., TELUGU"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Religion</label>
                    <input 
                      type="text"
                      value={studentFormData.religion}
                      onChange={(e) => setStudentFormData({ ...studentFormData, religion: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., HINDU"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Caste / Category</label>
                    <input 
                      type="text"
                      value={studentFormData.studentCaste}
                      onChange={(e) => setStudentFormData({ ...studentFormData, studentCaste: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., BC-D"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Sub-Caste</label>
                    <input 
                      type="text"
                      value={studentFormData.studentSubCaste}
                      onChange={(e) => setStudentFormData({ ...studentFormData, studentSubCaste: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., YADAVA"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Nationality</label>
                    <input 
                      type="text"
                      value={studentFormData.nationality}
                      onChange={(e) => setStudentFormData({ ...studentFormData, nationality: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., INDIAN"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Previous Studied School</label>
                    <input 
                      type="text"
                      value={studentFormData.previousSchool}
                      onChange={(e) => setStudentFormData({ ...studentFormData, previousSchool: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Govt Primary School"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Parent/Father Occupation</label>
                    <input 
                      type="text"
                      value={studentFormData.fatherOccupation}
                      onChange={(e) => setStudentFormData({ ...studentFormData, fatherOccupation: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., AGRICULTURIST"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Date of Admission</label>
                    <input 
                      type="date"
                      value={studentFormData.dateOfAdmission}
                      onChange={(e) => setStudentFormData({ ...studentFormData, dateOfAdmission: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Medium of Instruction</label>
                    <select
                      value={studentFormData.reg_mediumOfInstruction}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_mediumOfInstruction: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700"
                    >
                      <option value="ENGLISH">ENGLISH</option>
                      <option value="TELUGU">TELUGU</option>
                      <option value="HINDI">HINDI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Record Sheet / T.C. Produced</label>
                    <select
                      value={studentFormData.reg_recordSheetProduced}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_recordSheetProduced: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700"
                    >
                      <option value="YES">YES</option>
                      <option value="NO">NO</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Details of T.C. Produced</label>
                    <input 
                      type="text"
                      value={studentFormData.reg_tcProducedDetails}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_tcProducedDetails: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., T.C. No 123 dt 12/05/2025"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Small Pox / Vaccination Protected</label>
                    <select
                      value={studentFormData.reg_smallPoxProtected}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_smallPoxProtected: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] text-neutral-700"
                    >
                      <option value="YES">YES</option>
                      <option value="NO">NO</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Identification Mark 1</label>
                    <input 
                      type="text"
                      value={studentFormData.reg_marksOfId1}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_marksOfId1: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., A mole on the neck"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Identification Mark 2</label>
                    <input 
                      type="text"
                      value={studentFormData.reg_marksOfId2}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_marksOfId2: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., A scar on the left arm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Headmaster Initials / Signature (Admission)</span>
                      {uploadingSigAdm && <span className="text-xs text-primary animate-pulse">Uploading signature...</span>}
                    </label>
                    <div className="space-y-3 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl">
                      {/* If the current value is a signature image URL or dataURI */}
                      {(studentFormData.reg_hmInitialAdmission?.startsWith('http') || studentFormData.reg_hmInitialAdmission?.startsWith('data:image/')) ? (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 bg-white p-3 rounded-xl relative group">
                          <img 
                            src={normalizeUrl(studentFormData.reg_hmInitialAdmission)} 
                            alt="Admission HM Signature" 
                            className="h-16 object-contain"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => setStudentFormData({ ...studentFormData, reg_hmInitialAdmission: '' })}
                            className="absolute top-2 right-2 p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-1">Digital Signature Scan</span>
                        </div>
                      ) : (
                        <input 
                          type="text"
                          value={studentFormData.reg_hmInitialAdmission || ''}
                          onChange={(e) => setStudentFormData({ ...studentFormData, reg_hmInitialAdmission: e.target.value })}
                          className="w-full px-4 py-3 bg-white border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[14px]"
                          placeholder="Type initials or upload scan below"
                        />
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" />
                          Upload Signature Image
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
                            onClick={() => setStudentFormData({ ...studentFormData, reg_hmInitialAdmission: settings.hmSignatureUrl })}
                            className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                          >
                            Use Global Signature
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 border-b border-neutral-100 pb-2 mt-2 mb-2">
                    <h4 className="text-sm font-bold text-neutral-800">🚶 Leaving & TC Information</h4>
                    <p className="text-xs text-neutral-500">Fill this only when student is leaving or has left the institution.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Class on Leaving</label>
                    <input 
                      type="text"
                      value={studentFormData.reg_classOnLeaving}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_classOnLeaving: e.target.value })}
                      className="w-full px-4 py-3 bg-[#f9fafb] border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Class X"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Reason for Leaving</label>
                    <input 
                      type="text"
                      value={studentFormData.reg_reasonForLeaving}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_reasonForLeaving: e.target.value })}
                      className="w-full px-4 py-3 bg-[#f9fafb] border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., Completed Course, Relocation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Leaving Date</label>
                    <input 
                      type="date"
                      value={studentFormData.dropDate || ''}
                      onChange={(e) => setStudentFormData({ ...studentFormData, dropDate: e.target.value })}
                      className="w-full px-4 py-3 bg-[#f9fafb] border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">TC Date & Serial Number</label>
                    <input 
                      type="text"
                      value={studentFormData.reg_tcDetailsIssued}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_tcDetailsIssued: e.target.value })}
                      className="w-full px-4 py-3 bg-[#f9fafb] border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="e.g., TC No 45 dt 15/06/2026"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">School to Which Gone</label>
                    <input 
                      type="text"
                      value={studentFormData.reg_schoolToWhichGone}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_schoolToWhichGone: e.target.value })}
                      className="w-full px-4 py-3 bg-[#f9fafb] border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Next Institution Name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Headmaster Initials / Signature (Leaving)</span>
                      {uploadingSigLv && <span className="text-xs text-primary animate-pulse">Uploading signature...</span>}
                    </label>
                    <div className="space-y-3 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl">
                      {/* If the current value is a signature image URL or dataURI */}
                      {(studentFormData.reg_hmInitialLeaving?.startsWith('http') || studentFormData.reg_hmInitialLeaving?.startsWith('data:image/')) ? (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 bg-white p-3 rounded-xl relative group">
                          <img 
                            src={normalizeUrl(studentFormData.reg_hmInitialLeaving)} 
                            alt="Leaving HM Signature" 
                            className="h-16 object-contain"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => setStudentFormData({ ...studentFormData, reg_hmInitialLeaving: '' })}
                            className="absolute top-2 right-2 p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-1">Digital Signature Scan</span>
                        </div>
                      ) : (
                        <input 
                          type="text"
                          value={studentFormData.reg_hmInitialLeaving || ''}
                          onChange={(e) => setStudentFormData({ ...studentFormData, reg_hmInitialLeaving: e.target.value })}
                          className="w-full px-4 py-3 bg-white border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[14px]"
                          placeholder="Type initials or upload scan below"
                        />
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" />
                          Upload Signature Image
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
                            onClick={() => setStudentFormData({ ...studentFormData, reg_hmInitialLeaving: settings.hmSignatureUrl })}
                            className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                          >
                            Use Global Signature
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Ledger Page Remarks</label>
                    <textarea 
                      rows={2}
                      value={studentFormData.reg_remarks}
                      onChange={(e) => setStudentFormData({ ...studentFormData, reg_remarks: e.target.value })}
                      className="w-full px-4 py-3 bg-[#f9fafb] border border-neutral-200 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-medium text-[14px]"
                      placeholder="Any official administrative remarks..."
                    />
                  </div>
                </div>
              )}

            </form>

            {/* Modal Bottom Action Bar */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex justify-end items-center gap-3 sm:px-8">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-all text-xs uppercase font-extrabold tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFormSubmit}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-primary text-white hover:bg-primary/95 shadow-md active:scale-95 transition-all text-xs uppercase font-extrabold tracking-wider flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? 'Processing...' : (isEditing ? 'Save Changes' : 'Register Student')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Preview Tab Modal */}
      {showImportPreview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-sidebar/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-neutral-100">
            <div className="px-6 py-5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-neutral-800">CSV Student Import Preview</h3>
                <p className="text-xs text-neutral-500">Previewing {importRows.length} parsed profiles to import. Please check classes/batches assignment.</p>
              </div>
              <button 
                onClick={() => setShowImportPreview(false)}
                className="p-1.5 hover:bg-neutral-150 rounded-lg text-neutral-400 hover:text-neutral-600 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="overflow-x-auto border border-neutral-200 rounded-xl font-sans">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 font-bold text-neutral-500 text-xs border-b border-neutral-200">
                      <th className="p-3">Admn No</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Father Name</th>
                      <th className="p-3">Class/Batch Match</th>
                      <th className="p-3">Caste/Religion</th>
                      <th className="p-3">Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 50).map((row, idx) => {
                      const cName = classes.find(c => c.id === row.classId)?.name || row.classId || 'Not found';
                      const bName = batches.find(b => b.id === row.batchId)?.name || row.batchId || 'Not found';
                      return (
                        <tr key={idx} className="border-b border-neutral-150 text-xs text-neutral-600 font-medium">
                          <td className="p-3 font-bold text-neutral-800">{row.admissionNumber}</td>
                          <td className="p-3">
                            <div>{row.name}</div>
                            <div className="text-[10px] text-neutral-400 capitalize">{row.gender} • DOB {row.dob || 'N/A'}</div>
                          </td>
                          <td className="p-3">{row.fatherName || 'N/A'}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-neutral-100 rounded text-neutral-700 font-bold">{cName}</span>
                            <span className="ml-1 px-2 py-0.5 bg-neutral-100 rounded text-neutral-700 font-bold">{bName}</span>
                          </td>
                          <td className="p-3">
                            <div className="capitalize">{row.studentCaste || 'N/A'} {row.studentSubCaste ? `(${row.studentSubCaste})` : ''}</div>
                            <div className="text-[10px] text-neutral-400">{row.religion || 'N/A'} • {row.nationality}</div>
                          </td>
                          <td className="p-3">
                            <div>{row.phone || row.whatsappNumber || 'N/A'}</div>
                            <div className="text-[10px] text-neutral-400">{row.village || 'N/A'}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {importRows.length > 50 && (
                <p className="text-center font-bold text-xs text-neutral-400 mt-3 italic">And {importRows.length - 50} other student records...</p>
              )}
            </div>

            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex justify-end gap-3 items-center">
              <button
                type="button"
                onClick={() => setShowImportPreview(false)}
                className="px-5 py-2.5 rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-all text-xs uppercase font-extrabold tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeBulkImport}
                disabled={importLoading}
                className="px-5 py-2.5 rounded-xl bg-primary text-white hover:bg-primary/95 shadow-md active:scale-95 transition-all text-xs uppercase font-extrabold tracking-wider flex items-center gap-1.5"
              >
                {importLoading ? 'Importing...' : `Confirm Import ${importRows.length} Students`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Export Dialog Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-sidebar/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-neutral-100">
            <div className="px-6 py-5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-neutral-800">Custom Students Export Engine</h3>
                <p className="text-xs text-neutral-500">Filter students and select custom columns to build tailored reports.</p>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="p-1.5 hover:bg-neutral-150 rounded-lg text-neutral-400 hover:text-neutral-600 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Category 1: Filters */}
              <div>
                <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-3 font-mono">1. Select Target Export Filters</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Class Wise</label>
                    <select
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[13px]"
                      value={exportFilters.classId}
                      onChange={(e) => setExportFilters({ ...exportFilters, classId: e.target.value, batchId: '' })}
                    >
                      <option value="">All Classes</option>
                      {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Batch Wise</label>
                    <select
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[13px] disabled:opacity-50"
                      value={exportFilters.batchId}
                      disabled={!exportFilters.classId}
                      onChange={(e) => setExportFilters({ ...exportFilters, batchId: e.target.value })}
                    >
                      <option value="">All Batches</option>
                      {exportAvailableBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Transport Route Wise</label>
                    <select
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[13px]"
                      value={exportFilters.busRoute}
                      onChange={(e) => setExportFilters({ ...exportFilters, busRoute: e.target.value })}
                    >
                      <option value="">All Bus Routes</option>
                      {buses.map(b => <option key={b.id} value={b.id}>Bus: {b.busNumber} ({b.driverName})</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Hostel residency Wise</label>
                    <select
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[13px]"
                      value={exportFilters.feeType}
                      onChange={(e) => setExportFilters({ ...exportFilters, feeType: e.target.value })}
                    >
                      <option value="all">All Fee Types (Day / Hostel)</option>
                      <option value="day_schooler">Day Schooler Only</option>
                      <option value="hostel">Hostel Residents Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Village / Stop Wise</label>
                    <select
                      className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[13px]"
                      value={exportFilters.village}
                      onChange={(e) => setExportFilters({ ...exportFilters, village: e.target.value })}
                    >
                      <option value="">All Villages/Stops</option>
                      {Array.from(new Set(
                        students
                          .flatMap(s => [s.village?.trim(), s.villageName?.trim()])
                          .filter((v): v is string => typeof v === 'string' && v.length > 0)
                      )).sort().map(village => (
                        <option key={village} value={village}>{village}</option>
                      ))}
                    </select>
                  </div>

                  {(!isTeacherPortal && !isTeacherRole) && (
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Admission Status</label>
                      <select
                        className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-primary rounded-xl outline-none transition-all font-medium text-[13px]"
                        value={exportFilters.status}
                        onChange={(e) => setExportFilters({ ...exportFilters, status: e.target.value })}
                      >
                        <option value="all">Active, Non-Attending and Inactive</option>
                        <option value="active_and_non_attending">Active & Non-Attending</option>
                        <option value="active">Active Only</option>
                        <option value="non_attending">Non-Attending Only</option>
                        <option value="inactive">Inactive / Dropped Only</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Category 2: Choose columns */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest font-mono">2. Select Export Columns ({Object.values(exportSelectedFields).filter(Boolean).length} Selected)</h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const allOn = Object.keys(exportSelectedFields).reduce((acc, k) => ({ ...acc, [k]: true }), {});
                        setExportSelectedFields(allOn);
                      }}
                      className="text-[11px] font-extrabold text-primary hover:underline uppercase text-sidebar hover:text-primary transition-all cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button 
                      onClick={() => {
                        const allOff = Object.keys(exportSelectedFields).reduce((acc, k) => ({ ...acc, [k]: false }), {});
                        setExportSelectedFields(allOff);
                      }}
                      className="text-[11px] font-extrabold text-neutral-400 hover:underline uppercase hover:text-sidebar transition-all cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded-xl border border-neutral-100 max-h-[220px] overflow-y-auto font-sans">
                  {Object.keys(exportSelectedFields).map((f) => {
                    let readableName = f
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, (str) => str.toUpperCase());

                    if (f === 'term1Due') readableName = 'Term 1 Due';
                    else if (f === 'term2Due') readableName = 'Term 2 Due';
                    else if (f === 'term3Due') readableName = 'Term 3 Due';
                    else if (f === 'prevYearFeeDue') readableName = 'Prev Year Fee Due';
                    else if (f === 'admissionFeeDue') readableName = 'Admission Fee Due';
                    else if (f === 'iplFeeDue') readableName = 'IPL Fee Due';
                    else if (f === 'healthCardFeeDue') readableName = 'Health Card Due';
                    else if (f === 'totalFeeDue') readableName = 'Total Fee Due';
                    else if (f === 'concessionTypeWise') readableName = 'Concessions Breakdown';
                    else if (f === 'uniqueStudentId') readableName = 'Unique Student ID';
                    else if (f === 'feeConcessionType') readableName = 'Fee Concession Type';
                    else if (f === 'nonAttending') readableName = 'Non-Attending Students';

                    return (
                      <label key={f} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded transition-all">
                        <input
                          type="checkbox"
                          className="rounded text-primary focus:ring-primary w-4 h-4 border-neutral-300"
                          checked={exportSelectedFields[f]}
                          onChange={(e) => setExportSelectedFields({ ...exportSelectedFields, [f]: e.target.checked })}
                        />
                        <span className="text-[11px] font-bold text-neutral-600 truncate capitalize">{readableName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex justify-between items-center h-16 sm:px-8">
              <span className="text-xs font-bold text-neutral-500 font-sans">
                Matched count: {
                  students.filter(s => {
                    if (exportFilters.classId && s.classId !== exportFilters.classId) return false;
                    if (exportFilters.batchId && s.batchId !== exportFilters.batchId) return false;
                    if (exportFilters.busRoute && (!s.busRoute || !s.busRoute.toLowerCase().includes(exportFilters.busRoute.toLowerCase()))) return false;
                    if (exportFilters.feeType !== 'all' && s.feeType !== exportFilters.feeType) return false;
                    if (exportFilters.village && (!s.village || !s.village.toLowerCase().includes(exportFilters.village.toLowerCase()))) return false;
                    if (isTeacherPortal || isTeacherRole) {
                      if ((s.status || 'active') !== 'active') return false;
                    } else if (exportFilters.status !== 'all') {
                      const sStatus = s.status || 'active';
                      if (exportFilters.status === 'active_and_non_attending') {
                        if (sStatus !== 'active' && sStatus !== 'non_attending') return false;
                      } else {
                        if (sStatus !== exportFilters.status) return false;
                      }
                    }
                    return true;
                  }).length
                } matches
              </span>
              <div className="flex gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-all text-xs uppercase font-extrabold tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white flex items-center gap-1.5 text-xs uppercase font-extrabold tracking-wider shadow-md active:scale-95 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Generate CSV Export</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportA4PDF}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-xs uppercase font-extrabold tracking-wider shadow-md active:scale-95 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Generate A4 PDF Export</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sibling Groups Selector Portal Modal */}
      {showSiblingModal && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl border border-neutral-100 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-neutral-800 tracking-tight">Sibling Connection Portal</h3>
                  <p className="text-xs text-neutral-400 font-bold font-mono uppercase tracking-wider">Automated Family Clustering Engine</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSiblingModal(false);
                  setSiblingSearchQuery('');
                }}
                className="w-10 h-10 rounded-xl hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-all border border-neutral-200/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto flex-1 space-y-6">
              {/* Informative Explanation Tooltip Banner */}
              <div className="bg-rose-50/30 border border-rose-200/30 p-5 rounded-2xl flex gap-4">
                <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-extrabold text-rose-950">How Sibling Relationships are Identified</p>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Our platform automatically scans and matches student records using three distinct parameters: **Father's Name**, **Primary Mobile Number / Contact Number**, and **Parent Email Address**. A relationship is established only when **at least two of these matching parameters** are successfully verified between students.
                  </p>
                </div>
              </div>

              {/* Real-time Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-neutral-50 p-5 rounded-2xl border border-neutral-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest font-mono">Total Families</span>
                    <p className="text-2xl font-extrabold text-neutral-800 mt-0.5">{siblingGroups.length}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold text-sm">
                    {siblingGroups.length}
                  </div>
                </div>

                <div className="bg-neutral-50 p-5 rounded-2xl border border-neutral-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest font-mono">Connected Students</span>
                    <p className="text-2xl font-extrabold text-neutral-800 mt-0.5">
                      {siblingGroups.reduce((acc, g) => acc + g.length, 0)}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 font-bold text-sm font-mono">
                    {siblingGroups.reduce((acc, g) => acc + g.length, 0)}
                  </div>
                </div>

                <div className="bg-neutral-50 p-5 rounded-2xl border border-neutral-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest font-mono">Average Group Size</span>
                    <p className="text-2xl font-extrabold text-neutral-800 mt-0.5">
                      {siblingGroups.length > 0 
                        ? (siblingGroups.reduce((acc, g) => acc + g.length, 0) / siblingGroups.length).toFixed(1) 
                        : '0.0'}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-bold text-sm font-mono">
                    kids
                  </div>
                </div>
              </div>

              {/* Action Filters and Download Controls */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:max-w-md">
                  <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search families by name, phone, email, or village..."
                    className="w-full pl-11 pr-4 py-3 bg-neutral-50 rounded-xl border border-neutral-200 outline-none focus:border-rose-500 transition-all font-bold text-sm"
                    value={siblingSearchQuery}
                    onChange={(e) => setSiblingSearchQuery(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDownloadAllSiblingsCSV}
                  className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download All Sibling Students
                </button>
              </div>

              {/* Scrollable Families List Container */}
              <div className="space-y-4 max-h-[38vh] overflow-y-auto pr-1">
                {(() => {
                  const query = siblingSearchQuery.toLowerCase().trim();
                  const filteredGroups = siblingGroups.filter((group, index) => {
                    if (!query) return true;
                    const familyId = `fam-${String(1000 + index + 1)}`;
                    const fatherName = (group[0]?.fatherName || group[0]?.parentName || '').toLowerCase();
                    const motherName = (group[0]?.motherName || '').toLowerCase();
                    const email = (group[0]?.email || group[0]?.parentEmail || '').toLowerCase();
                    const phone = (group[0]?.phone || group[0]?.parentPhone || group[0]?.whatsappNumber || '').replace(/[^0-9]/g, '');
                    const village = (group[0]?.village || '').toLowerCase();
                    const hasStudentMatch = group.some(s => 
                      (s.name || `${s.firstName || ''} ${s.secondName || ''}`).toLowerCase().includes(query) ||
                      (s.admissionNumber || '').toLowerCase().includes(query)
                    );

                    return familyId.includes(query) ||
                           fatherName.includes(query) ||
                           motherName.includes(query) ||
                           email.includes(query) ||
                           phone.includes(query) ||
                           village.includes(query) ||
                           hasStudentMatch;
                  });

                  if (filteredGroups.length === 0) {
                    return (
                      <div className="p-12 text-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50">
                        <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                        <p className="text-sm font-black text-neutral-600">No matching sibling families found</p>
                        <p className="text-xs text-neutral-400 mt-1">Try refining your search keyword or clearing the field.</p>
                      </div>
                    );
                  }

                  return filteredGroups.map((group, idx) => {
                    const father = group[0]?.fatherName || group[0]?.parentName || 'N/A';
                    const mother = group[0]?.motherName || 'N/A';
                    const phone = group[0]?.phone || group[0]?.parentPhone || group[0]?.whatsappNumber || 'N/A';
                    const village = group[0]?.village || 'N/A';
                    const email = group[0]?.email || group[0]?.parentEmail || null;

                    return (
                      <div 
                        key={idx}
                        className="bg-neutral-50/40 hover:bg-neutral-50 border border-neutral-200/75 hover:border-neutral-300 rounded-2xl p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                      >
                        <div className="space-y-3 flex-1">
                          {/* Family Headers */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase text-rose-600 bg-rose-50 rounded-md border border-rose-100">
                              FAM-{1000 + idx + 1}
                            </span>
                            <h4 className="text-base font-extrabold text-neutral-800">{father}</h4>
                            {mother && mother !== 'N/A' && (
                              <span className="text-xs text-neutral-400 font-medium">(&amp; {mother})</span>
                            )}
                          </div>

                          {/* Family Properties Context */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 font-semibold">
                            {phone && phone !== 'N/A' && (
                              <div className="flex items-center gap-1">
                                <span className="text-neutral-400">Phone:</span>
                                <span className="text-neutral-700 font-bold">{phone}</span>
                              </div>
                            )}
                            {village && village !== 'N/A' && (
                              <div className="flex items-center gap-1">
                                <span className="text-neutral-400">Village:</span>
                                <span className="text-neutral-700 font-bold">{village}</span>
                              </div>
                            )}
                            {email && (
                              <div className="flex items-center gap-1">
                                <span className="text-neutral-400">Email:</span>
                                <span className="text-neutral-700 font-bold">{email}</span>
                              </div>
                            )}
                          </div>

                          {/* Kids List Row */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {group.map((s, sIdx) => {
                              const classRecord = classes.find(c => c.id === s.classId);
                              const batchRecord = batches.find(b => b.id === s.batchId);
                              return (
                                <div 
                                  key={sIdx}
                                  className="px-3 py-1.5 bg-white border border-neutral-200 rounded-xl shadow-sm text-[11px] font-bold text-neutral-700 flex items-center gap-1.5"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span>{s.name || `${s.firstName || ''} ${s.secondName || ''}`.trim()}</span>
                                  <span className="text-neutral-400 font-medium whitespace-nowrap">
                                    ({classRecord ? classRecord.name : s.classId || 'N/A'}{batchRecord ? ` - ${batchRecord.name}` : ''})
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Download Mini Handler */}
                        <div className="shrink-0 flex items-center md:justify-end">
                          <button
                            type="button"
                            onClick={() => handleDownloadFamilyCSV(group, idx)}
                            className="p-2.5 rounded-xl border border-neutral-200/60 text-neutral-500 hover:text-rose-600 hover:bg-white hover:border-neutral-300 transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-wider"
                            title="Download family record"
                          >
                            <Download className="w-4 h-4" />
                            <span className="md:hidden lg:inline">Family CSV</span>
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-4 border-t border-neutral-100 bg-neutral-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowSiblingModal(false);
                  setSiblingSearchQuery('');
                }}
                className="px-5 py-2.5 rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-all text-xs uppercase font-extrabold tracking-wider"
              >
                Close Portal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Active Sibling Dialog */}
      {showActiveSiblingDialog && selectedSiblingGroup && selectedSiblingBaseStudent && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-md z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl border border-neutral-100 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 animate-pulse">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-neutral-800 tracking-tight">Sibling Connections</h3>
                  <p className="text-xs text-neutral-400 font-bold font-mono uppercase tracking-wider">
                    Associated Family: <span className="text-rose-600 font-black">{selectedSiblingBaseStudent.fatherName || selectedSiblingBaseStudent.parentName || 'N/A'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowActiveSiblingDialog(false);
                }}
                className="w-10 h-10 rounded-xl hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-all border border-neutral-200/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto flex-1 space-y-6">
              {/* Alert context banner */}
              <div className="bg-rose-50/30 border border-rose-200/20 p-4 rounded-2xl flex gap-3 text-xs text-neutral-600 leading-relaxed">
                <div className="text-rose-500 shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  Below is the real-time calculated group of sibling branch children currently registered. You can directly load any child's 360° Profile dashboard or locate them immediately in the student listings table.
                </div>
              </div>

              {/* Sibling branches list */}
              <div className="space-y-3">
                {selectedSiblingGroup.map((sibling, sIdx) => {
                  const isCurrent = (sibling.uid || sibling.id) === (selectedSiblingBaseStudent.uid || selectedSiblingBaseStudent.id);
                  const classRecord = classes.find(c => c.id === sibling.classId);
                  const batchRecord = batches.find(b => b.id === sibling.batchId);
                  const sName = sibling.name || `${sibling.firstName || ''} ${sibling.secondName || ''}`.trim();
                  
                  return (
                    <div
                      key={sIdx}
                      className={`p-5 rounded-2xl border transition-all flex flex-col gap-4 ${
                        isCurrent 
                          ? 'bg-rose-50/50 border-rose-200/80 ring-2 ring-rose-500/10'
                          : 'bg-neutral-50/40 hover:bg-neutral-50 border-neutral-200/60 hover:border-neutral-300'
                      }`}
                    >
                      {/* Top Row: Student Profile and Actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                            isCurrent 
                              ? 'bg-rose-500 text-white shadow-md' 
                              : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                          }`}>
                            {sibling.photoURL ? (
                              <img src={sibling.photoURL} alt={sName} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              sName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-black text-neutral-800 uppercase tracking-tight">{sName}</h4>
                              {isCurrent && (
                                <span className="px-2 py-0.5 text-[8.5px] font-bold text-rose-600 bg-rose-100 rounded-md uppercase tracking-wider font-sans">
                                  Selected Base
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-500 font-semibold mt-1">
                              Class: <span className="text-neutral-700 font-bold">{classRecord ? classRecord.name : sibling.class || 'N/A'}</span>
                              {batchRecord && (
                                <>
                                  <span className="mx-1 text-neutral-300">•</span>
                                  Batch: <span className="text-neutral-700 font-bold">{batchRecord.name}</span>
                                </>
                              )}
                              {sibling.rollNumber && (
                                <>
                                  <span className="mx-1 text-neutral-300">•</span>
                                  Roll: <span className="text-neutral-700 font-mono font-bold">{sibling.rollNumber}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* CTA Buttons */}
                        <div className="flex items-center gap-2 sm:justify-end shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudentFor360(sibling);
                              setShow360View(true);
                              setShowActiveSiblingDialog(false);
                            }}
                            className="px-3 py-1.5 bg-neutral-100 hover:bg-rose-600 text-neutral-700 hover:text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm border border-neutral-200/50"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>360° Profile</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSearchTerm(sName);
                              setShowActiveSiblingDialog(false);
                              toast.success(`Filtered student list for ${sName}`);
                            }}
                            className="px-3 py-1.5 bg-white hover:bg-neutral-100 text-neutral-600 hover:text-neutral-800 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border border-neutral-200 shadow-sm"
                          >
                            <Search className="w-3.5 h-3.5" />
                            <span>Locate in List</span>
                          </button>
                        </div>
                      </div>

                      {/* Matching Decisive Sibling Parameters */}
                      {(() => {
                        const matches = analyzeMatches(sibling, selectedSiblingGroup);
                        if (matches.length === 0) return null;
                        return (
                          <div className="border-t border-dashed border-neutral-200/80 pt-3 mt-1">
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                              Decisive Sibling Match Criteria
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {matches.map((m, mIdx) => (
                                <div 
                                  key={mIdx} 
                                  className="text-[11px] px-3 py-2 bg-rose-500/5 border border-rose-200/40 rounded-xl text-neutral-700 flex flex-col md:flex-row md:items-center gap-1 md:gap-2 leading-tight"
                                  title={m.matchDetail}
                                >
                                  <span className="font-extrabold text-rose-700 uppercase text-[9px] tracking-wider font-mono bg-rose-100/80 px-1.5 py-0.5 rounded border border-rose-200/50 shrink-0">
                                    {m.type}
                                  </span>
                                  <span className="font-black text-rose-950 font-sans break-all select-all">
                                    {m.value}
                                  </span>
                                  <span className="text-[10px] text-neutral-400 font-medium italic shrink-0">
                                    ({m.matchDetail})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-4 border-t border-neutral-100 bg-neutral-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowActiveSiblingDialog(false);
                }}
                className="px-5 py-2.5 rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-all text-xs uppercase font-extrabold tracking-wider"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Due Date Modal */}
      {extendingStudent && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-md z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl border border-neutral-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 border border-amber-500/20">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-neutral-800 tracking-tight">Extend Due Date</h3>
                  <p className="text-[11px] text-neutral-400 font-bold font-mono uppercase">
                    Student: <span className="text-amber-600">{extendingStudent.name}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExtendingStudent(null)}
                className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-all border border-neutral-200/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  New Extended Due Date
                </label>
                <input
                  type="date"
                  value={extendedDueDate}
                  onChange={(e) => setExtendedDueDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Extension Reason / Notes
                </label>
                <textarea
                  value={extendedDueDateNotes}
                  onChange={(e) => setExtendedDueDateNotes(e.target.value)}
                  placeholder="e.g. Granted grace period till month-end due to parent request"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtendingStudent(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-all text-xs uppercase font-extrabold tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDueDateExtension}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all text-xs uppercase font-extrabold tracking-wider shadow-md shadow-amber-500/20"
              >
                Save Extension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;