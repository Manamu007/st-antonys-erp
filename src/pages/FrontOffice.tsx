import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserSquare2, Users, Clock, LogIn, LogOut, CheckCircle2, XCircle, FileSignature, AlertCircle, FileText, Search, Camera, Trash2, Download, Calendar, TrendingUp, Printer, ArrowUpDown, Cpu, Code, Terminal, Server, RefreshCw } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { dbService } from '../services/dbService';
import { where, Timestamp, query, getDocs, collection, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { getGravatarUrl, getPersonDisplayName, getStaffDisplayName, isSyntheticOrMailName } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import SmartKioskModal from '../components/SmartKioskModal';
import FaceRegistrationModal from '../components/FaceRegistrationModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadModels } from '../services/faceRecognitionService';
import { safeStorage as localStorage } from '../lib/safeStorage';

export default function FrontOffice() {
  const { profile, hasPermission, isVicePrincipal, isAdmin } = useAuth();
  const { settings } = useSettings();
  const isVicePrincipalRole = isVicePrincipal || profile?.role === 'vice_principal';

  const [activeTab, setActiveTab] = useState<'staff_attendance' | 'student_permissions' | 'face_registration'>('staff_attendance');
  const [showKiosk, setShowKiosk] = useState(false);

  const [regType, setRegType] = useState<'staff' | 'student'>('staff');
  const [regStatusFilter, setRegStatusFilter] = useState<'all' | 'registered' | 'unregistered'>('all');

  const [loading, setLoading] = useState(true);
  
  // Data
  const [staff, setStaff] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [permissionsRecords, setPermissionsRecords] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [faceSortField, setFaceSortField] = useState<'name' | 'contact' | 'status'>('name');
  const [faceSortOrder, setFaceSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [faceToDelete, setFaceToDelete] = useState<any | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncBiometrics = async () => {
    setIsSyncing(true);
    const toastId = toast.loading("Syncing mobile registrations with database...");
    try {
      await fetchData(true);
      toast.success("Database synced successfully! All mobile face registrations are up to date.", { id: toastId });
    } catch (err: any) {
      toast.error(`Sync failed: ${err.message || err}`, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const [printingPermission, setPrintingPermission] = useState<{ student: any; permission: any } | null>(null);
  const [printQueue, setPrintQueue] = useState<{ student: any; permission: any }[]>([]);
  const [printPaperSize, setPrintPaperSize] = useState<'2in' | '3in' | 'a5'>(() => {
    return (localStorage.getItem('front_office_print_paper_size') as any) || '3in';
  });
  const [showPrinterHint, setShowPrinterHint] = useState(false);
  const [previewPermission, setPreviewPermission] = useState<{ student: any; permission: any } | null>(null);

  const handlePaperSizeChange = (size: '2in' | '3in' | 'a5') => {
    setPrintPaperSize(size);
    localStorage.setItem('front_office_print_paper_size', size);
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintingPermission(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // Sequential 3-inch printer automation queue that auto-triggers next print dialog on user interaction completion
  useEffect(() => {
    if (!printingPermission && printQueue.length > 0) {
      const nextPrint = printQueue[0];
      setPrintQueue(prev => prev.slice(1));
      setPrintingPermission(nextPrint);
      
      const timer = setTimeout(() => {
        try {
          const originalTitle = document.title;
          document.title = "Permission Slip";
          window.print();
          document.title = originalTitle;
          console.log(`[Printer] Automatically sent print for student: ${nextPrint.student?.name}`);
        } catch (printErr) {
          console.warn("Print dialog launch failed:", printErr);
        }
        
        // Mobile fallback: clear printingPermission after 5 seconds in case afterprint does not fire due to iframe / webview constraints
        const fallbackId = setTimeout(() => {
          setPrintingPermission(prev => {
            if (prev && prev.student?.uid === nextPrint.student?.uid) {
              console.log("[Printer] Fallback cleared printingPermission for next item");
              return null;
            }
            return prev;
          });
        }, 5000);
        
        return () => clearTimeout(fallbackId);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [printingPermission, printQueue]);

  const handlePrintSlip = (student: any, permission: any) => {
    setPreviewPermission({ student, permission });
    setPrintQueue(prev => [...prev, { student, permission }]);
  };

  const handleTestPrint = () => {
    const mockStudent = {
      name: "HARDWARE TEST STUDENT",
      classId: "test_class",
      batchId: "test_batch",
      rollNumber: "99",
      admissionNumber: "ADM-999-TEST",
      photoURL: "",
      fatherName: "TEST FATHER",
      motherName: "TEST MOTHER",
      phone: "+91 99999 99999"
    };

    const mockPermission = {
      type: 'outpass',
      date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      reason: "PERIPERI 3IN THERMAL PRINTER TESTING PASS",
      grantedBy: "FRONT OFFICE TEST TERMINAL"
    };

    setPreviewPermission({ student: mockStudent, permission: mockPermission });
  };

  const getAuthorizedByName = (grantedId: string) => {
    if (!grantedId) return 'Authorized Official';
    const foundStaff = staff.find((st: any) => st.uid === grantedId);
    if (foundStaff) return getStaffDisplayName(foundStaff);
    if (profile && profile.uid === grantedId) return getPersonDisplayName(profile);
    // Check if profile.name matches or if grantedId is a human readable name
    if (grantedId === 'Kiosk' || !grantedId.match(/^[a-zA-Z0-9_-]{20,40}$/)) {
      if (!isSyntheticOrMailName(grantedId)) return grantedId;
    }
    return 'Authorized Official';
  };

  const toggleFaceSort = (field: 'name' | 'contact' | 'status') => {
    if (faceSortField === field) {
      setFaceSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setFaceSortField(field);
      setFaceSortOrder('asc');
    }
  };

  const { filteredFaceMembers, totalFaceMembersCount } = useMemo(() => {
    const source = regType === 'staff' ? staff : students;
    const filtered = source.filter(m => {
      const displayName = getPersonDisplayName(m);
      const matchesSearch = displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (m.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (m.lastName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const isRegistered = m.biometricVerified === true || !!m.awsExternalImageId || !!m.faceDescriptor;
      const matchesStatus = regStatusFilter === 'all' 
        ? true 
        : regStatusFilter === 'registered' ? isRegistered : !isRegistered;
      const matchesClass = regType === 'staff' ? true : (selectedClassId === 'all' ? true : m.classId === selectedClassId);
      const matchesBatch = regType === 'staff' ? true : (selectedBatchId === 'all' ? true : m.batchId === selectedBatchId);
      return matchesSearch && matchesStatus && matchesClass && matchesBatch;
    });

    const sorted = [...filtered].sort((a, b) => {
      let valA = '';
      let valB = '';
      if (faceSortField === 'name') {
        valA = getPersonDisplayName(a).toLowerCase();
        valB = getPersonDisplayName(b).toLowerCase();
      } else if (faceSortField === 'contact') {
        valA = (a.phone || a.rollNumber || '').toLowerCase();
        valB = (b.phone || b.rollNumber || '').toLowerCase();
      } else if (faceSortField === 'status') {
        const isRegisteredA = a.biometricVerified === true || !!a.awsExternalImageId || !!a.faceDescriptor;
        const isRegisteredB = b.biometricVerified === true || !!b.awsExternalImageId || !!b.faceDescriptor;
        valA = isRegisteredA ? '1' : '0';
        valB = isRegisteredB ? '1' : '0';
      }

      if (valA < valB) return faceSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return faceSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return {
      filteredFaceMembers: sorted.slice((currentPage - 1) * 50, currentPage * 50),
      totalFaceMembersCount: sorted.length
    };
  }, [staff, students, regType, searchTerm, regStatusFilter, selectedClassId, selectedBatchId, currentPage, faceSortField, faceSortOrder]);

  const faceRegMembers = filteredFaceMembers;
  
  useEffect(() => {
    // Lazy load or pre-load face models only when the component is active,
    // avoiding blocking the main mounting lifecycle if connections/CDNs are slow.
    const primeModels = async () => {
      try {
        console.log("Pre-priming Face Recognition models in background...");
        // Wait 1.5 seconds after mounting to prevent blocking the initial page rendering
        await new Promise(r => setTimeout(r, 1500));
        await loadModels();
        console.log("Face Recognition models primed in background.");
      } catch (err) {
        console.warn("Could not pre-load face recognition models on mount:", err);
      }
    };
    primeModels();
  }, []);

  useEffect(() => {
    setSearchTerm('');
    setSelectedClassId('all');
    setSelectedBatchId('all');
    setCurrentPage(1);
  }, [activeTab, regType]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, regStatusFilter, selectedClassId, selectedBatchId]);

  useEffect(() => {
    fetchData(false);
  }, [selectedDate]);

  useEffect(() => {
    if (showKiosk || activeTab === 'face_registration') {
      fetchData(true);
    }
  }, [showKiosk, activeTab]);

  const fetchData = async (forceLoadKiosk = false) => {
    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      const [staffData, attData, permData, clsData, bData, holidaysData, usersData] = await Promise.all([
        dbService.list('staff', [where('status', '==', 'active')]),
        dbService.list('staff_attendance', [where('date', '==', dateStr)]),
        dbService.list('student_permissions', [where('date', '==', dateStr)]),
        dbService.list('classes'),
        dbService.list('batches'),
        dbService.list('holidays').catch(() => []),
        dbService.list('users').catch(() => [])
      ]);

      // Unify staff profiles and user accounts to guarantee first/last names and clean profiles with no synthetic duplicates
      const unifiedStaffMap = new Map<string, any>();
      const emailToKeyMap = new Map<string, string>();
      const nameToKeyMap = new Map<string, string>();

      (staffData || []).forEach((s: any) => {
        if (!s) return;
        const sId = s.uid || s.id;
        if (!sId) return;

        const resolvedStaffName = getStaffDisplayName(s);
        const nameParts = resolvedStaffName.split(' ');
        const fName = s.firstName || nameParts[0] || '';
        const lName = s.lastName || s.secondName || nameParts.slice(1).join(' ') || '';
        const normEmail = (s.email || '').toLowerCase().trim();
        const normName = resolvedStaffName.toLowerCase().trim();

        // Check if already present by email or resolved name
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
          uid: existing.uid || sId,
          id: existing.id || sId,
          firstName: fName,
          lastName: lName,
          name: resolvedStaffName,
          status: s.status || existing.status || 'active'
        };

        unifiedStaffMap.set(targetKey, merged);
        if (normEmail) emailToKeyMap.set(normEmail, targetKey);
        if (normName && normName !== 'staff member') nameToKeyMap.set(normName, targetKey);
      });

      (usersData || []).forEach((u: any) => {
        if (!u) return;
        const uId = u.uid || u.id;
        const role = (u.role || '').toLowerCase().trim();
        if (role === 'student' || role === 'parent') return;

        const resolvedUserName = getStaffDisplayName(u);
        const nameParts = resolvedUserName.split(' ');
        const fName = u.firstName || nameParts[0] || '';
        const lName = u.lastName || u.secondName || nameParts.slice(1).join(' ') || '';
        const normEmail = (u.email || '').toLowerCase().trim();
        const normName = resolvedUserName.toLowerCase().trim();

        let existingKey: string | null = null;
        if (uId && unifiedStaffMap.has(uId)) {
          existingKey = uId;
        } else if (normEmail && emailToKeyMap.has(normEmail)) {
          existingKey = emailToKeyMap.get(normEmail)!;
        } else if (normName && normName !== 'staff member' && nameToKeyMap.has(normName)) {
          existingKey = nameToKeyMap.get(normName)!;
        }

        if (existingKey) {
          const existing = unifiedStaffMap.get(existingKey);
          unifiedStaffMap.set(existingKey, {
            ...u,
            ...existing,
            uid: existing.uid || uId,
            firstName: existing.firstName || fName,
            lastName: existing.lastName || lName,
            name: existing.name || resolvedUserName,
            photoURL: existing.photoURL || existing.photoUrl || u.photoURL || u.photoUrl || '',
            status: existing.status || u.status || 'active'
          });
        } else if (uId) {
          const newEntry = {
            ...u,
            uid: uId,
            id: uId,
            firstName: fName,
            lastName: lName,
            name: resolvedUserName,
            status: u.status || 'active',
            staffType: 'teaching'
          };
          unifiedStaffMap.set(uId, newEntry);
          if (normEmail) emailToKeyMap.set(normEmail, uId);
          if (normName && normName !== 'staff member') nameToKeyMap.set(normName, uId);
        }
      });

      const normalizedStaff = Array.from(unifiedStaffMap.values());

      // Query students participating in today's permissions or registered with face ID
      let studentsData: any[] = [];
      const permStudentIds = Array.from(new Set(permData.map((p: any) => p.studentId).filter(Boolean)));
      
      const promises: Promise<any[]>[] = [];
      
      if (permStudentIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < permStudentIds.length; i += 30) {
          chunks.push(permStudentIds.slice(i, i + 30));
        }
        chunks.forEach(chunk => {
          promises.push(
            dbService.list('students', [where('uid', 'in', chunk)])
              .catch(() => [])
          );
        });
      }

      // Load registered biometric students for face kiosk/registration only on demand
      if (forceLoadKiosk || showKiosk || activeTab === 'face_registration') {
        if (activeTab === 'face_registration') {
          // For face registration, we must load ALL active students so we can register unregistered ones
          promises.push(
            dbService.list('students')
              .then(list => list.filter(s => s.status === 'active' || !s.status))
              .catch(() => [])
          );
        } else {
          // For kiosk mode, we only need to load already registered students to build the face library
          promises.push(
            dbService.list('students', [where('biometricVerified', '==', true)])
              .then(list => list.filter(s => s.status === 'active' || !s.status))
              .catch(() => [])
          );
          promises.push(
            dbService.list('students', [where('faceDescriptor', '!=', null)])
              .then(list => list.filter(s => s.status === 'active' || !s.status))
              .catch(() => [])
          );
          // Fallback: fetch list and filter to registered only for kiosk efficiency
          promises.push(
            dbService.list('students')
              .then(list => list.filter(s => (s.status === 'active' || !s.status) && (s.biometricVerified === true || s.faceDescriptor)))
              .catch(() => [])
          );
        }
      }

      const results = await Promise.all(promises);
      studentsData = results.flat();

      const uniqueMap = new Map();
      studentsData.forEach(s => {
        if (s) {
          const sId = s.uid || s.id;
          if (sId) uniqueMap.set(sId, { ...s, uid: sId });
        }
      });
      studentsData = Array.from(uniqueMap.values());

      setStaff(normalizedStaff);
      setStudents(studentsData);
      setAttendanceRecords(attData);
      setPermissionsRecords(permData);
      setClasses(clsData);
      setBatches(bData);
      setHolidays(holidaysData || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load Front Office data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'student_permissions' || (activeTab === 'face_registration' && regType === 'student')) {
      const searchStudents = async () => {
        const lacksClassOrBatch = selectedClassId === 'all' && selectedBatchId === 'all';
        const searchLen = searchTerm.trim().length;

        if (lacksClassOrBatch && searchLen < 3) {
          return;
        }

        try {
          let listData: any[] = [];

          if (!lacksClassOrBatch) {
            // If class/batch is selected, fetch students from that class/batch only (highly optimized)
            const constraints = [];
            if (selectedClassId !== 'all') {
              constraints.push(where('classId', '==', selectedClassId));
            }
            if (selectedBatchId !== 'all') {
              constraints.push(where('batchId', '==', selectedBatchId));
            }
            listData = await dbService.list('students', constraints);
          } else {
            // Highly optimized cross-class prefix matching to avoid downloading thousands of active students
            const term = searchTerm.trim();
            const termUpper = term.toUpperCase();
            const termLower = term.toLowerCase();
            const termTitle = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();

            // Run light, parallel, single-field queries (requires no custom composite indexes)
            const [rTitle, rUpper, rLower, rAdmission] = await Promise.all([
              dbService.list('students', [
                where('name', '>=', termTitle),
                where('name', '<=', termTitle + '\uf8ff'),
                limit(25)
              ]).catch(() => []),
              dbService.list('students', [
                where('name', '>=', termUpper),
                where('name', '<=', termUpper + '\uf8ff'),
                limit(25)
              ]).catch(() => []),
              dbService.list('students', [
                where('name', '>=', termLower),
                where('name', '<=', termLower + '\uf8ff'),
                limit(25)
              ]).catch(() => []),
              dbService.list('students', [
                where('admissionNumber', '==', term),
                limit(15)
              ]).catch(() => [])
            ]);

            listData = [...rTitle, ...rUpper, ...rLower, ...rAdmission];
          }

          listData = listData.filter(s => s.status === 'active' || !s.status);
          
          setStudents(prev => {
            const map = new Map();
            prev.forEach(s => {
              if (s && s.uid) map.set(s.uid, s);
            });
            listData.forEach(s => {
              if (s && s.uid) map.set(s.uid, s);
            });
            return Array.from(map.values());
          });
        } catch (e) {
          console.warn("Dynamic optimized student search failed:", e);
        }
      };

      const delayDebounce = setTimeout(() => {
        searchStudents();
      }, 400);

      return () => clearTimeout(delayDebounce);
    }
  }, [activeTab, regType, selectedClassId, selectedBatchId, searchTerm]);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const isSelectedDateHoliday = useMemo(() => {
    const dObj = new Date(selectedDate);
    const dayOfWeek = dObj.getDay();
    const dNum = dObj.getDate();
    const isSunday = dayOfWeek === 0;
    const isSecondSaturday = dayOfWeek === 6 && dNum >= 8 && dNum <= 14;

    if (isSunday || isSecondSaturday) {
      return true;
    }

    return holidays.some((h: any) => {
      const start = h.date;
      const end = h.toDate || h.date;
      return selectedDateStr >= start && selectedDateStr <= end && h.type !== 'working_day';
    });
  }, [holidays, selectedDateStr, selectedDate]);

  const handleMarkStaffAttendance = async (uid: string, status: 'present' | 'absent', method: 'manual' | 'face' = 'manual') => {
    try {
      if (isSelectedDateHoliday) {
        toast.error("Today is a holiday. Attendance cannot be manual marked.");
        return;
      }

      const currentYearName = settings?.currentAcademicYear || '2026-27';
      const currentYearDetails = settings?.academicYearDetails?.find(y => y.name === currentYearName);
      const academicYearStartDate = currentYearDetails?.startDate || `${currentYearName.slice(0, 4)}-06-01`;

      if (selectedDateStr < academicYearStartDate) {
        toast.error("Cannot mark attendance before academic year start date.");
        return;
      }

      const isStaff = staff.some(s => s.uid === uid);
      const collectionName = isStaff ? 'staff_attendance' : 'attendance';
      const existing = attendanceRecords.find(a => (a.userId === uid || a.studentId === uid) && a.date === selectedDateStr);
      
      if (isStaff) {
        // Use our secure backend API to bypass restrictive server-side security rules on staff_attendance write
        const res = await fetch('/api/attendance/mark-staff-attendance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            uid,
            status,
            date: selectedDateStr,
            method,
            existingRecordId: existing ? existing.id : null
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Server staff-attendance mark failed');
        }
      } else {
        // Students attendance is fully public/unrestricted for write in client rules
        if (existing) {
          if (existing.status === status) return;
          await dbService.update(collectionName, existing.id, { 
            status, 
            method,
            timestamp: new Date().toISOString()
          });
        } else {
          const payload = { studentId: uid, date: selectedDateStr, status, method, timestamp: new Date().toISOString() };
          await dbService.add(collectionName, payload);
        }
      }
      
      const updatedAtt = await dbService.list('attendance', [where('date', '==', selectedDateStr)]);
      const updatedStaffAtt = await dbService.list('staff_attendance', [where('date', '==', selectedDateStr)]);
      setAttendanceRecords([...updatedAtt, ...updatedStaffAtt]);
      
      toast.success(`${status === 'present' ? 'Present' : 'Absent'} marked`);
    } catch (e) {
      console.error("Attendance Error:", e);
      toast.error('Failed to mark attendance');
    }
  };

  const getAttendanceStatus = (uid: string) => {
    if (isSelectedDateHoliday) {
      return 'holiday';
    }

    const currentYearName = settings?.currentAcademicYear || '2026-27';
    const currentYearDetails = settings?.academicYearDetails?.find(y => y.name === currentYearName);
    const academicYearStartDate = currentYearDetails?.startDate || `${currentYearName.slice(0, 4)}-06-01`;

    if (selectedDateStr < academicYearStartDate) {
      return 'not_started';
    }

    const record = attendanceRecords.find(a => (a.userId === uid || a.studentId === uid) && a.date === selectedDateStr);
    return record?.status || 'absent';
  };

  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const displayName = getStaffDisplayName(s);
      const matchesSearch = displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (s.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (s.lastName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (s.role || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    });
  }, [staff, searchTerm]);

  // STUDENT PERMISSIONS logic
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  
  // KIOSK logic

  const handleKioskSuccess = async (person: any) => {
    const personDisplayName = getPersonDisplayName(person);
    if (activeTab === 'staff_attendance') {
      if (isSelectedDateHoliday) {
        toast.error("Today is a holiday. Cannot mark attendance.");
        return;
      }
      const existing = attendanceRecords.find(a => (a.userId === person.uid || a.studentId === person.uid) && a.date === selectedDateStr);
      if (existing && existing.status === 'present') {
        // Person already present, we just verify them in the UI without recording again
        toast.info(`${personDisplayName} already marked present today. Verification successful.`);
        console.log(`[BioKiosk] ${personDisplayName} already marked present. Verify Only.`);
        return;
      }
      await handleMarkStaffAttendance(person.uid, 'present', 'face');
    } else {
      // Client-side guard for duplicate permission
      const alreadyHasPermission = permissionsRecords.some(p => p.studentId === person.uid);
      if (alreadyHasPermission) {
        toast.error(`Already permission taken for student ${personDisplayName} today.`);
        throw new Error("Already permission taken");
      }

      const time = format(new Date(), 'HH:mm');
      try {
        const classInfo = classes.find(c => c.id === person.classId)?.name || '';
        const batchInfo = batches.find(b => b.id === person.batchId)?.name || '';
        const alertMessage = `Dear Parent, your ward ${personDisplayName} (${classInfo} ${batchInfo}) has been marked for Outpass at ${time} on ${selectedDateStr}.`;

        const res = await fetch('/api/attendance/student-permission', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            studentId: person.uid,
            date: selectedDateStr,
            type: 'outpass',
            reason: 'Smart Kiosk Outpass',
            time,
            grantedBy: profile ? getPersonDisplayName(profile) : 'Kiosk',
            parentPhone: person.parentPhone || person.whatsappNumber || person.phone || person.guardianPhone || null,
            alertMessage
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Server kiosk outpass failed');
        }

        const resData = await res.json();
        const waStatus = resData.waStatus;

        const outpassPerm = {
          id: resData.docId || `kiosk_${Date.now()}`,
          studentId: person.uid,
          date: selectedDateStr,
          type: 'outpass',
          reason: 'Smart Kiosk Outpass',
          time,
          grantedBy: profile ? getPersonDisplayName(profile) : 'Kiosk'
        };

        if (waStatus === 'missing_phone') {
          toast.success(`Outpass granted for ${personDisplayName}, but parent phone was missing.`);
        } else if (waStatus === 'invalid_phone') {
          toast.success(`Outpass granted for ${personDisplayName}, but parent phone was invalid.`);
        } else if (waStatus === 'duplicate_skipped') {
          toast.success(`Outpass granted for ${personDisplayName} (duplicate notification blocked).`);
        } else {
          toast.success(`Outpass granted and parent notified for ${personDisplayName}`);
        }
        fetchData();
        // Automatically send command to printer (queue the print job immediately)
        setPrintQueue(prev => [...prev, { student: person, permission: outpassPerm }]);
        handlePrintSlip(person, outpassPerm);
      } catch (e: any) {
        console.error(e);
        toast.error(e.message || "Failed to process student permission.");
      }
    }
  };
  
  const handleOpenPermission = (student: any) => {
    setSelectedStudent(student);
    setShowPermissionModal(true);
  };

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const displayName = getPersonDisplayName(s);
      const hasPermission = permissionsRecords.some(p => p.studentId === s.uid);
      const matchesSearch = displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (s.rollNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClass = (selectedClassId === 'all' ? true : s.classId === selectedClassId);
      const matchesBatch = (selectedBatchId === 'all' ? true : s.batchId === selectedBatchId);
      
      if (searchTerm) {
        return matchesSearch && matchesClass && matchesBatch;
      }
      return hasPermission && matchesClass && matchesBatch;
    });
  }, [students, searchTerm, permissionsRecords, selectedClassId, selectedBatchId]);

  // Face Registration logic
  const [showFaceReg, setShowFaceReg] = useState(false);
  const [personForReg, setPersonForReg] = useState<any>(null);

  const startFaceReg = (person: any) => {
    setPersonForReg(person);
    setShowFaceReg(true);
  };

  const handleExportData = async (range: 'day' | 'month' | 'year') => {
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      if (range === 'day') {
        startDate = selectedDate;
        endDate = selectedDate;
      } else if (range === 'month') {
        startDate = startOfMonth(selectedDate);
        endDate = endOfMonth(selectedDate);
      } else {
        const currentYearDetail = settings.academicYearDetails?.find(y => y.name === settings.currentAcademicYear);
        if (currentYearDetail) {
          startDate = new Date(currentYearDetail.startDate);
          endDate = new Date(currentYearDetail.endDate);
        } else {
          startDate = startOfYear(selectedDate);
          endDate = endOfYear(selectedDate);
        }
      }

      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      const [allAttendance, allPermissions] = await Promise.all([
        dbService.list('attendance', [where('date', '>=', startStr), where('date', '<=', endStr)]),
        dbService.list('student_permissions', [where('date', '>=', startStr), where('date', '<=', endStr)])
      ]);

      const doc = new jsPDF();
      const title = activeTab === 'staff_attendance' ? 'Staff Attendance Report' : 'Student Permissions Report';
      const rangeText = range === 'day' ? format(startDate, 'PPPP') : 
                        range === 'month' ? format(startDate, 'MMMM yyyy') : 
                        `Year ${format(startDate, 'yyyy')}`;

      doc.setFontSize(22);
      doc.setTextColor(20, 20, 20);
      doc.text(title, 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Range: ${rangeText}`, 14, 30);
      doc.text(`Generated on: ${format(new Date(), 'PPpp')}`, 14, 36);

      if (activeTab === 'staff_attendance') {
        const staffStats = new Map();
        
        // Calculate dynamic total working days for the period (excluding Sundays)
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        const workingDaysInPeriod = daysInRange.filter(d => d.getDay() !== 0).length;

        // Initialize stats for each staff member
        staff.forEach(s => {
          staffStats.set(s.uid, {
            name: getStaffDisplayName(s),
            role: s.role?.replace('_', ' ') || 'Staff',
            present: 0,
            absent: 0,
            late: 0,
            total: workingDaysInPeriod
          });
        });

        // Calculate stats
        allAttendance.forEach(a => {
          const stats = staffStats.get(a.studentId);
          if (stats) {
            if (a.status === 'present') {
              stats.present++;
              
              // Check for lateness
              const s = staff.find(st => st.uid === a.studentId);
              const staffBatch = batches.find(b => b.id === s?.batchId);
              if (a.timestamp && staffBatch?.startTime) {
                const checkInDate = new Date(a.timestamp);
                const [sHour, sMin] = staffBatch.startTime.split(':').map(Number);
                const shiftStart = new Date(checkInDate);
                shiftStart.setHours(sHour, sMin, 0, 0);
                if (checkInDate > shiftStart) {
                  stats.late++;
                }
              }
            } else if (a.status === 'absent') {
              stats.absent++;
            }
          }
        });

        // For individuals, define absent days = workingDays - present
        staffStats.forEach(stats => {
           stats.absent = Math.max(0, stats.total - stats.present);
        });

        if (range !== 'day') {
          // Add Summary Table for Monthly/Yearly reports
          doc.setFontSize(14);
          doc.text('Attendance Summary', 14, 45);
          
          const summaryData = Array.from(staffStats.values())
            .filter(s => s.total > 0)
            .map(s => [
              s.name,
              s.role,
              s.total.toString(),
              s.present.toString(),
              s.absent.toString(),
              s.late.toString()
            ]);

          autoTable(doc, {
            startY: 50,
            head: [['Name', 'Role', 'Total Days', 'Present', 'Absent', 'Late Marks']],
            body: summaryData,
            theme: 'grid',
            headStyles: { fillColor: [5, 150, 105], fontSize: 10, fontStyle: 'bold' },
            bodyStyles: { fontSize: 9 },
          });

          doc.addPage();
          doc.setFontSize(14);
          doc.text('Detailed Logs', 14, 22);
        }

        const tableData = allAttendance
          .map(a => {
            const s = staff.find(st => st.uid === a.studentId);
            if (!s) return null;

            let lateness = '';
            if (a.status === 'present' && a.timestamp) {
              const checkInDate = new Date(a.timestamp);
              const staffBatch = batches.find(b => b.id === s.batchId);
              if (staffBatch?.startTime) {
                const [sHour, sMin] = staffBatch.startTime.split(':').map(Number);
                const shiftStart = new Date(checkInDate);
                shiftStart.setHours(sHour, sMin, 0, 0);
                if (checkInDate > shiftStart) lateness = ' (LATE)';
              }
            }

            return [
              format(new Date(a.date), 'dd/MM/yyyy'),
              getStaffDisplayName(s),
              s.role?.replace('_', ' ') || 'Staff',
              a.status.toUpperCase(),
              a.timestamp ? format(new Date(a.timestamp), 'hh:mm a') + lateness : 'N/A',
              a.method || 'Manual'
            ];
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b[0].split('/').reverse().join('-').localeCompare(a[0].split('/').reverse().join('-')));

        autoTable(doc, {
          startY: range === 'day' ? 45 : 30,
          head: [['Date', 'Staff Name', 'Role', 'Status', 'Time', 'Method']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [14, 165, 233], fontSize: 10, fontStyle: 'bold' },
          bodyStyles: { fontSize: 9 },
          alternateRowStyles: { fillColor: [245, 247, 250] }
        });
      } else {
        const tableData = allPermissions
          .map(p => {
            const s = students.find(st => st.uid === p.studentId);
            if (!s) return null;
            return [
              format(new Date(p.date), 'dd/MM/yyyy'),
              getPersonDisplayName(s),
              classes.find(c => c.id === s.classId)?.name || 'N/A',
              p.type.replace('_', ' ').toUpperCase(),
              p.time || 'N/A',
              p.reason || 'N/A'
            ];
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b[0].split('/').reverse().join('-').localeCompare(a[0].split('/').reverse().join('-')));

        autoTable(doc, {
          startY: 45,
          head: [['Date', 'Student Name', 'Class', 'Type', 'Time', 'Reason']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [99, 102, 241], fontSize: 10, fontStyle: 'bold' },
          bodyStyles: { fontSize: 9 },
          alternateRowStyles: { fillColor: [245, 247, 250] }
        });
      }

      doc.save(`${activeTab}_report_${startStr}.pdf`);
      toast.success('Report exported successfully');
      setShowExportModal(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to export report');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteAllFaceIDs = async () => {
    setShowDeleteAllConfirm(false);
    const loadingToast = toast.loading('Deleting ALL registered Face IDs from Firestore database & resetting Rekognition collection...');
    try {
      const res = await fetch('/api/attendance/delete-all-faces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || 'Server bulk face deletion failed');
      }

      toast.success(`Successfully cleared all old Face IDs for ${resData.cleanedCount || 0} members from Firestore database.`, { id: loadingToast });

      // Invalidate frontend cache completely for students, staff, and users so the UI updates
      dbService.clearCache('students');
      dbService.clearCache('staff');
      dbService.clearCache('users');

      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to delete all Face IDs', { id: loadingToast });
    }
  };

  const handleDeleteFaceID = async (person: any) => {
    const isAuthorized = isAdmin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'management' || profile?.role === 'principal';
    if (!isAuthorized) {
      toast.error('Only administrators can delete Face ID data');
      return;
    }
    
    setFaceToDelete(person);
  };

  const confirmDeleteFaceID = async () => {
    if (!faceToDelete) return;
    const person = faceToDelete;
    setFaceToDelete(null);
    
    const loadingToast = toast.loading('Deleting Face ID from Database & AWS S3/Rekognition...');
    const memberType = regType === 'staff' ? 'staff' : 'student';
    try {
      const res = await fetch('/api/attendance/delete-face', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uid: person.uid || person.id,
          type: memberType
        })
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || 'Server face deletion failed');
      }

      if (resData.awsError) {
        toast.warning(`Database cleared, but AWS Rekognition sync failed: ${resData.awsError}. Please check your AWS Configuration.`, { id: loadingToast, duration: 10000 });
      } else {
        toast.success(`Face ID completely deleted for ${person.name} from Database & AWS S3`, { id: loadingToast });
      }

      // Clear client side cache so dbService.list gets updated data
      const targetCol = memberType === 'staff' ? 'staff' : 'students';
      dbService.clearCache(targetCol, person.uid || person.id);
      dbService.clearCache('users', person.uid || person.id);

      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to delete Face ID', { id: loadingToast });
    }
  };

  if (isVicePrincipalRole) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm min-h-[400px]">
        <UserSquare2 className="w-12 h-12 text-primary mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          Vice Principals do not have authorization to view or edit the Front Office module.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-sidebar tracking-tight flex items-center gap-3">
            <UserSquare2 className="w-8 h-8 text-sky-500" />
            Front Office
          </h1>
          <p className="text-sm font-medium text-neutral-500 mt-1">Manage staff attendance and student permissions</p>
        </div>
        
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-neutral-200">
          <button
            onClick={() => setActiveTab('staff_attendance')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'staff_attendance'
                ? 'bg-sky-50 text-sky-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <UserSquare2 className="w-4 h-4" />
            Staff Attendance
          </button>
          <button
            onClick={() => setActiveTab('student_permissions')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'student_permissions'
                ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <Clock className="w-4 h-4" />
            Student Permissions
          </button>
          <button
            onClick={() => setActiveTab('face_registration')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'face_registration'
                ? 'bg-amber-50 text-amber-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <Camera className="w-4 h-4" />
            Face ID Management
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            className="px-6 py-2.5 bg-neutral-100 text-neutral-600 rounded-xl font-bold hover:bg-neutral-200 transition-all flex items-center gap-2 shadow-sm border border-neutral-200"
          >
            <Download className="w-5 h-5" />
            Export Report
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : activeTab === 'staff_attendance' ? (
        <div className="space-y-6">
          <div className="flex flex-col xl:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-neutral-200">
            <div className="flex-1 w-full flex flex-col sm:flex-row flex-wrap gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm"
                />
              </div>
              <div className="w-full sm:w-auto">
                <input 
                  type="date"
                  value={selectedDateStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      setSelectedDate(new Date(year, month - 1, day));
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-sm font-bold text-neutral-700"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 w-full xl:w-auto">
              <button
                onClick={() => setShowKiosk(true)}
                className="flex-1 xl:flex-none px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Smart Camera Kiosk
              </button>
            </div>
          </div>

          {isSelectedDateHoliday && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-850">
              <Calendar className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-bold">Today is a scheduled Holiday</p>
                <p className="text-xs text-amber-750 font-medium">Manual and biometric attendance marking are disabled on holidays.</p>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-neutral-500 mb-1">Present Today</p>
                <h3 className="text-3xl font-black text-emerald-600">
                  {staff.filter(s => getAttendanceStatus(s.uid) === 'present').length}
                </h3>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-rose-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-neutral-500 mb-1">Absent Today</p>
                <h3 className="text-3xl font-black text-rose-600">
                  {staff.filter(s => getAttendanceStatus(s.uid) === 'absent').length}
                </h3>
              </div>
              <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
                <XCircle className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">{activeTab === 'staff_attendance' ? 'Staff Member' : 'Student'}</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">{activeTab === 'staff_attendance' ? 'Role' : 'Class/Batch'}</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Check-in Time</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Status</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredStaff.map((person) => {
                    const status = getAttendanceStatus(person.uid);
                    const staffName = getStaffDisplayName(person);
                    return (
                    <tr key={person.uid} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {(person.photoURL || person.photoUrl || person.facePhotoURL || person.facePhotoUrl) ? (
                            <img src={person.photoURL || person.photoUrl || person.facePhotoURL || person.facePhotoUrl} alt={staffName} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${activeTab === 'staff_attendance' ? 'bg-sky-100 text-sky-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {(staffName || 'U').charAt(0)}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-sidebar block">{staffName}</span>
                            {/* No student_attendance ROLL display needed */}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {activeTab === 'staff_attendance' ? (
                          <span className="px-3 py-1 bg-neutral-100 rounded-md text-xs font-bold text-neutral-600 capitalize">
                            {person.role?.replace(/_/g, ' ') || 'Staff'}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-neutral-500">
                            {classes.find(c => c.id === person.classId)?.name || 'N/A'} - {batches.find(b => b.id === person.batchId)?.name || 'N/A'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-neutral-600">
                        {(() => {
                          const record = attendanceRecords.find(a => a.userId === person.uid || a.studentId === person.uid);
                          if (!record?.timestamp) return 'N/A';
                          
                          const checkInDate = new Date(record.timestamp);
                          const checkInTime = format(checkInDate, 'hh:mm a');
                          
                          // Check for lateness
                          const batch = batches.find(b => b.id === person.batchId);
                          let isLate = false;
                          if (batch?.startTime) {
                            const [sHour, sMin] = batch.startTime.split(':').map(Number);
                            const shiftStart = new Date(checkInDate);
                            shiftStart.setHours(sHour, sMin, 0, 0);
                            isLate = checkInDate > shiftStart;
                          }

                          return (
                            <span className={isLate ? 'text-rose-600 font-bold' : 'text-neutral-600'}>
                              {checkInTime}
                              {isLate && <span className="ml-1 text-[10px] uppercase"> (Late)</span>}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {status === 'not_started' ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 bg-neutral-100 text-neutral-500">
                            🔒 NOT STARTED
                          </span>
                        ) : status === 'holiday' ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 bg-amber-100 text-amber-700">
                            <Calendar className="w-3.5 h-3.5" />
                            HOLIDAY
                          </span>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                            status === 'present' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {status === 'present' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {status.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startFaceReg(person)}
                            className={`p-2 rounded-xl transition-all ${(person.biometricVerified === true || !!person.awsExternalImageId || !!person.faceDescriptor) ? 'bg-amber-50 text-amber-600' : 'bg-neutral-100 text-neutral-400 hover:bg-amber-100 hover:text-amber-600'}`}
                            title={(person.biometricVerified === true || !!person.awsExternalImageId || !!person.faceDescriptor) ? "Update Face ID" : "Register Face ID"}
                          >
                            <Camera className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleMarkStaffAttendance(person.uid, 'present')}
                            disabled={isSelectedDateHoliday}
                            className={`p-2 rounded-xl transition-all ${
                              status === 'present' 
                                ? 'bg-emerald-500 text-white shadow-md' 
                                : isSelectedDateHoliday
                                ? 'bg-neutral-50 text-neutral-300 cursor-not-allowed'
                                : 'bg-neutral-100 text-neutral-400 hover:bg-emerald-100 hover:text-emerald-600'
                            }`}
                            title={isSelectedDateHoliday ? "Disabled on Holiday" : "Mark Present"}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleMarkStaffAttendance(person.uid, 'absent')}
                            disabled={isSelectedDateHoliday}
                            className={`p-2 rounded-xl transition-all ${
                              status === 'absent' 
                                ? 'bg-rose-500 text-white shadow-md' 
                                : isSelectedDateHoliday
                                ? 'bg-neutral-50 text-neutral-300 cursor-not-allowed'
                                : 'bg-neutral-100 text-neutral-400 hover:bg-rose-100 hover:text-rose-600'
                            }`}
                            title={isSelectedDateHoliday ? "Disabled on Holiday" : "Mark Absent"}
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'student_permissions' ? (
        <div className="space-y-6">
          <div className="flex flex-col xl:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-neutral-200">
            <div className="flex-1 w-full flex flex-col sm:flex-row flex-wrap gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search students to grant permission..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                />
              </div>
              <div className="w-full sm:w-auto flex gap-4">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold text-neutral-700"
                >
                  <option value="all">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold text-neutral-700"
                >
                  <option value="all">All Batches</option>
                  {batches.filter(b => selectedClassId === 'all' || b.classId === selectedClassId).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-auto">
                <input 
                  type="date"
                  value={selectedDateStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      setSelectedDate(new Date(year, month - 1, day));
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold text-neutral-700"
                />
              </div>
              <div className="w-full sm:w-auto flex items-center gap-2 bg-indigo-50/50 px-4 py-2 border border-indigo-100 rounded-xl">
                <Printer className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-xs font-black text-indigo-700 uppercase tracking-wider font-sans whitespace-nowrap">Paper Size:</span>
                <select
                  value={printPaperSize}
                  onChange={(e) => handlePaperSizeChange(e.target.value as any)}
                  className="bg-transparent focus:outline-none text-xs font-bold text-indigo-800 hover:text-indigo-900 transition-colors cursor-pointer"
                >
                  <option value="2in">2" Thermal Slip</option>
                  <option value="3in">3" Periperi / Thermal Slip</option>
                  <option value="a5">A5 Leaflet / Page</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowPrinterHint(true)}
                  className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 underline ml-1 cursor-pointer tracking-wider shrink-0"
                  title="Configure 3-inch Periperi thermal printer connection"
                >
                  Setup
                </button>
                <span className="text-neutral-300">|</span>
                <button
                  type="button"
                  onClick={handleTestPrint}
                  className="text-[9px] font-black uppercase text-emerald-600 hover:text-emerald-850 underline cursor-pointer tracking-wider shrink-0"
                  title="Run a test print to verify thermal connection and alignment"
                >
                  Test Print
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowKiosk(true)}
              className="w-full xl:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
            >
              <Camera className="w-5 h-5" />
              Smart Camera Kiosk
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Student</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Class/Batch</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Today's Permissions</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredStudents.map((student) => {
                    const studentPerms = permissionsRecords.filter(p => p.studentId === student.uid);
                    const studentName = getPersonDisplayName(student);

                    return (
                    <tr key={student.uid} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {(student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl) ? (
                            <img src={student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl} alt={studentName} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                              {(studentName || 'U').charAt(0)}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-sidebar block">{studentName}</span>
                            <span className="text-xs text-neutral-400 font-mono">{student.rollNumber || 'N/A'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-neutral-600">
                        {classes.find(c => c.id === student.classId)?.name || 'N/A'} - {batches.find(b => b.id === student.batchId)?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {studentPerms.length > 0 ? studentPerms.map(p => (
                            <span 
                              key={p.id} 
                              onClick={() => setPreviewPermission({ student, permission: p })}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer border border-amber-200 transition-colors"
                              title="Click to preview and print Permission Slip"
                            >
                              {p.type === 'late_entry' ? <LogIn className="w-3 h-3 text-indigo-500" /> : p.type === 'early_leave' ? <LogOut className="w-3 h-3 text-rose-500" /> : <FileText className="w-3 h-3 text-amber-500" />}
                              <span>{p.type.replace('_', ' ')}</span>
                              {p.time && <span className="ml-1 border-l border-amber-300 pl-1.5 font-mono text-neutral-700">{p.time}</span>}
                              <Printer className="w-3.5 h-3.5 ml-1 text-neutral-400 hover:text-indigo-600 transition-colors shrink-0" />
                            </span>
                          )) : (
                            <span className="text-xs text-neutral-400 italic">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startFaceReg(student)}
                            className={`p-2 rounded-xl transition-all ${(student.biometricVerified === true || !!student.awsExternalImageId || !!student.faceDescriptor) ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-neutral-100 text-neutral-400 hover:bg-amber-100 hover:text-amber-600'}`}
                            title={(student.biometricVerified === true || !!student.awsExternalImageId || !!student.faceDescriptor) ? "Update Face ID" : "Register Face ID"}
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenPermission(student)}
                            className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-sm rounded-xl transition-colors inline-flex items-center gap-2"
                          >
                            <FileSignature className="w-4 h-4" />
                            Grant Authorization
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'face_registration' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-between items-start sm:items-center bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm">
            <div className="flex bg-neutral-100 p-1 rounded-xl">
              <button
                onClick={() => setRegType('staff')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                  regType === 'staff' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Staff
              </button>
              <button
                onClick={() => setRegType('student')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                  regType === 'student' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Students
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 flex-1">
              <div className="relative w-full sm:max-w-xs">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder={`Search ${regType}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm"
                />
              </div>

              {regType === 'student' && (
                <div className="flex gap-2">
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-bold text-neutral-700"
                  >
                    <option value="all">All Classes</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    className="px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-bold text-neutral-700"
                  >
                    <option value="all">All Batches</option>
                    {batches.filter(b => selectedClassId === 'all' || b.classId === selectedClassId).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <select
                value={regStatusFilter}
                onChange={(e) => setRegStatusFilter(e.target.value as any)}
                className="px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-bold text-neutral-700"
              >
                <option value="all">All Status</option>
                <option value="registered">Registered Only</option>
                <option value="unregistered">Not Registered</option>
              </select>

              {(isAdmin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'management' || profile?.role === 'principal') && (
                <button
                  type="button"
                  onClick={() => setShowDeleteAllConfirm(true)}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 border border-rose-100 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer md:ml-auto"
                  title="Delete All Face IDs from Firestore database and AWS Rekognition"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  Reset All Biometrics
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-xl border border-neutral-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th 
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500 cursor-pointer hover:bg-neutral-100/60 select-none transition-colors"
                      onClick={() => toggleFaceSort('name')}
                    >
                      <div className="flex items-center gap-1.5 justify-start">
                        <span>Member ({totalFaceMembersCount})</span>
                        <ArrowUpDown className={`w-3.5 h-3.5 transition-colors ${faceSortField === 'name' ? 'text-indigo-600' : 'text-neutral-400'}`} />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500 cursor-pointer hover:bg-neutral-100/60 select-none transition-colors"
                      onClick={() => toggleFaceSort('contact')}
                    >
                      <div className="flex items-center gap-1.5 justify-start">
                        <span>Contact / Roll</span>
                        <ArrowUpDown className={`w-3.5 h-3.5 transition-colors ${faceSortField === 'contact' ? 'text-indigo-600' : 'text-neutral-400'}`} />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500 cursor-pointer hover:bg-neutral-100/60 select-none transition-colors"
                      onClick={() => toggleFaceSort('status')}
                    >
                      <div className="flex items-center gap-1.5 justify-start">
                        <span>Face ID Status</span>
                        <ArrowUpDown className={`w-3.5 h-3.5 transition-colors ${faceSortField === 'status' ? 'text-indigo-600' : 'text-neutral-400'}`} />
                      </div>
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {faceRegMembers.map((member) => {
                    const memberName = getPersonDisplayName(member);
                    return (
                    <tr key={member.uid} className="hover:bg-neutral-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          {(member.photoURL || member.photoUrl || member.facePhotoURL || member.facePhotoUrl) ? (
                            <img src={member.photoURL || member.photoUrl || member.facePhotoURL || member.facePhotoUrl} alt={memberName} className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black">
                              {(memberName || 'U').charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-black text-neutral-900">{memberName}</p>
                            <p className="text-xs text-neutral-500 font-bold uppercase">{member.role?.replace(/_/g, ' ') || (regType === 'staff' ? 'Staff' : 'Student')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-neutral-600">
                        {member.phone || member.rollNumber || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        {(member.biometricVerified === true || !!member.awsExternalImageId || !!member.faceDescriptor) ? (
                          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 w-fit">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Registered
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-neutral-50 text-neutral-400 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 w-fit">
                            <AlertCircle className="w-3.5 h-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startFaceReg(member)}
                            className={`p-2 rounded-xl transition-all shadow-sm ${
                              (member.biometricVerified === true || !!member.awsExternalImageId || !!member.faceDescriptor) 
                                ? 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100' 
                                : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600'
                            }`}
                            title="Register / Update Face ID"
                          >
                            <Camera className="w-5 h-5" />
                          </button>
                          {(isAdmin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'management' || profile?.role === 'principal') && (member.biometricVerified === true || !!member.awsExternalImageId || !!member.faceDescriptor) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFaceID(member);
                              }}
                              className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 border border-rose-100 transition-all cursor-pointer relative z-10"
                              title="Delete Face ID"
                            >
                              <Trash2 className="w-5 h-5 pointer-events-none" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                  {faceRegMembers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Search className="w-10 h-10 text-neutral-200" />
                          <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">No members found matching filters</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider">
                Showing {totalFaceMembersCount === 0 ? 0 : (currentPage - 1) * 50 + 1} to {Math.min(currentPage * 50, totalFaceMembersCount)} of {totalFaceMembersCount} entries
              </p>
              {(() => {
                const totalPages = Math.ceil(totalFaceMembersCount / 50) || 1;
                if (totalPages <= 1) return null;
                return (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`px-3 py-1 bg-white text-[10px] font-black uppercase tracking-widest border border-neutral-200 rounded-lg transition-all ${
                        currentPage === 1 
                          ? 'opacity-40 cursor-not-allowed text-neutral-400' 
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Prev
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        const isNear = Math.abs(page - currentPage) <= 1;
                        const isEdge = page === 1 || page === totalPages;
                        if (!isNear && !isEdge) {
                          if (page === 2 || page === totalPages - 1) {
                            return <span key={page} className="px-1 text-neutral-400 text-xs font-black select-none">...</span>;
                          }
                          return null;
                        }
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-7 h-7 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                              currentPage === page
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-neutral-600 hover:bg-neutral-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className={`px-3 py-1 bg-white text-[10px] font-black uppercase tracking-widest border border-neutral-200 rounded-lg transition-all ${
                        currentPage === totalPages 
                          ? 'opacity-40 cursor-not-allowed text-neutral-400' 
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>


        </div>
      )}

      {/* Permission Modal */}
      <AnimatePresence>
        {showPermissionModal && selectedStudent && (
          <PermissionModal 
            student={selectedStudent} 
            dateStr={selectedDateStr}
            onClose={() => setShowPermissionModal(false)}
            onSave={async (data) => {
              if (!profile?.uid) {
                toast.error('Authentication error. Please re-login.');
                return;
              }
              const studentDisplayName = getPersonDisplayName(selectedStudent);
              const granterDisplayName = profile ? getPersonDisplayName(profile) : 'School Admin';
              try {
                // Client-side guard check for duplicate permission today
                const alreadyHasPermission = permissionsRecords.some(p => p.studentId === selectedStudent.uid);
                if (alreadyHasPermission) {
                  toast.error(`Already permission taken for student ${studentDisplayName} today.`);
                  return;
                }

                // Use our secure, privileged backend API to bypass restrictive server-side security rules on student_permissions write
                const res = await fetch('/api/attendance/student-permission', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    studentId: selectedStudent.uid,
                    date: selectedDateStr,
                    type: data.type || 'outpass',
                    reason: data.reason || '',
                    time: data.time || '',
                    grantedBy: granterDisplayName,
                    parentPhone: selectedStudent.parentPhone || selectedStudent.whatsappNumber || selectedStudent.phone || selectedStudent.guardianPhone || null,
                    alertMessage: `Dear Parent, your ward ${studentDisplayName} has been granted Outpass for: ${data.reason || ''} at ${data.time || ''} on ${selectedDateStr}.`
                  })
                });

                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.error || 'Server permission grant failed');
                }

                const resData = await res.json();
                const waStatus = resData.waStatus;

                fetchData();
                setShowPermissionModal(false);
                
                const tempPerm = {
                  id: resData.docId || `temp_${Date.now()}`,
                  studentId: selectedStudent.uid,
                  date: selectedDateStr,
                  type: data.type || 'outpass',
                  reason: data.reason || `Authorized ${(data.type || 'outpass').replace('_', ' ')}`,
                  time: data.time || format(new Date(), 'HH:mm'),
                  grantedBy: granterDisplayName,
                };

                if (waStatus === 'missing_phone') {
                  toast.success('Authorization granted, but parent phone was missing.');
                } else if (waStatus === 'invalid_phone') {
                  toast.success('Authorization granted, but parent phone was invalid.');
                } else if (waStatus === 'duplicate_skipped') {
                  toast.success('Authorization granted (duplicate parent alert blocked).');
                } else {
                  toast.success('Authorization granted and alert queued.');
                }

                handlePrintSlip(selectedStudent, tempPerm);
              } catch (e: any) {
                console.error('Permission error:', e);
                toast.error(e.message || 'Failed to grant authorization. Access denied.');
              }
            }}
          />
        )}
      </AnimatePresence>

      {showKiosk && (
        <SmartKioskModal
          isOpen={showKiosk}
          onClose={() => setShowKiosk(false)}
          people={
            activeTab === 'staff_attendance'
              ? staff
              : activeTab === 'face_registration' && regType === 'staff'
              ? staff
              : students
          }
          mode={
            activeTab === 'staff_attendance'
              ? 'staff_attendance'
              : activeTab === 'face_registration' && regType === 'staff'
              ? 'staff_attendance'
              : 'student_permission'
          }
          onIdentifySuccess={handleKioskSuccess}
          onSyncBiometrics={() => fetchData(true)}
        />
      )}

      {showFaceReg && personForReg && (
        <FaceRegistrationModal
          isOpen={showFaceReg}
          onClose={() => setShowFaceReg(false)}
          person={personForReg}
          onSuccess={() => fetchData()}
          collectionName={regType === 'staff' ? 'staff' : 'students'}
        />
      )}

      <AnimatePresence>
        {showExportModal && (
          <ExportReportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            onExport={handleExportData}
            activeTab={activeTab}
            selectedDate={selectedDate}
          />
        )}
      </AnimatePresence>

      {/* Face ID Deletion Confirmation Modal */}
      <AnimatePresence>
        {faceToDelete && (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full border border-neutral-100 shadow-xl flex flex-col gap-4 text-center"
            >
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto text-2xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-black text-neutral-900">Delete Face ID</h3>
                <p className="text-sm text-neutral-500 mt-2">
                  Are you sure you want to delete the registered Face ID for <strong className="text-neutral-900">{getPersonDisplayName(faceToDelete)}</strong>?
                </p>
                <p className="text-xs text-rose-500 font-bold uppercase mt-1">This action cannot be undone and will require re-registration.</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setFaceToDelete(null)}
                  className="flex-1 py-3 px-4 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 rounded-2xl font-black text-sm transition-all border border-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteFaceID}
                  className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-sm transition-all shadow-md shadow-rose-100 cursor-pointer"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset All Biometrics Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAllConfirm && (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full border border-neutral-100 shadow-xl flex flex-col gap-4 text-center"
            >
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto text-3xl font-black">
                🚨
              </div>
              <div>
                <h3 className="text-xl font-black text-rose-600 uppercase tracking-tight">Reset All Biometrics</h3>
                <p className="text-sm text-neutral-600 mt-2">
                  Are you sure you want to delete <strong className="text-neutral-900">ALL Face ID registrations</strong> from the system?
                </p>
                <p className="text-xs text-rose-500 font-bold uppercase mt-2 leading-relaxed">
                  This will completely clear biometric fields for ALL students, teachers, and staff members from Firestore, and reset your AWS Rekognition collection. All users will have to re-register their Face ID.
                </p>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteAllConfirm(false)}
                  className="flex-1 py-3 px-4 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 rounded-2xl font-black text-sm transition-all border border-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteAllFaceIDs}
                  className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-2xl font-black text-sm transition-all shadow-md shadow-rose-100 cursor-pointer"
                >
                  Yes, Reset All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* On-Screen Outpass Permission Slip Preview Modal */}
      <AnimatePresence>
        {previewPermission && (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-800 text-white rounded-[2.5rem] max-w-sm w-full p-6 shadow-2xl border border-neutral-700/60 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-neutral-700 pb-3">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-neutral-100">Permission Slip Preview</h3>
                    <p className="text-[9px] text-neutral-400 font-bold uppercase">Device Connection &amp; Layout Review</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewPermission(null)}
                  className="p-1.5 hover:bg-neutral-700 rounded-full transition-colors text-neutral-400 hover:text-neutral-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Live Preview Paper Selector Segment */}
              <div className="flex items-center justify-between bg-neutral-900/50 p-2.5 rounded-2xl border border-neutral-700">
                <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Layout Preset:</span>
                <div className="flex bg-neutral-800 rounded-lg p-0.5 gap-0.5 animate-pulse">
                  {(['2in', '3in', 'a5'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handlePaperSizeChange(size)}
                      className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${
                        printPaperSize === size 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {size === '2in' ? '2" Slip' : size === '3in' ? '3" Slip' : 'A5 Sheet'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Styled Ticket Preview Mock on Screen */}
              <div className="flex justify-center bg-neutral-900 p-6 rounded-[2rem] border border-neutral-700/50 overflow-hidden relative min-h-[300px]">
                <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
                
                {/* Simulated Slip */}
                <div 
                  className="bg-white text-black p-3.5 font-sans shadow-xl rounded-md transition-all text-left flex flex-col justify-between select-none"
                  style={{
                    width: printPaperSize === '2in' ? '1.9in' : printPaperSize === '3in' ? '76.2mm' : '138mm', 
                    height: printPaperSize === '2in' ? 'auto' : printPaperSize === '3in' ? '3in' : '195mm', 
                    fontSize: printPaperSize === '2in' ? '9px' : printPaperSize === '3in' ? '11px' : '13px',
                    lineHeight: printPaperSize === '2in' ? '1.15' : printPaperSize === '3in' ? '1.2' : '1.4',
                  }}
                >
                  <div className="flex flex-col justify-between h-full w-full">
                    {/* Official Double Border Title Header for 3-inch or general */}
                    <div className="border-t border-b-2 py-0.5 mb-1 border-black flex flex-col items-center justify-center text-center">
                      <p className="font-sans font-black uppercase tracking-tight text-neutral-900 leading-none text-[13px]">
                        {settings.schoolName || "St. Antony's School"}
                      </p>
                      <p className="font-sans font-black text-[10px] uppercase tracking-wider text-indigo-700 leading-none mt-1">
                        OFFICIAL {previewPermission.permission.type?.replace('_', ' ')} PASS
                      </p>
                    </div>

                    {/* Date/Time Row with dashed separation */}
                    <div className="flex justify-between border-b border-black border-dashed pb-0.5 mb-1 text-[10px] font-bold text-neutral-800">
                      <span>DATE: {previewPermission.permission.date || new Date().toLocaleDateString()}</span>
                      <span>TIME: {previewPermission.permission.time || 'N/A'}</span>
                    </div>

                    {/* Full-width Name Section above Photo and secondary details */}
                    <div className="space-y-0.5 mb-1.5 pb-1 border-b border-black border-dashed font-sans">
                      <div className="flex flex-row items-baseline gap-1.5">
                        <span className="text-[10px] font-black uppercase text-neutral-400 shrink-0">STUDENT:</span>
                        <span className="font-sans font-black uppercase text-neutral-900 text-[15.5px] leading-none break-words flex-1">
                          {previewPermission?.student ? getPersonDisplayName(previewPermission.student) : ''}
                        </span>
                      </div>
                      <div className="flex flex-row items-baseline gap-1.5">
                        <span className="text-[9px] font-black uppercase text-neutral-400 shrink-0">FATHER:</span>
                        <span className="font-sans font-bold uppercase text-neutral-800 text-[12.5px] leading-none break-words flex-1">
                          {previewPermission?.student?.fatherName || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Secondary Details & Large Photo side-by-side */}
                    <div className="flex gap-2.5 items-center justify-between flex-1 min-h-0 w-full mb-0.5">
                      <div className="flex-1 space-y-2 min-w-0">
                        <div>
                          <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block mb-0 leading-none">Class / Section</span>
                          <span className="font-black block text-neutral-850 text-[12px] leading-none truncate">
                            {classes.find(c => c.id === previewPermission?.student?.classId)?.name || 'N/A'} - {batches.find(b => b.id === previewPermission?.student?.batchId)?.name || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block mb-0 leading-none">Roll / Admission ID</span>
                          <span className="block text-neutral-850 font-bold text-[11px] leading-none truncate">
                            R: {previewPermission?.student?.rollNumber || 'N/A'} / A: {previewPermission?.student?.admissionNumber || 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Photo Container: Very Big Size */}
                      <div className="shrink-0">
                        {(previewPermission?.student?.presentPhotoURL || previewPermission?.student?.photoURL || previewPermission?.student?.photoUrl || previewPermission?.student?.facePhotoURL || previewPermission?.student?.facePhotoUrl) ? (
                          <img 
                            src={previewPermission?.student?.presentPhotoURL || previewPermission?.student?.photoURL || previewPermission?.student?.photoUrl || previewPermission?.student?.facePhotoURL || previewPermission?.student?.facePhotoUrl} 
                            alt={previewPermission?.student ? getPersonDisplayName(previewPermission.student) : ''} 
                            className="w-24 h-24 object-cover rounded border border-black shrink-0 shadow-sm"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-24 h-24 bg-neutral-100 border border-dashed border-neutral-400 rounded flex flex-col items-center justify-center text-[9px] text-neutral-400 font-bold uppercase text-center leading-none select-none shrink-0">
                            <span>No Photo</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="border-t border-black border-dashed pt-1 mt-1 mb-0.5 text-left w-full">
                      <div className="flex items-start gap-1">
                        <span className="font-bold text-[9px] uppercase tracking-wider text-neutral-400 whitespace-nowrap leading-none mt-0.5">Reason:</span>
                        <p className="italic text-[11px] font-semibold leading-tight text-neutral-800 line-clamp-2">{previewPermission.permission.reason || 'Authorized Outpass Outward'}</p>
                      </div>
                    </div>

                    {/* Approved By & Footer info */}
                    <div className="flex justify-between items-end mt-1 pt-1 border-t-2 border-solid border-black w-full text-[10px]">
                      <div className="flex flex-col text-left">
                        <span className="text-neutral-500 text-[7px] uppercase tracking-wider leading-none">Granted By:</span>
                        <span className="font-black uppercase text-neutral-900 leading-tight text-[11px]">{getAuthorizedByName(previewPermission.permission.grantedBy)}</span>
                      </div>
                      <div className="text-[8px] font-black uppercase text-neutral-800 tracking-wider text-right leading-none">
                        GATEPASS VALID SIGN
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Configure, Print, Close */}
              <div className="flex flex-col gap-2 mt-1">
                <button
                  onClick={() => {
                    window.focus();
                    const originalTitle = document.title;
                    document.title = "Permission Slip";
                    window.print();
                    document.title = originalTitle;
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[11px] uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-indigo-100 shrink-0" />
                  Give Command to Printer
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setShowPrinterHint(true);
                      setPreviewPermission(null);
                    }}
                    className="py-2.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border border-neutral-600 text-center"
                  >
                    Setup Guide
                  </button>
                  <button
                    onClick={() => setPreviewPermission(null)}
                    className="py-2.5 bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-neutral-200 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all text-center"
                  >
                    Cancel
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
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 text-xs text-neutral-600 font-sans leading-relaxed">
              <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 text-indigo-800 font-medium">
                This school ERP web application generates raw ESC/POS-compatible 3-inch thermal permission slips (80mm width) directly from your screen layout. Follow the device instructions below.
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
                  <li>Open the web system, select <strong>"Print"</strong>, and choose your thermal printer from the destination list.</li>
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
       {/* 2-inch, 3-inch, and A5 Student Permission Slip Printer Stylesheet & Container */}
      <style>{`
        @media screen {
          .thermal-print-container {
            display: none !important;
          }
        }
        @media print {
          /* Hide absolute everything on the screen first */
          body * {
            visibility: hidden !important;
          }
          /* Make only the thermal print container and all its descendents visible */
          .thermal-print-container,
          .thermal-print-container * {
            visibility: visible !important;
          }
          /* Position absolutely at top-left with zero margins to fit receipt paper perfectly */
          .thermal-print-container {
            display: flex !important;
            flex-direction: column !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            background: white !important;
            color: black !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            transform-origin: top left !important;
            
            ${printPaperSize === '2in' ? `
              width: 1.9in !important;
              max-width: 1.9in !important;
              padding: 2px !important;
              font-family: 'Courier New', Courier, monospace !important;
              font-size: 8.5px !important;
              line-height: 1.2 !important;
            ` : ''}
            
            ${printPaperSize === '3in' ? `
              width: 76.2mm !important;
              max-width: 76.2mm !important;
              height: 3in !important;
              max-height: 3in !important;
              padding: 2mm 3mm !important;
              font-family: Arial, Helvetica, sans-serif !important;
              font-size: 10.5px !important;
              line-height: 1.15 !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
            ` : ''}

            ${printPaperSize === 'a5' ? `
              width: 138mm !important;
              max-width: 138mm !important;
              min-height: 195mm !important;
              padding: 10mm !important;
              font-family: Arial, Helvetica, sans-serif !important;
              font-size: 13px !important;
              line-height: 1.5 !important;
              border: 1px solid #000000;
              border-radius: 8px;
            ` : ''}
          }
          
          @page {
            ${printPaperSize === '2in' ? `
              size: 58mm auto;
              margin: 0;
            ` : ''}
            ${printPaperSize === '3in' ? `
              size: 76.2mm 3in !important;
              margin: 0 !important;
            ` : ''}
            ${printPaperSize === 'a5' ? `
              size: A5 portrait;
              margin: 4mm;
            ` : ''}
          }

          /* Ensure images and borders print properly */
          img {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .border-dashed {
            border-style: dashed !important;
          }
        }
      `}</style>

      {(printingPermission || previewPermission) && (() => {
        const currentPrint = printingPermission || previewPermission;
        if (!currentPrint) return null;
        return (
          <div className="thermal-print-container">
            {/* School Header & Card container styled to match preview exactly */}
            <div className="flex flex-col justify-between h-full w-full bg-white text-black text-left font-sans select-none">
              
              {/* Official Double Border Title Header for 3-inch or general */}
              <div className="border-t border-b-2 py-0.5 mb-1 border-black flex flex-col items-center justify-center text-center">
                <p className="font-sans font-black uppercase tracking-tight text-neutral-900 leading-none text-[13px]">
                  {settings.schoolName || "St. Antony's School"}
                </p>
                <p className="font-sans font-black text-[10px] uppercase tracking-wider text-indigo-700 leading-none mt-1">
                  OFFICIAL {currentPrint.permission.type?.replace('_', ' ')} PASS
                </p>
              </div>

              {/* Date/Time Row with dashed separation */}
              <div className="flex justify-between border-b border-black border-dashed pb-0.5 mb-1 text-[10px] font-bold text-neutral-800">
                <span>DATE: {currentPrint.permission.date}</span>
                <span>TIME: {currentPrint.permission.time}</span>
              </div>

              {/* Full-width Name Section above Photo and secondary details */}
              <div className="space-y-0.5 mb-1.5 pb-1 border-b border-black border-dashed font-sans">
                <div className="flex flex-row items-baseline gap-1.5">
                  <span className="text-[10px] font-black uppercase text-neutral-400 shrink-0">STUDENT:</span>
                  <span className="font-sans font-black uppercase text-neutral-900 text-[15.5px] leading-none break-words flex-1">
                    {currentPrint?.student ? getPersonDisplayName(currentPrint.student) : ''}
                  </span>
                </div>
                <div className="flex flex-row items-baseline gap-1.5">
                  <span className="text-[9px] font-black uppercase text-neutral-400 shrink-0">FATHER:</span>
                  <span className="font-sans font-bold uppercase text-neutral-800 text-[12.5px] leading-none break-words flex-1">
                    {currentPrint?.student?.fatherName || currentPrint?.student?.motherName || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Secondary Details & Large Photo side-by-side */}
              <div className="flex gap-2.5 items-center justify-between flex-1 min-h-0 w-full mb-0.5">
                <div className="flex-1 space-y-2 min-w-0">
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block mb-0 leading-none">Class / Section</span>
                    <span className="font-black block text-neutral-800 text-[12px] leading-none truncate">
                      {classes.find((c: any) => c.id === currentPrint?.student?.classId)?.name || 'N/A'} - {batches.find((b: any) => b.id === currentPrint?.student?.batchId)?.name || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block mb-0 leading-none">Roll / Admission ID</span>
                    <span className="block text-neutral-800 font-bold text-[11px] leading-none truncate font-mono">
                      R: {currentPrint?.student?.rollNumber || 'N/A'} / A: {currentPrint?.student?.admissionNumber || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Photo Container: Very Big Size */}
                <div className="shrink-0">
                  {(currentPrint?.student?.presentPhotoURL || currentPrint?.student?.photoURL || currentPrint?.student?.photoUrl || currentPrint?.student?.facePhotoURL || currentPrint?.student?.facePhotoUrl) ? (
                    <img 
                      src={currentPrint?.student?.presentPhotoURL || currentPrint?.student?.photoURL || currentPrint?.student?.photoUrl || currentPrint?.student?.facePhotoURL || currentPrint?.student?.facePhotoUrl} 
                      alt={currentPrint?.student ? getPersonDisplayName(currentPrint.student) : ''} 
                      className="w-24 h-24 object-cover rounded border border-black shrink-0 shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-neutral-100 border border-dashed border-neutral-400 rounded flex flex-col items-center justify-center text-[9px] text-neutral-400 font-bold uppercase text-center leading-none select-none shrink-0">
                      <span>No Photo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="border-t border-black border-dashed pt-1 mt-1 mb-0.5 text-left w-full">
                <div className="flex items-start gap-1">
                  <span className="font-bold text-[9px] uppercase tracking-wider text-neutral-400 whitespace-nowrap leading-none mt-0.5">Reason:</span>
                  <p className="italic text-[11px] font-semibold leading-tight text-neutral-800 line-clamp-2">{currentPrint.permission.reason || 'Authorized Outpass Outward'}</p>
                </div>
              </div>

              {/* Approved By & Footer info */}
              <div className="flex justify-between items-end mt-1 pt-1 border-t-2 border-solid border-black w-full text-[10px]">
                <div className="flex flex-col text-left">
                  <span className="text-neutral-500 text-[7px] uppercase tracking-wider leading-none">Granted By:</span>
                  <span className="font-black uppercase text-neutral-900 leading-tight text-[11px]">{getAuthorizedByName(currentPrint.permission.grantedBy)}</span>
                </div>
                <div className="text-[8px] font-black uppercase text-neutral-800 tracking-wider text-right leading-none">
                  GATEPASS VALID SIGN
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ExportReportModal({ isOpen, onClose, onExport, activeTab, selectedDate }: any) {
  const [range, setRange] = useState<'day' | 'month' | 'year'>('day');

  const title = activeTab === 'staff_attendance' ? 'Staff Attendance' : 'Student Permissions';
  const color = activeTab === 'staff_attendance' ? 'sky' : 'indigo';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-sidebar/60 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-[2.5rem] shadow-2xl relative w-full max-w-md overflow-hidden z-10 border border-neutral-100"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-black text-sidebar tracking-tight">Export Report</h2>
              <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest mt-1">{title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: 'day', label: 'Day Wise', desc: `Report for ${format(selectedDate, 'PP')}`, icon: Calendar },
                { id: 'month', label: 'Month Wise', desc: `Report for ${format(selectedDate, 'MMMM yyyy')}`, icon: Clock },
                { id: 'year', label: 'Academic Year', desc: `Full Year Report (${format(selectedDate, 'yyyy')})`, icon: TrendingUp }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setRange(option.id as any)}
                  className={`flex items-center gap-4 p-5 rounded-3xl border-2 transition-all text-left group ${
                    range === option.id 
                      ? `border-${color}-500 bg-${color}-50` 
                      : 'border-neutral-100 hover:border-neutral-200'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                    range === option.id ? `bg-${color}-500 text-white` : 'bg-neutral-100 text-neutral-400 group-hover:bg-neutral-200'
                  }`}>
                    <option.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className={`font-black ${range === option.id ? `text-${color}-900` : 'text-neutral-700'}`}>{option.label}</p>
                    <p className="text-xs font-bold text-neutral-400 uppercase mt-0.5">{option.desc}</p>
                  </div>
                  {range === option.id && (
                    <div className={`ml-auto w-6 h-6 rounded-full bg-${color}-500 flex items-center justify-center text-white`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="pt-6 border-t border-neutral-100">
              <button
                onClick={() => onExport(range)}
                className={`w-full py-4 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'staff_attendance' 
                    ? 'bg-sky-500 hover:bg-sky-600 shadow-sky-100' 
                    : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-100'
                }`}
              >
                <Download className="w-5 h-5" />
                Generate PDF Report
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PermissionModal({ student, dateStr, onClose, onSave }: any) {
  const [type, setType] = useState('late_entry');
  const [reason, setReason] = useState('');
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-sidebar/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2rem] shadow-2xl relative w-full max-w-md overflow-hidden z-10"
      >
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-sidebar tracking-tight">Grant Authorization</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6 flex items-center gap-4 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
            {(student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl) ? (
              <img src={student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl} alt={getPersonDisplayName(student)} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                {(getPersonDisplayName(student) || 'U').charAt(0)}
              </div>
            )}
            <div>
              <p className="font-bold text-sidebar">{getPersonDisplayName(student)}</p>
              <p className="text-sm font-mono text-neutral-500">{student.rollNumber || 'N/A'}</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-sm font-bold text-neutral-700 block mb-2">Authorization Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('late_entry')}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 ${
                    type === 'late_entry' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-500'
                  }`}
                >
                  <LogIn className="w-6 h-6" />
                  <span className="font-bold text-sm">Late Entry</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('early_leave')}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 ${
                    type === 'early_leave' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-500'
                  }`}
                >
                  <LogOut className="w-6 h-6" />
                  <span className="font-bold text-sm">Early Leave</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('outpass')}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 col-span-2 ${
                    type === 'outpass' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-500'
                  }`}
                >
                  <FileText className="w-6 h-6" />
                  <span className="font-bold text-sm">Temporary Outpass</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-neutral-700 block mb-2">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold text-neutral-700"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-neutral-700 block mb-2">Reason (Optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter authorized reason..."
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium resize-none h-24"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave({ type, reason: reason || `Authorized ${type.replace('_', ' ')}`, time })}
              disabled={!time}
              className="px-6 py-2.5 rounded-xl font-bold bg-sidebar text-white hover:bg-sidebar/90 transition-colors disabled:opacity-50"
            >
              Grant Authorization
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
