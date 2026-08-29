import React, { useState, useMemo } from 'react';
import { 
  CreditCard, 
  Banknote, 
  Clock, 
  Printer, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  TrendingDown,
  LayoutDashboard,
  Wallet,
  Smartphone,
  Building,
  ArrowRight,
  Sparkles,
  X,
  Eye,
  EyeOff,
  Edit3,
  SlidersHorizontal,
  IndianRupee,
  Check,
  HelpCircle,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { FeeRecord, PaymentRecord, UserProfile as Student, FeeConcession } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { normalizeYear } from '../../lib/feeUtils';
import { RazorpayCollectNowModal, CollectNowOrderData, CollectNowPaymentSuccessResult } from './RazorpayCollectNowModal';

interface StudentPortalFeesProps {
  student: Student;
  feeRecord?: FeeRecord;
  payments: PaymentRecord[];
  onTakePayment: (amount: number, component: string, method: string, reference?: string) => Promise<void>;
  printReceipt: (payment: PaymentRecord) => void;
  getFeeComponents: (student: Student, type: 'school' | 'transport' | 'hostel' | 'other') => any[];
  academicYear: string;
  concessions?: FeeConcession[];
}

const StudentPortalFees: React.FC<StudentPortalFeesProps> = ({ 
  student, 
  feeRecord: passedFeeRecord, 
  payments, 
  onTakePayment, 
  printReceipt,
  getFeeComponents,
  academicYear,
  concessions = []
}) => {
  const { hasPermission, profile: loggedInProfile } = useAuth();
  const { settings } = useSettings();
  
  const feeRecord = useMemo(() => {
    if (passedFeeRecord && normalizeYear(passedFeeRecord.academicYear || '') === normalizeYear(academicYear || '')) {
      return passedFeeRecord;
    }
    return undefined;
  }, [passedFeeRecord, academicYear]);
  const [activeTab, setActiveTab] = useState<'overview' | 'breakdown' | 'history'>('overview');
  const [selectedComponent, setSelectedComponent] = useState<any | null>(null);
  const [paymentStep, setPaymentStep] = useState<'select' | 'gateway' | 'confirm'>('select');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [isProcessing, setIsProcessing] = useState(false);

  // Advanced Multi-component selection & custom payment tracking
  const [selectedComponentsMap, setSelectedComponentsMap] = useState<Record<string, boolean>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [amountEditMode, setAmountEditMode] = useState<'preset' | 'custom'>('preset');
  const [globalCustomInput, setGlobalCustomInput] = useState<string>('');

  // Interactive Card Payment Details
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardHolderName, setCardHolderName] = useState(student?.name || '');
  const [saveCardDetails, setSaveCardDetails] = useState(true);
  const [showCvv, setShowCvv] = useState(false);

  // Interactive UPI & Netbanking Details
  const [upiId, setUpiId] = useState('');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank Corporate / Personal NetBanking');

  // Razorpay CollectNow Modal States
  const [showCollectNowModal, setShowCollectNowModal] = useState(false);
  const [collectNowOrder, setCollectNowOrder] = useState<CollectNowOrderData | null>(null);
  const [collectNowComponentsMap, setCollectNowComponentsMap] = useState<Record<string, number>>({});
  const [confirmedPaymentInfo, setConfirmedPaymentInfo] = useState<{
    transactionId: string;
    amount: number;
    date: string;
    componentLabel: string;
    method: string;
    studentName: string;
    admissionNumber?: string;
  } | null>(null);

  // Card Brand Detection Helper
  const cardBrand = useMemo(() => {
    const clean = cardNumber.replace(/\D/g, '');
    if (/^4/.test(clean)) return { name: 'Visa', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200 text-blue-700' };
    if (/^(5[1-5]|2[2-7])/.test(clean)) return { name: 'Mastercard', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200 text-orange-700' };
    if (/^(60|65|81|82|508)/.test(clean)) return { name: 'RuPay', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200 text-emerald-800' };
    if (/^(34|37)/.test(clean)) return { name: 'Amex', color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700' };
    if (/^(50|56|57|58|6)/.test(clean)) return { name: 'Maestro', color: 'text-red-600', bg: 'bg-red-50 border-red-200 text-red-700' };
    return { name: 'Card', color: 'text-neutral-600', bg: 'bg-neutral-100 border-neutral-200 text-neutral-700' };
  }, [cardNumber]);

  const handleRazorpayPayment = async () => {
    setIsProcessing(true);

    const payComponentsMap: Record<string, number> = {};
    Object.entries(selectedComponentsMap).forEach(([cId, isSelected]) => {
      if (isSelected) {
        const amt = Number(customAmounts[cId]) || 0;
        if (amt > 0) {
          payComponentsMap[cId] = amt;
        }
      }
    });

    const totalPayAmount = Object.values(payComponentsMap).reduce((sum, val) => sum + val, 0);

    if (totalPayAmount <= 0) {
      toast.error('Please enter a custom payment amount greater than ₹0.');
      setIsProcessing(false);
      return;
    }

    // Double check that we don't exceed the outstanding amount for any component
    for (const [cId, amt] of Object.entries(payComponentsMap)) {
      const comp = allRelevantComponents.find(c => c.id === cId);
      if (!comp) continue;
      const paidValue = Number(effectivePaidComponents[cId] || 0);
      const remainingAmount = comp.amount - paidValue;
      if (amt > remainingAmount) {
        toast.error(`Payment amount of ₹${amt.toLocaleString()} for ${comp.label} exceeds the outstanding balance of ₹${remainingAmount.toLocaleString()}`);
        setIsProcessing(false);
        return;
      }
    }

    try {
      const studentId = student.uid || (student as any).id || 'unknown';
      // 1. Create order on backend (CollectNow endpoint)
      const orderRes = await fetch('/api/fees/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalPayAmount,
          receipt: `rcpt_${String(studentId).slice(0, 5)}_${Date.now()}`,
          studentId: studentId,
          studentName: student.name,
          academicYear: academicYear,
          componentsMap: payComponentsMap
        })
      });

      if (!orderRes.ok) {
        throw new Error('Failed to create CollectNow payment order');
      }

      const orderData: CollectNowOrderData = await orderRes.json();
      setCollectNowOrder(orderData);
      setCollectNowComponentsMap(payComponentsMap);
      setShowCollectNowModal(true);
    } catch (err: any) {
      console.error("Razorpay CollectNow workflow error:", err);
      toast.error(err.message || 'Payment setup failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle successful CollectNow verification callback
  const handleCollectNowSuccess = async (result: CollectNowPaymentSuccessResult) => {
    try {
      const studentId = student.uid || (student as any).id || 'unknown';
      
      // Trigger onTakePayment on frontend state sequential for each paid component
      for (const [cId, amt] of Object.entries(result.componentsMap)) {
        await onTakePayment(Number(amt), cId, 'razorpay_online', result.razorpay_payment_id);
      }

      // Automatically trigger thermal print preview right after successful payment!
      const consolidatedPayment: PaymentRecord = {
        id: result.razorpay_payment_id,
        studentId: studentId,
        amount: result.amount,
        date: result.verifiedAt || new Date().toISOString(),
        method: 'razorpay_online',
        reference: result.razorpay_payment_id,
        academicYear: academicYear,
        orderId: result.razorpay_order_id,
        paymentId: result.razorpay_payment_id,
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        merchantName: result.merchantName,
        mid: result.mid,
        tid: result.tid,
        checkoutMode: 'embedded_collect_now',
        status: 'success',
        component: (Object.keys(result.componentsMap).length === 1 
          ? Object.keys(result.componentsMap)[0] 
          : `multi_CONSOLIDATED CHECKOUT [${Object.keys(result.componentsMap).join(' + ')}]`) as any
      };
      printReceipt(consolidatedPayment);

      const componentName = Object.keys(result.componentsMap).length === 1 
        ? (allRelevantComponents.find(c => c.id === Object.keys(result.componentsMap)[0])?.label || Object.keys(result.componentsMap)[0])
        : `Consolidated Fee (${Object.keys(result.componentsMap).length} items)`;

      setConfirmedPaymentInfo({
        transactionId: result.razorpay_payment_id,
        amount: result.amount,
        date: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
        componentLabel: componentName,
        method: 'Razorpay CollectNow (Embedded)',
        studentName: student?.name || 'Student',
        admissionNumber: student?.admissionNumber || (student as any)?.rollNumber || ''
      });

      setShowCollectNowModal(false);
      setPaymentStep('confirm');
    } catch (error) {
      console.error("Error finalizing CollectNow payment on UI:", error);
    }
  };

  const isPortalUser = useMemo(() => {
    if (!student?.role) return false;
    const role = student.role.toLowerCase();
    return role === 'student' || role === 'parent';
  }, [student?.role]);

  const canViewAll = hasPermission('portal_student_view_fees') || isPortalUser;
  const canViewSchool = canViewAll || hasPermission('portal_student_view_school_fee');
  const canViewTransport = canViewAll || hasPermission('portal_student_view_transport_fee');
  const canViewHostel = canViewAll || hasPermission('portal_student_view_hostel_fee');
  const canViewOther = canViewAll || hasPermission('portal_student_view_other_fee');
  
  const canPay = useMemo(() => {
    if (!loggedInProfile) return false;
    const userRole = (loggedInProfile.role || '').toLowerCase();
    return (
      userRole === 'admin' ||
      userRole === 'super_admin' ||
      userRole === 'accountant' ||
      userRole === 'student' ||
      userRole === 'parent' ||
      hasPermission('portal_student_pay_fees') ||
      isPortalUser
    );
  }, [loggedInProfile, hasPermission, isPortalUser]);

  const schoolComponents = useMemo(() => canViewSchool ? getFeeComponents(student, 'school') : [], [student, getFeeComponents, canViewSchool]);
  const transportComponents = useMemo(() => canViewTransport ? getFeeComponents(student, 'transport') : [], [student, getFeeComponents, canViewTransport]);
  const hostelComponents = useMemo(() => canViewHostel ? getFeeComponents(student, 'hostel') : [], [student, getFeeComponents, canViewHostel]);
  const otherComponents = useMemo(() => canViewOther ? getFeeComponents(student, 'other') : [], [student, getFeeComponents, canViewOther]);

  const allRelevantComponents = useMemo(() => [
    ...schoolComponents,
    ...transportComponents,
    ...hostelComponents,
    ...otherComponents
  ], [schoolComponents, transportComponents, hostelComponents, otherComponents]);

  const displayPayments = useMemo(() => {
    const list = [...(payments || [])];
    const refSet = new Set(list.map(p => p.reference || p.id));

    if (feeRecord?.paymentHistory && Array.isArray(feeRecord.paymentHistory)) {
      feeRecord.paymentHistory.forEach((ph: any, idx: number) => {
        const ref = ph.reference || ph.orderId || ph.paymentId || `ph_${idx}`;
        if (!refSet.has(ref)) {
          list.push({
            id: ph.id || ph.paymentId || ref,
            studentId: student.id || student.uid,
            amount: Number(ph.amount) || 0,
            date: ph.date || new Date().toISOString(),
            method: ph.method || 'online',
            reference: ref,
            academicYear: ph.academicYear || academicYear || '2026-2027',
            component: ph.component || 'term1',
            orderId: ph.orderId || ph.razorpay_order_id,
            paymentId: ph.paymentId || ph.razorpay_payment_id,
            razorpay_order_id: ph.razorpay_order_id || ph.orderId,
            razorpay_payment_id: ph.razorpay_payment_id || ph.paymentId,
            merchantName: ph.merchantName,
            mid: ph.mid,
            tid: ph.tid,
            checkoutMode: ph.checkoutMode || 'embedded_collect_now',
            status: ph.status || 'success'
          });
          refSet.add(ref);
        }
      });
    }

    if (list.length === 0 && feeRecord?.paidComponents) {
      Object.entries(feeRecord.paidComponents).forEach(([compKey, amt]) => {
        const paidVal = Number(amt) || 0;
        if (paidVal > 0) {
          list.push({
            id: `synth_pay_${compKey}`,
            studentId: student.id || student.uid,
            amount: paidVal,
            date: feeRecord.updatedAt || new Date().toISOString(),
            method: 'online',
            reference: `RC-[${compKey.toUpperCase()}]`,
            academicYear: academicYear || '2026-2027',
            component: compKey as any
          });
        }
      });
    }

    return list;
  }, [payments, feeRecord, student, academicYear]);

  const effectivePaidComponents = useMemo(() => {
    const sumPaymentsMap: Record<string, number> = {};
    const targetIds = [student.id, student.uid, (student as any).studentId].filter(Boolean);
    displayPayments
      .filter(p => !p.reference || !p.reference.startsWith('EXP'))
      .filter(p => targetIds.length === 0 || targetIds.includes(p.studentId) || targetIds.includes((p as any).studentUid))
      .filter(p => !p.academicYear || !academicYear || normalizeYear(p.academicYear) === normalizeYear(academicYear))
      .forEach(p => {
        const comp = p.component || 'other';
        sumPaymentsMap[comp] = (sumPaymentsMap[comp] || 0) + (Number(p.amount) || 0);
      });

    const pc: Record<string, number> = {};
    const allKeys = new Set([
      ...Object.keys(sumPaymentsMap),
      ...Object.keys(feeRecord?.paidComponents || {})
    ]);

    allKeys.forEach(comp => {
      const paidVal = Math.max(
        sumPaymentsMap[comp] || 0,
        Number(feeRecord?.paidComponents?.[comp as keyof FeeRecord['paidComponents']] || 0)
      );
      const matchedComp = allRelevantComponents.find(c => c.id === comp);
      if (matchedComp && matchedComp.amount > 0) {
        pc[comp] = Math.min(paidVal, matchedComp.amount);
      } else {
        pc[comp] = paidVal;
      }
    });

    return pc;
  }, [feeRecord, displayPayments, student, academicYear, allRelevantComponents]);

  const unpaidComponents = useMemo(() => {
    return allRelevantComponents.filter(c => {
      const paid = Number(effectivePaidComponents[c.id] || 0);
      return paid < c.amount;
    });
  }, [allRelevantComponents, effectivePaidComponents]);

  const handleOpenCheckout = (initialComponent?: any) => {
    const freshSelection: Record<string, boolean> = {};
    const freshAmounts: Record<string, string> = {};
    let initialTotal = 0;
    
    unpaidComponents.forEach(c => {
      const paid = Number(effectivePaidComponents[c.id] || 0);
      const remainingNum = Math.max(0, c.amount - paid);
      const isInitial = initialComponent ? c.id === initialComponent.id : true;
      freshSelection[c.id] = isInitial;
      freshAmounts[c.id] = remainingNum.toString();
      if (isInitial) {
        initialTotal += remainingNum;
      }
    });
    
    setSelectedComponentsMap(freshSelection);
    setCustomAmounts(freshAmounts);
    setGlobalCustomInput(initialTotal > 0 ? initialTotal.toString() : '');
    setSelectedComponent(initialComponent || unpaidComponents[0] || null);
    setCardHolderName(student?.name || '');
    setPaymentStep('gateway');
  };

  // Set global custom payment amount and smartly auto-allocate across selected dues
  const handleSetGlobalCustomAmount = (targetAmt: number) => {
    let remainingBudget = Math.max(0, targetAmt);
    const nextSelection: Record<string, boolean> = {};
    const nextAmounts: Record<string, string> = {};

    unpaidComponents.forEach(c => {
      const paid = Number(effectivePaidComponents[c.id] || 0);
      const remainingNum = Math.max(0, c.amount - paid);
      if (remainingBudget > 0 && remainingNum > 0) {
        const allocate = Math.min(remainingBudget, remainingNum);
        nextSelection[c.id] = true;
        nextAmounts[c.id] = allocate.toString();
        remainingBudget -= allocate;
      } else {
        nextSelection[c.id] = false;
        nextAmounts[c.id] = '0';
      }
    });

    setSelectedComponentsMap(nextSelection);
    setCustomAmounts(nextAmounts);
    setGlobalCustomInput(targetAmt > 0 ? targetAmt.toString() : '');
  };

  // Set percentage presets e.g. 25%, 50%, 75%, 100% of pending dues
  const handlePresetPercentage = (pct: number) => {
    const nextSelection: Record<string, boolean> = {};
    const nextAmounts: Record<string, string> = {};
    let runningTotal = 0;

    unpaidComponents.forEach(c => {
      const paid = Number(effectivePaidComponents[c.id] || 0);
      const remainingNum = Math.max(0, c.amount - paid);
      if (remainingNum > 0) {
        const allocate = Math.max(1, Math.round((remainingNum * pct) / 100));
        nextSelection[c.id] = true;
        nextAmounts[c.id] = allocate.toString();
        runningTotal += allocate;
      } else {
        nextSelection[c.id] = false;
        nextAmounts[c.id] = '0';
      }
    });

    setSelectedComponentsMap(nextSelection);
    setCustomAmounts(nextAmounts);
    setGlobalCustomInput(runningTotal.toString());
  };

  // Update custom amount for an individual fee component
  const handleComponentAmountChange = (cId: string, value: string) => {
    const comp = allRelevantComponents.find(c => c.id === cId);
    const paid = Number(effectivePaidComponents[cId] || 0);
    const maxDue = comp ? Math.max(0, comp.amount - paid) : 0;
    
    const cleaned = value.replace(/\D/g, '');
    let num = cleaned === '' ? 0 : Number(cleaned);
    if (num > maxDue) {
      num = maxDue;
      toast.info(`Capped to outstanding component due: ₹${maxDue.toLocaleString()}`);
    }
    
    setCustomAmounts(prev => ({
      ...prev,
      [cId]: num.toString()
    }));
    
    if (num > 0) {
      setSelectedComponentsMap(prev => ({ ...prev, [cId]: true }));
    }
  };

  const stats = useMemo(() => {
    const total: number = allRelevantComponents.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
    const paid: number = (Object.values(effectivePaidComponents) as any[]).reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
    const pending = Math.max(0, total - paid);
    return { total, paid, pending };
  }, [allRelevantComponents, effectivePaidComponents]);

  const computedTotalToPay = useMemo(() => {
    let sum = 0;
    Object.entries(selectedComponentsMap).forEach(([cId, isSelected]) => {
      if (isSelected) {
        sum += Number(customAmounts[cId]) || 0;
      }
    });
    return sum;
  }, [selectedComponentsMap, customAmounts]);

  const nextDue = useMemo(() => {
    const unpaid = allRelevantComponents.find(c => {
      const paid = Number(effectivePaidComponents[c.id] || 0);
      return paid < c.amount;
    });
    return unpaid;
  }, [allRelevantComponents, effectivePaidComponents]);

  const hasConcession = useMemo(() => {
    const type = (student as any).feeConcessionType || '';
    return !!(type && type.toString().toLowerCase() !== 'none' && type.toString().toLowerCase() !== 'no concession' && type.toString().trim() !== '');
  }, [student]);

  const concessionName = useMemo(() => {
    const type = (student as any).feeConcessionType || '';
    if (!type || type.toString().toLowerCase() === 'none' || type.toString().toLowerCase() === 'no concession' || type.toString().trim() === '') {
      return '';
    }
    if (type === 'custom') {
      const customAmt = (student as any).feeConcessionAmount || feeRecord?.concessionAmount || 0;
      return `Custom Concession (₹${customAmt.toLocaleString()})`;
    }
    const foundConcession = (concessions || []).find(c => c.id === type);
    if (foundConcession) {
      return foundConcession.name;
    }
    return 'Institutional Concession';
  }, [student, concessions, feeRecord]);

  const concessionLabel = useMemo(() => {
    const type = (student as any).feeConcessionType || '';
    if (type === 'custom') {
      const customAmt = (student as any).feeConcessionAmount || (student as any).feeConcessionCustomValue || feeRecord?.concessionAmount || 0;
      return `Custom Concession (₹${Number(customAmt).toLocaleString()})`;
    }
    const amt = feeRecord?.concessionAmount || 0;
    const amountStr = amt > 0 ? ` (₹${amt.toLocaleString()})` : '';
    const name = concessionName || 'Active Concession';
    return name.includes('₹') ? name : `${name}${amountStr}`;
  }, [student, feeRecord, concessionName]);

  const concessionAmountNum = useMemo(() => {
    const customAmt = Number((student as any).feeConcessionAmount || (student as any).feeConcessionCustomValue || feeRecord?.concessionAmount || 0);
    if (customAmt > 0) return customAmt;
    const type = (student as any).feeConcessionType || '';
    const foundConcession = (concessions || []).find(c => c.id === type);
    if (foundConcession) {
      if (foundConcession.type === 'percentage') {
        const grossTotal = allRelevantComponents.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        return Math.round((grossTotal * (foundConcession.value || 0)) / 100);
      } else {
        return Number(foundConcession.value || 0);
      }
    }
    return 0;
  }, [student, feeRecord, concessions, allRelevantComponents]);

  const concessionReasonStr = useMemo(() => {
    return (student as any).feeConcessionReason || (student as any).concessionReason || (student as any).concessionNotes || (feeRecord as any)?.concessionReason || (feeRecord as any)?.concessionNotes || 'Special Institutional Approval';
  }, [student, feeRecord]);

  const grossTotalAmountNum = useMemo(() => {
    return stats.total + (concessionAmountNum > 0 ? concessionAmountNum : 0);
  }, [stats.total, concessionAmountNum]);

  // WhatsApp Helper function to construct message text and redirect
  const handleWhatsAppReceipt = (customPayment?: any) => {
    const paymentItem = customPayment || payments.find(p => p.studentId === (student.uid || student.id) && (!p.reference || !p.reference.startsWith('EXP')));
    
    // Construct text representation
    const totalDue = stats.pending;
    const paidByComp = Number(feeRecord?.paidComponents?.[selectedComponent?.id as keyof FeeRecord['paidComponents']] || 0);
    const amtCurrent = selectedComponent ? selectedComponent.amount - paidByComp : 0;
    
    const text = `*ST. ANTONY'S HIGH SCHOOL - OFFICIAL FEE RECEIPT*%0A%0A` +
      `*STUDENT PROFILE DETAILS:*%0A` +
      `• Name: *${student.name}*%0A` +
      `• Roll Number/Admn No: *${student.rollNumber || student.admissionNumber || 'N/A'}*%0A` +
      `• Class: *${student.classId || student.class || 'N/A'}*%0A` +
      `• Batch: *${student.batchId || student.batch || 'N/A'}*%0A` +
      `• Academic Session: *${academicYear}*%0A%0A` +
      `*TRANSACTION METRICS:*%0A` +
      `• Component: *${selectedComponent?.label || paymentItem?.component || 'Fee Component'}*%0A` +
      `• Settled Amount: *Rs. ${(paymentItem?.amount || amtCurrent || 0).toLocaleString()}.00 INR*%0A` +
      `• Payment Gateway: *Razorpay Secured Network*%0A` +
      `• Reference / Pay ID: *${paymentItem?.reference || 'PAY_RZP_' + Date.now().toString().slice(-6)}*%0A` +
      `• Date: *${new Date(paymentItem?.date || Date.now()).toLocaleDateString()} ${new Date(paymentItem?.date || Date.now()).toLocaleTimeString()}*%0A%0A` +
      `*MAPPED DISCOUNTS & PROGRAM:*%0A` +
      `• Concession Scheme: *${concessionName || 'None'}*%0A` +
      `• Academic Concession Savings: *Rs. ${(feeRecord?.concessionAmount || 0).toLocaleString()}*%0A%0A` +
      `*CURRENT BALANCES SUMMARY:*%0A` +
      `• Total Pending Dues Left: *Rs. ${totalDue.toLocaleString()}.00 INR*%0A%0A` +
      `Thank you for staying ahead of your academic dues! This receipt is dynamically authenticated under system audit code RZP_VERIFIED_LEDGER.`;

    const phoneNum = student.whatsappNumber || student.parentPhone || student.phone || (student as any).phone || '';
    const cleanPhone = phoneNum.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    
    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${text}`;
    
    toast.success('Building secure WhatsApp message payload...');
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      {/* Compact Header Profile Summary */}
      <div className="bg-gradient-to-r from-slate-900 via-neutral-900 to-slate-900 rounded-xl p-3.5 sm:p-5 text-white relative overflow-hidden shadow-md border border-neutral-800">
        <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-indigo-600/10 rounded-full blur-[70px] -mr-16 -mt-16 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center p-0.5 border border-white/20 shadow-sm shrink-0">
               {(student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl) ? (
                 <img src={student.photoURL || student.photoUrl || student.facePhotoURL || student.facePhotoUrl} alt={student.name} className="w-full h-full object-cover rounded-lg" />
               ) : (
                 <LayoutDashboard className="w-6 h-6 text-white/70" />
               )}
            </div>
            <div className="space-y-0.5">
              <h2 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight text-white leading-tight">{student.name}</h2>
              <p className="text-indigo-200 text-xs sm:text-sm font-semibold tracking-wide">
                {student.class || student.classId || 'N/A'} - {student.batch || student.batchId || 'N/A'} • ROLL #{student.rollNumber || 'N/A'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="px-2 py-0.5 bg-white/10 rounded text-xs font-mono font-bold uppercase tracking-wider border border-white/15">
                  {student.admissionNumber || 'ADM-000'}
                </span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-xs font-mono font-bold uppercase tracking-wider border border-emerald-500/25">
                  Session {academicYear}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col justify-center items-start sm:items-end text-left sm:text-right shrink-0 space-y-1 w-full sm:w-auto border-t border-white/10 sm:border-t-0 pt-2.5 sm:pt-0">
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider font-mono leading-none">Total Outstanding Balance</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-400 font-mono leading-none">₹{stats.pending.toLocaleString()}</span>
              <span className="text-white/50 text-xs font-bold font-mono uppercase">INR</span>
            </div>
            <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1 mt-0.5">
              {hasConcession && (
                <p className="text-xs text-indigo-200 font-bold uppercase tracking-wider bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30 leading-none">
                  {concessionLabel}
                </p>
              )}
              {nextDue && (
                <div className="flex items-center gap-1.5 text-rose-300 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
                  <p className="text-xs font-bold uppercase tracking-wider truncate max-w-[180px]">Next Due: {nextDue.label}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Menubar Tabs */}
      <div className="bg-neutral-100/90 border border-neutral-200/80 rounded-lg p-1 shadow-2xs w-full max-w-xl mx-auto">
        <div className="flex flex-row items-stretch justify-between w-full font-sans">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`flex-1 text-center py-2 px-3 rounded-md text-xs sm:text-sm font-bold tracking-wide transition-all cursor-pointer ${
              activeTab === 'overview' 
                ? 'bg-neutral-900 text-white shadow-xs' 
                : 'text-neutral-600 hover:bg-white hover:text-neutral-900'
            }`}
          >
            General Overview
          </button>
          <div className="w-px bg-neutral-300/60 my-1" />
          <button 
            onClick={() => setActiveTab('breakdown')}
            className={`flex-1 text-center py-2 px-3 rounded-md text-xs sm:text-sm font-bold tracking-wide transition-all cursor-pointer ${
              activeTab === 'breakdown' 
                ? 'bg-neutral-900 text-white shadow-xs' 
                : 'text-neutral-600 hover:bg-white hover:text-neutral-900'
            }`}
          >
            Fee Components
          </button>
          <div className="w-px bg-neutral-300/60 my-1" />
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 text-center py-2 px-3 rounded-md text-xs sm:text-sm font-bold tracking-wide transition-all cursor-pointer ${
              activeTab === 'history' 
                ? 'bg-neutral-900 text-white shadow-xs' 
                : 'text-neutral-600 hover:bg-white hover:text-neutral-900'
            }`}
          >
            Payment Ledger
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {allRelevantComponents.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-12 text-center bg-white rounded-[2.5rem] border border-dashed border-neutral-200"
          >
            <div className="w-16 h-16 bg-neutral-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-neutral-300">
              <CreditCard className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-sidebar uppercase tracking-tight">No Fees Due for {academicYear}</h3>
            <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest mt-1 italic px-8">
              We couldn't find any pending fees for your profile in the selected academic year. 
              This happens if your <b>Class Assignment</b> is missing, <b>Fee Structures</b> aren't mapped for this year, 
              or you've already completed all payments.
            </p>
            <div className="mt-8 flex justify-center gap-4">
               <button 
                onClick={() => setActiveTab('history')}
                className="px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-200 transition-all"
               >
                 View Past Receipts
               </button>
               <div className="px-6 py-3 bg-primary/5 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest border border-primary/10">
                 Current Profile: {student.classId || 'No Class'}
               </div>
            </div>
          </motion.div>
        ) : activeTab === 'overview' && (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4 w-full"
          >
            {/* FEE CONCESSION SUMMARY BANNER */}
            {hasConcession && (
              <div className="bg-gradient-to-r from-amber-500/10 via-amber-50/80 to-indigo-50/80 border border-amber-300 rounded-xl p-3.5 sm:p-4 shadow-3xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                      <Sparkles className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-500 text-white text-xs font-bold uppercase tracking-wider rounded">
                          Concession Active
                        </span>
                        <span className="text-sm sm:text-base font-extrabold text-amber-950 uppercase">
                          {concessionName || 'Custom Fee Concession'}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-neutral-700 font-medium mt-0.5">
                        Remark: <span className="font-bold text-neutral-900">{concessionReasonStr}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-white/90 px-3.5 py-2 rounded-lg border border-amber-200/80 shadow-3xs font-mono text-xs sm:text-sm shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                    <div>
                      <span className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase block leading-none">Gross Fee</span>
                      <span className="text-neutral-500 font-bold line-through text-xs sm:text-sm">₹{grossTotalAmountNum.toLocaleString()}</span>
                    </div>
                    <div className="text-emerald-600 font-bold">
                      <span className="text-[10px] sm:text-xs text-emerald-600 font-bold uppercase block leading-none">Concession</span>
                      <span className="font-extrabold text-sm sm:text-base">-₹{concessionAmountNum.toLocaleString()}</span>
                    </div>
                    <div className="border-l border-neutral-200 pl-3">
                      <span className="text-[10px] sm:text-xs text-indigo-600 font-bold uppercase block leading-none">Net Payable</span>
                      <span className="font-black text-base sm:text-lg text-indigo-900">₹{stats.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
              {/* Box 1: Total Fees Amount */}
              <div className="bg-white p-4 sm:p-5 rounded-xl border border-neutral-200 shadow-3xs flex flex-col justify-between">
                <div>
                  <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-2.5 border border-indigo-100 shadow-2xs">
                    <Wallet className="w-5 h-5 font-bold" />
                  </div>
                  <h3 className="text-neutral-600 text-xs sm:text-sm font-bold uppercase tracking-wider">Total Fees Amount</h3>
                  <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight mt-1 font-mono">₹{stats.total.toLocaleString()}</p>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-indigo-600 bg-indigo-50/70 w-fit px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider font-mono">
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Mapped Schedule Dues</span>
                </div>
              </div>

              {/* Box 2: Total Settled Amount */}
              <div className="bg-white p-4 sm:p-5 rounded-xl border border-neutral-200 shadow-3xs flex flex-col justify-between">
                <div>
                  <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-2.5 border border-blue-100 shadow-2xs">
                    <ShieldCheck className="w-5 h-5 font-bold" />
                  </div>
                  <h3 className="text-neutral-600 text-xs sm:text-sm font-bold uppercase tracking-wider">Total Settled Amount</h3>
                  <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight mt-1 font-mono">₹{stats.paid.toLocaleString()}</p>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-blue-600 bg-blue-50/70 w-fit px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider font-mono">
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{stats.total > 0 ? Math.round((stats.paid/stats.total) * 105) > 100 ? 100 : Math.round((stats.paid/stats.total) * 100) : 0}% Cleared & Settled</span>
                </div>
              </div>

              {/* Box 3: Pending Institutional Dues */}
              <div className="bg-white p-4 sm:p-5 rounded-xl border border-neutral-200 shadow-3xs flex flex-col justify-between">
                <div>
                  <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center mb-2.5 border border-rose-100 shadow-2xs">
                    <TrendingDown className="w-5 h-5 font-bold" />
                  </div>
                  <h3 className="text-neutral-600 text-xs sm:text-sm font-bold uppercase tracking-wider">Pending Dues</h3>
                  <p className="text-2xl sm:text-3xl font-extrabold text-rose-600 tracking-tight mt-1 font-mono">₹{stats.pending.toLocaleString()}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50/70 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider font-mono whitespace-nowrap">
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{stats.total > 0 ? Math.round((stats.pending/stats.total) * 100) : 0}% Dues</span>
                  </div>
                  {stats.pending > 0 && canPay && (
                    <button 
                      onClick={() => handleOpenCheckout()}
                      className="bg-blue-600 hover:bg-neutral-900 text-white font-bold text-xs uppercase tracking-wider py-1.5 px-3.5 rounded-md transition-all cursor-pointer shadow-2xs"
                    >
                      Pay All
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Fee Components and Payment Ledger on One Line */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Left Column: Fee Components */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-3xs overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="p-3.5 border-b border-neutral-200 bg-neutral-50/70 flex justify-between items-center">
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-neutral-800 uppercase tracking-wider flex items-center gap-2">
                        <Building className="w-4.5 h-4.5 text-indigo-500" />
                        Mapped Fee Components & Term Schedule
                      </h4>
                      <p className="text-xs text-neutral-500 font-semibold uppercase font-mono mt-0.5">Session {academicYear}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-extrabold font-mono border border-indigo-100">
                      {allRelevantComponents.length} Mapped
                    </span>
                  </div>
                  
                  <div className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto">
                    {allRelevantComponents.map(c => {
                      const paid = Number(feeRecord?.paidComponents?.[c.id as keyof FeeRecord['paidComponents']] || 0);
                      const isFullyPaid = paid >= c.amount;
                      const progress = Math.min(100, (paid / c.amount) * 100);

                      return (
                        <div key={c.id} className="p-3 sm:p-3.5 hover:bg-neutral-50/60 transition-all">
                          <div className="flex items-center justify-between gap-3">
                            {/* Component Name & Subtitle */}
                            <div className="space-y-0.5 min-w-0">
                              <h5 className="text-xs sm:text-sm font-extrabold text-neutral-900 uppercase tracking-tight truncate">{c.label}</h5>
                              <p className="text-xs text-neutral-500 font-semibold font-mono">
                                Class Component • {academicYear}
                              </p>
                            </div>

                            {/* Amounts & Pay Action */}
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <p className="text-sm sm:text-base font-extrabold text-neutral-900 font-mono leading-none">₹{c.amount.toLocaleString()}</p>
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase border mt-1 leading-none ${
                                  isFullyPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {isFullyPaid ? 'Settled' : `Due: ₹${(c.amount - paid).toLocaleString()}`}
                                </span>
                              </div>

                              {!isFullyPaid && canPay && (
                                <button 
                                  onClick={() => handleOpenCheckout(c)}
                                  className="bg-blue-600 hover:bg-neutral-900 text-white px-3 py-1.5 rounded-md text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-2xs"
                                >
                                  Pay Term
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Progress Line */}
                          <div className="mt-2.5 flex items-center gap-2.5">
                            <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden border border-neutral-200">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className={`h-full rounded-full ${isFullyPaid ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-bold font-mono shrink-0 text-neutral-600">
                              <span className="text-emerald-600 font-extrabold">Paid: ₹{paid.toLocaleString()}</span>
                              <span>({Math.round(progress)}%)</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {allRelevantComponents.length === 0 && (
                      <div className="p-8 text-center text-neutral-500 uppercase tracking-wider text-xs font-bold font-mono">
                        No Mapped Components Available.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Payment Ledger */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-3xs overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="p-3.5 border-b border-neutral-200 bg-neutral-50/70 flex justify-between items-center">
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-neutral-800 uppercase tracking-wider flex items-center gap-2">
                        <Banknote className="w-4.5 h-4.5 text-indigo-500" />
                        Instantly Generated Payment Receipts Logs
                      </h4>
                      <p className="text-xs text-neutral-500 font-semibold uppercase font-mono mt-0.5">Transaction history ledger</p>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-extrabold font-mono border border-emerald-100">
                      {displayPayments.length} Paid
                    </span>
                  </div>

                  <div className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto">
                    {displayPayments.length > 0 ? (
                      displayPayments
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map(p => (
                          <div key={p.id} className="p-3 sm:p-3.5 hover:bg-neutral-50/40 transition-all">
                            <div className="flex justify-between items-center gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  p.method === 'cash' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                                }`}>
                                  <Banknote className="w-4.5 h-4.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm sm:text-base font-extrabold text-neutral-900 font-mono leading-none">₹{p.amount.toLocaleString()}</p>
                                  <p className="text-xs text-neutral-600 font-semibold uppercase font-mono mt-1 truncate">
                                    {p.method} • {new Date(p.date).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button 
                                  onClick={() => printReceipt(p)}
                                  title="Print Physical Receipt"
                                  className="h-8 w-8 bg-neutral-100 hover:bg-neutral-800 hover:text-white rounded-md flex items-center justify-center transition-all cursor-pointer border border-neutral-200 text-neutral-700"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleWhatsAppReceipt(p)}
                                  title="Send on WhatsApp"
                                  className="h-8 w-8 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-md flex items-center justify-center transition-all cursor-pointer border border-emerald-200"
                                >
                                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.515 0 10.002-4.484 10.004-9.997.002-2.67-1.033-5.18-2.908-7.051C16.595 1.686 14.09 1.65 11.371 1.65H12c-5.512 0-9.998 4.487-10 10.001-.001 1.83.476 3.62 1.385 5.195l-.946 3.454 3.538-.93L6.59 19.1zM17.02 14.1c-.274-.138-1.62-.8-1.87-.89-.25-.09-.43-.138-.61.138-.18.274-.7.89-.86 1.07-.16.182-.32.206-.6.069-.27-.138-1.155-.426-2.202-1.36-.814-.727-1.364-1.624-1.524-1.9-.16-.274-.017-.422.12-.56.124-.124.274-.32.41-.48.14-.16.18-.27.27-.45.09-.18.04-.34-.02-.48-.06-.138-.61-1.477-.83-2.02-.22-.53-.44-.45-.61-.46H8.7c-.18 0-.47.07-.72.34-.25.274-.96.94-.96 2.3 0 1.36.99 2.67 1.13 2.86.14.18 1.95 2.97 4.72 4.17.66.29 1.17.46 1.57.59.66.21 1.26.18 1.73.11.53-.08 1.62-.66 1.85-1.3.23-.64.23-1.18.16-1.3-.07-.1-.26-.18-.53-.32z"/>
                                  </svg>
                                </button>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-1.5 text-xs text-neutral-600 font-mono">
                              <span className="text-blue-600 font-extrabold uppercase truncate max-w-[180px]">
                                {p.component}
                              </span>
                              <span className="font-bold text-xs uppercase text-neutral-500">
                                REF: {p.reference || 'SYSTEM_LOG'}
                              </span>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="p-12 text-center">
                        <div className="w-12 h-12 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-3">
                          <AlertCircle className="w-6 h-6 text-neutral-400" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-neutral-600 uppercase tracking-tight">No Activity Logged</h4>
                        <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">Historically cleared transaction data will appear here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-white rounded-xl border border-neutral-200 shadow-3xs overflow-hidden"
          >
            <div className="p-3 border-b border-neutral-200 flex justify-between items-center bg-neutral-50/70">
               <div>
                 <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider font-sans">Payment Ledger Summary</h3>
                 <p className="text-[10px] text-neutral-500 font-medium font-mono">Transaction logs & generated receipts</p>
               </div>
               <Printer className="w-4 h-4 text-neutral-400 pointer-events-none hidden sm:block" />
            </div>
            
            <div className="divide-y divide-neutral-100">
               {displayPayments.filter(p => !p.reference || !p.reference.startsWith('EXP')).length > 0 ? (
                 displayPayments
                   .filter(p => !p.reference || !p.reference.startsWith('EXP'))
                   .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                   .map(p => (
                     <div key={p.id} className="p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-neutral-50/40 transition-all">
                       <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                           p.method === 'cash' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                         }`}>
                           <Banknote className="w-4 h-4" />
                         </div>
                         <div>
                            <div className="flex items-center gap-2">
                               <p className="text-sm font-bold text-neutral-900 font-mono">₹{p.amount.toLocaleString()}</p>
                               <span className="px-1.5 py-0.2 bg-neutral-100 text-[9px] font-semibold uppercase rounded font-mono text-neutral-600">{p.method}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-neutral-500">
                              <span className="font-bold text-blue-600 uppercase">{p.component}</span>
                              <span>•</span>
                              <span>REF: {p.reference || 'SYSTEM_LOG'}</span>
                            </div>
                         </div>
                       </div>
                       <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0">
                          <div className="text-left sm:text-right">
                             <p className="text-xs font-bold text-neutral-800">{new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                             <p className="text-[10px] text-neutral-400 font-mono">{new Date(p.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => printReceipt(p)}
                              title="Print Physical Receipt"
                              className="h-7 px-2.5 bg-neutral-100 text-neutral-700 rounded-md flex items-center gap-1 hover:bg-neutral-800 hover:text-white transition-all text-[10px] font-bold uppercase cursor-pointer border border-neutral-200"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Print
                            </button>
                            <button 
                              onClick={() => handleWhatsAppReceipt(p)}
                              title="Send Receipt to WhatsApp"
                              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center gap-1 transition-all text-[10px] font-bold uppercase cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.515 0 10.002-4.484 10.004-9.997.002-2.67-1.033-5.18-2.908-7.051C16.595 1.686 14.09 1.65 11.371 1.65H12c-5.512 0-9.998 4.487-10 10.001-.001 1.83.476 3.62 1.385 5.195l-.946 3.454 3.538-.93L6.59 19.1zM17.02 14.1c-.274-.138-1.62-.8-1.87-.89-.25-.09-.43-.138-.61.138-.18.274-.7.89-.86 1.07-.16.182-.32.206-.6.069-.27-.138-1.155-.426-2.202-1.36-.814-.727-1.364-1.624-1.524-1.9-.16-.274-.017-.422.12-.56.124-.124.274-.32.41-.48.14-.16.18-.27.27-.45.09-.18.04-.34-.02-.48-.06-.138-.61-1.477-.83-2.02-.22-.53-.44-.45-.61-.46H8.7c-.18 0-.47.07-.72.34-.25.274-.96.94-.96 2.3 0 1.36.99 2.67 1.13 2.86.14.18 1.95 2.97 4.72 4.17.66.29 1.17.46 1.57.59.66.21 1.26.18 1.73.11.53-.08 1.62-.66 1.85-1.3.23-.64.23-1.18.16-1.3-.07-.1-.26-.18-.53-.32z"/>
                              </svg>
                              Share
                            </button>
                          </div>
                       </div>
                     </div>
                   ))
               ) : (
                 <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <AlertCircle className="w-6 h-6 text-neutral-400" />
                    </div>
                    <h4 className="text-sm font-bold text-neutral-500 uppercase">No Activity Logged</h4>
                    <p className="text-xs text-neutral-400 mt-1">Transaction data will appear here.</p>
                 </div>
               )}
            </div>
          </motion.div>
        )}

        {activeTab === 'breakdown' && (
          <motion.div 
            key="breakdown"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
            {/* FEE CONCESSION BANNER IN BREAKDOWN TAB */}
            {hasConcession && (
              <div className="bg-gradient-to-r from-amber-500/10 via-amber-50/80 to-indigo-50/80 border border-amber-300 rounded-xl p-3 shadow-3xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider rounded">
                          Concession Active
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-amber-950 uppercase">
                          {concessionName || 'Custom Fee Concession'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-600 font-medium mt-0.5">
                        Remark: <span className="font-semibold text-neutral-800">{concessionReasonStr}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white/90 px-3 py-1.5 rounded-lg border border-amber-200/80 shadow-3xs font-mono text-xs shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                    <div>
                      <span className="text-[9px] text-neutral-400 font-bold uppercase block leading-none">Gross Fee</span>
                      <span className="text-neutral-500 font-bold line-through text-xs">₹{grossTotalAmountNum.toLocaleString()}</span>
                    </div>
                    <div className="text-emerald-600 font-bold">
                      <span className="text-[9px] text-emerald-600 font-bold uppercase block leading-none">Concession</span>
                      <span className="font-bold text-xs sm:text-sm">-₹{concessionAmountNum.toLocaleString()}</span>
                    </div>
                    <div className="border-l border-neutral-200 pl-2.5">
                      <span className="text-[9px] text-indigo-600 font-bold uppercase block leading-none">Net Payable</span>
                      <span className="font-extrabold text-sm sm:text-base text-indigo-900">₹{stats.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {['school', 'transport', 'hostel', 'other'].map(type => {
              const components = type === 'school' ? schoolComponents : type === 'transport' ? transportComponents : type === 'hostel' ? hostelComponents : otherComponents;
              if (components.length === 0) return null;

              return (
                <div key={type} className="bg-white rounded-xl border border-neutral-200 shadow-3xs overflow-hidden">
                  <div className="p-3 border-b border-neutral-200 bg-neutral-50/70">
                    <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2">
                      <div className="w-7 h-7 bg-indigo-900 text-white rounded-lg flex items-center justify-center shrink-0">
                         {type === 'school' ? <Building className="w-3.5 h-3.5 text-indigo-300" /> : type === 'transport' ? <Smartphone className="w-3.5 h-3.5 text-amber-400" /> : type === 'hostel' ? <Wallet className="w-3.5 h-3.5 text-pink-300" /> : <CreditCard className="w-3.5 h-3.5 text-blue-300" />}
                      </div>
                      <span className="font-sans uppercase font-bold text-xs">{type} fee schedule breakdown</span>
                    </h3>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {components.map(c => {
                      const paid = Number(feeRecord?.paidComponents?.[c.id as keyof FeeRecord['paidComponents']] || 0);
                      const isFullyPaid = paid >= c.amount;
                      const progress = Math.min(100, (paid / c.amount) * 100);

                      return (
                        <div key={c.id} className="p-3 hover:bg-neutral-50/50 transition-all">
                          <div className="flex justify-between items-center gap-3 mb-2">
                            <div>
                               <p className="text-xs sm:text-sm font-bold text-neutral-900 uppercase tracking-tight">{c.label}</p>
                               <p className="text-[10px] text-neutral-500 font-medium font-mono mt-0.5">Session {academicYear}</p>
                            </div>
                            <div className="text-right shrink-0">
                               <p className="text-sm font-bold text-neutral-900 font-mono leading-none">₹{c.amount.toLocaleString()}</p>
                               <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase mt-0.5 border ${
                                 isFullyPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                               }`}>
                                 {isFullyPaid ? 'Fully Paid' : `Due: ₹${(c.amount - paid).toLocaleString()}`}
                               </span>
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                             <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden border border-neutral-200">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progress}%` }}
                                  className={`h-full rounded-full transition-all duration-700 ${isFullyPaid ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                />
                             </div>
                             <div className="flex justify-between items-center text-[10px] font-medium font-mono text-neutral-500">
                                <span className="text-emerald-600 font-bold">Paid: ₹{paid.toLocaleString()}</span>
                                <span>{Math.round(progress)}% Progress</span>
                             </div>
                          </div>

                          {!isFullyPaid && canPay && (
                            <div className="mt-2 flex justify-end">
                               <button 
                                 onClick={() => handleOpenCheckout(c)}
                                 className="flex items-center gap-1 bg-blue-600 hover:bg-neutral-900 text-white px-3 py-1 rounded-md text-[11px] font-bold uppercase transition-all shadow-2xs cursor-pointer"
                               >
                                 Proceed to Pay Dues
                                 <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                               </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Gateway Modal Simulation */}
      {paymentStep === 'gateway' && selectedComponent && (
        <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-1 sm:p-2 md:p-3 animate-in fade-in duration-200">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl sm:rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.6)] w-full max-w-[99vw] h-[98vh] flex flex-col overflow-hidden border border-neutral-200 font-sans"
          >
            {/* Header / Brand Panel - Compact & Maximized */}
            <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-neutral-200 bg-gradient-to-r from-blue-900 via-indigo-950 to-neutral-900 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 shadow-xs shrink-0">
                     <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                     <div className="flex items-center gap-2">
                       <h3 className="text-base sm:text-xl font-black uppercase tracking-tight text-white leading-none">
                         Secure Institutional Checkout
                       </h3>
                       <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] sm:text-xs font-black uppercase rounded-md font-mono tracking-wider border border-emerald-500/30">
                         RAZORPAY PRIMARY
                       </span>
                     </div>
                     <p className="text-[11px] sm:text-xs text-neutral-300 font-semibold uppercase tracking-wider mt-0.5">
                       ST. ANTONY'S HIGH SCHOOL • Unified Fee Payment Gateway
                     </p>
                  </div>
               </div>
               
               <div className="flex items-center gap-3">
                 <div className="hidden sm:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/15 text-xs text-neutral-200 font-mono">
                   <span className="font-bold text-white uppercase">{student.name}</span>
                   <span className="text-neutral-400">({student.rollNumber || 'ADM-01'})</span>
                 </div>
                 <button 
                   onClick={() => setPaymentStep('select')} 
                   className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all flex items-center gap-1.5 text-white cursor-pointer text-xs font-bold uppercase font-mono"
                 >
                   <span>Back</span>
                   <X className="w-4 h-4" />
                 </button>
               </div>
            </div>

            {/* Maximized Direct Layout - 2 Spacious Columns That Fit on 1 Screen */}
            <div className="p-3 sm:p-4 overflow-hidden flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 h-[calc(100%-60px)]">
               
               {/* LEFT COLUMN: Fee Breakdown & Custom Payment Amount (5 Cols) */}
               <div className="lg:col-span-5 flex flex-col gap-2.5 justify-between h-full overflow-hidden">
                  
                  {/* Total Payable Summary Card */}
                  <div className="bg-gradient-to-br from-neutral-900 via-slate-900 to-neutral-900 p-3 sm:p-3.5 rounded-xl text-white shadow-sm border border-neutral-800 space-y-2 shrink-0">
                     <div className="flex justify-between items-start">
                        <div>
                           <span className="text-[10px] sm:text-xs text-neutral-400 font-bold uppercase tracking-wider font-mono">Total Selected Amount To Pay</span>
                           <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-2xl sm:text-3xl xl:text-4xl font-black tracking-tight text-emerald-400 font-mono">
                                 ₹{computedTotalToPay.toLocaleString()}.00
                              </span>
                              <span className="text-xs font-bold text-neutral-400 font-mono">INR</span>
                           </div>
                        </div>
                        <div className="text-right">
                           <span className="text-[10px] sm:text-xs text-neutral-400 font-bold uppercase font-mono">Total Pending Due</span>
                           <p className="text-sm sm:text-base font-black text-amber-300 font-mono">₹{stats.pending.toLocaleString()}</p>
                           <p className="text-[10px] text-neutral-400 mt-0.5">{Object.entries(selectedComponentsMap).filter(([_, s]) => s).length} Component(s) Selected</p>
                        </div>
                     </div>

                     {/* Quick Custom Amount Presets */}
                     <div className="space-y-1 pt-1.5 border-t border-white/10">
                        <div className="flex justify-between items-center text-[10px] sm:text-xs font-bold text-neutral-300 uppercase font-mono">
                           <span className="flex items-center gap-1">
                              <SlidersHorizontal className="w-3 h-3 text-indigo-300" />
                              Quick Amount Presets
                           </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                           <button
                              type="button"
                              onClick={() => handlePresetPercentage(100)}
                              className="px-2.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded text-xs font-bold font-mono transition-all cursor-pointer"
                           >
                              100% Full Due
                           </button>
                           <button
                              type="button"
                              onClick={() => handlePresetPercentage(50)}
                              className="px-2.5 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded text-xs font-bold font-mono transition-all cursor-pointer"
                           >
                              50% Half
                           </button>
                           <button
                              type="button"
                              onClick={() => handlePresetPercentage(25)}
                              className="px-2.5 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded text-xs font-bold font-mono transition-all cursor-pointer"
                           >
                              25%
                           </button>
                           {stats.pending >= 5000 && (
                              <button
                                 type="button"
                                 onClick={() => handleSetGlobalCustomAmount(5000)}
                                 className="px-2.5 py-0.5 bg-white/10 hover:bg-white/20 text-neutral-200 border border-white/20 rounded text-xs font-bold font-mono transition-all cursor-pointer"
                              >
                                 ₹5,000
                              </button>
                           )}
                           {stats.pending >= 2000 && (
                              <button
                                 type="button"
                                 onClick={() => handleSetGlobalCustomAmount(2000)}
                                 className="px-2.5 py-0.5 bg-white/10 hover:bg-white/20 text-neutral-200 border border-white/20 rounded text-xs font-bold font-mono transition-all cursor-pointer"
                              >
                                 ₹2,000
                              </button>
                           )}
                        </div>
                     </div>

                     {/* Global Custom Amount Input */}
                     <div className="pt-1.5 border-t border-white/10 flex items-center justify-between gap-2">
                        <div className="relative flex-1">
                           <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold font-mono text-xs">₹</span>
                           <input 
                              type="text" 
                              placeholder="Type custom amount..."
                              value={globalCustomInput}
                              onChange={(e) => {
                                 const raw = e.target.value.replace(/\D/g, '');
                                 const num = Number(raw) || 0;
                                 if (num > stats.pending) {
                                    handleSetGlobalCustomAmount(stats.pending);
                                 } else {
                                    handleSetGlobalCustomAmount(num);
                                 }
                              }}
                              className="w-full pl-6 pr-2 py-1 bg-neutral-800/90 border border-neutral-700 focus:border-emerald-400 rounded-lg text-white font-mono font-bold text-xs outline-none"
                           />
                        </div>
                        <button 
                           type="button"
                           onClick={() => {
                              const allSelected = unpaidComponents.every(c => selectedComponentsMap[c.id]);
                              const nextSelection: Record<string, boolean> = {};
                              const nextAmounts: Record<string, string> = {};
                              unpaidComponents.forEach(c => { 
                                 const paid = Number(effectivePaidComponents[c.id] || 0);
                                 const remainingNum = Math.max(0, c.amount - paid);
                                 nextSelection[c.id] = !allSelected; 
                                 nextAmounts[c.id] = !allSelected ? remainingNum.toString() : '0';
                              });
                              setSelectedComponentsMap(nextSelection);
                              setCustomAmounts(nextAmounts);
                           }}
                           className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-indigo-300 hover:text-white rounded-lg border border-neutral-700 text-[11px] font-bold uppercase font-mono transition-all cursor-pointer shrink-0"
                        >
                           {unpaidComponents.every(c => selectedComponentsMap[c.id]) ? "Deselect All" : "Select All"}
                        </button>
                     </div>
                  </div>

                  {/* Fee Components & Custom Allocation List */}
                  <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-2.5 sm:p-3 space-y-1.5 flex-1 flex flex-col justify-between overflow-hidden">
                     <div className="flex justify-between items-center shrink-0">
                        <span className="text-xs font-extrabold text-neutral-800 uppercase tracking-wider font-mono">
                           Fee Components & Dues Allocation
                        </span>
                        <span className="text-[11px] text-neutral-500 font-semibold font-mono">
                           Session {academicYear}
                        </span>
                     </div>

                     <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
                        {unpaidComponents.map(c => {
                           const paid = Number(effectivePaidComponents[c.id] || 0);
                           const remainingNum = Math.max(0, c.amount - paid);
                           const isChecked = !!selectedComponentsMap[c.id];
                           const enteredAmt = customAmounts[c.id] ?? remainingNum.toString();

                           return (
                              <div 
                                 key={c.id} 
                                 className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                                    isChecked 
                                       ? 'bg-white border-blue-400 shadow-2xs ring-1 ring-blue-200' 
                                       : 'bg-neutral-100/70 border-neutral-200 opacity-70'
                                 }`}
                              >
                                 <div className="flex items-center gap-2 min-w-0">
                                    <input 
                                       type="checkbox" 
                                       checked={isChecked} 
                                       onChange={() => {
                                          const nextChecked = !isChecked;
                                          setSelectedComponentsMap(prev => ({ ...prev, [c.id]: nextChecked }));
                                          if (nextChecked && (!customAmounts[c.id] || Number(customAmounts[c.id]) <= 0)) {
                                             setCustomAmounts(prev => ({ ...prev, [c.id]: remainingNum.toString() }));
                                          }
                                       }} 
                                       className="rounded accent-blue-600 w-3.5 h-3.5 cursor-pointer shrink-0"
                                    />
                                    <div className="truncate">
                                       <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-black text-neutral-900 uppercase truncate">{c.label}</span>
                                          <span className="text-[10px] bg-neutral-200 text-neutral-700 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                                             Due: ₹{remainingNum.toLocaleString()}
                                          </span>
                                       </div>
                                       <p className="text-[10px] text-neutral-500 font-medium truncate">
                                          Total: ₹{c.amount.toLocaleString()} • Paid: ₹{paid.toLocaleString()}
                                       </p>
                                    </div>
                                 </div>

                                 {/* Custom Editable Amount for this Component */}
                                 <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-xs font-bold text-neutral-600 font-mono">₹</span>
                                    <input 
                                       type="text" 
                                       value={enteredAmt}
                                       onChange={(e) => handleComponentAmountChange(c.id, e.target.value)}
                                       placeholder={remainingNum.toString()}
                                       disabled={!isChecked}
                                       className={`w-20 sm:w-24 px-2 py-0.5 border rounded font-mono font-bold text-xs outline-none transition-all ${
                                          isChecked 
                                             ? 'bg-white border-blue-400 text-blue-950 focus:ring-1 focus:ring-blue-300' 
                                             : 'bg-neutral-100 border-neutral-300 text-neutral-400 cursor-not-allowed'
                                       }`}
                                    />
                                    <button
                                       type="button"
                                       onClick={() => handleComponentAmountChange(c.id, remainingNum.toString())}
                                       disabled={!isChecked}
                                       className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer disabled:opacity-40"
                                       title="Pay full due"
                                    >
                                       Full
                                    </button>
                                 </div>
                              </div>
                           );
                        })}
                     </div>

                     {/* Verified Student Contact Pill */}
                     <div className="pt-1.5 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-600 font-mono font-medium shrink-0">
                        <span className="truncate">📧 {(student as any).email || 'student-finance@stantonys.edu'}</span>
                        <span className="shrink-0">📞 {(student as any).phone || (student as any).parentPhone || '+91 94400 00000'}</span>
                     </div>
                  </div>
               </div>
               <div className="lg:col-span-7 flex flex-col gap-2.5 justify-between h-full overflow-hidden">
                  
                  {/* PRIORITY SECTION: RAZORPAY PAYMENT GATEWAY */}
                  <div className="border-2 border-blue-600 rounded-xl bg-white shadow-2xs overflow-hidden flex flex-col justify-between flex-1">
                     
                     {/* Razorpay Banner Header - Compact */}
                     <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-3.5 sm:px-4 py-2 sm:py-2.5 text-white flex justify-between items-center gap-2 shrink-0">
                        <div className="flex items-center gap-2.5">
                           <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-xs p-1 shrink-0">
                              <img src="https://cdn.razorpay.com/logos/BUV9U383pS9pZ7_medium.png" alt="Razorpay Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                           </div>
                           <div>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs sm:text-sm font-black uppercase tracking-wide font-sans">Razorpay Payment Gateway</span>
                                 <span className="px-1.5 py-0.2 bg-emerald-400 text-neutral-950 text-[9px] font-black uppercase rounded tracking-wider">PRIMARY GATEWAY</span>
                              </div>
                              <p className="text-[10px] text-blue-100 font-semibold">
                                 PCI-DSS Level 1 Encrypted • Direct Bank Handshake • Zero Surcharges
                              </p>
                           </div>
                        </div>
                        <div className="flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-lg border border-white/20 text-[10px] sm:text-xs font-mono font-bold shrink-0">
                           <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                           <span>Instant Auto-Settlement</span>
                        </div>
                     </div>

                     <div className="p-3 sm:p-3.5 space-y-2.5 flex-1 flex flex-col justify-between overflow-hidden">
                        
                        {/* Payment Options Mode Tabs */}
                        <div className="space-y-1.5 shrink-0">
                           <p className="text-[11px] font-extrabold text-neutral-700 uppercase tracking-wider font-mono">
                              Select Razorpay Payment Mode
                           </p>

                           <div className="grid grid-cols-3 gap-2">
                              {[
                                 { id: 'upi', label: 'UPI / GPay / PhonePe', icon: Smartphone, subtitle: 'GPay, Paytm, BHIM, QR' },
                                 { id: 'card', label: 'Credit & Debit Cards', icon: CreditCard, subtitle: 'Visa, Mastercard, RuPay' },
                                 { id: 'netbanking', label: 'NetBanking Portal', icon: Building, subtitle: 'HDFC, ICICI, SBI, Axis' }
                              ].map(method => (
                                 <button
                                    key={method.id}
                                    type="button"
                                    onClick={() => setPaymentMethod(method.id as any)}
                                    className={`p-2 rounded-lg border text-left transition-all flex items-center gap-2 cursor-pointer ${
                                       paymentMethod === method.id
                                          ? 'border-blue-600 bg-blue-50/80 text-blue-900 shadow-2xs font-bold ring-1 ring-blue-300'
                                          : 'border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100 text-neutral-700'
                                    }`}
                                 >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                       paymentMethod === method.id ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-neutral-600 border border-neutral-200'
                                    }`}>
                                       <method.icon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                       <p className="text-xs font-black uppercase tracking-tight truncate">{method.label}</p>
                                       <p className="text-[9px] text-neutral-500 font-semibold uppercase truncate">{method.subtitle}</p>
                                    </div>
                                 </button>
                              ))}
                           </div>
                        </div>

                        {/* Dynamic Details Area for Selected Method */}
                        <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 flex-1 flex flex-col justify-center overflow-hidden">
                           
                           {paymentMethod === 'upi' && (
                              <div className="space-y-2">
                                 <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                       <div className="w-8 h-8 bg-white rounded-lg border border-neutral-200 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
                                          <Smartphone className="w-4 h-4 animate-pulse" />
                                       </div>
                                       <div>
                                          <h5 className="text-xs font-extrabold text-neutral-900 uppercase">Instant UPI Payment via Razorpay</h5>
                                          <p className="text-[10px] text-neutral-600 font-medium">Supports Google Pay, PhonePe, Paytm, BHIM & Dynamic QR code scanning.</p>
                                       </div>
                                    </div>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase rounded border border-emerald-200 font-mono shrink-0">
                                       Zero Charges
                                    </span>
                                 </div>

                                 <div className="pt-1.5 border-t border-neutral-200 flex items-center gap-2">
                                    <label className="text-[11px] font-bold text-neutral-700 uppercase font-mono shrink-0">
                                       UPI ID:
                                    </label>
                                    <input 
                                       type="text" 
                                       placeholder="e.g. yourname@okhdfcbank or 9876543210@paytm (Optional)"
                                       value={upiId}
                                       onChange={(e) => setUpiId(e.target.value)}
                                       className="w-full px-3 py-1.5 bg-white border border-neutral-300 focus:border-blue-600 rounded-lg text-xs font-mono font-bold text-neutral-800 outline-none"
                                    />
                                 </div>
                              </div>
                           )}

                           {paymentMethod === 'card' && (
                              <div className="space-y-2">
                                 <div className="flex justify-between items-center text-xs font-bold text-neutral-700">
                                    <span className="flex items-center gap-1.5 font-mono uppercase tracking-wide text-[11px]">
                                       <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                                       Enter Card Details
                                    </span>
                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded border font-mono ${cardBrand.bg}`}>
                                       {cardBrand.name !== 'Card' ? `${cardBrand.name} DETECTED` : 'VISA • MASTERCARD • RUPAY'}
                                    </span>
                                 </div>

                                 {/* Card Inputs Form */}
                                 <div className="space-y-2">
                                    {/* Card Number */}
                                    <div className="relative">
                                       <input 
                                          type="text" 
                                          placeholder="Card Number (1234  5678  9012  3456)" 
                                          className="w-full pl-3 pr-20 py-1.5 bg-white border border-neutral-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-200 rounded-lg outline-none font-mono font-bold text-neutral-800 text-xs tracking-wider"
                                          value={cardNumber}
                                          onChange={(e) => {
                                             const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                                             const formatted = val.replace(/(\d{4})(?=\d)/g, '$1  ');
                                             setCardNumber(formatted);
                                          }}
                                          maxLength={22}
                                       />
                                       <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded font-mono ${cardBrand.bg}`}>
                                             {cardBrand.name}
                                          </span>
                                       </div>
                                    </div>

                                    {/* Cardholder Name, Expiry & CVV */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                       <div className="sm:col-span-1">
                                          <input 
                                             type="text" 
                                             placeholder="Cardholder Name" 
                                             className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-200 rounded-lg outline-none font-bold text-neutral-800 text-xs"
                                             value={cardHolderName}
                                             onChange={(e) => setCardHolderName(e.target.value)}
                                          />
                                       </div>
                                       <div>
                                          <input 
                                             type="text" 
                                             placeholder="MM / YY" 
                                             className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-200 rounded-lg outline-none text-center font-mono font-bold text-neutral-800 text-xs tracking-wider"
                                             value={cardExpiry}
                                             onChange={(e) => {
                                                let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                                if (val.length >= 2) {
                                                   const month = parseInt(val.slice(0, 2), 10);
                                                   if (month > 12) val = '12' + val.slice(2);
                                                   if (month === 0) val = '01' + val.slice(2);
                                                   val = val.slice(0, 2) + '/' + val.slice(2);
                                                }
                                                setCardExpiry(val);
                                             }}
                                             maxLength={5}
                                          />
                                       </div>
                                       <div className="relative">
                                          <input 
                                             type={showCvv ? "text" : "password"} 
                                             placeholder="CVV" 
                                             className="w-full pl-2.5 pr-7 py-1.5 bg-white border border-neutral-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-200 rounded-lg outline-none text-center font-mono font-bold text-neutral-800 text-xs tracking-widest"
                                             value={cardCvv}
                                             onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                                setCardCvv(val);
                                             }}
                                             maxLength={4}
                                          />
                                          <button 
                                             type="button" 
                                             onClick={() => setShowCvv(!showCvv)}
                                             className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5"
                                          >
                                             {showCvv ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                          </button>
                                       </div>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                       <input 
                                          type="checkbox" 
                                          id="saveCardCheck"
                                          checked={saveCardDetails}
                                          onChange={(e) => setSaveCardDetails(e.target.checked)}
                                          className="w-3 h-3 accent-blue-600 rounded cursor-pointer"
                                       />
                                       <label htmlFor="saveCardCheck" className="text-[10px] text-neutral-600 font-semibold cursor-pointer">
                                          Securely remember card details for faster fee payments
                                       </label>
                                    </div>
                                 </div>
                              </div>
                           )}

                           {paymentMethod === 'netbanking' && (
                              <div className="space-y-1.5">
                                 <label className="text-[11px] font-bold text-neutral-800 uppercase block font-mono">Select NetBanking Institution</label>
                                 <select 
                                    value={selectedBank}
                                    onChange={(e) => setSelectedBank(e.target.value)}
                                    className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg font-bold text-xs outline-none cursor-pointer text-neutral-800 focus:border-blue-600"
                                 >
                                    <option value="HDFC Bank Corporate / Personal NetBanking">HDFC Bank Corporate / Personal NetBanking</option>
                                    <option value="State Bank of India (SBI)">State Bank of India (SBI)</option>
                                    <option value="ICICI Bank Retail & Corporate">ICICI Bank Retail & Corporate</option>
                                    <option value="Axis Bank">Axis Bank</option>
                                    <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                                    <option value="Punjab National Bank (PNB)">Punjab National Bank (PNB)</option>
                                    <option value="Bank of Baroda">Bank of Baroda</option>
                                    <option value="Canara Bank">Canara Bank</option>
                                    <option value="Union Bank of India">Union Bank of India</option>
                                 </select>
                              </div>
                           )}
                        </div>

                        {/* Alternative Custom Registrar Payment Link (If configured in settings) */}
                        {settings?.razorpayPaymentLink && (
                           <div className="p-2 border border-indigo-200 rounded-lg bg-indigo-50/50 flex justify-between items-center gap-2 shrink-0">
                              <span className="text-[11px] font-extrabold text-indigo-900 uppercase">Direct School Hosted Payment Portal</span>
                              <a 
                                 href={settings.razorpayPaymentLink} 
                                 target="_blank" 
                                 rel="noopener noreferrer" 
                                 className="px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded uppercase tracking-wider font-mono shrink-0"
                              >
                                 Open Link &rarr;
                              </a>
                           </div>
                        )}

                     </div>
                  </div>

                  {/* Authorization & Primary Pay CTA - Compact and always in view */}
                  <div className="space-y-1.5 shrink-0">
                     {/* Compliance Authorization Checkbox */}
                     <div className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center gap-2">
                        <input 
                           type="checkbox" 
                           id="rzp-compliance-check" 
                           className="w-3.5 h-3.5 accent-blue-600 rounded text-white cursor-pointer shrink-0" 
                           defaultChecked
                        />
                        <label htmlFor="rzp-compliance-check" className="text-[11px] sm:text-xs leading-tight text-neutral-700 font-medium cursor-pointer select-none truncate">
                           I authorize fee payment of <span className="font-extrabold text-neutral-900 font-mono">₹{computedTotalToPay.toLocaleString()}</span> via <span className="font-extrabold text-blue-700">Razorpay</span> for Student <span className="font-extrabold text-neutral-900">{student.name}</span>.
                        </label>
                     </div>

                     {/* PRIMARY CHECKOUT ACTION BUTTON */}
                     <button 
                        onClick={handleRazorpayPayment}
                        disabled={isProcessing || computedTotalToPay <= 0}
                        className="w-full py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-black uppercase tracking-wider text-xs sm:text-sm shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                     >
                        {isProcessing ? (
                           <>
                              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                              <span>Connecting to Razorpay Gateway...</span>
                           </>
                        ) : (
                           <>
                              <ShieldCheck className="w-5 h-5 text-white" />
                              <span>Proceed to Pay ₹{computedTotalToPay.toLocaleString()} via Razorpay</span>
                           </>
                        )}
                     </button>

                     {/* Security Compliance Badges */}
                     <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-neutral-500 font-mono font-semibold">
                        <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-blue-600" /> PCI-DSS Level 1 Secure</span>
                        <span>•</span>
                        <span>ISO 27001 Certified</span>
                        <span>•</span>
                        <span className="font-bold text-blue-600">Powered by Razorpay</span>
                     </div>
                  </div>

               </div>

            </div>
          </motion.div>
        </div>
      )}

      {paymentStep === 'confirm' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[120] flex items-center justify-center p-3 sm:p-6 w-full h-full overflow-hidden select-none animate-in fade-in duration-300">
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-white rounded-3xl w-full max-w-xl max-h-[96vh] shadow-[0_25px_70px_rgba(0,0,0,0.35)] border border-slate-100 p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between"
           >
              <div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-emerald-500/5 rounded-full blur-[60px] sm:blur-[100px] -mr-24 sm:-mr-32 -mt-24 sm:-mt-32 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 sm:w-64 sm:h-64 bg-indigo-500/5 rounded-full blur-[60px] sm:blur-[100px] -ml-24 sm:-ml-32 -mb-24 sm:-mb-32 pointer-events-none" />

              <div className="text-center space-y-2 shrink-0">
                 <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-500/15 relative group">
                    <div className="absolute inset-0 bg-emerald-500/10 rounded-2xl animate-ping opacity-30 pointer-events-none" />
                    <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                 </div>

                 <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight leading-none italic text-center mt-3">
                   Settlement Verified
                 </h3>
                 <p className="text-slate-600 font-medium text-xs sm:text-sm text-center max-w-lg mx-auto leading-normal">
                   The financial credit for <span className="text-slate-900 font-black bg-slate-100 px-2.5 py-0.5 rounded-lg text-xs sm:text-sm">{confirmedPaymentInfo?.componentLabel || selectedComponent?.label || 'Term 1 Academic Fee'}</span> has been successfully injected into the school billing ledger.
                 </p>
              </div>
              
              <div className="my-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 shadow-inner relative shrink-0">
                 <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-200">
                    <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Transaction Registry</span>
                    <span className="text-xs sm:text-sm font-mono font-black text-slate-900 uppercase">{confirmedPaymentInfo?.transactionId || `TX_${Date.now().toString().slice(-8)}`}</span>
                 </div>
                 {confirmedPaymentInfo?.amount && (
                   <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-200">
                      <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Settled Amount</span>
                      <span className="text-xs sm:text-sm font-mono font-black text-emerald-600 font-bold">₹{confirmedPaymentInfo.amount.toLocaleString('en-IN')}.00</span>
                   </div>
                 )}
                 <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-200">
                    <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Student Name</span>
                    <span className="text-xs font-bold text-slate-800 uppercase">{student.name}</span>
                 </div>
                 <div className="flex justify-between items-center py-1">
                    <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Verification Authority</span>
                    <span className="text-xs sm:text-sm font-black text-emerald-600 uppercase italic">SYSTEM_AUDIT_PASS</span>
                 </div>
                 <div className="pt-1.5 border-t border-slate-200 flex items-center gap-1.5 justify-center">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[9px] sm:text-[10px] font-black text-emerald-600 uppercase tracking-widest">Permanent Record Created</p>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3 shrink-0">
                 <button 
                  onClick={() => {
                    setActiveTab('overview');
                    setPaymentStep('select');
                    setSelectedComponent(null);
                    setConfirmedPaymentInfo(null);
                  }}
                  className="py-3 border-2 border-slate-200 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
                 >
                   Dismiss
                 </button>
                 <button 
                  onClick={() => {
                    const latest = payments.find(p => p.studentId === student.uid && (!p.reference || !p.reference.startsWith('EXP')));
                    if (latest) printReceipt(latest);
                    setPaymentStep('select');
                    setSelectedComponent(null);
                    setConfirmedPaymentInfo(null);
                  }}
                  className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-slate-900/25 transition-all flex items-center justify-center gap-2 group active:scale-95 cursor-pointer"
                 >
                   <Printer className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                   <span>Generate Mini-Statement</span>
                 </button>
              </div>
            </motion.div>
         </div>
       )}

      {/* RAZORPAY COLLECTNOW EMBEDDED CHECKOUT MODAL */}
      {showCollectNowModal && collectNowOrder && (
        <RazorpayCollectNowModal
          isOpen={showCollectNowModal}
          onClose={() => {
            setShowCollectNowModal(false);
            setIsProcessing(false);
          }}
          orderData={collectNowOrder}
          studentId={student.uid || (student as any).id || 'unknown'}
          studentName={student.name || 'Student'}
          academicYear={academicYear}
          componentsMap={collectNowComponentsMap}
          totalAmount={collectNowOrder.amount / 100}
          onPaymentSuccess={handleCollectNowSuccess}
        />
      )}
    </div>
  );
};

export default StudentPortalFees;
