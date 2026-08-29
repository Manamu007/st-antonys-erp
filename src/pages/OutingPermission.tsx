import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Smartphone, 
  Bus, 
  Clock, 
  Lock, 
  ShieldAlert, 
  Sparkles, 
  MapPin, 
  Users, 
  QrCode, 
  LogOut, 
  LogIn, 
  Calendar, 
  ChevronRight, 
  Info, 
  XCircle,
  PhoneCall,
  UserCheck,
  Check,
  Activity
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { useAuth } from '../context/AuthContext';
import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { toast } from 'sonner';

export default function OutingPermission() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studentId = searchParams.get('studentId') || '';
  const { user, profile } = useAuth();

  // Student State
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Outing State
  const [outings, setOutings] = useState<any[]>([]);
  const [activeOuting, setActiveOuting] = useState<any>(null);
  
  // Transport Bus state
  const [assignedBus, setAssignedBus] = useState<any>(null);

  // Security Gatekeeper Passcode Bypass (default to "1234" for quick access/guard testing)
  const [passcode, setPasscode] = useState<string>('');
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [showPasscodeField, setShowPasscodeField] = useState<boolean>(false);

  // Form State for granting outing
  const [destination, setDestination] = useState<string>('');
  const [reason, setReason] = useState<string>('Weekend Visit');
  const [outingType, setOutingType] = useState<string>('Weekend Leave');
  const [customReason, setCustomReason] = useState<string>('');
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>(
    new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0] // default to 2 days later
  );

  // Real-time WhatsApp Notification Terminal Logs
  const [messageLogs, setMessageLogs] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Quick reason templates
  const reasonsList = [
    'Weekend Visit',
    'Festival Celebration',
    'Medical Emergency',
    'Family Event',
    'General Shopping Outing',
    'Other'
  ];

  useEffect(() => {
    // If user is logged in as school staff (admin, warden, security, clerk, teacher, principal) they are auto-authorized!
    if (profile) {
      const roleLower = (profile.role || '').toLowerCase();
      const staffRoles = ['admin', 'super_admin', 'warden', 'security', 'clerk', 'staff', 'teacher', 'principal', 'vice_principal'];
      if (staffRoles.includes(roleLower)) {
        setIsAuthorized(true);
      }
    }
  }, [profile]);

  useEffect(() => {
    if (studentId) {
      fetchStudentAndOutings();
    } else {
      setLoading(false);
    }
  }, [studentId]);

  const fetchStudentAndOutings = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch student profile
      const studentData = await dbService.get('students', studentId);
      if (!studentData) {
        setError("Student not found or invalid QR code scan parameter.");
        setLoading(false);
        return;
      }
      setStudent(studentData);
      
      // Default destination to student's village/address
      setDestination(studentData.village || studentData.address || 'Home');

      // 2. Fetch student's outings to find active ones and history
      const outingsData = await dbService.list('hostel_outings', [
        where('studentId', '==', studentId)
      ]);
      
      // Sort outings by createdAt descending
      const sortedOutings = (outingsData || []).sort((a: any, b: any) => {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      setOutings(sortedOutings);

      // An active outing is one with status === 'approved' (meaning currently out on campus leave)
      const currentActive = sortedOutings.find((o: any) => o.status === 'approved');
      setActiveOuting(currentActive || null);

      // 3. Find matching school bus based on student's village or assigned route
      const busesList = await dbService.list('buses');
      const studentVillage = (studentData.village || '').trim().toLowerCase();
      const studentRoute = (studentData.busRoute || '').trim().toLowerCase();

      // Find bus serving student's village or route name
      const matchingBus = busesList.find((bus: any) => {
        const busRouteName = (bus.routeName || '').trim().toLowerCase();
        const busNumber = (bus.busNumber || '').trim().toLowerCase();
        return (
          (studentVillage && busRouteName.includes(studentVillage)) ||
          (studentRoute && busRouteName.includes(studentRoute)) ||
          (studentData.transportBusId && bus.id === studentData.transportBusId)
        );
      });
      setAssignedBus(matchingBus || null);

    } catch (err: any) {
      console.error("Error loading outing metadata:", err);
      setError("Failed to retrieve student records from our secure school database.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    // Allow standard bypass pin "1234" for security guards / drivers / helpers or custom demo PIN
    if (passcode === '1234' || passcode === '0000') {
      setIsAuthorized(true);
      toast.success("Security passcode verified successfully!");
      setShowPasscodeField(false);
    } else {
      toast.error("Incorrect security clearance PIN. Please try again.");
    }
  };

  const addLog = (recipient: string, phone: string, status: 'pending' | 'sent' | 'error', text: string) => {
    setMessageLogs(prev => [
      {
        id: Math.random().toString(),
        time: new Date().toLocaleTimeString(),
        recipient,
        phone,
        status,
        text
      },
      ...prev
    ]);
  };

  // 1. Grant Outing (Check-Out)
  const handleGrantOuting = async () => {
    if (!isAuthorized) {
      toast.error("Authorization required to grant outings.");
      return;
    }

    setIsSubmitting(true);
    setMessageLogs([]);
    const actualReason = reason === 'Other' ? customReason : reason;

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      const newOutingData = {
        studentId: student.uid || student.id,
        studentName: student.name,
        className: `${student.className || 'Class'} - ${student.batchName || 'Batch'}`,
        type: outingType,
        destination: destination,
        status: 'approved', // instantly approved for exit
        startDate: dateStr,
        endDate: expectedReturnDate,
        parentPhone: student.parentPhone || student.phone || student.fatherPhone || 'N/A',
        reason: actualReason,
        time: timeStr,
        createdAt: new Date().toISOString(),
        grantedBy: profile?.name || 'Security Gatekeeper'
      };

      // Save to Firestore
      await dbService.add('hostel_outings', newOutingData);
      toast.success(`Outing granted successfully for ${student.name}!`);

      // 2. Trigger WhatsApp Message to Parent
      const parentNo = student.parentPhone || student.phone || student.fatherPhone || '';
      if (parentNo) {
        addLog('Parent WhatsApp Gate', parentNo, 'pending', 'Initiating connection to parents...');
        const parentMessage = `*🔒 OUTING CLEARANCE APPROVED*\n\nDear Parent,\nyour ward *${student.name}* (ID: ${student.idCode || 'N/A'}) has been officially checked out from the hostel.\n\n📍 *Destination:* ${destination}\n❓ *Reason:* ${actualReason}\n📅 *Check-out Date:* ${dateStr}\n⏰ *Check-out Time:* ${timeStr}\n⏳ *Expected Return:* ${expectedReturnDate}\n\n_This is an automated security clearance message from your school campus._`;
        
        try {
          await whatsappService.sendMessage(parentNo, parentMessage, {
            studentId: student.uid || student.id,
            templateType: 'hostel_outing_permission',
            messageType: 'outing_notice'
          });
          addLog('Parent WhatsApp Gate', parentNo, 'sent', 'Parent notified successfully.');
        } catch (err) {
          console.error("WhatsApp parent failed:", err);
          addLog('Parent WhatsApp Gate', parentNo, 'error', 'Failed to deliver message via WhatsApp API.');
        }
      } else {
        addLog('Parent WhatsApp Gate', 'N/A', 'error', 'No parent phone number found in profile!');
      }

      // 3. Trigger WhatsApp Message to Bus Driver & Helper if Hostel Boarder
      const isHostel = student.feeType === 'hostel';
      if (isHostel) {
        if (assignedBus) {
          const driverPhone = assignedBus.driverPhone || '';
          const helperPhone = assignedBus.helperPhone || '';

          // Inform Driver
          if (driverPhone) {
            addLog(`Bus Driver (${assignedBus.driverName || 'Driver'})`, driverPhone, 'pending', 'Sending transit route alert...');
            const driverMsg = `*🚌 TRANSIT ALERT (HOSTEL BOARDER OUTING)*\n\nDear *${assignedBus.driverName || 'Driver'}*,\nhostel boarder *${student.name}* (Village: *${student.village || 'N/A'}*) has checked out on outing.\n\n👤 *Student:* ${student.name}\n📍 *Village/Destination:* ${destination}\n📞 *Parent Contact:* ${parentNo || 'N/A'}\n\n_Please synchronize pick-up/drop-off schedules accordingly if the student resides in your bus route zone._`;
            
            try {
              await whatsappService.sendMessage(driverPhone, driverMsg, {
                studentId: student.uid || student.id,
                templateType: 'hostel_outing_driver_alert'
              });
              addLog(`Bus Driver (${assignedBus.driverName})`, driverPhone, 'sent', 'Driver transport alert delivered.');
            } catch (err) {
              addLog(`Bus Driver (${assignedBus.driverName})`, driverPhone, 'error', 'Driver transport alert failed.');
            }
          } else {
            addLog('Transit Driver Gate', 'N/A', 'error', 'No driver phone listed for assigned route.');
          }

          // Inform Helper
          if (helperPhone) {
            addLog(`Bus Helper (${assignedBus.helperName || 'Helper'})`, helperPhone, 'pending', 'Sending companion alert...');
            const helperMsg = `*🚌 TRANSIT ASSISTANCE ALERT*\n\nDear *${assignedBus.helperName || 'Helper'}*,\nhostel resident *${student.name}* (Village: *${student.village || 'N/A'}*) is checked out on outing today.\n\n👤 *Student:* ${student.name}\n📍 *Destination Village:* ${destination}\n\n_Please support coordinate boarding and verify student arrival at their village route._`;
            
            try {
              await whatsappService.sendMessage(helperPhone, helperMsg, {
                studentId: student.uid || student.id,
                templateType: 'hostel_outing_helper_alert'
              });
              addLog(`Bus Helper (${assignedBus.helperName})`, helperPhone, 'sent', 'Helper transit coordinate delivered.');
            } catch (err) {
              addLog(`Bus Helper (${assignedBus.helperName})`, helperPhone, 'error', 'Helper companion alert failed.');
            }
          } else {
            addLog('Transit Helper Gate', 'N/A', 'error', 'No companion helper phone listed for route.');
          }
        } else {
          addLog('Transit Alerts', 'N/A', 'error', `No matching bus route found for student village: "${student.village || 'Unknown'}"`);
        }
      }

      // Reload
      await fetchStudentAndOutings();
    } catch (err) {
      toast.error("Failed to process check-out request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Check In (Mark Return)
  const handleCheckIn = async () => {
    if (!activeOuting) return;
    setIsSubmitting(true);
    setMessageLogs([]);

    try {
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = new Date().toISOString().split('T')[0];

      // Update in Firestore: status becomes 'returned'
      await dbService.update('hostel_outings', activeOuting.id, {
        status: 'returned',
        returnDate: dateStr,
        returnTime: timeStr,
        checkedInBy: profile?.name || 'Security Gatekeeper'
      });

      toast.success(`${student.name} has been safely checked back into campus!`);

      // Trigger WhatsApp message to Parent
      const parentNo = student.parentPhone || student.phone || student.fatherPhone || '';
      if (parentNo) {
        addLog('Parent WhatsApp Gate', parentNo, 'pending', 'Sending safe return confirmation...');
        const parentMessage = `*✅ SAFE RETURN CONFIRMED*\n\nDear Parent,\nyour ward *${student.name}* has safely returned to the school campus/hostel.\n\n⏰ *Arrival Time:* ${timeStr}\n📅 *Arrival Date:* ${dateStr}\n\n_The student has been verified and checked-in by campus security guards. Thank you._`;
        
        try {
          await whatsappService.sendMessage(parentNo, parentMessage, {
            studentId: student.uid || student.id,
            templateType: 'hostel_return_notice'
          });
          addLog('Parent WhatsApp Gate', parentNo, 'sent', 'Arrival receipt dispatched to parent.');
        } catch (err) {
          addLog('Parent WhatsApp Gate', parentNo, 'error', 'WhatsApp arrival dispatch failed.');
        }
      }

      // Reload
      await fetchStudentAndOutings();
    } catch (err) {
      toast.error("Failed to process check-in arrival.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header Branding */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 bg-white border border-neutral-200/80 rounded-[2rem] p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Outing Gatekeeper Terminal</h1>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">Automated Scan & Parent Notify Protocol</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/dashboard/id-cards')}
            className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            <span>ID Card Generator</span>
          </button>
        </div>

        {/* Loading / Error states */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-neutral-200 rounded-[2rem] shadow-sm">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
            <h3 className="font-bold text-slate-800 uppercase tracking-wide">Syncing Student Profile...</h3>
            <p className="text-xs text-slate-400 mt-1">Please wait while we connect to secure Firestore ledger</p>
          </div>
        )}

        {error && (
          <div className="bg-white border border-rose-200 p-8 rounded-[2rem] shadow-sm text-center">
            <XCircle className="w-16 h-16 text-rose-500 mx-auto mb-4 animate-bounce" />
            <h3 className="text-xl font-black text-slate-900 uppercase">Invalid Access Request</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed font-medium">{error}</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <input 
                type="text" 
                placeholder="Enter Student ID manually..." 
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center text-sm w-60 mx-auto sm:mx-0"
                id="manual-id-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const id = (e.target as HTMLInputElement).value.trim();
                    if (id) navigate(`/dashboard/outing-permission?studentId=${id}`);
                  }
                }}
              />
              <button 
                onClick={() => {
                  const val = (document.getElementById('manual-id-input') as HTMLInputElement)?.value.trim();
                  if (val) navigate(`/dashboard/outing-permission?studentId=${val}`);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all"
              >
                Go to Profile
              </button>
            </div>
          </div>
        )}

        {/* Core Workspace Layout */}
        {!loading && student && (
          <div className="space-y-6">
            
            {/* 1. Student Identity Header */}
            <div className="bg-white border border-neutral-200 rounded-[2.5rem] p-6 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/30 rounded-full blur-3xl -z-10" />
              
              <div className="flex flex-col md:flex-row items-center gap-6">
                
                {/* Photo & Badge */}
                <div className="relative">
                  <div className="w-32 h-40 bg-neutral-100 rounded-[2rem] overflow-hidden border-4 border-slate-100 shadow-md">
                    {student.photo ? (
                      <img src={student.photo} className="w-full h-full object-cover" alt="Student Photo" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <User className="w-16 h-16" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">No Image</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Residency Status Badge */}
                  <span className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-md flex items-center gap-1.5 whitespace-nowrap ${
                    student.feeType === 'hostel' 
                      ? 'bg-amber-550 text-white border-amber-600 shadow-amber-500/20' 
                      : 'bg-indigo-600 text-white border-indigo-700 shadow-indigo-500/20'
                  }`}>
                    <Activity className="w-3.5 h-3.5" />
                    <span>{student.feeType === 'hostel' ? '🏠 Hostel Boarder' : '🎒 Day Scholar'}</span>
                  </span>
                </div>

                {/* Profile Information */}
                <div className="flex-1 text-center md:text-left space-y-3 mt-4 md:mt-0">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                      ID: {student.idCode || 'STD-N/A'}
                    </span>
                    <h2 className="text-2xl font-black text-slate-900 uppercase mt-2">{student.name}</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {student.className || 'Class'} | {student.batchName || 'Batch'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-sm">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Father Name</span>
                      <span className="font-extrabold text-slate-800 uppercase">{student.fatherName || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Parent Phone</span>
                      <span className="font-extrabold text-slate-800 font-mono">{student.parentPhone || student.phone || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Home Village</span>
                      <span className="font-extrabold text-slate-800 uppercase">{student.village || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Blood Group</span>
                      <span className="font-extrabold text-rose-600 font-mono">{student.bloodGroup || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Security Clearance Section */}
            <div className="bg-white border border-neutral-200 rounded-[2.5rem] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Security Access Control</h3>
                </div>

                {isAuthorized ? (
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Clearance Approved</span>
                  </span>
                ) : (
                  <button 
                    onClick={() => setShowPasscodeField(!showPasscodeField)}
                    className="px-3.5 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Gatekeeper Unlock</span>
                  </button>
                )}
              </div>

              {/* Passcode Bypass Form */}
              <AnimatePresence>
                {showPasscodeField && !isAuthorized && (
                  <motion.form 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleVerifyPasscode}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 space-y-3"
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-black uppercase text-slate-500">Security Guard/Warden PIN</label>
                      <p className="text-[10px] text-slate-400 font-medium">Please enter your 4-digit gate security bypass code (e.g. 1234)</p>
                    </div>
                    <div className="flex gap-3">
                      <input 
                        type="password" 
                        maxLength={4}
                        placeholder="••••"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 font-mono text-center tracking-widest text-lg font-bold w-32 focus:ring-2 focus:ring-indigo-500"
                      />
                      <button 
                        type="submit"
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all"
                      >
                        Verify Code
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Current Status Indicator */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Active Outing Box */}
                <div className={`p-6 rounded-[2rem] border flex flex-col justify-between ${
                  activeOuting 
                    ? 'bg-rose-50/50 border-rose-100 text-rose-950' 
                    : 'bg-emerald-50/50 border-emerald-100 text-emerald-950'
                }`}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full ${activeOuting ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {activeOuting ? 'Campus Leave Status: Out of Campus' : 'Campus Leave Status: Inside Campus'}
                      </span>
                    </div>

                    {activeOuting ? (
                      <div className="space-y-1">
                        <h4 className="text-xl font-black uppercase">{activeOuting.type}</h4>
                        <p className="text-xs font-medium text-rose-800">
                          Destination: <strong className="font-extrabold uppercase">{activeOuting.destination}</strong>
                        </p>
                        <p className="text-xs font-medium text-rose-800">
                          Reason: <strong className="font-extrabold">{activeOuting.reason}</strong>
                        </p>
                        <p className="text-xs font-medium text-rose-700 mt-2">
                          Checked-out: {activeOuting.startDate} {activeOuting.time ? `at ${activeOuting.time}` : ''}
                        </p>
                        <p className="text-xs font-black text-rose-800">
                          Expected Return: {activeOuting.endDate}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <h4 className="text-xl font-black uppercase">No Active Outing</h4>
                        <p className="text-xs font-medium text-emerald-800 leading-relaxed">
                          Student is currently inside campus boundaries. You can authorize a new outing slip below.
                        </p>
                      </div>
                    )}
                  </div>

                  {activeOuting && (
                    <button
                      onClick={handleCheckIn}
                      disabled={isSubmitting || !isAuthorized}
                      className="mt-6 w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? 'Recording Arrival...' : 'Check In (Safe Arrival Campus)'}
                    </button>
                  )}
                </div>

                {/* Transits and Village Bus Information */}
                <div className="bg-slate-50 border border-slate-200/60 p-6 rounded-[2rem] flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <Bus className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Transit / Bus Link Check</span>
                    </div>

                    {student.feeType === 'hostel' ? (
                      assignedBus ? (
                        <div className="space-y-2">
                          <div className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm">
                            <span className="text-[9px] font-bold text-slate-400 block uppercase">Route / Bus Number</span>
                            <span className="font-extrabold text-slate-800 text-sm uppercase">
                              {assignedBus.routeName || 'Village Route'} (Bus No: {assignedBus.busNumber})
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm">
                              <span className="text-[9px] font-bold text-slate-400 block uppercase">Driver Name</span>
                              <span className="font-extrabold text-slate-800 text-xs uppercase block truncate">{assignedBus.driverName}</span>
                              <span className="text-[10px] font-mono text-indigo-600 font-bold block mt-0.5">{assignedBus.driverPhone}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm">
                              <span className="text-[9px] font-bold text-slate-400 block uppercase">Helper Companion</span>
                              <span className="font-extrabold text-slate-800 text-xs uppercase block truncate">{assignedBus.helperName || 'N/A'}</span>
                              <span className="text-[10px] font-mono text-indigo-600 font-bold block mt-0.5">{assignedBus.helperPhone || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl text-center text-amber-800">
                          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-600" />
                          <span className="text-xs font-extrabold block uppercase">No Direct Village Bus Route Found</span>
                          <p className="text-[10px] text-amber-700 leading-relaxed mt-1">
                            No bus route covers the student's village/address ("{student.village || 'N/A'}"). Standard transport notifications will not trigger.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="bg-indigo-50/40 border border-indigo-100 p-4 rounded-xl text-center text-indigo-900">
                        <Info className="w-6 h-6 mx-auto mb-2 text-indigo-500" />
                        <span className="text-xs font-extrabold block uppercase">Transit Dispatch Bypassed</span>
                        <p className="text-[10px] text-indigo-700 leading-relaxed mt-1">
                          This student is registered as a Day Scholar. Local village bus notifications do not apply.
                        </p>
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 italic block mt-4 font-bold text-center uppercase tracking-wide">
                    {student.feeType === 'hostel' ? '🔴 Hostel Residents notify driver/helper' : '⚪ Day Scholars notify parent only'}
                  </span>
                </div>

              </div>

            </div>

            {/* 3. Grant New Outing Form (Only visible if student is inside campus) */}
            {!activeOuting && (
              <div className="bg-white border border-neutral-200 rounded-[2.5rem] p-6 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-6">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Grant New Outing Permission</h3>
                </div>

                {!isAuthorized && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex gap-3">
                    <Lock className="w-6 h-6 text-amber-600 shrink-0" />
                    <div>
                      <span className="text-xs font-black uppercase text-amber-800">Unlock Gate Controls Required</span>
                      <p className="text-[10px] text-amber-700 leading-relaxed mt-0.5">
                        You can view student details, but granting an outing clearance slip requires entering the security gate passcode (PIN: 1234) using the bypass button above.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Presets */}
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-black uppercase text-slate-500">Destination/Village</label>
                      <input 
                        type="text" 
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="Home / Village Name"
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 w-full focus:ring-2 focus:ring-indigo-500 uppercase"
                        disabled={!isAuthorized}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-black uppercase text-slate-500">Outing Category</label>
                      <select
                        value={outingType}
                        onChange={(e) => setOutingType(e.target.value)}
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 w-full focus:ring-2 focus:ring-indigo-500"
                        disabled={!isAuthorized}
                      >
                        <option value="Weekend Leave">Weekend Leave</option>
                        <option value="Day Outing">Day Outing</option>
                        <option value="Emergency Outing">Emergency Outing</option>
                        <option value="Holiday Leave">Holiday Leave</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-black uppercase text-slate-500">Expected Return Date</label>
                      <input 
                        type="date" 
                        value={expectedReturnDate}
                        onChange={(e) => setExpectedReturnDate(e.target.value)}
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 w-full focus:ring-2 focus:ring-indigo-500"
                        disabled={!isAuthorized}
                      />
                    </div>
                  </div>

                  {/* Reasons & Actions */}
                  <div className="space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <label className="text-xs font-black uppercase text-slate-500 block">Outing Reason</label>
                      <div className="grid grid-cols-2 gap-2">
                        {reasonsList.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              if (isAuthorized) setReason(r);
                            }}
                            className={`px-3 py-2 border rounded-xl text-xs font-bold transition-all text-left truncate ${
                              reason === r
                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-md'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                            disabled={!isAuthorized}
                          >
                            {r}
                          </button>
                        ))}
                      </div>

                      {reason === 'Other' && (
                        <input 
                          type="text" 
                          value={customReason}
                          onChange={(e) => setCustomReason(e.target.value)}
                          placeholder="Please enter custom reason..."
                          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 w-full focus:ring-2 focus:ring-indigo-500"
                          disabled={!isAuthorized}
                        />
                      )}
                    </div>

                    <button
                      onClick={handleGrantOuting}
                      disabled={isSubmitting || !isAuthorized || !destination}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-wider text-xs rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isSubmitting ? 'Clearance in Progress...' : 'Grant Outing (Dispatch Alert SMS)'}</span>
                    </button>
                  </div>

                </div>

              </div>
            )}

            {/* 4. Live WhatsApp Notification Output logs */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-xl text-white font-mono overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-15 text-indigo-500">
                <Smartphone className="w-16 h-16 animate-pulse" />
              </div>

              <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-4">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Live API Notification Log Terminal</span>
              </div>

              <div className="h-44 overflow-y-auto space-y-2 text-xs scrollbar-thin scrollbar-thumb-slate-800">
                {messageLogs.length === 0 ? (
                  <p className="text-slate-500 italic text-center py-12 text-[11px] uppercase tracking-wider">
                    [System idle] awaiting gate check-out / check-in actions...
                  </p>
                ) : (
                  messageLogs.map((log) => (
                    <div key={log.id} className="border-b border-slate-850 pb-2 flex items-start gap-2 animate-fadeIn">
                      <span className="text-slate-500 font-bold">[{log.time}]</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-indigo-400 uppercase">{log.recipient}</span>
                          <span className="text-[10px] text-slate-500">({log.phone})</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                            log.status === 'sent' 
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' 
                              : log.status === 'error'
                              ? 'bg-rose-950 text-rose-400 border border-rose-900'
                              : 'bg-indigo-950 text-indigo-400 border border-indigo-900 animate-pulse'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                        <p className="text-slate-350 text-[10px] mt-0.5 font-sans leading-relaxed">{log.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 5. Outing Clearance Logs History */}
            <div className="bg-white border border-neutral-200 rounded-[2.5rem] p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-4">
                <Info className="w-5 h-5 text-slate-600" />
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Recent Outpass Records</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase font-black text-[10px]">
                      <th className="py-2.5">Date</th>
                      <th className="py-2.5">Category</th>
                      <th className="py-2.5">Destination</th>
                      <th className="py-2.5">Reason</th>
                      <th className="py-2.5 text-center">Status</th>
                      <th className="py-2.5 text-right">Clearance Gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {outings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                          No recent outing clearance records found for this student.
                        </td>
                      </tr>
                    ) : (
                      outings.map((o) => (
                        <tr key={o.id} className="text-slate-700 hover:bg-slate-50/50">
                          <td className="py-3 font-semibold font-mono">{o.startDate}</td>
                          <td className="py-3 font-bold uppercase">{o.type}</td>
                          <td className="py-3 uppercase truncate max-w-[120px]">{o.destination}</td>
                          <td className="py-3 font-medium text-slate-500">{o.reason}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              o.status === 'approved'
                                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              {o.status === 'approved' ? 'Active Out' : 'Returned'}
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium text-slate-400">{o.grantedBy || 'Admin Gate'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
