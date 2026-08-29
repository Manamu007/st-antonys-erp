import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ShieldCheck, 
  CreditCard, 
  Smartphone, 
  Building2, 
  QrCode, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Copy, 
  Check, 
  Printer, 
  Receipt,
  Lock,
  ArrowRight,
  RefreshCw,
  Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export interface CollectNowOrderData {
  id: string; // razorpay_order_id
  amount: number; // in paise or INR
  currency?: string;
  receipt?: string;
  isSandbox?: boolean;
  merchantName?: string;
  mid?: string;
  tid?: string;
  checkoutMode?: string;
  notes?: Record<string, any>;
}

export interface CollectNowPaymentSuccessResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  merchantName: string;
  mid: string;
  tid: string;
  amount: number;
  componentsMap: Record<string, number>;
  status: string;
  verifiedAt: string;
}

interface RazorpayCollectNowModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderData: CollectNowOrderData;
  studentId: string;
  studentName: string;
  admissionNumber?: string;
  academicYear: string;
  componentsMap: Record<string, number>;
  totalAmount: number;
  parentWhatsApp?: string;
  onPaymentSuccess: (result: CollectNowPaymentSuccessResult) => Promise<void> | void;
  merchantConfig?: {
    merchantName?: string;
    mid?: string;
    tid?: string;
    keyId?: string;
  };
}

