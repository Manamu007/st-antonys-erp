import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Upload, Sparkles, AlertCircle, CheckCircle2, Loader2, User, Save, RefreshCcw, Trash2, Plus } from 'lucide-react';
import { identifyPeopleFromPhoto } from '../services/aiService';
import { toast } from 'sonner';

interface SmartAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  people: any[];
  type?: 'student' | 'staff';
  onMarkAttendance: (ids: string[]) => void;
}

const SmartAttendanceModal: React.FC<SmartAttendanceModalProps> = ({
  isOpen,
  onClose,
  people,
  type = 'student',
  onMarkAttendance
}) => {
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [identifiedIds, setIdentifiedIds] = useState<string[]>([]);
  const [pendingFaces, setPendingFaces] = useState<any[]>([]);
  const [selectedPending, setSelectedPending] = useState<any | null>(null);
  const [showCamera, setShowCamera] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && showCamera) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, showCamera, facingMode]);

  const startCamera = async () => {
    setCameraLoading(true);
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraLoading(false);
    } catch (err: any) {
      console.error("Camera access error:", err);
      toast.error("Could not access camera. Falling back to upload.");
      setShowCamera(false);
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      toast.error("Camera is still warming up. Please wait and try again.");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if using front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImages(prev => [...prev, base64]);
    toast.success("Photo captured!");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: any) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setCapturedImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
      toast.success(`${files.length} photos added!`);
      setShowCamera(false);
    }
  };

  const removePhoto = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
    if (capturedImages.length <= 1) {
      setIdentifiedIds([]);
      setPendingFaces([]);
      setSelectedPending(null);
    }
  };

  if (!isOpen) return null;

  const startAnalysis = async () => {
    if (capturedImages.length === 0) return;
    setIsAnalyzing(true);
    toast.info(`AI is analyzing ${capturedImages.length} photos to identify ${type === 'staff' ? 'staff members' : 'students'}...`);

    try {
      const allIdentified = new Set<string>();
      const allPending: any[] = [];

      // Process each image
      for (const img of capturedImages) {
        const result = await identifyPeopleFromPhoto(img, people, type as 'student' | 'staff');
        (result.identified || []).forEach((id: string) => allIdentified.add(id));
        if (result.pending && result.pending.length > 0) {
          allPending.push(...result.pending);
        }
      }

      setIdentifiedIds(Array.from(allIdentified));
      setPendingFaces(allPending);
      
      if (allIdentified.size > 0) {
        toast.success(`Successfully identified ${allIdentified.size} ${type === 'staff' ? 'staff members' : 'students'}!`);
      } else {
        toast.info("No identified individuals found. You might need to verify pending faces.");
      }
      
      if (allPending.length > 0) {
        toast.warning(`${allPending.length} faces need manual verification.`);
      }
    } catch (error) {
      toast.error("Failed to analyze photos. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirm = () => {
    onMarkAttendance(identifiedIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl my-8 overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[95vh]">
        <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-primary text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">AI Smart Attendance</h2>
              <p className="text-xs text-white/70 font-medium">Automatic face recognition through live camera</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* Left Panel: Camera/Capture */}
          <div className="flex-1 p-6 border-r border-neutral-100 overflow-y-auto custom-scrollbar">
            {showCamera ? (
              <div className="space-y-4">
                <div className="relative rounded-3xl overflow-hidden bg-black aspect-video shadow-2xl border-4 border-neutral-100 group">
                  {cameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-neutral-900 z-10">
                      <Loader2 className="w-10 h-10 animate-spin text-primary mb-2" />
                      <p className="text-sm font-bold opacity-60">Waking up camera...</p>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                  />
                  
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button 
                      onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                      className="p-3 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-2xl text-white transition-all border border-white/20"
                      title="Switch Camera"
                    >
                      <RefreshCcw className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={() => setShowCamera(false)}
                      className="p-3 bg-red-500/40 hover:bg-red-500/60 backdrop-blur-md rounded-2xl text-white transition-all border border-white/20"
                      title="Stop Camera"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
                    <button 
                      type="button"
                      onClick={() => {
                        handleCapture();
                        setTimeout(() => startAnalysis(), 500);
                      }}
                      className="px-8 py-3 bg-white text-primary rounded-2xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 border-2 border-primary"
                    >
                      <Sparkles className="w-5 h-5" />
                      Capture & Analyze
                    </button>
                    <button 
                      type="button"
                      onClick={handleCapture}
                      className="w-20 h-20 bg-white/20 backdrop-blur-md border-4 border-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-2xl group"
                    >
                      <div className="w-14 h-14 bg-white rounded-full transition-transform group-hover:scale-90" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-center">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Live Classroom View</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] border-4 border-dashed border-neutral-100 rounded-[2.5rem] bg-neutral-50/50 space-y-6">
                <div className="w-24 h-24 rounded-[2rem] bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Camera className="w-12 h-12" />
                </div>
                <div className="text-center">
                  <h3 className="font-black text-xl text-sidebar">Ready to capture?</h3>
                  <p className="text-sm text-neutral-500 max-w-[250px] mx-auto mt-2">Take live photos of the classroom or upload existing ones for AI analysis.</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowCamera(true)}
                    className="px-8 py-4 bg-primary text-white rounded-2xl font-black hover:bg-sidebar transition-all flex items-center gap-3 shadow-xl shadow-primary/20"
                  >
                    <Camera className="w-6 h-6" />
                    Start Camera
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-8 py-4 bg-white text-neutral-600 border border-neutral-200 rounded-2xl font-black hover:bg-neutral-50 transition-all flex items-center gap-3 shadow-sm"
                  >
                    <Upload className="w-6 h-6" />
                    Upload
                  </button>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Captured Photos & Analysis */}
          <div className="w-full lg:w-96 bg-neutral-50/50 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sidebar flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Captured Photos ({capturedImages.length})
              </h3>
              {capturedImages.length > 0 && (
                <button 
                  onClick={() => setShowCamera(true)}
                  className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                  title="Take more"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {capturedImages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-3xl p-6 text-center text-neutral-400">
                <Sparkles className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-xs font-bold uppercase tracking-widest leading-loose">No photos captured yet.<br/>Use camera to start.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {capturedImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-neutral-200 group shadow-sm bg-white">
                      <img src={img} alt={`Capture ${idx}`} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {!isAnalyzing && (
                  <button 
                    onClick={startAnalysis}
                    className="w-full py-4 bg-sidebar text-white rounded-2xl font-black hover:bg-primary transition-all shadow-xl shadow-sidebar/20 flex items-center justify-center gap-3 animate-bounce-subtle"
                  >
                    <Sparkles className="w-6 h-6" />
                    Identify {type === 'staff' ? 'Members' : 'Students'}
                  </button>
                )}

                {isAnalyzing && (
                  <div className="p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm flex flex-col items-center text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <div>
                      <p className="font-bold text-sidebar">AI is analyzing...</p>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mt-1">Cross-referencing faces</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Analysis Results Summary */}
            {(identifiedIds.length > 0 || pendingFaces.length > 0) && (
              <div className="space-y-4 pt-4 border-t border-neutral-200 animate-in slide-in-from-bottom-4">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">Identified</p>
                  <p className="text-2xl font-black text-emerald-700 leading-none">{identifiedIds.length}</p>
                </div>

                {pendingFaces.length > 0 && (
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                       Verification Needed
                    </p>
                    <p className="text-2xl font-black text-amber-700 leading-none">{pendingFaces.length}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-8 py-4 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-black hover:bg-neutral-100 transition-all active:scale-95 shadow-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={identifiedIds.length === 0 || isAnalyzing}
            className="flex-2 px-12 py-4 bg-primary text-white rounded-2xl font-black hover:bg-sidebar transition-all shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-95"
          >
            <Save className="w-6 h-6" />
            Complete & Mark {identifiedIds.length} Present
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartAttendanceModal;
