import { useState, useEffect, useRef, type FC, type FormEvent, type ChangeEvent } from 'react';
import { where, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { dbService } from '../services/dbService';
import { safeStorage as localStorage } from '../lib/safeStorage';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { 
  School, 
  Upload, 
  Save, 
  MapPin, 
  Mail, 
  Phone, 
  Globe, 
  User, 
  Calendar, 
  FileCheck,
  FileClock,
  Edit2,
  Trash2,
  Plus,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Layout,
  RefreshCw,
  BookOpen,
  CreditCard,
  MessageSquare,
  Image as ImageIcon,
  Type,
  AlignLeft,
  Settings as SettingsIcon,
  Bot,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Minus,
  Search,
  Wrench,
  AlertCircle,
  Database,
  History,
  Youtube,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import { DataMigration } from '../components/DataMigration';
import { uploadService } from '../services/uploadService';
import { AntonyAiSettingsCard } from '../modules/antonyAiAgent/components/AntonyAiSettingsCard';
import { AntonyAiHealthCard } from '../modules/antonyAiAgent/components/AntonyAiHealthCard';
import { normalizeUrl } from '../lib/utils';
import { deduplicateAndPurgeClashes } from '../services/demoDataPurgeService';
import { AuditTrails } from '../components/AuditTrails';
import { ERPDatabaseFlow } from '../components/ERPDatabaseFlow';

const SchoolSettings: FC = () => {
  const { settings, updateSettings, siteConfig, updateSiteConfig } = useSettings();
  const { hasPermission, isAdmin, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'promotion' | 'landing' | 'rules' | 'templates' | 'diagnostics' | 'audit' | 'aws'>('profile');
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newTemplate, setNewTemplate] = useState({ name: '', event: '', content: '', placeholders: [], isActive: true });
  const [newRule, setNewRule] = useState({ title: '', description: '', category: 'General' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['profile', 'promotion', 'landing', 'rules', 'templates', 'diagnostics', 'audit', 'aws'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'rules') {
      const unsub = dbService.subscribe('rules', [], (data) => {
        if (data.length === 0) {
          // Initialize with default rules if empty
          initializeDefaultRules();
        } else {
          setRules(data.sort((a, b) => (a.order || 0) - (b.order || 0)));
        }
      });
      return () => unsub();
    }

    if (activeTab === 'templates') {
      const unsub = dbService.subscribe('message_templates', [], (data) => {
        if (data.length === 0 && (isAdmin || hasPermission('settings_school'))) {
          initializeDefaultTemplates();
        } else {
          setTemplates(data);
        }
      });
      return () => unsub();
    }
  }, [activeTab]);

  useEffect(() => {
    if (templates.length > 0 && (isAdmin || hasPermission('settings_school'))) {
      const templatesToUpgrade = templates.filter(t => {
        const needsUpgrade = (t.event === 'absent' || t.event === 'fee_reminder' || t.event === 'exam_result') && 
                             (t.content?.includes('Dear Parent') || !t.placeholders?.includes('father_name'));
        return needsUpgrade;
      });

      if (templatesToUpgrade.length > 0) {
        templatesToUpgrade.forEach(async (t) => {
          let newContent = t.content || '';
          newContent = newContent.replace('Dear Parent', 'Dear {{father_name}}');
          const finalPlaceholders = Array.from(new Set([...(t.placeholders || []), 'father_name']));
          
          try {
            await dbService.update('message_templates', t.id, {
              content: newContent,
              placeholders: finalPlaceholders,
              updatedAt: new Date().toISOString()
            });
          } catch (e) {
            console.error('Error auto-upgrading template:', e);
          }
        });
      }
    }
  }, [templates, isAdmin]);

  const initializeDefaultTemplates = async () => {
    const defaults = [
      {
        event: 'absent',
        name: 'Student Absent Alert',
        content: 'Dear {{father_name}}, your child {{student_name}} was absent today ({{date}}). Please provide a valid reason. Regards, {{school_name}}.',
        placeholders: ['student_name', 'father_name', 'date', 'school_name'],
        isActive: true,
        updatedAt: new Date().toISOString()
      },
      {
        event: 'fee_reminder',
        name: 'Fee Due Reminder',
        content: 'Dear {{father_name}}, this is a friendly reminder that the fee for {{student_name}} is due. Amount: ₹{{amount}}. Please ignore if already paid. {{school_name}}.',
        placeholders: ['student_name', 'father_name', 'amount', 'school_name'],
        isActive: true,
        updatedAt: new Date().toISOString()
      },
      {
        event: 'fee_receipt',
        name: 'Fee Payment Receipt',
        content: 'Dear Parent, fee payment of ₹{{amount}} for {{student_name}} has been received via {{method}} for {{component}}. Reference: {{reference}}. Balance due: ₹{{due_fee}}. {{school_name}}.',
        placeholders: ['student_name', 'amount', 'method', 'component', 'reference', 'due_fee', 'school_name'],
        isActive: true,
        updatedAt: new Date().toISOString()
      },
      {
        event: 'attendance_summary',
        name: 'Daily Attendance Report',
        content: 'Hello, here is the attendance summary for {{class_name}} for {{date}}: Present: {{present_count}}, Absent: {{absent_count}}. Regards, {{school_name}}.',
        placeholders: ['class_name', 'date', 'present_count', 'absent_count', 'school_name'],
        isActive: true,
        updatedAt: new Date().toISOString()
      },
      {
        event: 'exam_result',
        name: 'Exam Result Alert',
        content: 'Dear {{father_name}}, the results for {{exam_name}} have been published. {{student_name}} (Roll No: {{roll_number}}) scored {{total_obtained}}/{{total_max}} with percentage {{percentage}}% and status {{status}}.\n\nSubject-wise details:\n{{subject_marks}}\n\nRegards, {{school_name}}.',
        placeholders: ['student_name', 'father_name', 'exam_name', 'roll_number', 'total_obtained', 'total_max', 'percentage', 'status', 'subject_marks', 'school_name'],
        isActive: true,
        updatedAt: new Date().toISOString()
      },
      {
        event: 'exam_schedule',
        name: 'Exam Schedule Alert',
        content: 'Dear Parent, the exam schedule for {{exam_name}} has been released for Class {{class_name}} (Section {{section_name}}). Timetable:\n{{schedule_details}}\nRegards, {{school_name}}.',
        placeholders: ['exam_name', 'class_name', 'section_name', 'schedule_details', 'school_name'],
        isActive: true,
        updatedAt: new Date().toISOString()
      }
    ];

    for (const template of defaults) {
      const customId = template.name.trim().replace(/\s+/g, '_');
      await dbService.create('message_templates', customId, template);
    }
  };

  const handleUpdateTemplate = async (id: string, updates: any) => {
    try {
      const content = updates.content || '';
      // Extract placeholders like {{name}}
      const foundPlaceholders = Array.from(content.matchAll(/\{\{(.*?)\}\}/g)).map(m => (m as any)[1].trim());
      
      const finalUpdates = {
        ...updates,
        placeholders: Array.from(new Set([...(updates.placeholders || []), ...foundPlaceholders])),
        updatedAt: new Date().toISOString()
      };

      if (!id || id === 'new') {
         const customId = finalUpdates.name.trim().replace(/\s+/g, '_');
         await dbService.create('message_templates', customId, finalUpdates);
         toast.success("Template created successfully");
      } else {
        await dbService.update('message_templates', id, finalUpdates);
        toast.success("Template updated successfully");
      }
    } catch (error) {
      toast.error("Failed to update template");
    }
  };

  const initializeDefaultRules = async () => {
    const defaults = [
      { 
        title: 'Attendance Protocols', 
        description: 'Student Leaves: Approved leave requests automatically mark students as ABSENT. Staff Leaves: Approved staff leaves are automatically recorded as LEAVE status in attendance.',
        iconType: 'attendance',
        category: 'Academic',
        order: 1
      },
      { 
        title: 'Academic Promotion', 
        description: 'Fee Carry Forward: Any pending fee balances from the previous academic year are automatically carried forward as "Old Fee" when a student is promoted.',
        iconType: 'promotion',
        category: 'Academic',
        order: 2
      },
      { 
        title: 'Staff Leave Quotas', 
        description: 'Casual Leave: Staff limited to 1 CL per month. Teacher Quota: Only 3 teachers allowed on leave per day (4th applicant rejected automatically).',
        iconType: 'leave',
        category: 'HR & Payroll',
        order: 3
      },
      { 
        title: 'Holiday Policy', 
        description: 'If a month has more than 10 general or festival holidays, no Casual Leaves (CL) will be permitted for that month for any staff member.',
        iconType: 'holiday',
        category: 'HR & Payroll',
        order: 4
      },
      { 
        title: 'Payroll & Salary', 
        description: 'Salaries are processed on the 15th of every month. Any "Staff Advance" recorded in expenditures is automatically deducted from the next salary cycle.',
        iconType: 'salary',
        category: 'HR & Payroll',
        order: 5
      },
      { 
        title: 'Salary Deductions', 
        description: 'Late Coming Penalty: 3 late arrivals are counted as 1 Casual Leave deduction. Non-CL Leaves: Any non-casual leave is categorization as DEDUCTIBLE from salary.',
        iconType: 'deduction',
        category: 'HR & Payroll',
        order: 6 
      },
      { 
        title: 'Fee Calculations', 
        description: 'Pro-rata Policy: If a student becomes inactive or drops transport/hostel facilities, fees are pro-rated based on active months (Total / 10 * Months Active).',
        iconType: 'fee',
        category: 'Finance',
        order: 7
      }
    ];

    for (const rule of defaults) {
      const customId = rule.title.trim().replace(/\s+/g, '_');
      await dbService.create('rules', customId, rule);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.title || !newRule.description) {
      toast.error("Please fill in both title and description");
      return;
    }

    try {
      const customId = newRule.title.trim().replace(/\s+/g, '_');
      await dbService.create('rules', customId, {
        ...newRule,
        order: rules.length + 1,
        createdAt: new Date().toISOString()
      });
      toast.success("Rule added successfully");
      setNewRule({ title: '', description: '', category: 'General' });
      setIsAddingRule(false);
    } catch (error) {
      toast.error("Failed to add rule");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await dbService.delete('rules', id);
      toast.success("Rule removed");
    } catch (error) {
      toast.error("Failed to delete rule");
    }
  };
  const [isEditing, setIsEditing] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [formData, setFormData] = useState(settings);
  const [loading, setLoading] = useState(false);
  const [localSiteConfig, setLocalSiteConfig] = useState<any>(siteConfig);
  const [diagProgress, setDiagProgress] = useState(0);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // System Restore Points States
  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupNotes, setBackupNotes] = useState('');
  const [backupDb, setBackupDb] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [indexErrors, setIndexErrors] = useState<any[]>([]);
  const [loadingIndexErrors, setLoadingIndexErrors] = useState(false);

  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Subscribe to live updates of the migration status document in Firestore
    const statusRef = doc(db, 'settings', 'aws_migration_status');
    const unsubscribe = onSnapshot(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setMigrationStatus(data);
        if (data.status === 'running') {
          setMigrationLoading(true);
        } else {
          setMigrationLoading(false);
        }
      }
    }, (error) => {
      console.error("[AWS Migration] Error listening to status snapshot:", error);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [migrationStatus?.logs]);

  const handleRunAwsMigration = async () => {
    if (!window.confirm("Are you sure you want to run the AWS Rekognition migration? This will copy all existing face registrations to your AWS S3 bucket and index them in Rekognition.")) {
      return;
    }
    setMigrationLoading(true);
    setMigrationResult(null);
    const mToast = toast.loading("Initiating AWS Migration...");
    try {
      const res = await fetch('/api/attendance/aws-rekognition-migration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Migration failed to start");
      }
      toast.success("AWS Migration successfully started! Monitor the Live Terminal below. / మైగ్రేషన్ విజయవంతంగా ప్రారంభించబడింది, కింద ఉన్న లైవ్ కన్సోల్‌ను చూడండి.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to start migration");
      setMigrationResult({ success: false, message: err.message || "Failed to start migration" });
    } finally {
      toast.dismiss(mToast);
    }
  };

  const fetchIndexErrors = async () => {
    setLoadingIndexErrors(true);
    try {
      const data = await dbService.list('index_errors');
      const sorted = (data || []).sort((a: any, b: any) => {
        return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
      });
      setIndexErrors(sorted);
    } catch (error) {
      console.error("Failed to fetch index errors:", error);
    } finally {
      setLoadingIndexErrors(false);
    }
  };

  const handleDeleteIndexError = async (id: string) => {
    try {
      await dbService.delete('index_errors', id);
      toast.success("Index error resolved and removed.");
      fetchIndexErrors();
    } catch (error) {
      toast.error("Failed to delete index error.");
    }
  };

  const handleClearAllIndexErrors = async () => {
    if (!window.confirm("Are you sure you want to clear all logged index errors?")) return;
    try {
      const promises = indexErrors.map(err => dbService.delete('index_errors', err.id));
      await Promise.all(promises);
      toast.success("All logged index errors cleared!");
      fetchIndexErrors();
    } catch (error) {
      toast.error("Failed to clear all index errors.");
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/maintenance/backups');
      const data = await response.json();
      if (data.success) {
        setBackups(data.backups);
      }
    } catch (error) {
      console.error("Failed to fetch backups:", error);
    }
  };

  useEffect(() => {
    if (activeTab === 'diagnostics') {
      fetchBackups();
      fetchIndexErrors();
    }
  }, [activeTab]);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    const toastId = toast.loading("Creating system restore point (compressing codebase, configurations & database snapshots)...");
    try {
      const response = await fetch('/api/maintenance/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: backupNotes || 'Manual System Restore Point', backupDatabase: backupDb })
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Success! System restore point created successfully.", { id: toastId });
        setBackupNotes('');
        fetchBackups();
      } else {
        toast.error("Error creating restore point: " + (data.error || "Unknown error"), { id: toastId });
      }
    } catch (e: any) {
      toast.error("Failed to make request: " + e.message, { id: toastId });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (id: string, notes: string) => {
    if (!window.confirm(`CRITICAL: Are you absolutely sure you want to restore the entire ERP application to "${notes}"?\n\nThis will overwrite all codebase modules, files, routes and database states with this restore point. The server will restart after restoration.`)) {
      return;
    }

    setRestoringId(id);
    const toastId = toast.loading("RESTORING APPLICATION... Extracting code and applying database state...");
    try {
      const response = await fetch(`/api/maintenance/backups/${id}/restore`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Restore complete! Rebuilding application bundle and restarting server...", { id: toastId, duration: 10000 });
        
        // Wait 5 seconds for server to load recovered state and reload
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      } else {
        toast.error("Restore failed: " + (data.error || "Unknown error"), { id: toastId });
        setRestoringId(null);
      }
    } catch (e: any) {
      toast.error("Failed to execute restore: " + e.message, { id: toastId });
      setRestoringId(null);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this backup restore point permanently? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/maintenance/backups/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Backup restore point deleted.");
        fetchBackups();
      } else {
        toast.error("Failed to delete backup: " + (data.error || "Unknown error"));
      }
    } catch (e: any) {
      toast.error("Error deleting backup: " + e.message);
    }
  };

  useEffect(() => {
    const fetchInsights = async () => {
      setLoadingInsights(true);
      try {
        const data = await dbService.list('insights');
        setInsights(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } catch (error) {
        console.error("Error fetching insights:", error);
      } finally {
        setLoadingInsights(false);
      }
    };
    fetchInsights();
  }, []);

  useEffect(() => {
    if (siteConfig) {
      setLocalSiteConfig(siteConfig);
    }
  }, [siteConfig]);

  useEffect(() => {
    if (!isEditing) {
      setFormData(settings);
    }
  }, [settings, isEditing]);

  const repairData = async () => {
    setIsRepairing(true);
    setDiagProgress(0);
    const defaultYear = settings.currentAcademicYear || '2026-27';
    toast.loading("Scanning and repairing all student and staff data...", { id: 'repair' });
    
    try {
      // 1. Fetch EVERYTHING needed for a total sync
      const [allUsers, studentsInColl, staffInColl, allClasses, allBatches] = await Promise.all([
        dbService.list('users'),
        dbService.list('students'),
        dbService.list('staff'),
        dbService.list('classes'),
        dbService.list('batches')
      ]);

      toast.info(`Database Scan: ${allUsers.length} Users, ${studentsInColl.length} Students, ${staffInColl.length} Staff, ${allClasses.length} Classes.`, { id: 'repair' });

      // 2. IDENTITY REPAIR (users collection)
      const usersToSync: {id: string, data: any}[] = [];
      const studentsToProfile: {id: string, data: any}[] = [];
      const staffToProfile: {id: string, data: any}[] = [];

      allUsers.forEach((u: any) => {
        const uid = u.uid || u.id;
        if (!uid) return;

        const rawRole = String(u.role || u.designation || '').toLowerCase().trim();
        const roleNormalized = rawRole.includes('student') ? 'student' : 
                               (rawRole.includes('parent') ? 'parent' : 
                               (['admin', 'principal', 'super_admin'].includes(rawRole) ? rawRole : 
                               (['teacher', 'clerk', 'accountant', 'staff', 'driver', 'attendant'].some(r => rawRole.includes(r)) ? 'staff' : 'teacher')));

        let needsIdentityUpdate = false;
        const identityUpdate: any = {};
        
        // Find existing profile to extract fields if missing in users
        const existingStudent = studentsInColl.find((s: any) => (s.uid === uid || s.id === uid || (s.email && u.email && s.email.toLowerCase() === u.email.toLowerCase())));
        const existingStaff = staffInColl.find((s: any) => (s.uid === uid || s.id === uid || (s.email && u.email && s.email.toLowerCase() === u.email.toLowerCase())));

        // Name normalization
        if (!u.name || u.name === u.role || u.name === 'No Name' || u.name === 'N/A') {
          const potentialName = u.fullName || u.displayName || u.staffName || u.studentName || 
                               existingStudent?.name || existingStaff?.name ||
                               (u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : null);
          if (potentialName && potentialName !== 'N/A') {
            identityUpdate.name = potentialName;
            needsIdentityUpdate = true;
          } else if (u.email) {
            identityUpdate.name = u.email.split('@')[0].replace(/\./g, ' ').split(' ').map((s: any) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
            needsIdentityUpdate = true;
          }
        }

        if (u.role !== roleNormalized) {
          identityUpdate.role = roleNormalized;
          needsIdentityUpdate = true;
        }

        if (!u.status || u.status !== 'active') {
          identityUpdate.status = 'active';
          needsIdentityUpdate = true;
        }

        if (roleNormalized === 'student' && (!u.academicYear || u.academicYear.length < 4)) {
          identityUpdate.academicYear = existingStudent?.academicYear || defaultYear;
          needsIdentityUpdate = true;
        }

        if (needsIdentityUpdate) {
          usersToSync.push({ id: uid, data: identityUpdate });
        }

        // Prepare for Profile Sync
        const currentData = { ...u, ...identityUpdate };
        
        // Deep mapping for student specific fields
        if (roleNormalized === 'student') {
          const classHint = u.classId || u.class || existingStudent?.classId || existingStudent?.class || u.class_id || existingStudent?.class_id || '';
          const matchedClass = (allClasses || []).find((c: any) => c.id === classHint || c.name === classHint);
          const classId = matchedClass?.id || classHint;

          const batchHint = u.batchId || u.batch || existingStudent?.batchId || existingStudent?.batch || u.batch_id || existingStudent?.batch_id || '';
          const matchedBatch = (allBatches || []).find((b: any) => (b.id === batchHint || b.name === batchHint) && (classId ? b.classId === classId : true));
          const batchId = matchedBatch?.id || batchHint;

          const studentPayload = {
            ...currentData,
            ...existingStudent, // Merge existing profile data
            ...identityUpdate,  // Override with updated identity
            name: currentData.name || existingStudent?.name || 'N/A',
            fatherName: u.fatherName || u.parentName || u.father_name || u.parent_name || u.guardianName || existingStudent?.fatherName || existingStudent?.parentName || existingStudent?.father_name || existingStudent?.parent_name || existingStudent?.guardianName || 'N/A',
            rollNo: u.rollNo || u.rollNumber || u.roll_no || u.roll_number || u.admissionNo || u.admissionNumber || u.studentId || existingStudent?.rollNo || existingStudent?.rollNumber || existingStudent?.roll_no || existingStudent?.roll_number || existingStudent?.admissionNo || existingStudent?.admissionNumber || 'N/A',
            rollNumber: u.rollNumber || u.rollNo || u.roll_number || u.roll_no || existingStudent?.rollNumber || existingStudent?.rollNo || existingStudent?.roll_number || existingStudent?.roll_no || 'N/A',
            classId,
            batchId,
            class: matchedClass?.name || classHint || '',
            batch: matchedBatch?.name || batchHint || '',
            concession: u.concession || u.feeConcession || u.feeConcessionType || u.concessionType || existingStudent?.concession || existingStudent?.feeConcession || existingStudent?.feeConcessionType || 'None',
            gender: u.gender || existingStudent?.gender || 'Not Specified',
            dob: u.dob || u.dateOfBirth || existingStudent?.dob || existingStudent?.dateOfBirth || '',
            parentName: u.parentName || u.fatherName || existingStudent?.parentName || existingStudent?.fatherName || '',
            phone: u.phone || u.mobile || u.whatsappNumber || u.contact || existingStudent?.phone || existingStudent?.mobile || existingStudent?.whatsappNumber || '',
            address: u.address || u.location || existingStudent?.address || existingStudent?.location || '',
            city: u.city || u.village || existingStudent?.city || existingStudent?.village || '',
            academicYear: currentData.academicYear || existingStudent?.academicYear || defaultYear
          };
          studentsToProfile.push({ id: uid, data: studentPayload });
        } else if (['teacher', 'clerk', 'accountant', 'staff'].includes(roleNormalized)) {
          const staffPayload = {
            ...currentData,
            ...existingStaff,
            ...identityUpdate,
            designation: u.designation || u.role || existingStaff?.designation || existingStaff?.role || 'Staff',
            qualification: u.qualification || existingStaff?.qualification || '',
            experience: u.experience || existingStaff?.experience || '',
            phone: u.phone || u.mobile || u.whatsappNumber || existingStaff?.phone || existingStaff?.mobile || existingStaff?.whatsappNumber || '',
            joiningDate: u.joiningDate || u.createdAt || existingStaff?.joiningDate || new Date().toISOString()
          };
          staffToProfile.push({ id: uid, data: staffPayload });
        }
      });

      if (usersToSync.length > 0) {
        toast.info(`Patching ${usersToSync.length} identity records...`, { id: 'repair' });
        // Chunk updates to avoid Firestore batch limits (500)
        for (let i = 0; i < usersToSync.length; i += 400) {
          await dbService.updateBatch('users', usersToSync.slice(i, i + 400));
        }
      }

      // 3. PROFILE SYNC (students collection)
      if (studentsToProfile.length > 0) {
        toast.info(`Synchronizing ${studentsToProfile.length} students...`, { id: 'repair' });
        for (let i = 0; i < studentsToProfile.length; i += 400) {
          const chunk = studentsToProfile.slice(i, i + 400).map(item => ({
            id: item.id,
            data: {
              ...item.data,
              status: 'active',
              academicYear: item.data.academicYear || defaultYear,
              updatedAt: new Date().toISOString()
            }
          }));
          await dbService.setBatch('students', chunk);
        }
      }

      // 4. PROFILE SYNC (staff collection)
      if (staffToProfile.length > 0) {
        toast.info(`Synchronizing ${staffToProfile.length} staff records...`, { id: 'repair' });
        for (let i = 0; i < staffToProfile.length; i += 400) {
          const chunk = staffToProfile.slice(i, i + 400).map(item => ({
            id: item.id,
            data: {
              ...item.data,
              status: 'active',
              updatedAt: new Date().toISOString()
            }
          }));
          await dbService.setBatch('staff', chunk);
        }
      }

      toast.success("REPAIR COMPLETE: All modules should now display data correctly.", { id: 'repair' });
      // Clear cache and reload to reveal fixed data
      if (typeof window !== 'undefined') {
        localStorage.clear();
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error: any) {
      console.error("Critical Repair Failure:", error);
      toast.error(`Repair Failed: ${error.message || 'Unknown error'}`, { id: 'repair' });
    } finally {
      setIsRepairing(false);
    }
  };

  const scanDuplicates = async () => {
    setIsScanning(true);
    setDuplicates([]);
    try {
      const allUsers = await dbService.list('users');
      const dups: any[] = [];
      
      const emailMap = new Map();
      const aadharMap = new Map();
      const admissionMap = new Map();
      const rollMap = new Map();
      const phoneMap = new Map();

      allUsers.forEach((user: any) => {
        if (user.email) {
          const e = user.email.toLowerCase().trim();
          if (!emailMap.has(e)) emailMap.set(e, []);
          emailMap.get(e).push(user);
        }

        const aadhar = (user.aadharNumber || user.studentAadharNumber || '').replace(/\s/g, '');
        if (aadhar) {
          if (!aadharMap.has(aadhar)) aadharMap.set(aadhar, []);
          aadharMap.get(aadhar).push(user);
        }

        if (user.admissionNumber) {
          if (!admissionMap.has(user.admissionNumber)) admissionMap.set(user.admissionNumber, []);
          admissionMap.get(user.admissionNumber).push(user);
        }

        if (user.rollNumber && user.classId && user.batchId) {
          const key = `${user.classId}_${user.batchId}_${user.rollNumber}`;
          if (!rollMap.has(key)) rollMap.set(key, []);
          rollMap.get(key).push(user);
        }

        const p = (user.phone || user.contact || '').replace(/\D/g, '');
        if (p && p.length >= 10) {
           if (!phoneMap.has(p)) phoneMap.set(p, []);
           phoneMap.get(p).push(user);
        }
      });

      const fieldLabels: any = {
        'Email': emailMap,
        'Aadhar Number': aadharMap,
        'Admission Number': admissionMap,
        'Roll Number': rollMap,
        'Phone/Contact': phoneMap
      };

      Object.entries(fieldLabels).forEach(([label, map]: [string, any]) => {
        map.forEach((users: any[], key: string) => {
          if (users.length > 1) {
            dups.push({
              type: label,
              value: label === 'Roll Number' ? users[0].rollNumber : key,
              count: users.length,
              users: users.map((u: any) => ({ 
                name: u.name, 
                role: u.role, 
                uid: u.uid, 
                class: u.classId,
                batch: u.batchId 
              }))
            });
          }
        });
      });

      setDuplicates(dups);
      if (dups.length === 0) toast.success("No duplicates found!");
      else toast.warning(`Found ${dups.length} duplicate entries.`);
    } catch (error) {
      console.error("Scan error:", error);
      toast.error("Failed to scan for duplicates");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAutoResolveAllDuplicates = async () => {
    setIsScanning(true);
    const toastId = toast.loading("Auto-merging duplicate user and staff records...");
    try {
      const result = await deduplicateAndPurgeClashes();
      toast.success(`Successfully merged ${result.mergedGroupsCount} duplicate groups and removed ${result.deletedDuplicatesCount} ghost duplicate records!`, { id: toastId });
      await scanDuplicates();
    } catch (error: any) {
      console.error("Auto resolve duplicates error:", error);
      toast.error(`Failed to auto-resolve duplicates: ${error.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setIsScanning(false);
    }
  };

  const fixAdminProfile = async () => {
    setIsRepairing(true);
    toast.loading("Synchronizing System Admin credentials...", { id: 'admin-fix' });
    try {
      const adminEmail = 'manamunagaraju@gmail.com';
      const users = await dbService.list('users', [where('email', '==', adminEmail)]);
      
      if (users.length === 0) {
        toast.error("Admin profile not found in database.", { id: 'admin-fix' });
        return;
      }

      const updates = users.map((u: any) => ({
        id: u.uid || u.id,
        data: {
          role: 'admin',
          name: 'Nagaraju Manam', // Hardcoded as per user's name if found, or generic "System Admin"
          status: 'active',
          updatedAt: new Date().toISOString()
        }
      }));

      await dbService.updateBatch('users', updates);
      toast.success("Admin profile fixed! Please re-login to see changes.", { id: 'admin-fix', duration: 5000 });
    } catch (error) {
      console.error("Admin fix error:", error);
      toast.error("Failed to fix admin profile.", { id: 'admin-fix' });
    } finally {
      setIsRepairing(false);
    }
  };

  const handleSaveSiteConfig = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateSiteConfig(localSiteConfig);
      toast.success("Landing page configuration saved!");
    } catch (error) {
      toast.error("Failed to save landing page config.");
    } finally {
      setLoading(false);
    }
  };

  const handleNestedImageUpload = (path: string) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        const url = await uploadService.uploadFile(file);
        const keys = path.split('.');
        setLocalSiteConfig((prev: any) => {
          const newState = JSON.parse(JSON.stringify(prev));
          let current = newState;
          for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
          }
          current[keys[keys.length - 1]] = url;
          return newState;
        });
        toast.success("Image uploaded!");
      } catch (error: any) {
        toast.error(error.message || "Failed to upload image.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGridImageUpload = (index: number) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        const url = await uploadService.uploadFile(file);
        setLocalSiteConfig((prev: any) => {
          const newPhotos = [...(prev.about.gridPhotos || ['', '', '', ''])];
          newPhotos[index] = url;
          return { ...prev, about: { ...prev.about, gridPhotos: newPhotos } };
        });
        toast.success("Image uploaded!");
      } catch (error: any) {
        toast.error(error.message || "Failed to upload image.");
      } finally {
        setLoading(false);
      }
    }
  };

  const [newYearData, setNewYearData] = useState({ name: '', startDate: '', endDate: '' });
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteConfig, setPromoteConfig] = useState({
    fromYear: '',
    toYear: '',
    isPromoting: false
  });

  const handlePromoteStudents = async () => {
    if (!promoteConfig.fromYear || !promoteConfig.toYear) {
      toast.error("Please select both source and target years.");
      return;
    }

    if (promoteConfig.fromYear === promoteConfig.toYear) {
      toast.error("Source and target years must be different.");
      return;
    }

    setPromoteConfig(prev => ({ ...prev, isPromoting: true }));
    toast.loading("Analyzing balances and carry-over dues...", { id: 'promote-students' });

    try {
      const staffRoles = ['teacher', 'accountant', 'clerk', 'admin', 'principal', 'vice_principal', 'staff', 'driver', 'attendant', 'helper', 'aya', 'coordinator', 'front_office', 'receptionist'];
      
      // We only need students from the source year
      const studentsRes = await dbService.list('students', [
        where('academicYear', '==', promoteConfig.fromYear)
      ]);

      const allStudents = studentsRes as any[];

      if (allStudents.length === 0) {
        toast.error("No students found in the selected source year.", { id: 'promote-students' });
        setPromoteConfig(prev => ({ ...prev, isPromoting: false }));
        return;
      }

      console.log(`Promoting ${allStudents.length} students from ${promoteConfig.fromYear} to ${promoteConfig.toYear}`);

      const batchSize = 100;
      let totalPromoted = 0;

      for (let i = 0; i < allStudents.length; i += batchSize) {
        const chunk = allStudents.slice(i, i + batchSize);
        const studentIds = chunk.map(s => s.uid);
        
        // Fetch fees ONLY for these students in the source year - split into chips of 30 for Firestore limit
        const studentIdChunks = [];
        for (let j = 0; j < studentIds.length; j += 30) {
          studentIdChunks.push(studentIds.slice(j, j + 30));
        }

        const feesPromises = studentIdChunks.map(chunkIds => 
          dbService.list('fees', [
            where('academicYear', '==', promoteConfig.fromYear),
            where('studentId', 'in', chunkIds)
          ])
        );
        const feesResults = await Promise.all(feesPromises);
        const chunkFees = feesResults.flat();

        const updates = chunk.map(student => {
          // Calculate remaining balance for this student in the source year
          const feeRecord = chunkFees.find(f => f.studentId === student.uid);
          const currentBalance = feeRecord ? (feeRecord.totalAmount - feeRecord.paidAmount) : 0;
          const totalNewDue = (student.lastClassFeeDue || 0) + currentBalance;

          return {
            id: student.uid,
            data: {
              academicYear: promoteConfig.toYear,
              lastClassFeeDue: totalNewDue
            }
          };
        });

        await dbService.updateBatch('students', updates);
        totalPromoted += chunk.length;
        toast.loading(`Promoting students... (${totalPromoted}/${allStudents.length})`, { id: 'promote-students' });
      }

      toast.success(`Successfully promoted ${totalPromoted} students and carried forward their dues.`, { id: 'promote-students' });
      setShowPromoteModal(false);
    } catch (error) {
      console.error("Promotion Error:", error);
      toast.error("Failed to promote students. Check logs for details.", { id: 'promote-students' });
    } finally {
      setPromoteConfig(prev => ({ ...prev, isPromoting: false }));
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const addAcademicYear = async () => {
    if (!newYearData.name.trim() || !newYearData.startDate || !newYearData.endDate) {
      toast.error("Please fill in all academic year details (name, start date, end date).");
      return;
    }

    // Validate YYYY-YY pattern
    const pattern = /^\d{4}-\d{2}$/;
    if (!pattern.test(newYearData.name.trim())) {
      toast.error("Academic year must follow YYYY-YY pattern (e.g., 2023-24).");
      return;
    }

    if (formData.academicYears?.includes(newYearData.name.trim())) {
      toast.error("This academic year name already exists.");
      return;
    }

    const newYearDetail = {
      name: newYearData.name.trim(),
      startDate: newYearData.startDate,
      endDate: newYearData.endDate,
      status: 'upcoming' as const
    };

    const updatedYears = [...(formData.academicYears || []), newYearData.name.trim()].sort((a, b) => b.localeCompare(a));
    const updatedDetails = [...(formData.academicYearDetails || []), newYearDetail];
    
    setLoading(true);
    try {
      await updateSettings({
        ...formData,
        academicYears: updatedYears,
        academicYearDetails: updatedDetails
      });
      setFormData(prev => ({ 
        ...prev, 
        academicYears: updatedYears,
        academicYearDetails: updatedDetails
      }));
      setNewYearData({ name: '', startDate: '', endDate: '' });
      toast.success(`Academic year ${newYearData.name} added and saved!`);
    } catch (error) {
      toast.error("Failed to add academic year.");
    } finally {
      setLoading(false);
    }
  };

  const removeAcademicYear = async (year: string) => {
    if (year === formData.currentAcademicYear) {
      toast.error("Cannot remove the current default academic year.");
      return;
    }
    
    // Standard confirm() might be blocked in some iframe environments. 
    // Proceeding directly as per user request to "make it to delete".

    const updatedYears = formData.academicYears?.filter(y => y !== year) || [];
    const updatedDetails = formData.academicYearDetails?.filter(d => d.name !== year) || [];

    setLoading(true);
    try {
      await updateSettings({
        ...formData,
        academicYears: updatedYears,
        academicYearDetails: updatedDetails
      });
      setFormData(prev => ({
        ...prev,
        academicYears: updatedYears,
        academicYearDetails: updatedDetails
      }));
      toast.success(`Academic year ${year} removed.`);
    } catch (error) {
      console.error("Delete Error:", error);
      toast.error("Failed to remove academic year.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        const url = await uploadService.uploadFile(file);
        
        // Auto-save the logo to the settings
        await updateSettings({ logoUrl: url });
        setFormData(prev => ({ ...prev, logoUrl: url }));
        
        toast.success("Logo uploaded and saved successfully!");
      } catch (error: any) {
        console.error("Logo Upload Error:", error);
        let msg = "Failed to upload logo.";
        if (error.message?.includes("permissions")) {
          msg = "Permission denied while saving logo to database.";
        }
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleHMSignatureUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        const url = await uploadService.uploadFile(file);
        
        // Auto-save the Headmaster's signature to settings
        await updateSettings({ hmSignatureUrl: url });
        setFormData(prev => ({ ...prev, hmSignatureUrl: url }));
        
        toast.success("Headmaster signature scan uploaded and saved successfully!");
      } catch (error: any) {
        console.error("Signature Upload Error:", error);
        toast.error("Failed to upload Headmaster signature.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasPermission('settings_school')) {
      toast.error("Only administrators can update school settings.");
      return;
    }

    setLoading(true);
    try {
      await updateSettings(formData);
      toast.success("School settings updated successfully!");
      setIsEditing(false);
    } catch (error: any) {
      console.error("Update Error:", error);
      let errorMessage = "Failed to update settings.";
      
      try {
        const errorInfo = JSON.parse(error.message);
        if (errorInfo.error.includes("permission")) {
          errorMessage = "Permission denied. Please ensure you have administrator rights.";
        } else if (errorInfo.error.includes("too large")) {
          errorMessage = "The data is too large to save. Try a smaller logo image.";
        }
      } catch (e) {
        // Not a JSON error
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAws = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasPermission('settings_school')) {
      toast.error("మీకు ఈ మార్పులు చేయడానికి अनुमति లేదు / Only administrators can update school settings.");
      return;
    }

    setLoading(true);
    try {
      await updateSettings({
        awsAccessKeyId: formData.awsAccessKeyId || '',
        awsSecretAccessKey: formData.awsSecretAccessKey || '',
        awsRegion: formData.awsRegion || '',
        awsS3BucketName: formData.awsS3BucketName || ''
      });
      toast.success("AWS Configurations saved successfully! / AWS కాన్ఫిగరేషన్లు విజయవంతంగా సేవ్ చేయబడ్డాయి!");
    } catch (error: any) {
      console.error("AWS Save Error:", error);
      toast.error("Failed to save AWS configurations.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar">School Administration</h1>
          <p className="text-neutral-500">Configure global institution settings and public presence</p>
        </div>
        <div className="flex bg-neutral-100 p-1.5 rounded-2xl overflow-x-auto no-scrollbar">
            {[
            { id: 'profile', icon: School, label: 'Profile' },
            { id: 'landing', icon: Layout, label: 'Landing Page' },
            { id: 'promotion', icon: TrendingUp, label: 'Promotion' },
            { id: 'templates', icon: MessageSquare, label: 'Messages' },
            { id: 'rules', icon: ShieldCheck, label: 'School Rules' },
            { id: 'diagnostics', icon: Wrench, label: 'Maintenance' },
            { id: 'audit', icon: FileClock, label: 'Audit Trail' },
            { id: 'aws', icon: Database, label: 'AWS Config' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'profile' && (
        <>
          <div className="flex justify-end">
            {hasPermission('settings_school') && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl hover:bg-sidebar transition-all shadow-lg shadow-primary/20"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Logo Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-neutral-100 flex flex-col items-center text-center">
            <div className="relative group">
              <div className="w-52 h-52 rounded-full bg-neutral-50 border-4 border-white shadow-2xl flex items-center justify-center overflow-hidden mb-6 relative z-10">
                {formData.logoUrl ? (
                  <img 
                    src={normalizeUrl(formData.logoUrl)} 
                    alt="School Logo" 
                    className="w-full h-full object-contain p-6"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <School className="w-20 h-20 text-neutral-300" />
                )}
              </div>
              <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-125 -z-0" />
              {isEditing && (
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer z-20">
                  <Upload className="text-white w-10 h-10" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              )}
            </div>
            <h3 className="font-bold text-sidebar text-lg">{formData.schoolName}</h3>
            <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-semibold">Institution Logo</p>
            {isEditing && (
              <p className="text-[10px] text-neutral-400 mt-4 italic">Click the image to upload a new logo</p>
            )}
          </div>

          {/* HM Signature Card */}
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-neutral-100 flex flex-col items-center text-center">
            <div className="relative group">
              <div className="w-52 h-24 rounded-2xl bg-neutral-50 border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden mb-4 relative z-10">
                {formData.hmSignatureUrl ? (
                  <img 
                    src={normalizeUrl(formData.hmSignatureUrl)} 
                    alt="Headmaster Signature" 
                    className="max-h-full max-w-full object-contain p-2"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <FileCheck className="w-10 h-10 text-neutral-300" />
                )}
              </div>
              {isEditing && (
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl cursor-pointer z-20">
                  <Upload className="text-white w-6 h-6" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleHMSignatureUpload} />
                </label>
              )}
            </div>
            <h4 className="font-bold text-sidebar text-sm">{formData.principalName || 'Headmaster / Principal'}</h4>
            <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-widest font-semibold">Official Signature Scan</p>
            {isEditing && (
              <p className="text-[10px] text-neutral-400 mt-2 italic">Click box to upload transparent signature</p>
            )}
          </div>
        </div>

        {/* Details Section */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl shadow-sm border border-neutral-100 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <School className="w-3 h-3" /> School Name
                </label>
                <input
                  type="text"
                  name="schoolName"
                  value={formData.schoolName}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-3 h-3" /> Principal Name
                </label>
                <input
                  type="text"
                  name="principalName"
                  value={formData.principalName || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter principal's name"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Mail className="w-3 h-3" /> Contact Email
                </label>
                <input
                  type="email"
                  name="contactEmail"
                  value={formData.contactEmail || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="school@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Phone className="w-3 h-3" /> Phone Number
                </label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="+1 234 567 890"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <MapPin className="w-3 h-3" /> Address
                </label>
                <textarea
                  name="address"
                  value={formData.address || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter full school address"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-3 h-3" /> Website
                </label>
                <input
                  type="text"
                  name="website"
                  value={formData.website || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="www.school.com"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Established Year
                </label>
                <input
                  type="text"
                  name="establishedYear"
                  value={formData.establishedYear || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="e.g. 1995"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-3 h-3" /> System Timezone
                </label>
                <select
                  name="timezone"
                  value={formData.timezone || 'Asia/Kolkata'}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-bold"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                  <option value="Asia/Hong_Kong">Asia/Hong_Kong (HKT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                </select>
                <p className="text-[10px] text-neutral-400 italic">This affects date display across the platform.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                    <FileClock className="w-3 h-3" /> Teacher Leave Quota
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${formData.teacherLeaveQuotaEnabled ? 'text-primary' : 'text-neutral-400'}`}>
                      {formData.teacherLeaveQuotaEnabled ? '3 Per Day' : 'No Limit'}
                    </span>
                    <div className="relative">
                      <input 
                        type="checkbox"
                        name="teacherLeaveQuotaEnabled"
                        checked={formData.teacherLeaveQuotaEnabled || false}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-neutral-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </div>
                  </label>
                </div>
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                   <p className="text-[10px] text-neutral-500 italic leading-tight">By enabling this, only 3 teachers can have approved leave on any single day. 4th applicant will be rejected automatically with a quota message.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Layout className="w-3 h-3" /> System Theme
                </label>
                <select
                  name="theme"
                  value={formData.theme || 'default'}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-bold"
                >
                  <option value="default">Light Classic</option>
                  <option value="glass-dark">Glass Dark (Futuristic)</option>
                </select>
                <p className="text-[10px] text-neutral-400 italic">Select the visual appearance of the ERP interface.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <FileCheck className="w-3 h-3" /> Affiliation Number
                </label>
                <input
                  type="text"
                  name="affiliationNumber"
                  value={formData.affiliationNumber || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Affiliation ID"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                    <Bot className="w-3 h-3" /> AI Model API Key (Gemini)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${formData.aiApiKeyEnabled ? 'text-indigo-600' : 'text-neutral-400'}`}>
                      {formData.aiApiKeyEnabled ? 'Active' : 'Disabled'}
                    </span>
                    <div className="relative">
                      <input 
                        type="checkbox"
                        name="aiApiKeyEnabled"
                        checked={formData.aiApiKeyEnabled || false}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-neutral-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>
                </div>
                <input
                  type="password"
                  name="aiApiKey"
                  value={formData.aiApiKey || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter your Gemini API key to link Core Brain"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-neutral-400 italic">This key connects the Dashboard to the AI Backend for deep school-wide correlation.</p>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black text-rose-500 uppercase">₹</span>
                        <input
                          type="number"
                          step="0.0001"
                          name="aiSpending"
                          value={formData.aiSpending || 0}
                          onChange={handleInputChange}
                          className="w-20 px-2 py-0.5 rounded bg-rose-50 text-[10px] font-black text-rose-600 outline-none border border-rose-100"
                        />
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest animate-pulse">₹{Number(formData.aiSpending || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2 mt-4">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Bot className="w-3 h-3" /> AI Bot Custom Instructions
                </label>
                <textarea
                  name="aiBotInstructions"
                  value={formData.aiBotInstructions || ''}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Leave empty for default instructions. Customize the bot's behavior, tone, or format."
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs resize-y min-h-[100px]"
                />
                <p className="text-[10px] text-neutral-400 italic">Customize how the AI Bot replies to users (formatting, tone, language, etc).</p>
              </div>

              <div className="space-y-4 md:col-span-2 mt-4 pt-4 border-t border-dashed border-neutral-200">
                <h3 className="text-sm font-black text-sidebar flex items-center gap-2 uppercase tracking-wide font-mono">
                  <CreditCard className="w-4 h-4 text-indigo-500" />
                  Razorpay Financial Gateway Settings
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                      Razorpay Key ID (Automated API Checkout Key)
                    </label>
                    <input
                      type="text"
                      name="razorpayKeyId"
                      value={formData.razorpayKeyId || ''}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      placeholder="e.g. rzp_live_xxxxxxxx, rzp_test_xxxxxxxx"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                    />
                    <p className="text-[10px] text-neutral-400 italic">Configure your Razorpay merchant public key for automated API checkouts.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                      Razorpay Payment Link / Page URL
                    </label>
                    <input
                      type="text"
                      name="razorpayPaymentLink"
                      value={formData.razorpayPaymentLink || ''}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      placeholder="e.g. https://rzp.io/l/your_payment_page"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                    />
                    <p className="text-[10px] text-neutral-400 italic">Paste your custom Razorpay payment link or Checkout Page url here for manual payment options.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                      CollectNow Merchant Name (Step 4)
                    </label>
                    <input
                      type="text"
                      name="razorpayMerchantName"
                      value={formData.razorpayMerchantName || ''}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      placeholder="e.g. ST. ANTONY'S HIGH SCHOOL"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                    />
                    <p className="text-[10px] text-neutral-400 italic">Merchant business name stored with every transaction for audit and reconciliation.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                      Merchant ID (MID)
                    </label>
                    <input
                      type="text"
                      name="razorpayMid"
                      value={formData.razorpayMid || ''}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      placeholder="e.g. MID_ANTONY_PROD_01"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                    />
                    <p className="text-[10px] text-neutral-400 italic">Your Razorpay Merchant Account Identifier (MID).</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                      Terminal ID (TID)
                    </label>
                    <input
                      type="text"
                      name="razorpayTid"
                      value={formData.razorpayTid || ''}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      placeholder="e.g. TID_COUNTER_COLLECT_01"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                    />
                    <p className="text-[10px] text-neutral-400 italic">Unique Terminal / Counter ID for CollectNow payment points.</p>
                  </div>

                  {/* Receipt Style Dimensions for 3-inch printers */}
                  <div className="col-span-1 md:col-span-2 pt-4 border-t border-neutral-100 mt-2 space-y-3">
                    <h3 className="text-sm font-bold text-neutral-500/80 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                      <span>🖨️ Receipt Ticket Size Config (Thermal Paper Settings)</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block font-sans">
                          Receipt Ticket Width (inches)
                        </label>
                        <input
                          type="number"
                          name="receiptPageWidth"
                          step="0.1"
                          min="1"
                          max="12"
                          value={formData.receiptPageWidth !== undefined ? formData.receiptPageWidth : 3.0}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 3.0 : parseFloat(e.target.value);
                            setFormData(prev => ({ ...prev, receiptPageWidth: val }));
                          }}
                          disabled={!isEditing}
                          placeholder="Default is 3.0 inches (76mm)"
                          className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                        />
                        <p className="text-[10px] text-neutral-400 leading-relaxed italic font-sans">
                          Standard 3 inch (80mm) bill printer uses <b>3.0</b>. Set to <b>3.0</b> or <b>3.15</b> for perfect horizontal fit.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block font-sans">
                          Receipt Ticket Length / Height (inches)
                        </label>
                        <input
                          type="number"
                          name="receiptPageLength"
                          step="0.1"
                          min="3"
                          max="30"
                          value={formData.receiptPageLength !== undefined ? formData.receiptPageLength : 6.0}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 6.0 : parseFloat(e.target.value);
                            setFormData(prev => ({ ...prev, receiptPageLength: val }));
                          }}
                          disabled={!isEditing}
                          placeholder="Default is 6.0 inches (152mm)"
                          className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-mono text-xs"
                        />
                        <p className="text-[10px] text-neutral-400 leading-relaxed italic font-sans">
                          Define length format for ticket slip paper. Default is <b>6.0</b> inches.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* AI Insights Panel */}
            <div className="pt-6 border-t border-neutral-50 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-sidebar flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-500" />
                  AI Insights Panel
                </h2>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => handleInputChange({ target: { name: 'aiApiKeyEnabled', type: 'checkbox', checked: !formData.aiApiKeyEnabled } } as any)}
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${formData.aiApiKeyEnabled ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-400'}`}
                  >
                    {formData.aiApiKeyEnabled ? <CheckCircle2 className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    AI Protocol {formData.aiApiKeyEnabled ? 'Active' : 'Disabled'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* High Alerts */}
                <div className="p-5 bg-rose-50/50 rounded-2xl border border-rose-100/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">High Alerts</span>
                    <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    {insights.filter(i => i.priority === 'high').length > 0 ? (
                      insights.filter(i => i.priority === 'high').map((insight, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-xl border border-rose-100 shadow-sm">
                          <p className="text-[11px] font-bold text-rose-900 leading-tight">{insight.title}</p>
                          <p className="text-[10px] text-rose-600 mt-1 line-clamp-2">{insight.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-neutral-400 italic">No critical issues detected.</p>
                    )}
                  </div>
                </div>

                {/* Medium Alerts */}
                <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-100/50 space-y-4">
                   <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Medium</span>
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                  </div>
                  <div className="space-y-3">
                    {insights.filter(i => i.priority === 'medium').length > 0 ? (
                      insights.filter(i => i.priority === 'medium').map((insight, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-xl border border-amber-100 shadow-sm">
                          <p className="text-[11px] font-bold text-amber-900 leading-tight">{insight.title}</p>
                          <p className="text-[10px] text-amber-600 mt-1 line-clamp-2">{insight.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-neutral-400 italic">Stable trends detected.</p>
                    )}
                  </div>
                </div>

                {/* Good / Performance */}
                <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Good</span>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  </div>
                  <div className="space-y-3">
                    {insights.filter(i => i.priority === 'good').length > 0 ? (
                      insights.filter(i => i.priority === 'good').map((insight, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-xl border border-emerald-100 shadow-sm">
                          <p className="text-[11px] font-bold text-emerald-900 leading-tight">{insight.title}</p>
                          <p className="text-[10px] text-emerald-600 mt-1 line-clamp-2">{insight.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-neutral-400 italic">Waiting for positive trends.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Agent Management Section */}
            <div className="pt-6 border-t border-neutral-50 space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-sidebar flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  St. Antony's Server-Side AI Orchestration
                </h3>
              </div>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <AntonyAiSettingsCard 
                  creds={{
                    userId: profile?.uid || profile?.id || 'GUEST_USER',
                    role: profile?.role || 'GUEST',
                    schoolId: 'st_antonys_school',
                    hospitalId: (profile as any)?.hospitalId || ''
                  }} 
                />
                <AntonyAiHealthCard 
                  creds={{
                    userId: profile?.uid || profile?.id || 'GUEST_USER',
                    role: profile?.role || 'GUEST',
                    schoolId: 'st_antonys_school',
                    hospitalId: (profile as any)?.hospitalId || ''
                  }} 
                />
              </div>
            </div>

            {/* Academic Years Section */}
            <div className="pt-6 border-t border-neutral-50 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-sidebar flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Academic Years Management
                </h3>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Current Active Year Selection */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                      Default Active Year
                    </label>
                    <select
                      name="currentAcademicYear"
                      value={formData.currentAcademicYear}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:bg-neutral-50 disabled:text-neutral-500 font-bold text-primary"
                    >
                      {formData.academicYears?.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-neutral-400 italic">
                      This year will be used as the default filter across the ERP modules.
                    </p>
                  </div>

                  {/* Add New Year (Only when editing) */}
                  {isEditing && (
                    <div className="space-y-4 p-6 bg-neutral-50 rounded-3xl border border-neutral-100">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                        Add New Academic Year
                      </label>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-neutral-400 uppercase px-2">Cycle Name (YYYY-YY)</span>
                          <input
                            type="text"
                            placeholder="e.g. 2026-27"
                            value={newYearData.name}
                            onChange={(e) => setNewYearData({...newYearData, name: e.target.value})}
                            className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none transition-all text-sm font-bold"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-neutral-400 uppercase px-2">Start Date</span>
                            <input
                              type="date"
                              value={newYearData.startDate}
                              onChange={(e) => setNewYearData({...newYearData, startDate: e.target.value})}
                              className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none transition-all text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-neutral-400 uppercase px-2">End Date</span>
                            <input
                              type="date"
                              value={newYearData.endDate}
                              onChange={(e) => setNewYearData({...newYearData, endDate: e.target.value})}
                              className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none transition-all text-sm"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={addAcademicYear}
                          className="w-full py-3 bg-primary text-white rounded-xl hover:bg-sidebar transition-all flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20"
                        >
                          <Plus className="w-5 h-5" />
                          Add Academic Year
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* List of Years */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                  {formData.academicYears?.map(year => {
                    const details = formData.academicYearDetails?.find(d => d.name === year);
                    const isActive = year === formData.currentAcademicYear;
                    
                    return (
                      <div 
                        key={year} 
                        className={`relative p-5 rounded-[2rem] border transition-all flex flex-col gap-3 ${
                          isActive 
                            ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/20 shadow-xl shadow-primary/5' 
                            : 'bg-white border-neutral-100 hover:border-neutral-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xl font-black ${isActive ? 'text-primary' : 'text-neutral-900'}`}>
                            {year}
                          </span>
                          {isActive ? (
                            <span className="px-3 py-1 bg-primary text-white rounded-full text-[10px] font-black uppercase tracking-tighter">Active</span>
                          ) : (
                            isEditing && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeAcademicYear(year);
                                }}
                                className="text-neutral-300 hover:text-rose-500 transition-colors relative z-[50] p-2 hover:bg-rose-50 rounded-lg group"
                                title="Delete Academic Year"
                              >
                                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform pointer-events-none" />
                              </button>
                            )
                          )}
                        </div>
                        
                        {details ? (
                          <div className="space-y-2 border-t border-neutral-50 pt-3">
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-neutral-400 uppercase">Starts</span>
                              <span className="text-neutral-600">{details.startDate ? format(new Date(details.startDate), 'dd MMM yyyy') : 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-neutral-400 uppercase">Ends</span>
                              <span className="text-neutral-600">{details.endDate ? format(new Date(details.endDate), 'dd MMM yyyy') : 'N/A'}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-rose-400 italic">Missing date details</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {isEditing && (
              <div className="flex items-center gap-4 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-sidebar text-white py-4 rounded-2xl font-bold hover:bg-primary transition-all disabled:opacity-50 shadow-xl shadow-sidebar/10"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Changes
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormData(settings);
                    setIsEditing(false);
                  }}
                  className="px-8 py-4 rounded-2xl font-bold text-neutral-400 hover:text-sidebar transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  )}

      {activeTab === 'rules' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-20">
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-sidebar rounded-2xl flex items-center justify-center text-white shadow-xl shadow-sidebar/10">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Institution Rules & Policies</h2>
                  <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Global conditions governing system behavior</p>
                </div>
              </div>
              {isEditing && (
                <button
                  onClick={() => setIsAddingRule(true)}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20"
                >
                  <Plus className="w-4 h-4" />
                  Add New Rule
                </button>
              )}
            </div>

            {isAddingRule && (
              <div className="p-6 bg-neutral-50 rounded-3xl border-2 border-dashed border-neutral-200 space-y-4 animate-in zoom-in-95 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-2">Rule Title</label>
                    <input 
                      type="text"
                      placeholder="e.g. Weekend Protocol"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 outline-none focus:border-primary font-bold text-sm"
                      value={newRule.title}
                      onChange={e => setNewRule({...newRule, title: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-2">Category</label>
                    <select
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 outline-none focus:border-primary font-bold text-sm"
                      value={newRule.category}
                      onChange={e => setNewRule({...newRule, category: e.target.value})}
                    >
                      <option value="Academic">Academic & Attendance</option>
                      <option value="Finance">Institutional Finance</option>
                      <option value="HR & Payroll">HR & Staff Payroll</option>
                      <option value="Operations">Campus Operations</option>
                      <option value="General">General Policies</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-2">Rule Description</label>
                  <textarea 
                    placeholder="Provide details about this institution policy..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-neutral-100 outline-none focus:border-primary font-medium text-sm resize-none"
                    value={newRule.description}
                    onChange={e => setNewRule({...newRule, description: e.target.value})}
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleAddRule}
                    className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-sidebar transition-all flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" /> Save Rule
                  </button>
                  <button 
                    onClick={() => {
                      setIsAddingRule(false);
                      setNewRule({ title: '', description: '', category: 'General' });
                    }}
                    className="px-6 py-3 bg-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-12">
              {[
                { name: 'Academic', icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                { name: 'Finance', icon: CreditCard, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
                { name: 'HR & Payroll', icon: User, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
                { name: 'Operations', icon: Layout, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                { name: 'General', icon: ShieldCheck, color: 'text-neutral-600', bg: 'bg-neutral-50', border: 'border-neutral-100' }
              ].map(dept => {
                const deptRules = rules.filter(r => r.category === dept.name || (dept.name === 'General' && !r.category));
                if (deptRules.length === 0 && !isEditing) return null;

                return (
                  <div key={dept.name} className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
                      <div className={`w-10 h-10 ${dept.bg} ${dept.color} rounded-2xl flex items-center justify-center`}>
                        <dept.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-neutral-900 uppercase tracking-tight">{dept.name} Department</h3>
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Departmental Rules & Logic</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {deptRules.map((rule, idx) => (
                        <div key={rule.id || idx} className={`group relative p-6 bg-white rounded-3xl border ${dept.border} space-y-4 hover:shadow-xl hover:shadow-neutral-50 transition-all duration-500`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                                rule.iconType === 'attendance' ? 'bg-emerald-100 text-emerald-600' :
                                rule.iconType === 'leave' ? 'bg-orange-100 text-orange-600' :
                                rule.iconType === 'holiday' ? 'bg-indigo-100 text-indigo-600' :
                                rule.iconType === 'salary' ? 'bg-blue-100 text-blue-600' :
                                rule.iconType === 'deduction' ? 'bg-rose-100 text-rose-600' :
                                rule.iconType === 'promotion' ? 'bg-amber-100 text-amber-600' :
                                rule.iconType === 'fee' ? 'bg-cyan-100 text-cyan-600' :
                                dept.bg + ' ' + dept.color
                              }`}>
                                {rule.iconType === 'attendance' && <FileCheck className="w-4 h-4" />}
                                {rule.iconType === 'leave' && <Calendar className="w-4 h-4" />}
                                {rule.iconType === 'holiday' && <Sparkles className="w-4 h-4" />}
                                {rule.iconType === 'salary' && <TrendingUp className="w-4 h-4" />}
                                {rule.iconType === 'deduction' && <AlertTriangle className="w-4 h-4" />}
                                {rule.iconType === 'promotion' && <TrendingUp className="w-4 h-4" />}
                                {rule.iconType === 'fee' && <CreditCard className="w-4 h-4" />}
                                {!rule.iconType && <dept.icon className="w-4 h-4" />}
                              </div>
                              <h3 className="font-bold text-sidebar uppercase tracking-tight text-sm">{rule.title}</h3>
                            </div>
                            {isEditing && (
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteRule(rule.id);
                                }}
                                className="p-2 text-neutral-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all relative z-10"
                                title="Delete Rule"
                              >
                                <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                              </button>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="flex gap-2">
                               <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                  rule.iconType === 'attendance' ? 'bg-emerald-500' :
                                  rule.iconType === 'leave' ? 'bg-orange-500' :
                                  rule.iconType === 'holiday' ? 'bg-indigo-500' :
                                  rule.iconType === 'salary' ? 'bg-blue-500' :
                                  rule.iconType === 'deduction' ? 'bg-rose-500' :
                                  rule.iconType === 'promotion' ? 'bg-amber-500' :
                                  rule.iconType === 'fee' ? 'bg-cyan-500' :
                                  dept.color.replace('text-', 'bg-')
                               }`} />
                               <p className="text-xs text-neutral-600 leading-relaxed font-medium">
                                 {rule.description}
                               </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-6 bg-sidebar rounded-3xl text-white">
              <div className="flex items-center gap-3 mb-2">
                <Bot className="w-5 h-5 text-primary" />
                <h4 className="font-bold uppercase tracking-widest text-xs">AI Enforcement</h4>
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                These rules are applied in real-time by the ERP System Core and monitored by the AI Bot. Administrators can update these policies during "Edit Profile" mode to customize institution behavior.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-20">
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/10">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Messaging Templates</h2>
                  <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Global WhatsApp & SMS communication logic</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {hasPermission('settings_school') && (
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${
                      isEditing 
                      ? 'bg-neutral-800 text-white shadow-neutral-200' 
                      : 'bg-white text-neutral-600 border border-neutral-100 hover:bg-neutral-50 shadow-neutral-100'
                    }`}
                  >
                    <Edit2 className="w-4 h-4" />
                    {isEditing ? 'Cancel Editing' : 'Enable Editing'}
                  </button>
                )}
                {isEditing && (
                  <button
                    onClick={() => setIsAddingTemplate(true)}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20"
                  >
                    <Plus className="w-4 h-4" />
                    New Template
                  </button>
                )}
              </div>
            </div>

            {isAddingTemplate && (
              <div className="p-8 bg-neutral-50 rounded-[2.5rem] border-2 border-dashed border-neutral-200 space-y-6 animate-in zoom-in-95 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-2">Template Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Exam Schedule Alert"
                      className="w-full px-4 py-3 rounded-2xl border border-neutral-100 outline-none focus:border-primary font-bold text-sm"
                      value={newTemplate.name}
                      onChange={e => setNewTemplate({...newTemplate, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-2">Event Trigger Key</label>
                    <input 
                      type="text"
                      placeholder="e.g. exam_alert"
                      className="w-full px-4 py-3 rounded-2xl border border-neutral-100 outline-none focus:border-primary font-bold text-sm"
                      value={newTemplate.event}
                      onChange={e => setNewTemplate({...newTemplate, event: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-2">Message Content</label>
                  <textarea 
                    placeholder="Type your message here. Use {{placeholder_name}} for dynamic values..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-2xl border border-neutral-100 outline-none focus:border-primary font-medium text-sm resize-none"
                    value={newTemplate.content}
                    onChange={e => setNewTemplate({...newTemplate, content: e.target.value})}
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      handleUpdateTemplate('', newTemplate);
                      setIsAddingTemplate(false);
                      setNewTemplate({ name: '', event: '', content: '', placeholders: [], isActive: true });
                    }}
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-sidebar transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                  >
                    <Save className="w-4 h-4" /> Save Template
                  </button>
                  <button 
                    onClick={() => {
                      setIsAddingTemplate(false);
                      setNewTemplate({ name: '', event: '', content: '', placeholders: [], isActive: true });
                    }}
                    className="px-8 py-4 bg-neutral-200 text-neutral-600 rounded-2xl font-bold hover:bg-neutral-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6">
              {templates.map((template) => (
                <div key={template.id} className="group relative p-8 bg-neutral-50 rounded-[2.5rem] border border-neutral-100 space-y-6 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 hover:bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-sidebar uppercase tracking-tight">{template.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest rounded-md border border-primary/10">Event: {template.event}</span>
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Updated {new Date(template.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isEditing && (
                      <div className="flex items-center gap-2">
                        {editingTemplateId === template.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                handleUpdateTemplate(template.id, { content: editContent });
                                setEditingTemplateId(null);
                              }}
                              className="p-2.5 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:bg-sidebar transition-all"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingTemplateId(null)}
                              className="p-2.5 bg-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-300 transition-all"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingTemplateId(template.id);
                              setEditContent(template.content);
                            }}
                            className="p-2.5 bg-white text-neutral-400 hover:text-primary rounded-xl shadow-sm border border-neutral-100 hover:border-primary/20 transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="p-6 bg-white rounded-3xl border border-neutral-100 relative group/msg">
                       <div className="absolute top-4 right-4 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                         <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">Message Preview</span>
                       </div>
                       {editingTemplateId === template.id ? (
                         <textarea
                           className="w-full h-32 bg-neutral-50 p-4 rounded-2xl border border-primary/20 outline-none focus:ring-2 focus:ring-primary/10 font-medium text-sm resize-none"
                           value={editContent}
                           onChange={(e) => setEditContent(e.target.value)}
                           placeholder="Type template content..."
                         />
                       ) : (
                         <p className="text-sm text-neutral-600 leading-relaxed font-medium whitespace-pre-wrap">
                           {template.content}
                         </p>
                       )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-primary" /> Supported Dynamic Placeholders
                      </label>
                      <div className="flex flex-wrap gap-2">
                         {template.placeholders?.map((p: string) => (
                           <button 
                            key={p} 
                            onClick={() => {
                              if (!isEditing) return;
                              const currentContent = editingTemplateId === template.id ? editContent : template.content;
                              const newContent = `${currentContent} {{${p}}}`;
                              
                              if (editingTemplateId === template.id) {
                                setEditContent(newContent);
                              } else {
                                handleUpdateTemplate(template.id, { content: newContent });
                              }
                            }}
                            title={isEditing ? "Click to append to template" : ""}
                            className="px-3 py-1.5 bg-white text-primary text-[10px] font-black rounded-xl border border-neutral-200 hover:border-primary transition-all shadow-sm flex items-center gap-2"
                           >
                             <code className="bg-primary/5 px-1 rounded text-[11px] font-bold">{"{{"}{p}{"}}"}</code>
                           </button>
                         ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 bg-sidebar rounded-[2.5rem] text-white relative overflow-hidden">
               <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl opacity-50" />
               <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                       <Bot className="w-6 h-6 text-primary" />
                    </div>
                    <h4 className="font-bold uppercase tracking-widest text-sm">Template Architecture</h4>
                  </div>
                  <p className="text-sm opacity-80 leading-relaxed font-medium">
                    Our communication engine uses these templates to synthesize messages dynamically. 
                    Placeholders like <code className="text-primary">{"{{student_name}}"}</code> are replaced with live data from the database before dispatch. 
                    Templates can be edited by authorized administrators only.
                  </p>
                  <div className="flex flex-wrap gap-4 pt-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      <CheckCircle2 className="w-4 h-4" /> Multi-language Support
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      <CheckCircle2 className="w-4 h-4" /> Emoji Enabled
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      <CheckCircle2 className="w-4 h-4" /> Character Limit Check
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'landing' && (
        <form onSubmit={handleSaveSiteConfig} className="space-y-8 animate-in fade-in duration-500 pb-20">
          {/* Hero Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/10">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Hero Section</h2>
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Main landing page headline and image</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Main Title</label>
                  <input
                    type="text"
                    value={localSiteConfig.hero.title}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, hero: {...localSiteConfig.hero, title: e.target.value}})}
                    placeholder="e.g. Nurturing Visionary Minds"
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-neutral-900 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Hero Subtitle</label>
                  <textarea
                    rows={3}
                    value={localSiteConfig.hero.subtitle}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, hero: {...localSiteConfig.hero, subtitle: e.target.value}})}
                    placeholder="Discover the history, people, and methodology..."
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-medium text-neutral-600 transition-all resize-none"
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Button Text</label>
                   <input
                    type="text"
                    value={localSiteConfig.hero.ctaText || ''}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, hero: {...localSiteConfig.hero, ctaText: e.target.value}})}
                    placeholder="e.g. Access Portal"
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-neutral-900 transition-all"
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Explore Button Text</label>
                   <input
                    type="text"
                    value={localSiteConfig.hero.exploreText || ''}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, hero: {...localSiteConfig.hero, exploreText: e.target.value}})}
                    placeholder="e.g. Explore Legacy"
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-neutral-900 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Hero Background Image</label>
                <div className="relative group aspect-video rounded-3xl overflow-hidden border-2 border-dashed border-neutral-200 bg-neutral-50 flex items-center justify-center">
                  {localSiteConfig.hero.backgroundImage ? (
                    <img 
                      src={normalizeUrl(localSiteConfig.hero.backgroundImage)} 
                      alt="Hero" 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-neutral-200" />
                  )}
                  <label className="absolute inset-0 bg-neutral-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer">
                    <div className="bg-white text-neutral-900 px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                      <Upload className="w-4 h-4" /> Change Image
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleNestedImageUpload('hero.backgroundImage')} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/10">
                <AlignLeft className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">About / Legacy Section</h2>
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">History and vision details</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Prefix Label</label>
                  <input
                    type="text"
                    value={localSiteConfig.about.prefix}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, about: {...localSiteConfig.about, prefix: e.target.value}})}
                    placeholder="e.g. LEGACY OF EXCELLENCE"
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-neutral-900 transition-all uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">About Title</label>
                  <input
                    type="text"
                    value={localSiteConfig.about.title}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, about: {...localSiteConfig.about, title: e.target.value}})}
                    placeholder="e.g. A Journey Through Time"
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-neutral-900 transition-all uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Tagline/Establishment</label>
                  <input
                    type="text"
                    value={localSiteConfig.about.tagline || ''}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, about: {...localSiteConfig.about, tagline: e.target.value}})}
                    placeholder="e.g. ESTABLISHED 1954"
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold text-neutral-900 transition-all uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Description Text</label>
                  <textarea
                    rows={4}
                    value={localSiteConfig.about.text}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, about: {...localSiteConfig.about, text: e.target.value}})}
                    placeholder="Founded in the heart of the community..."
                    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-medium text-neutral-600 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Grid Gallery (4 Images)</label>
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1, 2, 3].map((idx) => (
                    <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden border border-neutral-100 bg-neutral-50 flex items-center justify-center">
                      {siteConfig.about.gridPhotos?.[idx] ? (
                        <img 
                          src={normalizeUrl(siteConfig.about.gridPhotos[idx])} 
                          alt={`Gallery ${idx}`} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-neutral-200" />
                      )}
                      <label className="absolute inset-0 bg-neutral-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer">
                        <Upload className="text-white w-5 h-5" />
                        <input type="file" className="hidden" accept="image/*" onChange={handleGridImageUpload(idx)} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats Section */}
              <div className="md:col-span-2 space-y-4 pt-6 border-t border-neutral-50">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Institutional Stats</label>
                  <button
                    type="button"
                    onClick={() => setLocalSiteConfig({
                      ...localSiteConfig, 
                      about: { 
                        ...localSiteConfig.about, 
                        stats: [...(localSiteConfig.about.stats || []), { value: '', label: '' }] 
                      }
                    })}
                    className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest hover:underline"
                  >
                    <Plus className="w-3 h-3" /> Add Stat
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {(localSiteConfig.about.stats || []).map((stat: any, idx: number) => (
                    <div key={idx} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-3 relative group">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newStats = localSiteConfig.about.stats.filter((_: any, i: number) => i !== idx);
                          setLocalSiteConfig({...localSiteConfig, about: {...localSiteConfig.about, stats: newStats}});
                        }}
                        className="absolute top-2 right-2 text-neutral-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity relative z-10"
                      >
                        <Trash2 className="w-3 h-3 pointer-events-none" />
                      </button>
                      <input
                        type="text"
                        value={stat.value}
                        onChange={e => {
                          const newStats = [...localSiteConfig.about.stats];
                          newStats[idx].value = e.target.value;
                          setLocalSiteConfig({...localSiteConfig, about: {...localSiteConfig.about, stats: newStats}});
                        }}
                        placeholder="Value (e.g. 70+)"
                        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-bold text-primary"
                      />
                      <input
                        type="text"
                        value={stat.label}
                        onChange={e => {
                          const newStats = [...localSiteConfig.about.stats];
                          newStats[idx].label = e.target.value;
                          setLocalSiteConfig({...localSiteConfig, about: {...localSiteConfig.about, stats: newStats}});
                        }}
                        placeholder="Label (e.g. YEARS)"
                        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-[10px] font-black uppercase tracking-widest"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Leadership Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Leadership Team</h2>
                  <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Identify your guiding lights</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocalSiteConfig({...localSiteConfig, leadership: [...(localSiteConfig.leadership || []), { name: '', role: '', quote: '', photoUrl: '' }]})}
                className="flex items-center gap-2 bg-neutral-100 text-neutral-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
              >
                <Plus className="w-4 h-4" /> Add Leader
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {(localSiteConfig.leadership || []).map((leader: any, idx: number) => (
                <div key={idx} className="p-6 bg-neutral-50 rounded-3xl border border-neutral-100 space-y-6 relative group">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLocalSiteConfig({...localSiteConfig, leadership: localSiteConfig.leadership.filter((_: any, i: number) => i !== idx)});
                    }}
                    className="absolute top-4 right-4 text-neutral-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity relative z-10"
                  >
                    <Trash2 className="w-5 h-5 pointer-events-none" />
                  </button>
                  
                  <div className="flex gap-6">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-neutral-200 shrink-0 relative group/photo">
                      {leader.photoUrl ? (
                        <img src={normalizeUrl(leader.photoUrl)} alt={leader.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-8 h-8 text-neutral-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      )}
                      <label className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                        <Upload className="text-white w-5 h-5" />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                setLoading(true);
                                const url = await uploadService.uploadFile(file);
                                const newLeaders = [...localSiteConfig.leadership];
                                newLeaders[idx].photoUrl = url;
                                setLocalSiteConfig({...localSiteConfig, leadership: newLeaders});
                                toast.success("Photo uploaded");
                              } catch (err) {
                                toast.error("Upload failed");
                              } finally {
                                setLoading(false);
                              }
                            }
                          }} 
                        />
                      </label>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Name</label>
                        <input
                          type="text"
                          value={leader.name}
                          onChange={e => {
                            const newLeaders = [...localSiteConfig.leadership];
                            newLeaders[idx].name = e.target.value;
                            setLocalSiteConfig({...localSiteConfig, leadership: newLeaders});
                          }}
                          className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Role</label>
                        <input
                          type="text"
                          value={leader.role}
                          onChange={e => {
                            const newLeaders = [...localSiteConfig.leadership];
                            newLeaders[idx].role = e.target.value;
                            setLocalSiteConfig({...localSiteConfig, leadership: newLeaders});
                          }}
                          className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-black text-indigo-600 uppercase tracking-widest"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Personal Quote</label>
                    <textarea
                      rows={3}
                      value={leader.quote}
                      onChange={e => {
                        const newLeaders = [...localSiteConfig.leadership];
                        newLeaders[idx].quote = e.target.value;
                        setLocalSiteConfig({...localSiteConfig, leadership: newLeaders});
                      }}
                      className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-medium italic"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Methodology Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/10">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Methodology / Pillars</h2>
                  <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Key educational pillars</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocalSiteConfig({...localSiteConfig, methodology: [...localSiteConfig.methodology, { title: '', description: '', number: `0${localSiteConfig.methodology.length + 1}` }]})}
                className="flex items-center gap-2 bg-neutral-100 text-neutral-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all"
              >
                <Plus className="w-4 h-4" /> Add Pillar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-neutral-50 pb-8 mb-8">
               <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Pillars Section Title</label>
                <input
                  type="text"
                  value={localSiteConfig.pillars?.title || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, pillars: {...localSiteConfig.pillars, title: e.target.value}})}
                  placeholder="The Antony's Method"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Prospectus Button Text</label>
                <input
                  type="text"
                  value={localSiteConfig.pillars?.buttonText || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, pillars: {...localSiteConfig.pillars, buttonText: e.target.value}})}
                  placeholder="Download Prospectus"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Pillars Description</label>
                <textarea
                  rows={2}
                  value={localSiteConfig.pillars?.subtitle || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, pillars: {...localSiteConfig.pillars, subtitle: e.target.value}})}
                  placeholder="We don't just teach subjects; we cultivate mindsets..."
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-medium text-neutral-600 resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {localSiteConfig.methodology.map((m: any, idx: number) => (
                <div key={idx} className="p-6 bg-neutral-50 rounded-3xl border border-neutral-100 space-y-4 relative">
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLocalSiteConfig({...localSiteConfig, methodology: localSiteConfig.methodology.filter((_: any, i: number) => i !== idx)});
                    }}
                    className="absolute top-4 right-4 text-neutral-300 hover:text-rose-500 relative z-10"
                  >
                    <Trash2 className="w-4 h-4 pointer-events-none" />
                  </button>
                  <div className="flex gap-4">
                    <div className="w-12 space-y-2">
                       <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">No.</label>
                       <input
                        type="text"
                        value={m.number}
                        onChange={e => {
                          const newM = [...localSiteConfig.methodology];
                          newM[idx].number = e.target.value;
                          setLocalSiteConfig({...localSiteConfig, methodology: newM});
                        }}
                        className="w-full px-2 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-black text-center"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Title</label>
                      <input
                        type="text"
                        value={m.title}
                        onChange={e => {
                          const newM = [...localSiteConfig.methodology];
                          newM[idx].title = e.target.value;
                          setLocalSiteConfig({...localSiteConfig, methodology: newM});
                        }}
                        placeholder="e.g. Critical Inquiry"
                        className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Description</label>
                    <textarea
                      rows={2}
                      value={m.description}
                      onChange={e => {
                        const newM = [...localSiteConfig.methodology];
                        newM[idx].description = e.target.value;
                        setLocalSiteConfig({...localSiteConfig, methodology: newM});
                      }}
                      className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-medium resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neutral-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-neutral-100">
                <AlignLeft className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Footer & Branding</h2>
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Global site footer and identity details</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Logo Slogan</label>
                <input
                  type="text"
                  value={localSiteConfig.slogan || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, slogan: e.target.value})}
                  placeholder="e.g. LEGACY OF EXCELLENCE"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Establishment text</label>
                <input
                  type="text"
                  value={localSiteConfig.establishedText || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, establishedText: e.target.value})}
                  placeholder="e.g. Excellence in education since 2000"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Contact Email (Footer)</label>
                <input
                  type="email"
                  value={localSiteConfig.footerEmail || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, footerEmail: e.target.value})}
                  placeholder="admin@school.in"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Contact Phone (Footer)</label>
                <input
                  type="text"
                  value={localSiteConfig.footerPhone || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, footerPhone: e.target.value})}
                  placeholder="+91 12345 67890"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">School Address</label>
                <input
                  type="text"
                  value={localSiteConfig.address || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, address: e.target.value})}
                  placeholder="e.g. 123 Education Lane, City, State"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold transition-all"
                />
              </div>

              <div className="space-y-2 col-span-1 md:col-span-2">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Google Maps Embed URL</label>
                  <a 
                    href="https://support.google.com/maps/answer/144361" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-primary text-[9px] font-black uppercase hover:underline"
                  >
                    How to get this?
                  </a>
                </div>
                <input
                  type="text"
                  value={localSiteConfig.mapsUrl || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, mapsUrl: e.target.value})}
                  placeholder="Paste URL starting with https://www.google.com/maps/embed?..."
                  className={`w-full px-6 py-4 bg-neutral-50 border ${localSiteConfig.mapsUrl && !localSiteConfig.mapsUrl.includes('/embed') ? 'border-rose-500' : 'border-neutral-100'} rounded-2xl outline-none focus:border-primary font-bold transition-all text-xs`}
                />
                {localSiteConfig.mapsUrl && !localSiteConfig.mapsUrl.includes('/embed') && (
                  <p className="text-[9px] text-rose-500 font-bold uppercase mt-1">
                    Error: This looks like a standard link. Please use an "Embed" URL from the Google Maps Share menu.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Admissions Status</label>
                <select 
                  value={localSiteConfig.admissionStatus || 'open'}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, admissionStatus: e.target.value})}
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-bold transition-all"
                >
                  <option value="open">Admissions Open</option>
                  <option value="closed">Admissions Closed</option>
                  <option value="opening_soon">Opening Soon</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Footer Description</label>
              <textarea
                rows={3}
                value={localSiteConfig.footerDescription || ''}
                onChange={e => setLocalSiteConfig({...localSiteConfig, footerDescription: e.target.value})}
                placeholder="Excellence in education since 1954..."
                className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary font-medium text-neutral-600 resize-none"
              />
            </div>
          </div>

          {/* Social Links Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/10">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Social Links</h2>
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Presence across platforms</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { key: 'facebook', icon: Facebook, color: 'bg-blue-50 text-blue-600' },
                { key: 'twitter', icon: Twitter, color: 'bg-sky-50 text-sky-500' },
                { key: 'instagram', icon: Instagram, color: 'bg-pink-50 text-pink-600' },
                { key: 'youtube', icon: Youtube, color: 'bg-red-50 text-red-600' },
                { key: 'linkedin', icon: Linkedin, color: 'bg-blue-50 text-blue-700' }
              ].map((s) => (
                <div key={s.key} className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${s.color}`}><s.icon className="w-3 h-3" /></div>
                    {s.key}
                  </label>
                  <input
                    type="text"
                    value={localSiteConfig.socialLinks?.[s.key] || ''}
                    onChange={e => setLocalSiteConfig({...localSiteConfig, socialLinks: {...localSiteConfig.socialLinks, [s.key]: e.target.value}})}
                    placeholder="https://..."
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary text-xs font-medium"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Gallery Videos Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-red-100">
                  <Youtube className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">Gallery Videos</h2>
                  <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">YouTube embed URLs or IDs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocalSiteConfig({...localSiteConfig, galleryVideos: [...(localSiteConfig.galleryVideos || []), '']})}
                className="flex items-center gap-2 bg-neutral-100 text-neutral-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
              >
                <Plus className="w-4 h-4" /> Add Video
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(localSiteConfig.galleryVideos || []).map((video: string, idx: number) => (
                <div key={idx} className="flex gap-4 items-end">
                   <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Video URL / ID {idx + 1}</label>
                      <input
                        type="text"
                        value={video}
                        onChange={e => {
                          const newVideos = [...localSiteConfig.galleryVideos];
                          newVideos[idx] = e.target.value;
                          setLocalSiteConfig({...localSiteConfig, galleryVideos: newVideos});
                        }}
                        placeholder="e.g. dQw4w9WgXcQ"
                        className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-red-600 text-xs font-medium"
                      />
                   </div>
                   <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLocalSiteConfig({...localSiteConfig, galleryVideos: localSiteConfig.galleryVideos.filter((_: any, i: number) => i !== idx)});
                    }}
                    className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 relative z-10"
                   >
                     <Trash2 className="w-5 h-5 pointer-events-none" />
                   </button>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-amber-100">
                <Layout className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">CTA Section</h2>
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">The "Join Us" section at the bottom</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">CTA Title</label>
                <input
                  type="text"
                  value={localSiteConfig.cta?.title || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, cta: {...localSiteConfig.cta, title: e.target.value}})}
                  placeholder="Ready to Shape Your Future?"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-amber-500 font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Button Text</label>
                <input
                  type="text"
                  value={localSiteConfig.cta?.buttonText || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, cta: {...localSiteConfig.cta, buttonText: e.target.value}})}
                  placeholder="Apply Now"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-amber-500 font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Contact Button Text</label>
                <input
                  type="text"
                  value={localSiteConfig.cta?.contactText || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, cta: {...localSiteConfig.cta, contactText: e.target.value}})}
                  placeholder="Contact Admissions"
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-amber-500 font-bold"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">CTA Description</label>
                <textarea
                  rows={2}
                  value={localSiteConfig.cta?.description || ''}
                  onChange={e => setLocalSiteConfig({...localSiteConfig, cta: {...localSiteConfig.cta, description: e.target.value}})}
                  placeholder="Applications for the next academic year are now open..."
                  className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-amber-500 font-medium text-neutral-600 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="fixed bottom-10 right-10 z-50">
             <button
               type="submit"
               disabled={loading}
               className="px-10 py-5 bg-sidebar text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-primary transition-all shadow-2xl flex items-center gap-4 group"
             >
               {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-6 h-6 group-hover:scale-110 transition-transform" />}
               Save Landing Configuration
             </button>
          </div>
        </form>
      )}

      {activeTab === 'promotion' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Promotion Assistant Card (Moved from Dashboard) */}
          <div className="bg-primary/5 p-8 rounded-3xl border border-primary/20 relative overflow-hidden group">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-primary shadow-lg shrink-0">
                <TrendingUp className="w-8 h-8" />
              </div>
              <div className="space-y-2 flex-1 text-center md:text-left">
                <h3 className="text-xl font-black text-sidebar">Promotion Assistant</h3>
                <p className="text-neutral-500 font-medium text-sm">
                  The End of Year cycle is a critical operation. I'm here to ensure student data integrity, balance migrations, and academic year upgrades are handled precisely.
                </p>
              </div>
              <div className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-xl border border-primary/10">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Protocol Version</p>
                <p className="font-bold text-sidebar">v1.2-Stable</p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-100 p-8 rounded-[2.5rem] space-y-8">
          <div className="flex items-center gap-3 text-red-600">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-xl font-bold">End of Year Operations</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="font-bold text-red-900 mb-2">Promote Students & Carry Forward Dues</h3>
              <p className="text-sm text-red-700 leading-relaxed">
                This powerful operation will move students from one academic year to another and automatically 
                calculate their remaining fee balance, carrying it forward as "Last Class Fee Due".
              </p>
              <ul className="text-[11px] text-red-600 mt-3 list-disc list-inside space-y-1 font-medium">
                <li>Updates Academic Year in student profiles</li>
                <li>Calculates (Total Fee - Paid Fee) from old year</li>
                <li>Adds balance to student's "Last Class Fee Due"</li>
              </ul>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">From Year</label>
                  <select 
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-sm font-bold"
                    value={promoteConfig.fromYear}
                    onChange={(e) => setPromoteConfig(prev => ({ ...prev, fromYear: e.target.value }))}
                  >
                    <option value="">Select</option>
                    {settings.academicYears?.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="pt-4 text-neutral-300">
                  <ArrowRight className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">To Year</label>
                  <select 
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-sm font-bold"
                    value={promoteConfig.toYear}
                    onChange={(e) => setPromoteConfig(prev => ({ ...prev, toYear: e.target.value }))}
                  >
                    <option value="">Select</option>
                    {settings.academicYears?.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <button 
                onClick={() => setShowPromoteModal(true)}
                className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
              >
                <TrendingUp className="w-5 h-5" />
                Begin Promotion Cycle
              </button>

              <div className="pt-4 border-t border-red-100">
                <p className="text-[10px] text-red-500 font-bold text-center italic">
                  Missing students in source year? 
                  <button 
                    onClick={() => setActiveTab('diagnostics')}
                    className="ml-1 underline hover:text-red-700"
                  >
                    Run Repair Tool
                  </button>
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Promotion Confirm Modal */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6 border-b border-neutral-100 bg-red-50 text-red-600">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <AlertTriangle className="w-6 h-6" />
                Confirm Bulk Promotion
              </h2>
            </div>
            <div className="p-8">
              <p className="text-neutral-600 leading-relaxed">
                You are about to promote students from <span className="font-bold text-red-600">{promoteConfig.fromYear}</span> to <span className="font-bold text-red-600">{promoteConfig.toYear}</span>.
                <br /><br />
                This will automatically calculate any unpaid fees for students in <span className="font-bold">{promoteConfig.fromYear}</span> and carry them forward. This action is irreversible.
              </p>
              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => setShowPromoteModal(false)}
                  className="flex-1 px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handlePromoteStudents}
                  disabled={promoteConfig.isPromoting}
                  className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {promoteConfig.isPromoting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Confirm Promotion
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
          <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-rose-100">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-neutral-900 uppercase tracking-tight">System Maintenance</h2>
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">Manage application health, indexes, and backups</p>
              </div>
            </div>

            {/* Interactive Schema Data Flow */}
            <ERPDatabaseFlow />

            {/* Database Index Error Resolution Section */}
            <div className="p-8 bg-neutral-50 rounded-[2rem] border border-neutral-100 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-md font-extrabold uppercase tracking-tight text-sidebar">Database Index Monitor</h3>
                    <p className="text-xs text-neutral-500">Track, verify, and resolve missing database composite indexes</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="https://console.firebase.google.com/project/antonyserp-cc9df/firestore/databases/(default)/indexes"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-rose-500/20 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Open Firebase Indexes Console
                  </a>
                  {indexErrors.length > 0 && (
                    <button 
                      onClick={handleClearAllIndexErrors}
                      className="px-4 py-2 bg-neutral-200 hover:bg-rose-50 hover:text-rose-600 text-neutral-700 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all"
                    >
                      Clear All Logs
                    </button>
                  )}
                </div>
              </div>

              {/* Step-by-Step Educational Fix Guide */}
              <div className="bg-white p-6 rounded-2xl border border-neutral-150/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-sidebar flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  How to Fix or Create Composite Indexes
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs divide-y md:divide-y-0 md:divide-x divide-neutral-100 animate-in fade-in duration-300">
                  <div className="space-y-1 md:pr-4">
                    <p className="font-black text-rose-600 uppercase text-[10px] tracking-wider">Step 1: Get the Link</p>
                    <p className="text-neutral-500 font-semibold leading-relaxed">
                      Click the <span className="font-extrabold text-rose-600 uppercase">"Open Firebase Indexes Console"</span> button, click <span className="font-extrabold text-rose-600">"Create Index"</span> on logged errors, or paste a link from your developer console below.
                    </p>
                  </div>
                  <div className="space-y-1 pt-3 md:pt-0 md:px-4">
                    <p className="font-black text-amber-500 uppercase text-[10px] tracking-wider">Step 2: Confirm in Console</p>
                    <p className="text-neutral-500 font-semibold leading-relaxed">
                      The Firebase Console automatically maps fields. Click the blue <span className="font-extrabold">"Create index"</span> button to deploy it in Google Cloud.
                    </p>
                  </div>
                  <div className="space-y-1 pt-3 md:pt-0 md:pl-4">
                    <p className="font-black text-emerald-500 uppercase text-[10px] tracking-wider">Step 3: Wait & Refresh</p>
                    <p className="text-neutral-500 font-semibold leading-relaxed">
                      Google Cloud takes 2-3 minutes to build. Once status shows <span className="font-extrabold text-emerald-600">Active</span>, refresh this ERP app and everything works perfectly!
                    </p>
                  </div>
                </div>
              </div>

              {/* Manual/Pastable Index Link Helper */}
              <div className="bg-white p-6 rounded-2xl border border-neutral-150/80 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-rose-500">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-sidebar">
                    Quick-Add Missing Index from Console Error
                  </h4>
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed font-medium">
                  If you see an index error anywhere else, copy the Firestore error URL or error message from your browser console, paste it below, and we will create an instant clickable shortcut for you.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Paste your Firebase Console index creation link or error message here..."
                    className="flex-1 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
                    id="manual-index-input"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const val = (e.currentTarget as HTMLInputElement).value.trim();
                        if (!val) return;
                        const match = val.match(/https:\/\/console\.firebase\.google\.com[^\s']+/);
                        const url = match ? match[0] : (val.startsWith('http') ? val : '');
                        if (!url) {
                          toast.error("Could not find a valid Firebase link. Please copy and paste the entire error text.");
                          return;
                        }
                        try {
                          const docId = url.split('create_composite=')[1]?.slice(0, 100).replace(/[^a-zA-Z0-9_-]/g, '_') || String(Date.now());
                          await dbService.set('index_errors', docId, {
                            id: docId,
                            message: `Pasted manual error: ${val.substring(0, 100)}${val.length > 100 ? '...' : ''}`,
                            url,
                            timestamp: new Date().toISOString(),
                            location: 'Manual Registration'
                          });
                          toast.success("Index shortcut successfully added!");
                          (e.currentTarget as HTMLInputElement).value = '';
                          fetchIndexErrors();
                        } catch (err) {
                          toast.error("Failed to add index shortcut.");
                        }
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      const input = document.getElementById('manual-index-input') as HTMLInputElement;
                      const val = input?.value.trim() || '';
                      if (!val) {
                        toast.error("Please paste the link or error text first.");
                        return;
                      }
                      const match = val.match(/https:\/\/console\.firebase\.google\.com[^\s']+/);
                      const url = match ? match[0] : (val.startsWith('http') ? val : '');
                      if (!url) {
                        toast.error("Could not find a valid Firebase link. Please copy and paste the entire error text.");
                        return;
                      }
                      try {
                        const docId = url.split('create_composite=')[1]?.slice(0, 100).replace(/[^a-zA-Z0-9_-]/g, '_') || String(Date.now());
                        await dbService.set('index_errors', docId, {
                          id: docId,
                          message: `Pasted manual error: ${val.substring(0, 100)}${val.length > 100 ? '...' : ''}`,
                          url,
                          timestamp: new Date().toISOString(),
                          location: 'Manual Registration'
                        });
                        toast.success("Index shortcut successfully added!");
                        input.value = '';
                        fetchIndexErrors();
                      } catch (err) {
                        toast.error("Failed to add index shortcut.");
                      }
                    }}
                    className="px-5 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
                  >
                    Generate Link
                  </button>
                </div>
              </div>

              {/* Recommended Composite Indexes Quick-Links Section */}
              <div className="bg-white p-6 rounded-2xl border border-neutral-150/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-sidebar flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-500" />
                  Recommended Common Composite Indexes
                </h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-medium">
                  Below are the most common database queries across the ERP that use sorting or compound filters. If any screen loads slowly or crashes, click these to create the indexes directly in your Firebase Console:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[9px] uppercase font-black text-indigo-600 tracking-wider">Attendance Queries</span>
                      <h5 className="text-xs font-bold text-neutral-800 uppercase mt-0.5">studentId + date</h5>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium leading-relaxed">Required to query attendance logs filtered by student and sorted by date.</p>
                    </div>
                    <a
                      href="https://console.firebase.google.com/project/antonyserp-cc9df/firestore/databases/(default)/indexes"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-extrabold text-primary hover:text-indigo-600 transition-colors uppercase tracking-wider flex items-center gap-1 self-start"
                    >
                      Configure Index <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[9px] uppercase font-black text-rose-600 tracking-wider">Fee Records</span>
                      <h5 className="text-xs font-bold text-neutral-800 uppercase mt-0.5">studentId + academicYear</h5>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium leading-relaxed">Required to pull fee payments filtered by student and sorted by academic year.</p>
                    </div>
                    <a
                      href="https://console.firebase.google.com/project/antonyserp-cc9df/firestore/databases/(default)/indexes"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-extrabold text-primary hover:text-rose-600 transition-colors uppercase tracking-wider flex items-center gap-1 self-start"
                    >
                      Configure Index <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[9px] uppercase font-black text-emerald-600 tracking-wider">Payments & Receipts</span>
                      <h5 className="text-xs font-bold text-neutral-800 uppercase mt-0.5">studentId + timestamp</h5>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium leading-relaxed">Required to view invoice list sorted chronologically for 360 profile views.</p>
                    </div>
                    <a
                      href="https://console.firebase.google.com/project/antonyserp-cc9df/firestore/databases/(default)/indexes"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-extrabold text-primary hover:text-emerald-600 transition-colors uppercase tracking-wider flex items-center gap-1 self-start"
                    >
                      Configure Index <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[9px] uppercase font-black text-amber-600 tracking-wider">Audit History</span>
                      <h5 className="text-xs font-bold text-neutral-800 uppercase mt-0.5">action + timestamp</h5>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium leading-relaxed">Required to filter audit trails by type and display them chronologically.</p>
                    </div>
                    <a
                      href="https://console.firebase.google.com/project/antonyserp-cc9df/firestore/databases/(default)/indexes"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-extrabold text-primary hover:text-amber-600 transition-colors uppercase tracking-wider flex items-center gap-1 self-start"
                    >
                      Configure Index <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              {loadingIndexErrors ? (
                <div className="flex items-center justify-center py-6 text-neutral-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  Checking database index status...
                </div>
              ) : indexErrors.length === 0 ? (
                <div className="p-6 bg-white rounded-2xl border border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-sidebar uppercase">Database Queries Healthy</p>
                      <p className="text-[10px] text-neutral-400">No composite index errors have been reported by client sessions yet.</p>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider italic">
                    All current active queries loaded correctly
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-amber-800 text-xs font-semibold leading-relaxed">
                    ⚠️ <span className="font-extrabold">Warning:</span> Some query filters require custom composite indexes in Google Cloud Firestore. Click the links below to generate them instantly inside the Firebase Console.
                  </div>
                  <div className="divide-y divide-neutral-100 bg-white rounded-2xl border border-neutral-100 overflow-hidden">
                    {indexErrors.map((err) => (
                      <div key={err.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50/40 transition-colors animate-in fade-in duration-200">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-rose-600 uppercase tracking-tight">Missing Composite Index Detected</p>
                          <p className="text-xs text-neutral-600 font-medium break-words leading-relaxed">
                            {err.message || 'Firestore query error'}
                          </p>
                          <div className="flex items-center gap-3 text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                            <span>Detected: {err.timestamp ? format(new Date(err.timestamp), 'PPP p') : 'Unknown Time'}</span>
                            <span>•</span>
                            <span className="truncate max-w-xs" title={err.location}>Route: {err.location || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={err.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-rose-500/10 flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Create Index
                          </a>
                          <button
                            onClick={() => handleDeleteIndexError(err.id)}
                            className="p-2.5 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            title="Dismiss Error Log"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* ERP Application Backup & System Restore Points */}
              <div className="p-8 bg-neutral-50 rounded-[2rem] border border-neutral-100 space-y-8 animate-in fade-in duration-300">
                <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-primary">
                      <History className="w-5 h-5 animate-pulse" />
                      <h3 className="text-lg font-black uppercase tracking-tight text-sidebar">App Backup & Restore Points</h3>
                    </div>
                    <p className="text-xs text-neutral-500 font-medium">
                      Back up the complete application including backend routing logic, all modules, frontend components, configuration files, and Firestore database records. Easily roll back to clean states to recover from errors of failed feature developments.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Create New Backup Card */}
                  <div className="p-6 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-6 lg:col-span-1">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-black tracking-wider text-rose-500">Initiate Protection</span>
                      <h4 className="text-sm font-extrabold uppercase tracking-tight text-sidebar">Create Restore Point</h4>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-2">Descriptive Notes / Purpose</label>
                        <input
                          type="text"
                          value={backupNotes}
                          onChange={(e) => setBackupNotes(e.target.value)}
                          disabled={backupLoading}
                          placeholder="e.g. Before student health updates"
                          className="w-full text-xs font-bold bg-neutral-50 border border-neutral-150 rounded-2xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-rose-400 text-zinc-700"
                        />
                      </div>

                      <div className="flex items-center gap-2.5 p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100">
                        <input
                          type="checkbox"
                          id="backup-db-checkbox"
                          checked={backupDb}
                          onChange={(e) => setBackupDb(e.target.checked)}
                          disabled={backupLoading}
                          className="w-4 h-4 rounded text-rose-500 border-neutral-300 focus:ring-rose-400"
                        />
                        <label htmlFor="backup-db-checkbox" className="select-none flex flex-col cursor-pointer">
                          <span className="text-xs font-extrabold text-sidebar">Snapshot Database</span>
                          <span className="text-[9px] text-neutral-400 font-bold uppercase leading-tight mt-0.5">Export active Firestore collections</span>
                        </label>
                      </div>

                      <button
                        onClick={handleCreateBackup}
                        disabled={backupLoading}
                        className="w-full py-4 bg-primary text-white hover:bg-sidebar transition-all font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/10 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {backupLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Generating Point...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            Create Restore Point
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* List of Backups / Restore Points Table */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-neutral-400">Available Restore Points ({backups.length})</span>
                      {backups.length > 0 && (
                        <button 
                          onClick={fetchBackups} 
                          className="text-[9px] font-black uppercase text-primary hover:underline"
                        >
                          Refresh Log
                        </button>
                      )}
                    </div>

                    {backups.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-neutral-200 text-center space-y-3">
                        <History className="w-10 h-10 text-neutral-300" />
                        <div className="space-y-1">
                          <p className="text-xs font-extrabold text-sidebar uppercase">No Restore Points Created</p>
                          <p className="text-[10px] text-neutral-400 max-w-xs leading-relaxed">
                            Protect your ERP app from unwanted compilation errors of broke packages by recording a safe backup restore checkpoint before editing.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden divide-y divide-neutral-100">
                        {backups.map((bk) => (
                          <div 
                            key={bk.id} 
                            className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
                          >
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-sidebar text-xs truncate max-w-md block">
                                  {bk.notes}
                                </span>
                                <span className="text-[8px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-full font-black uppercase font-mono tracking-wider">
                                  {bk.size}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                                <span>{format(new Date(bk.createdAt), 'PPP p')}</span>
                                <span className="text-neutral-200">•</span>
                                <span className="flex items-center gap-1 text-emerald-600 font-extrabold">
                                  <CheckCircle2 className="w-3 h-3" /> Codebase
                                </span>
                                {bk.hasDatabase && (
                                  <>
                                    <span className="text-neutral-200">•</span>
                                    <span className="flex items-center gap-1 text-primary font-extrabold">
                                      <Database className="w-3 h-3" /> DB Snapshot
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleRestoreBackup(bk.id, bk.notes)}
                                disabled={!!restoringId}
                                className="px-4 py-2 bg-amber-500 border border-amber-600 text-white hover:bg-amber-600 transition-all text-[10px] font-black uppercase tracking-wider rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                Restore App
                              </button>
                              <button
                                onClick={() => handleDeleteBackup(bk.id)}
                                disabled={!!restoringId}
                                className="p-2 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                title="Delete Restore Point"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Restoration Blocking Modal Overlay */}
            {restoringId && (
              <div className="fixed inset-0 bg-sidebar/95 backdrop-blur-md z-[9999] flex flex-col items-center justify-center p-6 text-center text-white space-y-6">
                <div className="w-24 h-24 bg-primary/20 rounded-full border border-primary/30 flex items-center justify-center animate-pulse">
                  <RefreshCw className="w-12 h-12 text-primary animate-spin" />
                </div>
                <div className="space-y-2 max-w-md">
                  <h3 className="text-2xl font-black uppercase tracking-tight">Restoring App State</h3>
                  <p className="text-sm opacity-70 leading-relaxed font-semibold">
                    The system is currently extracting files and restoring Firestore database collections. The server will automatically restart and recompile with the recovered state.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
                  <span className="text-xs font-mono tracking-widest uppercase opacity-50 font-black">Auto-refreshing in 5 seconds...</span>
                </div>
              </div>
            )}

            {/* Results Display */}
            {duplicates.length > 0 && (
              <div className="space-y-4 animate-in slide-in-from-top-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-500">
                   <div className="flex items-center gap-2">
                     <AlertCircle className="w-5 h-5" />
                     <h3 className="font-black uppercase tracking-widest text-xs">Conflict Report ({duplicates.length} conflicts)</h3>
                   </div>
                   <button
                     onClick={handleAutoResolveAllDuplicates}
                     disabled={isScanning}
                     className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-rose-600/20 disabled:opacity-50 flex items-center gap-1.5"
                   >
                     <Sparkles className="w-4 h-4" />
                     {isScanning ? 'Resolving...' : 'Auto-Merge & Clean All Conflicts'}
                   </button>
                </div>
                <div className="grid grid-cols-1 gap-4">
                   {duplicates.map((dup, idx) => (
                     <div key={idx} className="p-6 bg-white rounded-3xl border border-rose-100 space-y-4">
                        <div className="flex items-center justify-between">
                           <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                             {dup.type} Conflict: {dup.value}
                           </span>
                           <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">{dup.count} Records Found</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {dup.users.map((u: any, uidx: number) => (
                            <div key={uidx} className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 flex flex-col">
                              <span className="font-bold text-sidebar text-xs">{u.name}</span>
                              <span className="text-[9px] font-black uppercase text-neutral-400 mt-1">{u.role}</span>
                              <code className="text-[8px] bg-white mt-2 p-1 rounded font-mono truncate">{u.uid}</code>
                            </div>
                          ))}
                        </div>
                     </div>
                   ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
          <AuditTrails />
        </div>
      )}

      {activeTab === 'aws' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
          <form onSubmit={handleSaveAws} className="bg-white p-8 rounded-[3rem] shadow-sm border border-neutral-100 space-y-6">
            <div className="border-b border-neutral-100 pb-5">
              <div className="flex items-center gap-3 text-sidebar">
                <Database className="w-6 h-6 text-primary" />
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">AWS కాన్ఫిగరేషన్లు / AWS Configurations</h2>
                  <p className="text-xs text-neutral-400 mt-1 font-semibold">
                    వ్యవస్థలో ముఖ గుర్తింపు (AWS Rekognition) మరియు ఫైల్ నిల్వ కోసం AWS ఆధారాలను కాన్ఫిగర్ చేయండి.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Access Key ID */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block">
                  AWS Access Key ID / యాక్సెస్ కీ ID
                </label>
                <input
                  type="text"
                  name="awsAccessKeyId"
                  value={formData.awsAccessKeyId || ''}
                  onChange={handleInputChange}
                  disabled={!hasPermission('settings_school')}
                  placeholder="e.g. AKIAIOSFODNN7EXAMPLE"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60 transition-all font-mono"
                />
              </div>

              {/* Secret Access Key */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block">
                  AWS Secret Access Key / సీక్రెట్ యాక్సెస్ కీ
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    name="awsSecretAccessKey"
                    value={formData.awsSecretAccessKey || ''}
                    onChange={handleInputChange}
                    disabled={!hasPermission('settings_school')}
                    placeholder="e.g. wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    className="w-full pl-4 pr-12 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* AWS Region */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block">
                  AWS Region / ప్రాంతం
                </label>
                <input
                  type="text"
                  name="awsRegion"
                  value={formData.awsRegion || ''}
                  onChange={handleInputChange}
                  disabled={!hasPermission('settings_school')}
                  placeholder="e.g. us-east-1"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60 transition-all font-mono"
                />
              </div>

              {/* S3 Bucket Name */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block">
                  S3 Bucket Name / S3 బకెట్ పేరు
                </label>
                <input
                  type="text"
                  name="awsS3BucketName"
                  value={formData.awsS3BucketName || ''}
                  onChange={handleInputChange}
                  disabled={!hasPermission('settings_school')}
                  placeholder="e.g. school-staff-photos-bucket"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60 transition-all font-mono"
                />
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 space-y-1 font-semibold leading-relaxed">
                <p>
                  <strong>హెచ్చరిక (Security Warning):</strong> ఈ ఆధారాలను భద్రంగా ఉంచండి. ముఖ గుర్తింపును ప్రారంభించడానికి
                  ఈ S3 బకెట్ లో సిబ్బంది యొక్క ఫోటోలు వారి యూజర్ ఐడి (UID.jpg లేదా UID.png) పేరుతో నిల్వ చేయబడాలి.
                </p>
                <p>
                  Keep these settings secure. For face-matching to work, pre-registered reference photos of your staff must be
                  uploaded to this S3 bucket, named exactly with their respective UID (e.g. [staff_uid].jpg or [staff_uid].png).
                </p>
              </div>
            </div>

            {hasPermission('settings_school') && (
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 bg-primary hover:bg-sidebar text-white font-black uppercase tracking-widest text-xs px-6 py-3.5 rounded-2xl shadow-lg shadow-primary/20 disabled:opacity-50 transition-all transform active:scale-[0.98]"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  ఆధారాలను సేవ్ చేయండి / Save Credentials
                </button>
              </div>
            )}
          </form>

          {/* AWS Rekognition Photo Migration Panel */}
          <div className="mt-8 pt-8 border-t border-neutral-100 space-y-4">
            <h4 className="text-sm font-black uppercase tracking-wider text-neutral-800">
              One-Time AWS Rekognition Migration / వన్-టైమ్ మైగ్రేషన్
            </h4>
            <p className="text-xs text-neutral-500 leading-relaxed">
              If you are transitioning to AWS Rekognition, you can use this tool to migrate all pre-existing face registrations from Firestore database to S3 and index them in the 'stantonys-staff-collection' collection. This will upload Center, Left, and Right pose photos for each registered user.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleRunAwsMigration}
                disabled={migrationLoading}
                className="flex items-center gap-2 bg-sidebar hover:bg-neutral-900 text-white font-black uppercase tracking-widest text-xs px-6 py-3.5 rounded-2xl shadow-lg disabled:opacity-50 transition-all transform active:scale-[0.98]"
              >
                {migrationLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                Run One-Time Migration / మైగ్రేషన్‌ను ప్రారంభించండి
              </button>
            </div>
            
            {migrationStatus && (
              <div className="mt-6 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl bg-zinc-950 transform transition-all">
                {/* macOS style Title Bar */}
                <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500 block"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-500 block"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-500 block"></span>
                    <span className="ml-3 text-xs font-mono font-bold tracking-wider text-zinc-500 select-none">
                      AWS REKOGNITION CONSOLE
                    </span>
                  </div>
                  <div className="flex items-center">
                    {migrationStatus.status === 'running' && (
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                        Running / నడుస్తోంది ({migrationStatus.progress || 0}/{migrationStatus.total || 0})
                      </span>
                    )}
                    {migrationStatus.status === 'completed' && (
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Completed / పూర్తయింది ({migrationStatus.migrated || 0} Migrated)
                      </span>
                    )}
                    {migrationStatus.status === 'failed' && (
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        Failed / విఫలమైంది
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar panel */}
                {migrationStatus.total > 0 && (
                  <div className="px-6 py-4 bg-zinc-900/30 border-b border-zinc-900/80 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400 font-bold tracking-wide">
                        MIGRATION PROGRESS: {migrationStatus.progress || 0} / {migrationStatus.total} USERS
                      </span>
                      <span className="text-emerald-400 font-black">
                        {Math.round(((migrationStatus.progress || 0) / migrationStatus.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden border border-zinc-800 p-0.5">
                      <div 
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                        style={{ width: `${Math.round(((migrationStatus.progress || 0) / migrationStatus.total) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 mt-1">
                      <span>✅ Migrated / విజయవంతమైనవి: <strong className="text-emerald-400">{migrationStatus.migrated || 0}</strong></span>
                      <span>❌ Failed / విఫలమైనవి: <strong className="text-rose-400">{migrationStatus.failed || 0}</strong></span>
                    </div>
                  </div>
                )}

                {/* Log Terminal console */}
                <div className="p-6 font-mono text-xs leading-relaxed max-h-80 overflow-y-auto text-zinc-300 space-y-2 bg-black/40">
                  {migrationStatus.logs && migrationStatus.logs.map((log: string, idx: number) => {
                    let textClass = "text-zinc-300";
                    if (log.includes("[SYSTEM]")) {
                      textClass = "text-emerald-400 font-bold";
                    } else if (log.includes("✅")) {
                      textClass = "text-emerald-300/90";
                    } else if (log.includes("⚠️")) {
                      textClass = "text-amber-400";
                    } else if (log.includes("❌")) {
                      textClass = "text-rose-400 font-medium";
                    } else if (log.includes("🎉") || log.includes("🏁")) {
                      textClass = "text-teal-300 font-black";
                    }
                    return (
                      <div key={idx} className={`${textClass} whitespace-pre-wrap flex items-start gap-1`}>
                        <span className="text-zinc-600 select-none font-bold">$&gt;</span>
                        <span>{log}</span>
                      </div>
                    );
                  })}
                  
                  {migrationStatus.status === 'running' && (
                    <div className="text-emerald-400 animate-pulse font-bold flex items-center gap-2">
                      <span>$&gt; Waiting for AWS response / AWS స్పందన కోసం నిరీక్షిస్తోంది...</span>
                      <span className="inline-block w-1.5 h-4 bg-emerald-400 align-middle"></span>
                    </div>
                  )}

                  <div ref={terminalEndRef} />
                </div>
              </div>
            )}

            {migrationResult && !migrationStatus && (
              <div className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs font-mono text-rose-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Error Triggering Migration / లోపం:</p>
                  <p className="mt-1">{migrationResult.message}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolSettings;
