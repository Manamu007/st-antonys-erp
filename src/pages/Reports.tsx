import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Filter,
  Download,
  Calendar,
  Send,
  BarChart as BarChartIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  orderBy, 
  limit, 
  where, 
  QueryConstraint, 
  onSnapshot, 
  collection, 
  query,
  doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'motion/react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

const Reports: React.FC = () => {
  const { hasPermission, profile } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [receiptBooks, setReceiptBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncingStats, setIsSyncingStats] = useState(false);
  
  // Advanced filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterType, dateFilter, startDate, endDate]);

  const [stats, setStats] = useState({
    delivered: 0,
    processing: 0,
    failed: 0,
    sent: 0,
    total: 0,
    types: {} as Record<string, number>
  });

  const handleSyncMetrics = async () => {
    setIsSyncingStats(true);
    try {
      const res = await whatsappService.reconcileStats();
      if (res?.stats) {
        setStats(res.stats);
        toast.success("WhatsApp metrics reconciled and synced with communication history.");
      } else {
        const currentStats = await whatsappService.getStats();
        if (currentStats) setStats(currentStats);
        toast.success("WhatsApp stats refreshed.");
      }
    } catch (err: any) {
      toast.error("Failed to sync metrics: " + err.message);
    } finally {
      setIsSyncingStats(false);
    }
  };

  useEffect(() => {
    // Fetch users, classes, batches and students for full student resolution
    dbService.list('users', [limit(1000)]).then(setUsers);
    dbService.list('classes', [limit(200)]).then(setClasses);
    dbService.list('batches', [limit(200)]).then(setBatches);
    dbService.list('students', [limit(4000)]).then(setStudents);
    dbService.list('payments', [limit(2000)]).then(setPayments);
    dbService.list('receipt_books', [limit(200)]).then(setReceiptBooks);

    // Initial fetch from API
    whatsappService.getStats().then(s => {
      if (s && s.total !== undefined) setStats(s);
    }).catch(() => {});

    // Real-time stats subscription
    const unsubscribeStats = onSnapshot(
      doc(db, 'whatsapp_stats', 'summary'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const deliveredVal = Math.max(0, Number(data.delivered) || 0);
          const processingVal = Math.max(0, Number(data.processing) || 0);
          const failedVal = Math.max(0, Number(data.failed) || 0);
          const sentVal = Math.max(0, Number(data.sent) || 0);
          setStats({
            delivered: deliveredVal,
            processing: processingVal,
            failed: failedVal,
            sent: sentVal,
            total: deliveredVal + processingVal + failedVal + sentVal,
            types: data.types || {}
          });
        }
      }
    );

    let unsubscribeLogs: () => void;

    if (filterStatus === 'processing') {
      const q = query(
        collection(db, 'whatsapp_queue'),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
      
      unsubscribeLogs = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            recipient: data.to,
            timestamp: data.createdAt,
            status: data.status
          };
        });
        
        // Filter for exactly pending/processing
        const filtered = items.filter(d => d.status === 'processing' || d.status === 'pending');
        setLogs(filtered);
        setLoading(false);
      }, (error) => {
        console.error("Queue Subscription Error:", error);
      });
    } else {
      const q = query(
        collection(db, 'whatsappLogs'),
        orderBy('timestamp', 'desc'),
        limit(1000)
      );
      
      unsubscribeLogs = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLogs(items);
        setLoading(false);
      }, (error) => {
        console.error("Logs Subscription Error:", error);
      });
    }

    return () => {
      unsubscribeStats();
      unsubscribeLogs();
    };
  }, [filterStatus]);

  const resolveRecipient = (number: string, log?: any) => {
    if (log?.options?.isCommunity) {
      return {
        displayName: log.options.communityName || 'Community Broadcast',
        displayNumber: number.includes('@') ? number.split('@')[0] : number
      };
    }

    if (String(number || '').includes('@g.us') || String(number || '').includes('@newsletter')) {
      return {
        displayName: 'Community Broadcast Group',
        displayNumber: String(number).split('@')[0]
      };
    }

    const cleanNum = String(number).replace(/\D/g, '');
    if (!cleanNum) {
      if (number.length > 13) return { displayName: `${number} (Technical ID)`, displayNumber: '' };
      return { displayName: number ? `+${number.replace(/\+/g, '')}` : '---', displayNumber: '' };
    }
    const last10 = cleanNum.slice(-10);

    // 1. Try to find in students (ERP Database)
    const student = students.find(s => {
      const checkFields = [
        s.phone,
        s.parentPhone,
        s.parent_phone,
        s.fatherPhone,
        s.motherPhone,
        s.whatsappNumber,
        s.contact,
        s.mobile
      ];
      return checkFields.some(field => {
        if (!field) return false;
        const cleanField = String(field).replace(/\D/g, '');
        return cleanField.length >= 10 && cleanField.endsWith(last10);
      });
    });

    if (student) {
      const studentName = student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';
      const studentClass = classes.find(c => c.id === student.classId)?.name || student.class || student.classId || '';
      const studentBatch = batches.find(b => b.id === student.batchId)?.name || student.batch || student.batchId || '';
      const classBatchStr = [studentClass, studentBatch].filter(Boolean).join(' - ');
      
      const displayName = classBatchStr ? `${studentName} (${classBatchStr})` : studentName;
      return {
        displayName,
        displayNumber: number
      };
    }

    // 2. Try to find in users (Staff)
    const user = users.find(u => {
      const contact = (u.contact || '').replace(/\D/g, '');
      const wa = (u.whatsappNumber || '').replace(/\D/g, '');
      const parent = (u.parentPhone || '').replace(/\D/g, '');
      return contact === cleanNum || wa === cleanNum || parent === cleanNum || 
             (cleanNum.length >= 10 && (contact.endsWith(cleanNum.slice(-10)) || wa.endsWith(cleanNum.slice(-10)) || parent.endsWith(cleanNum.slice(-10))));
    });
    
    if (user) {
      return {
        displayName: `${user.name} (Staff)`,
        displayNumber: number
      };
    }

    if (number.length > 13) return { displayName: `${number} (Technical ID)`, displayNumber: '' };
    return {
      displayName: `+${cleanNum}`,
      displayNumber: ''
    };
  };

  const resolveStudentDetails = (log: any) => {
    const rawTo = log.recipient || log.to || '';
    const cleanNum = String(rawTo).replace(/\D/g, '');
    if (!cleanNum) return { names: '---', classesAndBatches: '---', classesList: [], batchesList: [] };

    const last10 = cleanNum.slice(-10);

    // 1. Try explicit options studentId matches first
    const explicitStudentId = log.studentId || log.options?.studentId;
    let matched: any[] = [];
    if (explicitStudentId) {
      const explicitStud = students.find(s => s.id === explicitStudentId || s.uid === explicitStudentId);
      if (explicitStud) {
        matched = [explicitStud];
      }
    }

    // 2. Fall back to phone matching if not resolved (checking all potential phone/contact fields)
    if (matched.length === 0 && last10.length >= 10) {
      matched = students.filter(s => {
        const checkFields = [
          s.phone,
          s.parentPhone,
          s.parent_phone,
          s.fatherPhone,
          s.motherPhone,
          s.whatsappNumber,
          s.contact,
          s.mobile
        ];
        return checkFields.some(field => {
          if (!field) return false;
          const cleanField = String(field).replace(/\D/g, '');
          return cleanField.length >= 10 && cleanField.endsWith(last10);
        });
      });
    }

    if (matched.length === 0) {
      const formattedNum = `+${cleanNum}`;
      return { 
        names: formattedNum, 
        classesAndBatches: '---', 
        classesList: [], 
        batchesList: [] 
      };
    }

    const names = matched.map(s => {
      if (s.name) return s.name;
      const firstName = s.firstName || s.studentName || '';
      const lastName = s.lastName || s.secondName || '';
      const fullName = `${firstName} ${lastName}`.trim();
      return fullName || '---';
    }).filter(Boolean).join(', ') || '---';

    const classesList = matched.map(s => classes.find(c => c.id === s.classId)?.name || s.class || s.classId || 'N/A');
    const batchesList = matched.map(s => batches.find(b => b.id === s.batchId)?.name || s.batch || s.batchId || 'N/A');

    return {
      names,
      classesAndBatches: matched.map((s, idx) => `${classesList[idx]} (${batchesList[idx]})`).join(', '),
      classesList,
      batchesList
    };
  };

  const resolveReceiptBookName = (log: any) => {
    const opt = log.options || {};
    const receiptId = opt.receiptId || opt.receiptNumber || log.receiptNumber || log.receiptId;
    const paymentId = opt.paymentId || log.paymentId;
    const studentId = opt.studentId || log.studentId;

    let foundPayment = payments.find(p => {
      if (paymentId && p.id === paymentId) return true;
      if (receiptId && (p.serialNumber === receiptId || p.receiptNumber === receiptId)) return true;
      return false;
    });

    if (!foundPayment && studentId) {
      const studentPayments = payments.filter(p => p.studentId === studentId);
      if (studentPayments.length === 1) {
        foundPayment = studentPayments[0];
      } else if (studentPayments.length > 1) {
        const matchedPayment = studentPayments.find(p => {
          if (p.reference && log.text && log.text.includes(p.reference)) return true;
          if (p.serialNumber && log.text && log.text.includes(p.serialNumber)) return true;
          return false;
        });
        if (matchedPayment) {
          foundPayment = matchedPayment;
        }
      }
    }

    if (!foundPayment) {
      const matchedByText = payments.find(p => {
        if (p.reference && log.text && log.text.includes(p.reference)) return true;
        if (p.serialNumber && log.text && log.text.includes(p.serialNumber)) return true;
        return false;
      });
      if (matchedByText) {
        foundPayment = matchedByText;
      }
    }

    if (foundPayment) {
      if (foundPayment.receiptBookName) {
        return foundPayment.receiptBookName;
      }
      if (foundPayment.receiptBookId) {
        const book = receiptBooks.find(b => b.id === foundPayment.receiptBookId);
        if (book) return book.name;
      }
    }

    const isFeeRelated = (log.type || '').toLowerCase() === 'fees_receipt' || 
                         (log.options?.templateType === 'fee_receipt') ||
                         (log.text && (log.text.includes('Payment Received') || log.text.includes('Receipt') || log.text.includes('fee payment')));
    
    if (isFeeRelated) {
      const activeBook = receiptBooks.find(b => b.active);
      return activeBook ? activeBook.name : "Main Institutional Book";
    }

    return '—';
  };

  const effectiveStats = useMemo(() => {
    let d = 0, s = 0, f = 0, p = 0;
    const typeMap: Record<string, number> = {};
    logs.forEach(log => {
      const st = (log.status || '').toLowerCase();
      const isDel = st === 'delivered' || st === 'read' || !!log.deliveredAt || !!log.readAt;
      if (isDel) d++;
      else if (st === 'sent') s++;
      else if (st === 'failed') f++;
      else if (st === 'processing' || st === 'pending') p++;

      const tp = (log.type || 'single').toLowerCase();
      typeMap[tp] = (typeMap[tp] || 0) + 1;
    });

    const deliveredCount = Math.max(stats.delivered, d);
    const sentCount = Math.max(stats.sent, s);
    const failedCount = Math.max(stats.failed, f);
    const processingCount = Math.max(stats.processing, p);
    const totalCount = Math.max(stats.total, deliveredCount + sentCount + failedCount + processingCount);

    return {
      delivered: deliveredCount,
      sent: sentCount,
      failed: failedCount,
      processing: processingCount,
      total: totalCount,
      types: Object.keys(stats.types).length > 0 ? stats.types : typeMap
    };
  }, [stats, logs]);

  const filteredLogs = logs.filter((log) => {
    // 1. Status Filter (only if filterStatus is NOT 'all' and NOT 'processing')
    if (filterStatus !== 'all' && filterStatus !== 'processing') {
      const st = (log.status || '').toLowerCase();
      const isDelivered = st === 'delivered' || st === 'read' || !!log.deliveredAt || !!log.readAt;
      if (filterStatus === 'delivered') {
        if (!isDelivered) return false;
      } else if (filterStatus === 'sent') {
        // 'sent' filter should show both 'sent' and 'delivered' messages, since all delivered messages were sent successfully!
        if (st !== 'sent' && !isDelivered) return false;
      } else if (filterStatus === 'failed') {
        if (st !== 'failed') return false;
      } else {
        if (st !== filterStatus.toLowerCase()) return false;
      }
    }

    // 2. Type Filter
    if (filterType !== 'all') {
      if ((log.type || '').toLowerCase() !== filterType.toLowerCase()) return false;
    }

    // 3. Date Filter
    const logTime = log.timestamp || log.createdAt;
    if (dateFilter !== 'all') {
      if (!logTime) return false;
      
      const d = new Date(logTime);
      const logDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      if (dateFilter === 'today') {
        if (logDateStr !== todayStr) return false;
      } else if (dateFilter === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        if (logDateStr !== yesterdayStr) return false;
      } else if (dateFilter === 'last7days') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const logMs = new Date(logTime).getTime();
        const cutoffMs = cutoff.getTime();
        if (logMs < cutoffMs) return false;
      } else if (dateFilter === 'custom') {
        if (startDate) {
          const startMs = new Date(startDate + 'T00:00:00').getTime();
          const logMs = new Date(logTime).getTime();
          if (logMs < startMs) return false;
        }
        if (endDate) {
          const endMs = new Date(endDate + 'T23:59:59').getTime();
          const logMs = new Date(logTime).getTime();
          if (logMs > endMs) return false;
        }
      }
    }

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const encounteredTypes = Array.from(new Set(logs.map(l => (l.type || '').toLowerCase()).filter(Boolean))) as string[];

  const formatTypeLabel = (type: string) => {
    switch (type.toLowerCase()) {
      case 'bot': return 'Bot Auto-Alert';
      case 'single': return 'Single / Manual';
      case 'broadcast': return 'Broadcast';
      case 'birthday': return 'Birthday Greeting';
      case 'leave': return 'Leave Approval';
      case 'incoming': return 'Incoming Message';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const chartData = [
    { name: 'Delivered', value: effectiveStats.delivered },
    { name: 'Sent', value: effectiveStats.sent },
    { name: 'Processing', value: effectiveStats.processing },
    { name: 'Failed', value: effectiveStats.failed }
  ];

  const typeData = Object.entries(effectiveStats.types).map(([name, count]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    count
  }));

  const exportStatsCSV = () => {
    if (filteredLogs.length === 0) {
      toast.info("No logs matching filters to export");
      return;
    }

    const exportData = filteredLogs.map(log => {
      const studentDetails = resolveStudentDetails(log);
      return {
        Timestamp: log.timestamp || log.createdAt ? format(new Date(log.timestamp || log.createdAt), 'yyyy-MM-dd HH:mm:ss') : 'N/A',
        Recipient: resolveRecipient(log.recipient || log.to, log).displayName,
        StudentName: studentDetails.names,
        Class: Array.from(new Set(studentDetails.classesList)).join(', '),
        Batch: Array.from(new Set(studentDetails.batchesList)).join(', '),
        Type: log.type || 'N/A',
        Status: log.status,
        Message: log.text || log.message || '',
        FailureReason: log.error || log.lastError || log.info || 'N/A'
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `whatsapp_reports_${filterStatus}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("WhatsApp reports exported successfully");
  };

  if (profile?.role === 'clerk') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm min-h-[400px]">
        <AlertCircle className="w-12 h-12 text-[#ef4444] mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have authorization to view or edit the Reports module.
        </p>
      </div>
    );
  }

  if (!hasPermission('settings_logs') || profile?.role === 'play_school_incharge') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h2 className="text-2xl font-black text-sidebar uppercase tracking-tight">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2 text-[15px] font-bold">
          You do not have permission to view system reports.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-sidebar tracking-tighter uppercase">WhatsApp Reports</h1>
          <p className="text-neutral-500 text-[15px] font-bold mt-1 uppercase tracking-widest italic opacity-70">Track and analyze your communication delivery status</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSyncMetrics}
            disabled={isSyncingStats}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-bold transition-all shadow-xs"
            title="Reconcile and sync WhatsApp delivery numbers"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingStats ? 'animate-spin text-primary' : ''}`} />
            <span>{isSyncingStats ? 'Syncing...' : 'Sync & Reconcile'}</span>
          </button>
          <button 
            onClick={exportStatsCSV}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setFilterStatus('all')}
          className={`cursor-pointer transition-all p-6 rounded-2xl border shadow-sm ${filterStatus === 'all' ? 'border-blue-500 bg-blue-50' : 'bg-white border-gray-100 hover:border-blue-200'}`}
        >
          <div className="flex items-center gap-4 mb-2 text-blue-600">
            <MessageSquare className="w-5 h-5" />
            <span className="text-[13px] font-black uppercase tracking-widest">Total Messages</span>
          </div>
          <div className="text-3xl font-black text-sidebar">{effectiveStats.total}</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => setFilterStatus('delivered')}
          className={`cursor-pointer transition-all p-6 rounded-2xl border shadow-sm ${filterStatus === 'delivered' ? 'border-green-500 bg-green-50' : 'bg-white border-gray-100 hover:border-green-200'}`}
        >
          <div className="flex items-center gap-4 mb-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-[13px] font-black uppercase tracking-widest">Delivered</span>
          </div>
          <div className="text-3xl font-black text-sidebar">{effectiveStats.delivered}</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => setFilterStatus('sent')}
          className={`cursor-pointer transition-all p-6 rounded-2xl border shadow-sm ${filterStatus === 'sent' ? 'border-indigo-500 bg-indigo-50' : 'bg-white border-gray-100 hover:border-indigo-200'}`}
        >
          <div className="flex items-center gap-4 mb-2 text-indigo-600">
            <Send className="w-5 h-5" />
            <span className="text-[13px] font-black uppercase tracking-widest">Sent</span>
          </div>
          <div className="text-3xl font-black text-sidebar">{effectiveStats.sent}</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => setFilterStatus('processing')}
          className={`cursor-pointer transition-all p-6 rounded-2xl border shadow-sm ${filterStatus === 'processing' ? 'border-amber-500 bg-amber-50' : 'bg-white border-gray-100 hover:border-amber-200'}`}
        >
          <div className="flex items-center gap-4 mb-2 text-amber-600">
            <Clock className="w-5 h-5" />
            <span className="text-[13px] font-black uppercase tracking-widest">Processing</span>
          </div>
          <div className="text-3xl font-black text-sidebar">{effectiveStats.processing}</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={() => setFilterStatus('failed')}
          className={`cursor-pointer transition-all p-6 rounded-2xl border shadow-sm ${filterStatus === 'failed' ? 'border-red-500 bg-red-50' : 'bg-white border-gray-100 hover:border-red-200'}`}
        >
          <div className="flex items-center gap-4 mb-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span className="text-[13px] font-black uppercase tracking-widest">Failed</span>
          </div>
          <div className="text-3xl font-black text-sidebar">{effectiveStats.failed}</div>
        </motion.div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-sidebar text-base uppercase tracking-wider">Recent Activity</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Filter communication logs by status, type, and date range</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-100 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider font-mono">Status:</span>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs font-bold text-neutral-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer min-w-[110px]"
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="sent">Sent</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-100 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider font-mono">Type:</span>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs font-bold text-neutral-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer min-w-[110px]"
              >
                <option value="all">All Types</option>
                <option value="bot">Bot Auto-Alert</option>
                <option value="single">Single / Manual</option>
                <option value="broadcast">Broadcast</option>
                <option value="birthday">Birthday Greeting</option>
                <option value="leave">Leave Approval</option>
                <option value="incoming">Incoming Message</option>
                {encounteredTypes.filter(t => !['bot', 'single', 'broadcast', 'birthday', 'leave', 'incoming'].includes(t)).map(t => (
                  <option key={t} value={t}>{formatTypeLabel(t)}</option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-100 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider font-mono">Date:</span>
              <select 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-xs font-bold text-neutral-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer min-w-[110px]"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7days">Last 7 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Custom Date Picker Inputs */}
            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs font-bold text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-1.5 focus:ring-0 focus:border-neutral-300"
                  title="Start Date"
                />
                <span className="text-xs text-neutral-400 font-bold">to</span>
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs font-bold text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-1.5 focus:ring-0 focus:border-neutral-300"
                  title="End Date"
                />
              </div>
            )}
          </div>
        </div>
        <div className="overflow-x-auto lg:overflow-x-visible">
          <table className="w-full text-left table-auto">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-[11px] font-black uppercase tracking-widest border-b border-neutral-100">
                <th className="px-3 py-3">Recipient</th>
                <th className="px-3 py-3">Receipt Book Registry</th>
                <th className="px-3 py-3">Student Name</th>
                <th className="px-3 py-3">Class & Batch</th>
                <th className="px-3 py-3">Message</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Reason / Info</th>
                <th className="px-3 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedLogs.map((log) => {
                const studDetails = resolveStudentDetails(log);
                const uniqueClasses = Array.from(new Set(studDetails.classesList)).join(', ') || '---';
                const uniqueBatches = Array.from(new Set(studDetails.batchesList)).join(', ') || '---';

                const { displayName, displayNumber } = resolveRecipient(log.recipient || log.to, log);


                const renderTime = (logTime: string) => {
                  if (!logTime) return 'N/A';
                  const d = new Date(logTime);
                  const datePart = d.toLocaleDateString();
                  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div className="flex flex-col leading-none text-[11px]">
                      <span className="font-bold text-gray-700">{datePart}</span>
                      <span className="text-[10px] text-gray-400 font-semibold mt-0.5">{timePart}</span>
                    </div>
                  );
                };

                return (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors text-xs">
                    <td className="px-3 py-2.5 font-bold text-sidebar max-w-[130px]">
                      <div className="flex flex-col leading-tight">
                        <span className="truncate block" title={displayName}>{displayName}</span>
                        {displayNumber && (
                          <span className="text-[10px] text-neutral-400 font-semibold font-mono mt-0.5">
                            +{displayNumber.replace(/\+/g, '')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-black text-indigo-700 text-[11px] max-w-[125px] break-words">
                      {resolveReceiptBookName(log)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-gray-700 max-w-[120px] break-words">
                      {studDetails.names}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600 max-w-[110px]">
                      <div className="flex flex-col leading-tight">
                        <span className="font-bold text-gray-800 break-words">{uniqueClasses}</span>
                        {uniqueBatches !== '---' && (
                          <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5 break-words">
                            {uniqueBatches}
                          </span>
                        )}
                      </div>
                    </td>
                    <td 
                      className="px-3 py-2.5 max-w-[120px] truncate text-neutral-500 italic cursor-help hover:text-neutral-900 transition-colors"
                      title={log.text || log.message}
                    >
                      {log.text || log.message}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest block text-center w-max ${
                        (log.type || '').toLowerCase() === 'incoming' 
                          ? 'bg-purple-100 text-purple-700 border border-purple-200 animate-pulse' 
                          : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {formatTypeLabel(log.type || 'N/A')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        log.status === 'delivered' ? 'bg-green-50 text-green-700 border border-green-200' :
                        log.status === 'sent' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        log.status === 'duplicate' || log.status === 'skipped' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        log.status === 'processing' || log.status === 'pending' || log.status === 'queued' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {log.status === 'delivered' ? <CheckCircle2 className="w-3 h-3 text-green-600" /> :
                         log.status === 'sent' ? <Send className="w-3 h-3 text-blue-600" /> :
                         log.status === 'duplicate' || log.status === 'skipped' ? <CheckCircle2 className="w-3 h-3 text-amber-600" /> :
                         log.status === 'processing' || log.status === 'pending' || log.status === 'queued' ? <Clock className="w-3 h-3 text-amber-600" /> :
                         <AlertCircle className="w-3 h-3 text-red-600" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {(log.status === 'duplicate' || log.status === 'skipped') ? (
                        <div className="bg-amber-50 border border-amber-100 p-1.5 rounded-lg max-w-[130px]">
                          <p className="text-amber-700 font-black text-[8px] uppercase tracking-tighter mb-0.5">DUPLICATE</p>
                          <p className="text-amber-600 font-semibold text-[10px] leading-tight truncate" title={log.error || 'Duplicate notice already sent/pending'}>
                            {log.error ? log.error.replace(/^Skipped:\s*/i, '') : 'Already sent today'}
                          </p>
                        </div>
                      ) : (log.status === 'failed' || log.lastError || log.error) ? (
                        <div className="bg-red-50 border border-red-100 p-1.5 rounded-lg max-w-[130px]">
                          <p className="text-red-700 font-black text-[8px] uppercase tracking-tighter mb-0.5">FAILURE</p>
                          <p className="text-red-600 font-semibold text-[10px] leading-tight truncate" title={log.error || log.lastError}>
                            {log.error || log.lastError || 'Unknown Error'}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-neutral-50 border border-neutral-100 px-2 py-1 rounded-lg max-w-[130px] truncate" title={log.status === 'delivered' ? 'Confirmed Delivery' : log.status === 'sent' ? 'Sent to Server' : log.info || 'In Processing...'}>
                          <span className="text-neutral-500 font-bold text-[10px] leading-tight">
                            {log.status === 'delivered' ? 'Delivery Confirmed' : 
                             log.status === 'sent' ? 'Sent to Server' : 
                             log.info || 'Processing'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-500 font-medium whitespace-nowrap">
                      {renderTime(log.timestamp || log.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
                      <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center text-neutral-300">
                        <MessageSquare className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 capitalize animate-pulse">
                          No matching logs found
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Try adjusting your status, date, or message type filters.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredLogs.length > 0 && (
          <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50">
            <span className="text-xs text-neutral-500 font-medium">
              Showing <span className="font-bold text-gray-700">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-bold text-gray-700">{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> of{' '}
              <span className="font-bold text-gray-700">{filteredLogs.length}</span> activities
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-bold text-neutral-600 bg-white border border-gray-200 rounded-xl hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5) {
                    if (currentPage > 3) {
                      pageNum = currentPage - 2 + i;
                    }
                    if (pageNum + (4 - i) > totalPages) {
                      pageNum = totalPages - 4 + i;
                    }
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-xl transition-all ${
                        currentPage === pageNum
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white border border-gray-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs font-bold text-neutral-600 bg-white border border-gray-200 rounded-xl hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Relocated Delivery Distribution and Message Types Charts to downside of Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <BarChartIcon className="w-5 h-5 text-accent" />
            Delivery Distribution
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Filter className="w-5 h-5 text-accent" />
            Message Types
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
