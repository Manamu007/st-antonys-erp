import React, { useState, useMemo, useEffect } from 'react';
import { extractParentPhone } from '../../utils/phoneUtils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { dbService, resilientFetch } from '../../services/dbService';
import { calculateStudentFee, normalizeYear, getFeeStructureCustomId, computeStudentFeeMetrics, calculateFinancialOverview } from '../../lib/feeUtils';
import { FeeStructure, FeeConcession, FeeRecord, PaymentRecord, Expenditure, ReceiptBook } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Filter, 
  TrendingUp, 
  Coins, 
  Check, 
  X, 
  Printer, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Calendar, 
  CalendarCheck,
  CreditCard, 
  User, 
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Settings,
  ChevronRight,
  ShieldCheck,
  Building,
  MessageCircle,
  Clock,
  Send,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bus,
  School,
  GraduationCap,
  Home,
  BookOpen,
  Download,
  Upload,
  Smartphone
} from 'lucide-react';
import Papa from 'papaparse';

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

const DEFAULT_CATEGORIES = [
  "Salaries", 
  "Maintenance", 
  "Utilities", 
  "Stationery", 
  "Events", 
  "Transport", 
  "Hostel", 
  "EMI", 
  "Director Expenditures", 
  "Principal Expenditures", 
  "Staff Advances", 
  "Other"
];

interface AdminFeesViewProps {
  students: any[];
  fees: FeeRecord[];
  feeStructures: FeeStructure[];
  concessions: FeeConcession[];
  payments: PaymentRecord[];
  classes: any[];
  batches: any[];
  academicYear: string;
  onRefresh: () => void;
}

