import React, { useEffect, useState, useRef, type FC, type FormEvent, type ChangeEvent } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IndexNoticeBanner } from '../components/IndexNoticeBanner';
import { dbService, checkQuotaStatus } from '../services/dbService';
import { where, orderBy, limit, startAfter } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  UserSquare2, 
  Search, 
  Plus, 
  Sparkles, 
  Mail, 
  Phone, 
  BookOpen,
  Edit,
  Trash2,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Download,
  Upload,
  FileSpreadsheet,
  X,
  ShieldCheck,
  Save,
  User,
  Users,
  UserPlus,
  UserMinus,
  PlusCircle,
  Check,
  Briefcase,
  Building2,
  Calendar,
  CreditCard,
  MapPin,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Info,
  Bell,
  Eye,
  ShieldAlert,
  GraduationCap
} from 'lucide-react';
import { toast } from 'sonner';
import { getLessonPlan, analyzeImportData } from '../services/aiService';
import { UserProfile } from '../types';
import Papa from 'papaparse';
import { uploadService } from '../services/uploadService';
import { normalizeUrl, getGravatarUrl, sortAlphabetically, getStaffDisplayName, getPersonDisplayName, cleanPersonName, isSyntheticOrMailName } from '../lib/utils';
import { isKnownDemoName, isDemoStaffRecord } from '../constants/systemAccounts';
import { purgeAllDemoDataFromDatabase, deduplicateAndPurgeClashes, resolveSingleClash } from '../services/demoDataPurgeService';
import { getAssignedClassTeacherBatch } from '../utils/teacherFilter';
import CameraModal from '../components/CameraModal';
import { SortAsc, SortDesc, Camera } from 'lucide-react';

let globalCachedStaff: any[] | null = null;

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

