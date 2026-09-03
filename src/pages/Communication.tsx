import React, { useEffect, useState, useMemo } from 'react';
import { extractParentPhone } from '../utils/phoneUtils';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { 
  MessageSquare, 
  Send, 
  Users, 
  Smartphone, 
  QrCode, 
  CheckCircle2, 
  AlertCircle, 
  History, 
  Bot,
  Sparkles,
  Megaphone,
  Search,
  Bus,
  MoreVertical,
  Paperclip,
  Smile,
  Mic,
  Image as ImageIcon,
  Gift,
  Video,
  Play,
  Filter,
  CheckCircle,
  Hash,
  Info,
  UserCircle,
  Globe,
  Trash2,
  Plus,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Share2,
  Clock,
  ExternalLink,
  Home,
  Settings,
  Copy,
  X,
  ToggleLeft,
  ToggleRight,
  FileSpreadsheet,
  FileUp,
  Eye,
  RefreshCw,
  Download,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  compareSubjectsStandard, 
  getPerformanceCategory, 
  downloadMarksExcelTemplate, 
  PRESET_SUBJECT_SETS 
} from '../utils/examUtils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { where, limit, orderBy, query, collection, onSnapshot } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';

import { getBirthdayWish } from '../services/aiService';

interface Message {
  from: string;
  text: string;
  timestamp: number;
  id: string;
}