export const AdminFeesView: React.FC<AdminFeesViewProps> = ({
  students,
  fees = [],
  feeStructures,
  concessions,
  payments,
  classes,
  batches,
  academicYear,
  onRefresh
}) => {
  const { settings } = useSettings();
  const [selectedStructureYear, setSelectedStructureYear] = useState(academicYear || '2026-27');
  const [expandedStudentIds, setExpandedStudentIds] = useState<Record<string, boolean>>({});

  const toggleStudentDetails = (studentId: string) => {
    setExpandedStudentIds(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  useEffect(() => {
    if (academicYear) {
      setSelectedStructureYear(academicYear);
    }
  }, [academicYear]);

  const [activeTab, setActiveTab] = useState<'ledgers' | 'transactions' | 'structures' | 'concessions' | 'expenditures' | 'balance_sheet' | 'receipt_books'>('ledgers');
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const [feeSortField, setFeeSortField] = useState<string>('rollNumber');
  const [feeSortOrder, setFeeSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleFeeSort = (field: string) => {
    if (feeSortField === field) {
      setFeeSortOrder(feeSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setFeeSortField(field);
      setFeeSortOrder('asc');
    }
  };

  // Collection History Search, Sort & Pagination State Variables
  const [transSearchQuery, setTransSearchQuery] = useState('');
  const [transSortField, setTransSortField] = useState<string>('date');
  const [transSortOrder, setTransSortOrder] = useState<'asc' | 'desc'>('desc');
  const [transCurrentPage, setTransCurrentPage] = useState<number>(1);
  const transItemsPerPage = 50;

  const handleTransSort = (field: string) => {
    if (transSortField === field) {
      setTransSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTransSortField(field);
      setTransSortOrder(field === 'date' || field === 'amount' ? 'desc' : 'asc');
    }
    setTransCurrentPage(1);
  };

  // Due Date Extension State Variables
  const [extendedDueDates, setExtendedDueDates] = useState<any[]>([]);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [selectedStudentForExtension, setSelectedStudentForExtension] = useState<any | null>(null);
  const [selectedExtensionComponent, setSelectedExtensionComponent] = useState<string>('term1');
  const [extendedDate, setExtendedDate] = useState<string>('');
  const [extensionReason, setExtensionReason] = useState<string>('');
  const [submittingExtension, setSubmittingExtension] = useState(false);

  // Expenditures states
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [loadingExpenditures, setLoadingExpenditures] = useState(false);
  const [showExpenditureModal, setShowExpenditureModal] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expCategory, setExpCategory] = useState('Other');
  const [expAmount, setExpAmount] = useState('');
  const [expRef, setExpRef] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expPaymentMethod, setExpPaymentMethod] = useState<'cash' | 'online' | 'cheque'>('cash');
  const [expSearchQuery, setExpSearchQuery] = useState('');
  const [expSelectedCategory, setExpSelectedCategory] = useState('all');

  // Custom Categories and Balance Sheet Sub-tab states
  const [expCategories, setExpCategories] = useState<string[]>([]);
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [balanceSheetSubTab, setBalanceSheetSubTab] = useState<'consolidated' | 'transport' | 'hostel'>('consolidated');

  // Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<any | null>(null);
  const [paymentComponent, setPaymentComponent] = useState('term1');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'razorpay'>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [showSandboxGateway, setShowSandboxGateway] = useState(false);
  const [sandboxOrder, setSandboxOrder] = useState<any>(null);
  const [sandboxComponentsMap, setSandboxComponentsMap] = useState<Record<string, number>>({});
  const [isProcessingRazorpay, setIsProcessingRazorpay] = useState(false);
  // Dynamically initialize default checkout date on or after school reopens (08/06/2026)
  const getInitialPaymentDate = () => {
    const today = new Date();
    const reopening = new Date('2026-06-08T00:00:00');
    if (today < reopening) {
      return '2026-06-08';
    }
    return today.toISOString().split('T')[0];
  };
  const [paymentDate, setPaymentDate] = useState(getInitialPaymentDate());
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Concession modal state
  const [showConcessionModal, setShowConcessionModal] = useState(false);
  const [selectedStudentForConcession, setSelectedStudentForConcession] = useState<any | null>(null);
  const [concessionType, setConcessionType] = useState('');
  const [customConcessionAmt, setCustomConcessionAmt] = useState('');
  const [oldFeeConcession, setOldFeeConcession] = useState('');
  const [concessionExtDate, setConcessionExtDate] = useState('');
  const [concessionExtNotes, setConcessionExtNotes] = useState('');
  const [submittingConcession, setSubmittingConcession] = useState(false);

  // Structure modal state
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [editingStructure, setEditingStructure] = useState<Partial<FeeStructure> | null>(null);
  const [submittingStructure, setSubmittingStructure] = useState(false);
  // Multi-delete structure selection
  const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>([]);

  // Sorting state for structures tables
  const [schoolSortField, setSchoolSortField] = useState<'name' | 'total'>('name');
  const [schoolSortOrder, setSchoolSortOrder] = useState<'asc' | 'desc'>('asc');

  const [transportSortField, setTransportSortField] = useState<'name' | 'total'>('name');
  const [transportSortOrder, setTransportSortOrder] = useState<'asc' | 'desc'>('asc');

  const [hostelSortField, setHostelSortField] = useState<'name' | 'total'>('name');
  const [hostelSortOrder, setHostelSortOrder] = useState<'asc' | 'desc'>('asc');

  const [structureSearchQuery, setStructureSearchQuery] = useState('');

  // Pagination implementation for extremely fast loading & high rendering response
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedClass, selectedBatch, selectedStatus]);



  // State-based Custom Confirmation (Bypasses iframe sandbox alert/confirm restrictions)
  const [confirmConfig, setConfirmConfig] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const requestConfirm = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmConfig({
      show: true,
      title,
      message,
      onConfirm: async () => {
        try {
          await onConfirm();
        } catch (e) {
          console.error(e);
        } finally {
          setConfirmConfig(null);
        }
      }
    });
  };

  const handleSchoolSort = (field: 'name' | 'total') => {
    if (schoolSortField === field) {
      setSchoolSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSchoolSortField(field);
      setSchoolSortOrder('asc');
    }
  };

  const handleTransportSort = (field: 'name' | 'total') => {
    if (transportSortField === field) {
      setTransportSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTransportSortField(field);
      setTransportSortOrder('asc');
    }
  };

  const handleHostelSort = (field: 'name' | 'total') => {
    if (hostelSortField === field) {
      setHostelSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setHostelSortField(field);
      setHostelSortOrder('asc');
    }
  };

  const sortedSchoolStructures = useMemo(() => {
    let list = feeStructures.filter(s => s.type === 'school' && normalizeYear(s.academicYear) === normalizeYear(selectedStructureYear));
    if (structureSearchQuery.trim()) {
      const q = structureSearchQuery.toLowerCase();
      list = list.filter(s => (s.name || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (schoolSortField === 'name') {
        const valA = a.name || '';
        const valB = b.name || '';
        return schoolSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        const totalA = (a.term1 || 0) + (a.term2 || 0) + (a.term3 || 0) + (a.admissionFee || 0) + (a.healthCardFee || 0);
        const totalB = (b.term1 || 0) + (b.term2 || 0) + (b.term3 || 0) + (b.admissionFee || 0) + (b.healthCardFee || 0);
        return schoolSortOrder === 'asc' ? totalA - totalB : totalB - totalA;
      }
    });
  }, [feeStructures, schoolSortField, schoolSortOrder, selectedStructureYear, structureSearchQuery]);

  const sortedTransportStructures = useMemo(() => {
    let list = feeStructures.filter(s => s.type === 'transport' && normalizeYear(s.academicYear) === normalizeYear(selectedStructureYear));
    if (structureSearchQuery.trim()) {
      const q = structureSearchQuery.toLowerCase();
      list = list.filter(s => (s.name || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (transportSortField === 'name') {
        const valA = a.name || '';
        const valB = b.name || '';
        return transportSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        const totalA = (a.term1 || 0) + (a.term2 || 0) + (a.term3 || 0);
        const totalB = (b.term1 || 0) + (b.term2 || 0) + (b.term3 || 0);
        return transportSortOrder === 'asc' ? totalA - totalB : totalB - totalA;
      }
    });
  }, [feeStructures, transportSortField, transportSortOrder, selectedStructureYear, structureSearchQuery]);

  const sortedHostelStructures = useMemo(() => {
    let list = feeStructures.filter(s => s.type === 'hostel' && normalizeYear(s.academicYear) === normalizeYear(selectedStructureYear));
    if (structureSearchQuery.trim()) {
      const q = structureSearchQuery.toLowerCase();
      list = list.filter(s => (s.name || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (hostelSortField === 'name') {
        const valA = a.name || '';
        const valB = b.name || '';
        return hostelSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        const totalA = (a.term1 || 0) + (a.term2 || 0) + (a.term3 || 0);
        const totalB = (b.term1 || 0) + (b.term2 || 0) + (b.term3 || 0);
        return hostelSortOrder === 'asc' ? totalA - totalB : totalB - totalA;
      }
    });
  }, [feeStructures, hostelSortField, hostelSortOrder, selectedStructureYear, structureSearchQuery]);

  // Concession Category Modal state
  const [showConcessionCatModal, setShowConcessionCatModal] = useState(false);
  const [editingConcessionCat, setEditingConcessionCat] = useState<Partial<FeeConcession> | null>(null);
  const [submittingConcessionCat, setSubmittingConcessionCat] = useState(false);

  // States for Last Term Concession
  const [lastTermClassId, setLastTermClassId] = useState<string>('all');
  const [lastTermStudentId, setLastTermStudentId] = useState<string>('');
  const [lastTermType, setLastTermType] = useState<'percentage' | 'fixed' | 'none'>('percentage');
  const [lastTermValue, setLastTermValue] = useState<number>(100);
  const [submittingLastTerm, setSubmittingLastTerm] = useState<boolean>(false);

  const filteredStudentsForLastTerm = useMemo(() => {
    if (!lastTermClassId || lastTermClassId === 'all') return [];
    return students.filter(s => s.classId === lastTermClassId && s.status !== 'inactive');
  }, [students, lastTermClassId]);

  const studentsWithLastTermConcession = useMemo(() => {
    return students.filter(s => s.lastTermConcessionType && s.lastTermConcessionType !== 'none');
  }, [students]);

  // Receipt modal state
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Student details drawer state
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<any | null>(null);

  // Checkout multi-component states
  const [checkoutSelectedMap, setCheckoutSelectedMap] = useState<Record<string, boolean>>({});
  const [checkoutAmounts, setCheckoutAmounts] = useState<Record<string, string>>({});
  const [activeCheckoutCategories, setActiveCheckoutCategories] = useState<Record<string, boolean>>({});
  const [parentWhatsApp, setParentWhatsApp] = useState('');
  const [shouldSendWhatsApp, setShouldSendWhatsApp] = useState(true);

  // Receipt Book State variables
  const { profile, isAdmin } = useAuth();
  const isVicePrincipal = profile?.role === 'vice_principal';
  const isPlaySchoolIncharge = profile?.role === 'play_school_incharge';
  const isViewOnlyUser = isVicePrincipal || isPlaySchoolIncharge;
  const isAccountant = profile?.role === 'accountant' || profile?.role === 'account';
  const isAccountantOrAdmin = !isViewOnlyUser && (isAdmin || isAccountant || profile?.role === 'admin');
  const isManagementOrAdmin = !isViewOnlyUser && (isAdmin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'management' || profile?.role === 'principal');
  const isClassTeacher = !isPlaySchoolIncharge && (profile?.role === 'teacher' || profile?.role === 'class_teacher' || !!profile?.classId);
  const canExtendDueDate = !isViewOnlyUser && (isAdmin || profile?.role === 'admin' || profile?.role === 'accountant' || profile?.role === 'account' || isClassTeacher);

  useEffect(() => {
    if (isAccountant && activeTab === 'concessions') {
      setActiveTab('ledgers');
    }
  }, [isAccountant, activeTab]);
  const [receiptBooks, setReceiptBooks] = useState<ReceiptBook[]>([]);
  const [loadingReceiptBooks, setLoadingReceiptBooks] = useState(false);
  const [selectedReceiptBook, setSelectedReceiptBook] = useState<string>('');
  const [showReceiptBookModal, setShowReceiptBookModal] = useState(false);
  const [editingReceiptBook, setEditingReceiptBook] = useState<Partial<ReceiptBook> | null>(null);

  const fetchReceiptBooks = async () => {
    setLoadingReceiptBooks(true);
    try {
      const list = await dbService.list('receipt_books') as ReceiptBook[];
      if (list.length === 0) {
        const defaultBook: ReceiptBook = {
          name: 'Main Institutional Book',
          prefix: 'SCH-',
          startFrom: 1001,
          currentSerial: 1001,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await dbService.create('receipt_books', 'book_default', defaultBook);
        setReceiptBooks([{ id: 'book_default', ...defaultBook }]);
        setSelectedReceiptBook('book_default');
      } else {
        setReceiptBooks(list);
        const activeBk = list.find(b => b.active);
        if (activeBk) {
          setSelectedReceiptBook(activeBk.id || '');
        } else if (list.length > 0) {
          setSelectedReceiptBook(list[0].id || '');
        }
      }
    } catch (e) {
      console.error('Failed to load receipt books:', e);
    } finally {
      setLoadingReceiptBooks(false);
    }
  };

  useEffect(() => {
    if (isAccountantOrAdmin) {
      fetchReceiptBooks();
    }
  }, [isAccountantOrAdmin]);

  const fetchExtendedDueDates = async () => {
    try {
      const list = await dbService.list('extendedDueDates');
      setExtendedDueDates(list || []);
    } catch (e) {
      console.error('Failed to fetch extended due dates:', e);
    }
  };

  useEffect(() => {
    fetchExtendedDueDates();
  }, []);

  const handleSaveExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForExtension) return;
    if (!selectedExtensionComponent) {
      toast.error('Please select a fee component');
      return;
    }
    if (!extendedDate) {
      toast.error('Please select a valid extension date');
      return;
    }

    setSubmittingExtension(true);
    try {
      const docId = `ext_${selectedStudentForExtension.student.uid || selectedStudentForExtension.student.id}_${selectedExtensionComponent}`;
      const payload = {
        studentId: selectedStudentForExtension.student.uid || selectedStudentForExtension.student.id,
        studentName: selectedStudentForExtension.student.name || 'Student',
        componentId: selectedExtensionComponent,
        academicYear,
        extendedDate,
        reason: extensionReason,
        requestedBy: profile?.uid || 'system',
        requestedByName: profile?.name || 'Staff',
        requestedByRole: profile?.role || 'Staff',
        createdAt: new Date().toISOString()
      };

      await dbService.set('extendedDueDates', docId, payload);
      toast.success(`Due date extension successfully set for ${selectedStudentForExtension.student.name}`);
      await fetchExtendedDueDates();
      setShowExtensionModal(false);
    } catch (e: any) {
      toast.error(`Failed to save due date extension: ${e.message}`);
    } finally {
      setSubmittingExtension(false);
    }
  };

  // Helper method to resolve dynamic fee components for a student
  const getStudentFeeComponents = (m: any) => {
    if (!m) return [];
    const student = m.student;
    const calc = m.calculation || calculateStudentFee(student, academicYear, feeStructures, concessions, classes, batches, true);
    const components: any[] = [];
    
    // 1. School Fee
    const schoolFee = calc.schoolFee || 0;
    const schoolStructure = calc.schoolStructure;
    if (calc.schoolFeeTerms) {
      const { term1, term2, term3 } = calc.schoolFeeTerms;
      if (term1 > 0) components.push({ id: 'term1', label: 'Term 1 Academic Fee', amount: term1 });
      if (term2 > 0) components.push({ id: 'term2', label: 'Term 2 Academic Fee', amount: term2 });
      if (term3 > 0) components.push({ id: 'term3', label: 'Term 3 Academic Fee', amount: term3 });
    } else if (schoolStructure) {
      const originalSchoolTotal = (Number(schoolStructure.term1) || 0) + (Number(schoolStructure.term2) || 0) + (Number(schoolStructure.term3) || 0);
      const ratio = originalSchoolTotal > 0 ? (schoolFee / originalSchoolTotal) : 1;

      const t1Payable = Math.round((Number(schoolStructure.term1) || 0) * ratio);
      const t2Payable = Math.round((Number(schoolStructure.term2) || 0) * ratio);
      const t3Payable = Math.max(0, schoolFee - t1Payable - t2Payable);

      if (t1Payable > 0) components.push({ id: 'term1', label: 'Term 1 Academic Fee', amount: t1Payable });
      if (t2Payable > 0) components.push({ id: 'term2', label: 'Term 2 Academic Fee', amount: t2Payable });
      if (t3Payable > 0) components.push({ id: 'term3', label: 'Term 3 Academic Fee', amount: t3Payable });
    } else if (schoolFee > 0) {
      components.push({ id: 'term1', label: 'General School Fee', amount: schoolFee });
    }

    // 2. Transport Fee
    const transportFee = calc.transportFee || 0;
    const transportStructure = calc.transportStructure;
    if (calc.transportFeeTerms) {
      const { term1, term2, term3 } = calc.transportFeeTerms;
      if (term1 > 0) components.push({ id: 'transport_term1', label: 'Term 1 Transport Fee', amount: term1 });
      if (term2 > 0) components.push({ id: 'transport_term2', label: 'Term 2 Transport Fee', amount: term2 });
      if (term3 > 0) components.push({ id: 'transport_term3', label: 'Term 3 Transport Fee', amount: term3 });
    } else if (transportFee > 0) {
      if (transportStructure) {
        const originalTransportTotal = (Number(transportStructure.term1) || 0) + (Number(transportStructure.term2) || 0) + (Number(transportStructure.term3) || 0);
        const ratio = originalTransportTotal > 0 ? (transportFee / originalTransportTotal) : 1;

        const t1Payable = Math.round((Number(transportStructure.term1) || 0) * ratio);
        const t2Payable = Math.round((Number(transportStructure.term2) || 0) * ratio);
        const t3Payable = Math.max(0, transportFee - t1Payable - t2Payable);

        if (t1Payable > 0) components.push({ id: 'transport_term1', label: 'Term 1 Transport Fee', amount: t1Payable });
        if (t2Payable > 0) components.push({ id: 'transport_term2', label: 'Term 2 Transport Fee', amount: t2Payable });
        if (t3Payable > 0) components.push({ id: 'transport_term3', label: 'Term 3 Transport Fee', amount: t3Payable });
      } else {
        const termValue = Math.round(transportFee / 3);
        const t1 = termValue;
        const t2 = termValue;
        const t3 = Math.max(0, transportFee - t1 - t2);
        components.push({ id: 'transport_term1', label: 'Term 1 Transport Fee', amount: t1 });
        components.push({ id: 'transport_term2', label: 'Term 2 Transport Fee', amount: t2 });
        components.push({ id: 'transport_term3', label: 'Term 3 Transport Fee', amount: t3 });
      }
    }

    // 3. Hostel Fee
    const hostelFee = calc.hostelFee || 0;
    const hostelStructure = calc.hostelStructure;
    if (calc.hostelFeeTerms) {
      const { term1, term2, term3 } = calc.hostelFeeTerms;
      if (term1 > 0) components.push({ id: 'hostel_term1', label: 'Term 1 Hostel Fee', amount: term1 });
      if (term2 > 0) components.push({ id: 'hostel_term2', label: 'Term 2 Hostel Fee', amount: term2 });
      if (term3 > 0) components.push({ id: 'hostel_term3', label: 'Term 3 Hostel Fee', amount: term3 });
    } else if (hostelFee > 0) {
      if (hostelStructure) {
        const originalHostelTotal = (Number(hostelStructure.term1) || 0) + (Number(hostelStructure.term2) || 0) + (Number(hostelStructure.term3) || 0);
        const ratio = originalHostelTotal > 0 ? (hostelFee / originalHostelTotal) : 1;

        const t1Payable = Math.round((Number(hostelStructure.term1) || 0) * ratio);
        const t2Payable = Math.round((Number(hostelStructure.term2) || 0) * ratio);
        const t3Payable = Math.max(0, hostelFee - t1Payable - t2Payable);

        if (t1Payable > 0) components.push({ id: 'hostel_term1', label: 'Term 1 Hostel Fee', amount: t1Payable });
        if (t2Payable > 0) components.push({ id: 'hostel_term2', label: 'Term 2 Hostel Fee', amount: t2Payable });
        if (t3Payable > 0) components.push({ id: 'hostel_term3', label: 'Term 3 Hostel Fee', amount: t3Payable });
      } else {
        const t1 = Math.round(hostelFee * 0.5);
        const t2 = Math.round(hostelFee * 0.25);
        const t3 = Math.max(0, hostelFee - t1 - t2);
        components.push({ id: 'hostel_term1', label: 'Term 1 Hostel Fee', amount: t1 });
        components.push({ id: 'hostel_term2', label: 'Term 2 Hostel Fee', amount: t2 });
        components.push({ id: 'hostel_term3', label: 'Term 3 Hostel Fee', amount: t3 });
      }
    }

    // 4. Other fees
    const oldFeeConcession = Number(student.oldFeeConcession || 0);
    const oldDues = Math.max(0, Number(student.lastClassFeeDue || 0) - oldFeeConcession);
    if (oldDues > 0) {
      components.push({ id: 'lastClassFeeDue', label: 'Previous Academic Year Dues', amount: oldDues });
    }
    const admissionFee = calc.admissionFee || 0;
    if (admissionFee > 0) {
      components.push({ id: 'admission', label: 'Admission Enrollment Fee', amount: admissionFee });
    }
    const iplFee = calc.iplFee || 0;
    if (iplFee > 0) {
      components.push({ id: 'ipl', label: 'IPL Special Batch Fee', amount: iplFee });
    }
    const healthCardFee = calc.healthCardFee || 0;
    if (healthCardFee > 0) {
      components.push({ id: 'healthCard', label: 'Student Health Card Fee', amount: healthCardFee });
    }

    return components;
  };

  // Calculates metrics per student
  const studentMetrics = useMemo(() => {
    return computeStudentFeeMetrics({
      students,
      academicYear,
      feeStructures,
      concessions,
      classes,
      batches,
      payments,
      fees,
      extendedDueDates
    });
  }, [students, academicYear, feeStructures, concessions, classes, batches, payments, fees, extendedDueDates]);

  // Overall Financial Overview calculations
  const overviewStats = useMemo(() => {
    return calculateFinancialOverview(studentMetrics);
  }, [studentMetrics]);

  // Separate Transport and Hostel calculations for dedicated balance sheets
  const transportAndHostelStats = useMemo(() => {
    let transportPayable = 0;
    let transportCollected = 0;
    let transportPending = 0;

    let hostelPayable = 0;
    let hostelCollected = 0;
    let hostelPending = 0;

    studentMetrics.forEach(m => {
      // Transport
      const tPayable = m.calculation.transportFee || 0;
      const tPaid = (m.paidComponents['transport'] || 0) + 
                    (m.paidComponents['transport_term1'] || 0) + 
                    (m.paidComponents['transport_term2'] || 0) + 
                    (m.paidComponents['transport_term3'] || 0);
      transportPayable += tPayable;
      transportCollected += tPaid;
      transportPending += Math.max(0, tPayable - tPaid);

      // Hostel
      const hPayable = m.calculation.hostelFee || 0;
      const hPaid = (m.paidComponents['hostel'] || 0) + 
                    (m.paidComponents['hostel_term1'] || 0) + 
                    (m.paidComponents['hostel_term2'] || 0) + 
                    (m.paidComponents['hostel_term3'] || 0);
      hostelPayable += hPayable;
      hostelCollected += hPaid;
      hostelPending += Math.max(0, hPayable - hPaid);
    });

    return {
      transportPayable,
      transportCollected,
      transportPending,
      hostelPayable,
      hostelCollected,
      hostelPending
    };
  }, [studentMetrics]);

  // Filter students
  const filteredMetrics = useMemo(() => {
    const filtered = (studentMetrics || []).filter(m => {
      if (!m || !m.student) return false;
      const name = (m.student.name || '').toLowerCase();
      const rollNumber = (m.student.rollNumber || m.student.rollNo || '').toLowerCase();
      const uniqueStudentId = (m.student.uniqueStudentId || '').toLowerCase();
      const sQuery = searchQuery.toLowerCase();

      const matchesSearch = name.includes(sQuery) || rollNumber.includes(sQuery) || uniqueStudentId.includes(sQuery);
      
      // Find class name
      const studentClassId = m.student.classId || m.student.class || '';
      const matchesClass = !selectedClass || studentClassId === selectedClass;

      // Find batch id
      const studentBatchId = m.student.batchId || m.student.batch || '';
      const matchesBatch = !selectedBatch || studentBatchId === selectedBatch;

      // Match payment status
      let matchesStatus = false;
      if (selectedStatus === 'all') {
        matchesStatus = true;
      } else if (selectedStatus === 'overdue') {
        matchesStatus = !!m.isOverdue;
      } else {
        matchesStatus = m.status === selectedStatus;
      }

      return matchesSearch && matchesClass && matchesBatch && matchesStatus;
    });

    // Create fast maps for lookup to optimize sorting performance
    const classMap = new Map<string, string>();
    (classes || []).forEach(c => {
      if (c && c.id && c.name) classMap.set(c.id, c.name);
    });
    
    const batchMap = new Map<string, string>();
    (batches || []).forEach(b => {
      if (b && b.id && b.name) batchMap.set(b.id, b.name);
    });

    const concessionMap = new Map<string, string>();
    (concessions || []).forEach(c => {
      if (c && c.id && c.name) concessionMap.set(c.id, c.name);
    });

    // Automatically sort in ascending/descending order of feeSortField
    return [...filtered].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (feeSortField === 'rollNumber') {
        valA = String(a?.student?.rollNumber || a?.student?.rollNo || '');
        valB = String(b?.student?.rollNumber || b?.student?.rollNo || '');
      } else if (feeSortField === 'name') {
        valA = String(a?.student?.name || '').toLowerCase();
        valB = String(b?.student?.name || '').toLowerCase();
      } else if (feeSortField === 'class') {
        const clsA = (a?.student?.classId ? classMap.get(a.student.classId) : '') || a?.student?.class || '';
        const batA = (a?.student?.batchId ? batchMap.get(a.student.batchId) : '') || a?.student?.batch || '';
        const clsB = (b?.student?.classId ? classMap.get(b.student.classId) : '') || b?.student?.class || '';
        const batB = (b?.student?.batchId ? batchMap.get(b.student.batchId) : '') || b?.student?.batch || '';
        valA = `${clsA} ${batA}`.toLowerCase();
        valB = `${clsB} ${batB}`.toLowerCase();
      } else if (feeSortField === 'amount') {
        const numA = Number(a?.total || 0);
        const numB = Number(b?.total || 0);
        return feeSortOrder === 'asc' ? numA - numB : numB - numA;
      } else if (feeSortField === 'concession') {
        const concessionNameA = a?.student?.feeConcessionType ? concessionMap.get(a.student.feeConcessionType) : '';
        const concessionNameB = b?.student?.feeConcessionType ? concessionMap.get(b.student.feeConcessionType) : '';
        valA = String(a?.student?.feeConcessionType === 'custom' ? 'Custom Flat' : (concessionNameA || 'none')).toLowerCase();
        valB = String(b?.student?.feeConcessionType === 'custom' ? 'Custom Flat' : (concessionNameB || 'none')).toLowerCase();
      } else if (feeSortField === 'status') {
        valA = String(a?.status || '').toLowerCase();
        valB = String(b?.status || '').toLowerCase();
      }

      const comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return feeSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [studentMetrics, searchQuery, selectedClass, selectedBatch, selectedStatus, feeSortField, feeSortOrder, classes, batches, concessions]);

  // Calculates metrics per student
  const paginatedMetrics = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMetrics.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMetrics, currentPage]);

  // Base collection history payments list (non-expenditures, amount > 0)
  const baseTransPayments = useMemo(() => {
    return (payments || [])
      .filter(p => !p.reference || !p.reference.startsWith('EXP'))
      .filter(p => Number(p.amount) > 0);
  }, [payments]);

  // Filtered and sorted collection history transactions
  const filteredTransPayments = useMemo(() => {
    const q = transSearchQuery.trim().toLowerCase();

    const filtered = baseTransPayments.filter(p => {
      if (!q) return true;
      const ref = (p.reference || p.id || '').toLowerCase();
      const receiptNum = (p.serialNumber || '').toLowerCase();
      const compLabel = getComponentNameLabel(p.component || 'term1').toLowerCase();
      
      const studObj = students.find(s => s.uid === p.studentId || s.id === p.studentId);
      const studentName = (studObj?.name || '').toLowerCase();
      const studentCode = (p.studentId || '').toLowerCase();

      return (
        ref.includes(q) ||
        receiptNum.includes(q) ||
        studentName.includes(q) ||
        studentCode.includes(q) ||
        compLabel.includes(q)
      );
    });

    return filtered.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (transSortField === 'reference') {
        valA = (a.reference || a.id || '').toLowerCase();
        valB = (b.reference || b.id || '').toLowerCase();
      } else if (transSortField === 'serialNumber') {
        valA = (a.serialNumber || '').toLowerCase();
        valB = (b.serialNumber || '').toLowerCase();
      } else if (transSortField === 'studentName') {
        const studA = students.find(s => s.uid === a.studentId || s.id === a.studentId);
        const studB = students.find(s => s.uid === b.studentId || s.id === b.studentId);
        valA = (studA?.name || a.studentId || '').toLowerCase();
        valB = (studB?.name || b.studentId || '').toLowerCase();
      } else if (transSortField === 'method') {
        valA = (a.method || '').toLowerCase();
        valB = (b.method || '').toLowerCase();
      } else if (transSortField === 'component') {
        valA = getComponentNameLabel(a.component || 'term1').toLowerCase();
        valB = getComponentNameLabel(b.component || 'term1').toLowerCase();
      } else if (transSortField === 'amount') {
        valA = Number(a.amount || 0);
        valB = Number(b.amount || 0);
      } else { // date
        valA = new Date(a.date || 0).getTime();
        valB = new Date(b.date || 0).getTime();
      }

      if (valA < valB) return transSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return transSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [baseTransPayments, transSearchQuery, transSortField, transSortOrder, students]);

  const transTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredTransPayments.length / transItemsPerPage));
  }, [filteredTransPayments.length]);

  const paginatedTransPayments = useMemo(() => {
    const startIndex = (transCurrentPage - 1) * transItemsPerPage;
    return filteredTransPayments.slice(startIndex, startIndex + transItemsPerPage);
  }, [filteredTransPayments, transCurrentPage]);

  // Backward compatibility alias for existing code references
  const transPayments = filteredTransPayments;

  // Filter visible batches based on class selection
  const visibleBatches = useMemo(() => {
    if (!selectedClass) return [];
    return (batches || []).filter(b => b.classId === selectedClass || b.class === selectedClass);
  }, [batches, selectedClass]);

  const handleRecordOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVicePrincipal) {
      toast.error('Operation Denied: Vice Principal account is set to view-only mode for fees.', { id: 'vp-fees-denied' });
      return;
    }
    if (!selectedStudentForPayment) return;

    const studentId = selectedStudentForPayment.student.uid || selectedStudentForPayment.student.id;
    const comps = getStudentFeeComponents(selectedStudentForPayment);
    const selectedList = comps
      .filter(c => checkoutSelectedMap[c.id])
      .map(c => ({
        id: c.id,
        label: c.label,
        payAmount: Number(checkoutAmounts[c.id] || 0)
      }))
      .filter(c => c.payAmount > 0);

    if (selectedList.length === 0) {
      toast.error('Please select at least one component with a valid checkout amount to proceed');
      return;
    }

    // Validate custom payment date meets school reopened limit: starts from 08/06/2026
    const selectedDate = new Date(paymentDate);
    const minDate = new Date('2026-06-08T00:00:00');
    if (selectedDate < minDate) {
      toast.error('Payments can only be accepted from school reopening date (08/06/2026) onwards.');
      return;
    }

    if (paymentMethod === 'razorpay') {
      await handleRazorpayPaymentAdmin(selectedList, studentId);
      return;
    }

    setSubmittingPayment(true);
    try {
      const recordedTimestamp = Date.now();
      const todayDateStr = paymentDate || new Date().toISOString().split('T')[0];
      const todayTimeStr = new Date().toLocaleTimeString('en-US', { hour12: true });

      const activeBook = receiptBooks.find(bk => bk.id === selectedReceiptBook);
      let sequentialStart = activeBook ? activeBook.currentSerial : 1001;
      const serialPrefix = activeBook ? activeBook.prefix : 'SCH-';
      const commonSerialNum = `${serialPrefix}${sequentialStart}`;
      const serialsGenerated: string[] = [commonSerialNum];

      // Save payment records for each component sequentially using a single common receipt number
      await Promise.all(
        selectedList.map((item, index) => {
          const payload = {
            studentId,
            amount: item.payAmount,
            date: todayDateStr,
            paymentTime: todayTimeStr,
            method: paymentMethod,
            reference: paymentRef || `manual_${recordedTimestamp}_${index}`,
            academicYear,
            component: item.id,
            recordedBy: 'Administrator',
            receiptBookId: selectedReceiptBook || 'book_default',
            receiptBookName: activeBook ? activeBook.name : 'Main Institutional Book',
            serialNumber: commonSerialNum
          };
          return dbService.create('payments', `pay_${recordedTimestamp}_${item.id}`, payload);
        })
      );

      // Save active book new sequential number in firestore (increment by 1 since only one receipt number is used)
      if (activeBook && activeBook.id) {
        const nextSerial = sequentialStart + 1;
        await dbService.update('receipt_books', activeBook.id, {
          currentSerial: nextSerial,
          updatedAt: new Date().toISOString()
        });
        await fetchReceiptBooks(); // refresh local list
      }

      const totalPaidAmount = selectedList.reduce((sum, item) => sum + item.payAmount, 0);
      toast.success(`Check-Out Completed! Collected ₹${totalPaidAmount.toLocaleString()} successfully.`);

      // Automatically send and queue via backend if checked
      if (shouldSendWhatsApp && parentWhatsApp) {
        const componentText = selectedList.length === 1 
          ? selectedList[0].label 
          : selectedList.map(item => `${item.label} (₹${item.payAmount})`).join(', ');

        const payPayload = {
          studentName: selectedStudentForPayment.student.name,
          fatherName: selectedStudentForPayment.student.fatherName || 'Parent',
          amount: totalPaidAmount,
          method: paymentMethod,
          reference: paymentRef || `manual_${recordedTimestamp}`,
          component: componentText,
          academicYear: academicYear,
          whatsappNumber: parentWhatsApp.replace(/[^0-9]/g, ''),
          balanceDue: (selectedStudentForPayment.pending || 0) - totalPaidAmount,
          studentId: studentId,
          paymentId: `pay_${recordedTimestamp}`,
          receiptId: commonSerialNum,
          receiptNumber: commonSerialNum,
          date: todayDateStr,
          forceSend: false,
          className: classes.find(c => c.id === selectedStudentForPayment?.student?.classId)?.name || selectedStudentForPayment?.student?.class || 'N/A',
          batchName: batches.find(b => b.id === selectedStudentForPayment?.student?.batchId)?.name || selectedStudentForPayment?.student?.batch || 'N/A'
        };

        fetch('/api/fees/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payPayload)
        })
        .then(() => {
          toast.success('WhatsApp Receipt Queued on Server.');
        })
        .catch((err) => {
          console.error("Queue API Error:", err);
          toast.error("Failed to queue WhatsApp receipt.");
        });

        dbService.create('whatsapp_audit_logs', `log_sup_${recordedTimestamp}`, {
          event: "fee_receipt_frontend_redirect_suppressed",
          timestamp: new Date().toISOString(),
          payload: {
            recipient: parentWhatsApp,
            studentId,
            receiptId: commonSerialNum
          }
        }).catch(err => console.warn("Failed to log suppression:", err));

        console.log('[WhatsApp Dispatch] Frontend redirect suppressed. Dispatched via backend queue instead.');
      }

      setShowPaymentModal(false);

      const consolidatedReceipt: any = {
        id: `pay_${recordedTimestamp}_consolidated`,
        studentId,
        amount: totalPaidAmount,
        date: todayDateStr,
        paymentTime: todayTimeStr,
        method: paymentMethod as any,
        reference: paymentRef || `manual_${recordedTimestamp}`,
        academicYear,
        component: selectedList.length === 1 
          ? selectedList[0].id 
          : `multi_CONSOLIDATED CHECKOUT [${selectedList.map(item => getComponentNameLabel(item.id)).join(' + ')}]`,
        recordedBy: 'Administrator',
        receiptBookId: selectedReceiptBook || 'book_default',
        receiptBookName: activeBook ? activeBook.name : 'Main Institutional Book',
        serialNumber: serialsGenerated.join(', ')
      };

      setSelectedReceipt(consolidatedReceipt);
      setShowReceiptModal(true);

      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('An error occurred during payment processing.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleRazorpayPaymentAdmin = async (selectedList: any[], studentId: string) => {
    setIsProcessingRazorpay(true);
    const payComponentsMap: Record<string, number> = {};
    selectedList.forEach(item => {
      payComponentsMap[item.id] = item.payAmount;
    });

    const totalPayAmount = selectedList.reduce((sum, item) => sum + item.payAmount, 0);

    try {
      // 1. Create order on backend
      const orderRes = await fetch('/api/fees/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalPayAmount,
          receipt: `rcpt_adm_${studentId.slice(0, 5)}_${Date.now()}`
        })
      });

      if (!orderRes.ok) {
        throw new Error('Failed to create payment order');
      }

      const orderData = await orderRes.json();

      // IF BACKEND IS IN DEMO/SANDBOX fall back to high-fidelity Simulator Modal
      if (orderData.isSandbox) {
        setSandboxOrder(orderData);
        setSandboxComponentsMap(payComponentsMap);
        setShowSandboxGateway(true);
        setIsProcessingRazorpay(false);
        return;
      }

      // Otherwise, load official Razorpay SDK for live mode
      const loadRazorpay = () => {
        return new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const res = await loadRazorpay();
      if (!res) {
        toast.error('Razorpay SDK failed to load. Are you online?');
        setIsProcessingRazorpay(false);
        return;
      }

      const options = {
        key: settings?.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY || 'rzp_test_your_key_here',
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.id,
        name: settings?.schoolName || 'ST. ANTONY\'S HIGH SCHOOL',
        description: `Fee Settlement - ${selectedStudentForPayment?.student?.name}`,
        image: settings?.logoUrl || 'https://cdn.razorpay.com/logos/BUV9U383pS9pZ7_medium.png',
        handler: async function (response: any) {
          try {
            toast.loading('Verifying secure transaction...', { id: 'verify-web' });
            const verifyRes = await fetch('/api/fees/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                studentId,
                academicYear,
                componentsMap: payComponentsMap
              })
            });

            if (!verifyRes.ok) throw new Error('Payment confirmation failed');
            toast.success('Check-out completed! Collected ₹' + totalPayAmount.toLocaleString() + ' via Razorpay.', { id: 'verify-web' });
            
            // Optionally dispatch WhatsApp via backend queue
            if (shouldSendWhatsApp && parentWhatsApp) {
              const componentText = selectedList.length === 1 
                ? selectedList[0].label 
                : selectedList.map(item => `${item.label} (₹${item.payAmount})`).join(', ');

              const payPayload = {
                studentName: selectedStudentForPayment?.student?.name || 'Student',
                fatherName: selectedStudentForPayment?.student?.fatherName || 'Parent',
                amount: totalPayAmount,
                method: 'razorpay_online',
                reference: response.razorpay_payment_id,
                component: componentText,
                academicYear: academicYear,
                whatsappNumber: parentWhatsApp.replace(/[^0-9]/g, ''),
                balanceDue: (selectedStudentForPayment?.pending || 0) - totalPayAmount,
                studentId: studentId,
                paymentId: response.razorpay_payment_id,
                receiptId: response.razorpay_payment_id,
                receiptNumber: response.razorpay_payment_id,
                date: new Date().toISOString().split('T')[0],
                forceSend: false,
                className: classes.find(c => c.id === selectedStudentForPayment?.student?.classId)?.name || selectedStudentForPayment?.student?.class || 'N/A',
                batchName: batches.find(b => b.id === selectedStudentForPayment?.student?.batchId)?.name || selectedStudentForPayment?.student?.batch || 'N/A'
              };

              fetch('/api/fees/receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payPayload)
              })
              .then(() => {
                toast.success('WhatsApp Receipt Queued on Server.');
              })
              .catch((err) => {
                console.error("Queue API Error:", err);
                toast.error("Failed to queue WhatsApp receipt.");
              });

              dbService.create('whatsapp_audit_logs', `log_sup_${response.razorpay_payment_id}`, {
                event: "fee_receipt_frontend_redirect_suppressed",
                timestamp: new Date().toISOString(),
                payload: {
                  recipient: parentWhatsApp,
                  studentId,
                  receiptId: response.razorpay_payment_id
                }
              }).catch(err => console.warn("Failed to log suppression:", err));

              console.log('[WhatsApp Dispatch] Razorpay frontend redirect suppressed. Dispatched via backend queue.');
            }

            setShowPaymentModal(false);
            onRefresh();
          } catch (err: any) {
            console.error(err);
            toast.error('Verification failed: ' + err.message, { id: 'verify-web' });
          }
        },
        prefill: {
          name: selectedStudentForPayment?.student?.name || '',
          email: selectedStudentForPayment?.student?.email || 'portal@school.edu',
          contact: selectedStudentForPayment?.student?.phone || parentWhatsApp || '9988776655'
        },
        theme: {
          color: '#3b82f6'
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error(err);
      toast.error('Razorpay Error: ' + err.message);
    } finally {
      setIsProcessingRazorpay(false);
    }
  };

  const handleSimulateSandboxSuccess = async () => {
    toast.loading('Simulating sandbox verification...', { id: 'sim-pay' });
    try {
      const fakePaymentId = 'pay_sandbox_' + Math.floor(10000000 + Math.random() * 90000000);
      const studentId = selectedStudentForPayment?.student?.uid || selectedStudentForPayment?.student?.id;
      const totalPayAmount = Object.values(sandboxComponentsMap).reduce((sum, val) => sum + val, 0);

      const verifyRes = await fetch('/api/fees/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: sandboxOrder.id,
          razorpay_payment_id: fakePaymentId,
          razorpay_signature: 'rzparp_mock_sig',
          studentId,
          academicYear,
          componentsMap: sandboxComponentsMap
        })
      });

      if (!verifyRes.ok) throw new Error('Mock Verification Failed');
      toast.success('Simulation Successful! Paid ₹' + totalPayAmount.toLocaleString() + ' via Razorpay Sandbox.', { id: 'sim-pay' });

      // Handle WhatsApp via backend queue
      if (shouldSendWhatsApp && parentWhatsApp) {
        const componentText = Object.keys(sandboxComponentsMap).join(', ') || 'School Fees';

        const payPayload = {
          studentName: selectedStudentForPayment?.student?.name || 'Student',
          fatherName: selectedStudentForPayment?.student?.fatherName || 'Parent',
          amount: totalPayAmount,
          method: 'razorpay_sandbox',
          reference: fakePaymentId,
          component: componentText,
          academicYear: academicYear,
          whatsappNumber: parentWhatsApp.replace(/[^0-9]/g, ''),
          balanceDue: (selectedStudentForPayment?.pending || 0) - totalPayAmount,
          studentId: studentId,
          paymentId: fakePaymentId,
          receiptId: fakePaymentId,
          receiptNumber: fakePaymentId,
          date: new Date().toISOString().split('T')[0],
          forceSend: false,
          className: classes.find(c => c.id === selectedStudentForPayment?.student?.classId)?.name || selectedStudentForPayment?.student?.class || 'N/A',
          batchName: batches.find(b => b.id === selectedStudentForPayment?.student?.batchId)?.name || selectedStudentForPayment?.student?.batch || 'N/A'
        };

        fetch('/api/fees/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payPayload)
        })
        .then(() => {
          toast.success('WhatsApp Receipt Queued on Server.');
        })
        .catch((err) => {
          console.error("Queue API Error:", err);
          toast.error("Failed to queue WhatsApp receipt.");
        });

        dbService.create('whatsapp_audit_logs', `log_sup_${fakePaymentId}`, {
          event: "fee_receipt_frontend_redirect_suppressed",
          timestamp: new Date().toISOString(),
          payload: {
            recipient: parentWhatsApp,
            studentId,
            receiptId: fakePaymentId
          }
        }).catch(err => console.warn("Failed to log suppression:", err));

        console.log('[WhatsApp Dispatch] Sandbox frontend redirect suppressed. Dispatched via backend queue.');
      }

      setShowSandboxGateway(false);
      setShowPaymentModal(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Simulation check failed.', { id: 'sim-pay' });
    }
  };

  const handleUpdateStudentConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForConcession) return;

    setSubmittingConcession(true);
    try {
      const studentId = selectedStudentForConcession.student.uid || selectedStudentForConcession.student.id;
      const isCustomVal = concessionType === 'custom';
      const actualConcessionAmt = isCustomVal ? Number(customConcessionAmt || 0) : 0;
      const finalConcessionId = concessionType === 'none' ? '' : concessionType;

      const hasOldFees = Number(selectedStudentForConcession.student.lastClassFeeDue || 0) > 0;
      const actualOldFeeConcession = hasOldFees ? Number(oldFeeConcession || 0) : 0;

      const updatePayload: any = {
        feeConcessionType: finalConcessionId,
        feeConcessionAmount: actualConcessionAmt,
        oldFeeConcession: actualOldFeeConcession,
        extendedDueDate: concessionExtDate || '',
        extendedDueDateNotes: concessionExtNotes || ''
      };

      await Promise.all([
        dbService.update('users', studentId, updatePayload),
        dbService.update('students', studentId, updatePayload)
      ]);

      if (concessionExtDate) {
        const docId = `ext_${studentId}_term1`;
        const extPayload = {
          studentId: studentId,
          studentName: selectedStudentForConcession.student.name || 'Student',
          componentId: 'term1',
          academicYear,
          extendedDate: concessionExtDate,
          reason: concessionExtNotes || 'Granted in Concessions & Extensions Manager',
          requestedBy: profile?.uid || 'system',
          requestedByName: profile?.name || 'Staff',
          requestedByRole: profile?.role || 'Staff',
          createdAt: new Date().toISOString()
        };
        await dbService.set('extendedDueDates', docId, extPayload);
      } else {
        const docId = `ext_${studentId}_term1`;
        const extPayload = {
          studentId: studentId,
          studentName: selectedStudentForConcession.student.name || 'Student',
          componentId: 'term1',
          academicYear,
          extendedDate: '',
          reason: '',
          updatedAt: new Date().toISOString()
        };
        await dbService.set('extendedDueDates', docId, extPayload).catch(() => {});
      }

      await fetchExtendedDueDates();

      toast.success('Student fee concession & extension strategy updated successfully!');
      setShowConcessionModal(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to update concession settings');
    } finally {
      setSubmittingConcession(false);
    }
  };

  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVicePrincipal) {
      toast.error('Operation Denied: Vice Principal account is set to view-only mode for fees.', { id: 'vp-fees-denied' });
      return;
    }
    const structureType = editingStructure?.type || 'school';
    if (!editingStructure?.name || !structureType) {
      toast.error('Please fill out all required fields');
      return;
    }

    setSubmittingStructure(true);
    try {
      const finalPayload: FeeStructure = {
        name: editingStructure.name,
        type: structureType as any,
        academicYear: editingStructure.academicYear || academicYear,
        term1: Number(editingStructure.term1 || 0),
        term2: Number(editingStructure.term2 || 0),
        term3: Number(editingStructure.term3 || 0),
        term1DueDate: editingStructure.term1DueDate || '',
        term2DueDate: editingStructure.term2DueDate || '',
        term3DueDate: editingStructure.term3DueDate || '',
        admissionFee: Number(editingStructure.admissionFee || 0),
        iplFee: Number(editingStructure.iplFee || 0),
        healthCardFee: structureType === 'school' ? 0 : Number(editingStructure.healthCardFee || 0),
        hostelTuitionFee: 0,
        total: Number(editingStructure.term1 || 0) + Number(editingStructure.term2 || 0) + Number(editingStructure.term3 || 0) + Number(editingStructure.admissionFee || 0) + (structureType === 'school' ? 0 : Number(editingStructure.healthCardFee || 0)),
        createdAt: editingStructure.createdAt || new Date().toISOString()
      };

      if (editingStructure.id) {
        await dbService.update('feeStructures', editingStructure.id, { ...finalPayload, id: editingStructure.id });
        toast.success('Fee structure config updated!');
      } else {
        const generatedId = editingStructure.id || getFeeStructureCustomId(structureType as any, editingStructure.name) || `fs_${Date.now()}`;
        await dbService.create('feeStructures', generatedId, { ...finalPayload, id: generatedId });
        toast.success('New fee structure configured successfully!');
      }

      setShowStructureModal(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to configure fee structure');
    } finally {
      setSubmittingStructure(false);
    }
  };

  const handleDeleteStructure = async (id?: string, name?: string, type?: 'school' | 'hostel' | 'transport') => {
    if (isVicePrincipal) {
      toast.error('Operation Denied: Vice Principal account is set to view-only mode for fees.', { id: 'vp-fees-denied' });
      return;
    }
    const candidates: string[] = [];
    if (id) candidates.push(id);
    if (type && name) {
      const customId = getFeeStructureCustomId(type, name);
      if (customId && !candidates.includes(customId)) {
        candidates.push(customId);
      }
    }

    if (candidates.length === 0) {
      toast.error('Could not determine structure reference ID to delete');
      return;
    }

    requestConfirm(
      'Delete Fee Structure',
      `Are you absolutely sure you want to delete this fee structure${name ? ` "${name}"` : ''}? This could break dues calculation for matching classes.`,
      async () => {
        try {
          toast.loading('Deleting fee structure...', { id: 'delete-struct' });
          for (const candId of candidates) {
            await dbService.delete('feeStructures', candId);
          }

          toast.success('Fee structure purged successfully', { id: 'delete-struct' });
          onRefresh();
        } catch (err: any) {
          console.error("Delete error:", err);
          toast.error('Failed to delete structure: ' + (err?.message || 'Access denied'), { id: 'delete-struct' });
        }
      }
    );
  };

  const handleDeleteSelectedStructures = async () => {
    if (isVicePrincipal) {
      toast.error('Operation Denied: Vice Principal account is set to view-only mode for fees.', { id: 'vp-fees-denied' });
      return;
    }
    if (selectedStructureIds.length === 0) {
      toast.error('No fee structures selected');
      return;
    }

    requestConfirm(
      'Delete Selected Fee Structures',
      `Are you absolutely sure you want to delete the ${selectedStructureIds.length} selected fee structure(s)? This will permanently remove them from the database and recalculate dues.`,
      async () => {
        try {
          toast.loading(`Deleting ${selectedStructureIds.length} selected fee structures...`, { id: 'delete-selected-structs' });
          const idsToPurge = new Set<string>();
          selectedStructureIds.forEach(id => {
            idsToPurge.add(id);
            const strObj = feeStructures.find(fs => fs.id === id);
            if (strObj && strObj.type && strObj.name) {
              const customId = getFeeStructureCustomId(strObj.type, strObj.name);
              if (customId) idsToPurge.add(customId);
            }
          });

          const uniqueIds = Array.from(idsToPurge);
          if (uniqueIds.length > 0) {
            await dbService.deleteBatch('feeStructures', uniqueIds);
          }

          toast.success('Selected fee structures successfully deleted', { id: 'delete-selected-structs' });
          setSelectedStructureIds([]);
          onRefresh();
        } catch (err: any) {
          console.error(err);
          toast.error('Failed to delete selected structures: ' + (err?.message || 'Access denied'), { id: 'delete-selected-structs' });
        }
      }
    );
  };

  const handleDeleteAllStructures = async () => {
    if (!feeStructures || feeStructures.length === 0) {
      toast.error('No fee structures found to delete');
      return;
    }

    requestConfirm(
      'Purge All Fee Structures',
      `Are you absolutely sure you want to delete ALL (${feeStructures.length}) fee structures? This will delete all structures from the database with their Firebase IDs, reset calculations, and cannot be undone.`,
      async () => {
        try {
          toast.loading('Deleting all fee structures from Firebase...', { id: 'delete-all' });
          const idsToPurge = new Set<string>();
          feeStructures.forEach(fs => {
            if (fs.id) idsToPurge.add(fs.id);
            if (fs.type && fs.name) {
              const customId = getFeeStructureCustomId(fs.type, fs.name);
              if (customId) idsToPurge.add(customId);
            }
          });

          const uniqueIds = Array.from(idsToPurge);
          if (uniqueIds.length > 0) {
            await dbService.deleteBatch('feeStructures', uniqueIds);
          }
          toast.success('All fee structures have been successfully deleted', { id: 'delete-all' });
          onRefresh();
        } catch (err: any) {
          console.error(err);
          toast.error('Failed to delete all structures: ' + (err?.message || ''), { id: 'delete-all' });
        }
      }
    );
  };

  const handleAutoSeedStandardFees = async () => {
    requestConfirm(
      'Purge & Initialize Fees Table',
      'Are you absolutely sure you want to PURGE all existing fee structures and initialize standard 2026-27 fee tables? This matches Nursery-UKG (2 terms), Classes 1-10 (3 terms), Hostel (3 terms), and Transport (3 terms) according to St. Antony specifications.',
      async () => {
        setSeedingLoading(true);
        toast.loading('Purging current fee entries and preparing seed tasks...', { id: 'seed-task' });
        try {
      // 1. Delete all existing feeStructures
      for (const fs of feeStructures) {
        if (fs.id) {
          await dbService.delete('feeStructures', fs.id);
        }
        if (fs.type && fs.name) {
          const customId = getFeeStructureCustomId(fs.type, fs.name);
          if (customId && customId !== fs.id) {
            await dbService.delete('feeStructures', customId);
          }
        }
      }

      // 2. Generate new standard configurations
      const newStructures: FeeStructure[] = [];

      // A. Pre-primary & Primary Class Fees
      const primarySchoolData = [
        { name: "Non-Attending Student", t1: 10000, t2: 0, t3: 0, admissionFee: 0 },
        { name: "Nursery Class", t1: 11500, t2: 11500, t3: 0, admissionFee: 4000 },
        { name: "LKG Class", t1: 12000, t2: 12000, t3: 0, admissionFee: 4000 },
        { name: "UKG Class", t1: 12500, t2: 12500, t3: 0, admissionFee: 4000 },
        { name: "I Class", t1: 10000, t2: 9000, t3: 9000, admissionFee: 4000 },
        { name: "II Class", t1: 10000, t2: 10000, t3: 10000, admissionFee: 4000 },
        { name: "III Class", t1: 11000, t2: 11000, t3: 10000, admissionFee: 5000 },
        { name: "IV Class", t1: 12000, t2: 12000, t3: 10000, admissionFee: 5000 },
        { name: "V Class", t1: 13000, t2: 12000, t3: 11000, admissionFee: 5000 }
      ];

      for (const p of primarySchoolData) {
        newStructures.push({
          name: p.name,
          type: "school",
          academicYear: "2026-27",
          term1: p.t1,
          term2: p.t2,
          term3: p.t3,
          term1DueDate: "2026-07-05",
          term2DueDate: "2026-10-05",
          term3DueDate: p.t3 > 0 ? "2027-01-05" : "",
          admissionFee: p.admissionFee,
          iplFee: 0,
          healthCardFee: 0,
          hostelTuitionFee: 0,
          total: p.t1 + p.t2 + p.t3,
          createdAt: new Date().toISOString()
        });
      }

      // B. High School Classes with Section/Batch variations (VI to X)
      const highSchoolSections = [
        { name: "VI Class - S", t1: 14000, t2: 13000, t3: 12000, admission: 6000 },
        { name: "VI Class - S (General)", t1: 14000, t2: 13000, t3: 12000, admission: 6000 },
        { name: "VI Class - M", t1: 14000, t2: 14000, t3: 13000, admission: 6000 },
        { name: "VI Class - M (Integrated)", t1: 14000, t2: 14000, t3: 13000, admission: 6000 },
        { name: "VI Class - IPL", t1: 15000, t2: 14000, t3: 13000, admission: 6000 },
        { name: "VI Class - IPL (Advanced)", t1: 15000, t2: 14000, t3: 13000, admission: 6000 },
        { name: "VI Class", t1: 14000, t2: 13000, t3: 12000, admission: 6000 },

        { name: "VII Class - S", t1: 15000, t2: 14000, t3: 13000, admission: 6000 },
        { name: "VII Class - S (General)", t1: 15000, t2: 14000, t3: 13000, admission: 6000 },
        { name: "VII Class - M", t1: 15000, t2: 15000, t3: 14000, admission: 6000 },
        { name: "VII Class - M (Integrated)", t1: 15000, t2: 15000, t3: 14000, admission: 6000 },
        { name: "VII Class - IPL", t1: 16000, t2: 15000, t3: 14000, admission: 6000 },
        { name: "VII Class - IPL (Advanced)", t1: 16000, t2: 15000, t3: 14000, admission: 6000 },
        { name: "VII Class", t1: 15000, t2: 14000, t3: 13000, admission: 6000 },

        { name: "VIII Class - S", t1: 16000, t2: 16000, t3: 14000, admission: 6000 },
        { name: "VIII Class - S (General)", t1: 16000, t2: 16000, t3: 14000, admission: 6000 },
        { name: "VIII Class - M", t1: 17000, t2: 16000, t3: 15000, admission: 6000 },
        { name: "VIII Class - M (Integrated)", t1: 17000, t2: 16000, t3: 15000, admission: 6000 },
        { name: "VIII Class - IPL", t1: 17000, t2: 16000, t3: 16000, admission: 6000 },
        { name: "VIII Class - IPL (Advanced)", t1: 17000, t2: 16000, t3: 16000, admission: 6000 },
        { name: "VIII Class", t1: 16000, t2: 16000, t3: 14000, admission: 6000 },

        { name: "IX Class - S", t1: 18000, t2: 17000, t3: 16000, admission: 7000 },
        { name: "IX Class - S (General)", t1: 18000, t2: 17000, t3: 16000, admission: 7000 },
        { name: "IX Class - M", t1: 18000, t2: 18000, t3: 17000, admission: 7000 },
        { name: "IX Class - M (Integrated)", t1: 18000, t2: 18000, t3: 17000, admission: 7000 },
        { name: "IX Class - IPL", t1: 19000, t2: 18000, t3: 17000, admission: 7000 },
        { name: "IX Class - IPL (Advanced)", t1: 19000, t2: 18000, t3: 17000, admission: 7000 },
        { name: "IX Class", t1: 18000, t2: 17000, t3: 16000, admission: 7000 },

        { name: "X Class - S", t1: 19000, t2: 19000, t3: 19000, admission: 7000 },
        { name: "X Class - S (General)", t1: 19000, t2: 19000, t3: 19000, admission: 7000 },
        { name: "X Class - M", t1: 19000, t2: 19000, t3: 19000, admission: 7000 },
        { name: "X Class - M (Integrated)", t1: 19000, t2: 19000, t3: 19000, admission: 7000 },
        { name: "X Class - IPL", t1: 19000, t2: 19000, t3: 19000, admission: 7000 },
        { name: "X Class - IPL (Advanced)", t1: 19000, t2: 19000, t3: 19000, admission: 7000 },
        { name: "X Class", t1: 19000, t2: 19000, t3: 19000, admission: 7000 }
      ];

      for (const h of highSchoolSections) {
        newStructures.push({
          name: h.name,
          type: "school",
          academicYear: "2026-27",
          term1: h.t1,
          term2: h.t2,
          term3: h.t3,
          term1DueDate: "2026-07-05",
          term2DueDate: "2026-10-05",
          term3DueDate: "2027-01-05",
          admissionFee: h.admission,
          iplFee: 0,
          healthCardFee: 0,
          hostelTuitionFee: 0,
          total: h.t1 + h.t2 + h.t3,
          createdAt: new Date().toISOString()
        });
      }

      // C. Hostel Boarding & Accommodation Fees (I to X)
      const hostelData = [
        { name: "I Class Hostel", t1: 23500, t2: 11750, t3: 11750 },
        { name: "II Class Hostel", t1: 24000, t2: 12000, t3: 12000 },
        { name: "III Class Hostel", t1: 24500, t2: 12250, t3: 12250 },
        { name: "IV Class Hostel", t1: 25000, t2: 12500, t3: 12500 },
        { name: "V Class Hostel", t1: 25500, t2: 12750, t3: 12750 },

        { name: "VI Class Hostel", t1: 26000, t2: 13000, t3: 13000 },
        { name: "VI Class - S Hostel", t1: 26000, t2: 13000, t3: 13000 },
        { name: "VI Class - S (General) Hostel", t1: 26000, t2: 13000, t3: 13000 },
        { name: "VI Class - M Hostel", t1: 26000, t2: 13000, t3: 13000 },
        { name: "VI Class - M (Integrated) Hostel", t1: 26000, t2: 13000, t3: 13000 },
        { name: "VI Class - IPL Hostel", t1: 26000, t2: 13000, t3: 13000 },
        { name: "VI Class - IPL (Advanced) Hostel", t1: 26000, t2: 13000, t3: 13000 },

        { name: "VII Class Hostel", t1: 27000, t2: 13500, t3: 13500 },
        { name: "VII Class - S Hostel", t1: 27000, t2: 13500, t3: 13500 },
        { name: "VII Class - S (General) Hostel", t1: 27000, t2: 13500, t3: 13500 },
        { name: "VII Class - M Hostel", t1: 27000, t2: 13500, t3: 13500 },
        { name: "VII Class - M (Integrated) Hostel", t1: 27000, t2: 13500, t3: 13500 },
        { name: "VII Class - IPL Hostel", t1: 27000, t2: 13500, t3: 13500 },
        { name: "VII Class - IPL (Advanced) Hostel", t1: 27000, t2: 13500, t3: 13500 },

        { name: "VIII Class Hostel", t1: 28000, t2: 14000, t3: 14000 },
        { name: "VIII Class - S Hostel", t1: 28000, t2: 14000, t3: 14000 },
        { name: "VIII Class - S (General) Hostel", t1: 28000, t2: 14000, t3: 14000 },
        { name: "VIII Class - M Hostel", t1: 28000, t2: 14000, t3: 14000 },
        { name: "VIII Class - M (Integrated) Hostel", t1: 28000, t2: 14000, t3: 14000 },
        { name: "VIII Class - IPL Hostel", t1: 28000, t2: 14000, t3: 14000 },
        { name: "VIII Class - IPL (Advanced) Hostel", t1: 28000, t2: 14000, t3: 14000 },

        { name: "IX Class Hostel", t1: 29000, t2: 14500, t3: 14500 },
        { name: "IX Class - S Hostel", t1: 29000, t2: 14500, t3: 14500 },
        { name: "IX Class - S (General) Hostel", t1: 29000, t2: 14500, t3: 14500 },
        { name: "IX Class - M Hostel", t1: 29000, t2: 14500, t3: 14500 },
        { name: "IX Class - M (Integrated) Hostel", t1: 29000, t2: 14500, t3: 14500 },
        { name: "IX Class - IPL Hostel", t1: 29000, t2: 14500, t3: 14500 },
        { name: "IX Class - IPL (Advanced) Hostel", t1: 29000, t2: 14500, t3: 14500 },

        { name: "X Class Hostel", t1: 30000, t2: 15000, t3: 15000 },
        { name: "X Class - S Hostel", t1: 30000, t2: 15000, t3: 15000 },
        { name: "X Class - S (General) Hostel", t1: 30000, t2: 15000, t3: 15000 },
        { name: "X Class - M Hostel", t1: 30000, t2: 15000, t3: 15000 },
        { name: "X Class - M (Integrated) Hostel", t1: 30000, t2: 15000, t3: 15000 },
        { name: "X Class - IPL Hostel", t1: 30000, t2: 15000, t3: 15000 },
        { name: "X Class - IPL (Advanced) Hostel", t1: 30000, t2: 15000, t3: 15000 }
      ];

      for (const h of hostelData) {
        newStructures.push({
          name: h.name,
          type: "hostel",
          academicYear: "2026-27",
          term1: h.t1,
          term2: h.t2,
          term3: h.t3,
          term1DueDate: "2026-07-05",
          term2DueDate: "2026-10-05",
          term3DueDate: "2027-01-05",
          admissionFee: 0,
          iplFee: 0,
          healthCardFee: 2000, // Health cards defined under hostel specifications
          hostelTuitionFee: h.t1 + h.t2 + h.t3,
          total: h.t1 + h.t2 + h.t3,
          createdAt: new Date().toISOString()
        });
      }

      // D. Transport Route & Shuttle Fees compiled from Vehicles 1 to 10
      const transportData = [
        // Vehicle 1 Yarrampalle Route
        { name: "Yarrampalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Palugurallapalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Joukupalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Mudamala", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Chinnayipalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Shanthi Nagar", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Gurrapagaripalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Rangasamudram", t1: 3400, t2: 3400, t3: 3400 },
        { name: "Kammavaripalle", t1: 3400, t2: 3400, t3: 3400 },

        // Vehicle 2 Itukulapadu Route
        { name: "Itukulapadu", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Savisettipalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Palagiri", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Pagadalapalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Kodigudlapadu", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Anuvaripalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Chinnaipalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Balarajupalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Papireddypalle", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Chennavaram", t1: 3500, t2: 3500, t3: 3500 },
        { name: "Reddykottala", t1: 3400, t2: 3400, t3: 3400 },
        { name: "Sunkesulapalli", t1: 3500, t2: 3500, t3: 3500 },
        { name: "Sunkesulapalli (Chowtupalem)", t1: 3500, t2: 3500, t3: 3500 },
        { name: "Dammanapalle", t1: 3800, t2: 3800, t3: 3800 },

        // Vehicle 3 Ankanagodugunuru Route
        { name: "Narasimhapuram", t1: 4100, t2: 4100, t3: 4100 },
        { name: "Ankanagodugunuru", t1: 4100, t2: 4100, t3: 4100 },
        { name: "Mekavaripalle", t1: 4000, t2: 4000, t3: 4000 },
        { name: "Madhavarayunipalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Payalakuntla", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Ramachandrapuram", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Anuvaripalle.R", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Kasanagaram", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Ithrampeta", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Vijay Nagar Colony", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Boppapuram", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Chennareddypeta", t1: 3500, t2: 3500, t3: 3500 },

        // Vehicle 4 B.Koduru Route
        { name: "Papanapalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "B.Koduru", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Gunthapalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Bodugundupalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Munnelle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Rajupalem", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Sirigiripalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Reddyvaripalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Dantalapalle", t1: 3600, t2: 3600, t3: 3600 },

        // Vehicle 5 Ganugapenta Route
        { name: "Yanamala Nagayapalle", t1: 4000, t2: 4000, t3: 4000 },
        { name: "Ganugapenta", t1: 4000, t2: 4000, t3: 4000 },
        { name: "Repalle", t1: 3900, t2: 3900, t3: 3900 },
        { name: "Pennamvaripalle", t1: 3900, t2: 3900, t3: 3900 },
        { name: "Muddamvaripalle", t1: 3900, t2: 3900, t3: 3900 },
        { name: "Yalavapalle", t1: 3900, t2: 3900, t3: 3900 },
        { name: "Krishnampalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Manganapalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Siddavaram", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Agraharam", t1: 3600, t2: 3600, t3: 3600 },

        // Vehicle 6 Varikuntla Route
        { name: "Varikuntla", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Balayapalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Ganganapalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Middela", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Narasapuram", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Chennareddypalle", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Lingareddypalle", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Shankavaram", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Markapuram", t1: 3500, t2: 3500, t3: 3500 },

        // Vehicle 7 Rameswaram Route
        { name: "Venkatapuram", t1: 3900, t2: 3900, t3: 3900 },
        { name: "Nagalakuntla", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Akkalreddypalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Jillella", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Vasudevapuram", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Kotturu", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Duggayapalle", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Kattakindapalle", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Chintalapalle", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Jativarthipalle", t1: 3500, t2: 3500, t3: 3500 },

        // Vehicle 8 K.N.Kottala (B.Mattam) Route
        { name: "Somireddypalle", t1: 4100, t2: 4100, t3: 4100 },
        { name: "Madireddypalle", t1: 4000, t2: 4000, t3: 4000 },
        { name: "K.N.Kottala (Basavapuram)", t1: 4000, t2: 4000, t3: 4000 },
        { name: "K.N.Kottala", t1: 4000, t2: 4000, t3: 4000 },
        { name: "Basavapuram", t1: 4000, t2: 4000, t3: 4000 },
        { name: "B.Mattam", t1: 4000, t2: 4000, t3: 4000 },
        { name: "Narasannapalle", t1: 3900, t2: 3900, t3: 3900 },
        { name: "Gangireddypalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Lingaldinnepalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Mallepalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Chanchayagaripalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Ambavaram", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Sreeramnagar", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Amagampalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Kesavapuram", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Pulliveedu", t1: 3500, t2: 3500, t3: 3500 },
        { name: "Narsingupalle", t1: 3400, t2: 3400, t3: 3400 },
        { name: "Mahaboobnagar", t1: 3400, t2: 3400, t3: 3400 },

        // Vehicle 9 Buchampalle Route
        { name: "Musalreddypalle", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Kavalakuntla", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Buchampalle", t1: 4000, t2: 4000, t3: 4000 },
        { name: "Thokalapalle", t1: 3900, t2: 3900, t3: 3900 },
        { name: "Thimmareddypalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Balareddypalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Kappalapalle", t1: 3800, t2: 3800, t3: 3800 },
        { name: "Tekurpeta", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Thiruvengalapuram", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Rajasahebpeta", t1: 3600, t2: 3600, t3: 3600 },
        { name: "Kondugaripalle", t1: 3600, t2: 3600, t3: 3600 },

        // Vehicle 10 Route
        { name: "Ammavaripeta", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Krishnapuram", t1: 3700, t2: 3700, t3: 3700 },
        { name: "Ayyavaripalle", t1: 3700, t2: 3700, t3: 3700 },
        { name: "General", t1: 3800, t2: 3800, t3: 3800 }
      ];

      for (const t of transportData) {
        newStructures.push({
          name: t.name,
          type: "transport",
          academicYear: "2026-27",
          term1: t.t1,
          term2: t.t2,
          term3: t.t3,
          term1DueDate: "2026-07-05",
          term2DueDate: "2026-10-05",
          term3DueDate: "2027-01-05",
          admissionFee: 0,
          iplFee: 0,
          healthCardFee: 0,
          hostelTuitionFee: 0,
          total: t.t1 + t.t2 + t.t3,
          createdAt: new Date().toISOString()
        });
      }

      // Filter duplicates in newStructures just to be completely safe
      const seen = new Set<string>();
      const batchStructures = newStructures.filter(s => {
        const key = `${s.type}:${s.name.trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // 3. Create all standard structured documents
      for (const struct of batchStructures) {
        const docId = getFeeStructureCustomId(struct.type, struct.name) || `fs_${Date.now()}`;
        await dbService.create('feeStructures', docId, { ...struct, id: docId });
      }

      toast.success('Successfully purged old structures and initialized 2026-27 ERP Standard Fees!', { id: 'seed-task' });
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('An error occurred during database seeding: ' + err.message, { id: 'seed-task' });
    } finally {
      setSeedingLoading(false);
    }
  });
};

  const handleSaveConcessionCat = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = editingConcessionCat?.name;
    const type = editingConcessionCat?.type || 'percentage';
    const value = editingConcessionCat?.value;
    const appliedTo = editingConcessionCat?.appliedTo || 'school';

    if (!name || !type || value === undefined) {
      toast.error('Please fill out all required fields');
      return;
    }

    setSubmittingConcessionCat(true);
    try {
      const finalPayload: FeeConcession = {
        name,
        type: type as any,
        value: Number(value || 0),
        appliedTo: appliedTo as any || 'school',
        description: editingConcessionCat.description || '',
        createdAt: editingConcessionCat.createdAt || new Date().toISOString()
      };

      if (editingConcessionCat.id) {
        await dbService.update('concessions', editingConcessionCat.id, finalPayload);
        toast.success('Concession category updated successfully!');
      } else {
        await dbService.create('concessions', `conc_${Date.now()}`, finalPayload);
        toast.success('New concession category added successfully!');
      }

      setShowConcessionCatModal(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save concession category');
    } finally {
      setSubmittingConcessionCat(false);
    }
  };

  const handleDeleteConcessionCat = async (id: string) => {
    if (!id) {
      toast.error('Cannot delete concession category: ID is missing');
      return;
    }
    requestConfirm(
      'Delete Concession Category',
      'Are you sure you want to delete this concession category? This will revert concessions for any students assigned.',
      async () => {
        try {
          await dbService.delete('concessions', id);
          toast.success('Concession category deleted successfully');
          onRefresh();
        } catch (err) {
          console.error('Delete concession category error:', err);
          toast.error('Failed to delete concession category');
        }
      }
    );
  };

  const handleSaveLastTermConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVicePrincipal) {
      toast.error('Operation Denied: Vice Principal account is set to view-only mode for fees.', { id: 'vp-fees-denied' });
      return;
    }
    if (!lastTermStudentId) {
      toast.error('Please select a student');
      return;
    }

    setSubmittingLastTerm(true);
    try {
      const updatePayload = {
        lastTermConcessionType: lastTermType,
        lastTermConcessionValue: lastTermType === 'none' ? 0 : Number(lastTermValue || 0)
      };

      await Promise.all([
        dbService.update('users', lastTermStudentId, updatePayload),
        dbService.update('students', lastTermStudentId, updatePayload)
      ]);

      toast.success('Student last term school fee concession updated successfully!');
      setLastTermStudentId('');
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to update student last term concession settings');
    } finally {
      setSubmittingLastTerm(false);
    }
  };

  const handleRemoveLastTermConcession = async (studentId: string, studentName: string) => {
    if (isVicePrincipal) {
      toast.error('Operation Denied: Vice Principal account is set to view-only mode for fees.', { id: 'vp-fees-denied' });
      return;
    }
    requestConfirm(
      'Remove Last Term Concession',
      `Are you sure you want to remove the last term school fee concession for ${studentName}?`,
      async () => {
        try {
          const updatePayload = {
            lastTermConcessionType: 'none',
            lastTermConcessionValue: 0
          };

          await Promise.all([
            dbService.update('users', studentId, updatePayload),
            dbService.update('students', studentId, updatePayload)
          ]);

          toast.success(`Removed last term concession for ${studentName}`);
          onRefresh();
        } catch (err) {
          console.error(err);
          toast.error('Failed to remove concession');
        }
      }
    );
  };

  const fetchExpenditureCategories = async () => {
    try {
      const list = await dbService.list('expenditure_categories');
      if (list && list.length > 0) {
        const names = list.map((doc: any) => doc.name || doc.id);
        setExpCategories(names);
      } else {
        setExpCategories(DEFAULT_CATEGORIES);
      }
    } catch (err) {
      console.error('Error fetching expenditure categories:', err);
      setExpCategories(DEFAULT_CATEGORIES);
    }
  };

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setIsSavingCategory(true);
    try {
      const catId = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      const currentList = expCategories.length > 0 ? expCategories : DEFAULT_CATEGORIES;
      if (currentList.map(c => c.toLowerCase()).includes(trimmed.toLowerCase())) {
        toast.error('Category with this name already exists');
        setIsSavingCategory(false);
        return;
      }

      await dbService.create('expenditure_categories', catId, {
        id: catId,
        name: trimmed,
        createdAt: new Date().toISOString()
      });

      toast.success('Category created successfully');
      setNewCategoryName('');
      await fetchExpenditureCategories();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete the category "${catName}"?`);
    if (!confirmDelete) return;
    
    try {
      const list = await dbService.list('expenditure_categories');
      const doc = list.find((d: any) => d.name === catName || d.id === catName.toLowerCase().replace(/[^a-z0-9]/g, '_'));
      
      if (doc) {
        await dbService.delete('expenditure_categories', doc.id);
        toast.success(`Category "${catName}" deleted successfully`);
      } else {
        // Since it's a default, seed all other defaults except this one
        const remaining = DEFAULT_CATEGORIES.filter(c => c !== catName);
        for (const cat of remaining) {
          const catId = cat.toLowerCase().replace(/[^a-z0-9]/g, '_');
          await dbService.create('expenditure_categories', catId, {
            id: catId,
            name: cat,
            createdAt: new Date().toISOString()
          });
        }
        toast.success(`Category "${catName}" deleted successfully`);
      }
      await fetchExpenditureCategories();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete category');
    }
  };

  const handleSeedDefaultCategories = async () => {
    const confirmSeed = window.confirm('Would you like to seed the default categories? This will merge any defaults with your existing list.');
    if (!confirmSeed) return;
    try {
      for (const cat of DEFAULT_CATEGORIES) {
        const catId = cat.toLowerCase().replace(/[^a-z0-9]/g, '_');
        await dbService.create('expenditure_categories', catId, {
          id: catId,
          name: cat,
          createdAt: new Date().toISOString()
        });
      }
      toast.success('Default categories mapped successfully!');
      await fetchExpenditureCategories();
    } catch (err) {
      console.error(err);
      toast.error('Error seeding default categories');
    }
  };

  const fetchExpenditures = async () => {
    setLoadingExpenditures(true);
    try {
      const data = await dbService.list('expenditures');
      setExpenditures((data || []) as Expenditure[]);
    } catch (err) {
      console.error('Error fetching expenditures:', err);
    } finally {
      setLoadingExpenditures(false);
    }
  };

  React.useEffect(() => {
    fetchExpenditures();
    fetchExpenditureCategories();
  }, [academicYear]);

  const handleSaveExpenditure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || Number(expAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    try {
      const payload: Expenditure = {
        amount: Number(expAmount),
        date: new Date(expDate).toISOString(),
        category: expCategory,
        description: expDescription || `Manual expense recorded for ${expCategory}`,
        paymentMethod: expPaymentMethod,
        reference: expRef || `EXP_${Date.now()}`,
        recordedBy: 'Administrator',
        createdAt: new Date().toISOString()
      };
      await dbService.create('expenditures', `exp_${Date.now()}`, payload);
      toast.success('Financial expense recorded successfully!');
      setShowExpenditureModal(false);
      // Reset inputs
      setExpAmount('');
      setExpRef('');
      setExpDescription('');
      setExpCategory('Other');
      fetchExpenditures();
      onRefresh();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save expenditure record');
    }
  };

  const handleDeleteExpenditure = async (id: string) => {
    if (!id) {
      toast.error('Cannot delete expenditure: Record ID is missing');
      return;
    }
    requestConfirm(
      'Delete Expense Record',
      'Are you sure you want to delete this expenditure record?',
      async () => {
        try {
          await dbService.delete('expenditures', id);
          toast.success('Expenditure record removed successfully');
          fetchExpenditures();
          onRefresh();
        } catch (err) {
          console.error('Delete expenditure error:', err);
          toast.error('Failed to delete expenditure');
        }
      }
    );
  };

  const handleDeletePayment = async (paymentOrId: string | any, extraStudentId?: string) => {
    if (isVicePrincipal) {
      toast.error('Operation Denied: Vice Principal account is set to view-only mode for fees.', { id: 'vp-fees-denied' });
      return;
    }
    if (!paymentOrId) {
      toast.error('Cannot delete payment: Transaction information is missing');
      return;
    }

    let pObj: any = null;
    let payId = '';
    if (typeof paymentOrId === 'string') {
      payId = paymentOrId;
      pObj = (payments || []).find((p: any) => p.id === payId || p.reference === payId) || null;
    } else {
      pObj = paymentOrId;
      payId = pObj.id || pObj.reference || '';
    }

    const targetStudentId = extraStudentId || pObj?.studentId || pObj?.studentUid || selectedStudentDetail?.student?.id || selectedStudentDetail?.student?.uid;
    const targetRef = pObj?.reference || pObj?.orderId || (typeof paymentOrId === 'string' ? paymentOrId : '');
    const targetComp = pObj?.component || pObj?.comp;
    const targetAmount = pObj?.amount !== undefined ? Number(pObj.amount) : undefined;

    requestConfirm(
      'Void/Delete Transaction',
      'Are you absolutely sure you want to void and delete this payment transaction? This will restore the student due balance accordingly.',
      async () => {
        try {
          toast.loading('Voiding payment transaction...', { id: 'delete-pay' });

          const res = await resilientFetch('/api/fees/void-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentId: payId,
              studentId: targetStudentId,
              reference: targetRef,
              component: targetComp,
              amount: targetAmount
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Server void payment failed with status ${res.status}`);
          }

          if (payId && !payId.startsWith('hist_') && !payId.startsWith('synth_') && !payId.startsWith('ph_')) {
            await dbService.delete('payments', payId).catch(() => {});
          }

          dbService.clearCollectionCache('payments');
          dbService.clearCollectionCache('fees');
          dbService.clearCollectionCache('students');

          toast.success('Payment transaction voided successfully', { id: 'delete-pay' });
          onRefresh();
        } catch (err: any) {
          console.error('Delete payment error:', err);
          toast.error('Failed to void payment transaction: ' + (err?.message || ''), { id: 'delete-pay' });
        }
      }
    );
  };

  const exportLedgerToCSV = () => {
    // Sort filteredMetrics by Class, Batch, then Student Name for clean grouping
    const sortedMetrics = [...filteredMetrics].sort((a, b) => {
      const classA = classes.find(c => c.id === a?.student?.classId)?.name || a?.student?.class || a?.student?.classId || '';
      const classB = classes.find(c => c.id === b?.student?.classId)?.name || b?.student?.class || b?.student?.classId || '';
      
      const classCompare = classA.localeCompare(classB, undefined, { numeric: true, sensitivity: 'base' });
      if (classCompare !== 0) return classCompare;
      
      const batchA = batches.find(b => b.id === a?.student?.batchId)?.name || a?.student?.batch || '';
      const batchB = batches.find(b => b.id === b?.student?.batchId)?.name || b?.student?.batch || '';
      const batchCompare = batchA.localeCompare(batchB, undefined, { numeric: true, sensitivity: 'base' });
      if (batchCompare !== 0) return batchCompare;
      
      const nameA = a?.student?.name || '';
      const nameB = b?.student?.name || '';
      return nameA.localeCompare(nameB);
    });

    const csvData = sortedMetrics.map(m => {
      const calc: any = m.calculation || {};
      const oldFeeConcession = Number(m?.student?.oldFeeConcession || 0);

      // Term 1 Calculations
      const term1Original = 
        Number(calc.originalSchoolTerms?.term1 || 0) + 
        Number(calc.originalHostelTerms?.term1 || 0) + 
        Number(calc.originalTransportTerms?.term1 || 0) + 
        Number(calc.iplFee || 0) + 
        Number(calc.admissionFee || 0) + 
        Number(calc.healthCardFee || 0) + 
        Number(m.student.lastClassFeeDue || 0);

      const term1Concession = 
        (Number(calc.originalSchoolTerms?.term1 || 0) - Number(calc.schoolFeeTerms?.term1 || 0)) + 
        (Number(calc.originalHostelTerms?.term1 || 0) - Number(calc.hostelFeeTerms?.term1 || 0)) + 
        (Number(calc.originalTransportTerms?.term1 || 0) - Number(calc.transportFeeTerms?.term1 || 0)) + 
        oldFeeConcession;

      const term1Net = term1Original - term1Concession;

      const term1Paid = 
        Number(m.normalizedPaid?.['term1'] || 0) + 
        Number(m.normalizedPaid?.['transport_term1'] || 0) + 
        Number(m.normalizedPaid?.['hostel_term1'] || 0) + 
        Number(m.normalizedPaid?.['admission'] || 0) + 
        Number(m.normalizedPaid?.['healthCard'] || 0) + 
        Number(m.normalizedPaid?.['ipl'] || 0) + 
        Number(m.normalizedPaid?.['lastClassFeeDue'] || 0);

      const term1Pending = Math.max(0, term1Net - term1Paid);

      // Term 2 Calculations
      const term2Original = 
        Number(calc.originalSchoolTerms?.term2 || 0) + 
        Number(calc.originalHostelTerms?.term2 || 0) + 
        Number(calc.originalTransportTerms?.term2 || 0);

      const term2Concession = 
        (Number(calc.originalSchoolTerms?.term2 || 0) - Number(calc.schoolFeeTerms?.term2 || 0)) + 
        (Number(calc.originalHostelTerms?.term2 || 0) - Number(calc.hostelFeeTerms?.term2 || 0)) + 
        (Number(calc.originalTransportTerms?.term2 || 0) - Number(calc.transportFeeTerms?.term2 || 0));

      const term2Net = term2Original - term2Concession;

      const term2Paid = 
        Number(m.normalizedPaid?.['term2'] || 0) + 
        Number(m.normalizedPaid?.['transport_term2'] || 0) + 
        Number(m.normalizedPaid?.['hostel_term2'] || 0);

      const term2Pending = Math.max(0, term2Net - term2Paid);

      // Term 3 Calculations
      const term3Original = 
        Number(calc.originalSchoolTerms?.term3 || 0) + 
        Number(calc.originalHostelTerms?.term3 || 0) + 
        Number(calc.originalTransportTerms?.term3 || 0);

      const term3Concession = 
        (Number(calc.originalSchoolTerms?.term3 || 0) - Number(calc.schoolFeeTerms?.term3 || 0)) + 
        (Number(calc.originalHostelTerms?.term3 || 0) - Number(calc.hostelFeeTerms?.term3 || 0)) + 
        (Number(calc.originalTransportTerms?.term3 || 0) - Number(calc.transportFeeTerms?.term3 || 0));

      const term3Net = term3Original - term3Concession;

      const term3Paid = 
        Number(m.normalizedPaid?.['term3'] || 0) + 
        Number(m.normalizedPaid?.['transport_term3'] || 0) + 
        Number(m.normalizedPaid?.['hostel_term3'] || 0);

      const term3Pending = Math.max(0, term3Net - term3Paid);

      return {
        'Roll Number': m?.student?.rollNumber || m?.student?.rollNo || 'N/A',
        'Student Name': m?.student?.name || 'N/A',
        'Class': classes.find(c => c.id === m?.student?.classId)?.name || m?.student?.class || m?.student?.classId || 'N/A',
        'Section/Batch': batches.find(b => b.id === m?.student?.batchId)?.name || m?.student?.batch || 'N/A',
        'Payment Status': (m?.status || '').toUpperCase(),
        
        // Term 1
        'Term 1 Total Fee (Before Concession)': term1Original,
        'Term 1 Concession Fees': term1Concession,
        'Term 1 Net Fee (Actual Collections)': term1Net,
        'Term 1 Paid Fees': term1Paid,
        'Term 1 Balance Fees': term1Pending,

        // Term 2
        'Term 2 Total Fee (Before Concession)': term2Original,
        'Term 2 Concession Fees': term2Concession,
        'Term 2 Net Fee (Actual Collections)': term2Net,
        'Term 2 Paid Fees': term2Paid,
        'Term 2 Balance Fees': term2Pending,

        // Term 3
        'Term 3 Total Fee (Before Concession)': term3Original,
        'Term 3 Concession Fees': term3Concession,
        'Term 3 Net Fee (Actual Collections)': term3Net,
        'Term 3 Paid Fees': term3Paid,
        'Term 3 Balance Fees': term3Pending,

        // Overall
        'Total Fee (Before Concession)': m.originalTotal,
        'Total Concession': m.concessionAmount,
        'Actual Collections Fee (Net Payable)': m.total,
        'Total Paid Fees': m.paid,
        'Total Balance Fees': m.pending
      };
    });

    const csvStr = Papa.unparse(csvData);
    const blob = new Blob(["\ufeff" + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Fees_Ledger_${academicYear}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Fees ledger exported cleanly to CSV!');
  };

  const exportPrevYearDuesToCSV = () => {
    // Filter to only students with previous year dues
    const targetMetrics = studentMetrics.filter(m => Number(m?.student?.lastClassFeeDue || 0) > 0);
    
    if (targetMetrics.length === 0) {
      toast.info("No students found with outstanding previous year dues.");
      return;
    }

    const csvData = targetMetrics.map(m => {
      const originalDue = Number(m?.student?.lastClassFeeDue || 0);
      const oldFeeConcession = Number(m?.student?.oldFeeConcession || 0);
      const paidAgainstDue = Number(m.paidComponents?.['lastClassFeeDue'] || 0);
      const remainingDue = Math.max(0, originalDue - oldFeeConcession - paidAgainstDue);
      const phoneNum = extractParentPhone(m?.student) || 'N/A';

      return {
        'Roll Number': m?.student?.rollNumber || m?.student?.rollNo || 'N/A',
        'Student Name': m?.student?.name || 'N/A',
        'Father Name': m?.student?.fatherName || 'N/A',
        'Class': classes.find(c => c.id === m?.student?.classId)?.name || m?.student?.class || m?.student?.classId || 'N/A',
        'Section/Batch': batches.find(b => b.id === m?.student?.batchId)?.name || m?.student?.batch || 'N/A',
        'WhatsApp/Phone': phoneNum,
        'Previous Year Due (Original)': originalDue,
        'Old Fee Concession': oldFeeConcession,
        'Amount Paid For Previous Due': paidAgainstDue,
        'Remaining Previous Due Owed': remainingDue,
        'Dues Paid Status': remainingDue <= 0 ? 'COMPLETELY_SETTLED' : (paidAgainstDue > 0 ? 'PARTIALLY_SETTLED' : 'NOT_PAID')
      };
    });

    const csvStr = Papa.unparse(csvData);
    const blob = new Blob(["\ufeff" + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Previous_Year_Fee_Dues_${academicYear}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported previous year dues for ${targetMetrics.length} students to CSV!`);
  };

  const exportConcessionsToCSV = () => {
    // Filter to only students with applied concessions (concessionAmount > 0)
    const targetMetrics = studentMetrics.filter(m => m.concessionAmount > 0);
    
    if (targetMetrics.length === 0) {
      toast.info("No students found with active concessions/scholarships under the selected cohort.");
      return;
    }

    const csvData = targetMetrics.map(m => {
      const concessionObj = concessions.find(c => c.id === m?.student?.feeConcessionType);
      const concessionText = m?.student?.feeConcessionType === 'custom'
        ? `Custom Flat Fee (₹${m?.student?.feeConcessionCustomValue || 0} Special)`
        : concessionObj
          ? `${concessionObj.name} (${concessionObj.type === 'percentage' ? `${concessionObj.value}% Off` : `₹${concessionObj.value} Off`})`
          : 'Discount Applied Scheme';

      return {
        'Roll Number': m?.student?.rollNumber || m?.student?.rollNo || 'N/A',
        'Student Name': m?.student?.name || 'N/A',
        'Father Name': m?.student?.fatherName || 'N/A',
        'Class': classes.find(c => c.id === m?.student?.classId)?.name || m?.student?.class || m?.student?.classId || 'N/A',
        'Section/Batch': batches.find(b => b.id === m?.student?.batchId)?.name || m?.student?.batch || 'N/A',
        'Concession Category': m?.student?.feeConcessionType === 'custom' ? 'Custom Flat' : (concessionObj?.name || 'Assigned Scheme'),
        'Concession Details': concessionText,
        'Full Base Fee (Original)': m.originalTotal,
        'Applied Discount (Concession)': m.concessionAmount,
        'Net Fee Payable': m.total,
        'WhatsApp / Contact': extractParentPhone(m?.student) || 'N/A'
      };
    });

    const csvStr = Papa.unparse(csvData);
    const blob = new Blob(["\ufeff" + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Students_Fee_Concessions_${academicYear}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${targetMetrics.length} student concession profiles to CSV!`);
  };

  return (
    <div id="admin-fees-view" className="space-y-4 animate-in fade-in duration-300">
      

      {/* Overview Bento Grid */}
      {activeTab === 'ledgers' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Total Collected */}
          <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-md shadow-neutral-100/15 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl -mr-6 -mt-6 group-hover:scale-150 transition-transform" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest leading-none">TOTAL COLLECTED</p>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-800 mt-1 font-sans">
                  ₹{overviewStats.totalCollected.toLocaleString()}
                </h3>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-emerald-600 font-extrabold">
              <span className="uppercase text-[8px] tracking-widest font-mono">Current Year: {academicYear}</span>
              <span className="bg-emerald-50 px-1.5 py-0.5 rounded-full text-[9px]">{overviewStats.completionRate.toFixed(1)}% Settled</span>
            </div>
          </div>

          {/* Total Pending */}
          <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-md shadow-neutral-100/15 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl -mr-6 -mt-6 group-hover:scale-150 transition-transform" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-sm shrink-0">
                  <Clock className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest leading-none">TOTAL PENDING</p>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-800 mt-1 font-sans">
                    ₹{overviewStats.totalPending.toLocaleString()}
                  </h3>
                </div>
              </div>

              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const pendingList = filteredMetrics.filter(m => m.pending > 0);
                  if (pendingList.length === 0) {
                    toast.info("No families with pending billing found.");
                    return;
                  }

                  const confirmSend = window.confirm(`Are you sure you want to send automated WhatsApp fee reminders to all ${pendingList.length} parents with pending fees (before/after due dates)?`);
                  if (!confirmSend) return;

                  toast.loading(`Starting WhatsApp broadcast for ${pendingList.length} students...`, { id: 'bulk-pending-reminders' });

                  let successCount = 0;
                  let errorCount = 0;

                  for (let i = 0; i < pendingList.length; i++) {
                    const m = pendingList[i];
                    const num = extractParentPhone(m?.student);
                    if (!num) {
                      errorCount++;
                      continue;
                    }

                    try {
                      const res = await fetch('/api/fees/reminder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          studentId: m?.student?.id || m?.student?.uid,
                          studentName: m?.student?.name,
                          fatherName: m?.student?.fatherName || m?.student?.parentName || '',
                          className: classes?.find(c => c.id === m?.student?.classId)?.name || m?.student?.class || 'N/A',
                          batchName: batches?.find(b => b.id === m?.student?.batchId)?.name || m?.student?.batch || 'N/A',
                          academicYear: m?.student?.academicYear || academicYear,
                          totalFee: m.total || 0,
                          paidFee: m.paid || 0,
                          dueFee: m.pending || 0,
                          breakdown: getStudentFeeComponents(m) || [],
                          whatsappNumber: num
                        })
                      });

                      if (res.ok) {
                        successCount++;
                      } else {
                        errorCount++;
                      }
                    } catch (err) {
                      console.error(`Error sending bulk pending reminder to ${m?.student?.name}:`, err);
                      errorCount++;
                    }

                    toast.loading(`Sending reminders: ${i + 1}/${pendingList.length} processed...`, { id: 'bulk-pending-reminders' });
                  }

                  toast.success(`Broadcast finished! Successfully sent: ${successCount}, Failed: ${errorCount}`, { id: 'bulk-pending-reminders' });
                }}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 shrink-0 cursor-pointer w-full sm:w-auto"
              >
                Send Reminders
              </button>
            </div>
            <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-amber-600 font-extrabold">
              <span className="uppercase text-[8px] tracking-widest font-mono">Across filtered students</span>
              <span className="bg-amber-50 px-1.5 py-0.5 rounded-full text-[9px]">Pending Collection</span>
            </div>
          </div>

          {/* Total Fees Concessions */}
          <div 
            onClick={exportConcessionsToCSV}
            title="Click to Download Student Concessions List"
            className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-md shadow-neutral-100/15 flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:border-pink-300 transition-all active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-pink-500/5 rounded-full blur-xl -mr-6 -mt-6 group-hover:scale-150 transition-transform" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-pink-500 hover:bg-pink-600 text-white rounded-full flex items-center justify-center shadow-sm shrink-0">
                  <Coins className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest leading-none">TOTAL CONCESSIONS</p>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-800 mt-1 font-sans">
                    ₹{overviewStats.totalConcessions.toLocaleString()}
                  </h3>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-pink-50 flex items-center justify-center group-hover:bg-pink-600 group-hover:text-white transition-all text-pink-600 shadow-inner shrink-0">
                <Download className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-pink-700 font-extrabold">
              <span className="uppercase text-[8px] tracking-widest font-mono">Click to Download CSV List</span>
              <span className="bg-pink-50 px-1.5 py-0.5 rounded-full text-[9px] flex items-center gap-0.5">
                <FileSpreadsheet className="w-2.5" /> Export List
              </span>
            </div>
          </div>

          {/* Overdue Students */}
          <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-md shadow-neutral-100/15 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 rounded-full blur-xl -mr-6 -mt-6 group-hover:scale-150 transition-transform" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest leading-none">OVERDUE STUDENTS</p>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-800 mt-1 font-sans">
                    {filteredMetrics.filter(m => m.isOverdue).length}
                  </h3>
                </div>
              </div>
              
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const overdueList = filteredMetrics.filter(m => m.isOverdue);
                  if (overdueList.length === 0) {
                    toast.info("No families with overdue billing found.");
                    return;
                  }

                  const confirmSend = window.confirm(`Are you sure you want to send automated WhatsApp fee due reminders to all ${overdueList.length} parents?`);
                  if (!confirmSend) return;

                  toast.loading(`Starting WhatsApp broadcast for ${overdueList.length} students...`, { id: 'bulk-fee-reminders' });

                  let successCount = 0;
                  let errorCount = 0;

                  for (let i = 0; i < overdueList.length; i++) {
                    const m = overdueList[i];
                    const num = extractParentPhone(m?.student);
                    if (!num) {
                      errorCount++;
                      continue;
                    }

                    try {
                      const res = await fetch('/api/fees/reminder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          studentId: m?.student?.id || m?.student?.uid,
                          studentName: m?.student?.name,
                          fatherName: m?.student?.fatherName || m?.student?.parentName || '',
                          className: classes?.find(c => c.id === m?.student?.classId)?.name || m?.student?.class || 'N/A',
                          batchName: batches?.find(b => b.id === m?.student?.batchId)?.name || m?.student?.batch || 'N/A',
                          academicYear: m?.student?.academicYear || academicYear,
                          totalFee: m.total || 0,
                          paidFee: m.paid || 0,
                          dueFee: m.pending || 0,
                          breakdown: getStudentFeeComponents(m) || [],
                          whatsappNumber: num
                        })
                      });

                      if (res.ok) {
                        successCount++;
                      } else {
                        errorCount++;
                      }
                    } catch (err) {
                      console.error(`Error sending bulk reminder to ${m?.student?.name}:`, err);
                      errorCount++;
                    }

                    // Update toast with current progress
                    toast.loading(`Sending reminders: ${i + 1}/${overdueList.length} processed...`, { id: 'bulk-fee-reminders' });
                  }

                  toast.success(`Broadcast finished! Successfully sent: ${successCount}, Failed: ${errorCount}`, { id: 'bulk-fee-reminders' });
                }}
                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 shrink-0 cursor-pointer w-full sm:w-auto"
              >
                <Send className="w-3 h-3" /> Notify All
              </button>
            </div>
            <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-red-600 font-extrabold">
              <span className="uppercase text-[8px] tracking-widest font-mono">Requires Follow-up</span>
              <span className="bg-red-50 px-1.5 py-0.5 rounded-full text-[9px]">Urgent Alert</span>
            </div>
          </div>

        </div>
      )}

      {/* Tabs Switcher and Filter Bars */}
      <div className="bg-white rounded-2xl p-4 border border-neutral-150 shadow-lg shadow-neutral-100/10 space-y-4">
        
        {/* Tab Heads */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-neutral-200/60 pb-3">
          <div className="flex flex-wrap items-center gap-1 bg-neutral-100/90 p-1.5 rounded-xl w-full xl:w-auto shadow-inner">
            {[
              { id: 'ledgers', label: 'Collection Status' },
              { id: 'structures', label: 'Fee Structures' },
              ...(!isAccountant ? [{ id: 'concessions', label: 'Concessions' }] : []),
              { id: 'transactions', label: 'Collection History' },
              { id: 'expenditures', label: 'Expenditures' },
              { id: 'balance_sheet', label: 'Balance Sheet' },
              ...(isAccountantOrAdmin ? [{ id: 'receipt_books', label: 'Receipt Books' }] : [])
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-[10.5px] md:text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-200/30 scale-[1.01]' 
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {/* VERY COMPACT ACADEMIC YEAR DROPDOWN BESIDE BALANCE SHEET */}
            <div className="h-4 w-[1px] bg-neutral-300 mx-1 shrink-0" />
            <div className="relative flex items-center bg-white border border-neutral-200 hover:border-neutral-300 rounded-md px-1.5 py-0.5 shadow-2xs transition-all shrink-0">
              <span className="text-[7.5px] font-black uppercase text-neutral-450 mr-1 font-mono">Session:</span>
              <select
                value={selectedStructureYear}
                onChange={(e) => setSelectedStructureYear(e.target.value)}
                className="bg-transparent text-[8.5px] font-black uppercase tracking-wider text-neutral-700 outline-none pr-3 appearance-none cursor-pointer font-bold"
              >
                {settings.academicYears?.map((year: string) => (
                  <option key={year} value={year}>{year}</option>
                )) || <option value="2026-27">2026-27</option>}
              </select>
              <ChevronDown className="w-2 h-2 text-neutral-500 absolute right-0.5 pointer-events-none" />
            </div>

            {/* SMALL NEW CLASS FEE CONFIG BUTTON PLACED IN THE MENU BAR */}
            {activeTab === 'structures' && !isViewOnlyUser && (
              <>
                <div className="h-4 w-[1px] bg-neutral-300 mx-1 shrink-0" />
                <button 
                  onClick={() => {
                    setEditingStructure({ academicYear: selectedStructureYear, type: 'school' });
                    setShowStructureModal(true);
                  }}
                  className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-md text-[8.5px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-xs transition-all shrink-0 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" /> Add Class Fee
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Action buttons depending on tab */}
            {activeTab === 'ledgers' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button 
                  onClick={exportLedgerToCSV}
                  className="px-2.5 py-1.5 border border-neutral-200 hover:border-neutral-300 rounded-lg text-[10px] font-black uppercase tracking-wider text-neutral-600 font-mono flex items-center gap-1 shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Export Ledgers
                </button>
                <button 
                  onClick={exportPrevYearDuesToCSV}
                  className="px-2.5 py-1.5 border border-indigo-200 bg-indigo-50/20 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg text-[10px] font-black uppercase tracking-wider text-indigo-700 font-mono flex items-center gap-1 shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" /> Export Previous Year Dues
                </button>
                <button 
                  onClick={exportConcessionsToCSV}
                  className="px-2.5 py-1.5 border border-pink-200 bg-pink-50/20 hover:bg-pink-50 hover:border-pink-300 rounded-lg text-[10px] font-black uppercase tracking-wider text-pink-700 font-mono flex items-center gap-1 shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-pink-600" /> Export Concessions
                </button>
              </div>
            )}
            {activeTab === 'structures' && null}
            {activeTab === 'concessions' && !isAccountant && (
              <button 
                onClick={() => {
                  setEditingConcessionCat({
                    type: 'percentage',
                    appliedTo: 'school',
                    name: '',
                    value: undefined,
                    description: ''
                  });
                  setShowConcessionCatModal(true);
                }}
                className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Concession Scheme
              </button>
            )}
            {activeTab === 'expenditures' && (
              <div className="flex gap-1.5">
                <button 
                  onClick={() => {
                    setShowManageCategoriesModal(true);
                  }}
                  className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-150 text-neutral-800 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-neutral-200 shadow-xs cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-neutral-500" /> Categories
                </button>
                <button 
                  onClick={() => {
                    setExpDate(new Date().toISOString().split('T')[0]);
                    setExpCategory((expCategories.length > 0 ? expCategories : DEFAULT_CATEGORIES)[0] || 'Other');
                    setExpAmount('');
                    setExpRef('');
                    setExpDescription('');
                    setShowExpenditureModal(true);
                  }}
                  className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Record Expense
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab specific content */}
        <AnimatePresence mode="wait">
          
          {/* TAB: STUDENT LEDGERS */}
          {activeTab === 'ledgers' && (
            <motion.div
              key="ledgers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              
              {/* Row Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search by name, roll no..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 font-semibold text-xs"
                  />
                </div>

                <div>
                  <select
                    value={selectedClass}
                    onChange={(e) => {
                      setSelectedClass(e.target.value);
                      setSelectedBatch('');
                    }}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 font-semibold text-xs text-neutral-600 appearance-none uppercase cursor-pointer"
                  >
                    <option value="">-- All Classes --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    disabled={!selectedClass}
                    value={selectedBatch}
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 font-semibold text-xs text-neutral-600 appearance-none uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {!selectedClass ? '-- Select Class First --' : '-- All Sections --'}
                    </option>
                    {visibleBatches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 font-semibold text-xs text-neutral-600 appearance-none uppercase animate-none cursor-pointer"
                  >
                    <option value="all">-- All Payment Status --</option>
                    <option value="overdue">Overdue (Term Due Past)</option>
                    <option value="paid">Fully Settled (Paid)</option>
                    <option value="partial">Partially Overdue</option>
                    <option value="unpaid">Zero Payments Received</option>
                    <option value="no_fees">No Fees Configured</option>
                  </select>
                </div>
              </div>

              {/* Table wrapper */}
              <div className="overflow-x-auto border border-neutral-100 rounded-xl shadow-xs bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b-2 border-indigo-500 text-[11px] font-extrabold uppercase text-white shadow-md">
                      <th 
                        className="px-4.5 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all font-mono rounded-tl-2xl text-indigo-300 hover:text-indigo-200"
                        onClick={() => handleFeeSort('rollNumber')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>ROLL NO</span>
                          {feeSortField === 'rollNumber' ? (
                            feeSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-300" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-300" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4.5 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-emerald-300 hover:text-emerald-200"
                        onClick={() => handleFeeSort('name')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>STUDENT DETAILS (Total: {filteredMetrics.length})</span>
                          {feeSortField === 'name' ? (
                            feeSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-300" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-300" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4.5 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-sky-300 hover:text-sky-200"
                        onClick={() => handleFeeSort('class')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>CLASS / BATCH</span>
                          {feeSortField === 'class' ? (
                            feeSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-sky-300" /> : <ArrowDown className="w-3.5 h-3.5 text-sky-300" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4.5 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-amber-300 hover:text-amber-200"
                        onClick={() => handleFeeSort('amount')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>AMOUNT</span>
                          {feeSortField === 'amount' ? (
                            feeSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-300" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-300" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4.5 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-pink-300 hover:text-pink-200"
                        onClick={() => handleFeeSort('concession')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>CONCESSION TYPE</span>
                          {feeSortField === 'concession' ? (
                            feeSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-pink-300" /> : <ArrowDown className="w-3.5 h-3.5 text-pink-300" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4.5 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-rose-300 hover:text-rose-250"
                        onClick={() => handleFeeSort('status')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>STATUS</span>
                          {feeSortField === 'status' ? (
                            feeSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-300" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-300" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th className="px-4.5 py-4 text-right text-purple-300 rounded-tr-2xl">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-sm font-bold text-neutral-700">
                    {paginatedMetrics.length > 0 ? (
                      paginatedMetrics.map(m => {
                        const sClass = classes.find(c => c.id === m?.student?.classId)?.name || m?.student?.class || 'N/A';
                        const sBatch = batches.find(b => b.id === m?.student?.batchId)?.name || m?.student?.batch || 'N/A';
                        
                        // Status determination
                        const outstanding = m.pending;
                        const paidAmt = m.paid;
                        let statusBadge = null;
                        
                        if (m.status === 'no_fees') {
                          statusBadge = (
                            <span className="inline-flex items-center justify-center px-3 py-1.5 bg-neutral-100 text-neutral-600 border border-neutral-200 rounded-full text-[9px] font-black tracking-widest uppercase leading-none shadow-xs">
                              No Fees Configured
                            </span>
                          );
                        } else if (m.status === 'paid') {
                          statusBadge = (
                            <span className="inline-flex items-center justify-center px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[9px] font-black tracking-widest uppercase leading-none">
                              Fully Paid
                            </span>
                          );
                        } else if (m.status === 'partial') {
                          statusBadge = (
                            <span className="inline-flex items-center justify-center px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[9px] font-black tracking-widest uppercase leading-none">
                              Partial
                            </span>
                          );
                        } else {
                          statusBadge = (
                            <span className="inline-flex items-center justify-center px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full text-[9px] font-black tracking-widest uppercase leading-none">
                              Pending
                            </span>
                          );
                        }

                        const studentId = m.student.uid || m.student.id;
                        const isExpanded = !!expandedStudentIds[studentId];
                        return (
                          <React.Fragment key={studentId}>
                            <tr className="hover:bg-neutral-50/50 transition-colors">
                              <td className="px-4.5 py-3 font-mono text-sm font-black text-slate-800">
                              {m.student.rollNumber || m.student.rollNo || '001'}
                            </td>

                            <td className="px-4.5 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center font-black text-xs uppercase border border-indigo-100/55 shrink-0 shadow-xs">
                                  {m.student.name?.slice(0, 2) || 'ST'}
                                </div>
                                <div className="leading-tight">
                                  <h4 className={`font-extrabold text-sm tracking-tight ${(String(m.student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-neutral-800'}`}>{m.student.name}</h4>
                                  <p className="text-[10px] text-neutral-400 font-semibold mt-0.5 uppercase tracking-wide">
                                    S/O: {m.student.fatherName || m.student.parentName || 'N/A'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            
                            <td className="px-4.5 py-3">
                              <div className="leading-tight">
                                <span className="inline-block px-2 py-0.5 bg-neutral-100 text-neutral-600 border border-neutral-200/60 rounded-md text-[10px] font-extrabold uppercase tracking-wide">
                                  {sClass}
                                </span>
                                <div className="text-[10px] text-neutral-400 mt-1 uppercase font-semibold">{sBatch}</div>
                              </div>
                            </td>

                            <td 
                              className="px-4.5 py-3 text-xs cursor-pointer hover:bg-neutral-100/60 select-none group/amt transition-all border-l-2 border-transparent hover:border-amber-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStudentDetails(studentId);
                              }}
                              title="Click to expand/collapse fee breakdown"
                            >
                              <div className="leading-tight">
                                <div className="text-sm font-black text-neutral-800 font-sans flex items-center gap-1.5 group-hover/amt:text-amber-600 transition-colors">
                                  ₹{m.total.toLocaleString()}
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-neutral-400 opacity-60 group-hover/amt:opacity-100 shrink-0" />
                                  )}
                                </div>
                                <div className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wider font-semibold font-sans">
                                  School Fee: ₹{m.originalTotal.toLocaleString()}
                                </div>
                                {outstanding > 0 ? (
                                  <div className="text-[10px] font-mono mt-1 flex flex-wrap items-center gap-1 font-bold">
                                    <span className="text-emerald-600">PAID: ₹{paidAmt.toLocaleString()}</span>
                                    <span className="text-red-500">DUE: ₹{outstanding.toLocaleString()}</span>
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-emerald-600 font-black mt-1 font-mono">
                                    PAID: ₹{paidAmt.toLocaleString()} (CLEARED)
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="px-4.5 py-3">
                              {(() => {
                                const concessionObj = concessions.find(c => c.id === m.student.feeConcessionType);
                                const hasConcession = m.student.feeConcessionType && m.student.feeConcessionType !== 'none';
                                const concessionReason = (m.student as any).feeConcessionReason || (m.student as any).concessionReason;
                                return hasConcession ? (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-xs font-black uppercase tracking-tight shadow-3xs">
                                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                      {m.student.feeConcessionType === 'custom' ? 'Custom Flat' : (concessionObj?.name || 'Discount Scheme')}
                                    </span>
                                    <div className="text-xs font-black text-amber-700 font-mono">
                                      {m.student.feeConcessionType === 'custom' 
                                        ? `-₹${(m.student.feeConcessionAmount || (m.student as any).feeConcessionCustomValue || m.concessionAmount || 0).toLocaleString()} OFF` 
                                        : concessionObj 
                                          ? `${concessionObj.type === 'percentage' ? `${concessionObj.value}% OFF` : `-₹${concessionObj.value} OFF`}`
                                          : `-₹${m.concessionAmount.toLocaleString()} OFF`}
                                    </div>
                                    <div className="text-[10px] font-bold text-neutral-500 font-mono">
                                      Gross: ₹{m.originalTotal.toLocaleString()} → Net: ₹{m.total.toLocaleString()}
                                    </div>
                                    {concessionReason && (
                                      <p className="text-[9.5px] font-medium text-neutral-600 italic line-clamp-1">
                                        Remark: {concessionReason}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-neutral-400 font-mono text-xs font-semibold uppercase tracking-wider block">
                                    &mdash;
                                  </span>
                                );
                              })()}
                            </td>

                            <td className="px-4.5 py-3">
                              {statusBadge}
                              {(() => {
                                const studentId = m.student.uid || m.student.id;
                                const extObj = extendedDueDates.find((e: any) => e.studentId === studentId && e.extendedDate);
                                const activeExtDate = extObj?.extendedDate || m.student.extendedDueDate;
                                if (activeExtDate) {
                                  return (
                                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-md text-[9px] font-black uppercase tracking-tight font-mono">
                                      <CalendarCheck className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                                      <span>Ext Due: {activeExtDate}</span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </td>

                            <td className="px-4.5 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                                              {!isViewOnlyUser ? (
                                  <button
                                    onClick={() => {
                                      setSelectedStudentForPayment(m);
                                      const components = getStudentFeeComponents(m);
                                      const initialSelection: Record<string, boolean> = {};
                                      const initialAmounts: Record<string, string> = {};
                                      const initialCategories: Record<string, boolean> = {};
                                      
                                      components.forEach(c => {
                                        const paid = Number(m.paidComponents?.[c.id] || 0);
                                        const remaining = Math.max(0, c.amount - paid);
                                        const hasBalance = remaining > 0;
                                        initialSelection[c.id] = hasBalance;
                                        initialAmounts[c.id] = hasBalance ? remaining.toString() : '0';
                                        
                                        if (hasBalance) {
                                          let catId = 'other';
                                          if (['term1', 'term2', 'term3'].includes(c.id)) {
                                            catId = 'academic';
                                          } else if (c.id.includes('transport')) {
                                            catId = 'transport';
                                          } else if (c.id.includes('hostel')) {
                                            catId = 'hostel';
                                          } else if (c.id === 'lastClassFeeDue') {
                                            catId = 'previous_dues';
                                          } else if (c.id === 'admission') {
                                            catId = 'admission';
                                          }
                                          initialCategories[catId] = true;
                                        }
                                      });
                                      
                                      setCheckoutSelectedMap(initialSelection);
                                      setCheckoutAmounts(initialAmounts);
                                      setActiveCheckoutCategories(initialCategories);
                                      const phone = extractParentPhone(m.student);
                                      setParentWhatsApp(phone);
                                      setPaymentRef('TXN-' + Math.floor(100000 + Math.random() * 900000) + '-' + Date.now().toString().slice(-4));
                                      setShowPaymentModal(true);
                                    }}
                                    className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:scale-105 active:scale-95 transition-all rounded-lg border border-emerald-100 shadow-xs cursor-pointer inline-flex items-center justify-center shrink-0"
                                    title="Record Payment Checkout"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <div 
                                    className="p-2 bg-neutral-50 text-neutral-300 rounded-lg border border-neutral-100 inline-flex items-center justify-center shrink-0 cursor-not-allowed"
                                    title="View Only (Access Restricted)"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 opacity-60" />
                                  </div>
                                )}

                                {/* WHATSAPP TRIGGER */}
                                <button
                                  onClick={() => {
                                    const phone = m.student.whatsappNumber || m.student.parentPhone || m.student.phone || '';
                                    if (!phone) {
                                      toast.error(`No Whatsapp number found for ${m.student.name}`);
                                      return;
                                    }
                                    if (outstanding === 0) {
                                      toast.info(`${m.student.name} is fully paid.`);
                                      return;
                                    }
                                    const msg = `Dear Parent, this is an automated fee reminder for *${m.student.name}*. Total Due: *₹${outstanding.toLocaleString()}*. Please settle soon. Thank you!`;
                                    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                                    toast.success("Opening safe parents WhatsApp trigger...");

                                    dbService.create('whatsapp_audit_logs', `log_man_rem_${m.student.id || m.student.uid || 'unknown'}_${Date.now()}`, {
                                      event: "fee_receipt_manual_redirect_used",
                                      timestamp: new Date().toISOString(),
                                      payload: {
                                        recipient: phone,
                                        studentId: m.student.id || m.student.uid || 'none',
                                        outstanding: outstanding
                                      }
                                    }).catch(err => console.warn("Failed to log manual redirect:", err));
                                  }}
                                  className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:scale-105 active:scale-95 transition-all rounded-lg border border-rose-100 shadow-xs cursor-pointer inline-flex items-center justify-center shrink-0"
                                  title="WhatsApp Reminder"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>

                                {/* LEDGER DETAILS */}
                                <button
                                  onClick={() => setSelectedStudentDetail(m)}
                                  className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 active:scale-95 transition-all rounded-lg border border-blue-100 shadow-xs cursor-pointer inline-flex items-center justify-center shrink-0"
                                  title="Open Full Ledger details"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>

                                {/* DUE DATE EXTENSION */}
                                {canExtendDueDate && (
                                  <button
                                    onClick={() => {
                                      setSelectedStudentForExtension(m);
                                      const activeComps = getStudentFeeComponents(m);
                                      setSelectedExtensionComponent(activeComps[0]?.id || 'term1');
                                      setExtendedDate(new Date().toISOString().split('T')[0]);
                                      setExtensionReason('');
                                      setShowExtensionModal(true);
                                    }}
                                    className="p-2 bg-purple-50 text-purple-600 hover:bg-purple-100 hover:scale-105 active:scale-95 transition-all rounded-lg border border-purple-100 shadow-xs cursor-pointer inline-flex items-center justify-center shrink-0"
                                    title="Extend Due Date"
                                  >
                                    <CalendarCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* CONCESSIONS & EXTENSION DUE DATE */}
                                {!isAccountant && (
                                  <button
                                    onClick={() => {
                                      setSelectedStudentForConcession(m);
                                      setConcessionType(m.student.feeConcessionType || '');
                                      setCustomConcessionAmt(m.student.feeConcessionAmount || '');
                                      setOldFeeConcession(m.student.oldFeeConcession || '');
                                      const studentId = m.student.uid || m.student.id;
                                      const extObj = extendedDueDates.find((e: any) => e.studentId === studentId && e.extendedDate);
                                      setConcessionExtDate(extObj?.extendedDate || m.student.extendedDueDate || '');
                                      setConcessionExtNotes(extObj?.reason || m.student.extendedDueDateNotes || '');
                                      setShowConcessionModal(true);
                                    }}
                                    className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:scale-105 active:scale-95 transition-all rounded-lg border border-amber-100 shadow-xs cursor-pointer inline-flex items-center justify-center shrink-0"
                                    title="Manage Scholar Discount & Extension Due Date"
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-neutral-50/50 border-t border-b border-dashed border-neutral-100/70">
                              <td colSpan={7} className="p-4 px-6">
                                <div className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-xs">
                                  <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
                                    <div className="flex items-center gap-2">
                                      <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                                      <h4 className="font-extrabold text-sm text-neutral-800 uppercase tracking-tight">
                                        Applied Fee Structure & Payments Breakdown
                                      </h4>
                                    </div>
                                    <div className="text-xs text-neutral-400 font-mono font-bold">
                                      Dues calculated for Session {selectedStructureYear}
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {getStudentFeeComponents(m).map(c => {
                                      const itemPaid = Number(m.paidComponents?.[c.id] || 0);
                                      const itemRemaining = Math.max(0, c.amount - itemPaid);
                                      const itemPercent = c.amount > 0 ? Math.min(100, Math.round((itemPaid / c.amount) * 100)) : 0;
                                      
                                      let progressBg = "bg-rose-500";
                                      let textBadgeColor = "bg-rose-50 border-rose-200 text-rose-700";
                                      let statusName = "Unpaid";
                                      if (itemPercent === 100) {
                                        progressBg = "bg-emerald-500";
                                        textBadgeColor = "bg-emerald-50 border-emerald-200 text-emerald-700";
                                        statusName = "Fully Paid";
                                      } else if (itemPercent > 0) {
                                        progressBg = "bg-amber-500";
                                        textBadgeColor = "bg-amber-50 border-amber-200 text-amber-700";
                                        statusName = "Partial";
                                      }
                                      
                                      return (
                                        <div key={c.id} className="bg-neutral-50/50 rounded-xl p-3.5 border border-neutral-200/60 leading-tight">
                                          <div className="flex items-start justify-between gap-2 mb-2.5">
                                            <div className="max-w-[70%]">
                                              <span className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">
                                                {c.id.includes('transport') ? 'Transport Route' : c.id.includes('hostel') ? 'Hostel Facility' : 'Academic Board'}
                                              </span>
                                              <h5 className="font-bold text-xs text-neutral-800 line-clamp-1 mt-0.5">
                                                {c.label}
                                              </h5>
                                            </div>
                                            <span className={`inline-flex items-center px-1.5 py-0.5 border rounded-full text-[8.5px] font-black uppercase tracking-wider leading-none ${textBadgeColor}`}>
                                              {statusName}
                                            </span>
                                          </div>
                                          
                                          <div className="grid grid-cols-3 gap-1 text-center bg-white rounded-lg p-2 mb-2.5 border border-neutral-100 font-sans">
                                            <div>
                                              <div className="text-[8px] uppercase font-bold text-neutral-400">APPLIED</div>
                                              <div className="text-[11px] font-black text-neutral-700 mt-0.5">₹{c.amount.toLocaleString()}</div>
                                            </div>
                                            <div className="border-x border-neutral-100">
                                              <div className="text-[8px] uppercase font-bold text-neutral-400">PAID</div>
                                              <div className="text-[11px] font-black text-emerald-600 mt-0.5">₹{itemPaid.toLocaleString()}</div>
                                            </div>
                                            <div>
                                              <div className="text-[8px] uppercase font-bold text-neutral-400">DUE</div>
                                              <div className="text-[11px] font-black text-rose-500 mt-0.5">₹{itemRemaining.toLocaleString()}</div>
                                            </div>
                                          </div>
                                          
                                          <div>
                                            <div className="flex items-center justify-between text-[9px] font-bold text-neutral-500 mb-1">
                                              <span>Collect Status</span>
                                              <span>{itemPercent}%</span>
                                            </div>
                                            <div className="w-full bg-neutral-100 h-1 rounded-full overflow-hidden">
                                              <div className={`h-full rounded-full transition-all duration-500 ${progressBg}`} style={{ width: `${itemPercent}%` }} />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-neutral-400 font-bold uppercase tracking-wider font-mono text-xs">
                          No student matching that filters found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {filteredMetrics.length > itemsPerPage && (
                  <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-neutral-50/50 border-t border-neutral-100 font-mono text-[10px] text-neutral-500 font-bold uppercase tracking-wider gap-4">
                    <div>
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredMetrics.length)} of {filteredMetrics.length} students
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className="px-3 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-50 disabled:pointer-events-none rounded-lg cursor-pointer transition-all active:scale-95 text-neutral-700 font-bold"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={currentPage >= Math.ceil(filteredMetrics.length / itemsPerPage)}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="px-3 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-50 disabled:pointer-events-none rounded-lg cursor-pointer transition-all active:scale-95 text-neutral-700 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </motion.div>
          )}

          {/* TAB: TRANSACTION LOGS / COLLECTION HISTORY */}
          {activeTab === 'transactions' && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Header Bar: Status & Search */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1">
                <div>
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono block">Collection History Ledger</span>
                  <span className="text-emerald-600 font-mono text-[10px] font-black uppercase">
                    {filteredTransPayments.length} of {baseTransPayments.length} Entries Recorded
                  </span>
                </div>

                {/* SEARCH INPUT */}
                <div className="relative w-full sm:w-96 bg-white rounded-2xl border border-neutral-200/90 p-1.5 flex items-center shadow-xs">
                  <Search className="w-4 h-4 text-neutral-400 ml-2 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={transSearchQuery}
                    onChange={(e) => {
                      setTransSearchQuery(e.target.value);
                      setTransCurrentPage(1);
                    }}
                    placeholder="Search code, receipt #, student name, or component..."
                    className="w-full bg-transparent text-xs text-neutral-800 placeholder-neutral-400 font-medium focus:outline-none"
                  />
                  {transSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setTransSearchQuery('');
                        setTransCurrentPage(1);
                      }}
                      className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg mr-1 cursor-pointer"
                      title="Clear Search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto border border-neutral-100 rounded-2xl bg-white shadow-xs">
                <table className="w-full text-left border-collapse animate-none">
                  <thead>
                    <tr className="bg-neutral-900 text-white border-b border-neutral-800 text-[10px] font-black uppercase tracking-wider">
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-neutral-800 transition-all"
                        onClick={() => handleTransSort('reference')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Transaction Code</span>
                          {transSortField === 'reference' ? (
                            transSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-neutral-800 transition-all"
                        onClick={() => handleTransSort('serialNumber')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Receipt Number</span>
                          {transSortField === 'serialNumber' ? (
                            transSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-neutral-800 transition-all"
                        onClick={() => handleTransSort('studentName')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Student</span>
                          {transSortField === 'studentName' ? (
                            transSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-neutral-800 transition-all"
                        onClick={() => handleTransSort('method')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Payment Method</span>
                          {transSortField === 'method' ? (
                            transSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-neutral-800 transition-all"
                        onClick={() => handleTransSort('component')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Settled Component</span>
                          {transSortField === 'component' ? (
                            transSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-neutral-800 transition-all"
                        onClick={() => handleTransSort('date')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Payment Date</span>
                          {transSortField === 'date' ? (
                            transSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer select-none group hover:bg-neutral-800 transition-all"
                        onClick={() => handleTransSort('amount')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Authorized Amount</span>
                          {transSortField === 'amount' ? (
                            transSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-neutral-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-right">Receipt Sheet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-xs text-neutral-600">
                    {paginatedTransPayments.length > 0 ? (
                      paginatedTransPayments.map(p => {
                        const studObj = students.find(s => s.uid === p.studentId || s.id === p.studentId);
                        const metric = studentMetrics.find(m => m.student.uid === p.studentId || m.student.id === p.studentId);
                        const status = metric?.status || 'unpaid';

                        let rowBg = 'hover:bg-neutral-50/50';
                        if (status === 'paid') {
                          rowBg = 'bg-emerald-50/40 hover:bg-emerald-50/70 border-l-[4px] border-l-emerald-600';
                        } else if (status === 'partial') {
                          rowBg = 'bg-amber-50/40 hover:bg-amber-50/70 border-l-[4px] border-l-amber-600';
                        } else {
                          rowBg = 'bg-rose-50/40 hover:bg-rose-50/70 border-l-[4px] border-l-rose-600';
                        }

                        return (
                          <tr key={p.id} className={`${rowBg} transition-all font-medium`}>
                            <td className="px-6 py-4 font-mono font-bold text-sidebar uppercase animate-none">
                              {p.reference || p.id || 'N/A'}
                            </td>
                            <td className="px-6 py-4 font-mono font-black text-indigo-700">
                              {p.serialNumber || 'N/A'}
                            </td>
                            <td className="px-6 py-4 font-bold text-neutral-850">
                              <div className="flex flex-col gap-1">
                                <span className={(String(studObj?.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : ''}>{studObj?.name || `ID: ${p.studentId}`}</span>
                                <span className={`self-start text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded-md font-mono ${
                                  status === 'paid' ? 'bg-emerald-100/80 text-emerald-800' :
                                  status === 'partial' ? 'bg-amber-100/80 text-amber-800' :
                                  'bg-rose-100/80 text-rose-850'
                                }`}>
                                  {status === 'paid' ? 'Fully Paid' : status === 'partial' ? 'Partially Paid' : 'Not Paid'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 text-neutral-600 rounded-full font-mono text-[9px] font-black uppercase">
                                {p.method?.replace('_', ' ') || 'Cash Only'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-neutral-700 text-[11px]">
                                {getComponentNameLabel(p.component || 'term1')}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono">
                              {p.date ? new Date(p.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : 'N/A'}
                            </td>
                            <td className="px-6 py-4 font-mono font-black text-emerald-600 text-sm">
                              ₹{Number(p.amount || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedReceipt(p);
                                    setShowReceiptModal(true);
                                  }}
                                  className="p-1 px-3 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                                  title="Print Receipt"
                                >
                                  <Printer className="w-3.5 h-3.5" /> Print
                                </button>
                                {!isVicePrincipal ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePayment(p)}
                                    className="p-1 px-3 border border-rose-250 bg-rose-50 hover:bg-rose-100 hover:border-rose-350 text-rose-600 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                                    title="Void Transaction"
                                  >
                                    Void
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-bold uppercase text-neutral-400 px-2 py-1">View Only</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-12 text-center text-neutral-400 font-bold uppercase tracking-wider">
                          {transSearchQuery ? `No transactions match "${transSearchQuery}"` : 'No transactions recorded yet in the database.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {filteredTransPayments.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-neutral-50/80 border-t border-neutral-100 font-mono text-[11px] text-neutral-600 font-medium gap-4">
                    <div>
                      Showing <span className="font-black text-neutral-800">{(transCurrentPage - 1) * transItemsPerPage + 1}</span> to{' '}
                      <span className="font-black text-neutral-800">{Math.min(transCurrentPage * transItemsPerPage, filteredTransPayments.length)}</span> of{' '}
                      <span className="font-black text-neutral-800">{filteredTransPayments.length}</span> transactions
                      {transTotalPages > 1 && (
                        <span className="ml-2 text-neutral-400">(Page {transCurrentPage} of {transTotalPages})</span>
                      )}
                    </div>

                    {transTotalPages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={transCurrentPage === 1}
                          onClick={() => setTransCurrentPage(1)}
                          className="px-2.5 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:pointer-events-none rounded-lg cursor-pointer transition-all text-xs font-bold"
                          title="First Page"
                        >
                          First
                        </button>
                        <button
                          type="button"
                          disabled={transCurrentPage === 1}
                          onClick={() => setTransCurrentPage(prev => Math.max(1, prev - 1))}
                          className="px-3 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:pointer-events-none rounded-lg cursor-pointer transition-all text-xs font-bold"
                        >
                          Previous
                        </button>

                        <div className="flex items-center gap-1 mx-1">
                          {Array.from({ length: Math.min(5, transTotalPages) }, (_, i) => {
                            let pageNum = transCurrentPage - 2 + i;
                            if (pageNum < 1) pageNum = i + 1;
                            if (pageNum > transTotalPages) pageNum = transTotalPages - (4 - i);
                            if (pageNum < 1 || pageNum > transTotalPages) return null;
                            return (
                              <button
                                key={pageNum}
                                type="button"
                                onClick={() => setTransCurrentPage(pageNum)}
                                className={`w-7 h-7 rounded-lg text-xs font-black font-mono transition-all cursor-pointer ${
                                  transCurrentPage === pageNum
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          disabled={transCurrentPage >= transTotalPages}
                          onClick={() => setTransCurrentPage(prev => Math.min(transTotalPages, prev + 1))}
                          className="px-3 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:pointer-events-none rounded-lg cursor-pointer transition-all text-xs font-bold"
                        >
                          Next
                        </button>
                        <button
                          type="button"
                          disabled={transCurrentPage >= transTotalPages}
                          onClick={() => setTransCurrentPage(transTotalPages)}
                          className="px-2.5 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:pointer-events-none rounded-lg cursor-pointer transition-all text-xs font-bold"
                          title="Last Page"
                        >
                          Last
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB: BILLING STRUCTURES */}
          {activeTab === 'structures' && (
            <motion.div
              key="structures"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                <div>
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono block">Defined Billing Classes & Infrastructure Layout structures</span>
                  <span className="text-indigo-600 font-mono text-[10px] font-black uppercase">{feeStructures.length} Structures Operational</span>
                </div>

                {/* SEARCH INPUT FOR STRUCTURE NAME */}
                <div className="relative w-full md:w-80 bg-neutral-50 rounded-2xl border border-neutral-200/80 p-1 flex items-center shadow-xs">
                  <div className="pl-3 text-neutral-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search fee structures by name..."
                    value={structureSearchQuery}
                    onChange={(e) => setStructureSearchQuery(e.target.value)}
                    className="w-full bg-transparent pl-2.5 pr-4 py-2 text-xs font-bold text-neutral-850 placeholder-neutral-400 outline-none"
                  />
                  {structureSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStructureSearchQuery('')}
                      className="p-1.5 hover:bg-neutral-200/70 text-neutral-400 hover:text-neutral-600 rounded-lg transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* MULTI DELETE FLOATING CONTROL ACTION BAR */}
              {(isAdmin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'management' || profile?.role === 'principal') && selectedStructureIds.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-rose-900 uppercase">Multi-Select Management Active</h4>
                      <p className="text-[10px] text-rose-600 font-bold font-mono uppercase">{selectedStructureIds.length} Fee Structure(s) Selected</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedStructureIds([])}
                      className="px-3 py-1.5 border border-rose-350 bg-white hover:bg-rose-100 text-rose-700 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer"
                    >
                      Cancel Selection
                    </button>
                    <button
                      onClick={handleDeleteSelectedStructures}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Selected
                    </button>
                  </div>
                </div>
              )}

              {/* 1. SCHOOL FEE TABLES */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Building className="w-5 h-5 animate-none" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-sidebar uppercase tracking-wider flex items-center gap-2 animate-none">
                      School Core Fee Configurations
                    </h3>
                    <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest font-mono">
                      Target classes, academic base terms, admissions, and welfare card values (Academic Session 2026-27)
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto border border-neutral-100 rounded-2xl bg-white shadow-xl shadow-neutral-100/30">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-blue-700 text-[10px] font-black text-white uppercase tracking-wider font-mono border-b border-indigo-400">
                        {isManagementOrAdmin && (
                          <th className="px-4 py-4.5 w-12 text-center rounded-tl-2xl">
                            <input
                              type="checkbox"
                              checked={
                                sortedSchoolStructures.length > 0 &&
                                sortedSchoolStructures.every(s => selectedStructureIds.includes(s.id!))
                              }
                              onChange={(e) => {
                                const ids = sortedSchoolStructures.map(s => s.id!).filter(Boolean);
                                if (e.target.checked) {
                                  setSelectedStructureIds(prev => Array.from(new Set([...prev, ...ids])));
                                } else {
                                  setSelectedStructureIds(prev => prev.filter(id => !ids.includes(id)));
                                }
                              }}
                              className="rounded border-none accent-indigo-600 bg-indigo-900/40 text-indigo-600 w-4 h-4 cursor-pointer"
                            />
                          </th>
                        )}
                        <th className={`px-6 py-4.5 ${!isManagementOrAdmin ? 'rounded-tl-2xl' : ''}`}>
                          <button
                            type="button"
                            onClick={() => handleSchoolSort('name')}
                            className="inline-flex items-center gap-1.5 hover:text-white/80 transition-colors text-left uppercase tracking-wider font-extrabold text-indigo-50"
                          >
                            Structure Name
                            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-200" />
                          </button>
                        </th>
                        <th className="px-6 py-4.5 text-indigo-100 font-extrabold">Term 1</th>
                        <th className="px-6 py-4.5 text-indigo-100 font-extrabold">Term 2</th>
                        <th className="px-6 py-4.5 text-indigo-100 font-extrabold">Term 3</th>
                        <th className="px-6 py-4.5 text-indigo-100">
                          <button
                            type="button"
                            onClick={() => handleSchoolSort('total')}
                            className="inline-flex items-center gap-1.5 hover:text-white/80 transition-colors uppercase tracking-wider font-extrabold text-indigo-50"
                          >
                            Total Value
                            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-200" />
                          </button>
                        </th>
                        <th className="px-6 py-4.5 text-right rounded-tr-2xl text-indigo-100 font-extrabold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-xs font-semibold text-neutral-600">
                      {sortedSchoolStructures.length > 0 ? (
                        sortedSchoolStructures.map(str => {
                          const computedTotal = (str.term1 || 0) + (str.term2 || 0) + (str.term3 || 0);
                          const isKindergarten = ["nursery", "lkg", "ukg"].some(k => (str.name || '').toLowerCase().includes(k));
                          
                          return (
                            <tr key={str.id || str.name} className="hover:bg-indigo-50/30 transition-all font-medium border-l-4 border-indigo-500/0 hover:border-indigo-500">
                              {isManagementOrAdmin && (
                                <td className="px-4 py-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedStructureIds.includes(str.id!)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedStructureIds(prev => [...prev, str.id!]);
                                      } else {
                                        setSelectedStructureIds(prev => prev.filter(id => id !== str.id!));
                                      }
                                    }}
                                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer animate-none"
                                  />
                                </td>
                              )}
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 rounded-xl shadow-xs border border-indigo-200">
                                    <School className="w-4 h-4" />
                                  </div>
                                  <div className="font-extrabold text-slate-800 uppercase tracking-tight text-[13px]">{str.name}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-blue-700 bg-gradient-to-r from-blue-50 to-blue-50/30 border border-blue-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term1?.toLocaleString()}</span>
                                  {str.term1DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term1DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-pink-700 bg-gradient-to-r from-pink-50 to-pink-50/30 border border-pink-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term2?.toLocaleString()}</span>
                                  {str.term2DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term2DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-violet-700 bg-gradient-to-r from-violet-50 to-violet-50/30 border border-violet-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term3?.toLocaleString()}</span>
                                  {str.term3DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term3DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 bg-indigo-50/10">
                                <span className="font-mono font-black text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-600 border border-indigo-400 px-3 py-1.5 rounded-xl text-[13px] shadow-sm tracking-wide">
                                  ₹{computedTotal.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {!isAccountant && !isVicePrincipal ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingStructure(str);
                                          setShowStructureModal(true);
                                        }}
                                        className="p-1.5 px-3 border border-neutral-250 bg-white hover:bg-neutral-50 rounded-lg text-neutral-700 font-mono text-[9px] font-black uppercase tracking-wider transition-all hover:scale-105 shadow-2xs flex items-center gap-1 cursor-pointer"
                                        title="Edit Structure"
                                      >
                                        <Edit className="w-3 h-3 text-neutral-500" /> Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteStructure(str.id!, str.name, str.type)}
                                        className="p-1.5 px-3 border border-red-250 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-mono text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                                        title="Delete Structure"
                                      >
                                        <Trash2 className="w-3 h-3 text-rose-500" /> Delete
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider font-mono italic">View Only</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={isManagementOrAdmin ? 7 : 6} className="px-6 py-12 text-center text-neutral-400 font-bold uppercase tracking-widest text-[10px] italic">
                            No school core fee structures configured yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
                       {/* 2. TRANSPORT FEE TABLES */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 rounded-2xl border border-emerald-200/60 shadow-xs">
                    <Bus className="w-5 h-5 animate-none" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-sidebar uppercase tracking-wider flex items-center gap-2 animate-none">
                      School Transport Route & Shuttle Fees
                    </h3>
                    <p className="text-[9px] text-neutral-450 font-bold uppercase tracking-widest font-mono">
                      Configured distances, school-bus stages, and route-wise term targets (Academic Session 2026-27)
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto border border-emerald-100 rounded-2xl bg-white shadow-xl shadow-neutral-100/30">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-emerald-600 via-teal-650 to-emerald-700 text-[10px] font-black text-white uppercase tracking-wider font-mono border-b border-emerald-400">
                        {isManagementOrAdmin && (
                          <th className="px-4 py-4.5 w-12 text-center rounded-tl-2xl">
                            <input
                              type="checkbox"
                              checked={
                                sortedTransportStructures.length > 0 &&
                                sortedTransportStructures.every(s => selectedStructureIds.includes(s.id!))
                              }
                              onChange={(e) => {
                                const ids = sortedTransportStructures.map(s => s.id!).filter(Boolean);
                                if (e.target.checked) {
                                  setSelectedStructureIds(prev => Array.from(new Set([...prev, ...ids])));
                                } else {
                                  setSelectedStructureIds(prev => prev.filter(id => !ids.includes(id)));
                                }
                              }}
                              className="rounded border-none accent-emerald-600 bg-emerald-900/40 text-emerald-605 w-4 h-4 cursor-pointer"
                            />
                          </th>
                        )}
                        <th className={`px-6 py-4.5 ${!isManagementOrAdmin ? 'rounded-tl-2xl' : ''}`}>
                          <button
                            type="button"
                            onClick={() => handleTransportSort('name')}
                            className="inline-flex items-center gap-1.5 hover:text-white/80 transition-colors text-left uppercase tracking-wider font-extrabold text-emerald-50"
                          >
                            Route / Stages Scheme Name
                            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-200" />
                          </button>
                        </th>
                        <th className="px-6 py-4.5 text-emerald-100 font-extrabold">Term 1 Rate</th>
                        <th className="px-6 py-4.5 text-emerald-100 font-extrabold">Term 2 Rate</th>
                        <th className="px-6 py-4.5 text-emerald-100 font-extrabold">Term 3 Rate</th>
                        <th className="px-6 py-4.5 text-emerald-100">
                          <button
                            type="button"
                            onClick={() => handleTransportSort('total')}
                            className="inline-flex items-center gap-1.5 hover:text-white/80 transition-colors uppercase tracking-wider font-extrabold text-emerald-50"
                          >
                            Total Amount
                            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-200" />
                          </button>
                        </th>
                        <th className="px-6 py-4.5 text-right rounded-tr-2xl text-emerald-100 font-extrabold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-xs font-semibold text-neutral-600">
                      {sortedTransportStructures.length > 0 ? (
                        sortedTransportStructures.map(str => {
                          const computedTotal = (str.term1 || 0) + (str.term2 || 0) + (str.term3 || 0);
                          return (
                            <tr key={str.id || str.name} className="hover:bg-emerald-50/20 transition-all font-medium border-l-4 border-emerald-500/0 hover:border-emerald-500">
                              {isManagementOrAdmin && (
                                <td className="px-4 py-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedStructureIds.includes(str.id!)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedStructureIds(prev => [...prev, str.id!]);
                                      } else {
                                        setSelectedStructureIds(prev => prev.filter(id => id !== str.id!));
                                      }
                                    }}
                                    className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer animate-none"
                                  />
                                </td>
                              )}
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 rounded-xl shadow-xs border border-emerald-200">
                                    <Bus className="w-4 h-4" />
                                  </div>
                                  <div className="font-extrabold text-slate-800 uppercase tracking-tight text-[13px]">{str.name}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-emerald-700 bg-gradient-to-r from-emerald-50 to-emerald-50/30 border border-emerald-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term1?.toLocaleString()}</span>
                                  {str.term1DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term1DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-teal-700 bg-gradient-to-r from-teal-50 to-teal-50/30 border border-teal-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term2?.toLocaleString()}</span>
                                  {str.term2DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term2DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-cyan-700 bg-gradient-to-r from-cyan-50 to-cyan-50/30 border border-cyan-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term3?.toLocaleString()}</span>
                                  {str.term3DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term3DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 bg-emerald-50/10">
                                <span className="font-mono font-black text-white bg-gradient-to-r from-emerald-600 via-teal-650 to-teal-700 border border-emerald-400 px-3 py-1.5 rounded-xl text-[13px] shadow-sm tracking-wide">
                                  ₹{computedTotal.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {!isAccountant && !isVicePrincipal ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingStructure(str);
                                          setShowStructureModal(true);
                                        }}
                                        className="p-1.5 px-3 border border-neutral-250 bg-white hover:bg-neutral-50 rounded-lg text-neutral-700 font-mono text-[9px] font-black uppercase tracking-wider transition-all hover:scale-105 shadow-2xs flex items-center gap-1 cursor-pointer"
                                        title="Edit Structure"
                                      >
                                        <Edit className="w-3 h-3 text-neutral-500" /> Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteStructure(str.id!, str.name, str.type)}
                                        className="p-1.5 px-3 border border-red-250 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-mono text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                                        title="Delete Structure"
                                      >
                                        <Trash2 className="w-3 h-3 text-rose-500" /> Delete
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider font-mono italic">View Only</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={isManagementOrAdmin ? 7 : 6} className="px-6 py-12 text-center text-neutral-400 font-bold uppercase tracking-widest text-[10px] italic">
                            No transport fees structures defined.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
               {/* 3. HOSTEL FEE TABLES */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700 rounded-2xl border border-amber-200 shadow-xs">
                    <Home className="w-5 h-5 animate-none" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-sidebar uppercase tracking-wider flex items-center gap-2 animate-none">
                      Hostel Accommodation & Boarding Schemes
                    </h3>
                    <p className="text-[9px] text-neutral-450 font-bold uppercase tracking-widest font-mono">
                      Assigned hostel tuition fees, roommate metrics, boarding structures (Academic Session 2026-27)
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto border border-amber-100 rounded-2xl bg-white shadow-xl shadow-neutral-100/30">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-[10px] font-black text-white uppercase tracking-wider font-mono border-b border-amber-400">
                        {isManagementOrAdmin && (
                          <th className="px-4 py-4.5 w-12 text-center rounded-tl-2xl">
                            <input
                              type="checkbox"
                              checked={
                                sortedHostelStructures.length > 0 &&
                                sortedHostelStructures.every(s => selectedStructureIds.includes(s.id!))
                              }
                              onChange={(e) => {
                                const ids = sortedHostelStructures.map(s => s.id!).filter(Boolean);
                                if (e.target.checked) {
                                  setSelectedStructureIds(prev => Array.from(new Set([...prev, ...ids])));
                                } else {
                                  setSelectedStructureIds(prev => prev.filter(id => !ids.includes(id)));
                                }
                              }}
                              className="rounded border-none accent-amber-600 bg-amber-900/40 text-amber-600 w-4 h-4 cursor-pointer"
                            />
                          </th>
                        )}
                        <th className={`px-6 py-4.5 ${!isManagementOrAdmin ? 'rounded-tl-2xl' : ''}`}>
                          <button
                            type="button"
                            onClick={() => handleHostelSort('name')}
                            className="inline-flex items-center gap-1.5 hover:text-white/85 transition-colors text-left uppercase tracking-wider font-extrabold text-amber-50 animate-none"
                          >
                            Room Category Structure Name
                            <ArrowUpDown className="w-3.5 h-3.5 text-amber-250" />
                          </button>
                        </th>
                        <th className="px-6 py-4.5 text-amber-100 font-extrabold">Term 1 Fee</th>
                        <th className="px-6 py-4.5 text-amber-100 font-extrabold">Term 2 Fee</th>
                        <th className="px-6 py-4.5 text-amber-100 font-extrabold">Term 3 Fee</th>
                        <th className="px-6 py-4.5 text-amber-100 font-extrabold">
                          <button
                            type="button"
                            onClick={() => handleHostelSort('total')}
                            className="inline-flex items-center gap-1.5 hover:text-white/85 transition-colors uppercase tracking-wider font-extrabold text-amber-50"
                          >
                            Total Net Sum
                            <ArrowUpDown className="w-3.5 h-3.5 text-amber-250" />
                          </button>
                        </th>
                        <th className="px-6 py-4.5 text-right rounded-tr-2xl text-amber-100 font-extrabold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-xs font-semibold text-neutral-600">
                      {sortedHostelStructures.length > 0 ? (
                        sortedHostelStructures.map(str => {
                          const computedTotal = (str.term1 || 0) + (str.term2 || 0) + (str.term3 || 0);
                          return (
                            <tr key={str.id || str.name} className="hover:bg-amber-50/20 transition-all font-medium border-l-4 border-amber-500/0 hover:border-amber-500">
                              {isManagementOrAdmin && (
                                <td className="px-4 py-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedStructureIds.includes(str.id!)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedStructureIds(prev => [...prev, str.id!]);
                                      } else {
                                        setSelectedStructureIds(prev => prev.filter(id => id !== str.id!));
                                      }
                                    }}
                                    className="rounded border-neutral-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer animate-none"
                                  />
                                </td>
                              )}
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700 rounded-xl shadow-xs border border-amber-200">
                                    <Home className="w-4 h-4" />
                                  </div>
                                  <div className="font-extrabold text-slate-800 uppercase tracking-tight text-[13px]">{str.name}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-amber-700 bg-gradient-to-r from-amber-50 to-amber-50/30 border border-amber-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term1?.toLocaleString()}</span>
                                  {str.term1DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term1DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-amber-800 bg-gradient-to-r from-amber-100/10 to-amber-100/50 border border-amber-200 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term2?.toLocaleString()}</span>
                                  {str.term2DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term2DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="font-mono font-extrabold text-amber-950 bg-gradient-to-r from-yellow-50 to-yellow-50/30 border border-yellow-150 px-2.5 py-1 rounded-lg block w-fit shadow-2xs">₹{str.term3?.toLocaleString()}</span>
                                  {str.term3DueDate && <span className="text-[9px] text-neutral-450 font-black block font-mono">Due: {str.term3DueDate}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 bg-amber-50/10 font-bold uppercase">
                                <span className="font-mono font-black text-white bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 border border-amber-400 px-3 py-1.5 rounded-xl text-[13px] shadow-sm tracking-wide">
                                  ₹{computedTotal.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {!isAccountant && !isVicePrincipal ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingStructure(str);
                                          setShowStructureModal(true);
                                        }}
                                        className="p-1.5 px-3 border border-neutral-250 bg-white hover:bg-neutral-50 rounded-lg text-neutral-700 font-mono text-[9px] font-black uppercase tracking-wider transition-all hover:scale-105 shadow-2xs flex items-center gap-1 cursor-pointer"
                                        title="Edit Structure"
                                      >
                                        <Edit className="w-3 h-3 text-neutral-500" /> Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteStructure(str.id!, str.name, str.type)}
                                        className="p-1.5 px-3 border border-red-250 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-mono text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                                        title="Delete Structure"
                                      >
                                        <Trash2 className="w-3 h-3 text-rose-500" /> Delete
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider font-mono italic">View Only</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={isManagementOrAdmin ? 7 : 6} className="px-6 py-12 text-center text-neutral-400 font-bold uppercase tracking-widest text-[10px] italic">
                            No hostel boarding structures defined.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB: CONCESSION SCHEMES */}
          {activeTab === 'concessions' && !isAccountant && (
            <motion.div
              key="concessions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono">Defined Concessions configurations and policy categories</span>
                <span className="text-indigo-600 font-mono text-[10px] font-black uppercase">{concessions.length} Concession Categories Active</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {concessions.map(conc => (
                  <div key={conc.id} className="p-6 bg-white border border-neutral-100 rounded-3xl shadow-lg relative overflow-hidden group hover:shadow-xl transition-all">
                    
                    <div className="absolute top-4 right-4 flex gap-1.5 z-10 transition-all">
                      {!isAccountant && (
                        <>
                          <button
                            onClick={() => {
                              setEditingConcessionCat(conc);
                              setShowConcessionCatModal(true);
                            }}
                            className="p-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-600 shadow-2xs cursor-pointer hover:scale-105 transition-transform"
                            title="Edit Concession Scheme"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteConcessionCat(conc.id!)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 shadow-2xs cursor-pointer hover:scale-105 transition-transform font-bold"
                            title="Delete Concession Scheme"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-wider">
                        Discount Target: {conc.appliedTo || 'school'}
                      </span>
                    </div>

                    <h4 className="text-base font-black text-sidebar uppercase tracking-tight mt-3">{conc.name}</h4>
                    <p className="text-neutral-400 text-xs font-bold leading-relaxed mt-1">{conc.description || 'Standard active dynamic concession discount offer.'}</p>
                    
                    <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between">
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Deductible Margin</span>
                      <span className="text-lg font-black text-indigo-600 font-mono">
                        {conc.type === 'percentage' ? `${conc.value}% Off` : `₹${conc.value} Flat Off`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-neutral-200 my-8 pt-8" />

              <div className="flex justify-between items-center px-1">
                <div>
                  <h3 className="text-lg font-black text-sidebar uppercase tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    Last Term School Fee Concession Manager
                  </h3>
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono mt-1">
                    Apply targeted concessions specifically to Term 3 school fees for any class and student
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Column 1: Grant Form (span 5) */}
                <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-neutral-150 shadow-md flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-black text-sidebar uppercase tracking-tight mb-4 flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-neutral-500" />
                      Grant New Last Term Concession
                    </h4>

                    <form onSubmit={handleSaveLastTermConcession} className="space-y-4">
                      {/* Select Class */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Select Class</label>
                        <select
                          value={lastTermClassId}
                          onChange={(e) => {
                            setLastTermClassId(e.target.value);
                            setLastTermStudentId('');
                          }}
                          className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 transition-colors"
                        >
                          <option value="all">-- Choose a Class --</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Select Student */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Select Student</label>
                        <select
                          value={lastTermStudentId}
                          onChange={(e) => setLastTermStudentId(e.target.value)}
                          disabled={lastTermClassId === 'all'}
                          className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                        >
                          <option value="">-- Choose a Student --</option>
                          {filteredStudentsForLastTerm.map(s => (
                            <option key={s.uid} value={s.uid}>
                              {s.name} {s.rollNumber || s.rollNo ? `(Roll: ${s.rollNumber || s.rollNo})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Concession Type & Value */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Concession Type</label>
                          <select
                            value={lastTermType}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setLastTermType(val);
                              if (val === 'percentage') setLastTermValue(100);
                              else if (val === 'fixed') setLastTermValue(5000);
                              else setLastTermValue(0);
                            }}
                            className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 transition-colors"
                          >
                            <option value="percentage">Percentage Off (% )</option>
                            <option value="fixed">Fixed Flat Off (₹ )</option>
                            <option value="none">No Concession</option>
                          </select>
                        </div>

                        {lastTermType !== 'none' && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block font-mono">
                              {lastTermType === 'percentage' ? 'Percentage Value' : 'Flat Amount (₹)'}
                            </label>
                            <input
                              type="number"
                              required
                              min="0"
                              max={lastTermType === 'percentage' ? "100" : undefined}
                              value={lastTermValue}
                              onChange={(e) => setLastTermValue(Number(e.target.value))}
                              className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-indigo-500 transition-colors font-mono"
                            />
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={submittingLastTerm || !lastTermStudentId}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-200 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md transition-all font-mono"
                      >
                        {submittingLastTerm ? 'Saving Concession...' : 'Grant Last Term Concession'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Column 2: Active Last Term Concessions List (span 7) */}
                <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-neutral-150 shadow-md flex flex-col justify-between overflow-hidden">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-black text-sidebar uppercase tracking-tight flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Active Last Term Concessions
                      </h4>
                      <span className="text-[10px] font-black px-2 py-0.5 bg-green-50 border border-green-100 text-green-600 rounded-full font-mono uppercase">
                        {studentsWithLastTermConcession.length} Granted
                      </span>
                    </div>

                    <div className="overflow-y-auto max-h-[350px] pr-1">
                      {studentsWithLastTermConcession.length === 0 ? (
                        <div className="py-12 text-center text-neutral-400 font-bold uppercase tracking-widest text-[10px] italic">
                          No active last term concessions granted.
                        </div>
                      ) : (
                        <div className="border border-neutral-100 rounded-2xl overflow-hidden shadow-2xs">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-neutral-50 border-b border-neutral-100 text-[9px] font-black text-neutral-400 uppercase tracking-widest font-mono">
                                <th className="px-4 py-3">STUDENT</th>
                                <th className="px-4 py-3">CLASS</th>
                                <th className="px-4 py-3">CONCESSION</th>
                                <th className="px-4 py-3 text-right">ACTION</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-150 text-xs font-bold text-neutral-600">
                              {studentsWithLastTermConcession.map(s => {
                                const className = classes.find(c => c.id === s.classId)?.name || s.classId;
                                const concessionStr = s.lastTermConcessionType === 'percentage'
                                  ? `${s.lastTermConcessionValue}% Off Term 3`
                                  : `₹${s.lastTermConcessionValue?.toLocaleString()} Off Term 3`;
                                return (
                                  <tr key={s.uid} className="hover:bg-neutral-50/50 transition-colors">
                                    <td className="px-4 py-3">
                                      <div className="font-extrabold text-neutral-800">{s.name}</div>
                                      {s.rollNumber || s.rollNo ? (
                                        <div className="text-[10px] text-neutral-400 font-mono">Roll: {s.rollNumber || s.rollNo}</div>
                                      ) : null}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] uppercase font-bold font-mono">
                                        {className}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="font-extrabold text-indigo-600 font-mono">
                                        {concessionStr}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <button
                                        onClick={() => handleRemoveLastTermConcession(s.uid, s.name)}
                                        className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 transition-colors shadow-2xs font-extrabold text-[10px] uppercase tracking-wider"
                                        title="Remove Concession"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB: EXPENDITURES */}
          {activeTab === 'expenditures' && (
            <motion.div
              key="expenditures"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-neutral-50 p-4 rounded-2xl border border-neutral-150">
                {/* Search & Category Filter */}
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Search record expense..."
                      value={expSearchQuery}
                      onChange={(e) => setExpSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 font-bold text-xs"
                    />
                  </div>
                  <div>
                    <select
                      value={expSelectedCategory}
                      onChange={(e) => setExpSelectedCategory(e.target.value)}
                      className="p-2 py-2.5 bg-white border border-neutral-200 rounded-xl outline-none text-xs font-bold font-mono uppercase text-neutral-600 cursor-pointer"
                    >
                      <option value="all">ALL CATEGORIES</option>
                      {(expCategories.length > 0 ? expCategories : DEFAULT_CATEGORIES).map(cat => (
                        <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-right text-[10px] font-black text-neutral-400 font-mono uppercase tracking-widest shrink-0 self-end sm:self-center">
                  Total Managed Outflow: <span className="text-neutral-850 text-xs font-bold font-mono">₹{
                    expenditures
                      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
                      .toLocaleString()
                  }</span>
                </div>
              </div>

              {/* Expenditures List */}
              <div className="overflow-x-auto border border-neutral-100 rounded-2xl shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/70 border-b border-neutral-100 text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono">
                      <th className="px-6 py-4 font-mono">EXPENSE DETAILS</th>
                      <th className="px-6 py-4 font-mono">CATEGORY</th>
                      <th className="px-6 py-4 font-mono">PAYMENT METHOD</th>
                      <th className="px-6 py-4 font-mono">AMOUNT</th>
                      <th className="px-6 py-4 font-mono">REFERENCE</th>
                      <th className="px-6 py-4 text-right font-mono">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-xs font-bold text-neutral-600">
                    {expenditures.filter(exp => {
                      const matchesSearch = (exp.description || '').toLowerCase().includes(expSearchQuery.toLowerCase()) || 
                                            (exp.reference || '').toLowerCase().includes(expSearchQuery.toLowerCase());
                      const matchesCat = expSelectedCategory === 'all' || exp.category === expSelectedCategory;
                      return matchesSearch && matchesCat;
                    }).length > 0 ? (
                      expenditures.filter(exp => {
                        const matchesSearch = (exp.description || '').toLowerCase().includes(expSearchQuery.toLowerCase()) || 
                                              (exp.reference || '').toLowerCase().includes(expSearchQuery.toLowerCase());
                        const matchesCat = expSelectedCategory === 'all' || exp.category === expSelectedCategory;
                        return matchesSearch && matchesCat;
                      }).map(exp => (
                        <tr key={exp.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-4 max-w-sm">
                            <div className="leading-tight">
                              <h5 className="font-extrabold text-neutral-800 text-sm">{exp.description}</h5>
                              <p className="text-[10px] text-neutral-400 mt-1 uppercase font-semibold font-mono">
                                Date: {exp.date ? new Date(exp.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : 'N/A'}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-block px-2.5 py-1 bg-neutral-100 border border-neutral-150 rounded-md text-[10px] font-extrabold uppercase tracking-wide text-neutral-600">
                              {exp.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 uppercase font-mono text-[10px] text-neutral-500">
                            {exp.paymentMethod || 'cash'}
                          </td>
                          <td className="px-6 py-4 font-mono text-sm font-black text-rose-600">
                            ₹{Number(exp.amount || 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-neutral-500 uppercase">
                            {exp.reference || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!isAccountant ? (
                              <button
                                onClick={() => handleDeleteExpenditure(exp.id!)}
                                className="p-2 hover:bg-rose-50 text-rose-650 text-rose-600 rounded-lg hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
                                title="Delete Expense Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider font-mono italic">Protected</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-neutral-400 font-extrabold uppercase tracking-widest font-mono text-xs">
                          No expenditures matching active filters found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* TAB: BALANCE SHEET */}
          {activeTab === 'balance_sheet' && (
            <motion.div
              key="balance_sheet"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* BALANCE SHEET SUB-TABS OVERVIEW */}
              <div className="flex gap-2 p-1.5 bg-neutral-100 rounded-2xl max-w-md">
                <button
                  type="button"
                  onClick={() => setBalanceSheetSubTab('consolidated')}
                  className={`flex-1 py-2 px-3 text-center rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    balanceSheetSubTab === 'consolidated'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Building className="w-3.5 h-3.5 inline mr-1.5" /> Consolidated
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceSheetSubTab('transport')}
                  className={`flex-1 py-2 px-3 text-center rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    balanceSheetSubTab === 'transport'
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Bus className="w-3.5 h-3.5 inline mr-1.5" /> Transport
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceSheetSubTab('hostel')}
                  className={`flex-1 py-2 px-3 text-center rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    balanceSheetSubTab === 'hostel'
                      ? 'bg-indigo-900 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Home className="w-3.5 h-3.5 inline mr-1.5" /> Hostel
                </button>
              </div>

              {/* Top Banner Overview Card */}
              {(() => {
                let cardTitle = "Financial Health & Balance Sheet Statement";
                let cardSubtitle = "Consolidated income statement mapping overall cash inflow from school fee schedules relative to real-world administrative and capital expenditures.";
                let cardTag = "INSTITUTIONAL FISCAL LEDGER";
                let cardTagBg = "bg-white/10 text-emerald-400";
                let cardIcon = <Building className="w-3.5 h-3.5" />;
                let gradientBg = "from-neutral-900 via-slate-900 to-black";
                let tagColor = "text-emerald-300";

                let inflowTitle = "Gross Revenue / Cash Inflow";
                let inflowSubtitle = "Fees & settlement modules";
                let inflowDetailLabel = "Collected School Tuition Dues";
                let inflowConcessionsLabel = "Scholarships & Offs Deducted";
                let inflowNetLabel = "Net Retained Cash Revenue";

                let outflowTitle = "Debited Outflow / Expenditures";
                let outflowSubtitle = "Admin & operational disbursements";

                let totalRevenue = overviewStats.totalCollected;
                let concessionsAmount = overviewStats.totalConcessions;
                let totalExp = expenditures.reduce((sum, e) => sum + Number(e.amount || 0), 0);

                let activeCategoriesList = (expCategories.length > 0 ? expCategories : DEFAULT_CATEGORIES);

                if (balanceSheetSubTab === 'transport') {
                  cardTitle = "Transport Department Balance Sheet";
                  cardSubtitle = "Dedicated ledger tracking student transit route fee collections plotted against transit diesel, mechanic bills, fleet maintenance, and driver salaries disbursements.";
                  cardTag = "FLEET TRANSIT LEDGER";
                  cardTagBg = "bg-amber-500/20 text-amber-300";
                  cardIcon = <Bus className="w-3.5 h-3.5" />;
                  gradientBg = "from-amber-950 via-slate-900 to-amber-900";
                  tagColor = "text-amber-300";

                  inflowTitle = "Transport Gross Collections";
                  inflowSubtitle = "Route and transit fee settlements";
                  inflowDetailLabel = "Collected Student Transit Fees";
                  inflowConcessionsLabel = "Transit Subsidies / Concessions";
                  inflowNetLabel = "Net Transit Fee Inflow";

                  outflowTitle = "Transport Outflow / Expenses";
                  outflowSubtitle = "Fuel, drivers, and fleet service bills";

                  totalRevenue = transportAndHostelStats.transportCollected;
                  concessionsAmount = 0;
                  totalExp = expenditures.filter(e => e.category === 'Transport').reduce((sum, e) => sum + Number(e.amount || 0), 0);
                  activeCategoriesList = ['Transport'];
                } else if (balanceSheetSubTab === 'hostel') {
                  cardTitle = "Hostel & Residency Balance Sheet";
                  cardSubtitle = "Dedicated ledger tracking student boarding collections plotted against warden payrolls, dining mess provisions, bedding logistics, facility utility bills, and hostel space repairs.";
                  cardTag = "HOSTEL BOARDING LEDGER";
                  cardTagBg = "bg-indigo-500/20 text-indigo-300";
                  cardIcon = <Home className="w-3.5 h-3.5" />;
                  gradientBg = "from-indigo-950 via-slate-900 to-indigo-900";
                  tagColor = "text-indigo-300";

                  inflowTitle = "Hostel Boarding Gross Collections";
                  inflowSubtitle = "Boarding and room fee settlements";
                  inflowDetailLabel = "Collected Hostel Lodging Fees";
                  inflowConcessionsLabel = "Boarding Exemptions / Concessions";
                  inflowNetLabel = "Net Boarding Room Inflow";

                  outflowTitle = "Hostel Outflow / Expenses";
                  outflowSubtitle = "Mess food supply, hostel upkeep, and warden payrolls";

                  totalRevenue = transportAndHostelStats.hostelCollected;
                  concessionsAmount = 0;
                  totalExp = expenditures.filter(e => e.category === 'Hostel').reduce((sum, e) => sum + Number(e.amount || 0), 0);
                  activeCategoriesList = ['Hostel'];
                }

                const surplus = totalRevenue - totalExp;
                const isSurplus = surplus >= 0;

                return (
                  <div className="space-y-6">
                    <div className={`bg-gradient-to-br ${gradientBg} p-8 rounded-3xl text-white relative overflow-hidden shadow-xl`}>
                      <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-[90px] -mr-40 -mt-40 pointer-events-none" />
                      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="space-y-2">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 ${cardTagBg} rounded-full text-[10px] font-black uppercase tracking-wider`}>
                            {cardIcon} {cardTag}
                          </span>
                          <h3 className="text-2xl sm:text-3xl font-black uppercase mt-1 tracking-tight">{cardTitle}</h3>
                          <p className="text-white/60 text-xs max-w-xl font-medium leading-relaxed">
                            {cardSubtitle}
                          </p>
                        </div>

                        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center shrink-0 w-full md:w-64 text-center">
                          <span className="text-[10px] text-white/50 font-black tracking-widest font-mono uppercase">Net Operating Surplus (Cap)</span>
                          <div className={`text-2xl sm:text-3xl font-black mt-2 font-mono ${isSurplus ? 'text-emerald-400' : 'text-rose-500'}`}>
                            {isSurplus ? '+' : ''}₹{surplus.toLocaleString()}.00
                          </div>
                          <span className={`text-[10px] font-bold uppercase py-0.5 px-2 bg-white/15 rounded-full mt-2 inline-block ${isSurplus ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {isSurplus ? 'Fiscal Surplus Operating' : 'Deficit Outset Status'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left: Revenues Inflow */}
                      <div className="p-6 bg-white border border-neutral-100 rounded-3xl shadow-md space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-black text-neutral-800 uppercase">{inflowTitle}</h4>
                            <p className="text-[10px] text-neutral-400 font-mono font-bold uppercase tracking-wider mt-0.5">{inflowSubtitle}</p>
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                            <span className="text-xs text-neutral-500 uppercase tracking-wider font-extrabold">{inflowDetailLabel}</span>
                            <span className="font-mono font-black text-sm text-neutral-850">₹{totalRevenue.toLocaleString()}</span>
                          </div>
                          {balanceSheetSubTab === 'consolidated' && (
                            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                              <span className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">{inflowConcessionsLabel}</span>
                              <span className="font-mono text-sm text-neutral-400">₹{concessionsAmount.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center py-2 pt-4">
                            <span className="text-xs text-neutral-800 uppercase tracking-widest font-black">{inflowNetLabel}</span>
                            <span className="font-mono text-base font-black text-emerald-600">₹{totalRevenue.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Outflow Expenses */}
                      <div className="p-6 bg-white border border-neutral-100 rounded-3xl shadow-md space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-red-50 text-red-500 rounded-xl">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-black text-neutral-800 uppercase">{outflowTitle}</h4>
                            <p className="text-[10px] text-neutral-450 font-mono font-bold uppercase tracking-wider mt-0.5">{outflowSubtitle}</p>
                          </div>
                        </div>

                        <div className="space-y-2.5 pt-2 max-h-[160px] overflow-y-auto pr-1">
                          {activeCategoriesList.map(cat => {
                            const catAmt = expenditures.filter(e => e.category === cat).reduce((sum, e) => sum + Number(e.amount || 0), 0);
                            if (catAmt === 0) return null;
                            return (
                              <div key={cat} className="flex justify-between items-center py-2 border-b border-neutral-100 text-xs">
                                <span className="text-neutral-500 uppercase tracking-wider font-semibold">{cat}</span>
                                <span className="font-mono font-bold text-neutral-700">₹{catAmt.toLocaleString()}</span>
                              </div>
                            );
                          })}
                          {expenditures.filter(e => activeCategoriesList.includes(e.category) && Number(e.amount || 0) > 0).length === 0 && (
                            <div className="text-center py-6 text-neutral-400 text-xs font-bold uppercase tracking-wider">
                              No expenses recorded in this category.
                            </div>
                          )}
                        </div>

                        <div className="pt-2 flex justify-between items-center">
                          <span className="text-xs text-neutral-800 uppercase tracking-widest font-black">Total Debit Capital spent</span>
                          <span className="font-mono text-base font-black text-rose-600">₹{totalExp.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* TAB: RECEIPT BOOKS */}
          {activeTab === 'receipt_books' && isAccountantOrAdmin && (
            <motion.div
              key="receipt_books"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 animate-in fade-in duration-300"
            >
              {/* Top Action Banner */}
              <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-6 sm:p-8 rounded-3xl text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-rose-600/10 rounded-full blur-[80px] -mr-40 -mt-40 pointer-events-none" />
                <div className="space-y-1 relative z-10">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-wider text-rose-400">
                    <BookOpen className="w-3.5 h-3.5" /> accountant ledger controls
                  </span>
                  <h3 className="text-2xl font-black uppercase mt-1 tracking-tight">Receipt Books Registry</h3>
                  <p className="text-white/60 text-xs font-medium max-w-xl">
                    Manage institutional receipt books with customized prefix series and automated sequential numbering. Only one book can be set active at a time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingReceiptBook({
                      name: '',
                      prefix: 'REC-',
                      startFrom: 1001,
                      currentSerial: 1001,
                      active: true
                    });
                    setShowReceiptBookModal(true);
                  }}
                  className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-rose-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 block shrink-0 z-10"
                >
                  <Plus className="w-4 h-4" /> Create Receipt Book
                </button>
              </div>

              {/* Receipt Books List Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {receiptBooks.length === 0 ? (
                  <div className="col-span-12 p-12 bg-white rounded-3xl border border-dashed border-neutral-200 text-center text-neutral-450 uppercase font-bold text-xs tracking-wide">
                    Loading book registers ...
                  </div>
                ) : (
                  receiptBooks.map(book => {
                    const isActive = book.active;
                    return (
                      <div 
                        key={book.id} 
                        className={`p-6 rounded-3xl border transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                          isActive 
                            ? 'bg-neutral-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500/10' 
                            : 'bg-white border-neutral-200 hover:bg-neutral-50/50'
                        }`}
                      >
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isActive ? 'bg-indigo-650 text-white shadow-lg' : 'bg-neutral-100 text-neutral-500'}`}>
                                <BookOpen className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="font-extrabold text-sm text-slate-900 uppercase tracking-tight truncate max-w-[150px]">{book.name}</h4>
                                <span className="text-[10px] text-neutral-405 font-mono font-bold block mt-0.5">Created: {book.createdAt ? new Date(book.createdAt).toLocaleDateString() : 'N/A'}</span>
                              </div>
                            </div>
                            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${isActive ? 'bg-emerald-100 text-emerald-700 border border-emerald-250' : 'bg-neutral-100 text-neutral-400 border border-neutral-250/20'}`}>
                              {isActive ? 'Active' : 'Unused'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 bg-white p-3 border border-neutral-200/50 rounded-2xl font-mono text-xs">
                            <div>
                              <span className="text-[8px] text-neutral-400 font-black uppercase tracking-wider block">Series Prefix</span>
                              <span className="font-bold text-slate-800 text-[13px]">{book.prefix}</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-neutral-400 font-black uppercase tracking-wider block">Start In</span>
                              <span className="font-bold text-slate-800 text-[13px]">{book.startFrom}</span>
                            </div>
                            <div className="col-span-2 pt-1.5 border-t border-dashed border-neutral-200">
                              <span className="text-[8px] text-neutral-400 font-black uppercase tracking-wider block">Next Serial Position</span>
                              <span className="font-extrabold text-rose-600 text-sm">{book.prefix}{book.currentSerial}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2.5 mt-6 pt-4 border-t border-neutral-100">
                          {!isActive ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updatedBooks = await Promise.all(receiptBooks.map(async b => {
                                    const nextActive = b.id === book.id;
                                    await dbService.update('receipt_books', b.id || '', { active: nextActive, updatedAt: new Date().toISOString() });
                                    return { ...b, active: nextActive };
                                  }));
                                  setReceiptBooks(updatedBooks);
                                  setSelectedReceiptBook(book.id || '');
                                  toast.success(`Receipt Book "${book.name}" is now marked Active.`);
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-650 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
                            >
                              Set Active Book
                            </button>
                          ) : (
                            <span className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1.5 font-mono">
                              <Check className="w-3.5 h-3.5" /> Book in Use
                            </span>
                          )}

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReceiptBook(book);
                                setShowReceiptBookModal(true);
                              }}
                              className="p-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg cursor-pointer transition-colors"
                              title="Edit In"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {book.id !== 'book_default' && (
                              <button
                               type="button"
                               onClick={async () => {
                                 requestConfirm('Delete Receipt Book', `Are you sure you want to permanently delete "${book.name}"? This action is irreversible.`, async () => {
                                   await dbService.delete('receipt_books', book.id || '');
                                   await fetchReceiptBooks();
                                   toast.success('Receipt Book removed successfully.');
                                 });
                               }}
                               className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition-colors"
                               title="Delete Book"
                             >
                               <Trash2 className="w-3.5 h-3.5" />
                             </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* MODAL 6: CREATE / EDIT RECEIPT BOOK */}
      <AnimatePresence>
        {showReceiptBookModal && editingReceiptBook && (
          <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl border border-neutral-200 overflow-hidden flex flex-col font-sans"
            >
              <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex justify-between items-center border-b border-white/5">
                <h4 className="text-xs font-black uppercase tracking-wider font-sans flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-rose-500" />
                  <span>{editingReceiptBook.id ? 'Modify' : 'Create'} Receipt book</span>
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setShowReceiptBookModal(false);
                    setEditingReceiptBook(null);
                  }}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const payload = {
                      name: editingReceiptBook.name || 'Custom Receipt Book',
                      prefix: editingReceiptBook.prefix || 'REC-',
                      startFrom: Number(editingReceiptBook.startFrom || 1000),
                      currentSerial: editingReceiptBook.id ? Number(editingReceiptBook.currentSerial) : Number(editingReceiptBook.startFrom || 1000),
                      active: !!editingReceiptBook.active,
                      createdAt: editingReceiptBook.createdAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };

                    const bId = editingReceiptBook.id;

                    if (bId) {
                      await dbService.update('receipt_books', bId, payload);
                    } else {
                      const newId = `book_${Date.now()}`;
                      await dbService.create('receipt_books', newId, payload);
                    }

                    // Force exclusivity if active
                    if (payload.active) {
                      const all = await dbService.list('receipt_books') as ReceiptBook[];
                      await Promise.all(all.map(b => {
                        if (b.id !== bId) {
                          return dbService.update('receipt_books', b.id || '', { active: false });
                        }
                        return Promise.resolve();
                      }));
                    }

                    await fetchReceiptBooks();
                    setShowReceiptBookModal(false);
                    setEditingReceiptBook(null);
                    toast.success('Receipt Book config persisted successfully!');
                  } catch (err) {
                    console.error(err);
                    toast.error('An error occurred during preservation.');
                  }
                }}
                className="p-6 space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest block font-sans">Book Name</label>
                  <input
                    type="text"
                    required
                    value={editingReceiptBook.name || ''}
                    onChange={(e) => setEditingReceiptBook({ ...editingReceiptBook, name: e.target.value })}
                    className="w-full text-xs font-semibold p-3.5 bg-neutral-50 border border-neutral-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-sans text-neutral-850"
                    placeholder="e.g. Primary School Receipts Series"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest block font-sans">Prefix Code</label>
                    <input
                      type="text"
                      required
                      value={editingReceiptBook.prefix || ''}
                      onChange={(e) => setEditingReceiptBook({ ...editingReceiptBook, prefix: e.target.value })}
                      className="w-full text-xs font-semibold p-3.5 bg-neutral-50 border border-neutral-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none font-mono text-center text-neutral-850"
                      placeholder="e.g. REC-"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest block font-sans">Start From</label>
                    <input
                      type="number"
                      required
                      disabled={!!editingReceiptBook.id}
                      value={editingReceiptBook.startFrom || ''}
                      onChange={(e) => setEditingReceiptBook({ ...editingReceiptBook, startFrom: Number(e.target.value), currentSerial: Number(e.target.value) })}
                      className="w-full text-xs font-semibold p-3.5 bg-neutral-50 disabled:bg-neutral-100 disabled:text-neutral-400 border border-neutral-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none font-mono text-center text-neutral-850"
                      placeholder="1001"
                    />
                  </div>
                </div>

                {editingReceiptBook.id && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest block font-sans">Current Serial Index</label>
                    <input
                      type="number"
                      required
                      value={editingReceiptBook.currentSerial || ''}
                      onChange={(e) => setEditingReceiptBook({ ...editingReceiptBook, currentSerial: Number(e.target.value) })}
                      className="w-full text-sm font-mono font-extrabold p-3.5 bg-rose-50 border border-neutral-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none text-neutral-850 text-center"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3.5 pt-2">
                  <input
                    type="checkbox"
                    id="book-main-active"
                    checked={!!editingReceiptBook.active}
                    onChange={(e) => setEditingReceiptBook({ ...editingReceiptBook, active: e.target.checked })}
                    className="w-4.5 h-4.5 cursor-pointer accent-indigo-650"
                  />
                  <label htmlFor="book-main-active" className="text-xs font-bold text-neutral-600 font-sans cursor-pointer select-none">
                    Set Active (This book is active for immediate serial issues)
                  </label>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-neutral-150 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReceiptBookModal(false);
                      setEditingReceiptBook(null);
                    }}
                    className="px-4 py-2 text-neutral-500 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-md shadow-indigo-600/10"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 1: RECORD OFFLINE PAYMENT (CONVERTED TO FULL SCREEN MAXIMUM WIDTH CHECK OUT) */}
      <AnimatePresence>
        {showPaymentModal && selectedStudentForPayment && (() => {
          const checkoutStudent = selectedStudentForPayment.student;
          const checkoutConcessionObj = checkoutStudent ? concessions.find(c => c.id === checkoutStudent.feeConcessionType) : null;
          const checkoutConcessionText = checkoutStudent?.feeConcessionType === 'custom'
            ? `Custom flat deductible (₹${(checkoutStudent.feeConcessionAmount || 0).toLocaleString()} off)`
            : checkoutConcessionObj
              ? `${checkoutConcessionObj.name} (${checkoutConcessionObj.type === 'percentage' ? `${checkoutConcessionObj.value}% Off` : `₹${checkoutConcessionObj.value} Off`})`
              : 'Standard Base Fare (No scholarship/concession applied)';
          
          const hasCheckoutConcession = checkoutStudent?.feeConcessionType && checkoutStudent?.feeConcessionType !== 'none';
          const isTransportActive = checkoutStudent?.transportType === 'school';
          const hasOldDuesVal = Number(checkoutStudent?.lastClassFeeDue || 0) > 0;
          const activeBook = receiptBooks.find(bk => bk.id === selectedReceiptBook);

          // Compute selected components list
          const selectedItemsBreakdown = getStudentFeeComponents(selectedStudentForPayment)
            .filter(c => checkoutSelectedMap[c.id] && Number(checkoutAmounts[c.id] || 0) > 0)
            .map(c => ({
              id: c.id,
              label: c.label,
              payAmount: Number(checkoutAmounts[c.id] || 0)
            }));

          const cartTotal = selectedItemsBreakdown.reduce((sum, item) => sum + item.payAmount, 0);

          // Compute dynamic fee categories
          const studentComponents = getStudentFeeComponents(selectedStudentForPayment);
          
          const feeTypesMap = [
            {
              id: 'academic',
              label: 'Academic Fee',
              icon: GraduationCap,
              selectedClass: 'bg-indigo-100 border-indigo-500/70 border-l-[6px] border-l-indigo-600 ring-2 ring-indigo-600/10 text-indigo-950 shadow-sm font-bold',
              unselectedClass: 'bg-indigo-50/10 border-indigo-150 hover:bg-white hover:border-indigo-300 text-neutral-750',
              iconSelectedClass: 'bg-indigo-600 text-white shadow-xs',
              iconUnselectedClass: 'bg-indigo-50 text-indigo-600',
              match: (cid: string) => ['term1', 'term2', 'term3'].includes(cid)
            },
            {
              id: 'transport',
              label: 'Transport Fee',
              icon: Bus,
              selectedClass: 'bg-emerald-100 border-emerald-500/70 border-l-[6px] border-l-emerald-600 ring-2 ring-emerald-600/10 text-emerald-950 shadow-sm font-bold',
              unselectedClass: 'bg-emerald-50/10 border-emerald-150 hover:bg-white hover:border-emerald-300 text-neutral-750',
              iconSelectedClass: 'bg-emerald-600 text-white shadow-xs',
              iconUnselectedClass: 'bg-emerald-50 text-emerald-600',
              match: (cid: string) => cid.includes('transport')
            },
            {
              id: 'hostel',
              label: 'Hostel Fee',
              icon: Home,
              selectedClass: 'bg-purple-100 border-purple-500/70 border-l-[6px] border-l-purple-600 ring-2 ring-purple-600/10 text-purple-950 shadow-sm font-bold',
              unselectedClass: 'bg-purple-50/10 border-purple-150 hover:bg-white hover:border-purple-300 text-neutral-750',
              iconSelectedClass: 'bg-purple-650 text-white shadow-xs',
              iconUnselectedClass: 'bg-purple-50 text-purple-600',
              match: (cid: string) => cid.includes('hostel')
            },
            {
              id: 'previous_dues',
              label: 'Previous Year Dues',
              icon: Clock,
              selectedClass: 'bg-rose-100 border-rose-500/70 border-l-[6px] border-l-rose-600 ring-2 ring-rose-600/10 text-rose-950 shadow-sm font-bold',
              unselectedClass: 'bg-rose-50/10 border-rose-150 hover:bg-white hover:border-rose-300 text-neutral-750',
              iconSelectedClass: 'bg-rose-600 text-white shadow-xs',
              iconUnselectedClass: 'bg-rose-50 text-rose-600',
              match: (cid: string) => cid === 'lastClassFeeDue'
            },
            {
              id: 'admission',
              label: 'Admission Fee',
              icon: School,
              selectedClass: 'bg-sky-100 border-sky-505/70 border-l-[6px] border-l-sky-600 ring-2 ring-sky-600/10 text-sky-950 shadow-sm font-bold',
              unselectedClass: 'bg-sky-50/10 border-sky-150 hover:bg-white hover:border-sky-305 text-neutral-750',
              iconSelectedClass: 'bg-sky-650 text-white shadow-xs',
              iconUnselectedClass: 'bg-sky-50 text-sky-600',
              match: (cid: string) => cid === 'admission'
            }
          ];

          // Compute pending amounts and children for categories
          const availableFeeTypes = feeTypesMap.map(ft => {
            const children = studentComponents.filter(c => {
              const paid = Number(selectedStudentForPayment.paidComponents?.[c.id] || 0);
              const remaining = Math.max(0, c.amount - paid);
              return ft.match(c.id) && remaining > 0;
            });
            const totalRemaining = children.reduce((sum, c) => {
              const paid = Number(selectedStudentForPayment.paidComponents?.[c.id] || 0);
              return sum + Math.max(0, c.amount - paid);
            }, 0);
            return {
              ...ft,
              children,
              totalRemaining
            };
          }).filter(ft => ft.children.length > 0);

          // Find matches to group remaining as other
          const matchedComponentIds = new Set<string>();
          feeTypesMap.forEach(ft => {
            studentComponents.forEach(c => {
              if (ft.match(c.id)) matchedComponentIds.add(c.id);
            });
          });

          const otherChildren = studentComponents.filter(c => {
            const paid = Number(selectedStudentForPayment.paidComponents?.[c.id] || 0);
            const remaining = Math.max(0, c.amount - paid);
            return !matchedComponentIds.has(c.id) && remaining > 0;
          });

          if (otherChildren.length > 0) {
            const otherTotalRemaining = otherChildren.reduce((sum, c) => {
              const paid = Number(selectedStudentForPayment.paidComponents?.[c.id] || 0);
              return sum + Math.max(0, c.amount - paid);
            }, 0);
            availableFeeTypes.push({
              id: 'other',
              label: 'Other Special Fee',
              icon: Coins,
              selectedClass: 'bg-amber-100 border-amber-500/70 border-l-[6px] border-l-amber-600 ring-2 ring-amber-600/10 text-amber-950 shadow-sm font-bold',
              unselectedClass: 'bg-amber-50/10 border-amber-150 hover:bg-white hover:border-amber-300 text-neutral-750',
              iconSelectedClass: 'bg-amber-650 text-white shadow-xs',
              iconUnselectedClass: 'bg-amber-50 text-amber-600',
              match: () => false,
              children: otherChildren,
              totalRemaining: otherTotalRemaining
            });
          }

          // Category Toggle Handler
          const handleToggleCategory = (catId: string, catItems: any[]) => {
            const isCurrentlyActive = !!activeCheckoutCategories[catId];
            const nextActive = !isCurrentlyActive;
            
            setActiveCheckoutCategories(prev => ({ ...prev, [catId]: nextActive }));
            
            setCheckoutSelectedMap(prev => {
              const updated = { ...prev };
              catItems.forEach(item => {
                updated[item.id] = nextActive;
              });
              return updated;
            });
            
            setCheckoutAmounts(prev => {
              const updated = { ...prev };
              catItems.forEach(item => {
                const paid = Number(selectedStudentForPayment.paidComponents?.[item.id] || 0);
                const remaining = Math.max(0, item.amount - paid);
                updated[item.id] = nextActive ? remaining.toString() : '0';
              });
              return updated;
            });
          };

          return (
            <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xl z-[100] flex items-center justify-center p-0 sm:p-2.5">
              <motion.div
                initial={{ scale: 0.98, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.98, opacity: 0, y: 15 }}
                className="bg-white rounded-none sm:rounded-[2rem] w-full max-w-[98rem] h-full sm:h-[97vh] max-h-full sm:max-h-[97vh] shadow-[0_50px_145px_rgba(0,0,0,0.7)] border-0 sm:border border-neutral-200 overflow-hidden flex flex-col font-sans"
              >
                {/* UPGRADED HEADER */}
                <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-neutral-950 border-b border-white/10 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 backdrop-blur-md text-emerald-400 rounded-2xl flex items-center justify-center font-black shadow-inner">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">Secure Settlement Portal</span>
                      <h4 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight font-sans mt-0.5">Student Checkout & Payment Ledger Console</h4>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="p-2 bg-white/5 hover:bg-white/10 hover:text-white rounded-xl transition-all cursor-pointer text-neutral-400"
                    title="Close Checkout Workspace"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleRecordOfflinePayment} className="grid grid-cols-12 flex-1 overflow-y-auto lg:overflow-y-auto">
                  {/* LEFT CONSOLE BAR: DETAILS AND CONFIGURATION */}
                  <div className="col-span-12 lg:col-span-4 bg-neutral-50/80 p-5 sm:p-6 overflow-y-auto lg:h-full border-b lg:border-b-0 lg:border-r border-neutral-200/80 space-y-4 flex flex-col justify-between [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="space-y-4">
                      {/* Premium Student Profile & Accommodation Header */}
                      <div className="p-4 bg-white border border-neutral-200/60 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -z-10" />
                        <div className="w-12 h-12 bg-indigo-600 font-bold text-white rounded-2xl flex items-center justify-center text-lg tracking-wider shadow-lg shrink-0">
                          {checkoutStudent?.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className={`font-black uppercase text-lg leading-tight truncate ${(String(checkoutStudent?.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-slate-800'}`}>{checkoutStudent?.name}</h5>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 font-mono font-bold px-2 py-0.5 rounded-md">
                              Class: {classes.find(c => c.id === checkoutStudent?.classId)?.name || checkoutStudent?.class || 'N/A'}
                            </span>
                            <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-100 font-mono font-bold px-2 py-0.5 rounded-md uppercase">
                              {checkoutStudent?.feeType || 'Standard'}
                            </span>
                            <span className="text-[10px] text-neutral-700 bg-neutral-100 font-mono font-bold px-2 py-0.5 rounded-md">
                              Period: {academicYear}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* FEE TYPES SELECTOR (LEFT BOX) */}
                      <div className="space-y-2">
                        <h6 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono flex items-center justify-between">
                          <span>Student Allocated Fee Types</span>
                          <span className="text-indigo-600 font-bold">Configure Cart</span>
                        </h6>
                        <div className="space-y-2 max-h-[260px] lg:max-h-[360px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {availableFeeTypes.map(ft => {
                            const IconComp = ft.icon;
                            const isSelected = !!activeCheckoutCategories[ft.id];
                            return (
                              <button
                                key={ft.id}
                                type="button"
                                onClick={() => handleToggleCategory(ft.id, ft.children)}
                                className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 group relative overflow-hidden cursor-pointer ${
                                  isSelected 
                                    ? `${ft.selectedClass}` 
                                    : `${ft.unselectedClass}`
                                }`}
                              >
                                {isSelected && (
                                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-indigo-600 pointer-events-none" />
                                )}
                                
                                <div className="flex items-center gap-3.5">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                                    isSelected ? `${ft.iconSelectedClass}` : `${ft.iconUnselectedClass}`
                                  }`}>
                                    <IconComp className="w-4.5 h-4.5" />
                                  </div>
                                  <div>
                                    <span className={`text-sm font-black block uppercase tracking-tight ${
                                      isSelected ? 'text-slate-900' : 'text-slate-800'
                                    }`}>
                                      {ft.label}
                                    </span>
                                    <span className="text-[10px] text-neutral-500 font-mono font-bold block">
                                      {ft.children.length} {ft.children.length === 1 ? 'Term' : 'Terms'} Eligible
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className={`text-sm font-black block font-mono ${
                                    isSelected ? 'text-slate-900' : 'text-slate-700'
                                  }`}>
                                    ₹{ft.totalRemaining.toLocaleString()}
                                  </span>
                                  <span className={`text-[9px] font-black uppercase tracking-widest block font-mono mt-0.5 ${
                                    isSelected ? 'text-indigo-600 font-extrabold' : 'text-neutral-500'
                                  }`}>
                                    {isSelected ? '✓ ADDED' : '+ ADD'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* BRIEF UTILITY CHIPS & CONCESSION DETAILS */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className={`p-3.5 rounded-2xl border transition-all ${
                          hasCheckoutConcession 
                            ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-sm ring-4 ring-amber-450/15' 
                            : 'p-3 bg-neutral-100/50 border-neutral-200/40 text-neutral-800'
                        }`}>
                          <div className="flex items-center gap-1">
                            {hasCheckoutConcession && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />}
                            <span className={`text-[8px] font-black uppercase font-mono tracking-wider block ${
                              hasCheckoutConcession ? 'text-amber-700' : 'text-neutral-500'
                            }`}>
                              {hasCheckoutConcession ? '💡 CONCESSION ACTIVE' : 'Concession Mode'}
                            </span>
                          </div>
                          <span className={`text-[11px] font-black uppercase block truncate mt-0.5 ${
                            hasCheckoutConcession ? 'text-amber-950' : 'text-neutral-805'
                          }`}>
                            {checkoutStudent?.feeConcessionType === 'custom' ? 'Custom Flat' : (checkoutConcessionObj?.name || 'Standard')}
                          </span>
                          {hasCheckoutConcession && (
                            <div className="text-[9.5px] text-amber-805 font-bold uppercase mt-1 leading-tight border-t border-amber-200/50 pt-1">
                              {checkoutConcessionText}
                            </div>
                          )}
                        </div>
                        {isTransportActive ? (
                          <div className="p-3 bg-emerald-50/40 border border-emerald-250/30 rounded-2xl">
                            <span className="text-[8px] text-emerald-600 font-extrabold uppercase font-mono tracking-wider block">Village Stop</span>
                            <span className="text-[10px] font-black text-emerald-900 uppercase block truncate mt-0.5">
                              {checkoutStudent?.village || 'Route ' + (checkoutStudent?.busRoute || 'N/A')}
                            </span>
                          </div>
                        ) : (
                          <div className="p-3 bg-neutral-100/50 border border-neutral-200/40 rounded-2xl flex items-center justify-center">
                            <span className="text-[9px] font-extrabold text-neutral-400 uppercase font-mono tracking-wide">No transport stop</span>
                          </div>
                        )}
                      </div>

                      {/* Transaction Parameters */}
                      <div className="space-y-4 pt-1 bg-white p-4 border border-neutral-200/60 rounded-3xl shadow-sm">
                        <h6 className="text-xs font-bold text-indigo-700 uppercase tracking-wider font-sans border-b border-neutral-100 pb-2 flex items-center gap-2">
                          <Settings className="w-4 h-4 text-indigo-500" />
                          <span>Settlement Parameters & Registry Book</span>
                        </h6>
                        
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-neutral-600 uppercase tracking-widest block font-sans flex items-center justify-between">
                            <span>Active Receipt Book Registry</span>
                            <span className="text-[9px] text-indigo-650 font-extrabold normal-case">Series Protected Sequence</span>
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={selectedReceiptBook}
                              onChange={(e) => setSelectedReceiptBook(e.target.value)}
                              className="flex-1 text-xs font-bold p-3 bg-neutral-100 border border-neutral-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all text-slate-800"
                            >
                              {receiptBooks.length === 0 ? (
                                <option value="">No books configured - Seeding default...</option>
                              ) : (
                                receiptBooks.map(bk => (
                                  <option key={bk.id} value={bk.id}>
                                    📖 {bk.name} ({bk.prefix || ''}{bk.currentSerial})
                                  </option>
                                ))
                              )}
                            </select>

                            <button
                              type="button"
                              onClick={() => {
                                const currentBook = receiptBooks.find(bk => bk.id === selectedReceiptBook);
                                if (currentBook) {
                                  setEditingReceiptBook(currentBook);
                                  setShowReceiptBookModal(true);
                                } else {
                                  toast.error("Please click or configuration to select a registry book first");
                                }
                              }}
                              className="p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/50 text-indigo-750 hover:text-indigo-900 rounded-xl cursor-pointer transition-all flex items-center justify-center shrink-0"
                              title="Edit advanced properties"
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingReceiptBook({
                                  name: '',
                                  prefix: 'REC-',
                                  startFrom: 1001,
                                  currentSerial: 1001,
                                  active: true
                                });
                                setShowReceiptBookModal(true);
                              }}
                              className="px-3.5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer font-bold text-xs transition-all flex items-center gap-1.5 shrink-0"
                              title="Create New Receipt Book"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Create Book</span>
                            </button>
                          </div>

                          {activeBook && (
                            <div className="mt-2.5 p-3.5 bg-indigo-50/50 border border-indigo-200/40 rounded-2xl space-y-1 block animate-in fade-in duration-200">
                              <label className="text-[10px] font-bold text-indigo-805 uppercase tracking-wider block">
                                Direct Rename Active Book Registry name
                              </label>
                              <input
                                type="text"
                                value={activeBook.name || ''}
                                onChange={async (e) => {
                                  const updatedName = e.target.value;
                                  setReceiptBooks(prev => prev.map(bk => bk.id === activeBook.id ? { ...bk, name: updatedName } : bk));
                                  try {
                                    await dbService.update('receipt_books', activeBook.id || '', {
                                      name: updatedName,
                                      updatedAt: new Date().toISOString()
                                    });
                                  } catch (err) {
                                    console.error("Failed to update registry name:", err);
                                  }
                                }}
                                className="w-full text-xs font-bold p-2.5 bg-white border border-indigo-200/40 rounded-lg outline-none text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505/20 transition-all font-sans"
                                placeholder="Change book registry name..."
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-600 uppercase tracking-widest block font-sans">Payment Mode</label>
                            <select
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value as any)}
                              className="w-full text-sm font-semibold p-3 bg-neutral-50/50 border border-neutral-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all text-slate-800"
                            >
                              <option value="cash">💵 Cash Settlement</option>
                              <option value="bank_transfer">🏦 Bank Direct Wire</option>
                              <option value="cheque">📄 Paper Cheque Book</option>
                              <option value="upi">📱 UPI / QR scan code</option>
                              <option value="razorpay">💳 Razorpay Online Gateway</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-600 uppercase tracking-widest block font-sans">Verification Ref #</label>
                            <input
                              type="text"
                              placeholder="e.g. TXN98327429"
                              value={paymentRef}
                              onChange={(e) => setPaymentRef(e.target.value)}
                              className="w-full text-sm font-semibold p-3 bg-neutral-50/50 border border-neutral-200 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all text-slate-800 font-mono"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-neutral-600 uppercase tracking-widest block font-sans">Registry Settlement Date</label>
                          <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            min="2026-06-08"
                            className="w-full text-sm font-mono font-extrabold p-3 bg-white border border-neutral-200 rounded-xl outline-none text-slate-800 focus:border-indigo-500 font-sans"
                          />
                          <p className="text-[10px] text-neutral-400 font-medium font-sans">Minimum allowed: school reopening on 08/06/2026.</p>
                        </div>
                      </div>

                      {/* WhatsApp Parent Automation */}
                      <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-[1.5rem] space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest font-mono flex items-center gap-2">
                            <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" /> parent whatsapp dispatch
                          </h4>
                          <input 
                            type="checkbox"
                            checked={shouldSendWhatsApp}
                            onChange={(e) => setShouldSendWhatsApp(e.target.checked)}
                            className="w-4 h-4 accent-emerald-600 outline-none rounded border-neutral-300 cursor-pointer"
                          />
                        </div>
                        
                        {shouldSendWhatsApp && (
                          <div className="space-y-1 block animate-in slide-in-from-top-2 duration-150">
                            <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block font-mono">WhatsApp Number (with Country Code)</label>
                            <input
                              type="tel"
                              placeholder="919876543210"
                              value={parentWhatsApp}
                              onChange={(e) => setParentWhatsApp(e.target.value)}
                              className="w-full text-xs font-black p-2.5 bg-white border border-emerald-200 rounded-xl outline-none font-mono focus:ring-2 focus:ring-emerald-500/20 text-sidebar tracking-wider placeholder-emerald-850/20"
                            />
                            <p className="text-[8px] text-emerald-600/70 font-semibold leading-relaxed">
                              Prefix with country code (e.g., 91 for India). We will compile the receipt and open a direct channel automatically.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Summary Footer bar inside Left Console */}
                    <div className="pt-3.5 border-t border-neutral-200/60 bg-neutral-100/50 -mx-6 -mb-6 p-4 rounded-b-[2rem]">
                      <div className="flex justify-between items-center text-[10px] text-neutral-400 font-extrabold uppercase tracking-widest">
                        <span>Total Payer Outstanding Dues</span>
                        <span className="font-mono text-red-500 text-xs font-black">₹{selectedStudentForPayment.pending.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: DYNAMIC FEE COMPONENT SELECTOR AND CHECKBOX WORKSPACE */}
                  <div className="col-span-12 lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between lg:h-full overflow-y-auto lg:overflow-y-auto space-y-4">
                    <div className="space-y-3 flex flex-col flex-1 overflow-y-auto lg:overflow-y-auto">
                      <div className="flex justify-between items-center border-b border-neutral-100 pb-2 shrink-0">
                        <div>
                          <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">Step 2: Ledger Items</span>
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest font-mono mt-1">Schedules & Overdues Checklist</h4>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const comps = getStudentFeeComponents(selectedStudentForPayment).filter(c => {
                              const paid = Number(selectedStudentForPayment.paidComponents?.[c.id] || 0);
                              const remaining = Math.max(0, c.amount - paid);
                              if (remaining <= 0) return false;

                              let parentCatId = 'other';
                              if (['term1', 'term2', 'term3'].includes(c.id)) {
                                parentCatId = 'academic';
                              } else if (c.id.includes('transport')) {
                                parentCatId = 'transport';
                              } else if (c.id.includes('hostel')) {
                                parentCatId = 'hostel';
                              } else if (c.id === 'lastClassFeeDue') {
                                parentCatId = 'previous_dues';
                              } else if (c.id === 'admission') {
                                parentCatId = 'admission';
                              }
                              return !!activeCheckoutCategories[parentCatId];
                            });

                            if (comps.length === 0) return;
                            const allSelected = comps.every(c => checkoutSelectedMap[c.id]);
                            
                            setCheckoutSelectedMap(prev => {
                              const nextMap = { ...prev };
                              comps.forEach(c => {
                                nextMap[c.id] = !allSelected;
                              });
                              return nextMap;
                            });

                            setCheckoutAmounts(prev => {
                              const nextAmt = { ...prev };
                              comps.forEach(c => {
                                const paid = Number(selectedStudentForPayment.paidComponents?.[c.id] || 0);
                                const remaining = Math.max(0, c.amount - paid);
                                nextAmt[c.id] = !allSelected ? remaining.toString() : '0';
                              });
                              return nextAmt;
                            });
                          }}
                          className="text-[9px] font-black uppercase text-indigo-700 hover:text-indigo-800 tracking-wider font-mono bg-indigo-50 px-3 py-2 rounded-xl transition-colors cursor-pointer border border-indigo-150"
                        >
                          Toggle Selected Category Terms
                        </button>
                      </div>

                      {/* Scrollable multi component table/list - Adjusted dynamically without scrollbars */}
                      <div className="space-y-2.5 w-full pr-1 overflow-y-auto flex-1 max-h-[35vh] sm:max-h-[42vh] lg:max-h-[50vh] xl:max-h-[58vh]">
                        {getStudentFeeComponents(selectedStudentForPayment).map(c => {
                          const paid = Number(selectedStudentForPayment.paidComponents?.[c.id] || 0);
                          const remaining = Math.max(0, c.amount - paid);
                          const isChecked = !!checkoutSelectedMap[c.id];
                          const idxOldFee = c.id === 'lastClassFeeDue';
                          const idxTransportFee = c.id.includes('transport');
                          const idxHostelFee = c.id.includes('hostel');

                          // Rule: do not need to show paid (completed) terms
                          if (remaining <= 0) return null;

                          // Only show if parent category is active/checked on the left
                          let parentCatId = 'other';
                          if (['term1', 'term2', 'term3'].includes(c.id)) {
                            parentCatId = 'academic';
                          } else if (c.id.includes('transport')) {
                            parentCatId = 'transport';
                          } else if (c.id.includes('hostel')) {
                            parentCatId = 'hostel';
                          } else if (c.id === 'lastClassFeeDue') {
                            parentCatId = 'previous_dues';
                          } else if (c.id === 'admission') {
                            parentCatId = 'admission';
                          }

                          const isCatActive = !!activeCheckoutCategories[parentCatId];
                          if (!isCatActive) return null;

                          let stylesClass = '';
                          if (isChecked) {
                            if (parentCatId === 'academic') {
                              stylesClass = 'border-indigo-400 bg-indigo-50 border-l-[6px] border-l-indigo-600 shadow-sm';
                            } else if (parentCatId === 'transport') {
                              stylesClass = 'border-emerald-400 bg-emerald-55/60 border-l-[6px] border-l-emerald-600 shadow-sm';
                            } else if (parentCatId === 'hostel') {
                              stylesClass = 'border-purple-400 bg-purple-50 border-l-[6px] border-l-purple-600 shadow-sm';
                            } else if (parentCatId === 'previous_dues') {
                              stylesClass = 'border-rose-400 bg-rose-50 border-l-[6px] border-l-rose-600 shadow-sm';
                            } else if (parentCatId === 'admission') {
                              stylesClass = 'border-sky-400 bg-sky-50 border-l-[6px] border-l-sky-600 shadow-sm';
                            } else {
                              stylesClass = 'border-amber-400 bg-amber-50 border-l-[6px] border-l-amber-600 shadow-sm';
                            }
                          } else {
                            if (parentCatId === 'academic') {
                              stylesClass = 'border-neutral-200 bg-neutral-50/50 border-l-[6px] border-l-indigo-400/40 opacity-70';
                            } else if (parentCatId === 'transport') {
                              stylesClass = 'border-neutral-200 bg-neutral-50/50 border-l-[6px] border-l-emerald-400/40 opacity-70';
                            } else if (parentCatId === 'hostel') {
                              stylesClass = 'border-neutral-200 bg-neutral-50/50 border-l-[6px] border-l-purple-400/40 opacity-70';
                            } else if (parentCatId === 'previous_dues') {
                              stylesClass = 'border-neutral-200 bg-neutral-50/50 border-l-[6px] border-l-rose-400/40 opacity-70';
                            } else if (parentCatId === 'admission') {
                              stylesClass = 'border-neutral-200 bg-neutral-50/50 border-l-[6px] border-l-sky-400/40 opacity-70';
                            } else {
                              stylesClass = 'border-neutral-200 bg-neutral-50/50 border-l-[6px] border-l-amber-400/40 opacity-70';
                            }
                          }

                          return (
                            <div 
                              key={c.id}
                              className={`p-3 px-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${stylesClass}`}
                            >
                              <label className="flex items-start gap-3.5 cursor-pointer select-none flex-1">
                                <input 
                                  type="checkbox" 
                                  checked={isChecked}
                                  onChange={() => {
                                    setCheckoutSelectedMap(prev => {
                                      const nextStatus = !prev[c.id];
                                      const nextMap = { ...prev, [c.id]: nextStatus };
                                      setCheckoutAmounts(amtPrev => ({
                                        ...amtPrev,
                                        [c.id]: nextStatus ? remaining.toString() : '0'
                                      }));
                                      return nextMap;
                                    });
                                  }}
                                  className="w-4.5 h-4.5 rounded-lg text-indigo-600 accent-indigo-600 border-neutral-300 focus:ring-0 cursor-pointer mt-1"
                                />
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">{c.label}</span>
                                    
                                    {/* Category Type Specific Badges */}
                                    {parentCatId === 'academic' && (
                                      <span className="text-[9px] bg-indigo-100 text-indigo-700 border border-indigo-200/50 tracking-wider font-extrabold px-2 py-0.5 rounded font-mono uppercase shrink-0">
                                        Academic fee
                                      </span>
                                    )}
                                    {parentCatId === 'transport' && (
                                      <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-250/50 tracking-wider font-extrabold px-2 py-0.5 rounded font-mono uppercase shrink-0">
                                        Transport fee
                                      </span>
                                    )}
                                    {parentCatId === 'hostel' && (
                                      <span className="text-[9px] bg-purple-100 text-purple-700 border border-purple-250/50 tracking-wider font-extrabold px-2 py-0.5 rounded font-mono uppercase shrink-0">
                                        Hostel fee
                                      </span>
                                    )}
                                    {parentCatId === 'previous_dues' && (
                                      <span className="text-[9px] bg-rose-100 text-rose-700 border border-rose-200/50 tracking-wider font-extrabold px-2 py-0.5 rounded font-mono uppercase shrink-0">
                                        Legacy Dues
                                      </span>
                                    )}
                                    {parentCatId === 'admission' && (
                                      <span className="text-[9px] bg-sky-100 text-sky-700 border border-sky-205/50 tracking-wider font-extrabold px-2 py-0.5 rounded font-mono uppercase shrink-0">
                                        Admission fee
                                      </span>
                                    )}
                                    {parentCatId === 'other' && (
                                      <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-250/50 tracking-wider font-extrabold px-2 py-0.5 rounded font-mono uppercase shrink-0">
                                        Other fee
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-4 mt-1 font-mono text-[11px] text-neutral-500 font-bold">
                                    <span>Total Levy: <strong className="text-neutral-700">₹{c.amount.toLocaleString()}</strong></span>
                                    <span>Collected: <strong className="text-emerald-600">₹{paid.toLocaleString()}</strong></span>
                                    <span>Pending: <strong className="text-red-500">₹{remaining.toLocaleString()}</strong></span>
                                  </div>
                                </div>
                              </label>

                              <div className="flex items-center gap-2.5 self-end md:self-center bg-white/70 backdrop-blur border border-neutral-200 px-3 py-1.5 rounded-xl">
                                <span className="text-[10px] font-black uppercase text-neutral-400 font-mono tracking-widest">Settle ₹:</span>
                                <div className="relative w-32 shrink-0">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-neutral-400 font-mono">₹</span>
                                  <input 
                                    type="text"
                                    value={checkoutAmounts[c.id] || ''}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/[^0-9]/g, '');
                                      setCheckoutAmounts(prev => ({ ...prev, [c.id]: val }));
                                    }}
                                    disabled={!isChecked}
                                    className="w-full pl-6 pr-2 py-1.5 bg-white border border-neutral-200 disabled:bg-neutral-150 disabled:text-neutral-400 rounded-lg outline-none focus:border-indigo-500 font-mono text-xs font-black text-slate-800 transition-all text-center text-[12px]"
                                    placeholder={remaining.toString()}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Highly Polished Mini-Receipt / Shopping Cart Breakdown */}
                    <div className="border-t border-neutral-250/60 pt-4 space-y-3">
                      <div>
                        {selectedItemsBreakdown.length > 0 ? (
                          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl space-y-1.5 text-xs text-neutral-600 block animate-in fade-in duration-200">
                            <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block font-mono border-b border-neutral-200/60 pb-1">Settlement Ledger Breakdown</span>
                            <div className="max-h-[70px] overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                              {selectedItemsBreakdown.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center font-bold">
                                  <span className="truncate max-w-[280px] text-neutral-500 uppercase">{item.label}</span>
                                  <span className="text-neutral-800 font-black shrink-0">₹{item.payAmount.toLocaleString()}.00</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 text-center text-[10px] text-neutral-300 font-extrabold uppercase font-mono bg-neutral-50 border border-neutral-200/50 rounded-2xl border-dashed">
                            Empty Checkout Desk. Select structures above to start settlement.
                          </div>
                        )}
                      </div>

                      {/* Pricing Overview & Submission Trigger */}
                      <div className="bg-gradient-to-br from-slate-900 via-neutral-900 to-black p-4 sm:p-5 rounded-[1.8rem] text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden group shadow-xl">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px] -mr-32 -mt-32 transition-all group-hover:bg-blue-600/20" />
                        <div className="relative z-10 space-y-1">
                          <p className="text-[9px] text-white/50 font-black uppercase tracking-[0.2em] font-mono">Aggregated Check-Out Sum</p>
                          <div className="flex items-baseline gap-1.5">
                            <p className="text-3xl sm:text-4xl font-black tracking-tighter text-emerald-400 font-mono">
                              ₹{cartTotal.toLocaleString()}
                            </p>
                            <span className="text-xs text-emerald-500 font-black tracking-tight font-mono">INR</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 font-mono">
                              {selectedItemsBreakdown.length} Component Schedules Linked
                            </span>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={submittingPayment || cartTotal === 0}
                          className="w-full sm:w-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2.5 shadow-lg active:scale-95 transition-all duration-150 cursor-pointer relative z-10 shrink-0 self-stretch sm:self-auto disabled:opacity-50"
                        >
                          {submittingPayment ? 'Settling Payment Tasks...' : 'PROCEED TO CHECK OUT'}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* MODAL 2: ASSIGN CONCESSION */}
      <AnimatePresence>
        {showConcessionModal && selectedStudentForConcession && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl border border-neutral-100 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex justify-between items-center shrink-0">
                <div>
                  <h4 className="text-base font-black text-sidebar uppercase tracking-tight">Assign Policy Concession & Extension</h4>
                  <p className="text-[9px] text-neutral-400 font-black uppercase mt-1">Configure scholarships, discounts & extend fee due dates</p>
                </div>
                <button
                  onClick={() => setShowConcessionModal(false)}
                  className="p-1 px-3 bg-neutral-200 hover:bg-neutral-300 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5 text-neutral-600" />
                </button>
              </div>

              <form onSubmit={handleUpdateStudentConcession} className="p-8 space-y-6 overflow-y-auto">
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-3xl">
                  <h5 className={`font-black uppercase text-[12px] ${(String(selectedStudentForConcession.student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{selectedStudentForConcession.student.name}</h5>
                  <p className="text-[9px] text-neutral-400 font-mono font-bold mt-0.5">
                    Outstanding balance: <span className="text-red-500 font-extrabold font-mono">₹{selectedStudentForConcession.pending.toLocaleString()}</span>
                  </p>
                </div>

                {/* SCHOLARSHIP DISCOUNTS */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Available Concessions Schemes</label>
                  <select
                    value={concessionType}
                    onChange={(e) => setConcessionType(e.target.value)}
                    className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  >
                    <option value="none">-- Revert / Remove Any Concessions --</option>
                    <option value="custom">Custom Flat Deductible Adjustment Fee</option>
                    {concessions.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.type === 'percentage' ? `${c.value}% Off` : `₹${c.value} Off`})</option>
                    ))}
                  </select>
                </div>

                {concessionType === 'custom' && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Custom Flat Off Amount</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 5000"
                      value={customConcessionAmt}
                      onChange={(e) => setCustomConcessionAmt(e.target.value)}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>
                )}

                {Number(selectedStudentForConcession?.student?.lastClassFeeDue || 0) > 0 && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Custom Concession on Old Fees Only</label>
                    <input
                      type="number"
                      placeholder="e.g. 3000"
                      value={oldFeeConcession}
                      onChange={(e) => setOldFeeConcession(e.target.value)}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                    <p className="text-[9px] text-amber-600 font-bold uppercase font-mono">
                      Student has Previous Academic Year Dues of ₹{Number(selectedStudentForConcession.student.lastClassFeeDue).toLocaleString()}. Apply concession to this balance only.
                    </p>
                  </div>
                )}

                {/* EXTENSION DUE DATE MANAGEMENT */}
                <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-3xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h6 className="text-xs font-black text-purple-900 uppercase tracking-tight flex items-center gap-1.5 font-mono">
                        <CalendarCheck className="w-3.5 h-3.5 text-purple-600" />
                        Extension Due Date
                      </h6>
                      <p className="text-[9px] text-purple-700 font-bold uppercase mt-0.5">
                        Grant or update custom due date extension for fee payment
                      </p>
                    </div>
                    {concessionExtDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setConcessionExtDate('');
                          setConcessionExtNotes('');
                        }}
                        className="text-[9px] font-bold text-red-600 hover:text-red-700 underline uppercase cursor-pointer"
                      >
                        Clear Extension
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-purple-900/60 uppercase tracking-widest block font-mono">Extended Due Date</label>
                    <input
                      type="date"
                      value={concessionExtDate}
                      onChange={(e) => setConcessionExtDate(e.target.value)}
                      className="w-full text-xs font-bold p-3 bg-white border border-purple-200 rounded-xl outline-none font-mono text-purple-950 focus:border-purple-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-purple-900/60 uppercase tracking-widest block font-mono">Extension Reason / Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Extended payment permission requested by parent"
                      value={concessionExtNotes}
                      onChange={(e) => setConcessionExtNotes(e.target.value)}
                      className="w-full text-xs font-bold p-3 bg-white border border-purple-200 rounded-xl outline-none text-purple-950 focus:border-purple-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingConcession}
                  className="w-full py-4 bg-neutral-900 hover:bg-neutral-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 font-mono cursor-pointer"
                >
                  {submittingConcession ? 'Updating Policy & Extensions...' : 'Apply Settlement & Save Due Date Extension'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: REQUEST DUE DATE EXTENSION */}
      <AnimatePresence>
        {showExtensionModal && selectedStudentForExtension && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl border border-neutral-100 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex justify-between items-center shrink-0">
                <div>
                  <h4 className="text-base font-black text-sidebar uppercase tracking-tight">Request Due Date Extension</h4>
                  <p className="text-[9px] text-neutral-400 font-black uppercase mt-1">Set a custom due date extension requested by authorized staff</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExtensionModal(false)}
                  className="p-1 px-3 bg-neutral-200 hover:bg-neutral-300 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5 text-neutral-600" />
                </button>
              </div>

              <form onSubmit={handleSaveExtension} className="p-8 space-y-6 overflow-y-auto">
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-3xl">
                  <h5 className={`font-black uppercase text-[12px] ${(String(selectedStudentForExtension.student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{selectedStudentForExtension.student.name}</h5>
                  <p className="text-[9px] text-neutral-400 font-mono font-bold mt-0.5">
                    Academic Year: <span className="text-purple-700 font-extrabold font-mono">{academicYear}</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Fee Component</label>
                  <select
                    value={selectedExtensionComponent}
                    onChange={(e) => setSelectedExtensionComponent(e.target.value)}
                    className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    required
                  >
                    {getStudentFeeComponents(selectedStudentForExtension).map(comp => (
                      <option key={comp.id} value={comp.id}>
                        {comp.label} (₹{comp.amount?.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Extended Due Date</label>
                  <input
                    type="date"
                    required
                    value={extendedDate}
                    onChange={(e) => setExtendedDate(e.target.value)}
                    className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Extension Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Parental cash flow issue, medical extension..."
                    value={extensionReason}
                    onChange={(e) => setExtensionReason(e.target.value)}
                    className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingExtension}
                  className="w-full py-4 bg-purple-700 hover:bg-purple-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 font-mono cursor-pointer"
                >
                  {submittingExtension ? 'Submitting request...' : 'Grant Due Date Extension'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: MANAGE / ADD FEE STRUCTURE */}
      <AnimatePresence>
        {showStructureModal && editingStructure && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl border border-neutral-100 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex justify-between items-center">
                <div>
                  <h4 className="text-base font-black text-sidebar uppercase tracking-tight">Configure Class-Wide Dynamic Billing Structure</h4>
                  <p className="text-[9px] text-neutral-400 font-black uppercase mt-1">Determine base Term schedules and parameters</p>
                </div>
                <button
                  onClick={() => setShowStructureModal(false)}
                  className="p-1 px-3 bg-neutral-200 hover:bg-neutral-300 rounded-xl"
                >
                  <X className="w-5 h-5 text-neutral-600" />
                </button>
              </div>

              <form onSubmit={handleSaveStructure} className="p-8 space-y-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Structure Identification name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 10 Class Class"
                      value={editingStructure.name || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, name: e.target.value })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Structure Fee Scope Pattern</label>
                    <select
                      value={editingStructure.type || 'school'}
                      onChange={(e) => setEditingStructure({ ...editingStructure, type: e.target.value as any })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    >
                      <option value="school">🏫 School Core Academic Fee</option>
                      <option value="hostel">🏢 Hostel Boarding & Accommodation Fee</option>
                      <option value="transport">🚌 School Transport Route Fee</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Term 1 Amount</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 20000"
                      value={editingStructure.term1 || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, term1: Number(e.target.value) })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Term 2 Amount</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 18000"
                      value={editingStructure.term2 || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, term2: Number(e.target.value) })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Term 3 Amount</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 15000"
                      value={editingStructure.term3 || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, term3: Number(e.target.value) })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">Term 1 Due Date</label>
                    <input
                      type="date"
                      value={editingStructure.term1DueDate || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, term1DueDate: e.target.value })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">Term 2 Due Date</label>
                    <input
                      type="date"
                      value={editingStructure.term2DueDate || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, term2DueDate: e.target.value })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block font-mono">Term 3 Due Date</label>
                    <input
                      type="date"
                      value={editingStructure.term3DueDate || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, term3DueDate: e.target.value })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    />
                  </div>
                </div>

                {/* Conditional Fields depending on Type of Fee Structure */}
                {editingStructure.type === 'school' && (
                  <div className="border-l-4 border-indigo-500 pl-4 py-1">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Admission Enrollment Fee</label>
                      <input
                        type="number"
                        placeholder="e.g. 5000"
                        value={editingStructure.admissionFee || ''}
                        onChange={(e) => setEditingStructure({ ...editingStructure, admissionFee: Number(e.target.value) })}
                        className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                      />
                    </div>
                  </div>
                )}



                <div className={`${editingStructure.type === 'school' ? 'grid grid-cols-1' : 'grid grid-cols-2'} gap-4`}>
                  {editingStructure.type !== 'school' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">
                        Optional Extra Surcharge Fee
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 500"
                        value={editingStructure.healthCardFee || ''}
                        onChange={(e) => setEditingStructure({ ...editingStructure, healthCardFee: Number(e.target.value) })}
                        className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Class Term Target Year</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 2026-27"
                      value={editingStructure.academicYear || ''}
                      onChange={(e) => setEditingStructure({ ...editingStructure, academicYear: e.target.value })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingStructure}
                  className="w-full py-4 bg-neutral-900 hover:bg-neutral-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 font-mono"
                >
                  {submittingStructure ? 'Saving structure configuration...' : 'Commit Billing Structure Scheme'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: MANAGE / ADD CONCESSION CATEGORY */}
      <AnimatePresence>
        {showConcessionCatModal && editingConcessionCat && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl border border-neutral-100 overflow-hidden flex flex-col"
            >
              <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex justify-between items-center">
                <div>
                  <h4 className="text-base font-black text-sidebar uppercase tracking-tight">Configure Concession discount Category</h4>
                  <p className="text-[9px] text-neutral-400 font-black uppercase mt-1">Determine flat or percentage concessions policies</p>
                </div>
                <button
                  onClick={() => setShowConcessionCatModal(false)}
                  className="p-1 px-3 bg-neutral-200 hover:bg-neutral-300 rounded-xl"
                >
                  <X className="w-5 h-5 text-neutral-600" />
                </button>
              </div>

              <form onSubmit={handleSaveConcessionCat} className="p-8 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Policy Category Designation name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Merit Scholarship Award"
                    value={editingConcessionCat.name || ''}
                    onChange={(e) => setEditingConcessionCat({ ...editingConcessionCat, name: e.target.value })}
                    className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Concession Calculation style</label>
                    <select
                      value={editingConcessionCat.type || 'percentage'}
                      onChange={(e) => setEditingConcessionCat({ ...editingConcessionCat, type: e.target.value as any })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    >
                      <option value="percentage">Percentage ( % Off )</option>
                      <option value="fixed">Fixed Flat Rate ( ₹ Off )</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Concession value</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 20 (for 20% or Flat ₹20)"
                      value={editingConcessionCat.value !== undefined ? editingConcessionCat.value : ''}
                      onChange={(e) => setEditingConcessionCat({ ...editingConcessionCat, value: Number(e.target.value) })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Discount target scope</label>
                    <select
                      value={editingConcessionCat.appliedTo || 'school'}
                      onChange={(e) => setEditingConcessionCat({ ...editingConcessionCat, appliedTo: e.target.value as any })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    >
                      <option value="school">🏫 Core Academic School Fees</option>
                      <option value="hostel">🏢 Hostel Accommodation Rooms fee</option>
                      <option value="transport">🚌 Transportation Facility Routes fee</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Brief Description / Remarks</label>
                    <input
                      type="text"
                      placeholder="e.g. Given to Top Rank boarders"
                      value={editingConcessionCat.description || ''}
                      onChange={(e) => setEditingConcessionCat({ ...editingConcessionCat, description: e.target.value })}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingConcessionCat}
                  className="w-full py-4 bg-neutral-900 hover:bg-neutral-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 font-mono"
                >
                  {submittingConcessionCat ? 'Saving category scheme...' : 'Save Concession Discount Policy'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAIL DRAWER / SLIDE-IN SIDEBOARD FOR SELECTED STUDENT LEDGER */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-40 flex justify-end">
          <div className="absolute inset-0" onClick={() => setSelectedStudentDetail(null)} />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="w-full max-w-2xl bg-white h-full shadow-2xl relative z-10 flex flex-col"
          >
            {/* Header */}
            <div className="p-8 border-b border-neutral-150 flex justify-between items-center bg-neutral-5 w-full shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 border border-indigo-150 rounded-2xl flex items-center justify-center text-indigo-700 font-black">
                  FS
                </div>
                <div>
                  <h4 className={`text-base font-black uppercase tracking-tight ${(String(selectedStudentDetail.student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>Full Ledger: {selectedStudentDetail.student.name}</h4>
                  <p className="text-[10px] text-neutral-400 font-semibold uppercase mt-0.5 tracking-wider font-mono">Academic parameters breakdown sheets</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentDetail(null)}
                className="p-1 px-3 bg-neutral-200 hover:bg-neutral-300 rounded-xl text-xs font-black uppercase text-neutral-60 upper-wider"
              >
                Close Sheets
              </button>
            </div>

            {/* Scrollable Contents */}
            <div className="p-8 space-y-8 overflow-y-auto flex-1 scrollbar-thin text-xs text-neutral-600 font-semibold leading-relaxed">
              
              {/* Calculations Summary Info */}
              <div className="bg-neutral-900 p-6 rounded-3xl text-white relative overflow-hidden flex justify-between items-center">
                <div className="space-y-1.5 relative z-10">
                  <span className="text-[9px] font-black text-white/40 uppercase tracking-widest font-mono">Net outstanding settlement balance</span>
                  <h3 className="text-3xl font-black text-emerald-450 font-mono">₹{selectedStudentDetail.pending.toLocaleString()} Due</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase text-indigo-400">Ledger fully synchronized with cloud</span>
                  </div>
                </div>
                <div className="text-right relative z-10">
                  <span className="px-3 py-1 bg-white/10 rounded-full border border-white/10 text-[9px] font-black text-white/70 uppercase">
                    Session {academicYear}
                  </span>
                </div>
              </div>

              {/* Fee Components breakdown list */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2 font-mono">Fee Components & Due Schedules</h5>
                
                <div className="space-y-3">
                  {[
                    { id: 'term1', name: 'Term 1 Core tuition Fee', amount: selectedStudentDetail.calculation.schoolStructure ? Math.round(selectedStudentDetail.calculation.schoolStructure.term1) : 0, limit: '1' },
                    { id: 'term2', name: 'Term 2 Core tuition Fee', amount: selectedStudentDetail.calculation.schoolStructure ? Math.round(selectedStudentDetail.calculation.schoolStructure.term2) : 0, limit: '2' },
                    { id: 'term3', name: 'Term 3 Core tuition Fee', amount: selectedStudentDetail.calculation.schoolStructure ? Math.round(selectedStudentDetail.calculation.schoolStructure.term3) : 0, limit: '3' },
                    { id: 'transport', name: 'Transport Facilities dues', amount: Math.round(selectedStudentDetail.calculation.transportFee), limit: 'route' },
                    { id: 'hostel_term1', name: 'Hostel Lodging rooms fee', amount: Math.round(selectedStudentDetail.calculation.hostelFee), limit: 'boarding' },
                    { id: 'admission', name: 'Admission & enrollment registration fee', amount: Math.round(selectedStudentDetail.calculation.admissionFee) },
                    { id: 'ipl', name: 'IPL special tech coaches batch Fee', amount: Math.round(selectedStudentDetail.calculation.iplFee) },
                    { id: 'healthCard', name: 'School primary student Health Card', amount: Math.round(selectedStudentDetail.calculation.healthCardFee) }
                  ].filter(c => c.amount > 0).map(item => {
                    const isPaidForThis = selectedStudentDetail.paidComponents[item.id] || 0;
                    const isRemainingForThis = Math.max(0, item.amount - isPaidForThis);
                    return (
                      <div key={item.id} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex justify-between items-center hover:bg-neutral-100/50 transition-all">
                        <div className="space-y-1">
                          <h6 className="font-extrabold text-sidebar uppercase text-[11px] font-mono">{item.name}</h6>
                          <div className="flex gap-4 text-[9px] text-neutral-400 font-bold font-mono">
                            <span>TOTAL: ₹{item.amount.toLocaleString()}</span>
                            <span className="text-emerald-600">PAID: ₹{isPaidForThis.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            isRemainingForThis <= 0 ? 'bg-emerald-50 text-emerald-650' : 'bg-red-50 text-red-500'
                          }`}>
                            {isRemainingForThis <= 0 ? 'All Cleared' : `₹${isRemainingForThis.toLocaleString()} Overdue`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Due Date Schedules & Extensions list */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2 font-mono font-bold">Active Due Dates & Extensions</h5>
                <div className="space-y-3 font-mono text-[10px]">
                  {(() => {
                    const studentCandIds = new Set([
                      selectedStudentDetail.student?.id,
                      selectedStudentDetail.student?.uid,
                      selectedStudentDetail.student?.studentId,
                      selectedStudentDetail.student?.admissionNo,
                      selectedStudentDetail.student?.rollNo
                    ].filter(Boolean));

                    // Get custom due date extensions from collection
                    const studentExts = (extendedDueDates || []).filter((ext: any) => 
                      studentCandIds.has(ext.studentId) || studentCandIds.has(ext.studentUid) || studentCandIds.has(ext.student_id)
                    );

                    // Check student direct extension fields
                    const directExtDate = selectedStudentDetail.student?.extendedDueDate;
                    const directExtReason = selectedStudentDetail.student?.extendedDueDateNotes || selectedStudentDetail.student?.extendedDueDateReason || 'Granted in Concessions & Extensions';

                    // Prepare active due dates map per component
                    const componentsDueInfo = [
                      { id: 'term1', name: 'Term 1 Core Tuition Fee', defaultDue: selectedStudentDetail.calculation?.schoolStructure?.term1DueDate || '2026-07-05', amount: Math.round(selectedStudentDetail.calculation?.schoolStructure?.term1 || 0) },
                      { id: 'term2', name: 'Term 2 Core Tuition Fee', defaultDue: selectedStudentDetail.calculation?.schoolStructure?.term2DueDate || '2026-10-05', amount: Math.round(selectedStudentDetail.calculation?.schoolStructure?.term2 || 0) },
                      { id: 'term3', name: 'Term 3 Core Tuition Fee', defaultDue: selectedStudentDetail.calculation?.schoolStructure?.term3DueDate || '2027-01-05', amount: Math.round(selectedStudentDetail.calculation?.schoolStructure?.term3 || 0) },
                      { id: 'transport', name: 'Transport Facilities Fee', defaultDue: selectedStudentDetail.calculation?.transportStructure?.term1DueDate || '2026-07-05', amount: Math.round(selectedStudentDetail.calculation?.transportFee || 0) },
                      { id: 'hostel_term1', name: 'Hostel Lodging Fee', defaultDue: selectedStudentDetail.calculation?.hostelStructure?.term1DueDate || '2026-07-05', amount: Math.round(selectedStudentDetail.calculation?.hostelFee || 0) },
                      { id: 'admission', name: 'Admission Registration Fee', defaultDue: '2026-06-01', amount: Math.round(selectedStudentDetail.calculation?.admissionFee || 0) },
                      { id: 'ipl', name: 'IPL Special Tech Coaching Fee', defaultDue: '2026-07-05', amount: Math.round(selectedStudentDetail.calculation?.iplFee || 0) },
                      { id: 'healthCard', name: 'Primary Student Health Card', defaultDue: '2026-07-05', amount: Math.round(selectedStudentDetail.calculation?.healthCardFee || 0) }
                    ].filter(c => c.amount > 0);

                    return (
                      <div className="space-y-3">
                        {/* Custom Extensions Highlight if granted */}
                        {(studentExts.length > 0 || directExtDate) && (
                          <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-2 mb-3">
                            <div className="flex items-center gap-1.5 text-purple-900 font-extrabold text-[10px] uppercase">
                              <CalendarCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>Custom Fee Due Date Extension Active</span>
                            </div>
                            {studentExts.length > 0 ? (
                              studentExts.map((ext: any) => (
                                <div key={ext.id || ext.extendedDate} className="text-[9.5px] text-purple-950 font-medium pl-5 border-l-2 border-purple-300">
                                  <span>{getComponentNameLabel(ext.componentId || 'term1')}: </span>
                                  <strong className="text-purple-700 font-extrabold">{ext.extendedDate}</strong>
                                  {ext.reason && <span className="text-neutral-500 italic"> — "{ext.reason}"</span>}
                                  <span className="text-neutral-400 text-[8.5px] block font-mono">By: {ext.requestedByName || ext.requestedBy || 'Staff'}</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-[9.5px] text-purple-950 font-medium pl-5 border-l-2 border-purple-300">
                                <span>All Terms Extended Due Date: </span>
                                <strong className="text-purple-700 font-extrabold">{directExtDate}</strong>
                                <span className="text-neutral-500 italic"> — "{directExtReason}"</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Standard & Active Component Due Schedules */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {componentsDueInfo.map((comp) => {
                            const extObj = studentExts.find((e: any) => e.componentId === comp.id || e.component === comp.id);
                            const activeDueDate = extObj?.extendedDate || (comp.id === 'term1' ? directExtDate : null) || comp.defaultDue;
                            const isExtended = Boolean(extObj?.extendedDate || (comp.id === 'term1' && directExtDate));
                            const paidAmt = selectedStudentDetail.paidComponents[comp.id] || 0;
                            const isCleared = paidAmt >= comp.amount;

                            return (
                              <div key={comp.id} className="p-3 bg-neutral-50/80 border border-neutral-150 rounded-xl flex justify-between items-center text-[9.5px]">
                                <div className="space-y-0.5">
                                  <div className="font-extrabold text-neutral-800 uppercase text-[10px]">{comp.name}</div>
                                  <div className="flex items-center gap-1.5 text-neutral-500 font-mono">
                                    <span>Active Due:</span>
                                    <span className={`font-black ${isExtended ? 'text-purple-700 underline' : 'text-neutral-700'}`}>
                                      {activeDueDate}
                                    </span>
                                    {isExtended && (
                                      <span className="px-1 py-0.2 bg-purple-100 text-purple-700 text-[7.5px] font-black rounded uppercase">Extended</span>
                                    )}
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider ${
                                  isCleared ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {isCleared ? 'Cleared' : 'Active'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Transactions History list */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2 font-mono font-bold">Transactions Receipts Archive for Student</h5>
                
                <div className="space-y-3">
                  {(() => {
                    const studentCandIds = new Set([
                      selectedStudentDetail.student?.id,
                      selectedStudentDetail.student?.uid,
                      selectedStudentDetail.student?.studentId,
                      selectedStudentDetail.student?.admissionNo,
                      selectedStudentDetail.student?.rollNo
                    ].filter(Boolean));

                    // 1. Gather global payments matching student candidate IDs
                    const globalMatched = (payments || []).filter((p: any) => 
                      studentCandIds.has(p.studentId) || studentCandIds.has(p.studentUid) || studentCandIds.has(p.student_id)
                    );

                    // 2. Gather payments attached to selectedStudentDetail
                    const detailMatched = selectedStudentDetail.payments || [];

                    // 3. Gather payments in feeRecord paymentHistory
                    const feeRec = (fees || []).find((f: any) => 
                      studentCandIds.has(f.studentId) || studentCandIds.has(f.studentUid)
                    );
                    const historyMatched = (feeRec?.paymentHistory || []).map((hp: any, idx: number) => ({
                      id: hp.id || `hist_${feeRec.id || 'f'}_${idx}`,
                      reference: hp.reference || hp.ref || `REC-HIST-${idx + 101}`,
                      amount: hp.amount || hp.paidAmount || 0,
                      component: hp.component || hp.comp || 'term1',
                      method: hp.method || hp.paymentMethod || 'CASH',
                      date: hp.date || hp.createdAt || hp.timestamp || feeRec.updatedAt || new Date().toISOString(),
                      studentId: selectedStudentDetail.student?.id || selectedStudentDetail.student?.uid
                    }));

                    const existingTxns = [...globalMatched, ...detailMatched, ...historyMatched];

                    // 4. Synthetic fallback receipts if paidComponents shows payments but no explicit transaction receipt object exists
                    const syntheticTxns: any[] = [];
                    Object.entries(selectedStudentDetail.paidComponents || {}).forEach(([compKey, paidAmtNum]) => {
                      const paidVal = Number(paidAmtNum) || 0;
                      if (paidVal > 0) {
                        const covers = existingTxns.some(t => 
                          Number(t.amount) > 0 && 
                          (t.component === compKey || (compKey.startsWith('term') && t.component === 'school') || t.component?.includes(compKey))
                        );
                        if (!covers) {
                          syntheticTxns.push({
                            id: `synth_${selectedStudentDetail.student?.id}_${compKey}`,
                            reference: `OFFICIAL-RC-[${compKey.toUpperCase()}]`,
                            amount: paidVal,
                            component: compKey,
                            method: 'SCHOOL_RECEIPT',
                            date: feeRec?.updatedAt || selectedStudentDetail.student?.updatedAt || new Date().toISOString(),
                            studentId: selectedStudentDetail.student?.id || selectedStudentDetail.student?.uid,
                            isVerifiedRecord: true
                          });
                        }
                      }
                    });

                    // Deduplicate and filter payments
                    const combinedRaw = [...existingTxns, ...syntheticTxns].filter(p => Number(p.amount) > 0);
                    const seenKeys = new Set<string>();
                    const finalArchivePayments: any[] = [];

                    combinedRaw.forEach(p => {
                      const key = p.id || `${p.reference || ''}_${p.component || ''}_${p.amount}_${p.date ? new Date(p.date).toISOString().split('T')[0] : ''}`;
                      if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        finalArchivePayments.push(p);
                      }
                    });

                    // Sort by date newest first
                    finalArchivePayments.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

                    return finalArchivePayments.length > 0 ? (
                      finalArchivePayments.map((pay: any) => (
                        <div key={pay.id} className="p-4 bg-white border border-neutral-150 rounded-2xl flex justify-between items-center hover:shadow-md transition-all font-mono text-[10px]">
                          <div className="space-y-0.5">
                            <div className="font-black text-sidebar uppercase tracking-tight text-xs flex items-center gap-1.5">
                              <span>{pay.reference || pay.id}</span>
                              <span className="px-1.5 py-0.2 bg-neutral-100 border text-[8px] font-black uppercase text-neutral-400 rounded">
                                {pay.method || 'PAID'}
                              </span>
                            </div>
                            <span className="font-bold text-neutral-400">
                              {getComponentNameLabel(pay.component || 'other')} | {pay.date ? new Date(pay.date).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                          <div className="text-right space-y-1">
                            <span className="font-black text-emerald-600 text-sm block">₹{Number(pay.amount).toLocaleString()}</span>
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => {
                                  setSelectedReceipt(pay);
                                  setShowReceiptModal(true);
                                }}
                                className="text-[8px] font-black uppercase text-indigo-500 hover:text-indigo-700 underline flex items-center gap-1 cursor-pointer"
                              >
                                Print Receipt
                              </button>
                              <span className="text-neutral-300 select-none">|</span>
                              {!isVicePrincipal ? (
                                <button
                                  onClick={() => handleDeletePayment(pay, selectedStudentDetail?.student?.id || selectedStudentDetail?.student?.uid)}
                                  className="text-[8px] font-black uppercase text-rose-500 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Delete transaction record"
                                >
                                  Void
                                </button>
                              ) : (
                                <span className="text-[8px] font-bold uppercase text-neutral-400">View Only</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-neutral-450 border border-dashed border-neutral-150 rounded-2xl">
                        No paid transactions recorded for this student.
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL 5: DETAILED PRINTABLE TRANSACTION RECEIPT */}
      <AnimatePresence>
        {showReceiptModal && selectedReceipt && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <style>{`
              @media print {
                @page {
                  size: 80mm auto !important;
                  margin: 0 !important;
                }
                body * {
                  visibility: hidden !important;
                }
                #receipt-print-area-thermal,
                #receipt-print-area-thermal * {
                  visibility: visible !important;
                  color: #000000 !important;
                  background-color: transparent !important;
                  text-shadow: none !important;
                  box-shadow: none !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                /* Convert gray tones directly into solid printer-friendly solid black */
                #receipt-print-area-thermal text,
                #receipt-print-area-thermal span,
                #receipt-print-area-thermal div,
                #receipt-print-area-thermal td,
                #receipt-print-area-thermal th,
                #receipt-print-area-thermal p,
                #receipt-print-area-thermal h2,
                #receipt-print-area-thermal h3 {
                  color: #000000 !important;
                }
                /* Avoid rendering shaded grey box background fills */
                #receipt-print-area-thermal .bg-neutral-100,
                #receipt-print-area-thermal .bg-neutral-50 {
                  background-color: transparent !important;
                  background: transparent !important;
                  border: 1px solid #000000 !important;
                }
                /* Convert dotted and dashed margins to solid razor-sharp dividers */
                #receipt-print-area-thermal .border-dashed,
                #receipt-print-area-thermal .border-dotted,
                #receipt-print-area-thermal .border-neutral-200,
                #receipt-print-area-thermal .border-neutral-300 {
                  border-style: solid !important;
                  border-color: #000000 !important;
                  border-width: 1px 0 0 0 !important;
                }
                #receipt-print-area-thermal .border-black {
                  border-color: #000000 !important;
                  border-style: solid !important;
                  border-width: 1px !important;
                }
                #receipt-print-area-thermal {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 80mm !important;
                  max-width: 80mm !important;
                  margin: 0 !important;
                  padding: 4mm !important;
                  box-sizing: border-box !important;
                  background: white !important;
                  color: black !important;
                  font-size: 11px !important;
                  line-height: 1.15 !important;
                  display: block !important;
                  font-family: Arial, Helvetica, sans-serif !important;
                }
                #receipt-print-area-thermal * {
                  color: black !important;
                  font-family: Arial, Helvetica, sans-serif !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-neutral-200"
            >
              
              {/* Receipt Area (Target for print) */}
              <div id="receipt-print-area-thermal" className="p-8 text-black bg-white space-y-4">
              
                {(() => {
                  // Find the student details
                  const pStudent = students.find(s => s.id === selectedReceipt.studentId || s.uid === selectedReceipt.studentId) || {
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

                  const targetYear = selectedReceipt.academicYear || academicYear || '2026-27';
                  const feeCalc = calculateStudentFee(pStudent as any, targetYear, feeStructures, concessions, classes, batches, true);
                  const studentPayments = (payments || []).filter(p => p.studentId === pStudent.id || p.studentId === pStudent.uid);

                  const isConsolidated = selectedReceipt.component && selectedReceipt.component.startsWith('multi_');

                  let paidFeesList: Array<{ id: string; label: string; paid: number; balance: number }> = [];

                  if (isConsolidated) {
                    const rawComponent = selectedReceipt.component || '';
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
                        paid: selectedReceipt.amount / componentTokens.length,
                        balance: balanceLeft
                      });
                    });
                  } else {
                    const compKey = selectedReceipt.component || 'school';
                    const ck = compKey as any;
                    let label = pStudent ? getComponentNameLabel(compKey) : 'School Tuition Dues';

                    let totalForComp = selectedReceipt.amount; // default
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
                      paid: Number(selectedReceipt.amount),
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
                    <div className="bg-white text-black space-y-3 font-sans text-[11px] sm:text-[12px] leading-tight p-4">
                      {/* Header Section */}
                      <div className="flex flex-row items-center justify-center gap-2 w-full border-b-[2px] border-black pb-1.5 select-none">
                        {settings?.logoUrl ? (
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
                          <h3 className="font-bold uppercase tracking-tight text-left text-black font-sans leading-none text-[16px] m-0 p-0">
                            St.Antony's School
                          </h3>
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
                            #{selectedReceipt.serialNumber || selectedReceipt.reference || selectedReceipt.id}
                          </span>
                        </div>
                        <div className="flex flex-row items-center gap-0.5 shrink-0 text-right uppercase font-bold">
                          <span className="text-neutral-500 font-mono">DATE:</span>
                          <span className="text-neutral-900 font-mono font-normal">
                            {selectedReceipt.date ? (selectedReceipt.date.includes('T') ? selectedReceipt.date.split('T')[0] : selectedReceipt.date) : 'N/A'}
                            {selectedReceipt.paymentTime ? ` | ${selectedReceipt.paymentTime}` : ''}
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
                        <div className="uppercase font-bold">NAME OF THE STUDENT: <span className="font-normal text-black ml-1 uppercase">{pStudent.name}</span></div>
                        <div className="uppercase font-bold">FATHER NAME: <span className="font-normal text-black ml-1 uppercase">{pStudent.fatherName || pStudent.parentName || 'N/A'}</span></div>
                        <div className="uppercase font-bold">CLASS & BATCH: <span className="font-normal text-black ml-1 uppercase">{pClass} - {pBatch}</span></div>
                        <div className="uppercase font-bold">RECEIPT BOOK NO: <span className="font-normal text-black ml-1 uppercase">{selectedReceipt.receiptBookName || "Main Institutional Book"}</span></div>
                        {pStudent.admissionNumber && (
                          <div className="uppercase font-bold text-neutral-800">ADMISSION NO: <span className="font-normal ml-1 uppercase">{pStudent.admissionNumber}</span></div>
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
                          <span className="text-[13px] font-mono font-bold">₹{Number(selectedReceipt.amount || 0).toLocaleString()}</span>
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
                        <p className="text-[8px] text-neutral-450 font-mono tracking-widest mt-1 uppercase">SYSTEM_SECURED_REGISTER</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal controls */}
              <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex gap-4 no-print">
                <button
                  onClick={() => {
                    window.focus();
                    window.print();
                  }}
                  className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Print Sheet
                </button>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="px-6 py-3 bg-white border border-neutral-200 rounded-xl text-neutral-500 font-black text-xs uppercase hover:bg-neutral-100"
                >
                  Close
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: MANAGE EXPENDITURE CATEGORIES */}
      <AnimatePresence>
        {showManageCategoriesModal && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-neutral-100 overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-neutral-100 flex justify-between items-start bg-neutral-50/50">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-900/5 rounded-full text-[10px] font-black uppercase tracking-wider text-neutral-600 font-mono">
                    <Settings className="w-3.5 h-3.5 text-neutral-500" /> SYSTEM DEFINITIONS
                  </span>
                  <h4 className="text-lg font-black text-neutral-800 uppercase tracking-tight mt-2">Expenditure Categories</h4>
                  <p className="text-[10px] text-neutral-400 font-black uppercase mt-1">Configure categories for operational debits</p>
                </div>
                <button
                  onClick={() => setShowManageCategoriesModal(false)}
                  className="p-2.5 bg-neutral-100 hover:bg-neutral-200 rounded-full transition cursor-pointer"
                >
                  <X className="w-5 h-5 text-neutral-600" />
                </button>
              </div>

              <div className="p-8 space-y-6 flex-1 overflow-y-auto max-h-[400px]">
                {/* Seed button if they don't have many categories */}
                <div className="flex justify-between items-center bg-amber-50 p-4 rounded-2xl border border-amber-100">
                  <div className="space-y-0.5">
                    <p className="text-xs font-black text-amber-805 uppercase font-mono">Seed Default Categories</p>
                    <p className="text-[10px] text-amber-600 font-semibold leading-relaxed">Restore or duplicate institutional standard categories.</p>
                  </div>
                  <button
                    onClick={handleSeedDefaultCategories}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition shadow-sm cursor-pointer"
                  >
                    Load Defaults
                  </button>
                </div>

                {/* Add Category Form */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Add New Category</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Science Lab Consumables"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1 text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                    />
                    <button
                      onClick={handleCreateCategory}
                      disabled={isSavingCategory}
                      className="px-4 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Categories List */}
                <div className="space-y-2.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Current Categories</label>
                  <div className="divide-y divide-neutral-100 border border-neutral-150 rounded-2xl overflow-hidden bg-neutral-50/50">
                    {(expCategories.length > 0 ? expCategories : DEFAULT_CATEGORIES).map((cat) => (
                      <div key={cat} className="flex justify-between items-center p-3 px-4 bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition">
                        <span className="uppercase tracking-wide font-mono text-neutral-600">{cat}</span>
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title={`Delete ${cat}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex justify-end">
                <button
                  onClick={() => setShowManageCategoriesModal(false)}
                  className="px-6 py-3 bg-white border border-neutral-205 rounded-xl text-neutral-500 font-extrabold text-xs uppercase hover:bg-neutral-100 tracking-wider shadow-sm cursor-pointer"
                >
                  Close Manager
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 6: RECORD EXPENDITURE / EXPENSE */}
      <AnimatePresence>
        {showExpenditureModal && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl border border-neutral-100 overflow-hidden flex flex-col"
            >
              <div className="p-6 bg-neutral-50 border-b border-neutral-100 flex justify-between items-center">
                <div>
                  <h4 className="text-base font-black text-sidebar uppercase tracking-tight">Record School Expense / Outflow</h4>
                  <p className="text-[9px] text-neutral-400 font-black uppercase mt-1">Scribe daily debits or operational expenditures</p>
                </div>
                <button
                  onClick={() => setShowExpenditureModal(false)}
                  className="p-1 px-3 bg-neutral-200 hover:bg-neutral-300 rounded-xl"
                >
                  <X className="w-5 h-5 text-neutral-600" />
                </button>
              </div>

              <form onSubmit={handleSaveExpenditure} className="p-8 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Short Description / Payee Purpose</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. May electricity bill payment"
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Outflow Category</label>
                    <select
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value)}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none text-neutral-700"
                    >
                      {(expCategories.length > 0 ? expCategories : DEFAULT_CATEGORIES).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Amount (₹ INR)</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 1500"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Payment Mode / Protocol</label>
                    <select
                      value={expPaymentMethod}
                      onChange={(e) => setExpPaymentMethod(e.target.value as any)}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none text-neutral-700"
                    >
                      <option value="cash">💵 Cash In Hand</option>
                      <option value="online">🏦 Bank Transfer</option>
                      <option value="cheque">✍️ Cheque Draft</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block font-mono">Transaction Reference No</label>
                    <input
                      type="text"
                      placeholder="e.g. TXN987019"
                      value={expRef}
                      onChange={(e) => setExpRef(e.target.value)}
                      className="w-full text-xs font-bold p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all duration-150 font-mono cursor-pointer"
                >
                  Scribe & Commit Expense Debit
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HIGH-FIDELITY RAZORPAY SANDBOX REPLICA GATEWAY INTERACTIVE MODAL */}
      <AnimatePresence>
        {showSandboxGateway && sandboxOrder && selectedStudentForPayment && (
          <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white rounded-[24px] shadow-[0_24px_60px_rgba(0,0,0,0.3)] w-full max-w-[480px] overflow-hidden border border-neutral-200 relative flex flex-col font-sans"
            >
              {/* Header matching Razorpay brand colors */}
              <div className="bg-[#1c2438] text-white p-6 shrink-0 relative">
                <div className="absolute top-4 right-4 bg-amber-500 text-neutral-950 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full font-mono tracking-wider animate-pulse font-bold">
                  Test Mode Sandbox
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-neutral-200 overflow-hidden shrink-0">
                    <img src="https://cdn.razorpay.com/logos/BUV9U383pS9pZ7_medium.png" alt="Merchant Logo" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold tracking-wide text-white uppercase font-sans">{settings?.schoolName || "ST. ANTONY'S HIGH SCHOOL"}</h4>
                    <p className="text-[11px] text-neutral-400 font-medium font-mono mt-0.5">Order Ref: {sandboxOrder.id}</p>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-between items-baseline border-t border-neutral-800 pt-4">
                  <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider font-mono">Amount Payable</span>
                  <span className="text-2xl font-mono font-extrabold text-[#4f8eff] font-black">₹{(sandboxOrder.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Main Checkout Options Panel */}
              <div className="p-6 bg-[#f8fbff] flex-1 overflow-y-auto space-y-5">
                {/* Pre-fill User Data Verification */}
                <div className="bg-white p-4 rounded-xl border border-blue-50 space-y-2">
                  <span className="text-[9px] font-black text-neutral-450 uppercase tracking-widest block font-mono font-bold">Payer Identity Handshake</span>
                  <p className={`text-xs font-bold ${(String(selectedStudentForPayment.student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-neutral-800'}`}>{selectedStudentForPayment.student.name} ({selectedStudentForPayment.student.rollNumber || 'ST-STUDENT'})</p>
                  <div className="flex justify-between text-[11px] text-neutral-500 font-medium">
                    <span>{selectedStudentForPayment.student.email || 'portal@school.edu'}</span>
                    <span>{selectedStudentForPayment.student.phone || parentWhatsApp || '9988776655'}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    type="button"
                    onClick={handleSimulateSandboxSuccess}
                    className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all text-center flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                  >
                    <Smartphone className="w-5 h-5 animate-bounce" />
                    <span>Authorize Simulated Successful Payment</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setShowSandboxGateway(false)}
                    className="w-full py-3 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-250 text-neutral-500 font-bold text-xs transition-all text-center"
                  >
                    Cancel / Abort Sandbox
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* State-based Custom Confirmation Dialog (Bypasses iframe sandboxing alert/confirm restrictions) */}
      <AnimatePresence>
        {confirmConfig?.show && (
          <div className="fixed inset-0 bg-neutral-900/65 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-7 border border-neutral-100 text-center space-y-5"
            >
              <div className="flex justify-center">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 font-black text-xl font-mono">
                  !
                </div>
              </div>
              <div className="space-y-1.5">
                <h4 className="text-sm font-black text-sidebar uppercase tracking-widest">{confirmConfig.title}</h4>
                <p className="text-neutral-500 text-xs font-bold leading-relaxed">{confirmConfig.message}</p>
              </div>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmConfig(null)}
                  className="px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl text-xs font-black uppercase tracking-wider font-mono cursor-pointer transition-all hover:scale-102"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmConfig.onConfirm}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider font-mono cursor-pointer transition-all hover:scale-102 shadow-md shadow-rose-200"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