const Staff: FC = () => {
  const { hasPermission, profile, isAdmin, isVicePrincipal } = useAuth();
  const isTeacherRole = profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject';
  const isVicePrincipalRole = isVicePrincipal || profile?.role === 'vice_principal' || profile?.role === 'principal';
  const isSuperAdmin = profile?.email === 'manamunagaraju@gmail.com';
  const isFullAdmin = isAdmin || profile?.role === 'admin' || profile?.role === 'superadmin' || isSuperAdmin;
  
  const canCreateStaff = (hasPermission('staff_create') || isAdmin || isVicePrincipalRole) && !isTeacherRole;
  const canEditStaff = (hasPermission('staff_edit') || isAdmin || isVicePrincipalRole) && !isTeacherRole;
  const canDeleteStaff = (hasPermission('staff_delete') || isAdmin || isSuperAdmin || isVicePrincipalRole) && !isTeacherRole;
  const canManageStaff = (hasPermission('staff_manage') || isAdmin || isSuperAdmin || isVicePrincipalRole);

  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexError, setIndexError] = useState<any>(null);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const limitCount = 25;
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [globalSortDirection, setGlobalSortDirection] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import Preview State
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);
  const [importAnalysis, setImportAnalysis] = useState<string>('');
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedStaffForUser, setSelectedStaffForUser] = useState<any>(null);

  const handleCreateUserAccount = async (staff: any) => {
    try {
      setLoading(true);
      // Construct a user profile based on staff data
      // We use a prefix 'staff_' for temporary IDs if they haven't logged in yet
      const userId = `staff_${staff.id}`;
      const userData = {
        uid: null, // Will be linked on first login
        email: staff.email.trim().toLowerCase(),
        name: staff.name,
        role: staff.role || 'teacher',
        photoURL: staff.photoURL || '',
        staffId: staff.id,
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      await dbService.create('users', userId, userData);
      toast.success(`Login account provisioned for ${staff.name}`);
      setShowUserModal(false);
      fetchStaff();
    } catch (error: any) {
      console.error('Error creating user account:', error);
      toast.error(`Failed to create account: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const [isImporting, setIsImporting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [duplicateList, setDuplicateList] = useState<any[]>([]);
  const [repairableList, setRepairableList] = useState<any[]>([]);
  const [showDuplicateScan, setShowDuplicateScan] = useState(false);

  // Add/Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false);
  const [activeBatchForAssignments, setActiveBatchForAssignments] = useState<any>(null);
  const [shiftSearchTerm, setShiftSearchTerm] = useState('');
  const [isShiftDropdownOpen, setIsShiftDropdownOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'active' | 'inactive' | 'staff_batches'>('active');
  const [showDropModal, setShowDropModal] = useState(false);
  const [selectedStaffForStatus, setSelectedStaffForStatus] = useState<UserProfile | null>(null);
  const [dropDate, setDropDate] = useState(new Date().toISOString().split('T')[0]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [staffBatches, setStaffBatches] = useState<any[]>([]);
  const [subjectsList, setSubjectsList] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [customRoles, setCustomRoles] = useState<any[]>([]);

  const [allActiveStaffList, setAllActiveStaffList] = useState<any[]>([]);
  const [selectedAssignClass, setSelectedAssignClass] = useState('');
  const [selectedAssignBatch, setSelectedAssignBatch] = useState('');
  const [selectedAssignSubject, setSelectedAssignSubject] = useState('');

  const initialStaffState = {
    name: '',
    email: '',
    phone: '',
    role: 'teacher' as any,
    staffType: 'teaching' as 'teaching' | 'non-teaching',
    department: '',
    dateOfJoining: new Date().toISOString().split('T')[0],
    gender: 'male' as 'male' | 'female' | 'other',
    bloodGroup: '',
    aadharNumber: '',
    bankDetails: {
      accountNumber: '',
      bankName: '',
      ifscCode: ''
    },
    address: '',
    emergencyContact: '',
    subjects: [] as string[],
    classIds: [] as string[],
    batchIds: [] as string[],
    subjectAssignments: [] as Array<{ classId: string; batchId: string; subjectId: string }>,
    staffBatches: [] as string[],
    classId: '', // Keep for backward compatibility/legacy
    batchId: '', // Keep for backward compatibility/legacy
    classTeacherBatchId: '',
    classTeacherClassId: '',
    busNumber: '',
    route: '',
    qualification: '',
    experience: '',
    salary: '',
    epf: '',
    photoURL: '',
    status: 'active' as 'active' | 'inactive'
  };
  
  const [formData, setFormData] = useState(initialStaffState);

  const [expandedStaffIds, setExpandedStaffIds] = useState<Record<string, boolean>>({});

  const handleDirectStaffPhotoUpload = async (member: any, file: File) => {
    if (!file) return;
    const staffId = member.uid || member.id;
    const toastId = toast.loading(`Uploading photo for ${member.name}...`);
    try {
      const processedFile = await uploadService.processProfileImage(file);
      const url = await uploadService.uploadFile(processedFile);
      
      await dbService.update('staff', staffId, { 
        photoURL: url,
        photoUrl: url
      });

      // Update local state
      setStaff(prev => prev.map(s => (s.uid === staffId || s.id === staffId) ? { ...s, photoURL: url, photoUrl: url } : s));
      setAllActiveStaffList(prev => prev.map(s => (s.uid === staffId || s.id === staffId) ? { ...s, photoURL: url, photoUrl: url } : s));

      toast.success(`Photo uploaded for ${member.name}!`, { id: toastId });
    } catch (err: any) {
      console.error('[StaffPhotoUpload]', err);
      toast.error(`Failed to upload photo: ${err.message || 'Unknown error'}`, { id: toastId });
    }
  };

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'primary';
  } | null>(null);

  const fetchStaff = async (isNewSearch = false) => {
    if (checkQuotaStatus()) {
      setLoading(false);
      return;
    }
    
    // If we don't have any staff loaded, show loading spinner. Otherwise, load cached version instantly in the background.
    if (staff.length === 0) {
      setLoading(true);
    }

    try {
      const processStaffResults = (usersList: any[], profilesList: any[], batchesList: any[] = []) => {
        const unifiedStaffMap = new Map<string, any>();
        const emailToKeyMap = new Map<string, string>();
        const nameToKeyMap = new Map<string, string>();

        // Build index of authentic class teachers assigned to batches
        const batchTeacherByUid = new Map<string, string>();
        const batchTeacherByEmail = new Map<string, string>();
        const batchTeacherByBatchId = new Map<string, string>();
        const batchTeacherByClassName = new Map<string, string>();

        (batchesList || []).forEach((b: any) => {
          if (!b) return;
          const bId = String(b.id || '').trim();
          const bName = String(b.name || '').trim().toLowerCase();
          const rawTeacher = String(b.classTeacherName || b.classTeacher || '').trim();
          const cleanTeacher = isKnownDemoName(rawTeacher) || isSyntheticOrMailName(rawTeacher) ? '' : cleanPersonName(rawTeacher);
          const ctId = String(b.classTeacherId || '').trim();
          const ctEmail = String(b.classTeacherEmail || '').trim().toLowerCase();

          if (cleanTeacher) {
            if (ctId) batchTeacherByUid.set(ctId, cleanTeacher);
            if (ctEmail) batchTeacherByEmail.set(ctEmail, cleanTeacher);
            if (bId) batchTeacherByBatchId.set(bId, cleanTeacher);
            if (bName) batchTeacherByClassName.set(bName, cleanTeacher);
          }
        });

        // 1. Add all authentic staff profiles from the staff collection
        (profilesList || []).forEach((s: any) => {
          if (!s) return;
          const sId = s.uid || s.id;
          if (!sId) return;

          // Skip pure mock/demo records
          if (isDemoStaffRecord(s)) return;

          const normEmail = (s.email || '').toLowerCase().trim();
          const sBatchId = String(s.batchId || s.classTeacherBatchId || '').trim();
          const sBatchName = String(s.batch || s.className || '').trim().toLowerCase();

          // Resolve batch-assigned teacher name if present
          const batchAssignedName = (sId && batchTeacherByUid.get(sId)) || 
                                   (normEmail && batchTeacherByEmail.get(normEmail)) || 
                                   (sBatchId && batchTeacherByBatchId.get(sBatchId)) ||
                                   (sBatchName && batchTeacherByClassName.get(sBatchName)) || '';

          // Authentically user-edited or user-authored name in database
          const isUserEdited = !!(s.isEditedByUser || s.isUserModified || s.hasBeenEdited);
          const rawName = (s.name || s.displayName || s.fullName || '').trim();
          const cleanRawName = isUserEdited ? rawName : (isKnownDemoName(rawName) || isSyntheticOrMailName(rawName) ? '' : rawName);
          const fName = isUserEdited 
            ? (s.firstName || (rawName ? rawName.split(' ')[0] : '')) 
            : (s.firstName && !isKnownDemoName(s.firstName) && !isSyntheticOrMailName(s.firstName) ? s.firstName : (cleanRawName ? cleanRawName.split(' ')[0] : ''));
          const lName = isUserEdited
            ? (s.lastName || (rawName ? rawName.split(' ').slice(1).join(' ') : ''))
            : (s.lastName && !isKnownDemoName(s.lastName) && !isSyntheticOrMailName(s.lastName) ? s.lastName : (cleanRawName ? cleanRawName.split(' ').slice(1).join(' ') : ''));
          
          const resolvedStaffName = cleanRawName || 
                                   (fName ? `${fName} ${lName}`.trim() : '') || 
                                   batchAssignedName || 
                                   getStaffDisplayName({ ...s, classTeacherName: batchAssignedName, name: cleanRawName, firstName: fName, lastName: lName });
          
          // Silently clean demo names in Firestore in the background ONLY if not user-edited
          if (!isUserEdited && (isKnownDemoName(rawName) || isKnownDemoName(s.firstName) || isKnownDemoName(s.lastName))) {
            dbService.update('staff', sId, {
              name: '',
              displayName: '',
              fullName: '',
              firstName: '',
              lastName: '',
              secondName: '',
              hasDemoNameRemoved: true
            }).catch(() => {});
          }

          const normName = resolvedStaffName.toLowerCase().trim();

          let targetKey = sId;
          if (normEmail && emailToKeyMap.has(normEmail)) {
            targetKey = emailToKeyMap.get(normEmail)!;
          } else if (normName && normName !== 'staff member' && nameToKeyMap.has(normName)) {
            targetKey = nameToKeyMap.get(normName)!;
          }

          const existing = unifiedStaffMap.get(targetKey) || {};
          const merged = {
            ...existing,
            ...s,
            uid: s.uid || existing.uid || sId,
            id: s.id || existing.id || sId,
            firstName: fName,
            lastName: lName,
            name: resolvedStaffName,
            status: s.status || existing.status || 'active',
          };

          unifiedStaffMap.set(targetKey, merged);
          if (normEmail) emailToKeyMap.set(normEmail, targetKey);
          if (normName && normName !== 'staff member') nameToKeyMap.set(normName, targetKey);
        });

        // 2. Enrich existing staff records with user login details without changing names or creating phantom staff
        (usersList || []).forEach((u: any) => {
          if (!u) return;
          const uId = u.uid || u.id;
          if (!uId) return;

          // Skip pure mock/demo user records
          if (isDemoStaffRecord(u)) return;

          const normEmail = (u.email || '').toLowerCase().trim();
          const uBatchId = String(u.batchId || u.classTeacherBatchId || '').trim();
          const uBatchName = String(u.batch || u.className || '').trim().toLowerCase();

          // Resolve batch-assigned teacher name if present
          const batchAssignedName = (uId && batchTeacherByUid.get(uId)) || 
                                   (normEmail && batchTeacherByEmail.get(normEmail)) || 
                                   (uBatchId && batchTeacherByBatchId.get(uBatchId)) ||
                                   (uBatchName && batchTeacherByClassName.get(uBatchName)) || '';

          let existingKey: string | null = null;
          if (uId && unifiedStaffMap.has(uId)) {
            existingKey = uId;
          } else if (normEmail && emailToKeyMap.has(normEmail)) {
            existingKey = emailToKeyMap.get(normEmail)!;
          }

          if (existingKey) {
            const existing = unifiedStaffMap.get(existingKey);
            // Preserve the staff profile's authentic name without overriding
            unifiedStaffMap.set(existingKey, {
              ...existing,
              uid: existing.uid || uId,
              photoURL: existing.photoURL || u.photoURL || '',
              email: existing.email || u.email || '',
              status: existing.status || u.status || 'active'
            });
          } else if (u.role && u.role !== 'student' && u.role !== 'parent') {
            const isUserEdited = !!(u.isEditedByUser || u.isUserModified || u.hasBeenEdited);
            const rawName = (u.name || u.displayName || u.fullName || '').trim();
            const cleanRawName = isUserEdited ? rawName : (isKnownDemoName(rawName) || isSyntheticOrMailName(rawName) ? '' : rawName);
            const fName = isUserEdited 
              ? (u.firstName || (rawName ? rawName.split(' ')[0] : ''))
              : (u.firstName && !isKnownDemoName(u.firstName) && !isSyntheticOrMailName(u.firstName) ? u.firstName : (cleanRawName ? cleanRawName.split(' ')[0] : ''));
            const lName = isUserEdited
              ? (u.lastName || (rawName ? rawName.split(' ').slice(1).join(' ') : ''))
              : (u.lastName && !isKnownDemoName(u.lastName) && !isSyntheticOrMailName(u.lastName) ? u.lastName : (cleanRawName ? cleanRawName.split(' ').slice(1).join(' ') : ''));
            
            const resolvedStaffName = cleanRawName || 
                                     (fName ? `${fName} ${lName}`.trim() : '') || 
                                     batchAssignedName || 
                                     getStaffDisplayName({ ...u, classTeacherName: batchAssignedName, name: cleanRawName, firstName: fName, lastName: lName });
            
            // Silently clean demo names in Firestore in background ONLY if not user-edited
            if (!isUserEdited && (isKnownDemoName(rawName) || isKnownDemoName(u.firstName) || isKnownDemoName(u.lastName))) {
              dbService.update('users', uId, {
                name: '',
                displayName: '',
                fullName: '',
                firstName: '',
                lastName: '',
                secondName: '',
                hasDemoNameRemoved: true
              }).catch(() => {});
            }

            const targetKey = uId || `user_${normEmail}`;
            unifiedStaffMap.set(targetKey, {
              ...u,
              uid: u.uid || uId,
              id: u.id || uId,
              firstName: fName,
              lastName: lName,
              name: resolvedStaffName,
              status: u.status || 'active',
            });
            if (normEmail) emailToKeyMap.set(normEmail, targetKey);
          }
        });

        return Array.from(unifiedStaffMap.values());
      };

      // 1. Stale-While-Revalidate: Try cache first (returns instantly)
      const [cachedUsers, cachedStaffProfiles, cachedBatches] = await Promise.all([
        dbService.list('users', [], false),
        dbService.list('staff', [], false),
        dbService.list('batches', [], false)
      ]);

      if ((cachedUsers && cachedUsers.length > 0) || (cachedStaffProfiles && cachedStaffProfiles.length > 0)) {
        const cachedList = processStaffResults(cachedUsers || [], cachedStaffProfiles || [], cachedBatches || []);
        setStaff(cachedList);
        setHasMore(false);
        setLoading(false); // Disable spinner early since cache loaded!
      }

      // 2. Load fresh records from the server in the background (or foreground if cache was empty)
      const [allUsers, allStaffProfiles, allBatches] = await Promise.all([
        dbService.list('users', [], true),
        dbService.list('staff', [], true),
        dbService.list('batches', [], true)
      ]);

      if (allBatches && allBatches.length > 0) {
        setBatches(sortAlphabetically(allBatches.filter(Boolean), 'name', globalSortDirection));
      }

      const unifiedStaffList = processStaffResults(allUsers, allStaffProfiles, allBatches || []);
      setStaff(unifiedStaffList);
      setHasMore(false);
    } catch (error: any) {
      console.error("Error fetching staff:", error);
      if (staff.length === 0) {
        toast.error("Failed to load staff");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchAllActiveStaff = async () => {
    try {
      // 1. Try to load active staff from cache first
      const cachedRes = await dbService.list('staff', [where('status', '==', 'active')], false);
      if (cachedRes && cachedRes.length > 0) {
        setAllActiveStaffList(cachedRes.filter(Boolean));
      }

      // 2. Fetch fresh active staff from the server in the background
      dbService.list('staff', [where('status', '==', 'active')], true).then(res => {
        setAllActiveStaffList((res || []).filter(Boolean));
      }).catch(err => console.warn("Background active staff update failed:", err));
    } catch (e) {
      console.error("Failed to load all active staff profile list:", e);
    }
  };

  useEffect(() => {
    if (checkQuotaStatus()) return;
    fetchAllActiveStaff();
    // metadata loading - fetch independently to prevent one block from failing others
    dbService.list('classes', [limit(200)]).then(res => setClasses(sortAlphabetically((res || []).filter(Boolean), 'name', globalSortDirection))).catch(e => console.error("Failed to load classes", e));
    dbService.list('batches', [limit(200)]).then(res => setBatches(sortAlphabetically((res || []).filter(Boolean), 'name', globalSortDirection))).catch(e => console.error("Failed to load batches", e));
    dbService.list('staff_batches', [limit(200)]).then(res => setStaffBatches(sortAlphabetically((res || []).filter(Boolean), 'name', globalSortDirection))).catch(e => console.error("Failed to load staff batches", e));
    dbService.list('subjects', [limit(200)]).then(res => setSubjectsList(sortAlphabetically((res || []).filter(Boolean), 'name', globalSortDirection))).catch(e => console.error("Failed to load subjects", e));
    dbService.list('buses', [limit(100)]).then(res => setBuses((res || []).filter(Boolean))).catch(e => console.error("Failed to load buses", e));
    dbService.list('stops', [limit(500)]).then(res => setStops((res || []).filter(Boolean))).catch(e => console.error("Failed to load stops", e));
    dbService.list('roles', [limit(50)]).then(res => setCustomRoles((res || []).filter(Boolean).filter((r: any) => !r.isDeleted))).catch(e => console.error("Failed to load custom roles", e));

    const unsubBatches = dbService.subscribe('batches', [], (batchData) => {
      if (batchData && Array.isArray(batchData)) {
        setBatches(sortAlphabetically(batchData.filter(Boolean), 'name', globalSortDirection));
      }
    }, (error) => {
      console.error("Error subscribing to batches in Staff:", error);
    });

    return () => {
      unsubBatches();
    };
  }, [globalSortDirection]);

  useEffect(() => {
    setLastDoc(null);
    fetchStaff(true);
  }, [activeTab, customRoles]);

  const loadMore = () => {
    if (!loading && hasMore && activeTab !== 'staff_batches') {
      fetchStaff(false);
    }
  };

  const handleAssignToBatch = async (staffId: string, batchId: string) => {
    try {
      const person = allActiveStaffList.find(s => s.uid === staffId) || staff.find(s => s.uid === staffId);
      if (!person) return;
      const currentBatches = person.staffBatches || [];
      if (currentBatches.includes(batchId)) return;
      
      const newBatches = [...currentBatches, batchId];
      await dbService.update('staff', staffId, { staffBatches: newBatches });
      setStaff(prev => prev.map(s => s.uid === staffId ? { ...s, staffBatches: newBatches } : s));
      setAllActiveStaffList(prev => prev.map(s => s.uid === staffId ? { ...s, staffBatches: newBatches } : s));
      toast.success("Staff assigned successfully");
    } catch (error) {
      toast.error("Failed to assign staff member");
    }
  };

  const handleRemoveFromBatch = async (staffId: string, batchId: string) => {
    try {
      const person = allActiveStaffList.find(s => s.uid === staffId) || staff.find(s => s.uid === staffId);
      if (!person) return;
      const currentBatches = person.staffBatches || [];
      const newBatches = currentBatches.filter(id => id !== batchId);
      
      await dbService.update('staff', staffId, { staffBatches: newBatches });
      setStaff(prev => prev.map(s => s.uid === staffId ? { ...s, staffBatches: newBatches } : s));
      setAllActiveStaffList(prev => prev.map(s => s.uid === staffId ? { ...s, staffBatches: newBatches } : s));
      toast.success("Staff removed successfully");
    } catch (error) {
      toast.error("Failed to remove staff member");
    }
  };

  const handleSaveBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManageStaff) return toast.error('No permission');
    
    try {
      if (editingBatch?.id) {
        await dbService.update('staff_batches', editingBatch.id, {
          name: editingBatch.name || 'New Shift',
          startTime: editingBatch.startTime || '09:00',
          endTime: editingBatch.endTime || '17:00',
          updatedAt: new Date().toISOString()
        });
        toast.success("Batch updated successfully");
      } else {
        await dbService.add('staff_batches', {
          name: editingBatch?.name || 'New Shift',
          startTime: editingBatch?.startTime || '09:00',
          endTime: editingBatch?.endTime || '17:00',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        toast.success("Batch created successfully");
      }
      setShowBatchModal(false);
      setEditingBatch(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to save batch");
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const downloadTemplate = () => {
    const templateData = [{
      Name: 'Jane Smith',
      Email: 'jane.smith@school.com',
      Phone: '9876543210',
      Role: 'teacher',
      StaffType: 'teaching',
      Department: 'Science',
      Subjects: 'Mathematics, Physics',
      Qualification: 'M.Sc, B.Ed',
      Experience: '5 Years'
    }];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'staff_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Import template downloaded");
  };

  const exportToCSV = () => {
    const exportData = staff.map(t => ({
      Name: t.name,
      Email: t.email,
      Role: t.role || 'N/A',
      StaffType: t.staffType || 'N/A',
      Department: t.department || 'N/A',
      Phone: t.phone || 'N/A',
      Subjects: (t.subjects || []).join(', '),
      Qualification: t.qualification || 'N/A',
      Experience: t.experience || 'N/A'
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `staff_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Staff exported successfully");
  };

  const exportStaffShiftsToCSV = () => {
    const listToExport = allActiveStaffList.length > 0 ? allActiveStaffList : staff.filter(s => s.status === 'active');
    
    const exportData = listToExport.map(s => {
      const assignedBatches = staffBatches.filter(b => (s.staffBatches || []).includes(b.id));
      const shiftNames = assignedBatches.map(b => b.name).join(', ') || 'None';
      const shiftTimings = assignedBatches.map(b => `${b.name} (${b.startTime || '09:00'} - ${b.endTime || '17:00'})`).join(', ') || 'None';
      
      const totalHours = assignedBatches.reduce((total, b) => {
        if (b.startTime && b.endTime) {
          const [startH, startM] = b.startTime.split(':').map(Number);
          const [endH, endM] = b.endTime.split(':').map(Number);
          let diffM = (endH * 60 + endM) - (startH * 60 + startM);
          if (diffM < 0) diffM += 24 * 60;
          return total + (diffM / 60);
        }
        return total + 8;
      }, 0);

      return {
        'Staff Name': getStaffDisplayName(s),
        'Email': s.email || 'N/A',
        'Role': s.role || 'Staff',
        'Department': s.department || 'N/A',
        'Staff Type': s.staffType || 'N/A',
        'Assigned Shifts': shiftNames,
        'Shift Timings': shiftTimings,
        'Number of Assigned Shifts': assignedBatches.length,
        'Estimated Weekly Hours (Based on Shifts)': (totalHours * 5).toFixed(1) + ' hrs'
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `staff_shifts_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Staff Shift Assignments exported successfully! 📂");
  };

  const exportToA4PDF = () => {
    const headers = ["Name", "Email", "Role", "Staff Type", "Department", "Phone", "Subjects", "Qualification", "Experience"];
    const data = staff.map(t => [
      t.name || 'N/A',
      t.email || 'N/A',
      t.role || 'N/A',
      t.staffType || 'N/A',
      t.department || 'N/A',
      t.phone || 'N/A',
      (t.subjects || []).join(', ') || 'N/A',
      t.qualification || 'N/A',
      t.experience || 'N/A'
    ]);

    const doc = new jsPDF({
      orientation: 'landscape',
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
    doc.text("Staff Directory Audit Report", 14, 11);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} | Total members: ${staff.length}`, 14, 18);

    autoTable(doc, {
      startY: 28,
      head: [headers],
      body: data,
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

    doc.save(`staff_export_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Staff directory exported cleanly and formatted within A4 dimensions!");
  };

  const repairStaffRecords = async () => {
    if (repairableList.length === 0) return;
    setIsScanning(true);
    toast.info(`Activating ${repairableList.length} invisible records...`);
    try {
      const staffRoles = ['teacher', 'accountant', 'clerk', 'admin', 'principal', 'vice_principal', 'staff', 'driver', 'attendant', 'helper', 'aya', 'coordinator', 'front_office', 'receptionist'];
      
      const batchSize = 100;
      for (let i = 0; i < repairableList.length; i += batchSize) {
        const chunk = repairableList.slice(i, i + batchSize);
        await Promise.all(chunk.map(async s => {
          const rawRole = (s.role || 'staff').toLowerCase().trim();
          const normalizedRole = rawRole.replace(/\s+/g, '_');
          const finalRole = staffRoles.includes(normalizedRole) ? normalizedRole : 'staff';
          
          const uid = s.uid || s.id;
          
          // 1. Update user record
          await dbService.update('users', uid, {
            status: 'active',
            role: finalRole,
            updatedAt: new Date().toISOString()
          });

          // 2. Ensure staff profile exists
          try {
            const existingStaff = await dbService.get('staff', uid);
            if (!existingStaff) {
              await dbService.create('staff', uid, {
                ...s,
                uid: uid,
                status: 'active',
                role: finalRole,
                updatedAt: new Date().toISOString(),
                createdAt: s.createdAt || new Date().toISOString()
              });
            } else {
              await dbService.update('staff', uid, {
                status: 'active',
                role: finalRole,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (profileErr) {
            // If get fails, try creating
            await dbService.set('staff', uid, {
              ...s,
              uid: uid,
              status: 'active',
              role: finalRole,
              updatedAt: new Date().toISOString(),
              createdAt: s.createdAt || new Date().toISOString()
            });
          }
        }));
      }
      toast.success(`Successfully activated ${repairableList.length} staff records! They should now be visible.`);
      setRepairableList([]);
      fetchStaff(true);
    } catch (error) {
      console.error("Repair error:", error);
      toast.error("Failed to repair records");
    } finally {
      setIsScanning(false);
    }
  };

  const scanForDuplicates = async () => {
    setIsScanning(true);
    setDuplicateList([]);
    setRepairableList([]);
    try {
      toast.info("Scanning all users for duplicates and invisible records...");
      // Fetch all users to check cross-role duplicates
      const [allUsers, allStaffProfiles] = await Promise.all([
        dbService.list('users', [], true),
        dbService.list('staff', [], true)
      ]);

      const staffProfileIds = new Set(allStaffProfiles.map((s: any) => s.uid || s.id));
      const dups: any[] = [];
      const repairable: any[] = [];
      
      const emailMap = new Map<string, any[]>();
      const phoneMap = new Map<string, any[]>();
      const aadharMap = new Map<string, any[]>();

      const staffRoles = ['teacher', 'accountant', 'clerk', 'admin', 'principal', 'vice_principal', 'staff', 'driver', 'attendant', 'helper', 'aya', 'coordinator', 'front_office', 'receptionist'];

      allUsers.forEach((s: any) => {
        const rawRole = (s.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        const isActuallyStaff = staffRoles.includes(rawRole);
        const looksLikeStaff = !s.role || s.role === '';
        
        const uid = s.uid || s.id;
        const existsInStaff = staffProfileIds.has(uid);

        // Strictly exclude students and parents from repairable list
        // Repairable if: 
        // 1. Missing status
        // 2. Missing from staff collection but has staff role
        // 3. Role mismatch or missing role (looksLikeStaff)
        if (rawRole !== 'student' && rawRole !== 'parent') {
          if ((isActuallyStaff || looksLikeStaff) && (!s.status || !existsInStaff)) {
            repairable.push(s);
          }
        }

        if (s.email) {
          const email = s.email.toLowerCase().trim();
          if (!emailMap.has(email)) emailMap.set(email, []);
          emailMap.get(email)!.push(s);
        }
        if (s.phone) {
          const phone = s.phone.replace(/\D/g, '');
          if (phone.length >= 10) {
            if (!phoneMap.has(phone)) phoneMap.set(phone, []);
            phoneMap.get(phone)!.push(s);
          }
        }
        if (s.aadharNumber || s.studentAadharNumber) {
          const aadhar = (s.aadharNumber || s.studentAadharNumber).replace(/\s/g, '');
          if (!aadharMap.has(aadhar)) aadharMap.set(aadhar, []);
          aadharMap.get(aadhar)!.push(s);
        }
      });

      const checkDupMap = (map: Map<string, any[]>, type: string) => {
        map.forEach((users, val) => {
          if (users.length > 1) {
            dups.push({ type, value: val, users });
          }
        });
      };

      checkDupMap(emailMap, 'Email');
      checkDupMap(phoneMap, 'Phone Number');
      checkDupMap(aadharMap, 'Aadhar Number');

      setDuplicateList(dups);
      setRepairableList(repairable);
      setShowDuplicateScan(true);
      if (dups.length === 0 && repairable.length === 0) toast.success("No duplicate records found across the entire system!");
      else toast.warning(`Scan complete: Found ${dups.length} duplicates and ${repairable.length} invisible records.`);
    } catch (error) {
      console.error("Scan error:", error);
      toast.error("Failed to scan for duplicates");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAutoMergeAllDuplicates = async () => {
    setIsScanning(true);
    const toastId = toast.loading("Auto-merging duplicate accounts and purging ghost records...");
    try {
      const result = await deduplicateAndPurgeClashes();
      toast.success(`Successfully resolved ${result.mergedGroupsCount} duplicate clashes and cleaned ${result.deletedDuplicatesCount} duplicate documents!`, { id: toastId });
      await scanForDuplicates();
      await fetchStaff(true);
      await fetchAllActiveStaff();
    } catch (err: any) {
      console.error("Auto merge duplicates failed:", err);
      toast.error(`Failed to auto-merge duplicates: ${err.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setIsScanning(false);
    }
  };

  const handleResolveSingleClash = async (dup: any) => {
    const toastId = toast.loading(`Resolving clash for ${dup.value}...`);
    try {
      await resolveSingleClash(dup.type, dup.value, dup.users);
      toast.success(`Successfully resolved clash for ${dup.value}`, { id: toastId });
      setDuplicateList(prev => prev.filter(d => !(d.type === dup.type && d.value === dup.value)));
      fetchStaff(true);
      fetchAllActiveStaff();
    } catch (err: any) {
      console.error("Resolve clash error:", err);
      toast.error(`Failed to resolve clash: ${err.message || 'Unknown error'}`, { id: toastId });
    }
  };

  const handleOpenModal = (member: any = null) => {
    setSelectedAssignClass('');
    setSelectedAssignBatch('');
    setSelectedAssignSubject('');
    if (member) {
      setIsEditing(true);
      const mId = member.uid || member.id;
      setEditingId(mId);

      // Find matching batch where this teacher is assigned as class teacher
      const matchingBatch = getAssignedClassTeacherBatch(member, batches);
      const resolvedBatchId = matchingBatch?.id || member.classTeacherBatchId || member.batchId || '';
      const resolvedClassId = matchingBatch?.classId || member.classTeacherClassId || member.classId || '';

      setFormData({
        name: member.name || getStaffDisplayName(member) || '',
        email: member.email || '',
        phone: member.phone || '',
        status: (member.status as "active" | "inactive") || 'active',
        role: member.role || 'teacher',
        staffType: member.staffType || 'teaching',
        department: member.department || '',
        dateOfJoining: member.dateOfJoining || new Date().toISOString().split('T')[0],
        gender: member.gender || 'male',
        bloodGroup: member.bloodGroup || '',
        aadharNumber: member.aadharNumber || '',
        bankDetails: {
          accountNumber: member.bankDetails?.accountNumber || '',
          bankName: member.bankDetails?.bankName || '',
          ifscCode: member.bankDetails?.ifscCode || ''
        },
        address: member.address || '',
        emergencyContact: member.emergencyContact || '',
        subjects: member.subjects || [],
        classIds: member.classIds || (resolvedClassId ? [resolvedClassId] : []),
        batchIds: member.batchIds || (resolvedBatchId ? [resolvedBatchId] : []),
        subjectAssignments: member.subjectAssignments || [],
        staffBatches: member.staffBatches || [],
        classId: resolvedClassId,
        batchId: resolvedBatchId,
        classTeacherBatchId: resolvedBatchId,
        classTeacherClassId: resolvedClassId,
        qualification: member.qualification || '',
        experience: member.experience || '',
        salary: member.salary || '',
        epf: member.epf || '',
        busNumber: member.busNumber || '',
        route: member.route || '',
        photoURL: member.photoURL || ''
      });
    } else {
      setIsEditing(false);
      setEditingId(null);
      setFormData(initialStaffState);
    }
    setShowAddModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditStaff && !canCreateStaff) return;

    if (!formData.name || !formData.email || !formData.phone) {
      toast.error("Name, Email and Phone are required");
      return;
    }

    try {
      setLoading(true);
      const formattedName = formatNameInput(formData.name || '');
      const staffData = {
        ...formData,
        name: formattedName,
        role: formData.role.toLowerCase().trim(),
        email: formData.email.trim().toLowerCase(),
        updatedAt: new Date().toISOString()
      };

      if (isEditing && editingId) {
        const oldMember = staff.find(s => (s.uid === editingId || s.id === editingId)) || 
                          allActiveStaffList.find(s => (s.uid === editingId || s.id === editingId));
        
        // Collect all possible ID variants and email for this staff member
        const myIds = new Set<string>([editingId]);
        if (oldMember?.uid) myIds.add(oldMember.uid);
        if (oldMember?.id) myIds.add(oldMember.id);
        if ((oldMember as any)?.staffId) myIds.add(String((oldMember as any).staffId));
        const oldEmail = (oldMember?.email || '').toLowerCase().trim();

        // Check for duplicates (excluding all identifier variants of current member)
        const duplicateChecks = [
          { label: 'Email', field: 'email', value: staffData.email }
        ];
        
        if (staffData.phone) duplicateChecks.push({ label: 'Phone', field: 'phone', value: staffData.phone });
        if (staffData.aadharNumber) duplicateChecks.push({ label: 'Aadhar Number', field: 'aadharNumber', value: staffData.aadharNumber });

        for (const check of duplicateChecks) {
          if (!check.value) continue;
          
          const targetCollection = check.field === 'email' ? 'users' : 'staff';
          const results = await dbService.list(targetCollection, [
            where(check.field, '==', check.value),
            limit(10)
          ], true); // true = bypass cache
          
          const others = results.filter((r: any) => {
            const rId = r.uid || r.id || r.staffId;
            const rEmail = (r.email || '').toLowerCase().trim();
            if (myIds.has(rId)) return false;
            if (oldEmail && rEmail === oldEmail) return false;
            return true;
          });

          if (others.length > 0) {
            const otherNames = others.map((o: any) => o.name || 'Unknown').join(', ');
            toast.error(`Duplicate Found: The ${check.label} ${check.value} is already used by: ${otherNames}.`);
            setLoading(false);
            return;
          }
        }

        // Prepare persistent identity & profile payloads
        const identityData = {
          uid: editingId,
          email: staffData.email,
          name: staffData.name,
          displayName: staffData.name,
          fullName: staffData.name,
          phone: staffData.phone,
          role: staffData.role,
          status: staffData.status,
          photoURL: staffData.photoURL || '',
          subjects: staffData.subjects || [],
          classIds: staffData.classIds || [],
          batchIds: staffData.batchIds || [],
          subjectAssignments: staffData.subjectAssignments || [],
          classId: staffData.classId || '',
          batchId: staffData.batchId || '',
          department: staffData.department || '',
          designation: (formData as any).designation || (staffData.role === 'teacher' || staffData.role === 'teacher_class' ? 'Class Teacher' : 'Staff'),
          isEditedByUser: true,
          isUserModified: true,
          updatedAt: new Date().toISOString()
        };

        const selectedClass = classes.find(c => c.id === staffData.classId);
        const selectedBatch = batches.find(b => b.id === staffData.batchId);

        const profileData = {
          ...staffData,
          uid: editingId,
          id: editingId,
          name: staffData.name,
          displayName: staffData.name,
          fullName: staffData.name,
          class: selectedClass?.name || '',
          batch: selectedBatch?.name || '',
          className: selectedClass?.name || '',
          batchName: selectedBatch?.name || '',
          designation: (formData as any).designation || '',
          firstName: staffData.name?.split(' ')[0] || '',
          lastName: staffData.name?.split(' ').slice(1).join(' ') || '',
          isEditedByUser: true,
          isUserModified: true,
          updatedAt: new Date().toISOString()
        };

        const allIdList = Array.from(myIds).filter(Boolean);

        // 1. Permanently update/set in both users & staff collections for all matched IDs
        const coreSavePromises: Promise<any>[] = [];
        for (const docId of allIdList) {
          coreSavePromises.push(dbService.set('users', docId, identityData).catch(() => {}));
          coreSavePromises.push(dbService.update('users', docId, identityData).catch(() => {}));
          coreSavePromises.push(dbService.set('staff', docId, profileData).catch(() => {}));
          coreSavePromises.push(dbService.update('staff', docId, profileData).catch(() => {}));
        }

        // 2. Also search if any other docs match oldEmail or newEmail in users & staff and sync them
        const emailsToSync = Array.from(new Set([oldEmail, staffData.email.toLowerCase()])).filter(Boolean);
        for (const em of emailsToSync) {
          const [uDocs, sDocs] = await Promise.all([
            dbService.list('users', [where('email', '==', em)], true).catch(() => []),
            dbService.list('staff', [where('email', '==', em)], true).catch(() => [])
          ]);
          for (const u of (uDocs || [])) {
            const uId = u?.uid || u?.id;
            if (uId && !allIdList.includes(uId)) {
              coreSavePromises.push(dbService.delete('users', uId).catch(() => {}));
            }
          }
          for (const s of (sDocs || [])) {
            const sId = s?.uid || s?.id;
            if (sId && !allIdList.includes(sId)) {
              coreSavePromises.push(dbService.delete('staff', sId).catch(() => {}));
            }
          }
        }

        // 3. Sync to batches (Class Teacher allocation and teacher info)
        const batchSyncPromises: Promise<any>[] = [];
        const batchesList = await dbService.list('batches', [], true).catch(() => []);
        
        for (const b of (batchesList || [])) {
          if (!b) continue;
          const isNewlyAssigned = staffData.batchId && b.id === staffData.batchId;
          const wasPreviouslyAssigned = allIdList.includes(b.classTeacherId) || 
                                        (b.classTeacherEmail && emailsToSync.includes(b.classTeacherEmail.toLowerCase())) || 
                                        (oldMember?.batchId && b.id === oldMember.batchId);

          if (isNewlyAssigned) {
            batchSyncPromises.push(
              dbService.update('batches', b.id, {
                classTeacher: staffData.name,
                classTeacherName: staffData.name,
                classTeacherEmail: staffData.email || '',
                classTeacherId: editingId,
                isEditedByUser: true,
                isUserModified: true,
                updatedAt: new Date().toISOString()
              }).catch(() => {})
            );
          } else if (wasPreviouslyAssigned) {
            // Unassign from old batch
            batchSyncPromises.push(
              dbService.update('batches', b.id, {
                classTeacher: 'Not Assigned',
                classTeacherName: 'Not Assigned',
                classTeacherEmail: '',
                classTeacherId: '',
                isEditedByUser: true,
                isUserModified: true,
                updatedAt: new Date().toISOString()
              }).catch(() => {})
            );
          }
        }
        await Promise.all(batchSyncPromises);

        setBatches(prev => prev.map(b => {
          if (staffData.batchId && b.id === staffData.batchId) {
            return { ...b, classTeacher: staffData.name, classTeacherName: staffData.name, classTeacherEmail: staffData.email || '', classTeacherId: editingId };
          }
          if ((allIdList.includes(b.classTeacherId) || (b.classTeacherEmail && emailsToSync.includes(b.classTeacherEmail.toLowerCase())) || (oldMember?.batchId && b.id === oldMember.batchId)) && b.id !== staffData.batchId) {
            return { ...b, classTeacher: 'Not Assigned', classTeacherName: 'Not Assigned', classTeacherEmail: '', classTeacherId: '' };
          }
          return b;
        }));

        // 4. Sync to classes (Academics subject teacher assignment)
        const classSyncPromises: Promise<any>[] = [];
        const classesList = await dbService.list('classes', [], true).catch(() => []);
        for (const cls of (classesList || [])) {
          if (cls && Array.isArray(cls.subjects)) {
            let classChanged = false;
            const updatedSubjects = cls.subjects.map((sub: any) => {
              if (sub && (allIdList.includes(sub.teacherId) || (sub.teacherEmail && emailsToSync.includes(sub.teacherEmail.toLowerCase())))) {
                classChanged = true;
                return {
                  ...sub,
                  teacherName: staffData.name,
                  teacherEmail: staffData.email
                };
              }
              return sub;
            });
            if (classChanged) {
              classSyncPromises.push(dbService.update('classes', cls.id, { subjects: updatedSubjects }).catch(() => {}));
            }
          }
        }

        // 5. Sync to timetables
        const timetableSyncPromises: Promise<any>[] = [];
        const timetablesList = await dbService.list('timetables', [], true).catch(() => []);
        for (const tt of (timetablesList || [])) {
          if (tt && Array.isArray(tt.periods)) {
            let ttChanged = false;
            const updatedPeriods = tt.periods.map((p: any) => {
              if (p && (allIdList.includes(p.teacherId) || (p.teacherEmail && emailsToSync.includes(p.teacherEmail.toLowerCase())))) {
                ttChanged = true;
                return { ...p, teacherName: staffData.name };
              }
              return p;
            });
            if (ttChanged) {
              timetableSyncPromises.push(dbService.update('timetables', tt.id, { periods: updatedPeriods }).catch(() => {}));
            }
          }
        }

        // 6. Sync to leaves (Applicant name)
        const leaveSyncPromises: Promise<any>[] = [];
        const leavesList = await dbService.list('leaves', [], true).catch(() => []);
        for (const l of (leavesList || [])) {
          if (l && (allIdList.includes(l.applicantId) || (l.applicantEmail && emailsToSync.includes(l.applicantEmail.toLowerCase())))) {
            leaveSyncPromises.push(dbService.update('leaves', l.id, { applicantName: staffData.name, applicantEmail: staffData.email }).catch(() => {}));
          }
        }

        // 7. Sync to payslips
        const payslipSyncPromises: Promise<any>[] = [];
        const payslipsList = await dbService.list('payslips', [], true).catch(() => []);
        for (const p of (payslipsList || [])) {
          if (p && (allIdList.includes(p.staffId) || (p.email && emailsToSync.includes(p.email.toLowerCase())))) {
            payslipSyncPromises.push(dbService.update('payslips', p.id, { 
              staffName: staffData.name, 
              email: staffData.email,
              designation: (formData as any).designation || profileData.designation,
              department: staffData.department || profileData.department
            }).catch(() => {}));
          }
        }

        // Execute all updates
        await Promise.all([
          ...coreSavePromises,
          ...batchSyncPromises,
          ...classSyncPromises,
          ...timetableSyncPromises,
          ...leaveSyncPromises,
          ...payslipSyncPromises
        ]);

        // Instantly update local state to reflect the edited teacher's details including subjects/assignments!
        const updatedStaffObj = { ...profileData, ...identityData, name: staffData.name, displayName: staffData.name };
        setStaff(prev => prev.map(s => (allIdList.includes(s.uid) || allIdList.includes(s.id)) ? { ...s, ...updatedStaffObj } : s));
        setAllActiveStaffList(prev => prev.map(s => (allIdList.includes(s.uid) || allIdList.includes(s.id)) ? { ...s, ...updatedStaffObj } : s));
        globalCachedStaff = null;
        
        toast.success("Staff member updated and synced across all modules successfully");
      } else {
        // Check for duplicates
        const duplicateChecks = [
          { label: 'Email', field: 'email', value: staffData.email }
        ];
        
        if (staffData.phone) duplicateChecks.push({ label: 'Phone', field: 'phone', value: staffData.phone });
        if (staffData.aadharNumber) duplicateChecks.push({ label: 'Aadhar Number', field: 'aadharNumber', value: staffData.aadharNumber });

        for (const check of duplicateChecks) {
          if (!check.value) continue;
          const [userResults, staffResults] = await Promise.all([
            dbService.list('users', [where(check.field, '==', check.value), limit(1)], true).catch(() => []),
            dbService.list('staff', [where(check.field, '==', check.value), limit(1)], true).catch(() => [])
          ]);
          const results = [...(userResults || []), ...(staffResults || [])];
          if (results.length > 0) {
            const existing = results[0] as any;
            const roleName = existing.role || 'user';
            const existingName = existing.name || existing.displayName || 'Unknown';
            const statusInfo = existing.status === 'inactive' ? ' (INACTIVE)' : '';
            toast.error(`Duplicate Found: The ${check.label} "${check.value}" is already registered by ${existingName} (${roleName}${statusInfo}). Duplicate entries are not allowed.`);
            setLoading(false);
            return;
          }
        }

        // Check for duplicates during creation using deterministic ID (name_phone or name_random)
        const sanitizedName = staffData.name.toLowerCase().trim().replace(/\s+/g, '_');
        const phoneVal = (formData.phone || "").trim().replace(/\D/g, '');
        const suffix = phoneVal || Math.floor(1000 + Math.random() * 9000);
        const customId = `${sanitizedName}_${suffix}`;
        
        // Check if a document with this customId already exists in either collection
        const [existingUser, existingStaff] = await Promise.all([
          dbService.get('users', customId),
          dbService.get('staff', customId)
        ]);

        if (existingUser || existingStaff) {
          toast.error("This record already exists in the system!");
          setLoading(false);
          return;
        }

        const identityData = {
          uid: customId,
          email: staffData.email,
          name: staffData.name,
          role: staffData.role,
          status: 'active',
          photoURL: staffData.photoURL,
          subjects: staffData.subjects || [],
          classIds: staffData.classIds || [],
          batchIds: staffData.batchIds || [],
          subjectAssignments: staffData.subjectAssignments || [],
          classId: staffData.classId || '',
          batchId: staffData.batchId || '',
          createdAt: new Date().toISOString()
        };

        const selectedClass = classes.find(c => c.id === staffData.classId);
        const selectedBatch = batches.find(b => b.id === staffData.batchId);

        const profileData = {
          ...staffData,
          uid: customId,
          class: selectedClass?.name || '',
          batch: selectedBatch?.name || '',
          firstName: staffData.name?.split(' ')[0] || '',
          lastName: staffData.name?.split(' ').slice(1).join(' ') || '',
          createdAt: new Date().toISOString(),
          status: 'active' as 'active' | 'inactive'
        };

        await Promise.all([
          dbService.set('users', customId, identityData),
          dbService.set('staff', customId, profileData)
        ]);
        
        // Sync to batches if batchId is set
        if (staffData.batchId) {
          await dbService.update('batches', staffData.batchId, { 
            classTeacherId: customId,
            classTeacher: staffData.name,
            classTeacherName: staffData.name,
            classTeacherEmail: staffData.email || '',
            isEditedByUser: true,
            isUserModified: true,
            updatedAt: new Date().toISOString()
          });
        }

        toast.success("Staff member added successfully");
        setStaff(prev => [profileData, ...prev]);
      }
      setShowAddModal(false);
      fetchStaff(true);
      fetchAllActiveStaff();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("Failed to save staff data");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!canDeleteStaff) return;
    
    const staffMemberToDelete = staff.find(s => s.uid === id || s.id === id) || allActiveStaffList.find(s => s.uid === id || s.id === id);
    const staffMemberName = staffMemberToDelete?.name || staffMemberToDelete?.displayName || 'this staff member';
    const staffEmail = staffMemberToDelete?.email || '';

    setConfirmConfig({
      title: 'Permanently Delete Staff Member',
      message: `Are you sure you want to permanently delete "${staffMemberName}" (${staffEmail || id})? This will completely purge their user credentials, staff profile, attendance records, leaves, payroll history, payslips, and all class/batch/subject allocations from the database. This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        const toastId = toast.loading(`Permanently deleting "${staffMemberName}" and all related records...`);
        try {
          // Collect all possible identifiers for this staff member
          const staffIds = new Set<string>([id]);
          if (staffMemberToDelete?.uid) staffIds.add(staffMemberToDelete.uid);
          if (staffMemberToDelete?.id) staffIds.add(staffMemberToDelete.id);
          if ((staffMemberToDelete as any)?.staffId) staffIds.add(String((staffMemberToDelete as any).staffId));
          const allIdList = Array.from(staffIds).filter(Boolean);
          const emailLower = staffEmail ? staffEmail.toLowerCase().trim() : '';

          // 1. Unset class teacher assignment across all batches
          const batchesList = await dbService.list('batches', [], true);
          const affectedBatches = (batchesList || []).filter(b => 
            b && (allIdList.includes(b.classTeacherId) || (emailLower && b.classTeacherEmail && b.classTeacherEmail.toLowerCase() === emailLower))
          );
          const batchCleanupPromises = affectedBatches.map(b => 
            dbService.update('batches', b.id, { 
              classTeacherId: '', 
              classTeacher: 'Not Assigned',
              classTeacherName: 'Not Assigned',
              classTeacherEmail: '' 
            }).catch(() => {})
          );

          // 2. Unassign from classes subjects (Academics subjects array)
          const classesList = await dbService.list('classes', [], true).catch(() => []);
          const classCleanupPromises: Promise<any>[] = [];
          for (const cls of classesList || []) {
            if (cls && Array.isArray(cls.subjects)) {
              let changed = false;
              const updatedSubjects = cls.subjects.map((sub: any) => {
                if (sub && (allIdList.includes(sub.teacherId) || (emailLower && sub.teacherEmail && sub.teacherEmail.toLowerCase() === emailLower))) {
                  changed = true;
                  return { ...sub, teacherId: '', teacherName: 'Unassigned', teacherEmail: '' };
                }
                return sub;
              });
              if (changed) {
                classCleanupPromises.push(dbService.update('classes', cls.id, { subjects: updatedSubjects }).catch(() => {}));
              }
            }
          }

          // 3. Clean Timetable slots assigned to this teacher
          const timetablesList = await dbService.list('timetables', [], true).catch(() => []);
          const timetableCleanupPromises: Promise<any>[] = [];
          for (const tt of timetablesList || []) {
            if (tt && Array.isArray(tt.periods)) {
              let ttChanged = false;
              const updatedPeriods = tt.periods.map((p: any) => {
                if (p && (allIdList.includes(p.teacherId) || (emailLower && p.teacherEmail && p.teacherEmail.toLowerCase() === emailLower))) {
                  ttChanged = true;
                  return { ...p, teacherId: '', teacherName: '' };
                }
                return p;
              });
              if (ttChanged) {
                timetableCleanupPromises.push(dbService.update('timetables', tt.id, { periods: updatedPeriods }).catch(() => {}));
              }
            }
          }

          // 4. Delete staff attendance records
          const staffAttendanceList = await dbService.list('staff_attendance', [], true).catch(() => []);
          const matchedAttendanceIds = (staffAttendanceList || [])
            .filter(a => a && (allIdList.includes(a.staffId) || allIdList.includes(a.uid) || allIdList.includes(a.userId) || (emailLower && a.email && a.email.toLowerCase() === emailLower)))
            .map(a => a.id)
            .filter(Boolean);
          if (matchedAttendanceIds.length > 0) {
            await dbService.deleteBatch('staff_attendance', matchedAttendanceIds).catch(() => {});
          }

          // 5. Delete staff leave requests
          const leavesList = await dbService.list('leaves', [], true).catch(() => []);
          const matchedLeaveIds = (leavesList || [])
            .filter(l => l && (allIdList.includes(l.applicantId) || allIdList.includes(l.staffId) || allIdList.includes(l.userId) || (emailLower && l.applicantEmail && l.applicantEmail.toLowerCase() === emailLower)))
            .map(l => l.id)
            .filter(Boolean);
          if (matchedLeaveIds.length > 0) {
            await dbService.deleteBatch('leaves', matchedLeaveIds).catch(() => {});
          }

          // 6. Delete payslips and salary history
          const payslipsList = await dbService.list('payslips', [], true).catch(() => []);
          const matchedPayslipIds = (payslipsList || [])
            .filter(p => p && (allIdList.includes(p.staffId) || allIdList.includes(p.uid) || (emailLower && p.email && p.email.toLowerCase() === emailLower)))
            .map(p => p.id)
            .filter(Boolean);
          if (matchedPayslipIds.length > 0) {
            await dbService.deleteBatch('payslips', matchedPayslipIds).catch(() => {});
          }

          // 7. Delete advances / salary deductions linked to staff in expenditures
          const expendituresList = await dbService.list('expenditures', [], true).catch(() => []);
          const matchedExpenditureIds = (expendituresList || [])
            .filter(e => e && (allIdList.includes(e.staffId) || allIdList.includes(e.recipientId)))
            .map(e => e.id)
            .filter(Boolean);
          if (matchedExpenditureIds.length > 0) {
            await dbService.deleteBatch('expenditures', matchedExpenditureIds).catch(() => {});
          }

          // 8. Delete primary user identity and staff profile documents across all IDs
          const coreDeletePromises: Promise<any>[] = [];
          for (const sId of allIdList) {
            coreDeletePromises.push(dbService.delete('users', sId).catch(() => {}));
            coreDeletePromises.push(dbService.delete('staff', sId).catch(() => {}));
          }

          // Wait for all cascade operations
          await Promise.all([
            ...coreDeletePromises,
            ...batchCleanupPromises,
            ...classCleanupPromises,
            ...timetableCleanupPromises
          ]);

          globalCachedStaff = null;
          setStaff(prev => prev.filter(s => !allIdList.includes(s.uid) && !allIdList.includes(s.id)));
          setAllActiveStaffList(prev => prev.filter(s => !allIdList.includes(s.uid) && !allIdList.includes(s.id)));
          toast.success(`Staff member "${staffMemberName}" and all related information deleted permanently from the database.`, { id: toastId });
        } catch (error) {
          console.error("Delete error:", error);
          toast.error("Failed to completely delete staff member from database", { id: toastId });
        }
        setShowConfirmModal(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rawData = results.data as any[];
          const headers = results.meta.fields || [];
          
          if (rawData.length === 0) {
            toast.error("The CSV file is empty.");
            return;
          }

          // Template Validation
          const requiredHeaders = ['Name', 'Email', 'Role'];
          const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
          
          if (missingHeaders.length > 0) {
            const suggestion = `Please ensure your CSV has these headers: ${requiredHeaders.join(', ')}. You can download the correct template using the 'Template' button.`;
            setImportAnalysis(`❌ INVALID TEMPLATE\n\nMissing headers: ${missingHeaders.join(', ')}\n\n${suggestion}`);
            setImportPreviewData([]);
            setShowImportPreview(true);
            toast.error("Invalid CSV format detected.");
            return;
          }

          toast.info("Analyzing staff data...");
          
          const processedData = rawData.map(row => {
            if (!row.Name) return null;
            
            // Prepare data with better mapping
            const cleanName = (row.Name || '').trim();
            const sanitizedName = cleanName.toLowerCase().trim().replace(/\s+/g, '_');
            const cleanPhone = (row.Phone || row.Contact || row.phone || '').trim().replace(/\D/g, '');
            const suffix = cleanPhone || `temp_${Math.floor(10000 + Math.random() * 90000)}`;
            const customId = `${sanitizedName}_${suffix}`;
            
            const cleanEmail = (row.Email || `${cleanName.replace(/\s+/g, '').toLowerCase()}@school.com`).trim().toLowerCase();
            
            // Normalize role: lowercase, trim, and replace spaces with underscores
            const rawRoleStr = (row.Role || 'teacher').toLowerCase().trim();
            const normalizedRole = rawRoleStr.replace(/\s+/g, '_');
            
            const nonTeachingRoles = ['accountant', 'clerk', 'staff', 'driver', 'attendant', 'helper', 'aya', 'front_office', 'receptionist'];
            const staffType = row.StaffType || (nonTeachingRoles.includes(normalizedRole) ? 'non-teaching' : 'teaching');

            // Map assignments if present in CSV
            const classIds = row.Classes ? row.Classes.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
            const batchIds = row.Batches ? row.Batches.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

            // Contact number is MANDATORY
            const isValid = Boolean(cleanName && cleanEmail && normalizedRole && cleanPhone && cleanPhone.length >= 10);
            const reason = !cleanPhone ? "Contact number is mandatory" : (cleanPhone.length < 10 ? "Invalid contact number (min 10 digits)" : "");
            
            return {
              uid: customId,
              name: cleanName,
              email: cleanEmail,
              phone: cleanPhone,
              role: normalizedRole,
              staffType: staffType,
              department: row.Department || '',
              subjects: row.Subjects ? row.Subjects.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
              qualification: row.Qualification || '',
              experience: row.Experience || '',
              classIds,
              batchIds,
              classId: classIds[0] || '',
              batchId: batchIds[0] || '',
              firstName: cleanName.split(' ')[0] || '',
              lastName: cleanName.split(' ').slice(1).join(' ') || '',
              createdAt: new Date().toISOString(),
              status: 'active',
              isValid,
              error: reason
            };
          }).filter(Boolean);

          setImportPreviewData(processedData);
          setShowImportPreview(true);
          
          // Get AI Analysis
          let analysis = await analyzeImportData(processedData, 'staff');
          
          const missingPhonesCount = (processedData as any[]).filter(p => !p.isValid && !p.phone).length;
          if (missingPhonesCount > 0) {
            analysis += `\n\n⚠️ CRITICAL: ${missingPhonesCount} staff members are missing contact numbers and cannot be imported. Contact number is mandatory for all staff members.`;
          }
          setImportAnalysis(analysis);
          
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      });
    }
  };

  const confirmImport = async () => {
    const validStaff = importPreviewData.filter(s => s.isValid);
    if (validStaff.length === 0) {
      toast.error("No valid records found to import. Contact numbers are mandatory.");
      return;
    }
    
    setIsImporting(true);
    toast.info(`Importing ${validStaff.length} staff members (Skipping ${importPreviewData.length - validStaff.length} invalid)...`);
    
    try {
      // 1. Fetch existing users to match existing IDs and prevent duplicates
      const [allExistingUsers, allExistingStaff] = await Promise.all([
        dbService.list('users', [], true).catch(() => []),
        dbService.list('staff', [], true).catch(() => [])
      ]);

      const emailToExisting = new Map<string, any>();
      const phoneToExisting = new Map<string, any>();

      [...(allExistingUsers || []), ...(allExistingStaff || [])].forEach((u: any) => {
        if (!u) return;
        const em = (u.email || '').trim().toLowerCase();
        if (em && !emailToExisting.has(em)) emailToExisting.set(em, u);
        const ph = (u.phone || '').replace(/\D/g, '');
        if (ph.length >= 10 && !phoneToExisting.has(ph)) phoneToExisting.set(ph, u);
      });

      // Deduplicate validStaff within the CSV list itself by email
      const seenEmailsInCsv = new Set<string>();
      const deduplicatedValidStaff = validStaff.filter(t => {
        const em = (t.email || '').trim().toLowerCase();
        if (em && seenEmailsInCsv.has(em)) return false;
        if (em) seenEmailsInCsv.add(em);
        return true;
      });

      const batchSize = 100;
      for (let i = 0; i < deduplicatedValidStaff.length; i += batchSize) {
        const chunk = deduplicatedValidStaff.slice(i, i + batchSize);
        
        const userBatch = chunk.map(t => {
          const em = (t.email || '').trim().toLowerCase();
          const ph = (t.phone || '').replace(/\D/g, '');
          const existing = (em ? emailToExisting.get(em) : null) || (ph ? phoneToExisting.get(ph) : null);
          const targetUid = existing?.uid || existing?.id || t.uid;

          return {
            id: targetUid,
            data: {
              ...(existing || {}),
              uid: targetUid,
              email: em,
              name: t.name,
              role: (t.role || 'staff').toLowerCase().trim().replace(/\s+/g, '_'),
              status: 'active',
              subjects: t.subjects || existing?.subjects || [],
              classIds: t.classIds || existing?.classIds || [],
              batchIds: t.batchIds || existing?.batchIds || [],
              subjectAssignments: t.subjectAssignments || existing?.subjectAssignments || [],
              classId: t.classId || existing?.classId || '',
              batchId: t.batchId || existing?.batchId || '',
              phone: t.phone || existing?.phone || '',
              qualification: t.qualification || existing?.qualification || '',
              experience: t.experience || existing?.experience || '',
              department: t.department || existing?.department || '',
              isEditedByUser: true,
              isUserModified: true,
              createdAt: existing?.createdAt || t.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          };
        });

        const staffBatch = chunk.map(t => {
          const em = (t.email || '').trim().toLowerCase();
          const ph = (t.phone || '').replace(/\D/g, '');
          const existing = (em ? emailToExisting.get(em) : null) || (ph ? phoneToExisting.get(ph) : null);
          const targetUid = existing?.uid || existing?.id || t.uid;

          return {
            id: targetUid,
            data: {
              ...(existing || {}),
              ...t,
              id: targetUid,
              uid: targetUid,
              role: (t.role || 'staff').toLowerCase().trim().replace(/\s+/g, '_'),
              status: 'active',
              isEditedByUser: true,
              isUserModified: true,
              updatedAt: new Date().toISOString()
            }
          };
        });

        await Promise.all([
          dbService.setBatch('users', userBatch),
          dbService.setBatch('staff', staffBatch)
        ]);
      }
      
      // Auto deduplicate to ensure any remnant phantom docs are cleanly merged
      await deduplicateAndPurgeClashes().catch(() => {});
      
      toast.success(`Successfully imported ${importPreviewData.length} staff members`);
      setShowImportPreview(false);
      setImportPreviewData([]);
      setImportAnalysis('');
      
      // Delay fetch slightly to allow consistency
      setTimeout(() => {
        fetchStaff(true);
        // Force state update to refresh UI
        setActiveTab('active');
      }, 1000);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import staff. Please check for duplicate emails or invalid data.");
    } finally {
      setIsImporting(false);
    }
  };

  const generateLessonPlan = async (teacher: any) => {
    toast.info(`Generating AI lesson plan recommendations for ${teacher.name}...`);
    const plan = await getLessonPlan("General", "Academic Excellence", "All Grades");
    toast.success("Lesson plan generated and sent to teacher's portal.");
  };

  const handleToggleStatus = (member: UserProfile) => {
    if (!canEditStaff) return;
    setSelectedStaffForStatus(member);
    if (member.status === 'inactive') {
      setConfirmConfig({
        title: 'Re-activate Staff Member',
        message: `Are you sure you want to re-activate ${member.name}? They will be moved back to the Active staff list.`,
        variant: 'primary',
        onConfirm: async () => {
          try {
            await Promise.all([
              dbService.update('users', member.uid, { status: 'active' }),
              dbService.update('staff', member.uid, { 
                status: 'active',
                dropDate: null 
              })
            ]);
            toast.success("Staff member re-activated successfully");
          } catch (error) {
            toast.error("Failed to re-activate staff member");
          }
          setShowConfirmModal(false);
          setSelectedStaffForStatus(null);
        }
      });
      setShowConfirmModal(true);
    } else {
      setShowDropModal(true);
    }
  };

  const confirmDrop = async () => {
    if (!selectedStaffForStatus || !canEditStaff) return;
    try {
      await Promise.all([
        dbService.update('users', selectedStaffForStatus.uid, { status: 'inactive' }),
        dbService.update('staff', selectedStaffForStatus.uid, {
          status: 'inactive',
          dropDate: dropDate
        })
      ]);
      toast.success(`${selectedStaffForStatus.name} has been moved to Inactive staff.`);
      setShowDropModal(false);
      setSelectedStaffForStatus(null);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const rawSortedStaff = (staff || []).filter(Boolean)
    .filter(t => {
      if (!t) return false;
      const rawRole = (t.role || 'staff').toLowerCase().trim();
      // Extremely aggressive exclusion list
      const excludedRoles = ['student', 'parent', 'student ', ' parent', 'student_role'];
      if (excludedRoles.includes(rawRole) || rawRole.includes('student') || rawRole.includes('parent')) return false;

      const displayName = getStaffDisplayName(t);
      const searchLower = searchTerm.toLowerCase().trim();
      const nameLower = (String(t.name || "")).toLowerCase();
      const matchesSearch = !searchLower ||
        displayName.toLowerCase().includes(searchLower) || 
        nameLower.includes(searchLower) ||
        (String(t.firstName || "")).toLowerCase().includes(searchLower) ||
        (String(t.lastName || "")).toLowerCase().includes(searchLower) ||
        (String((t as any).alias || "")).toLowerCase().includes(searchLower) ||
        (String((t as any).nickname || "")).toLowerCase().includes(searchLower) ||
        (String(t.email || "")).toLowerCase().includes(searchLower) ||
        (String(t.phone || "")).toLowerCase().includes(searchLower) ||
        (String(t.department || "")).toLowerCase().includes(searchLower) ||
        (String((t as any).batch || (t as any).className || "")).toLowerCase().includes(searchLower) ||
        (Array.isArray(t.subjects) && t.subjects.some(s => String(s).toLowerCase().includes(searchLower))) ||
        (searchLower.includes('balaiah') && (nameLower.includes('bala') || nameLower.includes('guravaiah'))) ||
        (t.role && (String(t.role || "")).toLowerCase().includes(searchLower));
      
      const currentStatus = t.status || 'active';
      return matchesSearch && currentStatus === activeTab;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      let aValue = (a as any)[sortConfig.key] || '';
      let bValue = (b as any)[sortConfig.key] || '';
      if (sortConfig.key === 'name') {
        aValue = getStaffDisplayName(a);
        bValue = getStaffDisplayName(b);
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const sortedStaff: any[] = [];
  const seenStaffIds = new Set<string>();
  rawSortedStaff.forEach(s => {
    const sId = s.uid || s.id;
    if (sId && !seenStaffIds.has(sId)) {
      seenStaffIds.add(sId);
      sortedStaff.push(s);
    }
  });

  const normalizedRole = (formData.role || '').toLowerCase().trim();
  const isAcademic = ['teacher', 'principal', 'vice_principal', 'coordinator'].includes(normalizedRole) || 
                     normalizedRole.includes('teacher') || 
                     formData.staffType === 'teaching';
  const isTransport = ['driver', 'helper', 'attendant'].includes(normalizedRole) || 
                      normalizedRole.includes('driver');

  const [isPurgingDemoData, setIsPurgingDemoData] = useState(false);

  const handlePurgeAllDemoData = () => {
    setConfirmConfig({
      title: 'Permanently Delete All Demo Data',
      message: 'Are you sure you want to permanently delete all default demo data (mock staff, demo students, demo classes, demo batches) and clean placeholder demo names from the Firestore database?\n\nThis will completely purge all mock entries across the entire database.',
      variant: 'danger',
      onConfirm: async () => {
        setIsPurgingDemoData(true);
        setShowConfirmModal(false);
        const toastId = toast.loading("Permanently purging demo data from database...", { id: "purge-demo" });
        try {
          const stats = await purgeAllDemoDataFromDatabase();
          globalCachedStaff = null;
          await fetchStaff(true);
          toast.success(
            `All demo data successfully deleted! Removed ${stats.staffDeletedCount} demo staff, cleaned ${stats.staffCleanedCount} staff profiles, deleted ${stats.studentsDeletedCount} demo students, and cleaned ${stats.batchesCleanedCount} batches.`,
            { id: "purge-demo", duration: 6000 }
          );
        } catch (err: any) {
          console.error("Purge demo data failed:", err);
          toast.error(`Purge failed: ${err.message || "Unknown error"}`, { id: "purge-demo" });
        } finally {
          setIsPurgingDemoData(false);
        }
      }
    });
    setShowConfirmModal(true);
  };

  if (!hasPermission('staff_view')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <UserSquare2 className="w-12 h-12 text-primary mb-4" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have permission to view staff. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <IndexNoticeBanner error={indexError} />
      {showDuplicateScan && (duplicateList.length > 0 || repairableList.length > 0) && (
        <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-3xl animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-amber-500/5 max-h-[600px] overflow-y-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sticky top-0 bg-amber-50 py-2 z-10 border-b border-amber-200/60 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
              <div>
                <h3 className="text-lg font-black text-amber-900 uppercase tracking-widest">System Scan Results</h3>
                <p className="text-xs text-amber-700 font-medium">
                  {duplicateList.length > 0 ? `${duplicateList.length} duplicate clashes detected` : 'No clashes'} 
                  {repairableList.length > 0 ? ` • ${repairableList.length} hidden records needing activation` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {duplicateList.length > 0 && (
                <button
                  onClick={handleAutoMergeAllDuplicates}
                  disabled={isScanning}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {isScanning ? 'Merging...' : 'Auto-Merge & Clean All Duplicates'}
                </button>
              )}
              <button onClick={() => setShowDuplicateScan(false)} className="p-2 hover:bg-amber-100 rounded-full text-amber-700">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {repairableList.length > 0 && (
            <div className="mb-8 p-4 bg-primary/5 rounded-2xl border border-primary/20">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="font-black text-primary uppercase text-xs tracking-widest">Invisible Records Found ({repairableList.length})</h4>
                  <p className="text-[10px] text-neutral-500 uppercase mt-1">These records were imported without a status and are hidden from the staff list.</p>
                </div>
                <button 
                  onClick={repairStaffRecords}
                  disabled={isScanning}
                  className="bg-primary text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-sidebar transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {isScanning ? 'Repairing...' : 'Repair & Activate All'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {repairableList.slice(0, 12).map((s, i) => (
                  <div key={i} className="bg-white p-2 rounded-lg border border-primary/10 text-[10px] flex flex-col">
                    <span className="font-bold text-neutral-900 truncate">{getStaffDisplayName(s)}</span>
                    <span className="text-neutral-400 truncate">{s.email}</span>
                  </div>
                ))}
                {repairableList.length > 12 && (
                  <div className="bg-white/50 p-2 rounded-lg border border-dashed border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                    +{repairableList.length - 12} more...
                  </div>
                )}
              </div>
            </div>
          )}

          {duplicateList.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {duplicateList.map((dup, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{dup.type} Clash</span>
                      <button
                        onClick={() => handleResolveSingleClash(dup)}
                        className="text-[9px] font-black uppercase px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-all shadow-xs"
                      >
                        Auto-Resolve
                      </button>
                    </div>
                    <div className="text-sm font-bold text-neutral-900 mb-3 truncate" title={dup.value}>{dup.value}</div>
                    <div className="space-y-2">
                      {dup.users.map((u: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                          <div className="flex flex-col">
                            <span className="font-bold text-neutral-700 font-mono text-[11px]">{u.name}</span>
                            <span className={`text-[8px] uppercase font-black px-1.5 py-0.5 rounded w-fit mt-1 ${
                              (u.role || '').toLowerCase() === 'student' ? 'bg-amber-100 text-amber-700' : 
                              (u.role || '').toLowerCase() === 'parent' ? 'bg-blue-100 text-blue-700' :
                              'bg-neutral-100 text-neutral-400'
                            }`}>
                              {u.role || 'No Role'} {(u.role || '').toLowerCase() === 'student' ? '• STUDENT' : (u.role || '').toLowerCase() === 'parent' ? '• PARENT' : ''}
                            </span>
                          </div>
                          <button onClick={() => handleOpenModal(u)} className="text-primary hover:underline font-black text-[10px] uppercase">Review</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-sidebar">Staff Management</h1>
          <p className="text-sm text-neutral-500">Manage teaching and non-teaching faculty.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-wrap gap-2">
          {hasPermission('staff_view') && (
            <>
              {canCreateStaff && (
                <button 
                  onClick={downloadTemplate}
                  className="bg-white text-neutral-700 border border-neutral-200 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-neutral-50 transition-all font-semibold text-sm"
                  title="Download CSV template for import"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <span>Template</span>
                </button>
              )}
              <button 
                onClick={exportToCSV}
                className="bg-white text-neutral-700 border border-neutral-200 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-neutral-50 transition-all font-semibold text-sm"
              >
                <Download className="w-4 h-4 text-green-600" />
                <span>Export CSV</span>
              </button>
              <button 
                onClick={async () => {
                  globalCachedStaff = null;
                  await toast.promise(fetchStaff(true), {
                    loading: 'Fetching fresh staff records...',
                    success: 'Loaded fresh staff successfully!',
                    error: 'Failed to refresh records.'
                  });
                }}
                className="bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-semibold text-sm"
              >
                <RefreshCw className="w-4 h-4 text-neutral-500" />
                <span>Refresh Data</span>
              </button>

              <button 
                onClick={exportToA4PDF}
                className="bg-white text-neutral-700 border border-neutral-200 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-neutral-50 transition-all font-semibold text-sm"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>Export A4 PDF</span>
              </button>
              {(isAdmin || isFullAdmin || canDeleteStaff || canManageStaff) && (
                <>
                  <button 
                    onClick={scanForDuplicates}
                    disabled={isScanning}
                    className="bg-white text-neutral-700 border border-neutral-200 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-neutral-50 transition-all font-semibold text-sm disabled:opacity-50"
                  >
                    {isScanning ? <RefreshCw className="w-4 h-4 animate-spin text-blue-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    <span>{isScanning ? 'Scanning...' : 'Scan Duplicates'}</span>
                  </button>
                  <button
                    onClick={handlePurgeAllDemoData}
                    disabled={isPurgingDemoData}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-semibold text-sm disabled:opacity-50 cursor-pointer"
                    title="Permanently delete all default demo records and clear demo names from the database"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>{isPurgingDemoData ? 'Purging Demo...' : 'Delete Demo Data'}</span>
                  </button>
                </>
              )}
              {canCreateStaff && (
                <>
                  <label className="bg-white text-neutral-700 border border-neutral-200 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-neutral-50 transition-all font-semibold text-sm cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Import</span>
                    <input type="file" accept=".csv" className="hidden" onChange={handleImport} ref={fileInputRef} />
                  </label>
                  <button 
                    onClick={() => handleOpenModal()}
                    className="bg-primary text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-sidebar transition-all shadow-lg shadow-primary/20 font-bold text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Staff</span>
                  </button>
                </>
              )}
            </>
          )}
          </div>
        </div>
      </header>

      <div className="flex gap-4 items-center bg-white p-1 rounded-2xl border border-neutral-200 shadow-sm w-fit">
        <button 
          onClick={() => setActiveTab('active')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'active' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-neutral-500 hover:bg-neutral-50'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Active Staff</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === 'active' ? 'bg-white/20' : 'bg-neutral-100'}`}>
            {staff.filter(s => (s.status || 'active') === 'active').length}
          </span>
        </button>
        <button 
          onClick={() => setActiveTab('inactive')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'inactive' ? 'bg-sidebar text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-50'
          }`}
        >
          <X className="w-4 h-4" />
          <span>Inactive Staff</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === 'inactive' ? 'bg-white/20' : 'bg-neutral-100'}`}>
            {staff.filter(s => s.status === 'inactive').length}
          </span>
        </button>
        {!isVicePrincipalRole && (
          <button 
            onClick={() => setActiveTab('staff_batches')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'staff_batches' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Staff Batches (Shifts)</span>
          </button>
        )}
      </div>

      {activeTab === 'staff_batches' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm relative overflow-hidden text-left">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full -mr-16 -mt-16 blur-2xl flex" />
            <div className="relative z-10 text-left">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-indigo-600 rounded-xl">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-2xl font-black text-sidebar italic uppercase tracking-tight">Staff Shifts</h2>
              </div>
              <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">Assign staff to working hours and rotations</p>
            </div>
            <div className="flex items-center gap-2 relative z-10 flex-wrap">
              <button 
                onClick={exportStaffShiftsToCSV}
                className="px-6 py-3 bg-white text-neutral-700 border border-neutral-200 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-neutral-50 transition-all active:scale-95 flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>Export Assignments CSV</span>
              </button>
              {selectedBatchId && (
                <button 
                  onClick={() => setSelectedBatchId(null)}
                  className="px-6 py-3 bg-neutral-100 text-neutral-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-neutral-200 transition-all active:scale-95 flex items-center gap-2"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 rotate-90" />
                  View All Shifts
                </button>
              )}
              {canManageStaff && (
                <button 
                  onClick={() => { setEditingBatch(null); setShowBatchModal(true); }}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Shift
                </button>
              )}
            </div>
          </div>

          {!selectedBatchId ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {staffBatches.length > 0 ? staffBatches.map((batch: any) => {
                const assignedStaff = staff.filter(s => s.staffBatches?.includes(batch.id));
                return (
                  <div 
                    key={batch.id} 
                    onClick={() => setSelectedBatchId(batch.id)}
                    className="group bg-white p-8 rounded-[2.5rem] border-2 border-neutral-100 hover:border-indigo-600 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-100/50 relative overflow-hidden text-left"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-full -mr-12 -mt-12 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    <div className="flex items-center justify-between mb-8">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <Clock className="w-7 h-7" />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {canManageStaff && (
                           <button 
                             onClick={(e) => { e.stopPropagation(); setEditingBatch(batch); setShowBatchModal(true); }}
                             className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-400 hover:text-sidebar transition-colors"
                           >
                             <Edit className="w-4 h-4" />
                           </button>
                         )}
                      </div>
                    </div>

                    <div className="mb-8">
                      <h3 className="text-xl font-black text-sidebar mb-2">{batch.name}</h3>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-neutral-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">{batch.startTime || '09:00'} - {batch.endTime || '17:00'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-indigo-600">
                          <Users className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold uppercase tracking-wider">{assignedStaff.length} Members</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-neutral-50">
                      <div className="flex -space-x-2 overflow-hidden">
                        {assignedStaff.slice(0, 4).map((s, i) => (
                          <div key={s.uid} style={{ zIndex: 4-i }} className="w-8 h-8 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                            {(s.name || 'S').charAt(0)}
                          </div>
                        ))}
                        {assignedStaff.length > 4 && (
                          <div className="w-8 h-8 rounded-full border-2 border-white bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-500">
                            +{assignedStaff.length - 4}
                          </div>
                        )}
                        {assignedStaff.length === 0 && (
                          <div className="w-8 h-8 rounded-full border-2 border-dashed border-neutral-200 bg-neutral-50 flex items-center justify-center">
                            <UserPlus className="w-3.5 h-3.5 text-neutral-300" />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        Manage <ChevronDown className="w-3 h-3 -rotate-90" />
                      </span>
                    </div>
                  </div>
                );
              }) : (
                <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-neutral-100">
                  <Clock className="w-16 h-16 text-neutral-100 mx-auto mb-4" />
                  <p className="text-xl font-bold text-neutral-300">No shifts created yet</p>
                  <button onClick={() => { setEditingBatch(null); setShowBatchModal(true); }} className="mt-4 px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100">Create First Shift</button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in zoom-in-95 duration-300">
              {/* Left Column: Shift Details & Assigned Staff */}
              <div className="lg:col-span-12 xl:col-span-4 space-y-6">
                <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-200 text-left relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-8">
                      <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Clock className="w-7 h-7 text-white" />
                      </div>
                      <button 
                        onClick={() => setSelectedBatchId(null)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {(() => {
                      const activeBatch = staffBatches.find(b => b.id === selectedBatchId);
                      return activeBatch && (
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-3xl font-black italic uppercase tracking-tighter mb-2">{activeBatch.name}</h3>
                            <p className="text-white/60 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                               <Calendar className="w-4 h-4" />
                               {activeBatch.startTime} - {activeBatch.endTime}
                            </p>
                          </div>
                          <div className="pt-6 border-t border-white/10">
                            <p className="text-xs font-black uppercase tracking-widest opacity-40 mb-4">Current Assignments ({allActiveStaffList.filter(s => s.staffBatches?.includes(selectedBatchId)).length})</p>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                              {allActiveStaffList.filter(s => s.staffBatches?.includes(selectedBatchId)).map(s => (
                                <div key={s.uid} className="flex items-center gap-3 p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/5 group transition-all hover:bg-white/20">
                                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-sm">
                                    {(getStaffDisplayName(s) || 'S').charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{getStaffDisplayName(s)}</p>
                                    <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest truncate">{s.role}</p>
                                  </div>
                                  {canManageStaff && (
                                    <button 
                                      onClick={() => handleRemoveFromBatch(s.uid, selectedBatchId)}
                                      className="w-8 h-8 flex items-center justify-center bg-transparent hover:bg-red-500 rounded-lg transition-all text-white/40 hover:text-white"
                                      title="Remove from shift"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {allActiveStaffList.filter(s => s.staffBatches?.includes(selectedBatchId)).length === 0 && (
                                <div className="py-12 text-center text-white/30 text-xs font-bold uppercase tracking-widest border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center gap-2">
                                  <Users className="w-8 h-8 opacity-20" />
                                  <span>No staff assigned</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Middle Section: New Dedicated Search & Dropdown Selection */}
              <div className="lg:col-span-12 xl:col-span-8 bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm min-h-[600px] text-left relative">
                <div className="max-w-2xl mx-auto">
                  <div className="text-center mb-12">
                     <p className="text-indigo-600 text-[10px] font-black uppercase tracking-[0.3em] mb-3">Assignment Workspace</p>
                     <h3 className="text-4xl font-black text-sidebar italic uppercase tracking-tighter">Assign New Members</h3>
                     <p className="text-neutral-400 text-sm font-bold max-w-md mx-auto mt-2">Find and select staff members to instantly add them to this rotation shift.</p>
                  </div>

                  <div className="relative group mb-12">
                     <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-300 group-focus-within:text-indigo-600 transition-colors" />
                     <input 
                       type="text" 
                       placeholder="Click to browse active staff..." 
                       className="w-full pl-16 pr-16 py-6 bg-neutral-50 border-2 border-neutral-100 rounded-[2rem] outline-none text-lg font-bold text-sidebar placeholder:text-neutral-300 focus:border-indigo-600 focus:bg-white focus:ring-8 focus:ring-indigo-600/5 transition-all shadow-inner"
                       value={shiftSearchTerm}
                       onFocus={() => setIsShiftDropdownOpen(true)}
                       onChange={(e) => {
                         setShiftSearchTerm(e.target.value);
                         setIsShiftDropdownOpen(true);
                       }}
                     />
                     <button 
                       onClick={() => setIsShiftDropdownOpen(!isShiftDropdownOpen)}
                       className="absolute right-6 top-1/2 -translate-y-1/2 p-2 hover:bg-neutral-100 rounded-xl transition-colors text-neutral-400"
                     >
                        <ChevronDown className={`w-6 h-6 transition-transform duration-300 ${isShiftDropdownOpen ? 'rotate-180' : ''}`} />
                     </button>

                     {isShiftDropdownOpen && (
                       <>
                         <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsShiftDropdownOpen(false)} />
                         <div className="absolute top-full left-0 w-full mt-4 bg-white border border-neutral-100 rounded-[2rem] shadow-2xl z-50 overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-300">
                           <div className="p-4 bg-neutral-50 border-b border-neutral-100 flex justify-between items-center px-6">
                              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Active Staff Directory</p>
                              <button onClick={() => setIsShiftDropdownOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                                 <X className="w-4 h-4 text-neutral-500" />
                              </button>
                           </div>
                           <div className="max-h-[400px] overflow-y-auto p-4 space-y-2 custom-scrollbar">
                             {allActiveStaffList.filter(s => 
                                s.status === 'active' && 
                                ((s.name || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()) || 
                                 (s.role || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()))
                             ).length > 0 ? (
                               allActiveStaffList.filter(s => 
                                  s.status === 'active' && 
                                  ((s.name || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()) || 
                                   (s.role || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()))
                               ).map(s => {
                                 const isAssignedToThisShift = s.staffBatches?.includes(selectedBatchId!);
                                 const isAssignedToAnyShift = (s.staffBatches || []).length > 0;
                                 
                                 return (
                                   <button 
                                     key={s.uid}
                                     disabled={isAssignedToThisShift}
                                     onClick={() => {
                                       handleAssignToBatch(s.uid, selectedBatchId!);
                                       setShiftSearchTerm('');
                                       setIsShiftDropdownOpen(false);
                                     }}
                                     className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left group ${
                                        isAssignedToThisShift 
                                          ? 'opacity-30 grayscale-[0.8] cursor-not-allowed bg-neutral-50/50' 
                                          : isAssignedToAnyShift
                                            ? 'opacity-50 hover:bg-indigo-600 hover:text-white group' 
                                            : 'hover:bg-indigo-600 hover:text-white'
                                     }`}
                                   >
                                     <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${isAssignedToThisShift ? 'bg-neutral-200 text-neutral-400' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {(s.name || 'S').charAt(0)}
                                     </div>
                                     <div className="flex-1 min-w-0">
                                        <p className="font-bold truncate">{s.name}</p>
                                        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isAssignedToThisShift ? 'text-neutral-400' : 'text-neutral-500 group-hover:text-white/70'}`}>{s.role}</p>
                                     </div>
                                     {isAssignedToThisShift ? (
                                       <div className="flex items-center gap-2 px-3 py-1 bg-neutral-100 rounded-lg">
                                         <Check className="w-3 h-3 text-emerald-500" />
                                         <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Added</span>
                                       </div>
                                     ) : isAssignedToAnyShift ? (
                                        <div className="flex items-center gap-2 px-3 py-1 bg-orange-50 rounded-lg group-hover:bg-white/20">
                                          <Clock className="w-3 h-3 text-orange-500 group-hover:text-white" />
                                          <span className="text-[10px] font-black text-orange-500 group-hover:text-white uppercase tracking-widest">In Other Shift</span>
                                        </div>
                                     ) : (
                                       <PlusCircle className="w-6 h-6 text-neutral-200 opacity-20 group-hover:opacity-100 group-hover:text-white transition-all transform group-hover:scale-110" />
                                     )}
                                   </button>
                                 );
                               })
                             ) : (
                               <div className="py-20 text-center flex flex-col items-center gap-4">
                                  <Search className="w-12 h-12 text-neutral-100" />
                                  <p className="text-neutral-300 font-bold">No matching staff found</p>
                               </div>
                             )}
                           </div>
                         </div>
                       </>
                     )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <p className="col-span-full text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <Sparkles className="w-3 h-3" /> Quick Assignments
                    </p>
                    {allActiveStaffList
                      .filter(s => s.status === 'active' && !s.staffBatches?.includes(selectedBatchId!))
                      .slice(0, 4)
                      .map(s => (
                        <button
                          key={s.uid}
                          onClick={() => handleAssignToBatch(s.uid, selectedBatchId!)}
                          className="flex items-center gap-4 p-5 bg-neutral-50 border-2 border-neutral-50 hover:border-indigo-600 hover:bg-white rounded-3xl transition-all text-left group"
                        >
                          <div className="w-12 h-12 rounded-xl bg-white border border-neutral-100 flex items-center justify-center font-black text-indigo-600 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                             {(s.name || 'S').charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                             <p className="font-bold text-sidebar truncate">{s.name}</p>
                             <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest truncate">{s.role}</p>
                          </div>
                          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-neutral-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                             <Plus className="w-4 h-4" />
                          </div>
                        </button>
                      ))
                    }
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input 
                type="text" 
                placeholder="Search staff by name, email or role..." 
                className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none text-sm focus:border-primary transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {profile?.role?.includes('super') && searchTerm.includes('@') && !loading && (
              <button 
                onClick={async () => {
                  setLoading(true);
                  try {
                    const emailTrimmed = searchTerm.toLowerCase().trim();
                    const results = await dbService.list('users', [where('email', '==', emailTrimmed)]);
                    if (results.length > 0) {
                      const user = results[0] as any;
                      const roleName = user.role || 'unknown';
                      toast.info(`SYSTEM RECORD: ${user.name} (${roleName})`, { 
                        description: `This email is already in the global users table. UID: ${user.uid}`
                      });
                    } else {
                      toast.success("No system record found with this email.");
                    }
                  } catch (e) {
                    toast.error("Global search failed");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-3 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <Info className="w-3" />
                Check System
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b-2 border-indigo-500 text-[13px] font-extrabold uppercase text-white shadow-md">
                <th 
                  className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all rounded-tl-2xl text-indigo-300 hover:text-indigo-200"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    Staff Member
                    {sortConfig?.key === 'name' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-indigo-300" /> : <ChevronDown className="w-3.5 h-3.5 text-indigo-300" />
                    ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none group hover:bg-white/10 transition-all text-emerald-300 hover:text-emerald-200"
                  onClick={() => handleSort('role')}
                >
                  <div className="flex items-center gap-2">
                    Role
                    {sortConfig?.key === 'role' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-300" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-300" />
                    ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none group hover:bg-white/15 transition-all text-sky-300 hover:text-sky-200"
                  onClick={() => handleSort('type')}
                >
                  <div className="flex items-center gap-2">
                    Type
                    {sortConfig?.key === 'type' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-sky-300" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-300" />
                    ) : <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 opacity-30 group-hover:opacity-100 transition-opacity" />}
                  </div>
                </th>
                <th className="px-6 py-4 text-amber-300 select-none">
                  {activeTab === 'active' ? 'Contact' : 'Left On'}
                </th>
                <th className="px-6 py-4 text-right rounded-tr-2xl text-purple-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
      {loading ? (
        <tr><td colSpan={5} className="px-6 py-12 text-center text-neutral-400">Loading staff...</td></tr>
      ) : sortedStaff.length === 0 ? (
        <tr>
          <td colSpan={10} className="px-6 py-24 text-center">
            <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center text-neutral-300">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-sidebar">No staff members found</h3>
                <p className="text-xs text-neutral-400 mt-1 mb-4">If staff were recently imported but are not visible, they may need one-click activation. This happens if imported data is missing status fields.</p>
                <button 
                  onClick={async () => {
                    await scanForDuplicates();
                    if (repairableList.length > 0) {
                      await repairStaffRecords();
                    } else {
                      toast.info("No records found that need repair. Try refreshing.");
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-black transition-all text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 mb-4"
                >
                  <Sparkles className="w-4 h-4" />
                  Repair & Activate Records
                </button>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-[200px]">
                <button 
                  onClick={scanForDuplicates}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all text-sm shadow-lg shadow-indigo-500/20"
                >
                  <Search className="w-4 h-4" />
                  Scan System
                </button>
                <button 
                  onClick={() => window.location.reload()}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl font-bold transition-all text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : (
                <>
                  {sortedStaff.map((member) => {
                    const assignedClassTeacherBatch = getAssignedClassTeacherBatch(member, batches);
                    const ctClassName = assignedClassTeacherBatch ? (classes.find(c => c.id === assignedClassTeacherBatch.classId)?.name || assignedClassTeacherBatch.className || 'Class') : '';

                    return (
                    <React.Fragment key={member.uid || member.id}>
                      <tr className="hover:bg-neutral-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden relative group/avatar cursor-pointer hover:border-primary/50 transition-colors border border-neutral-100" title="Click to upload profile photo">
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="absolute inset-0 opacity-0 cursor-pointer z-10 text-xs font-sans" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleDirectStaffPhotoUpload(member, file);
                                  }
                                }}
                              />
                              {normalizeUrl(member.photoURL || member.photoUrl || member.facePhotoURL || member.facePhotoUrl) ? (
                                <img 
                                  src={normalizeUrl(member.photoURL || member.photoUrl || member.facePhotoURL || member.facePhotoUrl)} 
                                  alt={getStaffDisplayName(member)} 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer" 
                                />
                              ) : (
                                member.email ? (
                                  <img src={getGravatarUrl(member.email)} alt={getStaffDisplayName(member)} className="w-full h-full object-cover" />
                                ) : (
                                  (String(getStaffDisplayName(member) || "")).charAt(0) || <User className="w-5 h-5" />
                                )
                              )}
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                <Upload className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p 
                                  className="font-black text-sidebar text-[15px] uppercase tracking-tight hover:underline cursor-pointer hover:text-primary transition-all flex items-center gap-1"
                                  onClick={() => {
                                    const sId = member.uid || member.id;
                                    setExpandedStaffIds(prev => ({ ...prev, [sId]: !prev[sId] }));
                                  }}
                                >
                                  <span>{getStaffDisplayName(member)}</span>
                                  {expandedStaffIds[member.uid || member.id] ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                                  )}
                                </p>
                                {member.uid.startsWith('staff_') ? (
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-black uppercase rounded border border-amber-100" title="Has not logged in yet">
                                    Pending
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-green-50 text-green-600 text-[10px] font-black uppercase rounded border border-green-100" title="Account Linked & Active">
                                    Linked
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-neutral-400 uppercase font-bold tracking-wider">{member.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-[15px] font-medium text-neutral-700 uppercase">{member.role}</p>
                              {assignedClassTeacherBatch && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase rounded tracking-wider shadow-xs" title={`Class Teacher of ${ctClassName} (${assignedClassTeacherBatch.name})`}>
                                  <GraduationCap className="w-3 h-3 text-amber-600 shrink-0" />
                                  Class Teacher ({ctClassName} - {assignedClassTeacherBatch.name})
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-neutral-400">{member.department || 'No Department'}</p>
                          </div>
                          {member.subjectAssignments && member.subjectAssignments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5 max-w-xs">
                              {member.subjectAssignments.map((asg: any, i: number) => {
                                const cls = classes.find(c => c.id === asg.classId);
                                const bat = batches.find(b => b.id === asg.batchId);
                                const sub = subjectsList.find(s => s.id === asg.subjectId || s.name === asg.subjectId);
                                return (
                                  <span key={i} className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-neutral-150 hover:bg-neutral-200 rounded text-[9px] font-bold text-neutral-600 transition-colors" title={`${cls?.name || asg.classId} (${bat?.name || asg.batchId}) - ${sub?.name || asg.subjectId}`}>
                                    {cls?.name || asg.classId} {bat ? `(${bat.name})` : ''} • {sub?.name || asg.subjectId}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-md text-[12px] font-bold uppercase ${
                            member.staffType === 'teaching' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {member.staffType || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {activeTab === 'active' ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                                <Mail className="w-3.5 h-3.5" />
                                {hasPermission('staff_view_all') || member.uid === profile?.uid ? (
                                  member.email
                                ) : (
                                  <span className="opacity-50 text-[11px] font-bold">Email Hidden</span>
                                )}
                              </div>
                              {member.phone && (
                                <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                                  <Phone className="w-3.5 h-3.5" />
                                  {hasPermission('staff_view_all') || member.uid === profile?.uid ? (
                                    member.phone
                                  ) : (
                                    <span className="opacity-50 text-[11px] font-bold">Phone Hidden</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-[15px] font-bold text-red-600">
                              <Calendar className="w-4 h-4" />
                              {member.dropDate || 'N/A'}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {member.role === 'teacher' && (
                              <button 
                                onClick={() => generateLessonPlan(member)}
                                className="p-2 hover:bg-primary/10 rounded-xl text-primary transition-all"
                                title="Generate AI Lesson Plan"
                              >
                                <Sparkles className="w-4 h-4" />
                              </button>
                            )}
                            {canEditStaff && (
                              <button 
                                onClick={() => {
                                  setSelectedStaffForUser(member);
                                  setShowUserModal(true);
                                }}
                                className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-400 transition-all"
                                title="Manage Login Access"
                              >
                                <ShieldCheck className="w-4 h-4" />
                              </button>
                            )}
                            {canEditStaff && (
                              <button 
                                onClick={() => handleOpenModal(member)}
                                className="p-2 hover:bg-white hover:shadow-md rounded-xl text-neutral-400 hover:text-primary transition-all"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            {canDeleteStaff && (
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDelete(member.uid);
                                }}
                                className="p-2 hover:bg-rose-50 rounded-xl text-neutral-400 hover:text-rose-600 transition-all relative z-10"
                                title="Delete Member"
                              >
                                <Trash2 className="w-4 h-4 pointer-events-none" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedStaffIds[member.uid || member.id] && (
                        <tr className="bg-neutral-50/40">
                          <td colSpan={5} className="px-6 py-6 border-b border-neutral-100">
                            <div className="bg-white p-6 rounded-2xl border border-neutral-150 shadow-sm max-w-4xl space-y-6">
                              <div className="flex justify-between items-start border-b border-neutral-100 pb-4">
                               <div>
                                 <h4 className="text-sm font-black uppercase text-sidebar tracking-wider font-sans">Complete Staff Profile Sheet</h4>
                                 <p className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5 tracking-wider font-mono font-sans">ID: {member.uid || member.id}</p>
                               </div>
                               <div className="flex items-center gap-3">
                                 {canEditStaff && (
                                   <button
                                     onClick={() => handleOpenModal(member)}
                                     className="px-3 py-1.5 bg-primary text-white hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md shadow-primary/25 cursor-pointer font-sans"
                                   >
                                     <Edit className="w-3.5 h-3.5" /> Edit Profile
                                   </button>
                                 )}
                                 <button 
                                   onClick={() => {
                                     const sId = member.uid || member.id;
                                     setExpandedStaffIds(prev => ({ ...prev, [sId]: false }));
                                   }}
                                   className="text-neutral-400 hover:text-neutral-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1 font-sans cursor-pointer"
                                 >
                                   <X className="w-4 h-4" /> Close Details
                                 </button>
                               </div>
                             </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
                                {/* Section 1: Employment Profile */}
                                <div className="space-y-3 bg-neutral-50/55 p-4 rounded-xl border border-neutral-100">
                                  <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest font-mono">Employment & Role</h5>
                                  <div className="space-y-2 text-xs text-neutral-600">
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Designation / Role:</span>
                                      <span className="font-black text-neutral-700 uppercase">{member.role || '---'}</span>
                                    </div>
                                    {assignedClassTeacherBatch && (
                                      <div className="flex justify-between border-b border-amber-100 bg-amber-50/60 p-1.5 rounded-lg">
                                        <span className="font-bold text-amber-800 flex items-center gap-1 text-[11px]">
                                          <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
                                          Class Teacher:
                                        </span>
                                        <span className="font-black text-amber-900 uppercase text-[11px]">
                                          {ctClassName} ({assignedClassTeacherBatch.name})
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Department:</span>
                                      <span className="font-black text-neutral-700 uppercase">{member.department || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Staff Type:</span>
                                      <span className="font-black text-neutral-700 uppercase">{member.staffType || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Date of Joining:</span>
                                      <span className="font-black text-neutral-700 font-mono">{member.dateOfJoining || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Qualification:</span>
                                      <span className="font-black text-neutral-700 uppercase">{member.qualification || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Experience:</span>
                                      <span className="font-black text-neutral-700">{member.experience ? `${member.experience} Years` : '---'}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Section 2: Personal Profile */}
                                <div className="space-y-3 bg-neutral-50/55 p-4 rounded-xl border border-neutral-100">
                                  <h5 className="text-[10px] font-black text-sky-600 uppercase tracking-widest font-mono">Personal Details</h5>
                                  <div className="space-y-2 text-xs text-neutral-600">
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Gender:</span>
                                      <span className="font-black text-neutral-700 uppercase">{member.gender || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Blood Group:</span>
                                      <span className="font-black text-neutral-700 uppercase font-mono">{member.bloodGroup || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Aadhar Number:</span>
                                      <span className="font-black text-neutral-700 font-mono">{member.aadharNumber || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Address:</span>
                                      <span className="font-black text-neutral-700 uppercase truncate max-w-[120px]" title={member.address}>{member.address || '---'}</span>
                                    </div>
                                    <div className="flex justify-between pb-1">
                                      <span className="font-bold text-neutral-400">Emergency Phone:</span>
                                      <span className="font-black text-neutral-700 font-mono">{member.emergencyContact || '---'}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Section 3: Finance & Payroll */}
                                <div className="space-y-3 bg-neutral-50/55 p-4 rounded-xl border border-neutral-100">
                                  <h5 className="text-[10px] font-black text-purple-600 uppercase tracking-widest font-mono">Finance & Payroll</h5>
                                  <div className="space-y-2 text-xs text-neutral-600">
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Basic Salary:</span>
                                      <span className="font-black text-neutral-700 font-mono">₹{member.salary || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">EPF Number:</span>
                                      <span className="font-black text-neutral-700 font-mono">{member.epf || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Bank Name:</span>
                                      <span className="font-black text-neutral-700 uppercase truncate max-w-[120px]">{member.bankDetails?.bankName || '---'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-100/50 pb-1">
                                      <span className="font-bold text-neutral-400">Account No:</span>
                                      <span className="font-black text-neutral-700 font-mono">{member.bankDetails?.accountNumber || '---'}</span>
                                    </div>
                                    <div className="flex justify-between pb-1">
                                      <span className="font-bold text-neutral-400">IFSC Code:</span>
                                      <span className="font-black text-neutral-700 font-mono uppercase">{member.bankDetails?.ifscCode || '---'}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Logistics & Class assignments if any */}
                              {member.subjectAssignments && member.subjectAssignments.length > 0 && (
                                <div className="pt-2 border-t border-neutral-100 font-sans">
                                  <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest font-mono mb-2">Subject & Class Assignments</h5>
                                  <div className="flex flex-wrap gap-2">
                                    {member.subjectAssignments.map((asg: any, i: number) => {
                                      const cls = classes.find(c => c.id === asg.classId);
                                      const bat = batches.find(b => b.id === asg.batchId);
                                      const sub = subjectsList.find(s => s.id === asg.subjectId || s.name === asg.subjectId);
                                      return (
                                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-700 uppercase" title={`${cls?.name || asg.classId} (${bat?.name || asg.batchId}) - ${sub?.name || asg.subjectId}`}>
                                          {cls?.name || asg.classId} {bat ? `(${bat.name})` : ''} • {sub?.name || asg.subjectId}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                  {hasMore && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center">
                        <button 
                          onClick={loadMore}
                          disabled={loading}
                          className="px-8 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                        >
                          {loading ? 'Loading...' : 'Load More Staff'}
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Staff Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-indigo-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <Calendar className="w-6 h-6" />
                {editingBatch ? 'Edit Staff Shift' : 'Create Staff Shift'}
              </h2>
              <button onClick={() => setShowBatchModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveBatch} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Shift Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Morning Shift"
                  value={editingBatch?.name || ''}
                  onChange={e => setEditingBatch({...editingBatch, name: e.target.value})}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-600 transition-colors text-sm font-bold text-sidebar"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Start Time</label>
                  <input 
                    type="time" 
                    required
                    value={editingBatch?.startTime || ''}
                    onChange={e => setEditingBatch({...editingBatch, startTime: e.target.value})}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-600 transition-colors text-sm font-bold text-sidebar"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">End Time</label>
                  <input 
                    type="time" 
                    required
                    value={editingBatch?.endTime || ''}
                    onChange={e => setEditingBatch({...editingBatch, endTime: e.target.value})}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-600 transition-colors text-sm font-bold text-sidebar"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-neutral-100">
                <button 
                  type="submit" 
                  className="flex-1 bg-indigo-600 text-white rounded-xl py-3 font-bold hover:bg-indigo-700 transition-colors"
                >
                  Save Shift
                </button>
                {editingBatch?.id && canManageStaff && (
                  <button 
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if(window.confirm('Delete this shift?')) {
                        await dbService.delete('staff_batches', editingBatch.id);
                        setShowBatchModal(false);
                      }
                    }}
                    className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors relative z-10"
                  >
                    <Trash2 className="w-5 h-5 pointer-events-none" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-auto overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-primary text-white flex-shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-3">
                {isEditing ? <Edit className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                {isEditing ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider border-b border-primary/10 pb-2">Photo & Basic Information</h3>
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Photo Upload Section */}
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative group">
                      <div className="w-32 h-32 rounded-2xl bg-neutral-50 border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden">
                        {normalizeUrl(formData.photoURL) ? (
                          <img 
                            src={normalizeUrl(formData.photoURL)} 
                            alt="Staff" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          formData.email ? (
                            <img src={getGravatarUrl(formData.email)} alt="Staff" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-12 h-12 text-neutral-300" />
                          )
                        )}
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center gap-2">
                        <label className="p-2 cursor-pointer hover:bg-white/20 rounded-full transition-colors" title="Upload Photo">
                          <Upload className="text-white w-5 h-5" />
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                try {
                                  toast.loading("Processing and uploading photo...", { id: 'staff-photo' });
                                  const processedFile = await uploadService.processProfileImage(file);
                                  const url = await uploadService.uploadFile(processedFile);
                                  setFormData(prev => ({ ...prev, photoURL: url }));
                                  toast.success("Photo uploaded! Formatted perfectly to 3:4 for ID cards.", { id: 'staff-photo' });
                                } catch (error: any) {
                                  toast.error(error.message || "Upload failed", { id: 'staff-photo' });
                                }
                              }
                            }} 
                          />
                        </label>
                        <button 
                          type="button"
                          onClick={() => setShowCameraModal(true)}
                          className="p-2 cursor-pointer hover:bg-white/20 rounded-full transition-colors" 
                          title="Take Photo"
                        >
                          <Camera className="text-white w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Profile Photo</p>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-700">Full Name *</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: formatNameInput(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-700">Email Address *</label>
                      <input
                        type="email"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="used for Google login"
                      />
                      <p className="text-[9px] text-neutral-400 font-medium">Used for secure Google Login linking</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Phone Number</label>
                    <input
                      type="tel"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Gender</label>
                    <select
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Blood Group</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      placeholder="e.g. O+"
                      value={formData.bloodGroup}
                      onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Aadhar Number</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.aadharNumber}
                      onChange={(e) => setFormData({ ...formData, aadharNumber: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider border-b border-primary/10 pb-2">Professional Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Staff Type</label>
                    <select
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.staffType}
                      onChange={(e) => setFormData({ ...formData, staffType: e.target.value as any })}
                    >
                      <option value="teaching">Teaching</option>
                      <option value="non-teaching">Non-Teaching</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">System Role</label>
                    <select
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm font-bold"
                      value={formData.role}
                      onChange={(e) => {
                        const role = e.target.value as any;
                        const nonTeachingRoles = ['accountant', 'clerk', 'staff', 'driver', 'attendant', 'helper', 'aya', 'front_office', 'receptionist'];
                        const isNonTeaching = nonTeachingRoles.includes(role) || (customRoles || []).find(r => r && r.id === role)?.category === 'Staff';
                        setFormData({ 
                          ...formData, 
                          role, 
                          staffType: isNonTeaching ? 'non-teaching' : 'teaching'
                        });
                      }}
                    >
                      <optgroup label="Default Roles">
                        <option value="teacher">Teacher</option>
                        <option value="play_school_incharge">Play School Incharge</option>
                        <option value="principal">Principal</option>
                        <option value="vice_principal">Vice Principal</option>
                        <option value="accountant">Accountant</option>
                        <option value="clerk">Clerk</option>
                        <option value="staff">Staff Member</option>
                        <option value="admin">Admin</option>
                        <option value="driver">Driver</option>
                        <option value="attendant">Attendant</option>
                        <option value="helper">Helper</option>
                        <option value="front_office">Front Office</option>
                        <option value="receptionist">Receptionist</option>
                        <option value="aya">Aya</option>
                        <option value="coordinator">Coordinator</option>
                      </optgroup>
                      {customRoles.length > 0 && (
                        <optgroup label="Custom Roles">
                          {customRoles.map(role => (
                            <option key={role.id} value={role.id}>{role.label || role.name || role.id}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Department</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      placeholder="e.g. Science"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Date of Joining</label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.dateOfJoining}
                      onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Qualification</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.qualification}
                      onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Base Salary (₹)</label>
                    <input
                      type="number"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.salary}
                      onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">EPF Deduction (₹)</label>
                    <input
                      type="number"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      placeholder="e.g. 1800"
                      value={formData.epf}
                      onChange={(e) => setFormData({ ...formData, epf: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Account Status</label>
                    <select
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.status || 'active'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Assigned Shift (Staff Batch)</label>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !formData.staffBatches.includes(val)) {
                            setFormData({ ...formData, staffBatches: [...formData.staffBatches, val] });
                          }
                          e.target.value = '';
                        }}
                      >
                        <option value="">Select a shift to assign</option>
                        {staffBatches.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.startTime} - {b.endTime})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.staffBatches.map(sb => {
                        const batch = (staffBatches || []).find(b => b && b.id === sb);
                        return (
                          <span key={sb} className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-full flex items-center gap-1 shadow-sm">
                            {batch?.name || sb}
                            <X 
                              className="w-3 h-3 cursor-pointer hover:text-red-500" 
                              onClick={() => setFormData({ ...formData, staffBatches: formData.staffBatches.filter(b => b !== sb) })}
                            />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {isAcademic && (
                  <div className="space-y-6 p-6 bg-primary/5 rounded-2xl border border-primary/10">
                    {/* Primary Class Teacher Allocation */}
                    <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
                          <GraduationCap className="w-4 h-4 text-primary" />
                          Class Teacher Responsibility (Academic Batch)
                        </label>
                        {formData.batchId && (
                          <span className="text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                            <Check className="w-3 h-3 text-amber-600" /> Assigned
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 font-medium leading-relaxed">
                        Designate this teacher as the official Class Teacher for a batch. This automatically syncs with the Academics module.
                      </p>
                      <select
                        className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 outline-none focus:border-primary text-xs font-bold bg-neutral-50"
                        value={formData.batchId || ''}
                        onChange={(e) => {
                          const bId = e.target.value;
                          const selectedBatch = batches.find(b => b.id === bId);
                          setFormData({
                            ...formData,
                            batchId: bId,
                            classId: selectedBatch?.classId || '',
                            classTeacherBatchId: bId,
                            classTeacherClassId: selectedBatch?.classId || ''
                          });
                        }}
                      >
                        <option value="">None / Subject Teacher Only</option>
                        {batches.map(b => {
                          const clsName = classes.find(c => c.id === b.classId)?.name || b.className || 'Class';
                          const isAssignedToOther = b.classTeacherId && b.classTeacherId !== editingId && b.classTeacher && b.classTeacher !== 'Not Assigned';
                          return (
                            <option key={b.id} value={b.id}>
                              {clsName} - {b.name} {isAssignedToOther ? `(Currently: ${b.classTeacher})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <h3 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                      Subject Teaching Assignments
                    </h3>
                    <p className="text-[10px] text-neutral-500 font-medium leading-relaxed">
                      Configure specific combinations of classes, batches, and subjects. The system prevents assigning a combination that is already assigned to another active teacher.
                    </p>

                    {/* Combinatorial Input form */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Class</label>
                        <select
                          className="w-full px-3 py-2 rounded-lg border border-neutral-200 outline-none focus:border-primary text-xs font-bold bg-neutral-50"
                          value={selectedAssignClass}
                          onChange={(e) => {
                            setSelectedAssignClass(e.target.value);
                            setSelectedAssignBatch('');
                          }}
                        >
                          <option value="">Select Class</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Batch</label>
                        <select
                          className="w-full px-3 py-2 rounded-lg border border-neutral-200 outline-none focus:border-primary text-xs font-bold bg-neutral-50"
                          value={selectedAssignBatch}
                          onChange={(e) => setSelectedAssignBatch(e.target.value)}
                          disabled={!selectedAssignClass}
                        >
                          <option value="">Select Batch</option>
                          {batches
                            .filter(b => b.classId === selectedAssignClass)
                            .map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Subject</label>
                        <select
                          className="w-full px-3 py-2 rounded-lg border border-neutral-200 outline-none focus:border-primary text-xs font-bold bg-neutral-50"
                          value={selectedAssignSubject}
                          onChange={(e) => setSelectedAssignSubject(e.target.value)}
                        >
                          <option value="">Select Subject</option>
                          {subjectsList.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.code || 'N/A'})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedAssignClass || !selectedAssignBatch || !selectedAssignSubject) {
                              toast.error("Please pick a Class, Batch, and Subject to assign.");
                              return;
                            }

                            const exists = (formData.subjectAssignments || []).some(
                              (asg: any) =>
                                asg.classId === selectedAssignClass &&
                                asg.batchId === selectedAssignBatch &&
                                asg.subjectId === selectedAssignSubject
                            );

                            if (exists) {
                              toast.error("This subject assignment is already added to this teacher.");
                              return;
                            }

                            // Collision alert checks
                            const conflictingStaff = allActiveStaffList.find((s: any) => {
                              if (s.uid === editingId || s.id === editingId) return false;
                              const asgs = s.subjectAssignments || [];
                              return asgs.some(
                                (asg: any) =>
                                  asg.classId === selectedAssignClass &&
                                  asg.batchId === selectedAssignBatch &&
                                  asg.subjectId === selectedAssignSubject
                              );
                            });

                            if (conflictingStaff) {
                              const clsName = classes.find(c => c.id === selectedAssignClass)?.name || "Class";
                              const bName = batches.find(b => b.id === selectedAssignBatch)?.name || "Batch";
                              const sName = subjectsList.find(s => s.id === selectedAssignSubject || s.name === selectedAssignSubject)?.name || "Subject";
                              toast.error(`Collision Alert: ${clsName} - ${bName} (${sName}) is already assigned to "${conflictingStaff.name}".`);
                              return;
                            }

                            const newAsg = {
                              classId: selectedAssignClass,
                              batchId: selectedAssignBatch,
                              subjectId: selectedAssignSubject
                            };

                            const updated = [...(formData.subjectAssignments || []), newAsg];
                            const uniqueClassIds = Array.from(new Set(updated.map(a => a.classId)));
                            const uniqueBatchIds = Array.from(new Set(updated.map(a => a.batchId)));
                            const uniqueSubjects = Array.from(new Set(updated.map(a => a.subjectId)));

                            setFormData({
                              ...formData,
                              subjectAssignments: updated,
                              classIds: uniqueClassIds,
                              batchIds: uniqueBatchIds,
                              subjects: uniqueSubjects,
                              classId: uniqueClassIds[0] || '',
                              batchId: uniqueBatchIds[0] || ''
                            });

                            setSelectedAssignSubject('');
                            toast.success("Assignment added successfully");
                          }}
                          className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-black uppercase text-[10px] tracking-wider rounded-lg shadow-sm cursor-pointer transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Assign
                        </button>
                      </div>
                    </div>

                    {/* Current Assignments List */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-primary">Current Assigned Teaching Duties ({ (formData.subjectAssignments || []).length })</label>
                      <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                        {(formData.subjectAssignments || []).map((asg, index) => {
                          const cls = classes.find(c => c.id === asg.classId);
                          const bat = batches.find(b => b.id === asg.batchId);
                          const sub = subjectsList.find(s => s.id === asg.subjectId || s.name === asg.subjectId);
                          
                          return (
                            <div key={index} className="flex items-center justify-between p-3 bg-white border border-neutral-150 rounded-xl shadow-sm hover:border-primary/20 transition-all">
                              <div className="flex flex-col gap-0.5 animate-fade-in">
                                <span className="text-xs font-black text-neutral-800">
                                  {cls?.name || asg.classId} {bat ? `(${bat.name})` : asg.batchId}
                                </span>
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                                  {sub?.name || asg.subjectId} {sub?.code ? `[${sub.code}]` : ''}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (formData.subjectAssignments || []).filter((_, idx) => idx !== index);
                                  const uniqueClassIds = Array.from(new Set(updated.map(a => a.classId)));
                                  const uniqueBatchIds = Array.from(new Set(updated.map(a => a.batchId)));
                                  const uniqueSubjects = Array.from(new Set(updated.map(a => a.subjectId)));

                                  setFormData({
                                    ...formData,
                                    subjectAssignments: updated,
                                    classIds: uniqueClassIds,
                                    batchIds: uniqueBatchIds,
                                    subjects: uniqueSubjects,
                                    classId: uniqueClassIds[0] || '',
                                    batchId: uniqueBatchIds[0] || ''
                                  });
                                  toast.success("Assignment removed");
                                }}
                                className="p-1.5 px-2 border border-neutral-100 hover:border-red-100 text-neutral-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                        {(!formData.subjectAssignments || formData.subjectAssignments.length === 0) && (
                          <div className="text-center p-6 bg-white/50 border border-dashed border-neutral-200 rounded-xl">
                            <BookOpen className="w-6 h-6 text-neutral-300 mx-auto mb-1.5" />
                            <p className="text-xs text-neutral-400 italic font-medium">No Class & Batch teaching assignments configured yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {isTransport && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-amber-50 rounded-2xl border border-amber-200">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-amber-700 flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Bus Number
                      </label>
                      <select
                        className="w-full px-4 py-2.5 rounded-xl border border-amber-200 bg-white focus:border-amber-500 outline-none transition-all text-sm font-bold"
                        value={formData.busNumber}
                        onChange={(e) => setFormData({ ...formData, busNumber: e.target.value })}
                      >
                        <option value="">Select Bus</option>
                        {buses.map(b => (
                          <option key={b.id} value={b.busNumber}>Bus {b.busNumber}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-amber-700 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Transport Route
                      </label>
                      <select
                        className="w-full px-4 py-2.5 rounded-xl border border-amber-200 bg-white focus:border-amber-500 outline-none transition-all text-sm font-bold"
                        value={formData.route}
                        onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                      >
                        <option value="">Select Route/Village</option>
                        {stops.map(s => (
                          <option key={s.id} value={s.villageName}>{s.villageName} (Bus {(buses || []).find(b => b && b.id === s.busId)?.busNumber || '?'})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Bank Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider border-b border-primary/10 pb-2">Bank Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Account Number</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.bankDetails.accountNumber}
                      onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, accountNumber: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Bank Name</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.bankDetails.bankName}
                      onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, bankName: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">IFSC Code</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm"
                      value={formData.bankDetails.ifscCode}
                      onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, ifscCode: e.target.value } })}
                    />
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider border-b border-primary/10 pb-2">Additional Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Address</label>
                    <textarea
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm min-h-[100px]"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-700">Emergency Contact</label>
                    <textarea
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-primary outline-none transition-all text-sm min-h-[100px]"
                      placeholder="Name and Phone number"
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-4 bg-neutral-100 text-neutral-600 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-2 px-8 py-4 bg-primary text-white rounded-xl font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {isEditing ? 'Update Staff Member' : 'Save Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop Staff Modal */}
      {showDropModal && selectedStaffForStatus && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-sidebar">Deactivate Staff</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Are you sure you want to deactivate <span className="font-bold text-sidebar">{selectedStaffForStatus.name}</span>? 
                  They will be moved to the Inactive tab.
                </p>
              </div>
              
              <div className="space-y-2 text-left">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Deactivation Date</label>
                <input 
                  type="date" 
                  className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl font-bold text-sidebar outline-none focus:border-primary transition-all"
                  value={dropDate}
                  onChange={(e) => setDropDate(e.target.value)}
                />
              </div>
            </div>
            
            <div className="p-6 bg-neutral-50 flex gap-3">
              <button 
                onClick={() => {
                  setShowDropModal(false);
                  setSelectedStaffForStatus(null);
                }}
                className="flex-1 px-4 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDrop}
                className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-orange-200"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && confirmConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-sm overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${confirmConfig.variant === 'danger' ? 'bg-red-50 text-red-500' : 'bg-primary/10 text-primary'}`}>
                {confirmConfig.variant === 'danger' ? <Trash2 className="w-8 h-8" /> : <Save className="w-8 h-8" />}
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-sidebar">{confirmConfig.title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">{confirmConfig.message}</p>
              </div>
            </div>
            <div className="p-6 bg-neutral-50 flex gap-3">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmConfig.onConfirm}
                className={`flex-1 px-4 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${confirmConfig.variant === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-primary hover:bg-sidebar shadow-primary/20'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Account Modal */}
      {showUserModal && selectedStaffForUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-sidebar text-white">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <ShieldCheck className="w-6 h-6" />
                Login Access
              </h2>
              <button 
                onClick={() => setShowUserModal(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {(selectedStaffForUser.name).charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-sidebar">{selectedStaffForUser.name}</p>
                  <p className="text-xs text-neutral-500 uppercase font-bold tracking-wider">{selectedStaffForUser.role}</p>
                </div>
              </div>

              <div className="space-y-4 text-center pb-4">
                <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-sidebar">Enable Web Access</h3>
                  <p className="text-sm text-neutral-500">
                    This will create a login account for <span className="font-bold text-primary">{selectedStaffForUser.email}</span>. 
                    The staff member can then login using their Google account.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleCreateUserAccount(selectedStaffForUser)}
                  className="flex-1 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20"
                >
                  Enable Access
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showImportPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-auto overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-accent text-white flex-shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6" />
                Staff Import Preview & AI Analysis
              </h2>
              <button onClick={() => setShowImportPreview(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              {/* AI Analysis Section */}
              <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-primary">AI Data Analysis</h3>
                </div>
                {importAnalysis ? (
                  <p className="text-sm text-neutral-600 leading-relaxed italic">"{importAnalysis}"</p>
                ) : (
                  <div className="flex items-center gap-2 text-neutral-400 text-sm">
                    <div className="w-4 h-4 border-2 border-neutral-200 border-t-primary rounded-full animate-spin" />
                    <span>AI is analyzing your data...</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-sidebar flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Processed Staff ({importPreviewData.length})
                </h3>
                <div className="border border-neutral-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 border-b border-neutral-100">
                      <tr>
                        <th className="px-4 py-3 font-bold text-neutral-500">Name</th>
                        <th className="px-4 py-3 font-bold text-neutral-500">Email</th>
                        <th className="px-4 py-3 font-bold text-neutral-500">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {importPreviewData.slice(0, 10).map((t, idx) => (
                        <tr key={idx} className={!t.isValid ? 'bg-red-50' : ''}>
                          <td className="px-4 py-3 font-medium">
                            {t.name}
                            {!t.isValid && (
                              <div className="text-[10px] text-red-600 font-bold mt-1 uppercase flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {t.error || 'Invalid Record'}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-neutral-600">{t.email}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-[10px] font-bold rounded uppercase">
                              {t.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreviewData.length > 10 && (
                    <div className="p-3 bg-neutral-50 text-center text-xs text-neutral-400">
                      Showing first 10 of {importPreviewData.length} staff members
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-neutral-100 bg-neutral-50 flex gap-3 flex-shrink-0">
              <button 
                onClick={() => setShowImportPreview(false)}
                className="flex-1 px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmImport}
                disabled={isImporting || importPreviewData.length === 0 || importPreviewData.filter(t => t.isValid).length === 0}
                className="flex-2 px-8 py-3 bg-primary text-white rounded-xl font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Confirm & Save {importPreviewData.filter(t => t.isValid).length} Staff
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAssignmentsModal && activeBatchForAssignments && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowAssignmentsModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-indigo-600 text-white">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Shift Assignments</h2>
                <p className="text-white/70 text-xs font-bold uppercase tracking-widest">{activeBatchForAssignments.name} ({activeBatchForAssignments.startTime} - {activeBatchForAssignments.endTime})</p>
              </div>
              <button 
                onClick={() => setShowAssignmentsModal(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Current Members */}
              <div>
                <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <User className="w-3 h-3" />
                  Currently Assigned ({allActiveStaffList.filter(s => s.staffBatches?.includes(activeBatchForAssignments.id)).length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allActiveStaffList.filter(s => s.staffBatches?.includes(activeBatchForAssignments.id)).map(s => (
                    <div key={s.uid} className="flex items-center gap-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100 group">
                      <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs ring-2 ring-white">
                        {getStaffDisplayName(s).charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sidebar text-sm truncate">{getStaffDisplayName(s)}</p>
                        <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider truncate">{s.role}</p>
                      </div>
                      <button 
                        onClick={() => handleRemoveFromBatch(s.uid, activeBatchForAssignments.id)}
                        className="p-1.5 hover:bg-red-50 text-neutral-300 hover:text-red-500 rounded-lg transition-colors group-hover:scale-110 active:scale-95"
                        title="Remove from shift"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {allActiveStaffList.filter(s => s.staffBatches?.includes(activeBatchForAssignments.id)).length === 0 && (
                    <div className="col-span-full py-12 text-center bg-neutral-50/50 rounded-2xl border-2 border-dashed border-neutral-100 text-neutral-400 text-sm font-bold flex flex-col items-center gap-2">
                       <UserPlus className="w-8 h-8 opacity-20" />
                       <span>No staff assigned yet</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Add New Members - Dedicated Search & Dropdown */}
              <div className="relative pt-4 border-t border-neutral-100">
                <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PlusCircle className="w-3.5 h-3.5 text-indigo-500" />
                  Assign New Staff Member
                </h3>
                
                <div className="relative group" onFocus={() => setIsShiftDropdownOpen(true)}>
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Select staff member to add..." 
                    className="w-full pl-11 pr-12 py-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl outline-none text-sm focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
                    value={shiftSearchTerm}
                    onChange={(e) => {
                      setShiftSearchTerm(e.target.value);
                      setIsShiftDropdownOpen(true);
                    }}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setIsShiftDropdownOpen(!isShiftDropdownOpen); }}
                      className="p-1 hover:bg-neutral-100 rounded-lg transition-colors text-neutral-400"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isShiftDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  
                  {isShiftDropdownOpen && (
                    <div 
                      className="absolute top-full left-0 w-full mt-2 bg-white border border-neutral-200 rounded-2xl shadow-xl z-20 overflow-hidden animate-in slide-in-from-top-2 duration-200"
                    >
                      <div className="p-2 border-b border-neutral-100 bg-neutral-50/50 flex justify-between items-center">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-2">Active Staff Members</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIsShiftDropdownOpen(false); }}
                          className="p-1 hover:bg-neutral-200 rounded-lg transition-colors"
                        >
                          <X className="w-3 h-3 text-neutral-500" />
                        </button>
                      </div>
                      <div className="max-h-[250px] overflow-y-auto custom-scrollbar py-1">
                        {allActiveStaffList.filter(s => 
                          s.status === 'active' && 
                          ((s.name || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()) || 
                           (s.role || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()))
                        ).length > 0 ? (
                          allActiveStaffList.filter(s => 
                            s.status === 'active' && 
                            ((s.name || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()) || 
                             (s.role || '').toLowerCase().includes(shiftSearchTerm.toLowerCase()))
                          ).map(s => {
                            const isAssigned = s.staffBatches?.includes(activeBatchForAssignments.id);
                            return (
                              <button 
                                key={s.uid} 
                                disabled={isAssigned}
                                onClick={() => {
                                  handleAssignToBatch(s.uid, activeBatchForAssignments.id);
                                  setShiftSearchTerm('');
                                  setIsShiftDropdownOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left ${
                                  isAssigned 
                                    ? 'opacity-30 grayscale-[0.8] cursor-not-allowed bg-neutral-50/50' 
                                    : 'hover:bg-indigo-50'
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isAssigned ? 'bg-neutral-200 text-neutral-400' : 'bg-indigo-100 text-indigo-700'}`}>
                                  {getStaffDisplayName(s).charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`font-bold text-sm truncate ${isAssigned ? 'text-neutral-400' : 'text-sidebar'}`}>{getStaffDisplayName(s)}</p>
                                  <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">{s.role}</p>
                                </div>
                                {isAssigned ? (
                                  <Check className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <Plus className="w-4 h-4 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-4 py-8 text-center text-neutral-400 text-sm font-bold flex flex-col items-center gap-2">
                             <Search className="w-6 h-6 opacity-20" />
                             <span>No matching staff found</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="mt-4 flex flex-wrap gap-2">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1 w-full">Quick Suggestions</p>
                  {allActiveStaffList
                    .filter(s => s.status === 'active' && !s.staffBatches?.includes(activeBatchForAssignments.id))
                    .slice(0, 4)
                    .map(s => (
                      <button
                        key={s.uid}
                        onClick={() => handleAssignToBatch(s.uid, activeBatchForAssignments.id)}
                        className="px-3 py-1.5 bg-neutral-100 hover:bg-indigo-100 hover:text-indigo-700 rounded-full text-[11px] font-bold text-neutral-600 transition-all flex items-center gap-2"
                      >
                         <Plus className="w-3 h-3" />
                         {getStaffDisplayName(s)}
                      </button>
                    ))
                  }
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-neutral-100 bg-neutral-50">
              <button 
                onClick={() => setShowAssignmentsModal(false)}
                className="w-full py-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-bold hover:bg-neutral-50 hover:border-neutral-300 transition-all active:scale-95 shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {showCameraModal && (
        <CameraModal 
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCapture={async (file) => {
            try {
              toast.loading("Uploading captured photo...", { id: 'staff-photo-capture' });
              const url = await uploadService.uploadFile(file);
              setFormData(prev => ({ ...prev, photoURL: url }));
              toast.success("Photo captured and uploaded!", { id: 'staff-photo-capture' });
            } catch (error: any) {
              toast.error(error.message || "Capture upload failed", { id: 'staff-photo-capture' });
            }
          }}
          title="Capture Staff Photo"
        />
      )}

    </div>
  );
};

export default Staff;
