import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, RefreshCcw, Loader2, AlertCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { uploadService } from '../services/uploadService';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}

const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title = 'Capture Photo'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    setLoading(true);
    setError(null);
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      let mediaStream: MediaStream;
      
      // Attempt 1: High quality ideal constraints
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (err1) {
        console.warn("Attempt 1 failed, trying without ideal dimensions:", err1);
        // Attempt 2: Simple facing mode
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } }
          });
        } catch (err2) {
          console.warn("Attempt 2 failed, trying with generic video: true:", err2);
          // Attempt 3: Pure video fallback
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true
          });
        }
      }
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setLoading(false);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setError("Could not access browser camera. You can use your phone's native camera instead!");
      setLoading(false);
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

    setProcessingImage(true);
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setProcessingImage(false);
      return;
    }

    // Flip horizontally if using front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        try {
          // Preprocess to standard 3:4 ID Card format
          const processedFile = await uploadService.processProfileImage(file);
          onCapture(processedFile);
          onClose();
        } catch (cropErr) {
          console.error("Failed to crop image:", cropErr);
          onCapture(file); // fallback to raw
          onClose();
        }
      }
      setProcessingImage(false);
    }, 'image/jpeg', 0.9);
  };

  const triggerNativeCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleNativeCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProcessingImage(true);
      try {
        const processedFile = await uploadService.processProfileImage(file);
        onCapture(processedFile);
        onClose();
      } catch (err) {
        console.error("Failed to process native captured image", err);
        onCapture(file);
        onClose();
      } finally {
        setProcessingImage(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
          className="bg-white rounded-3xl shadow-2xl relative w-full max-w-[92vw] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col overflow-hidden z-10 mx-auto"
        >
          {/* Hidden native input for mobile system camera */}
          <input 
            ref={fileInputRef} 
            type="file" 
            accept="image/*" 
            capture="user" 
            className="hidden" 
            onChange={handleNativeCapture} 
          />

          <div className="p-4 sm:p-5 border-b border-neutral-100 flex justify-between items-center bg-sidebar text-white shrink-0">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-3">
              <Camera className="w-5 h-5" />
              {title}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Fluid responsive video container that adjusts dynamically based on available screen space */}
          <div className="relative w-full flex flex-col items-center justify-center py-6 px-4 bg-neutral-900 shrink-0">
            {error ? (
              <div className="flex flex-col items-center justify-center text-center gap-2.5 p-4 max-w-xs">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Camera Access Blocked</h3>
                <p className="text-[10px] text-neutral-400 leading-relaxed">
                  Browser security or frame constraints blocked webcam. Tap below to use your device's native camera.
                </p>
                <button 
                  onClick={triggerNativeCamera}
                  className="mt-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all text-xs uppercase tracking-wider"
                >
                  <Camera className="w-4 h-4" />
                  Use Native Camera
                </button>
              </div>
            ) : (
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden border-4 border-white/95 shadow-2xl bg-black flex items-center justify-center shrink-0">
                {loading && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/95 text-white gap-2 p-4 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <p className="text-[10px] font-medium opacity-75">Starting camera...</p>
                  </div>
                )}

                {processingImage && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/95 text-white gap-2 p-4 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <p className="text-[10px] font-bold text-indigo-400">Processing...</p>
                  </div>
                )}

                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                />
              </div>
            )}
            
            {!loading && !error && (
              <button 
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md rounded-xl text-white transition-all border border-white/10 z-10 shadow-lg"
                title="Switch Camera"
              >
                <RefreshCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sticky, non-scrollable control bar at the bottom */}
          <div className="p-4 sm:p-5 bg-neutral-50 flex flex-col items-center gap-2 sm:gap-3 shrink-0 border-t border-neutral-100">
            {!error ? (
              <>
                <button 
                  onClick={handleCapture}
                  disabled={loading || processingImage}
                  className="w-12 h-12 sm:w-16 sm:h-16 bg-white border-4 sm:border-[6px] border-neutral-200 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md group disabled:opacity-50"
                >
                  <div className="w-7 h-7 sm:w-10 sm:h-10 bg-primary rounded-full group-hover:bg-sidebar transition-colors shadow-inner" />
                </button>
                <div className="text-center flex flex-col gap-0.5">
                  <p className="text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Tap to capture photo</p>
                  <button 
                    onClick={triggerNativeCamera}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer mt-0.5"
                  >
                    Or use phone's high-quality camera app
                  </button>
                </div>
              </>
            ) : (
              <div className="py-1 text-center">
                <button 
                  onClick={onClose}
                  className="text-xs font-black uppercase text-neutral-400 hover:text-neutral-600 tracking-wider cursor-pointer py-1.5 px-4"
                >
                  Cancel / Close Window
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CameraModal;