export const RazorpayCollectNowModal: React.FC<RazorpayCollectNowModalProps> = ({
  isOpen,
  onClose,
  orderData,
  studentId,
  studentName,
  admissionNumber,
  academicYear,
  componentsMap,
  totalAmount,
  parentWhatsApp,
  onPaymentSuccess,
  merchantConfig
}) => {
  // Merchant details resolution
  const merchantName = merchantConfig?.merchantName || orderData.merchantName || orderData.notes?.merchant_name || "ST. ANTONY'S HIGH SCHOOL";
  const mid = merchantConfig?.mid || orderData.mid || orderData.notes?.mid || "MID_ST_ANTONYS_01";
  const tid = merchantConfig?.tid || orderData.tid || orderData.notes?.tid || "TID_FEE_COLLECT_01";
  const orderId = orderData.id;

  // Tabs & interactive states
  const [activeTab, setActiveTab] = useState<'upi_qr' | 'upi_collect' | 'card' | 'netbanking' | 'pos_terminal'>('upi_qr');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(2); // 1 is order creation, starts at 2
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states
  const [upiId, setUpiId] = useState(parentWhatsApp ? `${parentWhatsApp.replace(/[^0-9]/g, '')}@okaxis` : '');
  const [selectedUpiApp, setSelectedUpiApp] = useState<'gpay' | 'phonepe' | 'paytm' | 'cred' | 'bhim'>('gpay');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardHolder, setCardHolder] = useState(studentName || '');
  const [selectedBank, setSelectedBank] = useState('HDFC');
  const [qrTimer, setQrTimer] = useState(300); // 5 min countdown
  const [otpValue, setOtpValue] = useState('');
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [tempPaymentId, setTempPaymentId] = useState('');

  // Successful payment state
  const [successData, setSuccessData] = useState<CollectNowPaymentSuccessResult | null>(null);

  // Countdown timer for dynamic QR code
  useEffect(() => {
    if (!isOpen || successData || activeTab !== 'upi_qr') return;
    const interval = setInterval(() => {
      setQrTimer((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, successData, activeTab]);

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    toast.success(`Copied ${fieldKey}`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const detectedCardBrand = useMemo(() => {
    const clean = cardNumber.replace(/\D/g, '');
    if (/^4/.test(clean)) return { name: 'Visa', badge: 'bg-blue-100 text-blue-800' };
    if (/^(5[1-5]|2[2-7])/.test(clean)) return { name: 'Mastercard', badge: 'bg-orange-100 text-orange-800' };
    if (/^(60|65|81|82)/.test(clean)) return { name: 'RuPay', badge: 'bg-emerald-100 text-emerald-800' };
    return { name: 'Card', badge: 'bg-neutral-100 text-neutral-700' };
  }, [cardNumber]);

  // Handle Step 2 Payment Logging & Subsequent Verification
  const executeCollectNowPayment = async (generatedPaymentId: string, customSig?: string) => {
    setIsProcessing(true);
    setCurrentStep(2);

    try {
      // 1. STEP 2 LOGGING: Log razorpay_order_id and razorpay_payment_id immediately
      console.log(`[CollectNow] Initiating Step 2 Logging: Order ${orderId} | Payment ${generatedPaymentId}`);
      
      const step2Res = await fetch('/api/fees/razorpay/step2-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: orderId,
          razorpay_payment_id: generatedPaymentId,
          studentId,
          academicYear,
          amount: totalAmount,
          componentsMap,
          status: 'step2_authorized'
        })
      });

      if (!step2Res.ok) {
        console.warn("[CollectNow] Step 2 logging returned non-ok status, proceeding to verification.");
      } else {
        const step2Data = await step2Res.json();
        console.log("[CollectNow] Step 2 Logged Successfully:", step2Data);
      }

      // 2. STEP 3: Cryptographic Signature Verification on Server
      setCurrentStep(3);
      const signature = customSig || 'rzparp_mock_sig';

      const verifyRes = await fetch('/api/fees/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: orderId,
          razorpay_payment_id: generatedPaymentId,
          razorpay_signature: signature,
          studentId,
          academicYear,
          amount: totalAmount,
          componentsMap,
          merchantName,
          mid,
          tid
        })
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || 'Payment signature verification failed');
      }

      const verifyData = await verifyRes.json();

      // 3. STEP 4: Capture & Display Step 4 Merchant Details
      setCurrentStep(4);
      const paymentResult: CollectNowPaymentSuccessResult = {
        razorpay_order_id: orderId,
        razorpay_payment_id: generatedPaymentId,
        razorpay_signature: signature,
        merchantName: verifyData.merchantName || merchantName,
        mid: verifyData.mid || mid,
        tid: verifyData.tid || tid,
        amount: totalAmount,
        componentsMap,
        status: 'verified_success',
        verifiedAt: verifyData.verifiedAt || new Date().toISOString()
      };

      setSuccessData(paymentResult);
      toast.success('Payment Verified & Recorded Successfully!');
      
      // Notify parent callback
      await onPaymentSuccess(paymentResult);

    } catch (err: any) {
      console.error("[CollectNow] Payment execution error:", err);
      toast.error(err.message || 'Payment processing failed');
    } finally {
      setIsProcessing(false);
      setShowOtpScreen(false);
    }
  };

  // Submit handlers for various tabs
  const handleUpiQrSimulate = () => {
    const fakePayId = `pay_qr_${Math.floor(10000000 + Math.random() * 90000000)}`;
    executeCollectNowPayment(fakePayId);
  };

  const handleUpiCollectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiId || !upiId.includes('@')) {
      toast.error('Please enter a valid UPI ID (e.g. name@okaxis)');
      return;
    }
    const fakePayId = `pay_upi_${Math.floor(10000000 + Math.random() * 90000000)}`;
    executeCollectNowPayment(fakePayId);
  };

  const handleCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCard = cardNumber.replace(/\D/g, '');
    if (cleanCard.length < 15) {
      toast.error('Please enter a valid 15 or 16-digit card number');
      return;
    }
    if (!cardExpiry || !/^\d{2}\/\d{2}$/.test(cardExpiry)) {
      toast.error('Please enter valid Expiry Date (MM/YY)');
      return;
    }
    if (!cardCvv || cardCvv.length < 3) {
      toast.error('Please enter valid CVV');
      return;
    }

    const fakePayId = `pay_card_${Math.floor(10000000 + Math.random() * 90000000)}`;
    setTempPaymentId(fakePayId);
    setShowOtpScreen(true);
  };

  const handleOtpConfirm = () => {
    if (!otpValue || otpValue.length < 4) {
      toast.error('Please enter 4-digit OTP (e.g. 1234)');
      return;
    }
    executeCollectNowPayment(tempPaymentId || `pay_card_${Date.now()}`);
  };

  const handleNetBankingSubmit = () => {
    const fakePayId = `pay_nb_${Math.floor(10000000 + Math.random() * 90000000)}`;
    executeCollectNowPayment(fakePayId);
  };

  const handlePosTerminalSubmit = () => {
    const fakePayId = `pay_pos_${Math.floor(10000000 + Math.random() * 90000000)}`;
    executeCollectNowPayment(fakePayId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="bg-white rounded-3xl shadow-2xl border border-neutral-200 w-full max-w-2xl overflow-hidden flex flex-col my-auto"
      >
        {/* Top CollectNow Merchant & Security Header */}
        <div className="bg-gradient-to-r from-neutral-900 via-indigo-950 to-neutral-900 text-white p-5 px-6 relative flex flex-col gap-3">
          <button 
            onClick={onClose}
            disabled={isProcessing}
            className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-white flex items-center gap-2 font-sans">
                  {merchantName}
                  <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500 text-white px-2 py-0.5 rounded-full font-mono">
                    CollectNow Hosted
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-400 font-mono flex items-center gap-2">
                  <span>MID: <strong className="text-neutral-200">{mid}</strong></span>
                  <span className="text-neutral-600">|</span>
                  <span>TID: <strong className="text-neutral-200">{tid}</strong></span>
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block font-mono">Payable Total</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* CollectNow 4-Step Progress Ribbon */}
          <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-white/10 font-mono text-[9px]">
            <div className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">1. Order Gen</span>
            </div>
            <div className={`flex items-center gap-1 ${currentStep >= 2 ? 'text-indigo-400 font-bold' : 'text-neutral-500'}`}>
              {currentStep > 2 ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[7px]">2</div>}
              <span className="truncate">2. Step 2 Log</span>
            </div>
            <div className={`flex items-center gap-1 ${currentStep >= 3 ? 'text-indigo-400 font-bold' : 'text-neutral-500'}`}>
              {currentStep > 3 ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[7px]">3</div>}
              <span className="truncate">3. Signature</span>
            </div>
            <div className={`flex items-center gap-1 ${currentStep >= 4 ? 'text-emerald-400 font-bold' : 'text-neutral-500'}`}>
              {currentStep >= 4 ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[7px]">4</div>}
              <span className="truncate">4. Step 4 MID/TID</span>
            </div>
          </div>
        </div>

        {/* Order & Student Summary Sub-banner */}
        <div className="bg-neutral-50 border-b border-neutral-200 px-6 py-2.5 flex flex-wrap items-center justify-between text-xs text-neutral-600 gap-2 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400 uppercase text-[10px] font-bold">Student:</span>
            <span className="font-bold text-neutral-800">{studentName}</span>
            {admissionNumber && (
              <span className="text-neutral-500 text-[10px]">({admissionNumber})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-400 uppercase text-[10px] font-bold">Order ID:</span>
            <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px]">
              {orderId}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(orderId, 'Order ID')}
              className="text-neutral-400 hover:text-neutral-700 p-0.5"
              title="Copy Order ID"
            >
              {copiedField === 'Order ID' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6">
          {successData ? (
            /* SUCCESS CONFIRMATION & STEP 4 AUDIT VIEW */
            <div className="space-y-5 animate-fadeIn">
              <div className="text-center py-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="text-base font-black text-emerald-900 uppercase tracking-tight font-sans">
                  Razorpay CollectNow Payment Verified
                </h4>
                <p className="text-xs text-emerald-700 font-mono">
                  Transaction successfully recorded in ERP Database with Step 4 Merchant Audit Tags
                </p>
              </div>

              {/* Transaction Audit Sheet */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-3 font-mono text-xs">
                <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400 pb-1 border-b border-neutral-200">
                  Step 2 & Step 4 Audit Reconciliation Details
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-700">
                  <div>
                    <span className="text-neutral-400 block text-[10px] font-bold uppercase">Payment ID (Step 2)</span>
                    <div className="flex items-center gap-1 font-bold text-indigo-700">
                      <span>{successData.razorpay_payment_id}</span>
                      <button onClick={() => copyToClipboard(successData.razorpay_payment_id, 'Payment ID')} className="p-0.5 text-neutral-400 hover:text-neutral-700">
                        {copiedField === 'Payment ID' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] font-bold uppercase">Order ID (Step 2)</span>
                    <div className="flex items-center gap-1 font-bold text-indigo-700">
                      <span>{successData.razorpay_order_id}</span>
                      <button onClick={() => copyToClipboard(successData.razorpay_order_id, 'Order ID')} className="p-0.5 text-neutral-400 hover:text-neutral-700">
                        {copiedField === 'Order ID' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] font-bold uppercase">Merchant Name (Step 4)</span>
                    <span className="font-bold text-neutral-800">{successData.merchantName}</span>
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] font-bold uppercase">MID & TID (Step 4)</span>
                    <span className="font-bold text-neutral-800">{successData.mid} | {successData.tid}</span>
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] font-bold uppercase">Settled Amount</span>
                    <span className="font-black text-emerald-700 text-sm">₹{successData.amount.toLocaleString('en-IN')}</span>
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] font-bold uppercase">Status</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] uppercase">
                      <CheckCircle2 className="w-3 h-3" /> VERIFIED SUCCESS
                    </span>
                  </div>
                </div>

                {/* Components settled breakdown */}
                <div className="pt-2 border-t border-neutral-200">
                  <span className="text-neutral-400 block text-[10px] font-bold uppercase mb-1">Settled Fee Components</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(successData.componentsMap).map(([cId, amt]) => (
                      <span key={cId} className="px-2 py-0.5 bg-white border border-neutral-200 rounded text-[10px] font-bold text-neutral-700">
                        {cId.toUpperCase()}: ₹{Number(amt).toLocaleString('en-IN')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-neutral-800 cursor-pointer transition-colors"
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : showOtpScreen ? (
            /* 3D SECURE / OTP VERIFICATION SCREEN */
            <div className="space-y-5 text-center py-4">
              <div className="w-12 h-12 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-neutral-900 uppercase tracking-tight">
                  Bank 3D Secure Verification
                </h4>
                <p className="text-xs text-neutral-500 mt-1 font-mono">
                  Enter authentication code sent by your card issuer to authorize ₹{totalAmount.toLocaleString('en-IN')}
                </p>
              </div>

              <div className="max-w-xs mx-auto space-y-3">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter OTP (e.g. 123456)"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-widest text-lg font-mono font-bold px-4 py-3 rounded-xl border border-neutral-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
                  autoFocus
                />
                <p className="text-[10px] text-neutral-400 italic">Demo/Test Mode: Enter any 4-6 digit code to confirm.</p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOtpScreen(false)}
                  disabled={isProcessing}
                  className="px-4 py-2.5 border border-neutral-200 text-neutral-600 rounded-xl text-xs font-bold uppercase hover:bg-neutral-100 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleOtpConfirm}
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Verify & Authorize
                </button>
              </div>
            </div>
          ) : (
            /* EMBEDDED / HOSTED CHECKOUT TABS */
            <div className="space-y-4">
              {/* Payment Method Selector Pills */}
              <div className="flex flex-wrap gap-1.5 p-1 bg-neutral-100 rounded-2xl border border-neutral-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('upi_qr')}
                  className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'upi_qr'
                      ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  Dynamic QR
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('upi_collect')}
                  className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'upi_collect'
                      ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  UPI Collect
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('card')}
                  className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'card'
                      ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  Debit/Credit Card
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('netbanking')}
                  className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'netbanking'
                      ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-amber-600" />
                  NetBanking
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('pos_terminal')}
                  className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'pos_terminal'
                      ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Terminal className="w-4 h-4 text-purple-600" />
                  POS Terminal
                </button>
              </div>

              {/* Tab 1: Dynamic UPI QR Code */}
              {activeTab === 'upi_qr' && (
                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl">
                  <div className="flex flex-col items-center bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs shrink-0">
                    {/* Simulated SVG QR Code */}
                    <div className="w-40 h-40 bg-white p-2 rounded-xl border border-neutral-100 flex flex-col items-center justify-center relative group">
                      <div className="grid grid-cols-6 gap-1 w-full h-full p-1 opacity-80">
                        {Array.from({ length: 36 }).map((_, i) => (
                          <div
                            key={i}
                            className={`rounded-xs ${
                              i % 2 === 0 || i % 7 === 0 || i < 6 || i > 30 || i % 6 === 0 || i % 6 === 5
                                ? 'bg-neutral-900'
                                : 'bg-neutral-200'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="bg-indigo-600 text-white font-mono text-[8px] font-black px-1.5 py-0.5 rounded shadow">
                          UPI
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-mono text-neutral-500 mt-2">
                      <Clock className="w-3 h-3 text-indigo-500" />
                      <span>Expires in {Math.floor(qrTimer / 60)}:{(qrTimer % 60).toString().padStart(2, '0')}</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 text-center sm:text-left">
                    <div>
                      <h4 className="text-sm font-bold text-neutral-900">
                        Scan with Any UPI App
                      </h4>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Open GPay, PhonePe, Paytm, BHIM, or Cred on your mobile phone and point your camera at this QR code.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                      {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Cred'].map(app => (
                        <span key={app} className="px-2 py-0.5 bg-white border border-neutral-200 rounded text-[10px] font-bold text-neutral-700">
                          {app}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleUpiQrSimulate}
                      disabled={isProcessing}
                      className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Confirm Scan / Authorize Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: UPI Collect Request */}
              {activeTab === 'upi_collect' && (
                <form onSubmit={handleUpiCollectSubmit} className="space-y-4 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block font-mono">
                      Virtual Payment Address (VPA / UPI ID)
                    </label>
                    <div className="relative">
                      <Smartphone className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="e.g. 9876543210@okaxis or mobile@upi"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-neutral-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs font-mono font-medium outline-none"
                        required
                      />
                    </div>
                    <p className="text-[10px] text-neutral-400">A Collect request for ₹{totalAmount.toLocaleString('en-IN')} will be pushed to your UPI app.</p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      Send Collect Push
                    </button>
                  </div>
                </form>
              )}

              {/* Tab 3: Debit / Credit Card */}
              {activeTab === 'card' && (
                <form onSubmit={handleCardSubmit} className="space-y-3.5 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block font-mono">
                        Card Number
                      </label>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded font-mono ${detectedCardBrand.badge}`}>
                        {detectedCardBrand.name}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="4000 1234 5678 9010"
                      maxLength={19}
                      value={cardNumber}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
                        const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
                        setCardNumber(formatted);
                      }}
                      className="w-full px-4 py-2.5 bg-white rounded-xl border border-neutral-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs font-mono font-bold tracking-wider outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block font-mono">
                        Expiry (MM/YY)
                      </label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.length >= 3) val = val.slice(0, 2) + '/' + val.slice(2, 4);
                          setCardExpiry(val);
                        }}
                        className="w-full px-4 py-2.5 bg-white rounded-xl border border-neutral-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs font-mono outline-none"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block font-mono">
                        CVV / CVC
                      </label>
                      <input
                        type="password"
                        placeholder="•••"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-4 py-2.5 bg-white rounded-xl border border-neutral-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs font-mono outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block font-mono">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      placeholder="Name on card"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white rounded-xl border border-neutral-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-xs font-mono outline-none"
                      required
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
                    >
                      <Lock className="w-4 h-4" />
                      Proceed to 3D Secure
                    </button>
                  </div>
                </form>
              )}

              {/* Tab 4: NetBanking */}
              {activeTab === 'netbanking' && (
                <div className="space-y-4 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block font-mono">
                      Select Your Bank
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'HDFC', label: 'HDFC Bank' },
                        { id: 'ICICI', label: 'ICICI Bank' },
                        { id: 'SBI', label: 'State Bank of India' },
                        { id: 'AXIS', label: 'Axis Bank' },
                        { id: 'KOTAK', label: 'Kotak Bank' },
                        { id: 'PNB', label: 'Punjab National' }
                      ].map(bank => (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => setSelectedBank(bank.id)}
                          className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                            selectedBank === bank.id
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-900 shadow-xs'
                              : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          {bank.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleNetBankingSubmit}
                      disabled={isProcessing}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                      Pay via {selectedBank} NetBanking
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 5: POS Counter Terminal */}
              {activeTab === 'pos_terminal' && (
                <div className="space-y-4 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-purple-600" />
                      CollectNow Counter / POS Terminal Checkout
                    </div>
                    <p className="text-[11px] text-purple-700 font-mono">
                      Authorize transaction directly at Terminal <strong>{tid}</strong> (Merchant MID: {mid}).
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handlePosTerminalSubmit}
                      disabled={isProcessing}
                      className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                      Authorize at Terminal {tid}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Security Badge */}
        <div className="bg-neutral-100 border-t border-neutral-200 px-6 py-3 flex flex-wrap items-center justify-between text-[10px] text-neutral-500 font-mono gap-2">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-neutral-400" />
            <span>256-Bit SSL Encrypted • Razorpay CollectNow™ Certified</span>
          </div>
          <div>
            <span>ERP Database Synced • Server Verified</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
