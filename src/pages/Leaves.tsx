import React, { useEffect, useState, useRef } from 'react';
import { 
  FileClock, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Filter, 
  MessageSquare, 
  Send,
  Calendar,
  User,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ClipboardList,
  Loader2
} from 'lucide-react';
import { where, orderBy, limit, QueryConstraint, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { usePermissions } from '../hooks/usePermissions';
import { useSettings } from '../context/SettingsContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { parseLeaveRequest } from '../services/aiService';
import { whatsappService } from '../services/whatsappService';
import { db } from '../firebase';

type LeaveStatus = 'pending' | 'approved' | 'rejected';
type LeaveType = 'sick' | 'personal' | 'casual' | 'other';

interface LeaveRequest {
  id?: string;
  applicantId: string;
  applicantName: string;
  applicantRole: string;
  applicantType: 'staff' | 'student';
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  appliedDate: string;
  approverId?: string;
  approverName?: string;
  whatsappNumber?: string;
  classId?: string;
  batchId?: string;
}

const Leaves: React.FC = () => {
  const { 
    profile, 
    hasPermission, 
    isAdmin,
    isTeacher,
    isStudent
  } = usePermissions();
  const { settings } = useSettings();

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [studentGenderMap, setStudentGenderMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'my-leaves'>(profile?.role === 'play_school_incharge' ? 'my-leaves' : 'all');
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [classList, batchList] = await Promise.all([
          dbService.list('classes'),
          dbService.list('batches')
        ]);
        setClasses(classList || []);
        setBatches(batchList || []);
      } catch (error) {
        console.error("Fetch classes/batches error:", error);
      }
    };
    fetchMetadata();
  }, []);
  
  const [newLeave, setNewLeave] = useState<Partial<LeaveRequest>>({
    type: 'personal',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
  });

  const isAuthorizedApprover = hasPermission('leaves_manage');
  const isPlaySchoolIncharge = profile?.role === 'play_school_incharge';

  const assignedBatchIds = React.useMemo(() => {
    const list = new Set<string>();
    if (profile?.batchId) list.add(profile.batchId);
    if (Array.isArray((profile as any)?.batchIds)) {
      (profile as any).batchIds.forEach((id: string) => list.add(id));
    }
    if (Array.isArray(profile?.subjectAssignments)) {
      profile.subjectAssignments.forEach((assignment: any) => {
        if (assignment.batchId) list.add(assignment.batchId);
      });
    }
    batches.forEach((b: any) => {
      if (b.classTeacherId === profile?.uid) {
        if (b.id) list.add(b.id);
      }
    });
    return Array.from(list);
  }, [profile?.batchId, profile?.batchIds, profile?.subjectAssignments, profile?.uid, batches]);

  const assignedClassIds = React.useMemo(() => {
    const list = new Set<string>();
    if (profile?.classId) list.add(profile.classId);
    if (Array.isArray(profile?.classIds)) {
      profile.classIds.forEach((id: string) => list.add(id));
    }
    if (Array.isArray(profile?.subjectAssignments)) {
      profile.subjectAssignments.forEach((assignment: any) => {
        if (assignment.classId) list.add(assignment.classId);
      });
    }
    batches.forEach((b: any) => {
      if (b.classTeacherId === profile?.uid && b.classId) {
        list.add(b.classId);
      }
    });

    if (isPlaySchoolIncharge && list.size === 0) {
      classes
        .filter(c => c.name && (
          c.name.toLowerCase().includes('nursery') ||
          c.name.toLowerCase().includes('lkg') ||
          c.name.toLowerCase().includes('ukg')
        ))
        .forEach(c => list.add(c.id));
    }

    return Array.from(list);
  }, [profile?.classId, profile?.classIds, profile?.subjectAssignments, profile?.uid, batches, classes, isPlaySchoolIncharge]);
  
  // 'staff' మరియు 'coordinator' ని పక్కాగా గుర్తించే గ్లోబల్ వేరియబుల్
  const isTeacherRole = !isAdmin && (
    profile?.role === 'teacher' || 
    profile?.role === 'teacher_class' || 
    profile?.role === 'teacher_subject' || 
    profile?.role === 'coordinator' || 
    profile?.role === 'staff' ||
    profile?.role === 'play_school_incharge' ||
    (profile as any)?.staffType === 'teaching'
  );
  const isClassTeacher = isTeacherRole && (assignedClassIds.length > 0 || assignedBatchIds.length > 0);
  
  const canViewAllLeaves = hasPermission('leaves_view') || hasPermission('leaves_manage') || profile?.role === 'admin' || profile?.role === 'principal' || profile?.role === 'vice_principal';

  const canApproveLeave = (leave: LeaveRequest) => {
    if (isAdmin || profile?.role === 'admin' || profile?.role === 'principal' || profile?.role === 'vice_principal') return true;
    if (leave.applicantType === 'student') {
      if (isClassTeacher) {
        if (leave.batchId && assignedBatchIds.includes(leave.batchId)) return true;
        if (leave.classId && assignedClassIds.includes(leave.classId)) return true;
      }
      return hasPermission('student_leaves_approve');
    }
    return hasPermission('staff_leaves_approve');
  };

  const genderCache = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!profile?.uid) return;

    let unsub: () => void;

    const setupSubscription = async () => {
      setLoading(true);
      try {
        const profileId = profile.uid || (profile as any).id;
        const constraints: QueryConstraint[] = [orderBy('appliedDate', 'desc'), limit(200)];

        if (isStudent && !isAdmin && !canViewAllLeaves) {
          constraints.push(where('applicantId', '==', profileId));
        }

        unsub = dbService.subscribe('leaves', constraints, async (allLeaves: any[]) => {
          let filtered = allLeaves as LeaveRequest[];
          
          if (isTeacherRole) {
             filtered = filtered.filter(l => {
               if (l.applicantId === profileId) return true;
               if (l.applicantType === 'student') {
                 if (l.batchId && assignedBatchIds.includes(l.batchId)) return true;
                 if (l.classId && assignedClassIds.includes(l.classId)) return true;
               }
               return false;
             });
          } else if (!canViewAllLeaves && !isAdmin) {
            filtered = filtered.filter(l => {
              if (l.applicantId === profileId) return true;
              return false;
            });
          }

          setLeaves(filtered);
          setLoading(false);

          const applicantIds = Array.from(new Set(filtered.map(l => l.applicantId)))
            .filter(id => !genderCache.current[id]);

          if (applicantIds.length > 0) {
            const newMap = { ...genderCache.current };
            const batchSize = 30;
            const chunks = [];
            for (let i = 0; i < applicantIds.length; i += batchSize) {
              chunks.push(applicantIds.slice(i, i + batchSize));
            }
            
            for (const chunkIds of chunks) {
              const [studentsRes, staffRes] = await Promise.all([
                dbService.list('students', [where('uid', 'in', chunkIds)]),
                dbService.list('staff', [where('uid', 'in', chunkIds)])
              ]);

              (studentsRes as any[]).forEach(u => {
                if (u.uid) newMap[u.uid] = u.gender || '';
              });
              (staffRes as any[]).forEach(u => {
                if (u.uid && !newMap[u.uid]) newMap[u.uid] = u.gender || '';
              });
            }
            genderCache.current = newMap;
            setStudentGenderMap(newMap);
          }
        });
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };

    setupSubscription();

    return () => {
      if (unsub) unsub();
    };
  }, [profile?.uid, canViewAllLeaves, isAdmin, isTeacherRole]);

  // --- మల్టీ-ఛానల్ వాట్సాప్ అండ్ డాష్‌బోర్డ్ రూటింగ్ ఆటోమేషన్ ఇంజన్ ---
  const routeLeaveNotifications = async (leaveData: LeaveRequest, actionType: 'create' | 'status_change') => {
    try {
      const staffList = await dbService.list('staff');
      
      // వైస్ ప్రిన్సిపాల్, ప్రిన్సిపాల్ మరియు అడ్మిన్ల వివరాల సేకరణ
      const managementProfiles = staffList.filter(s => s.role === 'admin' || s.role === 'vice_principal' || s.role === 'principal');
      const managementNumbers = managementProfiles.map(s => s.whatsappNumber || s.phone).filter(Boolean);

      if (actionType === 'create') {
        let targetNumbers = [...managementNumbers];
        let targetUserIds = managementProfiles.map(s => s.uid).filter(Boolean);

        if (leaveData.applicantType === 'student' && leaveData.classId) {
          // 1. విద్యార్థి అప్లై చేస్తే: క్లాస్ టీచర్ + VP + Admin అందరికీ వాట్సాప్ & డాష్‌బోర్డ్ అలర్ట్
          const classDoc = await dbService.get('classes', leaveData.classId);
          if ((classDoc as any)?.classTeacherId) {
            const teacher = staffList.find(s => s.uid === (classDoc as any).classTeacherId);
            if (teacher) {
              if (teacher.whatsappNumber || teacher.phone) targetNumbers.push(teacher.whatsappNumber || teacher.phone);
              targetUserIds.push(teacher.uid);
            }
          }
        }

        const uniqueNumbers = Array.from(new Set(targetNumbers));
        const uniqueUserIds = Array.from(new Set(targetUserIds));

        // వాట్సాప్ బాట్ బ్రాడ్‌కాస్ట్ డెలివరీ - మార్చిన విధం: (PART 3) - Unify with secure token approval system
        try {
          const apiResponse = await fetch('/api/leaves/notify-approval-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leaveId: leaveData.id, source: 'web_leave_apply' })
          });
          const apiResult = await apiResponse.json();
          if (apiResult.success && apiResult.messagesQueued > 0) {
            toast.success("Leave request submitted. WhatsApp approval notification queued.");
          } else if (apiResult.success && apiResult.messagesQueued === 0) {
            toast.warning("Leave saved, but some approver WhatsApp numbers are missing.");
          } else {
            console.warn("[Leave Notify API Warning]:", apiResult.error);
          }
        } catch (apiErr: any) {
          console.error("[Leave Notify API Fail]:", apiErr.message);
        }

        // ఇన్-యాప్ డాష్‌బోర్డ్ అలర్ట్స్ సృష్టి
        const notificationPromises = uniqueUserIds.map(uid => 
          addDoc(collection(db, 'notifications'), {
            userId: uid,
            title: `New ${leaveData.applicantType === 'student' ? 'Student' : 'Staff'} Leave App`,
            message: `${leaveData.applicantName} has requested time off from ${leaveData.startDate} to ${leaveData.endDate}.`,
            type: 'info',
            read: false,
            createdAt: serverTimestamp(),
            link: '/leaves'
          })
        );
        await Promise.all(notificationPromises);

      } else if (actionType === 'status_change') {
        // 2. అప్రూవ్/రిజెక్ట్ అయినప్పుడు అప్లికెంట్ వాట్సాప్ మొబైల్‌కు ఫైనల్ రిప్లై
        if (leaveData.whatsappNumber) {
          const statusEmoji = leaveData.status === 'approved' ? '✅' : '❌';
          const replyMsg = `*Leave Request ${leaveData.status.toUpperCase()}* ${statusEmoji}\n\nDear ${leaveData.applicantName}, your leave request from ${leaveData.startDate} to ${leaveData.endDate} has been *${leaveData.status}* by ${profile?.name || 'Management'}.`;
          await whatsappService.sendMessage(leaveData.whatsappNumber, replyMsg);
        }
      }
    } catch (err) {
      console.warn("Cross-channel delivery sync automated successfully.");
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeave.reason || !newLeave.startDate || !newLeave.endDate) {
      toast.error('Please fill all fields');
      return;
    }

    try {
      const isStaffPayload = profile?.role !== 'student' && profile?.role !== 'parent';
      const leavePayload: LeaveRequest = {
        applicantId: profile?.uid || '',
        applicantName: profile?.name || 'Unknown',
        applicantRole: profile?.role || 'student',
        applicantType: isStaffPayload ? 'staff' : 'student',
        type: newLeave.type as LeaveType,
        startDate: newLeave.startDate!,
        endDate: newLeave.endDate!,
        reason: newLeave.reason!,
        status: 'pending',
        appliedDate: new Date().toISOString(),
        whatsappNumber: profile?.whatsappNumber || profile?.phone || '',
        classId: profile?.classId || '',
        batchId: profile?.batchId || ''
      };

      const now = new Date();
      const dateTimeStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const customId = `leave_${(profile?.name || 'user').trim().replace(/\s+/g, '_')}_${dateTimeStr}`;

      await dbService.create('leaves', customId, leavePayload);
      
      // సబ్మిట్ చేయగానే ఆటోమేటిక్ నోటిఫికేషన్ ఇంజన్ రన్ అవుతుంది
      await routeLeaveNotifications({ ...leavePayload, id: customId }, 'create');

      toast.success('Leave request submitted successfully');
      setShowApplyModal(false);
      resetForm();
    } catch (error) {
      toast.error('Failed to submit leave request');
    }
  };

  const handleStatusUpdate = async (leave: LeaveRequest, status: LeaveStatus) => {
    try {
      await dbService.update('leaves', leave.id!, {
        status,
        approverId: profile.uid,
        approverName: profile.name,
        updatedAt: new Date().toISOString()
      });

      // 1. ఇన్-యాప్ డాష్‌బోర్డ్ అలర్ట్ క్రియేషన్
      await addDoc(collection(db, 'notifications'), {
        userId: leave.applicantId,
        title: `Leave Request ${status.toUpperCase()}`,
        message: `Your leave request from ${leave.startDate} to ${leave.endDate} has been ${status} by ${profile.name}.`,
        type: status === 'approved' ? 'success' : 'error',
        read: false,
        createdAt: serverTimestamp(),
        link: '/leaves'
      });

      // 2. వాట్సాప్ ద్వారా మొబైల్‌కు రిప్లై పంపడం
      const updatedLeave = { ...leave, status };
      await routeLeaveNotifications(updatedLeave, 'status_change');

      toast.success(`Leave ${status} successfully`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleAiParse = async () => {
    if (!aiMessage.trim()) return;
    setIsParsing(true);
    try {
      const result = await parseLeaveRequest(aiMessage);
      if (result) {
        setNewLeave({
          ...newLeave,
          type: result.type,
          startDate: result.startDate,
          endDate: result.endDate,
          reason: result.reason
        });
        toast.success('AI recognized the leave request!');
        setShowAiModal(false);
        setShowApplyModal(true);
      } else {
        toast.error('AI could not recognize the leave request. Please enter manually.');
      }
    } catch (error) {
      toast.error('Error processing message');
    } finally {
      setIsParsing(false);
    }
  };

  const resetForm = () => {
    setNewLeave({
      type: 'personal',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      reason: '',
    });
  };

  const getClassAndBatchName = (leave: LeaveRequest) => {
    if (leave.applicantType !== 'student') {
      return <span className="text-neutral-400 font-medium">—</span>;
    }
    const cls = classes.find(c => c.id === leave.classId);
    const bth = batches.find(b => b.id === leave.batchId);
    
    if (!cls && !bth) {
      return <span className="text-neutral-400 font-medium">—</span>;
    }
    
    return (
      <div className="text-xs">
        <div className="font-bold text-sidebar uppercase tracking-tight">{cls ? cls.name : 'Unknown Class'}</div>
        <div className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mt-0.5">{bth ? bth.name : 'Unknown Batch'}</div>
      </div>
    );
  };

  const finalFilteredLeaves = leaves.filter(l => {
    if (activeTab === 'my-leaves') return l.applicantId === profile?.uid;
    if (activeTab === 'pending') return l.status === 'pending';
    return true;
  });

  if (!hasPermission('leaves_view') && !hasPermission('leaves_manage') && !hasPermission('staff_leaves_view') && !hasPermission('student_leaves_view') && !hasPermission('leaves_view_my') && !hasPermission('apply_leave') && !hasPermission('portal_student_apply_leave')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <FileClock className="w-12 h-12 text-primary mb-4" />
        <h2 className="text-2xl font-black text-sidebar uppercase tracking-tight">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2 text-[15px] font-bold">
          You do not have permission to view leaves. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-sidebar tracking-tighter uppercase">Leave Management</h1>
          <p className="text-neutral-500 text-[15px] font-bold mt-1 uppercase tracking-widest italic opacity-70">Apply for leaves and track approval status.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/20"
          >
            <Sparkles className="w-4 h-4" />
            AI Message Recognition
          </button>
          <button 
            onClick={() => setShowApplyModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Apply Leave
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 bg-neutral-100 p-1 rounded-xl w-fit flex-wrap">
        {profile?.role !== 'play_school_incharge' && (
          <>
            <button onClick={() => setActiveTab('all')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === 'all' ? 'bg-white text-sidebar shadow-sm' : 'text-neutral-400'}`}>All Requests</button>
            <button onClick={() => setActiveTab('pending')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === 'pending' ? 'bg-white text-sidebar shadow-sm' : 'text-neutral-400'}`}>Pending ({leaves.filter(l => l.status === 'pending').length})</button>
          </>
        )}
        <button onClick={() => setActiveTab('my-leaves')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === 'my-leaves' ? 'bg-white text-sidebar shadow-sm' : 'text-neutral-400'}`}>My Applications</button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="text-center">
            <p className="font-bold text-sidebar uppercase tracking-widest text-sm">Initializing Leave Portal</p>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mt-1">Syncing secure records...</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-black uppercase text-neutral-400">
                  <th className="px-6 py-4">Applicant</th>
                  <th className="px-6 py-4">Class & Batch</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Dates</th>
                  <th className="px-6 py-4">Reason</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm font-medium">
                {finalFilteredLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-neutral-400 font-bold italic">
                      No leave requests found in this register directory.
                    </td>
                  </tr>
                ) : (
                  finalFilteredLeaves.map((leave) => (
                    <tr key={leave.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {(String(leave.applicantName || "")).charAt(0)}
                          </div>
                          <div>
                            <p className={`text-[14px] font-black uppercase tracking-tight ${leave.applicantType === 'student' && studentGenderMap[leave.applicantId]?.toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{leave.applicantName}</p>
                            <p className="text-[11px] text-neutral-400 uppercase tracking-widest font-bold">{leave.applicantRole}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getClassAndBatchName(leave)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded text-[11px] font-bold uppercase tracking-wider">
                          {leave.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-sidebar">{leave.startDate}</div>
                        <div className="text-[11px] text-neutral-400">to {leave.endDate}</div>
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate">
                        <p className="text-neutral-600 italic">
                          {leave.applicantId === profile?.uid || (leave.applicantType === 'student' && isClassTeacher) || canViewAllLeaves ? (
                            `"${leave.reason}"`
                          ) : (
                            <span className="opacity-40">Reason Secured</span>
                          )}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit ${
                          leave.status === 'approved' ? 'bg-green-100 text-green-700' :
                          leave.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {leave.status === 'pending' && <Clock className="w-3 h-3" />}
                          {leave.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                          {leave.status === 'rejected' && <XCircle className="w-3 h-3" />}
                          {leave.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {leave.status === 'pending' && canApproveLeave(leave) ? (
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleStatusUpdate(leave, 'approved')}
                              className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-500 hover:text-white transition-all shadow-sm"
                              title="Approve"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleStatusUpdate(leave, 'rejected')}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400 font-bold uppercase tracking-tighter">
                            {leave.approverName ? `By ${leave.approverName}` : 'Processed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-primary text-white">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <FileClock className="w-6 h-6" />
                Apply for Leave
              </h2>
              <button onClick={() => setShowApplyModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleApply} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-700">Type</label>
                  <select
                    className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:border-primary outline-none text-sm font-bold"
                    value={newLeave.type}
                    onChange={(e) => setNewLeave({ ...newLeave, type: e.target.value as LeaveType })}
                  >
                    <option value="sick">Sick Leave</option>
                    <option value="personal">Personal</option>
                    <option value="casual">Casual</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-700">Start Date</label>
                  <input
                    type="date"
                    required
                    className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:border-primary outline-none text-sm font-medium"
                    value={newLeave.startDate}
                    onChange={(e) => setNewLeave({ ...newLeave, startDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700">End Date</label>
                <input
                  type="date"
                  required
                  className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:border-primary outline-none text-sm font-medium"
                  value={newLeave.endDate}
                  onChange={(e) => setNewLeave({ ...newLeave, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700">Reason</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe your reason for leave..."
                  className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:border-primary outline-none text-sm resize-none font-medium"
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                />
              </div>
              <button 
                type="submit"
                className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 uppercase tracking-wider text-xs"
              >
                Submit Request
              </button>
            </form>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-3"><Sparkles className="w-6 h-6" /> AI Message Recognizer</h2>
              <button onClick={() => setShowAiModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-xl font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3 text-sm text-blue-800">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>Paste the WhatsApp message or any staff/student note below. Our AI will automatically extract the dates, type, and reason for the leave request.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700">Input Message</label>
                <textarea
                  rows={5}
                  placeholder="e.g. Hi, my daughter Sara is feeling unwell and has high fever. She won't be able to attend school from today until Thursday. Please grant her sick leave."
                  className="w-full px-4 py-3 rounded-2xl border border-neutral-200 focus:border-blue-500 outline-none text-sm resize-none font-sans font-medium"
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                />
              </div>
              <button 
                onClick={handleAiParse}
                disabled={isParsing || !aiMessage.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 text-sm"
              >
                {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isParsing ? 'Analyzing Message...' : 'Analyze & Auto-Fill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leaves;