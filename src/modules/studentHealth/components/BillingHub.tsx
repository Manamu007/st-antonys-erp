import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, FileText, Check, Search, Plus, Trash2, ArrowRight, Loader2, Info, X, Camera, Sparkles, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { HealthMedicineItem, StudentHealthBill, StudentMatchResult } from '../types/index.js';

interface BillingHubProps {
  userId: string;
  role: string;
  schoolId: string;
  hospitalId: string;
}

export default function BillingHub({ userId, role, schoolId, hospitalId }: BillingHubProps) {
  const [entryMode, setEntryMode] = useState<'OCR' | 'MANUAL'>('OCR');
  const [uploading, setUploading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [matches, setMatches] = useState<StudentMatchResult[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<StudentMatchResult | null>(null);
  const [autoAllottedInfo, setAutoAllottedInfo] = useState<any>(null);

  // Student manual search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<StudentMatchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Editing form variables
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [batchName, setBatchName] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [studentType, setStudentType] = useState<'HOSTELER' | 'DAY_SCHOLAR'>('DAY_SCHOLAR');
  const [fatherName, setFatherName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Rejection popup state for non-hostel students
  const [rejectionPopup, setRejectionPopup] = useState<{
    isOpen: boolean;
    studentName: string;
    studentType: string;
    className?: string;
    fatherName?: string;
  } | null>(null);

  // Camera integration variables
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [doctorName, setDoctorName] = useState('');
  const [treatment, setTreatment] = useState('');
  const [medicines, setMedicines] = useState<HealthMedicineItem[]>([]);
  const [newMedName, setNewMedName] = useState('');
  const [newMedQty, setNewMedQty] = useState('');
  const [newMedQtyPrice, setNewMedQtyPrice] = useState('0');

  // Amounts
  const [doctorFee, setDoctorFee] = useState('0');
  const [medicineAmount, setMedicineAmount] = useState('0');
  const [labFee, setLabFee] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stop camera when component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Master hospitals list synced with Master Registry in real-time
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [activeHospitalId, setActiveHospitalId] = useState<string>(hospitalId || '');

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const res = await fetch(`/api/student-health/hospitals?schoolId=${schoolId}`);
        if (res.ok) {
          const data = await res.json();
          const list = data.hospitals || [];
          setHospitals(list);
          if (!hospitalId && list.length > 0) {
            const activeH = list.find((h: any) => h.status === 'ACTIVE') || list[0];
            setActiveHospitalId(activeH.id);
          }
        }
      } catch (err) {
        console.error("Failed to load hospitals in BillingHub", err);
      }
    };
    fetchHospitals();
  }, [schoolId, hospitalId]);

  // Auto generate unique invoice number for manual entry mode if empty
  useEffect(() => {
    if (entryMode === 'MANUAL' && !billNumber) {
      const prefix = "INV";
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setBillNumber(`${prefix}-${dateStr}-${randomSuffix}`);
    }
  }, [entryMode, billNumber]);

  // Autocomplete typing lookup with debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length >= 2) {
      const delayDebounce = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const res = await fetch('/api/student-health/students/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, schoolId })
          });
          const data = await res.json();
          setSearchResults(data.matches || []);
          setShowDropdown(true);
        } catch (err) {
          console.error("Autocomplete search error", err);
        } finally {
          setSearchLoading(false);
        }
      }, 250);

      return () => clearTimeout(delayDebounce);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  }, [searchQuery, schoolId]);

  const calculateTotal = () => {
    const doc = Number(doctorFee) || 0;
    const medTable = medicines.reduce((sum, item) => sum + (item.amount || 0), 0);
    const lab = Number(labFee) || 0;
    const other = Number(otherCharges) || 0;
    
    // Auto sync medicineAmount input if they use table
    const syncMedAmount = medTable > 0 ? medTable : (Number(medicineAmount) || 0);
    return doc + syncMedAmount + lab + other;
  };

  const handleManualSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch('/api/student-health/students/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, schoolId })
      });
      const data = await res.json();
      setSearchResults(data.matches || []);
      setShowDropdown(true);
    } catch (err) {
      toast.error("Failed to query student database.");
    } finally {
      setSearchLoading(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error("Camera access failed", err);
      const errMessage = err?.message || err?.toString() || "Permission dismissed or failed";
      setCameraError(errMessage);
      toast.error("Camera access blocked: " + errMessage);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setCameraError(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Failed to capture image snapshot");
          return;
        }
        const file = new File([blob], `camera-receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopCamera();
        await handleFileDirect(file);
      }, 'image/jpeg', 0.95);
    }
  };

  const selectStudent = (student: StudentMatchResult) => {
    if (student.studentType !== 'HOSTELER') {
      setRejectionPopup({
        isOpen: true,
        studentName: student.studentName,
        studentType: student.studentType,
        className: student.className,
        fatherName: student.fatherName || 'N/A'
      });
      
      // Blank the associated student fields to prevent non-hostel invoicing
      setStudentId('');
      setStudentName('');
      setClassName('');
      setBatchName('');
      setAdmissionNo('');
      setFatherName('');
      setPhone('');
      setSelectedMatch(null);
      setShowDropdown(false);
      return;
    }

    setStudentId(student.studentId);
    setStudentName(student.studentName);
    setClassName(student.className);
    setBatchName(student.batchName);
    setAdmissionNo(student.admissionNumber || '');
    setStudentType(student.studentType);
    setFatherName(student.fatherName || '');
    setPhone(student.phone || '');
    toast.success(`Matched (Hosteler): ${student.studentName}`);
    setShowDropdown(false);
  };

  const handleFileDirect = async (file: File) => {
    setUploading(true);
    setOcrResult(null);
    setMatches([]);
    setSelectedMatch(null);
    setAutoAllottedInfo(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Upload to permanent assets
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!uploadRes.ok) throw new Error("File upload failed on server");
      const uploadData = await uploadRes.json();

      // 2. Process through Gemini API OCR Route
      const ocrRes = await fetch('/api/student-health/bills/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: uploadData.url,
          filePath: uploadData.filePath,
          schoolId,
          hospitalId: activeHospitalId || hospitalId
        })
      });
      if (!ocrRes.ok) {
        const errObj = await ocrRes.json().catch(() => ({}));
        throw new Error(errObj.error || "OCR reading failed");
      }

      const ocrData = await ocrRes.json();
      toast.success("AI successfully processed bill details!");

      // Prepopulate OCR extracted fields
      const res = ocrData.ocrResult;
      setOcrResult({ ...res, imageUrl: uploadData.url });
      setMatches(ocrData.matches || []);

      setBillNumber(res.billNumber || '');
      setBillDate(res.billDate || new Date().toISOString().split('T')[0]);
      setDoctorName(res.doctorName || '');
      setTreatment(res.treatmentDescription || '');
      setMedicines(res.medicines || []);
      
      setDoctorFee(String(res.doctorFee || 0));
      setLabFee(String(res.labFee || 0));
      setMedicineAmount(String(res.medicineAmount || 0));
      setOtherCharges(String(res.otherCharges || 0));

      if (ocrData.autoAllotted) {
        setAutoAllottedInfo(ocrData);
        const best = ocrData.matches[0];
        setSelectedMatch(best);
        
        // Populate inputs directly
        setStudentId(best.studentId);
        setStudentName(best.studentName);
        setClassName(best.className);
        setBatchName(best.batchName);
        setAdmissionNo(best.admissionNumber || '');
        setStudentType(best.studentType);
        setFatherName(best.fatherName || '');
        setPhone(best.phone || '');

        toast.success(`✨ System automatically allotted bill to ${best.studentName}!`);
        if (ocrData.autoAllottedStatus === "APPROVED") {
          toast.success(`💳 Balance auto-deducted from health card: ₹${ocrData.autoDeductedAmount}`);
        } else {
          toast.info("📋 Bill queued automatically for review.");
        }
      } else if (ocrData.matches && ocrData.matches.length > 0) {
        // Auto pick the best match
        const best = ocrData.matches[0];
        setSelectedMatch(best);
        selectStudent(best);
      } else {
        toast.warning("No high-confidence student matched. Please search and select manually.");
      }

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to parse receipt image.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileDirect(file);
  };

  const addMedicineRow = () => {
    if (!newMedName.trim()) return;
    const item: HealthMedicineItem = {
      name: newMedName,
      quantity: newMedQty || '1',
      amount: Number(newMedQtyPrice) || 0
    };
    setMedicines([...medicines, item]);
    setNewMedName('');
    setNewMedQty('');
    setNewMedQtyPrice('0');
  };

  const removeMedicineRow = (idx: number) => {
    setMedicines(medicines.filter((_, i) => i !== idx));
  };

  const handleSubmitBill = async () => {
    if (!studentId) {
      toast.error("Please associate a student before completing invoicing.");
      return;
    }
    if (studentType !== 'HOSTELER') {
      toast.error("Rejected: The Student Health module only processes and accepts invoices for Hostel students.");
      return;
    }
    if (!treatment.trim()) {
      toast.error("Treatment description is mandatory.");
      return;
    }

    const total = calculateTotal();
    if (total <= 0) {
      toast.error("Total bill amount must exceed zero.");
      return;
    }

    try {
      const res = await fetch('/api/student-health/bills/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          role,
          schoolId,
          hospitalId: activeHospitalId || hospitalId,
          studentId,
          studentName,
          className,
          batchName,
          admissionNumber: admissionNo,
          studentType,
          fatherName,
          phone,

          billNumber,
          billDate,
          doctorName,
          treatmentDescription: treatment,
          medicines,

          doctorFee: Number(doctorFee) || 0,
          medicineAmount: Number(medicineAmount) || 0,
          labFee: Number(labFee) || 0,
          otherCharges: Number(otherCharges) || 0,
          totalAmount: total,

          imageUrl: ocrResult?.imageUrl || '',
          ocrRawText: ocrResult?.rawText || '',
          ocrConfidence: ocrResult?.confidence || 0,
          ocrWarnings: ocrResult?.warnings || [],
          entryMode: entryMode === 'OCR' ? 'OCR_UPLOAD' : 'MANUAL'
        })
      });

      if (!res.ok) throw new Error("Invoicing submission failed");

      toast.success("Medical invoice successfully compiled and queued for review!");
      
      // Reset State
      setOcrResult(null);
      setMatches([]);
      setSelectedMatch(null);
      setAutoAllottedInfo(null);
      setStudentId('');
      setStudentName('');
      setClassName('');
      setBatchName('');
      setAdmissionNo('');
      setFatherName('');
      setPhone('');
      setBillNumber('');
      setDoctorName('');
      setTreatment('');
      setMedicines([]);
      setDoctorFee('0');
      setMedicineAmount('0');
      setLabFee('0');
      setOtherCharges('0');

    } catch (err) {
      toast.error("Failed to post medical invoice.");
    }
  };

  return (
    <div className="space-y-8" id="health-billing-hub-block">
      {/* Selector tab */}
      <div className="flex bg-neutral-200/90 border border-neutral-300/50 p-1.5 rounded-3xl w-fit mb-8 gap-2 shadow-inner" id="billing-hub-mode-selector">
        <button
          type="button"
          onClick={() => { setEntryMode('OCR'); }}
          className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
            entryMode === 'OCR' 
              ? 'bg-rose-600 text-white shadow-md shadow-rose-200' 
              : 'text-zinc-900 bg-white/40 hover:text-rose-600 hover:bg-white border border-transparent'
          }`}
          id="billing-mode-ocr-btn"
        >
          ✨ AI OCR Bill Reader
        </button>
        <button
          type="button"
          onClick={() => { setEntryMode('MANUAL'); }}
          className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
            entryMode === 'MANUAL' 
              ? 'bg-rose-600 text-white shadow-md shadow-rose-200' 
              : 'text-zinc-900 bg-white/40 hover:text-rose-600 hover:bg-white border border-transparent'
          }`}
          id="billing-mode-manual-btn"
        >
          📝 Standard Manual entry
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Upload or Student lookup */}
        <div className="lg:col-span-4 space-y-6">
          {entryMode === 'OCR' ? (
            <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col items-center justify-center text-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />

              {isCameraActive ? (
                <div className="fixed inset-0 bg-zinc-950 z-[9999] flex flex-col text-white select-none overflow-hidden animate-fade-in" id="full-screen-camera-scanner-window">
                  {/* IMMERSIVE LIVE VIDEO CAMERA STREAM (Background Layer) */}
                  <video 
                    ref={(el) => {
                      // Keep internal state ref updated
                      (videoRef as any).current = el;
                      if (el && streamRef.current && el.srcObject !== streamRef.current) {
                        el.srcObject = streamRef.current;
                        el.play().catch(err => console.error("Video stream playback failure:", err));
                      }
                    }}
                    className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" 
                    playsInline 
                    muted 
                  />

                  {/* Backdrop overlay for focus framing */}
                  <div className="absolute inset-0 bg-black/[0.15] z-0 pointer-events-none" />

                  {/* Glassmorphic TOP Header Bar (Normal Flow sibling to preserve exact viewport spacing) */}
                  <div className="relative bg-neutral-900/85 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-white/10 z-10 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center animate-pulse shadow-md shadow-rose-900">
                        <Camera className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-100 flex items-center gap-2">
                          Clinical Receipt AI Scanner
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black px-2 py-0.5 rounded-full animate-pulse uppercase tracking-widest">Live</span>
                        </h3>
                        <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Place invoice parallel to screen for automatic precision document parsing</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="p-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-full border border-white/10 cursor-pointer transition-all hover:scale-105 active:scale-95"
                      title="Close Scanner"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* ACTIVE CENTER VIEWPORT (Takes up 100% of remaining available space between header and footer) */}
                  <div className="relative flex-1 flex items-center justify-center z-10 p-6 min-h-0 bg-black/10">
                    {/* Scanning Target Framing Guides overlay */}
                    <div className="w-[82vw] md:w-[55vw] max-w-sm aspect-[3/4] max-h-full border-2 border-dashed border-rose-500/80 rounded-3xl bg-black/25 relative z-10 shadow-[0_0_80px_rgba(244,63,94,0.15)] flex flex-col justify-between p-6 pointer-events-none animate-scale-up">
                      {/* 4 corner bracket styles for visual structure high-end scanner accent */}
                      <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-rose-500 rounded-tl-2xl" />
                      <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-rose-500 rounded-tr-2xl" />
                      <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-rose-500 rounded-bl-2xl" />
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-rose-500 rounded-br-2xl" />

                      {/* Scanning laser line beam animation */}
                      <div className="w-full h-0.5 bg-rose-500 opacity-80 shadow-[0_0_15px_rgba(244,63,94,0.9)] absolute top-0 inset-x-0 animate-bounce transition-all rounded-full animate-duration-[4000ms]" />

                      <div className="text-center mt-3">
                        <span className="text-[9px] font-black tracking-widest text-rose-500 bg-rose-950/80 border border-rose-500/30 px-3.5 py-1 rounded-full uppercase shadow-lg">Verify Framing</span>
                      </div>
                      <div className="text-center mb-3 space-y-1 bg-black/40 p-2.5 rounded-xl backdrop-blur-sm border border-white/5">
                        <p className="text-xs text-rose-400 font-extrabold uppercase tracking-wider animate-pulse">Scanning Window Active</p>
                        <p className="text-[10px] text-zinc-300 font-bold tracking-tight">Keep invoices steady and well-lit</p>
                      </div>
                    </div>
                  </div>

                  {/* BOTTOM Control Hub & Action Shutter (Normal Flow sibling to preserve exact viewport spacing) */}
                  <div className="relative bg-neutral-900/95 backdrop-blur-md pb-8 pt-6 px-6 flex flex-col items-center gap-4 border-t border-white/10 z-10 shrink-0">
                    <div className="flex items-center justify-center gap-12 w-full max-w-md">
                      {/* Left: Cancel button */}
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all cursor-pointer"
                      >
                        Cancel
                      </button>

                      {/* Center: Large Shutter Trigger */}
                      <div className="relative flex items-center justify-center">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="w-20 h-20 border-4 border-white/90 rounded-full flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-[0_0_25px_rgba(255,255,255,0.2)] bg-transparent z-10"
                          title="Snap Invoice"
                        >
                          <div className="w-14 h-14 bg-rose-600 hover:bg-rose-500 rounded-full flex items-center justify-center text-white scale-95 hover:scale-100 transition-all">
                            <Camera className="w-6 h-6 text-white" />
                          </div>
                        </button>
                        {/* Animated pulsing outer rings */}
                        <div className="absolute inset-0 border border-rose-500/40 rounded-full animate-ping scale-110 pointer-events-none" style={{ animationDuration: '2s' }} />
                      </div>

                      {/* Right: Dummy Tips button or file trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          stopCamera();
                          fileInputRef.current?.click();
                        }}
                        className="text-xs font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Browse
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                      Gemini flash leverages instant schema-aware JSON structure parsing
                    </div>
                  </div>
                </div>
              ) : uploading ? (
                <div className="w-full border-2 border-dashed border-rose-300 rounded-[2rem] p-12 bg-rose-50/10 flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-rose-500 animate-spin mb-4" />
                  <h4 className="font-extrabold text-sm text-zinc-700 uppercase tracking-wider animate-pulse">AI model analyzing bill</h4>
                  <p className="text-zinc-400 text-xs mt-1">Extracting treatment and medication matrices...</p>
                </div>
              ) : (
                <div 
                  className="w-full border-2 border-dashed border-zinc-200 hover:border-rose-300 rounded-[2rem] p-10 transition-all hover:bg-rose-50/5 flex flex-col items-center justify-center"
                  id="ocr-upload-drag-area"
                >
                  <Upload className="w-12 h-12 text-zinc-300 mb-4" />
                  <h4 className="font-black text-sm text-zinc-700 uppercase tracking-widest">Select Invoice Photo</h4>
                  <p className="text-zinc-400 text-[11px] mb-4 font-semibold leading-relaxed">
                    Supports JPEG, PNG & WebP bills.<br />Gemini auto-extracts fields.
                  </p>
                  
                  <div className="flex gap-3 w-full max-w-[280px]">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-black rounded-xl text-[10px] uppercase tracking-wider transition-all border border-zinc-200"
                    >
                      Browse Files
                    </button>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all shadow-md shadow-rose-100"
                    >
                      Use Camera
                    </button>
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="mt-4 p-4 text-left rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 space-y-2 animate-fade-in text-[11px] font-semibold leading-relaxed">
                  <div className="flex items-center gap-1.5 text-amber-800 font-extrabold uppercase tracking-wide text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
                    CAMERA STREAM RESTRICTED
                  </div>
                  <p>
                    Iframe browser sandbox has restricted live media capture ({cameraError}).
                  </p>
                  <p className="text-zinc-600 font-medium">
                    💡 <strong className="text-zinc-800 font-black">How to fix:</strong> Click the <strong>"Open in dynamic tab"</strong> icon in the header or top-right of your preview panel to bypass iframe browser sandbox rules, or click <strong>"Browse Files"</strong> to choose your bill photo directly.
                  </p>
                </div>
              )}

              {ocrResult?.imageUrl && (
                <div className="mt-6 w-full animate-fade-in animate-duration-300">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Original Receipt Preview</p>
                  <img 
                    src={ocrResult.imageUrl} 
                    alt="Receipt" 
                    className="w-full max-h-48 object-contain rounded-2xl border border-zinc-100 shadow-sm"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-sm font-black text-zinc-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Search className="w-4 h-4 text-rose-500" />
                Find Student Card
              </h3>
              <p className="text-xs text-zinc-400 mb-4 font-semibold leading-relaxed">
                Retrieve student records instantly from the school database using student's name, father's name, contact phone, or mobile number.
              </p>
              
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type Student Name, Father, or Mobile..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleManualSearch();
                      }
                    }}
                    className="flex-1 text-sm bg-zinc-50 border border-zinc-150 rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-400 font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleManualSearch}
                    disabled={searchLoading}
                    className="px-5 bg-rose-500 text-white font-bold rounded-2xl text-xs uppercase tracking-wider hover:bg-rose-600 transition-colors disabled:opacity-50"
                  >
                    {searchLoading ? "..." : "Search"}
                  </button>
                </div>

                {/* Interactive Autocomplete suggestions dropdown absolute overlay */}
                {searchQuery.trim().length >= 2 && showDropdown && (
                  <div className="absolute left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-3xl shadow-xl z-50 max-h-80 overflow-y-auto divide-y divide-zinc-55 p-2">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-6 text-xs text-zinc-400 gap-2 font-bold">
                        <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                        <span>Searching student directory...</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 text-xs text-center text-zinc-400 font-bold">
                        No matches found. Check spelling or try father's name.
                      </div>
                    ) : (
                      searchResults.map((match) => (
                        <div
                          key={match.studentId}
                          onClick={() => {
                            selectStudent(match);
                            setShowDropdown(false);
                          }}
                          className="p-3.5 hover:bg-rose-50/10 active:bg-rose-50/20 rounded-2xl cursor-pointer transition-all flex items-start gap-3 text-left group"
                        >
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-sm text-zinc-800">{match.studentName}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${match.studentType === 'HOSTELER' ? 'bg-amber-100/80 text-amber-700' : 'bg-sky-100/80 text-sky-700'}`}>
                                {match.studentType === 'HOSTELER' ? "🏰 Hosteler" : "🏠 Day Scholar"}
                              </span>
                            </div>
                            <p className="text-[11px] font-bold text-zinc-500">
                              {match.className || 'N/A'} - {match.batchName || 'N/A'}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-semibold mt-1 bg-zinc-50/50 p-1 rounded-md">
                              <span className="font-extrabold uppercase text-[8px] text-zinc-400">Father:</span> <span className="text-zinc-650 truncate max-w-[110px]">{match.fatherName || 'N/A'}</span>
                              <span className="text-zinc-300">|</span>
                              <span className="font-extrabold uppercase text-[8px] text-zinc-400">Mobile:</span> <span className="text-zinc-655 font-mono">{match.phone || 'N/A'}</span>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-rose-500 transition-colors shrink-0 self-center" />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Keep manual list underneath so users see selected student or fallback */}
              {!showDropdown && searchResults.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Selected Matches</p>
                  {searchResults.slice(0, 3).map((match) => (
                    <div
                      key={match.studentId}
                      onClick={() => selectStudent(match)}
                      className="p-4 rounded-3xl bg-zinc-50 hover:bg-rose-50/10 border border-zinc-100 hover:border-rose-100 transition-all cursor-pointer flex justify-between items-start"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-sm text-zinc-800">{match.studentName}</h4>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${match.studentType === 'HOSTELER' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                            {match.studentType === 'HOSTELER' ? "🏰 Hosteler" : "🏠 Day Scholar"}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-zinc-500">
                          Class: <span className="text-zinc-700 font-bold">{match.className || 'N/A'}</span> &bull; Batch: <span className="text-zinc-700 font-bold">{match.batchName || 'N/A'}</span>
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-semibold mt-1 bg-zinc-100/50 px-2.5 py-1 rounded-lg">
                          <span className="font-extrabold uppercase text-[8px] text-zinc-400">Father:</span> <span className="text-zinc-600 font-bold">{match.fatherName || 'N/A'}</span>
                          {match.phone && (
                            <>
                              <span className="text-zinc-300">|</span>
                              <span className="font-extrabold uppercase text-[8px] text-zinc-400">Mobile:</span> <span className="text-zinc-600 font-mono">{match.phone}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-rose-450 shrink-0 self-center" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Matches candidates block */}
          {entryMode === 'OCR' && matches.length > 0 && (
            <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
              <h4 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-rose-500 animate-pulse" />
                AI matched student profile
              </h4>
              <div className="space-y-3">
                {matches.map((m) => {
                  const isCurMatch = m.studentId === studentId;
                  return (
                     <div
                      key={m.studentId}
                      onClick={() => selectStudent(m)}
                      className={`p-4 rounded-3xl border cursor-pointer transition-all ${isCurMatch ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-zinc-50 border-transparent text-zinc-705'}`}
                     >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs uppercase tracking-widest bg-white shadow-sm px-2.5 py-1 rounded-full text-zinc-500">
                          Match score: {Math.round(m.confidence * 100)}%
                        </span>
                        {isCurMatch && <Check className="w-4 h-4 text-rose-500" />}
                      </div>
                      <h5 className="font-black text-sm mt-2">{m.studentName}</h5>
                      <span className="text-xs font-semibold block mt-0.5">Class: {m.className} &bull; Batch: {m.batchName}</span>
                      <div className="text-[10px] text-zinc-405 font-bold mt-1 bg-zinc-100/50 px-2 py-1 rounded-lg inline-block">
                        <span className="font-extrabold uppercase text-[8px] text-zinc-400">Father:</span> {m.fatherName || 'N/A'}
                      </div>
                     </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Detailed Invoicing Entry Form */}
        <div className="lg:col-span-8 bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm space-y-6">
          <div className="border-b border-zinc-100 pb-4">
            <h3 className="text-base font-black text-zinc-800 uppercase tracking-widest">Compiler Panel</h3>
            <p className="text-zinc-400 text-xs mt-1">Refine medication lists and amount breakdowns beforehand.</p>
          </div>

          {autoAllottedInfo && (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-[2rem] space-y-3 shadow-md shadow-green-100"
            >
              <div className="flex items-center gap-2 text-emerald-800 font-extrabold uppercase tracking-wider text-[11px]">
                <Sparkles className="w-4 h-4 text-emerald-500 animate-spin" />
                <span>✨ Spark AI Automated Match &amp; Allotment</span>
              </div>
              <p className="text-xs text-zinc-700 leading-relaxed font-semibold">
                I have identified a high-confidence matching student <strong>{autoAllottedInfo.autoAllottedBill?.studentName}</strong> (Class: {autoAllottedInfo.autoAllottedBill?.className}, Batch: {autoAllottedInfo.autoAllottedBill?.batchName}) and <strong className="text-emerald-700">automatically allotted the medical invoice balance</strong>.
              </p>
              {autoAllottedInfo.autoAllottedStatus === "APPROVED" ? (
                <div className="p-3 bg-white/90 border border-green-100 rounded-xl flex justify-between items-center text-xs font-bold text-emerald-800">
                  <span>Deducted from Health Card Balance:</span>
                  <span className="font-black text-sm text-emerald-600 font-mono">₹{autoAllottedInfo.autoDeductedAmount}</span>
                </div>
              ) : (
                <div className="p-3 bg-white/90 border border-amber-100 rounded-xl flex justify-between items-center text-xs font-bold text-amber-800">
                  <span>Bill status:</span>
                  <span className="font-black text-xs uppercase tracking-wider text-amber-600">Queued for Review</span>
                </div>
              )}
              <div className="flex justify-between text-[11px] text-zinc-500 pt-2 font-bold border-t border-emerald-100">
                <span>Extra Dues: ₹{autoAllottedInfo.autoDuesAmount}</span>
                <span>Bill ID: {autoAllottedInfo.autoAllottedBill?.id.substring(0, 8)}...</span>
              </div>
            </motion.div>
          )}

          {/* Core Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400">Student Associate</label>
                {studentName && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentId('');
                      setStudentName('');
                      setClassName('');
                      setBatchName('');
                      setAdmissionNo('');
                      setFatherName('');
                      setPhone('');
                      setSelectedMatch(null);
                      toast.info("Cleared student association.");
                    }}
                    className="text-rose-500 hover:text-rose-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete & Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                readOnly
                value={studentName ? `${studentName} (${className} - ${batchName})` : "No Student Associated"}
                className={`w-full text-sm font-semibold rounded-2xl px-4 py-3 bg-zinc-50 border ${studentName ? 'border-zinc-200 text-zinc-800' : 'border-rose-100 text-rose-500 animate-pulse'}`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Clinical Provider (Hospital) *</label>
              {!hospitalId ? (
                <select
                  value={activeHospitalId}
                  onChange={(e) => setActiveHospitalId(e.target.value)}
                  className="w-full text-sm bg-zinc-50 border border-zinc-150 rounded-2xl px-4 py-3.5 focus:outline-none font-bold text-zinc-700"
                >
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.hospitalName}
                    </option>
                  ))}
                  {hospitals.length === 0 && (
                    <option value="">St. Antony's Hospital</option>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  value={hospitals.find(h => h.id === hospitalId)?.hospitalName || "St. Antony's Hospital"}
                  className="w-full text-sm font-semibold rounded-2xl px-4 py-3 bg-zinc-50 border border-zinc-150 text-zinc-800"
                />
              )}
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Residence Status</label>
              <div className="relative">
                <span className={`inline-flex px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest ${studentType === 'HOSTELER' ? 'bg-amber-100 text-amber-700 animate-fade-in' : 'bg-sky-100 text-sky-700 animate-fade-in'}`}>
                  {studentType === 'HOSTELER' ? "🏰 Hosteler" : "🏠 Day Scholar"}
                </span>
              </div>
            </div>
          </div>

          {/* Identified Student Card metadata */}
          {studentId && (
            <div className="p-5 rounded-3xl bg-amber-50/70 border border-amber-200/80 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in shadow-sm" id="auto-identified-student-card-overlay">
              <div className="col-span-2 md:col-span-4 flex items-center justify-between border-b border-amber-200/50 pb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 font-extrabold">Auto-Identified Student Card Records</span>
                <span className="text-[9px] font-black text-amber-700 bg-white/90 border border-amber-200 px-2.5 py-1 rounded-md">ID: {studentId}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Student Class</span>
                <span className="text-xs font-black text-zinc-800 bg-white border border-zinc-150 px-3 py-2 rounded-xl block mt-1 tracking-tight">{className || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Student Batch</span>
                <span className="text-xs font-black text-zinc-800 bg-white border border-zinc-150 px-3 py-2 rounded-xl block mt-1 tracking-tight">{batchName || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Father's Name</span>
                <span className="text-xs font-black text-zinc-800 bg-white border border-zinc-150 px-3 py-2 rounded-xl block mt-1 tracking-tight">{fatherName || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Mobile Number</span>
                <span className="text-xs font-black font-mono text-zinc-800 bg-white border border-zinc-150 px-3 py-2 rounded-xl block mt-1">{phone || 'N/A'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Invoice Number</label>
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Invoice Date</label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Attending Doctor</label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Treatment Description *</label>
            <input
              type="text"
              placeholder="e.g., Fever Consultation"
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
            />
          </div>

          {/* Medicines Entry */}
          <div className="p-6 bg-zinc-50/50 border border-zinc-100 rounded-3xl">
            <h4 className="text-xs font-black uppercase tracking-widest text-zinc-700 mb-4">Prescribed Medicines</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Medicine Name..."
                value={newMedName}
                onChange={(e) => setNewMedName(e.target.value)}
                className="text-sm bg-white border border-zinc-150 rounded-xl px-3 py-2 focus:outline-none placeholder-zinc-400 font-medium col-span-1 md:col-span-1"
              />
              <input
                type="text"
                placeholder="Qty (e.g. 10)"
                value={newMedQty}
                onChange={(e) => setNewMedQty(e.target.value)}
                className="text-sm bg-white border border-zinc-150 rounded-xl px-3 py-2 focus:outline-none placeholder-zinc-400 font-medium"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Price"
                  value={newMedQtyPrice}
                  onChange={(e) => setNewMedQtyPrice(e.target.value)}
                  className="text-sm bg-white border border-zinc-150 rounded-xl px-3 py-2 focus:outline-none placeholder-zinc-400 font-medium flex-1"
                />
                <button
                  type="button"
                  onClick={addMedicineRow}
                  className="p-2 bg-rose-500 rounded-xl text-white hover:bg-rose-600 transition-colors shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {medicines.length > 0 && (
              <table className="w-full mt-4 text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-2 font-bold text-zinc-500">Name</th>
                    <th className="pb-2 font-bold text-zinc-500">Qty</th>
                    <th className="pb-2 font-bold text-zinc-500">Amount</th>
                    <th className="pb-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((m, idx) => (
                    <tr key={idx} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                      <td className="py-2.5 font-extrabold text-zinc-800">{m.name}</td>
                      <td className="py-2.5 font-semibold text-zinc-500">{m.quantity}</td>
                      <td className="py-2.5 font-extrabold text-zinc-800">₹{m.amount}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeMedicineRow(idx)}
                          className="text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Invoicing Amounts breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Doctor Fees (₹)</label>
              <input
                type="number"
                value={doctorFee}
                onChange={(e) => setDoctorFee(e.target.value)}
                className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Medicine Cost (₹)</label>
              <input
                type="number"
                value={medicineAmount}
                onChange={(e) => setMedicineAmount(e.target.value)}
                disabled={medicines.length > 0} // lock if they used medicine rows table
                className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Lab Charges (₹)</label>
              <input
                type="number"
                value={labFee}
                onChange={(e) => setLabFee(e.target.value)}
                className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Other Fees (₹)</label>
              <input
                type="number"
                value={otherCharges}
                onChange={(e) => setOtherCharges(e.target.value)}
                className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-zinc-400 text-xs uppercase tracking-widest font-black block">Total Invoice Valuation</span>
              <span className="text-3xl font-black text-rose-500 tracking-tight">₹{calculateTotal()}</span>
            </div>
            <button
              onClick={handleSubmitBill}
              className="px-8 py-4 bg-rose-500 rounded-2xl text-white font-black uppercase tracking-wider hover:bg-rose-600 transition-colors text-xs shrink-0 shadow-lg shadow-rose-200"
              id="submit-medical-bill-btn"
            >
              Submit for Admin Review
            </button>
          </div>
        </div>
      </div>

      {/* Rejection Alert Modal Popup for Day Scholars / Non-Hostelers */}
      <AnimatePresence>
        {rejectionPopup?.isOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            {/* Backdrop with elegant blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRejectionPopup(null)}
              className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md"
            />
            
            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-8 shadow-2xl border border-zinc-150 overflow-hidden z-10"
              id="student-rejection-modal-vault"
            >
              {/* Corner abstract decoration pattern */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
              
              <div className="flex flex-col items-center text-center space-y-6">
                {/* Warning Shield Circular Badge */}
                <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center border-2 border-rose-100 shadow-inner relative">
                  <ShieldAlert className="w-8 h-8 text-rose-500 animate-bounce" />
                  <div className="absolute inset-0 rounded-full border border-rose-500/20 animate-ping" />
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                    Admission Access Blocked
                  </span>
                  <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">
                    Billing Rejected
                  </h3>
                  <p className="text-zinc-500 text-xs font-semibold max-w-sm leading-relaxed">
                    St. Antony's Student Health module is strictly configured to accept <span className="text-zinc-800 font-extrabold underline decoration-rose-500 decoration-2">Hostel Boarders only</span>. Invoices, treatment summaries, and medicine dispensaries for Day Scholar students cannot be billed under this registry.
                  </p>
                </div>

                {/* Non-Eligible Student Profile Display */}
                <div className="w-full bg-zinc-50 border border-zinc-150 rounded-2xl p-5 space-y-3 text-left">
                  <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-2">
                    Ineligible Record Profile Summary
                  </p>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-semibold">
                    <div>
                      <p className="text-[9px] text-zinc-400 uppercase tracking-wider">Student Name</p>
                      <p className="text-zinc-800 font-black mt-0.5">{rejectionPopup.studentName}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-400 uppercase tracking-wider">Current Classification</p>
                      <span className="inline-block px-2 py-0.5 mt-0.5 bg-sky-100/80 text-sky-700 text-[10px] font-black uppercase tracking-wider rounded-md border border-sky-200">
                        🏠 Day Scholar
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-400 uppercase tracking-wider">Class / Grade</p>
                      <p className="text-zinc-800 font-black mt-0.5">{rejectionPopup.className || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-400 uppercase tracking-wider">Father's Name</p>
                      <p className="text-zinc-800 font-bold mt-0.5">{rejectionPopup.fatherName}</p>
                    </div>
                  </div>
                </div>

                {/* Button Action */}
                <button
                  type="button"
                  onClick={() => setRejectionPopup(null)}
                  className="w-full py-3.5 bg-zinc-900 border border-zinc-950 hover:bg-zinc-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                >
                  Dismiss & Clear Selection
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