const Communication: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { hasPermission, isAdmin, profile } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'close' | 'qr'>('connecting');
  const [qr, setQr] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  
  const isSuperAdmin = profile?.email === 'manamunagaraju@gmail.com';
  
  // Tabs configuration
  const availableTabs = useMemo(() => {
    const tabs = [
      { id: 'chats', icon: MessageSquare, label: 'Single', permission: 'whatsapp_send' },
      { id: 'broadcast', icon: Megaphone, label: 'Broadcast', permissions: ['whatsapp_broadcast', 'notifications_send'] },
      { id: 'birthdays', icon: Gift, label: 'Birthdays', permission: 'whatsapp_birthdays' },
      { id: 'bot', icon: Bot, label: 'Bot Menus', permission: 'communication_view' },
      { id: 'queue', icon: Clock, label: 'Queue', permission: 'communication_view' }
    ];

    return tabs.filter(tab => {
      if (tab.permission && hasPermission(tab.permission as any)) return true;
      if (tab.permissions && tab.permissions.some(p => hasPermission(p as any))) return true;
      return false;
    });
  }, [hasPermission]);

  // Active Tab - set default to first available
  const [activeTab, setActiveTab] = useState<'chats' | 'broadcast' | 'birthdays' | 'queue' | 'bot'>(
    'chats' // Default to single chat
  );

  // Sync activeTab if it's not in availableTabs anymore (e.g. permission change)
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id as any);
    }
  }, [availableTabs, activeTab]);

  const canViewSetup = isSuperAdmin;

  // ... rest of the component state


  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  
  // Single Chat state
  const [input, setInput] = useState('');
  const [targetNumber, setTargetNumber] = useState('');

  // Academic Data for Broadcast
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  // Broadcast State
  const [broadcastTarget, setBroadcastTarget] = useState<'students' | 'staff' | 'communities' | 'excel' | 'all'>('students');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedBusId, setSelectedBusId] = useState('');
  const [selectedStopId, setSelectedStopId] = useState('');
  const [selectedHostelName, setSelectedHostelName] = useState('');
  const [hostelBlocks, setHostelBlocks] = useState<any[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  // Excel Marks Broadcast State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelFileName, setExcelFileName] = useState<string>('');
  const [parsedExcelRows, setParsedExcelRows] = useState<any[]>([]);
  const [detectedExcelSubjects, setDetectedExcelSubjects] = useState<string[]>([]);
  const [excelExamTitle, setExcelExamTitle] = useState<string>('');
  const [excelTemplate, setExcelTemplate] = useState<string>(
`Dear {fatherName},
Exam result for {studentName} has been published.

📝 Exam: {examName}
📌 Roll No: {rollNo}
📊 Total: {total}
📈 Percentage: {percentage}%
{rankLine}
🏁 Status: {status}

Subject-wise Marks:
{subjectMarks}

For more details, please contact St. Antony’s School office.

This is an automated message.`
  );
  const [previewRowIndex, setPreviewRowIndex] = useState<number>(0);
  const [excelSearchFilter, setExcelSearchFilter] = useState<string>('');
  const [isProcessingExcel, setIsProcessingExcel] = useState<boolean>(false);

  // Template Download & Customizer State
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [templateModalClass, setTemplateModalClass] = useState<string>('');
  const [templateModalExam, setTemplateModalExam] = useState<string>('Unit Test 1');
  const [templateModalMaxMarks, setTemplateModalMaxMarks] = useState<number>(25);
  const [templatePresetType, setTemplatePresetType] = useState<keyof typeof PRESET_SUBJECT_SETS | 'custom'>('highSchool');
  const [templateSubjectsList, setTemplateSubjectsList] = useState<string[]>(PRESET_SUBJECT_SETS.highSchool);
  const [newSubjectInput, setNewSubjectInput] = useState<string>('');

  const [loadingUsers, setLoadingUsers] = useState(false);

  // Birthday State
  const [birthdayVideoUrl, setBirthdayVideoUrl] = useState('');
  const [targetBirthdayType, setTargetBirthdayType] = useState<'students' | 'staff'>('students');
  const [isGeneratingWishes, setIsGeneratingWishes] = useState(false);
  const [birthdayCelebrants, setBirthdayCelebrants] = useState<any[]>([]);
  const [birthdayTemplates, setBirthdayTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<'ai' | string>('ai');
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '', type: 'student' as 'student' | 'staff' });
  const [showAddTemplate, setShowAddTemplate] = useState(false);

  // Bot Menus State
  const [botMenus, setBotMenus] = useState<any[]>([]);
  const [editingBotMenu, setEditingBotMenu] = useState<any>(null);
  const [showAddBotMenu, setShowAddBotMenu] = useState(false);
  const [newBotMenu, setNewBotMenu] = useState({ keyword: '', responseText: '', buttons: [] as {id: string, text: string}[], isActive: true });

  // Queue State
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [messageLogs, setMessageLogs] = useState<any[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | 'processing' | 'pending' | 'sent' | 'failed' | 'cancelled'>('all');
  const [confirmingCancelAll, setConfirmingCancelAll] = useState(false);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Communities Settings State
  const [showCommunitySettings, setShowCommunitySettings] = useState(false);
  const [communities, setCommunities] = useState<any[]>([]);
  const [showAddCommunity, setShowAddCommunity] = useState(false);
  const [editingCommunity, setEditingCommunity] = useState<any>(null);
  const [newCommunity, setNewCommunity] = useState({
    communityJid: '',
    associatedClasses: [] as string[],
    isActive: true
  });

  const [whatsappGroups, setWhatsappGroups] = useState<any[]>([]);
  const [isFetchingGroups, setIsFetchingGroups] = useState(false);
  const [fetchGroupsError, setFetchGroupsError] = useState<string | null>(null);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  const processedGroups = useMemo(() => {
    const filtered = whatsappGroups.filter(g => 
      g.subject.toLowerCase().includes(groupSearchQuery.toLowerCase())
    );
    
    // Deduplicate community JIDs by subject name
    const map = new Map<string, any>();
    for (const g of filtered) {
      const subjectKey = g.subject.trim().toLowerCase();
      const existing = map.get(subjectKey);
      if (existing) {
        // If there's already a group with the same subject name, decide which JID to keep.
        // 1. If one has isCommunityAnnouncement === true, filter it out (prefer the parent community).
        // 2. Otherwise, select the one with the smaller JID prefix (since parent communities are created first and have smaller JID timestamps)
        let preferCurrent = false;
        if (existing.isCommunityAnnouncement && !g.isCommunityAnnouncement) {
          preferCurrent = true;
        } else if (!existing.isCommunityAnnouncement && g.isCommunityAnnouncement) {
          preferCurrent = false;
        } else {
          const getNum = (jid: string) => {
            const match = jid.match(/^(\d+)/);
            return match ? parseInt(match[1], 10) : Infinity;
          };
          if (getNum(g.id) < getNum(existing.id)) {
            preferCurrent = true;
          }
        }
        
        if (preferCurrent) {
          map.set(subjectKey, g);
        }
      } else {
        map.set(subjectKey, g);
      }
    }
    
    return Array.from(map.values());
  }, [whatsappGroups, groupSearchQuery]);

  const handleCancelAllQueue = async () => {
    const pendingItems = queueItems.filter(i => i.status === 'pending' || i.status === 'retrying' || i.status === 'processing');
    if (pendingItems.length === 0) {
      toast.info("No active pending, retrying, or processing messages in queue to cancel.");
      return;
    }
    
    try {
      const itemsToUpdate = pendingItems.map(item => ({
        id: item.id,
        data: {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          reason: 'Cancelled by user'
        }
      }));
      
      await dbService.updateBatch('whatsapp_queue', itemsToUpdate);
      toast.success(`Successfully cancelled ${pendingItems.length} pending messages.`);
    } catch (error: any) {
      console.error("Error cancelling queue:", error);
      toast.error("Failed to cancel pending messages: " + error.message);
    }
  };

  const handleFetchWhatsappGroups = async (isSilent = false) => {
    if (status !== 'open') {
      if (!isSilent) {
        toast.error("WhatsApp connection is not active! Please scan the QR code to link your WhatsApp from the status panel first.", { duration: 6000 });
      }
      setFetchGroupsError("WhatsApp connection is not active. Please connect WhatsApp from the status panel first.");
      return;
    }
    setIsFetchingGroups(true);
    setFetchGroupsError(null);
    try {
      const res = await fetch('/api/whatsapp/groups');
      if (!res.ok) {
        throw new Error(`Failed to fetch groups: Status ${res.status}`);
      }
      const data = await res.json();
      setWhatsappGroups(data);
    } catch (err: any) {
      console.error("Error loading groups:", err);
      setFetchGroupsError(err.message || 'Failed to load groups. Please ensure WhatsApp is connected.');
    } finally {
      setIsFetchingGroups(false);
    }
  };

  // Automatically fetch active communities/groups when settings modal is open and WhatsApp is connected
  useEffect(() => {
    if (showCommunitySettings && status === 'open' && !isFetchingGroups) {
      handleFetchWhatsappGroups(true);
    }
  }, [showCommunitySettings, status]);

  // Subscribe to WhatsApp Communities
  useEffect(() => {
    const q = collection(db, 'whatsapp_communities');
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCommunities(items);
    }, (error) => {
      console.error("Communities Subscription Error:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setIsQueueLoading(true);
    let unsubQueue: (() => void) | null = null;

    const setupQueueSubscription = () => {
      try {
        const q = query(
          collection(db, 'whatsapp_queue'),
          orderBy('createdAt', 'desc'),
          limit(100)
        );

        unsubQueue = onSnapshot(q, (snapshot) => {
          const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setQueueItems(items);
          setIsQueueLoading(false);
        }, (error) => {
          console.warn("Queue ordered subscription error, falling back to simple query:", error.message);
          // Fallback query without orderBy to avoid index requirement failures
          const fallbackQ = query(collection(db, 'whatsapp_queue'), limit(100));
          unsubQueue = onSnapshot(fallbackQ, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            items.sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            setQueueItems(items);
            setIsQueueLoading(false);
          }, (fbErr) => {
            console.error("Queue Fallback Subscription Error:", fbErr);
            setIsQueueLoading(false);
          });
        });
      } catch (err: any) {
        console.warn("Setup queue subscription exception:", err);
        setIsQueueLoading(false);
      }
    };

    setupQueueSubscription();

    // Subscribe to recent logs
    const qLogs = query(
      collection(db, 'whatsappLogs'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessageLogs(items);
    }, (error) => {
      console.warn("Logs Subscription Error, using fallback:", error.message);
      const fallbackLogs = query(collection(db, 'whatsappLogs'), limit(50));
      onSnapshot(fallbackLogs, (snap) => {
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        items.sort((a: any, b: any) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
        setMessageLogs(items);
      });
    });

    return () => {
      if (unsubQueue) unsubQueue();
      unsubLogs();
    };
  }, []);

  const fetchCelebrants = async () => {
    try {
      setLoadingUsers(true);
      const today = format(new Date(), 'MM-dd');
      
      // We can't efficiently filter MMM-DD in Firestore without a separate field.
      // But we can at least limit the fetch if there are too many.
      // Or just fetch all and filter client-side as it is now, but limit to active students.
      const roles = await dbService.list('roles');
      const defaultRoles = ['teacher', 'accountant', 'clerk', 'admin', 'principal', 'vice_principal', 'staff', 'driver', 'attendant', 'helper', 'aya', 'coordinator', 'front_office', 'receptionist'];
      const staffRoles = Array.from(new Set([...defaultRoles, ...roles.filter((r: any) => !r.isDeleted).map((r: any) => r.id)])).slice(0, 30);

      const currentCollection = targetBirthdayType === 'students' ? 'students' : 'staff';
      const constraints: any[] = [
        where('status', '==', 'active'),
        limit(500)
      ];
      const allUsers = await dbService.list(currentCollection, constraints);
      const celebrants = ((allUsers || []) as any[]).filter(p => {
        if (!p.dateOfBirth) return false;
        // Format of dob is usually YYYY-MM-DD
        return p.dateOfBirth.slice(5) === today;
      });
      setBirthdayCelebrants(celebrants);
    } catch (error: any) {
      const errorMessage = error.message || String(error || "");
      const isIndexError = errorMessage.includes('FAILED_PRECONDITION') || errorMessage.includes('index');
      if (!isIndexError) {
        console.error("Error fetching celebrants:", error);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'birthdays') {
      fetchCelebrants();
    }
  }, [targetBirthdayType, activeTab]);

  useEffect(() => {
    dbService.list('birthdayTemplates').then(setBirthdayTemplates).catch(e => console.error(e));
    dbService.list('whatsapp_bot_menus').then(setBotMenus).catch(e => console.error(e));
  }, []);

  const [recipientCount, setRecipientCount] = useState(0);

  const fetchBroadcastRecipients = async () => {
    try {
      setLoadingUsers(true);
      
      if (broadcastTarget === 'communities') {
        const activeComm = communities.filter(c => {
          if (!c.isActive) return false;
          if (!selectedClassId) return true;
          return c.associatedClasses?.includes(selectedClassId);
        });
        setRecipientCount(activeComm.length);
        setLoadingUsers(false);
        return;
      }

      const currentCollection = broadcastTarget === 'staff' ? 'staff' : 'students';
      const constraints: any[] = [where('status', '==', 'active')];

      if (broadcastTarget === 'students') {
        if (selectedClassId) constraints.push(where('classId', '==', selectedClassId));
        if (selectedBatchId) constraints.push(where('batchId', '==', selectedBatchId));
        
        // Handle transport and hostel logic separately to avoid composite index errors
        if (selectedStopId || selectedBusId || selectedHostelName) {
          const allStudentsOfFilters = await dbService.list('students', constraints);
          let filtered = allStudentsOfFilters;
          if (selectedStopId) {
            filtered = allStudentsOfFilters.filter(s => s.transportStopId === selectedStopId);
          } else if (selectedBusId) {
            const busStops = stops.filter(s => s.busId === selectedBusId).map(s => s.id);
            filtered = allStudentsOfFilters.filter(s => busStops.includes(s.transportStopId));
          }

          if (selectedHostelName) {
            if (selectedHostelName === 'any_hostel') {
              filtered = filtered.filter(s => s.feeType?.toLowerCase() === 'hostel');
            } else {
              filtered = filtered.filter(s => s.feeType?.toLowerCase() === 'hostel' && s.hostelName === selectedHostelName);
            }
          }

          setRecipientCount(filtered.length);
          setStudents(filtered.slice(0, 10));
          return; // Skip normal count
        }
      } else if (broadcastTarget === 'staff') {
          // No additional constraints needed for staff for now
        } else {
          // all - complex to count with 'in' and individual roles.
          // For simplicity, just use two counts
        }

        const count = await dbService.count(currentCollection, constraints);
        setRecipientCount(count);

        // Fetch a small sample for preview
        const previewData = await dbService.list(currentCollection, [...constraints, limit(10)]);
        const safePreviewData = previewData || [];
        if (broadcastTarget === 'students') setStudents(safePreviewData);
        else if (broadcastTarget === 'staff') setStaff(safePreviewData);
        else {
          setStudents(safePreviewData.filter(u => u.role === 'student'));
          setStaff(safePreviewData.filter(u => u.role !== 'student'));
        }
    } catch (error: any) {
      const errorMessage = error.message || String(error || "");
      const isIndexError = errorMessage.includes('FAILED_PRECONDITION') || errorMessage.includes('index');
      if (!isIndexError) {
        console.error("Error fetching broadcast recipients:", error);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'broadcast') {
      fetchBroadcastRecipients();
    }
  }, [broadcastTarget, selectedClassId, selectedBatchId, selectedBusId, selectedStopId, selectedHostelName, activeTab, stops, communities]);

  useEffect(() => {
    // One-time fetches for academic metadata to optimize reads
    dbService.list('classes').then(setClasses).catch(e => console.error(e));
    dbService.list('batches').then(setBatches).catch(e => console.error(e));
    dbService.list('buses').then(setBuses).catch(e => console.error(e));
    dbService.list('stops').then(setStops).catch(e => console.error(e));
    dbService.list('hostel_blocks').then(setHostelBlocks).catch(e => console.error(e));

    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('wa:status', (s) => {
      setStatus(s);
      if (s === 'open') fetchChannels();
    });
    newSocket.on('wa:qr', (q) => setQr(q));
    newSocket.on('wa:error', (err) => {
      toast.error(err, { duration: 10000 });
    });
    newSocket.on('wa:message', (msg) => {
      setMessages(prev => [msg, ...(prev || [])].slice(0, 50));
    });

    // Robust HTTP Polling fallback for status and QR updates
    const pollStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setStatus(prev => {
              if (prev !== data.status) {
                if (data.status === 'open') fetchChannels();
                return data.status;
              }
              return prev;
            });
            setQr(data.qr || null);
          }
        }
      } catch (err) {
        console.warn("WhatsApp status poll fallback failed:", err);
      }
    };

    pollStatus();
    const pollInterval = setInterval(pollStatus, 2000);

    return () => {
      newSocket.disconnect();
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }
    };
  }, [mediaPreviewUrl]);

  const fetchChannels = async () => {
    try {
      const chanRes = await fetch('/api/whatsapp/channels');
      const chanData = await chanRes.json();
      setChannels(chanData);
    } catch (err) {
      console.error("Fetch Error:", err);
    }
  };

  const handleRestartWA = async () => {
    try {
      setStatus('connecting');
      const res = await fetch('/api/whatsapp/restart', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.info('WhatsApp engine restarting...');
      } else {
        toast.error('Failed to command restart');
      }
    } catch (err) {
      toast.error('Network error while restarting');
    }
  };

  const handleResetWA = async () => {
    if (!confirm("This will log you out and delete all WhatsApp session data. Are you sure?")) return;
    try {
      setStatus('connecting');
      const res = await fetch('/api/whatsapp/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.info('WhatsApp session reset. Please scan the new QR code.');
      } else {
        toast.error('Failed to reset session');
      }
    } catch (err) {
      toast.error('Network error while resetting');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (mediaPreviewUrl) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setMediaPreviewUrl(url);
    }
  };

  const uploadFile = async (): Promise<any | null> => {
    if (!selectedFile) return null;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/whatsapp/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) return data;
      toast.error('File upload failed');
      return null;
    } catch (err) {
      toast.error('File upload error');
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const clearFile = () => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }
    setSelectedFile(null);
    setMediaPreviewUrl(null);
  };

  const handleSendMessage = async () => {
    if (!targetNumber || (!input && !selectedFile)) {
      toast.error('Please enter a number and a message or attachment');
      return;
    }

    try {
      const options: any = {};
      
      if (selectedFile) {
        const uploadResult = await uploadFile();
        if (!uploadResult) return;

        if (uploadResult.mimetype.startsWith('image/')) {
          options.imageUrl = uploadResult.filePath;
        } else if (uploadResult.mimetype.startsWith('video/')) {
          options.videoUrl = uploadResult.filePath;
        } else {
          options.documentUrl = uploadResult.filePath;
          options.fileName = uploadResult.fileName;
        }
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: targetNumber, text: input, options })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Message queued for delivery!');
        setInput('');
        clearFile();
      } else {
        toast.error(data.error || 'Failed to queue message');
      }
    } catch (err) {
      toast.error('Connection error');
    }
  };

  const generateExcelStudentMessage = (row: any, tpl: string) => {
    if (!row) return '';
    let msg = tpl;
    const rankLine = row.rank ? `🏆 Rank: ${row.rank}` : '';
    msg = msg.replace(/{studentName}/g, row.studentName || 'Student');
    msg = msg.replace(/{fatherName}/g, row.fatherName || 'Parent');
    msg = msg.replace(/{examName}/g, row.testName || excelExamTitle || 'Exam');
    msg = msg.replace(/{rollNo}/g, String(row.candidateId || row.rollNo || '-'));
    msg = msg.replace(/{total}/g, String(row.total || '-'));
    msg = msg.replace(/{percentage}/g, String(row.percentage || '-'));
    msg = msg.replace(/{rankLine}/g, rankLine);
    msg = msg.replace(/{rank}/g, String(row.rank || '-'));
    msg = msg.replace(/{status}/g, row.status || 'Good');
    msg = msg.replace(/{subjectMarks}/g, row.subjectMarksText || '');

    // Dynamically replace individual subject placeholders if any (e.g. {Telugu}, {Mathematics}, {Science}, etc.)
    if (row.subjects && Array.isArray(row.subjects)) {
      for (const subj of row.subjects) {
        const valStr = String(subj.marks ?? '-');
        // Exact name tag e.g. {Physical Science}
        const reExact = new RegExp(`\\{${subj.name}\\}`, 'gi');
        msg = msg.replace(reExact, valStr);
        // Clean alphanumeric tag e.g. {PhysicalScience} or {Maths}
        const cleanName = subj.name.replace(/[^a-zA-Z0-9]/g, '');
        if (cleanName) {
          const reClean = new RegExp(`\\{${cleanName}\\}`, 'gi');
          msg = msg.replace(reClean, valStr);
        }
      }
    }

    return msg.replace(/\n\n\n+/g, '\n\n').trim();
  };

  const handleQuickDownloadTemplate = (type: 'highSchool' | 'primary' | 'standard6') => {
    const subjects = PRESET_SUBJECT_SETS[type] || PRESET_SUBJECT_SETS.highSchool;
    const label = type === 'primary' ? 'Primary_School_4_Subjects' : type === 'standard6' ? 'Standard_6_Subjects' : 'High_School_7_Subjects';
    downloadMarksExcelTemplate({
      fileName: `Marks_Template_${label}`,
      examName: 'Unit Test 1',
      className: type === 'primary' ? 'Class 3' : 'Class 10',
      subjects,
      maxMarksPerSubject: 25,
      includeSampleRows: true
    });
    toast.success(`Downloaded ${label.replace(/_/g, ' ')} template!`);
  };

  const handleDownloadCustomTemplate = () => {
    // If class is selected, pre-populate students from that class
    let classStudents: any[] = [];
    if (templateModalClass && students && students.length > 0) {
      const filtered = students.filter((s: any) => 
        s.classId === templateModalClass ||
        s.className === templateModalClass ||
        s.grade === templateModalClass
      );
      if (filtered.length > 0) {
        classStudents = filtered.map(s => ({
          candidateId: s.rollNumber || s.admissionNumber || s.id,
          studentName: s.name,
          fatherName: s.fatherName || s.parentName || '',
          phone: extractParentPhone(s),
          group: s.className || s.classId || templateModalClass,
          batch: s.section || s.batch || 'A'
        }));
      }
    }

    const selectedClassObj = classes.find(c => c.id === templateModalClass || c.name === templateModalClass);
    const classNameStr = selectedClassObj?.name || templateModalClass || 'Custom Class';

    downloadMarksExcelTemplate({
      fileName: `Marks_Template_${classNameStr.replace(/\s+/g, '_')}_${templateSubjectsList.length}_Subjects`,
      examName: templateModalExam || 'Unit Test 1',
      className: classNameStr,
      subjects: templateSubjectsList.length > 0 ? templateSubjectsList : PRESET_SUBJECT_SETS.highSchool,
      maxMarksPerSubject: templateModalMaxMarks || 25,
      students: classStudents,
      includeSampleRows: classStudents.length === 0
    });

    setShowTemplateModal(false);
    toast.success(`Downloaded customized template with ${templateSubjectsList.length} subjects!`);
  };

  const handleExcelUpload = async (file: File) => {
    try {
      setIsProcessingExcel(true);
      setExcelFile(file);
      setExcelFileName(file.name);

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows || rows.length === 0) {
        toast.error("The uploaded Excel sheet contains no rows.");
        setIsProcessingExcel(false);
        return;
      }

      // Fetch all active students once for fast ID/Name matching
      const allActiveStudents = await dbService.list('students', [where('status', '==', 'active')]);

      // Detect header keys in first row
      const detectedExam = (rows[0]?.['Test'] || rows[0]?.['Test Name'] || rows[0]?.['Exam'] || rows[0]?.['Exam Name'] || '').trim();
      if (detectedExam && !excelExamTitle) {
        setExcelExamTitle(detectedExam);
      }

      const nonSubjectPatterns = [
        /candidate.*id/i, /roll.*no/i, /^roll$/i, /admission.*no/i, /^adm.*no$/i, /^id$/i, /^ht.*no$/i, /hall.*ticket/i,
        /candidate.*name/i, /student.*name/i, /^student$/i, /^name$/i,
        /^father$/i, /father.*name/i, /^parent$/i, /parent.*name/i, /guardian/i,
        /^group$/i, /^class$/i, /^std$/i, /^grade$/i,
        /^other$/i, /^batch$/i, /^section$/i, /^sec$/i,
        /test.*no/i, /exam.*no/i,
        /^test$/i, /test.*name/i, /^exam$/i, /exam.*name/i,
        /^total$/i, /grand.*total/i, /marks.*obtained/i,
        /test.*rank/i, /^rank$/i, /^pos$/i, /^position$/i,
        /^percentage$/i, /^percent$/i, /^perc$/i, /^%$/i,
        /^phone$/i, /^mobile$/i, /^whatsapp$/i, /^contact$/i, /parent.*phone/i, /father.*mobile/i, /cell/i
      ];

      const isSubjectCol = (key: string) => {
        const trimmed = key.trim();
        if (!trimmed) return false;
        return !nonSubjectPatterns.some(pat => pat.test(trimmed));
      };

      // Detect all unique subject columns present across the entire uploaded sheet
      const detectedSubjSet = new Set<string>();
      rows.forEach(r => {
        Object.keys(r).forEach(k => {
          if (isSubjectCol(k)) {
            detectedSubjSet.add(k.trim());
          }
        });
      });

      const detectedSubjArray = Array.from(detectedSubjSet).sort(compareSubjectsStandard);
      setDetectedExcelSubjects(detectedSubjArray);

      // Auto-detect max marks per subject across all rows to support 25/50/80/100 tests
      let maxMarkSeen = 0;
      rows.forEach(r => {
        detectedSubjArray.forEach(subj => {
          const val = parseFloat(String(r[subj]).replace(/[^0-9.]/g, ''));
          if (!isNaN(val) && val > maxMarkSeen) {
            maxMarkSeen = val;
          }
        });
      });

      let detectedMaxPerSubj = 25;
      if (maxMarkSeen > 80) detectedMaxPerSubj = 100;
      else if (maxMarkSeen > 50) detectedMaxPerSubj = 80;
      else if (maxMarkSeen > 25) detectedMaxPerSubj = 50;
      else detectedMaxPerSubj = 25;

      const parsed: any[] = rows.map((r, index) => {
        const getCol = (patterns: RegExp[]) => {
          for (const key of Object.keys(r)) {
            if (patterns.some(p => p.test(key.trim()))) {
              return String(r[key] || '').trim();
            }
          }
          return '';
        };

        const candidateId = getCol([/candidate.*id/i, /roll.*no/i, /^roll$/i, /admission.*no/i, /^adm.*no$/i, /^id$/i, /^ht.*no$/i, /hall.*ticket/i]);
        const studentName = getCol([/candidate.*name/i, /student.*name/i, /^student$/i, /^name$/i]);
        const fatherName = getCol([/^father$/i, /father.*name/i, /^parent$/i, /parent.*name/i, /guardian/i]);
        const group = getCol([/^group$/i, /^class$/i, /^std$/i, /^grade$/i]);
        const batch = getCol([/^other$/i, /^batch$/i, /^section$/i, /^sec$/i]);
        const testName = getCol([/^test$/i, /test.*name/i, /^exam$/i, /exam.*name/i]) || detectedExam || excelExamTitle;
        let total = getCol([/^total$/i, /grand.*total/i, /marks.*obtained/i]);
        const rank = getCol([/test.*rank/i, /^rank$/i, /^pos$/i, /^position$/i]);
        let percentage = getCol([/^percentage$/i, /^percent$/i, /^perc$/i, /^%$/i]);
        let phone = getCol([/^phone$/i, /^mobile$/i, /^whatsapp$/i, /^contact$/i, /parent.*phone/i, /father.*mobile/i, /cell/i]);

        // Subject marks
        const subjects: Array<{ name: string, marks: string | number }> = [];
        let numericSum = 0;
        let validNumericCount = 0;

        for (const subjName of detectedSubjArray) {
          const marksVal = r[subjName];
          if (marksVal !== '' && marksVal !== undefined && marksVal !== null) {
            subjects.push({
              name: subjName,
              marks: marksVal
            });
            const numVal = parseFloat(String(marksVal).replace(/[^0-9.]/g, ''));
            if (!isNaN(numVal)) {
              numericSum += numVal;
              validNumericCount++;
            }
          }
        }

        // If user uploaded extra subject columns not caught in detectedSubjArray
        for (const key of Object.keys(r)) {
          if (isSubjectCol(key) && !detectedSubjSet.has(key.trim())) {
            const marksVal = r[key];
            if (marksVal !== '' && marksVal !== undefined && marksVal !== null) {
              subjects.push({
                name: key.trim(),
                marks: marksVal
              });
            }
          }
        }

        // Sort subjects using standard curriculum ordering (Telugu, Hindi, English, Mathematics, Physics, Biology, Social, etc.)
        subjects.sort((a, b) => compareSubjectsStandard(a.name, b.name));

        // Format subject marks text:
        const subjectMarksText = subjects.map(s => `🔹 *${s.name}*: ${s.marks}`).join('\n');

        // Auto-calculate Total if not provided
        if (!total && validNumericCount > 0) {
          total = String(numericSum);
        }

        // Numeric percentage calculation if needed
        let percNum = 0;
        if (percentage) {
          percNum = parseFloat(percentage.replace(/[^0-9.]/g, '')) || 0;
        } else if (total && subjects.length > 0) {
          const totNum = parseFloat(total) || 0;
          percNum = Math.round((totNum / (subjects.length * detectedMaxPerSubj)) * 100);
        }

        const statusLabel = getPerformanceCategory(Math.round(percNum));

        // Smart Database matching for Parent Phone
        let matchedStudent: any = null;
        if (allActiveStudents && allActiveStudents.length > 0) {
          if (candidateId) {
            matchedStudent = allActiveStudents.find((s: any) => 
              String(s.rollNumber || '').trim() === candidateId ||
              String(s.admissionNumber || '').trim() === candidateId ||
              String(s.id || '').trim() === candidateId ||
              String(s.uid || '').trim() === candidateId
            );
          }
          if (!matchedStudent && studentName) {
            const cleanTargetName = studentName.toLowerCase().replace(/[^a-z0-9]/g, '');
            matchedStudent = allActiveStudents.find((s: any) => {
              const cleanSName = String(s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              return cleanSName === cleanTargetName || cleanSName.includes(cleanTargetName) || cleanTargetName.includes(cleanSName);
            });
          }
        }

        if (!phone && matchedStudent) {
          phone = extractParentPhone(matchedStudent);
        }

        return {
          id: `row_${index + 1}`,
          index: index + 1,
          candidateId,
          studentName: studentName || (matchedStudent ? matchedStudent.name : `Student ${index + 1}`),
          fatherName: fatherName || (matchedStudent ? (matchedStudent.fatherName || matchedStudent.parentName || '') : ''),
          group,
          batch,
          testName,
          total,
          rank,
          percentage: percNum ? `${Math.round(percNum)}` : percentage,
          status: statusLabel,
          phone: phone || '',
          matchedStudent,
          subjects,
          subjectMarksText
        };
      });

      setParsedExcelRows(parsed);
      setPreviewRowIndex(0);
      const withPhone = parsed.filter(p => !!p.phone).length;
      toast.success(`Parsed ${parsed.length} student records with ${detectedSubjArray.length} subjects detected (${withPhone} matched with WhatsApp phones)`);
    } catch (err: any) {
      console.error("Excel parse error:", err);
      toast.error("Failed to parse Excel file: " + (err.message || "Invalid format"));
    } finally {
      setIsProcessingExcel(false);
    }
  };

  const handleUpdateExcelPhone = (rowId: string, newPhone: string) => {
    setParsedExcelRows(prev => prev.map(row => row.id === rowId ? { ...row, phone: newPhone } : row));
  };

  const handleRunBroadcast = async () => {
    if (broadcastTarget === 'excel') {
      if (parsedExcelRows.length === 0) {
        toast.error("Please upload an Excel marks sheet first.");
        return;
      }
      const readyRows = parsedExcelRows.filter(r => !!r.phone);
      if (readyRows.length === 0) {
        toast.error("No valid phone numbers found for the uploaded students. Please verify or input phone numbers.");
        return;
      }

      setIsSendingBroadcast(true);
      try {
        const payload = readyRows.map(row => {
          const studentMsg = generateExcelStudentMessage(row, excelTemplate);
          return {
            phone: row.phone,
            text: studentMsg,
            studentId: row.matchedStudent?.id || row.candidateId || null,
            classId: row.matchedStudent?.classId || null
          };
        });

        toast.loading(`Enqueuing ${payload.length} personalized marks messages with 4 msgs/min rate limiting...`);

        const res = await fetch('/api/whatsapp/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: payload,
            text: "Exam Marks Notification",
            options: { isBroadcast: true, broadcastTarget: 'excel_marks', examName: excelExamTitle }
          })
        });
        const data = await res.json();
        toast.dismiss();
        if (data.success) {
          toast.success(`Successfully queued ${payload.length} marks messages! Paced safely at 4 msgs/min.`);
        } else {
          throw new Error(data.error || "Failed to broadcast excel marks");
        }
      } catch (err: any) {
        toast.dismiss();
        toast.error(err.message || "Excel marks broadcast failed");
      } finally {
        setIsSendingBroadcast(false);
      }
      return;
    }

    if (broadcastTarget === 'communities') {
      setIsSendingBroadcast(true);
      try {
        if (!broadcastMessage.trim() && !selectedFile) {
          toast.error("Please enter broadcast message text or attach media");
          setIsSendingBroadcast(false);
          return;
        }

        const options: any = {};
        
        if (selectedFile) {
          toast.loading("Uploading media...");
          const uploadResult = await uploadFile();
          toast.dismiss();
          if (!uploadResult) {
            setIsSendingBroadcast(false);
            return;
          }

          if (uploadResult.mimetype.startsWith('image/')) {
            options.imageUrl = uploadResult.filePath;
          } else if (uploadResult.mimetype.startsWith('video/')) {
            options.videoUrl = uploadResult.filePath;
          } else {
            options.documentUrl = uploadResult.filePath;
            options.fileName = uploadResult.fileName;
          }
        }

        toast.loading("Sending Community Announcement...");

        const classIds = selectedClassId ? [selectedClassId] : classes.map(c => c.id);

        const res = await fetch('/api/whatsapp/community-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classIds, text: broadcastMessage, options })
        });
        const data = await res.json();
        toast.dismiss();
        if (data.success) {
          toast.success("Community Broadcast completed successfully!");
          setBroadcastMessage('');
          clearFile();
        } else {
          throw new Error(data.error || "Failed to send community broadcast");
        }
      } catch (err: any) {
        toast.dismiss();
        toast.error(err.message || "Community Broadcast failed");
      } finally {
        setIsSendingBroadcast(false);
      }
      return;
    }

    setIsSendingBroadcast(true);
    try {
      toast.loading("Preparing recipients...");
      let allRecipients: any[] = [];

      if (broadcastTarget === 'students' || broadcastTarget === 'all') {
        const constraints = [where('status', '==', 'active')];
        if (selectedClassId) constraints.push(where('classId', '==', selectedClassId));
        if (selectedBatchId) constraints.push(where('batchId', '==', selectedBatchId));
        
        let data = await dbService.list('students', constraints);
        
        // Handle transport logic separately to avoid composite index errors
        if (selectedStopId) {
          data = data.filter(s => s.transportStopId === selectedStopId);
        } else if (selectedBusId) {
          const busStops = stops.filter(s => s.busId === selectedBusId).map(s => s.id);
          data = data.filter(s => busStops.includes(s.transportStopId));
        }

        // Handle hostel logic
        if (selectedHostelName) {
          if (selectedHostelName === 'any_hostel') {
            data = data.filter(s => s.feeType?.toLowerCase() === 'hostel');
          } else {
            data = data.filter(s => s.feeType?.toLowerCase() === 'hostel' && s.hostelName === selectedHostelName);
          }
        }

        allRecipients = [...allRecipients, ...data];
      }

      if (broadcastTarget === 'staff' || broadcastTarget === 'all') {
        const data = await dbService.list('staff', [where('status', '==', 'active')]);
        allRecipients = [...allRecipients, ...data];
      }

      const recipientsPayload = allRecipients.map(s => {
        const phone = extractParentPhone(s);
        return {
          phone,
          studentId: s.id || s.uid || null,
          classId: s.classId || null
        };
      }).filter(r => !!r.phone);

      // Deduplicate recipients by (phone, classId) or purely by phone for school-wide broadcasts:
      // 1. For class-specific broadcasts: deduplicate per class so class-wise notices apply.
      // 2. For school-wide broadcasts (All classes): deduplicate strictly by phone number so parents with multiple children receive ONLY ONE broadcast message (preventing spam complaints).
      const uniqueRecipientsMap = new Map<string, any>();
      for (const r of recipientsPayload) {
        const cleanPhone = r.phone.replace(/\+/g, '').replace(/\D/g, '');
        const last10Digits = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
        const key = selectedClassId ? `${last10Digits}_${r.classId || 'none'}` : last10Digits;
        if (!uniqueRecipientsMap.has(key)) {
          uniqueRecipientsMap.set(key, r);
        }
      }
      const deduplicatedPayload = Array.from(uniqueRecipientsMap.values());

      if (deduplicatedPayload.length === 0) {
        toast.error("No recipients found for selected filters");
        setIsSendingBroadcast(false);
        return;
      }
      const options: any = { isBroadcast: true, broadcastTarget };
      
      if (selectedFile) {
        toast.loading("Uploading media...");
        const uploadResult = await uploadFile();
        toast.dismiss();
        if (!uploadResult) {
          setIsSendingBroadcast(false);
          return;
        }

        if (uploadResult.mimetype.startsWith('image/')) {
          options.imageUrl = uploadResult.filePath;
        } else if (uploadResult.mimetype.startsWith('video/')) {
          options.videoUrl = uploadResult.filePath;
        } else {
          options.documentUrl = uploadResult.filePath;
          options.fileName = uploadResult.fileName;
        }
      }

      toast.loading(`Enqueuing ${deduplicatedPayload.length} broadcasts with 4 msgs/min rate limiting...`);

      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: deduplicatedPayload, text: broadcastMessage, options })
      });
      const data = await res.json();
      if (data.success) {
        toast.dismiss();
        toast.success(`${deduplicatedPayload.length} messages added to queue! (Paced at 4 msgs/min for Meta Anti-Ban Safety)`);
        setBroadcastMessage('');
        clearFile();
      }
    } catch (err) {
      toast.dismiss();
      toast.error("Broadcast failed");
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const handleSendBirthdayWishes = async () => {
    setIsGeneratingWishes(true);
    try {
      toast.loading("Fetching all celebrants...");
      const today = format(new Date(), 'MM-dd');

      const currentCollection = targetBirthdayType === 'students' ? 'students' : 'staff';
      const constraints: any[] = [where('status', '==', 'active')];

      // Fetch ALL celebrants for the actual send (without limit, or a large limit)
      const allActiveUsers = await dbService.list(currentCollection, constraints);
      const actualCelebrants = (allActiveUsers as any[]).filter(p => {
        if (!p.dateOfBirth) return false;
        return p.dateOfBirth.slice(5) === today;
      });

      if (actualCelebrants.length === 0) {
        toast.error("No celebrants found today");
        setIsGeneratingWishes(false);
        return;
      }

      let successCount = 0;
      const template = selectedTemplateId === 'ai' ? null : birthdayTemplates.find(t => t.id === selectedTemplateId);
      
      let uploadResult = null;
      if (selectedFile) {
        toast.loading("Uploading birthday media...");
        uploadResult = await uploadFile();
        toast.dismiss();
      }

      for (const person of actualCelebrants) {
        let wish = '';
        if (template) {
          wish = template.content.replace('{name}', person.name);
        } else {
          wish = await getBirthdayWish(person.name, targetBirthdayType === 'students' ? 'student' : 'staff');
        }

        const to = extractParentPhone(person);
        if (!to) continue;

        const options: any = {};
        if (uploadResult) {
          if (uploadResult.mimetype.startsWith('image/')) {
            options.imageUrl = uploadResult.filePath;
          } else if (uploadResult.mimetype.startsWith('video/')) {
            options.videoUrl = uploadResult.filePath;
          } else {
            options.documentUrl = uploadResult.filePath;
            options.fileName = uploadResult.fileName;
          }
        } else if (birthdayVideoUrl) {
          options.videoUrl = birthdayVideoUrl;
          options.fileName = 'birthday_wish.mp4';
        }

        await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, text: wish, options })
        });
        successCount++;
        await new Promise(r => setTimeout(r, 1000));
      }
      toast.success(`Successfully queued ${successCount} birthday wishes!`);
      clearFile();
    } catch (err) {
      toast.error('Failed to send some wishes');
    } finally {
      setIsGeneratingWishes(false);
    }
  };

  const handleAddTemplate = async () => {
    if (!newTemplate.name || !newTemplate.content) return;
    try {
      const customId = newTemplate.name.trim().replace(/\s+/g, '_');
      await dbService.set('birthdayTemplates', customId, { ...newTemplate, createdAt: new Date().toISOString() });
      setNewTemplate({ name: '', content: '', type: 'student' });
      setShowAddTemplate(false);
      toast.success('Template added successfully');
    } catch (err) {
      toast.error('Failed to add template');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await dbService.delete('birthdayTemplates', id);
      if (selectedTemplateId === id) setSelectedTemplateId('ai');
      toast.success('Template deleted');
    } catch (err) {
      toast.error('Failed to delete template');
    }
  };

  const handleSaveCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommunity.communityJid.trim()) {
      toast.error("Please enter Community JID");
      return;
    }
    if (newCommunity.associatedClasses.length === 0) {
      toast.error("Please select at least one associated class");
      return;
    }

    try {
      const id = editingCommunity ? editingCommunity.id : newCommunity.communityJid.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const payload = {
        communityJid: newCommunity.communityJid.trim(),
        associatedClasses: newCommunity.associatedClasses,
        isActive: newCommunity.isActive !== false,
        updatedAt: new Date().toISOString()
      };

      await dbService.set('whatsapp_communities', id, payload);
      
      // Cache this community/group in whatsapp_discovered_groups for the JID Finder
      try {
        await dbService.set('whatsapp_discovered_groups', newCommunity.communityJid.trim(), {
          id: newCommunity.communityJid.trim(),
          subject: `Configured Community (${newCommunity.communityJid.trim().split('@')[0]})`,
          isCommunity: true,
          updatedAt: new Date().toISOString()
        });
      } catch (cacheErr) {}
      
      toast.success(editingCommunity ? "Community updated successfully!" : "Community added successfully!");
      setNewCommunity({ communityJid: '', associatedClasses: [], isActive: true });
      setEditingCommunity(null);
      setShowAddCommunity(false);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save community settings");
    }
  };

  const handleDeleteCommunity = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this community configuration?")) return;
    try {
      await dbService.delete('whatsapp_communities', id);
      toast.success("Community deleted successfully");
      if (editingCommunity?.id === id) {
        setEditingCommunity(null);
        setNewCommunity({ communityJid: '', associatedClasses: [], isActive: true });
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete community configuration");
    }
  };

  const handleToggleCommunityActive = async (comm: any) => {
    try {
      const updatedStatus = comm.isActive === false ? true : false;
      await dbService.set('whatsapp_communities', comm.id, {
        ...comm,
        isActive: updatedStatus,
        updatedAt: new Date().toISOString()
      });
      toast.success(`Community ${updatedStatus ? 'activated' : 'deactivated'} successfully!`);
      
      // If we are editing this exact community, update the active flag in the form as well
      if (editingCommunity?.id === comm.id) {
        setNewCommunity(prev => ({ ...prev, isActive: updatedStatus }));
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to toggle community status");
    }
  };

  const handleDeactivateClassFromCommunity = async (comm: any, classId: string) => {
    try {
      const updatedClasses = (comm.associatedClasses || []).filter((id: string) => id !== classId);
      
      if (updatedClasses.length === 0) {
        if (window.confirm("Removing all mapped classes will leave this community empty. Do you want to deactivate the community instead?")) {
          await dbService.set('whatsapp_communities', comm.id, {
            ...comm,
            isActive: false,
            updatedAt: new Date().toISOString()
          });
          toast.success("Community deactivated successfully!");
          if (editingCommunity?.id === comm.id) {
            setNewCommunity(prev => ({ ...prev, isActive: false }));
          }
          return;
        }
        return;
      }

      await dbService.set('whatsapp_communities', comm.id, {
        ...comm,
        associatedClasses: updatedClasses,
        updatedAt: new Date().toISOString()
      });
      toast.success("Class deactivated/unmapped from community successfully!");
      
      // Update form state if currently editing this community
      if (editingCommunity?.id === comm.id) {
        setNewCommunity(prev => ({ ...prev, associatedClasses: updatedClasses }));
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to deactivate class from community");
    }
  };
  
  const handleAddBotMenu = async () => {
    if (!newBotMenu.keyword || !newBotMenu.responseText) {
      toast.error('Keyword and response text are required');
      return;
    }
    try {
      const customId = newBotMenu.keyword.toLowerCase().trim().replace(/\s+/g, '_');
      await dbService.set('whatsapp_bot_menus', customId, { 
        ...newBotMenu, 
        keyword: newBotMenu.keyword.toLowerCase(),
        updatedAt: new Date().toISOString() 
      });
      setNewBotMenu({ keyword: '', responseText: '', buttons: [], isActive: true });
      setShowAddBotMenu(false);
      toast.success('Bot menu added successfully');
      // Re-fetch list
      const updatedList = await dbService.list('whatsapp_bot_menus');
      setBotMenus(updatedList);
    } catch (err) {
      toast.error('Failed to add bot menu');
    }
  };

  const handleUpdateBotMenu = async (id: string, data: any) => {
    try {
      // Remove id from the data to be updated
      const { id: _, ...updateData } = data;
      await dbService.update('whatsapp_bot_menus', id, { ...updateData, updatedAt: new Date().toISOString() });
      setEditingBotMenu(null);
      setShowAddBotMenu(false);
      toast.success('Bot menu updated');
      // Re-fetch list
      const updatedList = await dbService.list('whatsapp_bot_menus');
      setBotMenus(updatedList);
    } catch (err) {
      toast.error('Failed to update bot menu');
    }
  };

  const handleDeleteBotMenu = async (id: string) => {
    if (!id) return;
    if (!window.confirm('Delete this bot menu?')) return;
    const loadingToast = toast.loading('Deleting menu...');
    try {
      await dbService.delete('whatsapp_bot_menus', id);
      toast.success('Bot menu deleted', { id: loadingToast });
      if (editingBotMenu?.id === id) {
        setShowAddBotMenu(false);
        setEditingBotMenu(null);
      }
      // Re-fetch list
      const updatedList = await dbService.list('whatsapp_bot_menus');
      setBotMenus(updatedList);
    } catch (err) {
      console.error("Delete menu error:", err);
      toast.error('Failed to delete bot menu', { id: loadingToast });
    }
  };

  const statusColors = {
    open: 'text-green-500 bg-green-50 border-green-200',
    close: 'text-red-500 bg-red-50 border-red-200',
    qr: 'text-amber-500 bg-amber-50 border-amber-200',
    connecting: 'text-blue-500 bg-blue-50 border-blue-200',
  };

  if (availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-white rounded-[2rem] border border-neutral-100 shadow-sm">
        <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-6">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-black text-sidebar uppercase tracking-tight">Access Restricted</h2>
        <p className="text-neutral-500 max-w-sm mt-2 font-medium">
          You don't have permission to access the Communication Management module. 
          Specific messaging features may still be available within their respective modules (e.g., Fees, Attendance).
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-sidebar tracking-tight flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-primary" />
            Communication Channels
          </h1>
          <p className="text-neutral-500 text-sm mt-1">Intelligent automation and communication hub.</p>
        </div>
        <div className="flex items-center gap-4">
          {canViewSetup && (
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-neutral-100 shadow-sm">
              <span className="text-xs font-bold text-neutral-500">GEMINI AI</span>
              <button
                onClick={() => updateSettings({ aiAgentEnabled: !settings.aiAgentEnabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.aiAgentEnabled ? 'bg-green-500' : 'bg-neutral-300'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.aiAgentEnabled ? 'translate-x-6' : ''}`} />
              </button>
              <span className={`text-[10px] font-black ${settings.aiAgentEnabled ? 'text-green-600' : 'text-neutral-400'}`}>
                {settings.aiAgentEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
          )}
          {canViewSetup && (
            <div className="flex items-center gap-2">
              <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${statusColors[status]}`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${status === 'open' ? 'bg-green-500' : status === 'qr' ? 'bg-amber-500' : 'bg-red-500'}`} />
                {status.toUpperCase()}
              </div>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleResetWA();
                }}
                title="Reset WhatsApp Session"
                className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all relative z-40 group"
              >
                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-all" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left Status Sidebar */}
        {canViewSetup && (
          <div className="w-80 flex flex-col gap-6">
            <div className="bg-white rounded-3xl p-6 border border-neutral-100 shadow-sm flex flex-col items-center justify-center text-center">
              {status === 'qr' && qr ? (
                <div className="space-y-4">
                  <div className="p-4 bg-white border-2 border-primary/20 rounded-2xl shadow-xl">
                    <QRCodeSVG value={qr} size={200} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-sidebar">Link Your Device</h3>
                    <p className="text-xs text-neutral-400 italic">Open WhatsApp &gt; Linked Devices &gt; Link Device</p>
                  </div>
                </div>
              ) : status === 'open' ? (
                <div className="space-y-4 w-full">
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto shadow-inner text-green-500">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-sidebar">System Online</h3>
                    <div className="flex flex-col gap-1 px-4 py-3 bg-neutral-50 rounded-2xl border border-neutral-100 mt-4">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                         <span className="text-neutral-400">STUDENTS</span>
                         <span className="text-primary">{students.length}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold">
                         <span className="text-neutral-400">STAFF</span>
                         <span className="text-primary">{staff.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-8">
                  <div className="relative flex items-center justify-center">
                    <QrCode className="w-16 h-16 text-primary/40 mx-auto animate-pulse" />
                  </div>
                  <div className="space-y-3">
                     <div className="text-center">
                       <p className="text-xs font-bold text-neutral-700">
                         {status === 'connecting' ? 'Initializing Engine...' : 'Connection Offline'}
                       </p>
                       <p className="text-[10px] text-neutral-400 mt-1">
                         {status === 'connecting' ? 'Generating QR Code... Click below if delayed.' : 'Click below to generate new QR Code'}
                       </p>
                     </div>
                     <button 
                       onClick={handleRestartWA}
                       className="w-full px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                     >
                       <QrCode className="w-4 h-4" />
                       Generate QR Code / Retry
                     </button>
                     <button 
                       onClick={handleResetWA}
                       className="w-full px-3 py-1.5 text-neutral-400 rounded-xl text-[10px] font-semibold hover:text-red-500 hover:bg-red-50 transition-all"
                     >
                       Reset WhatsApp Session
                     </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl flex-1 border border-neutral-100 shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-neutral-50 flex items-center justify-between">
                <h3 className="font-bold text-sidebar text-sm">Recent Activity</h3>
                <History className="w-4 h-4 text-neutral-300" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m) => (
                  <div key={m.id} className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-black text-primary">+{m.from}</span>
                      <span className="text-[8px] text-neutral-400">{format(m.timestamp * 1000, 'HH:mm')}</span>
                    </div>
                    <p className="text-[11px] text-sidebar line-clamp-2">{m.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 bg-white rounded-[40px] border border-neutral-100 shadow-xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-neutral-50 flex items-center justify-between">
            <div className="flex gap-2 p-1 bg-neutral-100 rounded-2xl">
              {availableTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-sidebar'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl text-[10px] font-black text-amber-600">
                <AlertCircle className="w-3 h-3" />
                RATE LIMIT: ~4 MSG / MINUTE (PREVENTS WHATSAPP BANS)
              </div>
              <button
                onClick={() => setShowCommunitySettings(true)}
                className="p-2.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-600 hover:text-primary transition-all shadow-sm flex items-center justify-center"
                title="WhatsApp Communities Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            <AnimatePresence mode="wait">
              {availableTabs.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                    <ShieldAlert className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold">Access Restricted</h3>
                  <p className="text-sm text-neutral-500 max-w-sm">
                    You don't have personal permissions assigned to access communication features. Please contact the administrator.
                  </p>
                </motion.div>
              )}
              {activeTab === 'chats' && (
                <motion.div key="chats" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-xl mx-auto space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Recipient Number</label>
                    <input value={targetNumber} onChange={(e) => setTargetNumber(e.target.value)} placeholder="919999999999" className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-3xl text-sm font-bold shadow-inner outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Message</label>
                    <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type message..." rows={6} className="w-full p-6 bg-neutral-50 border border-neutral-100 rounded-[32px] text-sm outline-none transition-all resize-none shadow-inner" />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Attachment</label>
                    <div className="flex gap-4">
                      {mediaPreviewUrl ? (
                         <div className="relative w-full h-40 rounded-3xl overflow-hidden border border-neutral-100 bg-neutral-50 flex items-center justify-center">
                            {selectedFile?.type.startsWith('image/') ? (
                              <img src={mediaPreviewUrl} className="w-full h-full object-cover" alt="Preview" />
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <Video className="w-10 h-10 text-primary" />
                                <span className="text-xs font-bold">{selectedFile?.name}</span>
                              </div>
                            )}
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearFile();
                              }}
                              className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors relative z-10"
                            >
                              <Trash2 className="w-4 h-4 pointer-events-none" />
                            </button>
                         </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 w-full">
                          <label className="flex flex-col items-center justify-center gap-2 p-6 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-3xl cursor-pointer hover:bg-neutral-100 transition-all group">
                            <ImageIcon className="w-6 h-6 text-neutral-400 group-hover:text-primary transition-colors" />
                            <span className="text-[10px] font-black text-neutral-400 group-hover:text-primary">ADD PHOTO</span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                          </label>
                          <label className="flex flex-col items-center justify-center gap-2 p-6 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-3xl cursor-pointer hover:bg-neutral-100 transition-all group">
                            <Video className="w-6 h-6 text-neutral-400 group-hover:text-primary transition-colors" />
                            <span className="text-[10px] font-black text-neutral-400 group-hover:text-primary">ADD VIDEO</span>
                            <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={handleSendMessage} disabled={status !== 'open' || uploadingFile} className="w-full py-5 bg-sidebar text-white rounded-[32px] font-black shadow-2xl hover:scale-[1.01] transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    <Send className="w-5 h-5" /> Dispatch
                  </button>
                </motion.div>
              )}

              {activeTab === 'broadcast' && (
                <motion.div key="broadcast" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-2xl mx-auto space-y-8">
                  {/* Meta Anti-Ban Safety Notice */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs text-emerald-900">
                      <p className="font-bold">Meta WhatsApp Anti-Ban Protection Active</p>
                      <p className="text-emerald-700 leading-relaxed font-medium">
                        Messages are automatically paced at <strong>4 messages per minute (~15s interval)</strong> with human jitter, batch cooling pauses, and automated opt-out handling to protect your WhatsApp number from Meta bans.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-neutral-400 px-1">BROADCAST TARGET</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        { id: 'students', label: 'Students', icon: Users },
                        { id: 'staff', label: 'Staff', icon: UserCircle },
                        { id: 'communities', label: 'Communities', icon: Globe },
                        { id: 'excel', label: 'Excel Marks Sheet', icon: FileSpreadsheet, highlight: true },
                        { id: 'all', label: 'Everyone', icon: Globe }
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => setBroadcastTarget(t.id as any)}
                          className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all relative ${
                            broadcastTarget === t.id 
                              ? 'bg-primary/5 border-primary text-primary shadow-sm' 
                              : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200'
                          }`}
                        >
                          <t.icon className="w-5 h-5" />
                          <span className="text-[10px] font-black uppercase text-center leading-tight">{t.label}</span>
                          {t.highlight && (
                            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded-full shadow-sm">
                              EXCEL
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {broadcastTarget === 'excel' && (
                    <div className="space-y-6">
                      {/* Template Download Card */}
                      <div className="p-5 bg-gradient-to-br from-indigo-50/80 via-blue-50/40 to-white rounded-[2rem] border border-blue-200/80 space-y-4 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
                              <Download className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-blue-950">Download Marks Excel Template</h4>
                              <p className="text-xs text-blue-700 font-medium">Pre-formatted templates with auto total/percentage formulas</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowTemplateModal(true)}
                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 self-start sm:self-auto"
                          >
                            <Settings className="w-3.5 h-3.5" /> Customize & Class Roster
                          </button>
                        </div>

                        {/* Quick 1-Click Template Downloads */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleQuickDownloadTemplate('highSchool')}
                            className="p-3 bg-white/90 hover:bg-white border border-blue-200 rounded-xl text-left transition-all hover:shadow-md group flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-black text-blue-950 group-hover:text-blue-600">High School (7 Subjects)</span>
                              <Download className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                            <span className="text-[10px] text-neutral-500 font-medium line-clamp-1">
                              Telugu, Hindi, English, Maths, PS, BS, Social
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickDownloadTemplate('standard6')}
                            className="p-3 bg-white/90 hover:bg-white border border-blue-200 rounded-xl text-left transition-all hover:shadow-md group flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-black text-blue-950 group-hover:text-blue-600">Standard (6 Subjects)</span>
                              <Download className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                            <span className="text-[10px] text-neutral-500 font-medium line-clamp-1">
                              Telugu, Hindi, English, Maths, Science, Social
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickDownloadTemplate('primary')}
                            className="p-3 bg-white/90 hover:bg-white border border-blue-200 rounded-xl text-left transition-all hover:shadow-md group flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-black text-blue-950 group-hover:text-blue-600">Primary (4 Subjects)</span>
                              <Download className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                            <span className="text-[10px] text-neutral-500 font-medium line-clamp-1">
                              Telugu, English, Mathematics, EVS
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Upload Box */}
                      <div className="p-6 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-white rounded-[2rem] border-2 border-dashed border-emerald-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-sm">
                              <FileSpreadsheet className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-emerald-950">Upload Marks Excel / CSV Sheet</h4>
                              <p className="text-xs text-emerald-700 font-medium">Supports dynamic subjects — any subjects added or removed adjust automatically</p>
                            </div>
                          </div>
                          {excelFileName && (
                            <button
                              type="button"
                              onClick={() => {
                                setExcelFile(null);
                                setExcelFileName('');
                                setParsedExcelRows([]);
                                setDetectedExcelSubjects([]);
                              }}
                              className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Clear Sheet
                            </button>
                          )}
                        </div>

                        {!excelFileName ? (
                          <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-emerald-300/80 rounded-2xl cursor-pointer hover:bg-emerald-50/50 transition-all group bg-white/60">
                            <FileUp className="w-10 h-10 text-emerald-500 group-hover:scale-110 transition-transform mb-2" />
                            <span className="text-sm font-bold text-emerald-900 mb-1">Click to browse or drag & drop Excel / CSV marks sheet</span>
                            <span className="text-xs text-emerald-600 font-medium">Auto-detects Candidate ID, Student Name, Father Name, Subject Marks, Total & Ranks</span>
                            <input
                              type="file"
                              accept=".xlsx, .xls, .csv"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleExcelUpload(e.target.files[0]);
                                }
                              }}
                            />
                          </label>
                        ) : (
                          <div className="p-4 bg-white rounded-2xl border border-emerald-200/80 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                              <div>
                                <p className="text-sm font-bold text-neutral-800">{excelFileName}</p>
                                <p className="text-xs text-neutral-500">
                                  {parsedExcelRows.length} students • {detectedExcelSubjects.length} subjects detected
                                </p>
                              </div>
                            </div>
                            <label className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-200 transition-colors flex items-center gap-1">
                              <RefreshCw className="w-3.5 h-3.5" /> Re-upload
                              <input
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleExcelUpload(e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        )}

                        <div className="p-3.5 bg-emerald-100/50 rounded-xl text-[11px] text-emerald-900 leading-relaxed font-medium">
                          💡 <strong>Dynamic Subject Support:</strong> If subjects are increased (e.g. adding Physics, Chemistry, CDF) or decreased (e.g. Primary 4 subjects), the system automatically adjusts all columns and formats the WhatsApp report perfectly.
                        </div>
                      </div>

                      {/* Detected Subjects Chip Row */}
                      {detectedExcelSubjects.length > 0 && (
                        <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2.5 shadow-md">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-emerald-400" />
                              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                                Detected Subject Columns ({detectedExcelSubjects.length})
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                              ✨ Auto-Adjusted
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {detectedExcelSubjects.map((subj, idx) => (
                              <span
                                key={subj}
                                className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 flex items-center gap-1.5"
                              >
                                <span className="text-[10px] text-slate-400">{idx + 1}.</span>
                                {subj}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Summary Metrics */}
                      {parsedExcelRows.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl">
                            <p className="text-[10px] font-black uppercase text-neutral-400">Total Records</p>
                            <p className="text-lg font-black text-neutral-900">{parsedExcelRows.length}</p>
                          </div>
                          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                            <p className="text-[10px] font-black uppercase text-emerald-600">WhatsApp Ready</p>
                            <p className="text-lg font-black text-emerald-700">{parsedExcelRows.filter(r => !!r.phone).length}</p>
                          </div>
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                            <p className="text-[10px] font-black uppercase text-amber-600">Missing Phone</p>
                            <p className="text-lg font-black text-amber-700">{parsedExcelRows.filter(r => !r.phone).length}</p>
                          </div>
                          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
                            <p className="text-[10px] font-black uppercase text-blue-600">Exam Title</p>
                            <p className="text-xs font-black text-blue-800 truncate" title={excelExamTitle || 'Standard Exam'}>{excelExamTitle || 'Standard Exam'}</p>
                          </div>
                        </div>
                      )}

                      {/* Template Editor */}
                      {parsedExcelRows.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
                              WhatsApp Message Template
                            </label>
                            <span className="text-[10px] text-neutral-400 font-medium">Click tags below to insert</span>
                          </div>

                          {/* Standard Variable Chips */}
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: 'Student Name', tag: '{studentName}' },
                              { label: 'Father Name', tag: '{fatherName}' },
                              { label: 'Exam Name', tag: '{examName}' },
                              { label: 'Roll No', tag: '{rollNo}' },
                              { label: 'Total', tag: '{total}' },
                              { label: 'Percentage', tag: '{percentage}' },
                              { label: 'Rank', tag: '{rankLine}' },
                              { label: 'Performance Status', tag: '{status}' },
                              { label: 'Subject Marks List (All)', tag: '{subjectMarks}' }
                            ].map(item => (
                              <button
                                key={item.tag}
                                type="button"
                                onClick={() => setExcelTemplate(prev => prev + ' ' + item.tag)}
                                className="px-2.5 py-1 bg-neutral-100 hover:bg-primary/10 hover:text-primary rounded-lg text-xs font-semibold text-neutral-600 transition-colors"
                              >
                                + {item.label}
                              </button>
                            ))}
                          </div>

                          {/* Individual Subject Variable Chips */}
                          {detectedExcelSubjects.length > 0 && (
                            <div className="p-3 bg-neutral-100/70 rounded-xl space-y-1.5 border border-neutral-200/60">
                              <p className="text-[10px] font-bold uppercase text-neutral-500">Insert Individual Subject Marks:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {detectedExcelSubjects.map(s => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => setExcelTemplate(prev => prev + ` {${s}}`)}
                                    className="px-2 py-0.5 bg-white hover:bg-blue-50 hover:text-blue-700 border border-neutral-200 rounded-md text-[11px] font-mono text-neutral-700 transition-colors"
                                  >
                                    +{`{${s}}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <textarea
                            value={excelTemplate}
                            onChange={(e) => setExcelTemplate(e.target.value)}
                            rows={8}
                            className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs font-mono outline-none focus:border-primary transition-all shadow-inner"
                          />
                        </div>
                      )}

                      {/* Live Preview Card */}
                      {parsedExcelRows.length > 0 && (
                        <div className="p-5 bg-neutral-900 text-white rounded-[2rem] space-y-4 shadow-xl">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Eye className="w-4 h-4 text-emerald-400" />
                              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Live WhatsApp Message Preview</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={previewRowIndex <= 0}
                                onClick={() => setPreviewRowIndex(prev => Math.max(0, prev - 1))}
                                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold"
                              >
                                ◀ Prev
                              </button>
                              <span className="text-xs font-bold text-neutral-300">
                                {previewRowIndex + 1} / {parsedExcelRows.length}
                              </span>
                              <button
                                type="button"
                                disabled={previewRowIndex >= parsedExcelRows.length - 1}
                                onClick={() => setPreviewRowIndex(prev => Math.min(parsedExcelRows.length - 1, prev + 1))}
                                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold"
                              >
                                Next ▶
                              </button>
                            </div>
                          </div>

                          {/* Student Info Bar in Preview */}
                          {parsedExcelRows[previewRowIndex] && (
                            <div className="p-3 bg-neutral-800 rounded-xl flex items-center justify-between text-xs">
                              <div>
                                <span className="font-bold text-white">{parsedExcelRows[previewRowIndex].studentName}</span>
                                <span className="text-neutral-400 ml-2">(ID: {parsedExcelRows[previewRowIndex].candidateId || '-'})</span>
                              </div>
                              <div>
                                <span className="text-neutral-400">Recipient: </span>
                                <span className="font-mono font-bold text-emerald-400">
                                  {parsedExcelRows[previewRowIndex].phone || '⚠️ No phone'}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Chat Bubble */}
                          <div className="p-4 bg-[#075E54] text-white rounded-2xl rounded-tl-none text-xs font-mono whitespace-pre-wrap leading-relaxed shadow-md">
                            {parsedExcelRows[previewRowIndex] 
                              ? generateExcelStudentMessage(parsedExcelRows[previewRowIndex], excelTemplate)
                              : 'No data'}
                          </div>
                        </div>
                      )}

                      {/* Interactive Student Records Table */}
                      {parsedExcelRows.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
                              Student Marks & Phone Verification ({parsedExcelRows.length})
                            </label>
                            <div className="relative w-48">
                              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                              <input
                                type="text"
                                placeholder="Search student..."
                                value={excelSearchFilter}
                                onChange={(e) => setExcelSearchFilter(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs outline-none focus:border-primary"
                              />
                            </div>
                          </div>

                          <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white max-h-80 overflow-y-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-neutral-50 sticky top-0 z-10 text-[10px] font-black uppercase text-neutral-400 border-b border-neutral-200">
                                <tr>
                                  <th className="p-3">#</th>
                                  <th className="p-3">Candidate ID</th>
                                  <th className="p-3">Student Name</th>
                                  <th className="p-3">Father Name</th>
                                  <th className="p-3">Parent Phone</th>
                                  <th className="p-3">Total / %</th>
                                  <th className="p-3">Status</th>
                                  <th className="p-3 text-right">Preview</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {parsedExcelRows
                                  .filter(r => {
                                    if (!excelSearchFilter) return true;
                                    const q = excelSearchFilter.toLowerCase();
                                    return (
                                      r.studentName?.toLowerCase().includes(q) ||
                                      r.candidateId?.toLowerCase().includes(q) ||
                                      r.fatherName?.toLowerCase().includes(q) ||
                                      r.phone?.includes(q)
                                    );
                                  })
                                  .map((row) => (
                                    <tr key={row.id} className="hover:bg-neutral-50/80 transition-colors">
                                      <td className="p-3 text-neutral-400">{row.index}</td>
                                      <td className="p-3 font-mono font-bold text-neutral-800">{row.candidateId || '-'}</td>
                                      <td className="p-3 font-bold text-neutral-900">{row.studentName}</td>
                                      <td className="p-3 text-neutral-600">{row.fatherName || '-'}</td>
                                      <td className="p-3">
                                        <input
                                          type="text"
                                          value={row.phone}
                                          placeholder="Enter phone..."
                                          onChange={(e) => handleUpdateExcelPhone(row.id, e.target.value)}
                                          className={`px-2 py-1 rounded-lg border text-xs font-mono outline-none w-32 ${
                                            row.phone ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'
                                          }`}
                                        />
                                      </td>
                                      <td className="p-3">
                                        <span className="font-bold">{row.total || '-'}</span>
                                        {row.percentage && <span className="text-neutral-400 ml-1">({row.percentage}%)</span>}
                                      </td>
                                      <td className="p-3">
                                        <span className="px-2 py-0.5 bg-neutral-100 rounded-md text-[10px] font-bold text-neutral-700">
                                          {row.status}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewRowIndex(row.index - 1)}
                                          className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors"
                                          title="View WhatsApp Preview"
                                        >
                                          <Eye className="w-4 h-4" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {broadcastTarget === 'communities' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 px-1">SELECT CLASS</label>
                        <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-bold outline-none">
                          <option value="">All Classes (Send to all mapped communities)</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                        <Info className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-800 font-medium leading-relaxed">
                          ఈ మెసేజ్ ఎంచుకున్న తరగతులకు సంబంధించిన <strong>WhatsApp Community Announcement Groups</strong> కు పంపబడుతుంది. మీరు కుడివైపున ఉన్న గేర్ (Settings) ఐకాన్ పై క్లిక్ చేసి కమ్యూనిటీలను కాన్ఫిగర్ చేయవచ్చు.
                        </p>
                      </div>
                    </div>
                  )}

                  {broadcastTarget !== 'staff' && broadcastTarget !== 'communities' && broadcastTarget !== 'excel' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-neutral-400 px-1">SELECT CLASS</label>
                          <select value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setSelectedBatchId(''); }} className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-bold outline-none">
                            <option value="">All Classes</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-neutral-400 px-1">SELECT SECTION/BATCH</label>
                          <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-bold outline-none">
                            <option value="">All Sections</option>
                            {batches.filter(b => !selectedClassId || b.classId === selectedClassId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="p-6 bg-neutral-50 rounded-[2rem] border border-neutral-100 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Bus className="w-4 h-4 text-primary" />
                          <label className="text-[10px] font-black text-sidebar uppercase tracking-widest">Transport Route Filtering</label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral-400">SELECT BUS</label>
                            <select 
                              value={selectedBusId} 
                              onChange={(e) => { setSelectedBusId(e.target.value); setSelectedStopId(''); }} 
                              className="w-full p-4 bg-white border border-neutral-100 rounded-2xl text-sm font-bold outline-none shadow-sm"
                            >
                              <option value="">All Routes</option>
                              {buses.map(b => <option key={b.id} value={b.id}>Bus {b.busNumber} ({b.driverName})</option>)}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral-400">SELECT VILLAGE / STOP</label>
                            <select 
                              value={selectedStopId} 
                              onChange={(e) => setSelectedStopId(e.target.value)} 
                              className="w-full p-4 bg-white border border-neutral-100 rounded-2xl text-sm font-bold outline-none shadow-sm"
                            >
                              <option value="">All Villages {selectedBusId ? `for Bus ${buses.find(b => b.id === selectedBusId)?.busNumber}` : ''}</option>
                              {stops
                                .filter(s => !selectedBusId || s.busId === selectedBusId)
                                .map(s => <option key={s.id} value={s.id}>{s.villageName}</option>)
                              }
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-neutral-50 rounded-[2rem] border border-neutral-100 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Home className="w-4 h-4 text-primary" />
                          <label className="text-[10px] font-black text-sidebar uppercase tracking-widest">Hostel Wise Filtering</label>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-neutral-400">SELECT HOSTEL BLOCK</label>
                          <select 
                            value={selectedHostelName} 
                            onChange={(e) => setSelectedHostelName(e.target.value)} 
                            className="w-full p-4 bg-white border border-neutral-100 rounded-2xl text-sm font-bold outline-none shadow-sm"
                          >
                            <option value="">All Students (Day Scholars + Hostel Residents)</option>
                            <option value="any_hostel">All Hostel Residents (Any Block)</option>
                            {hostelBlocks.map(block => (
                              <option key={block.id} value={block.name}>{block.name} (Capacity: {block.capacity || 'N/A'})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {broadcastTarget !== 'excel' && (
                    <>
                      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-blue-500" />
                          <p className="text-xs font-bold text-blue-800">
                            Target Recipients: {recipientCount} People
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 px-1">BROADCAST CONTENT</label>
                        <textarea value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} placeholder="Send an announcement to all selected students..." rows={6} className="w-full p-6 bg-neutral-50 border border-neutral-100 rounded-[32px] text-sm outline-none transition-all shadow-inner" />
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Broadcast Attachment</label>
                        <div className="flex gap-4">
                          {mediaPreviewUrl ? (
                             <div className="relative w-full h-40 rounded-3xl overflow-hidden border border-neutral-100 bg-neutral-50 flex items-center justify-center">
                                {selectedFile?.type.startsWith('image/') ? (
                                  <img src={mediaPreviewUrl} className="w-full h-full object-cover" alt="Preview" />
                                ) : (
                                  <div className="flex flex-col items-center gap-2">
                                    <Video className="w-10 h-10 text-primary" />
                                    <span className="text-xs font-bold">{selectedFile?.name}</span>
                                  </div>
                                )}
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    clearFile();
                                  }}
                                  className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors relative z-10"
                                >
                                  <Trash2 className="w-4 h-4 pointer-events-none" />
                                </button>
                             </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-4 w-full">
                              <label className="flex flex-col items-center justify-center gap-2 p-6 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-3xl cursor-pointer hover:bg-neutral-100 transition-all group">
                                <ImageIcon className="w-6 h-6 text-neutral-400 group-hover:text-primary transition-colors" />
                                <span className="text-[10px] font-black text-neutral-400 group-hover:text-primary">ADD PHOTO</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                              </label>
                              <label className="flex flex-col items-center justify-center gap-2 p-6 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-3xl cursor-pointer hover:bg-neutral-100 transition-all group">
                                <Video className="w-6 h-6 text-neutral-400 group-hover:text-primary transition-colors" />
                                <span className="text-[10px] font-black text-neutral-400 group-hover:text-primary">ADD VIDEO</span>
                                <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {broadcastTarget === 'excel' ? (
                    <button 
                      onClick={handleRunBroadcast} 
                      disabled={isSendingBroadcast || status !== 'open' || parsedExcelRows.filter(r => !!r.phone).length === 0} 
                      className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-[32px] font-black shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      <FileSpreadsheet className="w-5 h-5" /> 
                      {isSendingBroadcast 
                        ? 'Queuing Messages...' 
                        : `Start Broadcast (Send ${parsedExcelRows.filter(r => !!r.phone).length} WhatsApp Marks Messages)`}
                    </button>
                  ) : (
                    <button onClick={handleRunBroadcast} disabled={isSendingBroadcast || status !== 'open' || uploadingFile} className="w-full py-5 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-[32px] font-black shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                      <Megaphone className="w-5 h-5" /> Start Broadcast
                    </button>
                  )}
                </motion.div>
              )}

              {activeTab === 'queue' && (
                <motion.div key="queue" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold">Delivery Queue</h3>
                      <p className="text-sm text-neutral-500 font-medium">Monitoring messages in processing and scheduled for delivery.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setQueueStatusFilter(queueStatusFilter === 'processing' ? 'all' : 'processing')}
                        className={`px-4 py-2 border rounded-xl text-center transition-all ${queueStatusFilter === 'processing' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                        <p className={`text-[10px] font-black uppercase ${queueStatusFilter === 'processing' ? 'text-blue-100' : 'text-blue-400'}`}>Processing</p>
                        <p className="text-lg font-black">{queueItems.filter(i => i.status === 'processing').length}</p>
                      </button>
                      <button 
                        onClick={() => setQueueStatusFilter(queueStatusFilter === 'pending' ? 'all' : 'pending')}
                        className={`px-4 py-2 border rounded-xl text-center transition-all ${queueStatusFilter === 'pending' ? 'bg-amber-600 border-amber-600 text-white shadow-lg' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                        <p className={`text-[10px] font-black uppercase ${queueStatusFilter === 'pending' ? 'text-amber-100' : 'text-amber-400'}`}>Pending</p>
                        <p className="text-lg font-black">{queueItems.filter(i => i.status === 'pending').length}</p>
                      </button>
                      <button 
                        onClick={() => setQueueStatusFilter(queueStatusFilter === 'sent' ? 'all' : 'sent')}
                        className={`px-4 py-2 border rounded-xl text-center transition-all ${queueStatusFilter === 'sent' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                        <p className={`text-[10px] font-black uppercase ${queueStatusFilter === 'sent' ? 'text-emerald-100' : 'text-emerald-400'}`}>Sent</p>
                        <p className="text-lg font-black">{queueItems.filter(i => i.status === 'sent').length}</p>
                      </button>
                      <button 
                        onClick={() => setQueueStatusFilter(queueStatusFilter === 'cancelled' ? 'all' : 'cancelled')}
                        className={`px-4 py-2 border rounded-xl text-center transition-all ${queueStatusFilter === 'cancelled' ? 'bg-neutral-600 border-neutral-600 text-white shadow-lg' : 'bg-neutral-50 border-neutral-100 text-neutral-600'}`}>
                        <p className={`text-[10px] font-black uppercase ${queueStatusFilter === 'cancelled' ? 'text-neutral-100' : 'text-neutral-400'}`}>Cancelled</p>
                        <p className="text-lg font-black">{queueItems.filter(i => i.status === 'cancelled').length}</p>
                      </button>
                      <button 
                        onClick={() => setQueueStatusFilter(queueStatusFilter === 'failed' ? 'all' : 'failed')}
                        className={`px-4 py-2 border rounded-xl text-center transition-all ${queueStatusFilter === 'failed' ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-red-50 border-red-100 text-red-600'}`}>
                        <p className={`text-[10px] font-black uppercase ${queueStatusFilter === 'failed' ? 'text-red-100' : 'text-red-400'}`}>Failed</p>
                        <p className="text-lg font-black">{queueItems.filter(i => i.status === 'failed').length}</p>
                      </button>
                    </div>
                  </div>

                  {isQueueLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <p className="text-xs font-bold text-neutral-400">Loading queue status...</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                       <section className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                          <h4 className="text-[10px] font-black text-sidebar uppercase tracking-widest">Active Queue ({queueItems.length})</h4>
                          <div className="flex items-center gap-3">
                            {queueItems.some(i => i.status === 'pending' || i.status === 'retrying' || i.status === 'processing') && (
                              <div className="flex items-center gap-2">
                                {confirmingCancelAll ? (
                                  <>
                                    <span className="text-[10px] font-black text-red-600 uppercase tracking-wider animate-pulse">Are you sure?</span>
                                    <button 
                                      onClick={async () => {
                                        setConfirmingCancelAll(false);
                                        await handleCancelAllQueue();
                                      }}
                                      className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-sm"
                                    >
                                      Yes, Stop All
                                    </button>
                                    <button 
                                      onClick={() => setConfirmingCancelAll(false)}
                                      className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg text-[10px] font-black uppercase transition-all border border-neutral-200"
                                    >
                                      No
                                    </button>
                                  </>
                                ) : (
                                  <button 
                                    onClick={() => setConfirmingCancelAll(true)}
                                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Stop Queue / Cancel All Pending
                                  </button>
                                )}
                              </div>
                            )}
                            {queueStatusFilter !== 'all' && (
                              <button onClick={() => setQueueStatusFilter('all')} className="text-[10px] font-black text-primary hover:underline uppercase">Show All</button>
                            )}
                          </div>
                        </div>
                        <div className="bg-white border border-neutral-100 rounded-[32px] overflow-hidden">
                          <table className="w-full text-left">
                            <thead className="bg-neutral-50 text-[10px] font-black text-neutral-400 uppercase">
                              <tr>
                                <th className="px-6 py-4">Recipient</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Message</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-50">
                              {queueItems.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="px-6 py-10 text-center text-neutral-400 text-xs italic">No messages currently in queue.</td>
                                </tr>
                              ) : (
                                queueItems
                                  .filter(item => queueStatusFilter === 'all' || item.status === queueStatusFilter)
                                  .map((item) => (
                                  <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                      <div className="flex flex-col">
                                        <span className="text-xs font-black text-sidebar">
                                          {item.options?.isCommunity 
                                            ? (item.options?.communityName || 'Community Broadcast') 
                                            : (item.to && item.to.includes('@') 
                                                ? `Community (${item.to.split('@')[0]})` 
                                                : (item.to?.startsWith('+') ? item.to : `+${item.to}`))}
                                        </span>
                                        <span className="text-[9px] text-neutral-400">ID: {item.id.slice(0, 8)}</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${
                                        item.type === 'bot' ? 'bg-purple-50 text-purple-600' :
                                        item.type === 'broadcast' ? 'bg-blue-50 text-blue-600' :
                                        item.type === 'birthday' ? 'bg-pink-50 text-pink-600' :
                                        'bg-neutral-50 text-neutral-600'
                                      }`}>
                                        {item.type || 'SINGLE'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <p className="text-xs text-sidebar line-clamp-1 max-w-[200px]">{item.text}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${
                                          item.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                                          item.status === 'pending' ? 'bg-amber-500' :
                                          item.status === 'sent' ? 'bg-green-500' : 
                                          item.status === 'cancelled' ? 'bg-neutral-400' : 'bg-red-500'
                                        }`} />
                                        <span className={`text-[10px] font-black uppercase ${
                                          item.status === 'processing' ? 'text-blue-600' :
                                          item.status === 'pending' ? 'text-amber-600' :
                                          item.status === 'sent' ? 'text-green-600' : 
                                          item.status === 'cancelled' ? 'text-neutral-500' : 'text-red-600'
                                        }`}>
                                          {item.status}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-[10px] text-neutral-400 font-medium">
                                        {item.createdAt ? format(new Date(item.createdAt), 'HH:mm:ss') : 'N/A'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        {(item.status === 'pending' || item.status === 'retrying' || item.status === 'processing') ? (
                                          confirmingCancelId === item.id ? (
                                            <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 p-1 rounded-xl shadow-xs">
                                              <span className="text-[9px] font-black text-red-600 uppercase px-1">Cancel?</span>
                                              <button
                                                onClick={async () => {
                                                  setConfirmingCancelId(null);
                                                  try {
                                                    await dbService.update('whatsapp_queue', item.id, {
                                                      status: 'cancelled',
                                                      cancelledAt: new Date().toISOString(),
                                                      reason: 'Cancelled by user'
                                                    });
                                                    toast.success("Message cancelled successfully.");
                                                  } catch (err: any) {
                                                    toast.error("Failed to cancel message: " + err.message);
                                                  }
                                                }}
                                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-black uppercase transition-all"
                                              >
                                                Yes
                                              </button>
                                              <button
                                                onClick={() => setConfirmingCancelId(null)}
                                                className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200 rounded-lg text-[9px] font-black uppercase transition-all"
                                              >
                                                No
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                setConfirmingCancelId(item.id);
                                                setConfirmingDeleteId(null);
                                              }}
                                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                              title="Cancel message"
                                            >
                                              <X className="w-4 h-4" />
                                            </button>
                                          )
                                        ) : (
                                          confirmingDeleteId === item.id ? (
                                            <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 p-1 rounded-xl shadow-xs">
                                              <span className="text-[9px] font-black text-neutral-600 uppercase px-1">Delete?</span>
                                              <button
                                                onClick={async () => {
                                                  setConfirmingDeleteId(null);
                                                  try {
                                                    await dbService.delete('whatsapp_queue', item.id);
                                                    toast.success("Message deleted from queue.");
                                                  } catch (err: any) {
                                                    toast.error("Failed to delete message: " + err.message);
                                                  }
                                                }}
                                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-black uppercase transition-all"
                                              >
                                                Yes
                                              </button>
                                              <button
                                                onClick={() => setConfirmingDeleteId(null)}
                                                className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200 rounded-lg text-[9px] font-black uppercase transition-all"
                                              >
                                                No
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                setConfirmingDeleteId(item.id);
                                                setConfirmingCancelId(null);
                                              }}
                                              className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-neutral-100 rounded-lg transition-colors border border-transparent hover:border-neutral-200"
                                              title="Delete log"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                          <h4 className="text-[10px] font-black text-sidebar uppercase tracking-widest">Delivery History (Last 50)</h4>
                          <span className="text-[10px] font-bold text-neutral-400">Auto-expires after 24h</span>
                        </div>
                        <div className="bg-white border border-neutral-100 rounded-[32px] overflow-hidden">
                          <table className="w-full text-left">
                            <thead className="bg-neutral-50 text-[10px] font-black text-neutral-400 uppercase">
                              <tr>
                                <th className="px-6 py-4">Recipient</th>
                                <th className="px-6 py-4">Content</th>
                                <th className="px-6 py-4">Event</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Timestamp</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-50">
                              {messageLogs.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-6 py-10 text-center text-neutral-400 text-xs italic">No activity logged yet.</td>
                                </tr>
                              ) : (
                                messageLogs.map((log) => (
                                  <tr key={log.id} className="hover:bg-neutral-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                      <span className="text-xs font-bold text-sidebar">
                                        {log.options?.isCommunity 
                                          ? (log.options?.communityName || 'Community Broadcast') 
                                          : (log.recipient && log.recipient.includes('@') 
                                              ? `Community (${log.recipient.split('@')[0]})` 
                                              : `+${log.recipient}`)}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <p className="text-[11px] text-neutral-500 line-clamp-1 max-w-[200px]">{log.text}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-[9px] font-black text-neutral-400 uppercase">{log.type}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase w-fit ${
                                        log.status === 'sent' ? 'bg-green-50 text-green-600' :
                                        log.status === 'delivered' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                                        log.status === 'duplicate' || log.status === 'skipped' ? 'bg-amber-50 text-amber-600' :
                                        'bg-red-50 text-red-600'
                                      }`}>
                                        {log.status === 'delivered' ? '✓ READ' : log.status}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-[10px] text-neutral-400 font-medium">
                                        {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : 'N/A'}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'birthdays' && (
                <motion.div key="birthdays" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-8">
                  <div className="text-center space-y-2">
                    <div className="w-20 h-20 rounded-full bg-pink-50 flex items-center justify-center mx-auto text-pink-500">
                      <Gift className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-black text-sidebar">Daily Celebration Sync</h2>
                    <p className="text-sm text-neutral-400">Automate wishes for students and staff celebrating today.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setTargetBirthdayType('students')} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${targetBirthdayType === 'students' ? 'bg-pink-50 border-pink-200' : 'bg-white border-neutral-100'}`}>
                      <Users className={`w-6 h-6 ${targetBirthdayType === 'students' ? 'text-pink-500' : 'text-neutral-400'}`} />
                      <span className="text-xs font-black">STUDENTS ({students.filter(p => p.dateOfBirth?.slice(5) === format(new Date(), 'MM-dd')).length})</span>
                    </button>
                    <button onClick={() => setTargetBirthdayType('staff')} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${targetBirthdayType === 'staff' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-neutral-100'}`}>
                      <Users className={`w-6 h-6 ${targetBirthdayType === 'staff' ? 'text-indigo-500' : 'text-neutral-400'}`} />
                      <span className="text-xs font-black">STAFF ({staff.filter(p => p.dateOfBirth?.slice(5) === format(new Date(), 'MM-dd')).length})</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Message Template</label>
                       <button onClick={() => setShowAddTemplate(!showAddTemplate)} className="text-[10px] font-black text-primary hover:underline flex items-center gap-1">
                         <Plus className="w-3 h-3" /> New Template
                       </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button 
                        onClick={() => setSelectedTemplateId('ai')}
                        className={`p-4 rounded-2xl border-2 text-left transition-all relative ${selectedTemplateId === 'ai' ? 'bg-primary/5 border-primary shadow-sm' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <Bot className="w-4 h-4 text-primary" />
                          <span className="text-xs font-black">AI Generated Wish</span>
                        </div>
                        <p className="text-[10px] text-neutral-400 line-clamp-2">Dynamically generates a warm, personalized greeting for each celebrant.</p>
                        {selectedTemplateId === 'ai' && <CheckCircle className="w-4 h-4 text-primary absolute top-4 right-4" />}
                      </button>

                      {birthdayTemplates.filter(t => t.type === (targetBirthdayType === 'students' ? 'student' : 'staff')).map(template => (
                        <div key={template.id} className="relative group">
                          <button 
                            onClick={() => setSelectedTemplateId(template.id)}
                            className={`w-full p-4 rounded-2xl border-2 text-left transition-all relative ${selectedTemplateId === template.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}
                          >
                            <span className="text-xs font-black block mb-1">{template.name}</span>
                            <p className="text-[10px] text-neutral-400 line-clamp-2">{template.content}</p>
                            {selectedTemplateId === template.id && <CheckCircle className="w-4 h-4 text-primary absolute top-4 right-4" />}
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault();
                              e.stopPropagation(); 
                              handleDeleteTemplate(template.id); 
                            }}
                            className="absolute -top-2 -right-2 p-1.5 bg-red-50 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-100 relative z-40 group"
                          >
                            <Trash2 className="w-3 h-3 group-hover:scale-110 transition-all" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <AnimatePresence>
                      {showAddTemplate && (
                        <motion.div 
                           initial={{ opacity: 0, y: -10 }} 
                           animate={{ opacity: 1, y: 0 }} 
                           exit={{ opacity: 0, y: -10 }}
                           className="p-6 bg-white border border-neutral-100 rounded-3xl space-y-4 shadow-sm"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-neutral-400 px-1 uppercase">Template Name</label>
                              <input value={newTemplate.name} onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})} placeholder="e.g. Standard Student Wish" className="w-full p-3 bg-neutral-50 border border-neutral-100 rounded-xl text-xs outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-neutral-400 px-1 uppercase">Target Type</label>
                              <select value={newTemplate.type} onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value as any})} className="w-full p-3 bg-neutral-50 border border-neutral-100 rounded-xl text-xs outline-none">
                                <option value="student">Student</option>
                                <option value="staff">Staff</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 px-1 uppercase flex justify-between items-center">
                              Content
                              <span className="text-[8px] normal-case text-neutral-300">Use {'{name}'} as placeholder</span>
                            </label>
                            <textarea value={newTemplate.content} onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})} placeholder="Happy Birthday {name}! Have a great year ahead..." rows={3} className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-xl text-xs outline-none resize-none" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleAddTemplate} className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20">Save Template</button>
                            <button onClick={() => setShowAddTemplate(false)} className="px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl text-xs font-black">Cancel</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Birthday Attachment</label>
                    <div className="flex gap-4">
                      {mediaPreviewUrl ? (
                         <div className="relative w-full h-40 rounded-3xl overflow-hidden border border-neutral-100 bg-neutral-50 flex items-center justify-center">
                            {selectedFile?.type.startsWith('image/') ? (
                              <img src={mediaPreviewUrl} className="w-full h-full object-cover" alt="Preview" />
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <Video className="w-10 h-10 text-primary" />
                                <span className="text-xs font-bold">{selectedFile?.name}</span>
                              </div>
                            )}
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearFile();
                              }}
                              className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors relative z-10"
                            >
                              <Trash2 className="w-4 h-4 pointer-events-none" />
                            </button>
                         </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 w-full">
                          <label className="flex flex-col items-center justify-center gap-2 p-6 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-3xl cursor-pointer hover:bg-neutral-100 transition-all group">
                            <ImageIcon className="w-6 h-6 text-neutral-400 group-hover:text-primary transition-colors" />
                            <span className="text-[10px] font-black text-neutral-400 group-hover:text-primary">ADD PHOTO</span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                          </label>
                          <label className="flex flex-col items-center justify-center gap-2 p-6 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-3xl cursor-pointer hover:bg-neutral-100 transition-all group">
                            <Video className="w-6 h-6 text-neutral-400 group-hover:text-primary transition-colors" />
                            <span className="text-[10px] font-black text-neutral-400 group-hover:text-primary">ADD VIDEO</span>
                            <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-6 bg-neutral-50 rounded-3xl border border-neutral-100 text-center">
                    <p className="text-sm font-bold text-sidebar mb-1 flex items-center justify-center gap-2">
                      <AlertCircle className="w-4 h-4 text-primary" />
                      {birthdayCelebrants.length > 0 ? `${birthdayCelebrants.length} celebrants identified` : 'No celebrants today'}
                    </p>
                    <p className="text-[11px] text-neutral-400 italic">
                      {selectedTemplateId === 'ai' ? 'Gemini AI will generate a personalized, warm wish for each person.' : 'The selected template will be used for all celebrants.'}
                    </p>
                  </div>

                  <button 
                    onClick={handleSendBirthdayWishes} 
                    disabled={isGeneratingWishes || birthdayCelebrants.length === 0 || status !== 'open'}
                    className="w-full py-5 bg-black text-white rounded-[32px] font-black shadow-xl hover:bg-neutral-800 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isGeneratingWishes ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing wishes...
                      </div>
                    ) : (
                      <>
                        <Send className="w-5 h-5" /> Send Birthday Wishes Now
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {activeTab === 'bot' && (
                <motion.div key="bot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  {/* Gemini AI Bot Toggle */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-gradient-to-r from-neutral-50 to-white rounded-3xl border border-neutral-100 shadow-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                        <h4 className="text-sm font-black text-sidebar uppercase tracking-wider">Gemini AI Auto-Reply</h4>
                      </div>
                      <p className="text-xs text-neutral-400">
                        When enabled, Gemini AI automatically answers any unrecognized parent queries. When disabled, the bot uses only custom menu keywords.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => updateSettings({ aiAgentEnabled: !settings.aiAgentEnabled })}
                        className={`relative w-12 h-6 rounded-full transition-colors ${settings.aiAgentEnabled ? 'bg-green-500' : 'bg-neutral-300'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.aiAgentEnabled ? 'translate-x-6' : ''}`} />
                      </button>
                      <span className={`text-xs font-black ${settings.aiAgentEnabled ? 'text-green-600' : 'text-neutral-400'}`}>
                        {settings.aiAgentEnabled ? 'GEMINI ON' : 'GEMINI OFF'}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-2">
                    <div>
                      <h3 className="text-base font-black text-sidebar uppercase tracking-tight flex items-center gap-2">
                        <Bot className="w-5 h-5 text-primary" /> WhatsApp Bot Menus
                      </h3>
                      <p className="text-xs text-neutral-400 font-medium">Configure automatic replies and interactive button options triggered by custom parent keywords.</p>
                    </div>
                    {!showAddBotMenu && !editingBotMenu && (
                      <button 
                        onClick={() => {
                          setNewBotMenu({ keyword: '', responseText: '', buttons: [], isActive: true });
                          setEditingBotMenu(null);
                          setShowAddBotMenu(true);
                        }}
                        className="px-4 py-2 bg-primary text-white text-xs font-black rounded-xl hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-md shadow-primary/10"
                      >
                        <Plus className="w-4 h-4" /> Add Bot Menu
                      </button>
                    )}
                  </div>

                  {/* Add or Edit Menu Form */}
                  {(showAddBotMenu || editingBotMenu) && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-neutral-50 rounded-3xl border border-neutral-100 space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black text-sidebar uppercase tracking-widest">
                          {editingBotMenu ? 'Edit Bot Menu' : 'New Bot Menu'}
                        </h4>
                        <button 
                          onClick={() => {
                            setShowAddBotMenu(false);
                            setEditingBotMenu(null);
                          }}
                          className="text-[10px] font-black text-neutral-400 hover:text-sidebar"
                        >
                          CLOSE
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Trigger Keywords (Comma separated)</label>
                          <input 
                            value={editingBotMenu ? editingBotMenu.keyword : newBotMenu.keyword}
                            onChange={(e) => {
                              if (editingBotMenu) {
                                setEditingBotMenu({ ...editingBotMenu, keyword: e.target.value });
                              } else {
                                setNewBotMenu({ ...newBotMenu, keyword: e.target.value });
                              }
                            }}
                            placeholder="e.g. exit, quit, bye"
                            className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl text-xs font-bold shadow-sm outline-none"
                          />
                          <p className="text-[9px] text-neutral-400 px-1 italic">Bot will trigger this menu if parent sends any of these keywords.</p>
                        </div>

                        <div className="flex items-center gap-4 pt-4">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input 
                              type="checkbox"
                              checked={editingBotMenu ? editingBotMenu.isActive : newBotMenu.isActive}
                              onChange={(e) => {
                                if (editingBotMenu) {
                                  setEditingBotMenu({ ...editingBotMenu, isActive: e.target.checked });
                                } else {
                                  setNewBotMenu({ ...newBotMenu, isActive: e.target.checked });
                                }
                              }}
                              className="rounded border-neutral-300 text-primary focus:ring-primary w-4 h-4"
                            />
                            <span className="text-xs font-bold text-sidebar">Menu Active</span>
                          </label>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Automatic Response Text</label>
                          <span className="text-[9px] text-neutral-400 italic">Supports: {"{{Father name}}"}, {"{{student name}}"}, {"{{class name}}"}</span>
                        </div>
                        <textarea 
                          value={editingBotMenu ? editingBotMenu.responseText : newBotMenu.responseText}
                          onChange={(e) => {
                            if (editingBotMenu) {
                              setEditingBotMenu({ ...editingBotMenu, responseText: e.target.value });
                            } else {
                              setNewBotMenu({ ...newBotMenu, responseText: e.target.value });
                            }
                          }}
                          placeholder="Dear Parents, Thank you for reaching out..."
                          rows={4}
                          className="w-full p-4 bg-white border border-neutral-100 rounded-2xl text-xs outline-none resize-none shadow-sm"
                        />
                      </div>

                      {/* Interactive Buttons Config (Max 3 buttons) */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Interactive Buttons (Optional, Max 3)</label>
                          <button 
                            type="button"
                            onClick={() => {
                              const target = editingBotMenu || newBotMenu;
                              if (target.buttons.length >= 3) {
                                toast.error('Max 3 buttons allowed');
                                return;
                              }
                              const updatedButtons = [...target.buttons, { id: Math.random().toString(36).substring(2, 9), text: '' }];
                              if (editingBotMenu) {
                                setEditingBotMenu({ ...editingBotMenu, buttons: updatedButtons });
                              } else {
                                setNewBotMenu({ ...newBotMenu, buttons: updatedButtons });
                              }
                            }}
                            className="text-[10px] font-black text-primary hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Button
                          </button>
                        </div>

                        <div className="space-y-2">
                          {(editingBotMenu ? editingBotMenu.buttons : newBotMenu.buttons).map((btn: any, index: number) => (
                            <div key={btn.id || index} className="flex gap-2 items-center">
                              <input 
                                value={btn.text}
                                onChange={(e) => {
                                  const target = editingBotMenu || newBotMenu;
                                  const updatedButtons = target.buttons.map((b: any, i: number) => 
                                    i === index ? { ...b, text: e.target.value } : b
                                  );
                                  if (editingBotMenu) {
                                    setEditingBotMenu({ ...editingBotMenu, buttons: updatedButtons });
                                  } else {
                                    setNewBotMenu({ ...newBotMenu, buttons: updatedButtons });
                                  }
                                }}
                                placeholder={`Button ${index + 1} text`}
                                className="flex-1 px-4 py-2.5 bg-white border border-neutral-100 rounded-xl text-xs font-bold shadow-sm outline-none"
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const target = editingBotMenu || newBotMenu;
                                  const updatedButtons = target.buttons.filter((_: any, i: number) => i !== index);
                                  if (editingBotMenu) {
                                    setEditingBotMenu({ ...editingBotMenu, buttons: updatedButtons });
                                  } else {
                                    setNewBotMenu({ ...newBotMenu, buttons: updatedButtons });
                                  }
                                }}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {editingBotMenu ? (
                          <button 
                            onClick={() => handleUpdateBotMenu(editingBotMenu.id, editingBotMenu)}
                            className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-black shadow-lg shadow-primary/10"
                          >
                            Update Menu
                          </button>
                        ) : (
                          <button 
                            onClick={handleAddBotMenu}
                            className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-black shadow-lg shadow-primary/10"
                          >
                            Save Menu
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setShowAddBotMenu(false);
                            setEditingBotMenu(null);
                          }}
                          className="px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl text-xs font-black hover:bg-neutral-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* List of Existing Menus */}
                  {!showAddBotMenu && !editingBotMenu && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {botMenus.length === 0 ? (
                        <div className="col-span-2 text-center py-12 bg-neutral-50 rounded-[2rem] border border-neutral-100">
                          <Bot className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                          <p className="text-xs font-black text-sidebar uppercase tracking-widest">No custom menus found</p>
                          <p className="text-[10px] text-neutral-400 mt-1 max-w-xs mx-auto">Create keyword triggers like 'exit', 'bye', or 'help' to reply with customized messages automatically.</p>
                        </div>
                      ) : (
                        botMenus.map((menu: any) => (
                          <div key={menu.id} className="p-5 bg-neutral-50 rounded-3xl border border-neutral-100 flex flex-col justify-between hover:shadow-md transition-all">
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-sidebar uppercase tracking-tight bg-primary/10 text-primary px-2.5 py-1 rounded-lg">
                                      {menu.keyword}
                                    </span>
                                    {!menu.isActive && (
                                      <span className="text-[9px] font-black text-neutral-400 bg-neutral-200 px-2 py-0.5 rounded">
                                        INACTIVE
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button 
                                    onClick={() => {
                                      setEditingBotMenu(menu);
                                      setShowAddBotMenu(false);
                                    }}
                                    className="p-1.5 text-neutral-400 hover:text-sidebar hover:bg-white rounded-lg transition-all"
                                    title="Edit Bot Menu"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteBotMenu(menu.id)}
                                    className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-neutral-600 line-clamp-3 mb-4 leading-relaxed font-medium">
                                {menu.responseText}
                              </p>
                            </div>

                            {menu.buttons && menu.buttons.length > 0 && (
                              <div className="border-t border-neutral-200/50 pt-3 flex flex-wrap gap-1.5">
                                {menu.buttons.map((btn: any, idx: number) => (
                                  <span key={btn.id || idx} className="text-[9px] font-black text-neutral-500 bg-white border border-neutral-200 px-2.5 py-1 rounded-lg">
                                    🔘 {btn.text}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </motion.div>
              )}


      </AnimatePresence>

      {/* WhatsApp Communities Settings Modal */}
      <AnimatePresence>
        {showCommunitySettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] border border-neutral-100 shadow-2xl w-[98vw] max-w-[98vw] h-[96vh] max-h-[96vh] overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
                <div>
                  <h3 className="text-lg font-black text-sidebar uppercase tracking-tight flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    WhatsApp Communities (కమ్యూనిటీల కాన్ఫిగరేషన్)
                  </h3>
                  <p className="text-[10px] font-medium text-neutral-400 mt-1 uppercase tracking-wider">
                    Manage JIDs and map them to academic classes for broadcasting announcements
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCommunitySettings(false);
                    setEditingCommunity(null);
                    setNewCommunity({ communityJid: '', associatedClasses: [], isActive: true });
                  }}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl text-xs font-black transition-all"
                >
                  CLOSE
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left: Communities List */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest px-1">
                    Configured Communities ({communities.length})
                  </h4>
                  
                  <div className="space-y-3 max-h-[68vh] overflow-y-auto pr-2">
                    {communities.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-neutral-200 bg-neutral-50/50 rounded-2xl">
                        <Globe className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-neutral-400">No communities configured yet.</p>
                        <p className="text-[9px] text-neutral-400 mt-1">Configure your first WhatsApp community on the right.</p>
                      </div>
                    ) : (
                      communities.map((comm) => (
                        <div
                          key={comm.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            editingCommunity?.id === comm.id
                              ? 'bg-primary/5 border-primary shadow-sm'
                              : 'bg-neutral-50/50 border-neutral-100 hover:border-neutral-200'
                          } ${comm.isActive === false ? 'opacity-70 bg-neutral-100/50' : ''}`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-1 overflow-hidden flex-1">
                              <p className="text-xs font-black text-sidebar break-all truncate" title={comm.communityJid}>
                                {comm.communityJid}
                              </p>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                    comm.isActive !== false
                                      ? 'bg-green-100 text-green-700 font-black'
                                      : 'bg-neutral-200 text-neutral-500'
                                  }`}
                                >
                                  {comm.isActive !== false ? 'Active' : 'Inactive'}
                                </span>
                                <span className="text-[8px] font-bold text-neutral-400">
                                  {comm.associatedClasses?.length || 0} Classes Mapped
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-1.5 shrink-0 items-center">
                              {/* Direct Active/Inactive toggle button */}
                              <button
                                type="button"
                                onClick={() => handleToggleCommunityActive(comm)}
                                className={`p-1 rounded-lg border border-transparent hover:border-neutral-200 transition-all ${
                                  comm.isActive !== false ? 'text-green-600 hover:bg-green-50' : 'text-neutral-400 hover:bg-neutral-100'
                                }`}
                                title={comm.isActive !== false ? "Deactivate Community" : "Activate Community"}
                              >
                                {comm.isActive !== false ? (
                                  <ToggleRight className="w-5 h-5" />
                                ) : (
                                  <ToggleLeft className="w-5 h-5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommunity(comm);
                                  setNewCommunity({
                                    communityJid: comm.communityJid || '',
                                    associatedClasses: comm.associatedClasses || [],
                                    isActive: comm.isActive !== false
                                  });
                                }}
                                className="p-1 text-neutral-400 hover:text-sidebar hover:bg-white border border-transparent hover:border-neutral-100 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCommunity(comm.id)}
                                className="p-1 text-neutral-400 hover:text-red-500 hover:bg-white border border-transparent hover:border-neutral-100 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Class Badges with instant deactivation/removal */}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {comm.associatedClasses?.map((classId: string) => {
                              const cls = classes.find((c) => c.id === classId);
                              return (
                                <span
                                  key={classId}
                                  className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/60 pl-2 pr-1 py-0.5 rounded-md uppercase"
                                >
                                  <span>{cls?.name || cls?.code || classId}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeactivateClassFromCommunity(comm, classId);
                                    }}
                                    className="ml-0.5 text-emerald-500/60 hover:text-red-500 rounded-full hover:bg-emerald-100 p-0.5 transition-all"
                                    title={`Deactivate / Unmap ${cls?.name || classId} class`}
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* WhatsApp Group & Community JID Finder Helper */}
                  <div className="pt-5 border-t border-neutral-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-black text-sidebar uppercase tracking-tight flex items-center gap-1">
                          🔍 JID Finder (గ్రూప్స్/కామ్యునిటీ JID ఫైండర్)
                        </h4>
                        <p className="text-[9px] text-neutral-400 font-medium uppercase mt-0.5">
                          Automatically loaded from your linked WhatsApp
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFetchWhatsappGroups(false)}
                        disabled={isFetchingGroups}
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 uppercase disabled:opacity-50"
                      >
                        {isFetchingGroups ? 'Syncing...' : 'Refresh JIDs'}
                      </button>
                    </div>

                    {fetchGroupsError && (
                      <div className="p-3.5 bg-red-50 border border-red-100 rounded-2xl text-[10px] font-bold text-red-600 leading-relaxed">
                        ⚠️ {fetchGroupsError}
                        <p className="mt-1 text-[9px] text-red-500 font-medium normal-case">
                          దయచేసి టాప్-రైట్ విభాగంలో మీ WhatsApp కనెక్ట్ అయిందో లేదో సరిచూసుకోండి (Please ensure WhatsApp is connected on your dashboard).
                        </p>
                      </div>
                    )}

                    {whatsappGroups.length > 0 ? (
                      <div className="space-y-2.5">
                        <input
                          type="text"
                          value={groupSearchQuery}
                          onChange={(e) => setGroupSearchQuery(e.target.value)}
                          placeholder="Search groups/communities by name..."
                          className="w-full px-4 py-2.5 bg-white border border-neutral-200 focus:border-primary rounded-xl text-xs font-bold outline-none shadow-sm transition-all placeholder:text-neutral-400"
                        />
                        <div className="max-h-[35vh] overflow-y-auto space-y-1.5 pr-1 border border-neutral-100 rounded-2xl p-2 bg-neutral-50/50">
                          {processedGroups.map((group) => (
                              <div key={group.id} className="p-3 bg-white border border-neutral-100 hover:border-neutral-200 rounded-xl flex justify-between items-center gap-3 transition-all shadow-xs">
                                <div className="space-y-1 overflow-hidden">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-black text-sidebar truncate">{group.subject}</p>
                                    {group.isCommunity && (
                                      <span className="text-[8px] font-black px-1 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded uppercase">
                                        Community
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] font-mono font-bold text-neutral-400 select-all truncate bg-neutral-50 px-1 py-0.5 rounded border border-neutral-100/50">{group.id}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewCommunity(prev => ({ ...prev, communityJid: group.id }));
                                      toast.success(`Loaded JID for "${group.subject}" into the form!`);
                                    }}
                                    className="px-2.5 py-1 bg-primary text-white hover:bg-primary-dark rounded-lg text-[9px] font-black uppercase transition-all shadow-xs"
                                  >
                                    Use JID
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(group.id);
                                      toast.success("JID Copied to clipboard!");
                                    }}
                                    className="p-1.5 text-neutral-400 hover:text-neutral-600 border border-neutral-100 rounded-lg hover:bg-neutral-50 transition-colors"
                                    title="Copy JID to Clipboard"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {isFetchingGroups ? (
                          <div className="text-center py-8 border border-neutral-100 bg-neutral-50/50 rounded-2xl flex flex-col items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-sidebar uppercase tracking-tight">Fetching JIDs from WhatsApp...</p>
                            <p className="text-[8px] text-neutral-400 font-bold uppercase">ఈ ప్రక్రియకు కొన్ని క్షణాలు పట్టవచ్చు (Please wait a moment)</p>
                          </div>
                        ) : (
                          <div className="text-center py-8 border border-dashed border-neutral-200 bg-neutral-50/50 rounded-2xl flex flex-col items-center justify-center gap-1.5 p-4">
                            <span className="text-lg">📢</span>
                            {status === 'open' ? (
                              <>
                                <p className="text-[10px] font-black text-sidebar uppercase">No active groups or communities found</p>
                                <p className="text-[8px] text-neutral-400 font-bold uppercase leading-normal">
                                  మీ WhatsApp లో ఎటువంటి యాక్టివ్ గ్రూప్స్ లభించలేదు. కొత్త గ్రూప్స్ లేదా మెసేజెస్ వస్తే ఇక్కడ కనిపిస్తాయి.
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-[10px] font-black text-amber-700 uppercase">WhatsApp is Offline / Not Connected</p>
                                <p className="text-[8px] text-amber-600 font-bold uppercase leading-normal">
                                  JID ఫైండర్ స్వయంచాలకంగా పని చేయడానికి ముందుగా మీ WhatsApp ను ఎడమ ప్యానెల్ ద్వారా కనెక్ట్ చేయండి.
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Add/Edit Form */}
                <form onSubmit={handleSaveCommunity} className="space-y-4">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest px-1">
                    {editingCommunity ? '✏️ Edit Community Settings' : '➕ Add New Community'}
                  </h4>

                  <div className="p-5 bg-neutral-50/50 rounded-2xl border border-neutral-100 space-y-4">
                    {/* JID input */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-1">
                        Community JID / Group JID
                      </label>
                      <input
                        type="text"
                        required
                        value={newCommunity.communityJid}
                        onChange={(e) => setNewCommunity({ ...newCommunity, communityJid: e.target.value })}
                        placeholder="e.g. 120363123456789012@g.us"
                        className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl text-xs font-bold shadow-sm outline-none transition-all"
                      />
                      <p className="text-[9px] text-neutral-400 px-1 leading-relaxed">
                        కామ్యునిటీ లేదా అనౌన్స్మెంట్ గ్రూప్ యొక్క WhatsApp JID నమోదు చేయండి.
                      </p>
                    </div>

                    {/* Associated classes checklist */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-1 flex justify-between">
                        <span>Map to Classes (తరగతులు ఎంచుకోండి)</span>
                        <span className="text-[8px] font-bold text-neutral-400 uppercase">
                          {newCommunity.associatedClasses.length} Selected
                        </span>
                      </label>
                      <div className="bg-white border border-neutral-100 rounded-xl p-3 max-h-[35vh] overflow-y-auto space-y-2 shadow-inner">
                        {classes.length === 0 ? (
                          <p className="text-[10px] text-neutral-400 italic text-center py-4">No classes available</p>
                        ) : (
                          classes.map((cls) => {
                            const isChecked = newCommunity.associatedClasses.includes(cls.id);
                            
                            // Check if this class is mapped to another community configuration
                            const otherMappedComm = communities.find((comm) => 
                              comm.id !== editingCommunity?.id && 
                              comm.associatedClasses?.includes(cls.id)
                            );
                            const isAlreadyMapped = !!otherMappedComm;

                            return (
                              <label 
                                key={cls.id} 
                                className={`flex items-center gap-2 select-none py-1 px-1.5 rounded transition-all ${
                                  isAlreadyMapped 
                                    ? 'opacity-60 bg-neutral-100/40 cursor-not-allowed text-neutral-400' 
                                    : 'cursor-pointer hover:bg-neutral-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked || isAlreadyMapped}
                                  disabled={isAlreadyMapped}
                                  onChange={() => {
                                    if (isAlreadyMapped) return;
                                    const updated = isChecked
                                      ? newCommunity.associatedClasses.filter((id) => id !== cls.id)
                                      : [...newCommunity.associatedClasses, cls.id];
                                    setNewCommunity({ ...newCommunity, associatedClasses: updated });
                                  }}
                                  className={`rounded border-neutral-300 focus:ring-primary w-3.5 h-3.5 ${
                                    isAlreadyMapped ? 'text-neutral-400 cursor-not-allowed' : 'text-primary cursor-pointer'
                                  }`}
                                />
                                <div className="flex justify-between items-center w-full">
                                  <span className={`text-xs font-bold uppercase ${isAlreadyMapped ? 'text-neutral-400 line-through font-normal' : 'text-sidebar'}`}>{cls.name}</span>
                                  {isAlreadyMapped && (
                                    <span className="text-[8px] font-black px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-100/60 rounded tracking-tight uppercase">
                                      Already Mapped
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* IsActive switch */}
                    <div className="flex items-center gap-2 pt-2 select-none">
                      <input
                        type="checkbox"
                        id="isActiveCommunity"
                        checked={newCommunity.isActive}
                        onChange={(e) => setNewCommunity({ ...newCommunity, isActive: e.target.checked })}
                        className="rounded border-neutral-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      />
                      <label htmlFor="isActiveCommunity" className="text-xs font-bold text-sidebar cursor-pointer">
                        Active for Broadcast (బ్రాడ్‌కాస్ట్ కోసం సక్రియం చేయి)
                      </label>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-black shadow-sm hover:scale-[1.01] transition-all"
                    >
                      {editingCommunity ? 'UPDATE CONFIG' : 'SAVE COMMUNITY'}
                    </button>
                    
                    {(editingCommunity || newCommunity.communityJid || newCommunity.associatedClasses.length > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommunity(null);
                          setNewCommunity({ communityJid: '', associatedClasses: [], isActive: true });
                        }}
                        className="px-4 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl text-xs font-bold transition-all"
                      >
                        RESET
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Excel Marks Template Customizer Modal */}
        {showTemplateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 sm:p-8 max-w-xl w-full shadow-2xl border border-neutral-100 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-neutral-900">Custom Marks Excel Template</h3>
                    <p className="text-xs text-neutral-500">Generate a tailored Excel template for any class or subject combination</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Exam Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-700">Exam / Test Name</label>
                  <input
                    type="text"
                    value={templateModalExam}
                    onChange={(e) => setTemplateModalExam(e.target.value)}
                    placeholder="e.g. Unit Test 1, FA-1, SA-1, Quarterly Exam"
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-blue-500 rounded-xl text-xs font-medium outline-none transition-all"
                  />
                </div>

                {/* Class Selection for Student Roster */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-700">Auto-fill Student Roster (Optional)</label>
                    <span className="text-[10px] text-blue-600 font-semibold">Pre-fills student IDs & parent phones</span>
                  </div>
                  <select
                    value={templateModalClass}
                    onChange={(e) => setTemplateModalClass(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-blue-500 rounded-xl text-xs font-medium outline-none transition-all"
                  >
                    <option value="">-- Generic Template (Sample Student Data) --</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} (Fill real class students)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Max Marks Per Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-700">Max Marks Per Subject</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 80, 100].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setTemplateModalMaxMarks(m)}
                        className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                          templateModalMaxMarks === m
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {m} Marks
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preset Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-700">Curriculum Presets</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'highSchool', label: 'High School (7 Subj)' },
                      { id: 'standard6', label: 'Standard (6 Subj)' },
                      { id: 'primary', label: 'Primary (4 Subj)' },
                      { id: 'prePrimary', label: 'Pre-Primary (3 Subj)' },
                      { id: 'intermediateMPC', label: 'Inter MPC' },
                      { id: 'intermediateBiPC', label: 'Inter BiPC' }
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setTemplatePresetType(p.id as any);
                          const subjects = PRESET_SUBJECT_SETS[p.id as keyof typeof PRESET_SUBJECT_SETS] || [];
                          setTemplateSubjectsList([...subjects]);
                        }}
                        className={`p-2.5 rounded-xl text-xs font-bold transition-all border text-left ${
                          templatePresetType === p.id
                            ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Subject Management */}
                <div className="space-y-2 pt-2 border-t border-neutral-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-700">
                      Configured Subjects ({templateSubjectsList.length})
                    </label>
                    <span className="text-[10px] text-neutral-400">Click ✕ to remove</span>
                  </div>

                  {/* Active Subject Badges */}
                  <div className="flex flex-wrap gap-2 p-3 bg-neutral-50 border border-neutral-200/80 rounded-2xl min-h-[60px]">
                    {templateSubjectsList.length === 0 ? (
                      <span className="text-xs text-neutral-400 italic">No subjects added. Click quick-add below.</span>
                    ) : (
                      templateSubjectsList.map((subj, idx) => (
                        <span
                          key={subj}
                          className="px-3 py-1.5 bg-white border border-blue-200 text-blue-900 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
                        >
                          <span className="text-[10px] text-blue-400 font-medium">{idx + 1}.</span>
                          {subj}
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateSubjectsList(prev => prev.filter(s => s !== subj));
                            }}
                            className="text-neutral-400 hover:text-rose-600 ml-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Quick Add Extra Subjects */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase text-neutral-400">Quick Add Common Subjects:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Telugu', 'Hindi', 'English', 'Mathematics', 'Physical Science', 
                        'Biological Science', 'Social Studies', 'Physics', 'Chemistry', 
                        'Biology', 'Computer Science', 'General Knowledge', 'Moral Science', 
                        'Sanskrit', 'CDF / IIT', 'Drawing'
                      ].map((s) => {
                        const isAdded = templateSubjectsList.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={isAdded}
                            onClick={() => {
                              setTemplateSubjectsList(prev => [...prev, s].sort(compareSubjectsStandard));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              isAdded
                                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                            }`}
                          >
                            + {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Custom Subject Field */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newSubjectInput}
                      onChange={(e) => setNewSubjectInput(e.target.value)}
                      placeholder="Type custom subject name (e.g. French, Sanskrit)..."
                      className="flex-1 px-4 py-2 bg-neutral-50 border border-neutral-200 focus:border-blue-500 rounded-xl text-xs outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = newSubjectInput.trim();
                          if (val && !templateSubjectsList.includes(val)) {
                            setTemplateSubjectsList(prev => [...prev, val].sort(compareSubjectsStandard));
                            setNewSubjectInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newSubjectInput.trim();
                        if (val && !templateSubjectsList.includes(val)) {
                          setTemplateSubjectsList(prev => [...prev, val].sort(compareSubjectsStandard));
                          setNewSubjectInput('');
                        }
                      }}
                      className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-2xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCustomTemplate}
                  disabled={templateSubjectsList.length === 0}
                  className="flex-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Customized Excel (.xlsx)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
</div>
    </div>
  );
};

export default Communication;
