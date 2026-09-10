import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Smartphone, 
  Lock, 
  Eye, 
  EyeOff, 
  Clock, 
  RotateCw, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  MessageSquare, 
  ShieldCheck, 
  KeyRound,
  Sparkles,
  QrCode,
  X,
  Copy
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

interface WhatsAppOtpFormProps {
  initialMode: 'whatsapp_otp' | 'forgot_password';
  onBackToPassword: () => void;
  onLoginSuccess: (authData: { token: string; user: any; profiles?: any[] }) => void;
  initialPhone?: string;
}

export const WhatsAppOtpForm: React.FC<WhatsAppOtpFormProps> = ({
  initialMode,
  onBackToPassword,
  onLoginSuccess,
  initialPhone = ''
}) => {
  const [mode, setMode] = useState<'whatsapp_otp' | 'forgot_password'>(initialMode);
  const [step, setStep] = useState<'request_phone' | 'enter_otp'>('request_phone');
  
  // Phone and OTP state
  const [phone, setPhone] = useState(initialPhone.replace(/\D/g, '').slice(-10));
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Generated code fallback (when WhatsApp socket is in QR scan / pairing mode)
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // New Password state for Forgot Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 5-minute countdown (300 seconds)
  const [countdown, setCountdown] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(30);

  // Refs for the 6 OTP input boxes
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Fetch WhatsApp Gateway status on mount
  useEffect(() => {
    fetch('/api/whatsapp/status')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'open') {
          setWhatsappConnected(true);
        } else {
          setWhatsappConnected(false);
          if (data.qr) {
            setQrCodeData(data.qr);
          }
        }
      })
      .catch(() => setWhatsappConnected(false));
  }, []);

  // Timer countdown effect
  useEffect(() => {
    let interval: any = null;
    if (step === 'enter_otp' && countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, countdown]);

  // Resend cooldown timer
  useEffect(() => {
    let interval: any = null;
    if (step === 'enter_otp' && resendCooldown > 0) {
      interval = setInterval(() => {
        setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, resendCooldown]);

  // Auto focus first OTP input when entering OTP step
  useEffect(() => {
    if (step === 'enter_otp') {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  }, [step]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendOtp = async (isResend = false) => {
    setErrorMsg(null);

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          purpose: mode === 'forgot_password' ? 'reset_password' : 'login'
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send OTP to WhatsApp');
      }

      const generatedCode = data.devOtp || data.otp || null;
      setDevOtp(generatedCode);
      const isLive = data.whatsappConnected !== false;
      setWhatsappConnected(isLive);

      if (isLive) {
        toast.success('WhatsApp OTP Dispatched', {
          description: `6-digit code sent to +91 ${cleanPhone}. Please check your WhatsApp.`
        });
      } else {
        toast.info('Verification Code Ready', {
          description: `WhatsApp Gateway awaiting QR scan. Verification code: ${generatedCode}`
        });
        // Auto-fill code when gateway is awaiting QR scan so user is never blocked
        if (generatedCode && generatedCode.length === 6) {
          setOtpDigits(generatedCode.split(''));
        }
      }

      setCountdown(300); // 5 minutes
      setResendCooldown(30); // 30 seconds cooldown
      if (isLive) {
        setOtpDigits(['', '', '', '', '', '']);
      }
      setStep('enter_otp');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send WhatsApp OTP');
      toast.error(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    setErrorMsg(null);
    const clean = val.replace(/\D/g, '');
    
    // Handle paste of full OTP
    if (clean.length > 1) {
      const digits = clean.slice(0, 6).split('');
      const newDigits = [...otpDigits];
      digits.forEach((d, i) => {
        if (i < 6) newDigits[i] = d;
      });
      setOtpDigits(newDigits);
      const nextFocus = Math.min(digits.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const newDigits = [...otpDigits];
    newDigits[index] = clean.slice(-1);
    setOtpDigits(newDigits);

    // If typed a digit, advance to next box
    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit OTP');
      return;
    }

    if (countdown <= 0) {
      setErrorMsg('This OTP has expired. Please click resend to request a new code.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (mode === 'forgot_password') {
      if (!newPassword || newPassword.length < 4) {
        setErrorMsg('New password must be at least 4 characters long');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('Passwords do not match');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            otp: fullOtp,
            newPassword
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Password reset failed');
        }

        toast.success('Password Successfully Reset', {
          description: 'Your password was updated. Signing you in...'
        });

        // Auto login with new credentials
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: cleanPhone,
            password: newPassword
          })
        });

        const loginData = await loginRes.json();
        if (loginData.success) {
          onLoginSuccess(loginData);
        } else {
          toast.info('Please log in with your new password');
          onBackToPassword();
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to reset password');
        toast.error(err.message || 'Failed to reset password');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Standard WhatsApp OTP verification
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          otp: fullOtp,
          purpose: 'login'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid OTP');
      }

      toast.success('WhatsApp OTP Verified', {
        description: `Welcome back, ${data.user?.name || 'School Member'}`
      });

      onLoginSuccess(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'OTP verification failed');
      toast.error(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 max-w-md mx-auto"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black uppercase tracking-wider">
          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
          {mode === 'forgot_password' ? 'WhatsApp Password Reset' : 'WhatsApp OTP Login'}
        </div>
        <h2 className="text-2xl font-black text-neutral-800 uppercase tracking-tight">
          {mode === 'forgot_password' ? 'Reset Password' : 'WhatsApp Sign In'}
        </h2>
        <p className="text-xs text-neutral-500 font-bold max-w-sm mx-auto leading-relaxed">
          {step === 'request_phone'
            ? 'We will deliver a secure 6-digit code directly to your registered WhatsApp number.'
            : `Enter the 6-digit verification code sent to +91 ${phone}`}
        </p>
      </div>

      {errorMsg && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {step === 'request_phone' ? (
          /* Step 1: Request registered mobile number */
          <motion.form
            key="request-phone-step"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              handleSendOtp();
            }}
            className="space-y-5"
          >
            <div className="relative rounded-2xl border border-neutral-300 px-4 py-3 bg-white focus-within:border-[#004D40] focus-within:ring-2 focus-within:ring-[#004D40]/20 transition-all">
              <label className="absolute -top-2.5 left-4 bg-white px-2 text-[10px] font-black uppercase tracking-wider text-[#004D40]">
                Registered Mobile Number *
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-neutral-400 select-none">+91</span>
                <span className="text-neutral-300">|</span>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  disabled={loading}
                  placeholder="Enter 10-digit mobile number"
                  className="w-full text-sm font-bold py-1.5 outline-none text-neutral-800 bg-transparent placeholder-neutral-400 tracking-wider"
                  autoFocus
                />
                <Smartphone className="w-5 h-5 text-neutral-400 shrink-0" />
              </div>
            </div>

            {/* Gateway Status Badge & QR button */}
            <div className="flex items-center justify-between px-1 text-xs">
              <span className="flex items-center gap-1.5 text-neutral-500 font-bold text-[11px]">
                <span className={`w-2 h-2 rounded-full ${whatsappConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {whatsappConnected === true 
                  ? 'WhatsApp Gateway: Live' 
                  : whatsappConnected === false 
                    ? 'WhatsApp Gateway: QR Link Mode' 
                    : 'Checking Gateway...'}
              </span>
              {qrCodeData && (
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="text-[11px] font-black text-[#004D40] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Scan QR</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || phone.replace(/\D/g, '').length !== 10}
              className={`w-full py-3.5 text-center transition-all font-black text-xs uppercase tracking-widest rounded-full shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                phone.replace(/\D/g, '').length === 10 && !loading
                  ? 'bg-[#004D40] text-white hover:bg-[#064e3b] hover:shadow-lg active:scale-[0.98]'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Connecting to WhatsApp...</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4 text-emerald-300" />
                  <span>Send WhatsApp OTP</span>
                </>
              )}
            </button>

            <div className="pt-2 text-center flex flex-col gap-2">
              <button
                type="button"
                onClick={onBackToPassword}
                className="text-xs font-bold text-neutral-500 hover:text-neutral-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Mobile & Password Login</span>
              </button>

              {mode === 'whatsapp_otp' ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot_password');
                    setErrorMsg(null);
                  }}
                  className="text-[11px] font-bold text-orange-600 hover:underline transition-colors cursor-pointer"
                >
                  Forgot Password via WhatsApp?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode('whatsapp_otp');
                    setErrorMsg(null);
                  }}
                  className="text-[11px] font-bold text-emerald-700 hover:underline transition-colors cursor-pointer"
                >
                  Login with WhatsApp OTP instead
                </button>
              )}
            </div>
          </motion.form>
        ) : (
          /* Step 2: 6-Digit OTP Box + 5-Minute Countdown */
          <motion.form
            key="enter-otp-step"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onSubmit={handleVerifyOtp}
            className="space-y-5"
          >
            {/* Target phone summary and change link */}
            <div className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold">
              <div className="flex items-center gap-2 text-neutral-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Sent to: <strong className="font-mono text-neutral-900">+91 {phone}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('request_phone');
                  setErrorMsg(null);
                }}
                className="text-[11px] font-black text-[#004D40] hover:underline cursor-pointer"
              >
                Change
              </button>
            </div>

            {/* Generated Code Helper / Fallback Banner */}
            {devOtp && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-emerald-50/90 border border-emerald-300 rounded-2xl space-y-2 text-left shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    {whatsappConnected ? 'Verification Code Dispatched' : 'WhatsApp Gateway (QR Scan Pending)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpDigits(devOtp.split('').slice(0, 6));
                      toast.success('Code auto-filled!');
                    }}
                    className="text-[10px] font-black uppercase text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shadow-xs hover:bg-emerald-100 cursor-pointer transition-colors"
                  >
                    Auto-fill Code
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-emerald-900">
                  <span className="text-[11px] font-medium leading-tight">
                    {whatsappConnected 
                      ? 'Dispatched to WhatsApp. Instant verification code:' 
                      : 'Gateway is in QR pairing mode. Your 6-digit access code:'}
                  </span>
                  <span className="font-mono font-black text-sm bg-white px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-950 tracking-widest shrink-0 shadow-xs">
                    {devOtp}
                  </span>
                </div>
              </motion.div>
            )}

            {/* 6-Digit Input Boxes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-neutral-600">
                  Enter 6-Digit WhatsApp Code
                </label>
              </div>
              <div className="flex justify-center gap-2 sm:gap-3">
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    disabled={loading}
                    className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-mono font-black rounded-xl border transition-all outline-none ${
                      digit
                        ? 'border-[#004D40] bg-emerald-50/40 text-neutral-900 shadow-sm'
                        : 'border-neutral-300 bg-white text-neutral-800 focus:border-[#004D40] focus:ring-2 focus:ring-[#004D40]/20'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* 5-Minute Countdown Display */}
            <div className="flex items-center justify-between px-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold">
                <Clock className={`w-3.5 h-3.5 ${countdown < 60 ? 'text-rose-500 animate-pulse' : 'text-neutral-500'}`} />
                <span className={countdown < 60 ? 'text-rose-600 font-extrabold' : 'text-neutral-600'}>
                  Expires in: <strong className="font-mono">{formatCountdown(countdown)}</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleSendOtp(true)}
                disabled={loading || resendCooldown > 0}
                className={`text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                  resendCooldown > 0 || loading
                    ? 'text-neutral-400 cursor-not-allowed'
                    : 'text-[#004D40] hover:underline'
                }`}
              >
                {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Code'}
              </button>
            </div>

            {/* If Forgot Password Mode, display new password inputs */}
            {mode === 'forgot_password' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 pt-2 border-t border-neutral-100"
              >
                <div className="relative rounded-2xl border border-neutral-300 px-4 py-2.5 bg-white focus-within:border-[#004D40] focus-within:ring-2 focus-within:ring-[#004D40]/20 transition-all">
                  <label className="absolute -top-2.5 left-4 bg-white px-2 text-[10px] font-black uppercase tracking-wider text-[#004D40]">
                    New Password *
                  </label>
                  <div className="flex items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      placeholder="Enter new password (min 4 chars)"
                      className="w-full text-xs font-bold py-1.5 outline-none text-neutral-800 bg-transparent placeholder-neutral-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="relative rounded-2xl border border-neutral-300 px-4 py-2.5 bg-white focus-within:border-[#004D40] focus-within:ring-2 focus-within:ring-[#004D40]/20 transition-all">
                  <label className="absolute -top-2.5 left-4 bg-white px-2 text-[10px] font-black uppercase tracking-wider text-[#004D40]">
                    Confirm New Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    placeholder="Re-enter new password"
                    className="w-full text-xs font-bold py-1.5 outline-none text-neutral-800 bg-transparent placeholder-neutral-400"
                  />
                </div>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading || otpDigits.join('').length !== 6 || countdown <= 0}
              className={`w-full py-4 text-center transition-all font-black text-xs uppercase tracking-widest rounded-full shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                otpDigits.join('').length === 6 && countdown > 0 && !loading
                  ? 'bg-[#004D40] text-white hover:bg-[#064e3b] hover:shadow-[#004D40]/20 active:scale-[0.98]'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : mode === 'forgot_password' ? (
                <>
                  <KeyRound className="w-4 h-4 text-emerald-300" />
                  <span>Reset Password & Sign In</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                  <span>Verify & Sign In</span>
                </>
              )}
            </button>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={onBackToPassword}
                className="text-xs font-bold text-neutral-500 hover:text-neutral-800 flex items-center justify-center gap-1.5 mx-auto transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Use Mobile & Password Instead</span>
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* WhatsApp QR Modal for pairing gateway */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-neutral-200 text-center space-y-4 relative"
          >
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="inline-flex p-3 rounded-2xl bg-emerald-50 text-emerald-700">
              <QrCode className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-neutral-900 uppercase tracking-tight">Link WhatsApp Bot</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Open WhatsApp on admin phone &rarr; <strong>Linked Devices</strong> &rarr; <strong>Link a device</strong> and scan this code.
              </p>
            </div>

            {qrCodeData ? (
              <div className="p-4 bg-white border-2 border-emerald-500/20 rounded-2xl flex justify-center shadow-inner">
                <QRCodeSVG value={qrCodeData} size={180} />
              </div>
            ) : (
              <div className="p-8 text-neutral-400 text-xs font-bold bg-neutral-50 rounded-2xl">
                No active QR code. Click Refresh below to initialize WhatsApp Gateway.
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  fetch('/api/whatsapp/restart', { method: 'POST' }).then(() => {
                    toast.info('Re-initializing WhatsApp Gateway...');
                    setTimeout(() => {
                      fetch('/api/whatsapp/status').then(r => r.json()).then(d => {
                        if (d.qr) setQrCodeData(d.qr);
                        if (d.status === 'open') {
                          setWhatsappConnected(true);
                          setShowQrModal(false);
                          toast.success('WhatsApp connected successfully!');
                        }
                      });
                    }, 2500);
                  });
                }}
                className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Refresh Gateway & QR Code
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};
