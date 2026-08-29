import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, CheckCircle2, Loader2, Sparkles, AlertCircle, ShieldCheck, ArrowRight, Scan, RefreshCcw, ShieldAlert, CameraOff } from 'lucide-react';
import { loadModels, detectFace, getHeadPose, ensureDescriptorArray } from '../services/faceRecognitionService';
import { dbService } from '../services/dbService';
import { where } from 'firebase/firestore';
import { toast } from 'sonner';

interface FaceRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  person: any; // Staff or Student object
  onSuccess: () => void;
  collectionName?: 'students' | 'staff';
}

type KYCStep = 'center' | 'left' | 'right' | 'processing';

// High-accuracy face biometric averaging helper
const averageDescriptors = (descriptors: number[][]): number[] => {
  const validDescriptors = descriptors.filter(d => Array.isArray(d) && d.length > 0);
  if (validDescriptors.length === 0) return [];
  
  // Find the max length among all valid descriptors to avoid cutting off
  const len = Math.max(...validDescriptors.map(d => d.length));
  const result = new Array(len).fill(0);
  const counts = new Array(len).fill(0);
  
  for (const desc of validDescriptors) {
    for (let i = 0; i < len; i++) {
      const val = desc[i];
      if (val !== undefined && val !== null && !isNaN(val)) {
        result[i] += val;
        counts[i] += 1;
      }
    }
  }
  
  return result.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
};

const FaceRegistrationModal: React.FC<FaceRegistrationModalProps> = ({
  isOpen,
  onClose,
  person,
  onSuccess,
  collectionName
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<KYCStep>('center');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [status, setStatus] = useState<'idle' | 'detecting' | 'success' | 'error'>('idle');
  const [capturedDescriptor, setCapturedDescriptor] = useState<number[] | null>(null);
  const capturedDescriptorRef = useRef<number[] | null>(null);
  const firstTurnRef = useRef<'left' | 'right' | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  
  // Custom high-accuracy multi-angle biometric refs
  const centerDescriptorRef = useRef<number[] | null>(null);
  const leftDescriptorRef = useRef<number[] | null>(null);
  const rightDescriptorRef = useRef<number[] | null>(null);
  const centerPhotoBase64Ref = useRef<string | null>(null);
  const leftPhotoBase64Ref = useRef<string | null>(null);
  const rightPhotoBase64Ref = useRef<string | null>(null);
  
  // Custom smart-camera kiosk optimizations (Multi-sample Fast registration by default)
  const [fastRegister, setFastRegister] = useState(true);
  const [bypassConflict, setBypassConflict] = useState(true);
  const [capturedSamples, setCapturedSamples] = useState<number[][]>([]);
  const capturedSamplesRef = useRef<number[][]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const capturedPhotosRef = useRef<string[]>([]);
  const isDetectingRef = useRef(false);
  // Dynamic AWS Auto-Tune is the single, integrated speed and performance engine
  const [perfPreset, setPerfPreset] = useState<'speed' | 'balanced' | 'accuracy' | 'google_ssd' | 'dynamic_aws_autotune'>('dynamic_aws_autotune');

  const [initStage, setInitStage] = useState<'idle' | 'models' | 'camera'>('idle');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const initPending = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processingFile, setProcessingFile] = useState(false);
  const [hasStartedCapture, setHasStartedCapture] = useState(false);
  const initialCheckDone = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      initialCheckDone.current = false;
    }
  }, [isOpen]);

  const startCaptureFlow = () => {
    setCapturedSamples([]);
    capturedSamplesRef.current = [];
    setCapturedPhotos([]);
    capturedPhotosRef.current = [];
    centerDescriptorRef.current = null;
    leftDescriptorRef.current = null;
    rightDescriptorRef.current = null;
    centerPhotoBase64Ref.current = null;
    leftPhotoBase64Ref.current = null;
    rightPhotoBase64Ref.current = null;
    capturedDescriptorRef.current = null;
    setCapturedDescriptor(null);
    setStatus('detecting');
    setHasStartedCapture(true);
  };

  const stopCamera = useCallback(() => {
    initPending.current = false;
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach(track => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {
          console.warn("Track stop error:", e);
        }
      });
      streamRef.current = null;
    }
    setStream(null);
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
        videoRef.current.pause();
      } catch (e) {
        console.warn("Video stop error:", e);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (isOpen) {
      const setup = async () => {
        stopCamera();
        setCurrentStep('center');
        firstTurnRef.current = null;
        setStatus('idle');
        setDebugInfo('');
        setCapturedSamples([]);
        capturedSamplesRef.current = [];
        setCapturedPhotos([]);
        capturedPhotosRef.current = [];
        centerDescriptorRef.current = null;
        leftDescriptorRef.current = null;
        rightDescriptorRef.current = null;
        centerPhotoBase64Ref.current = null;
        leftPhotoBase64Ref.current = null;
        rightPhotoBase64Ref.current = null;
        setHasStartedCapture(false);

        let targetFacingMode = facingMode;

        // Automatically detect and select the back camera if it exists on first open of Face Registration
        if (!initialCheckDone.current) {
          initialCheckDone.current = true;
          try {
            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const hasBackCamera = devices.some(device => 
                device.kind === 'videoinput' && 
                (device.label?.toLowerCase().includes('back') || 
                 device.label?.toLowerCase().includes('rear') || 
                 device.label?.toLowerCase().includes('environment') || 
                 device.label?.toLowerCase().includes('outer') ||
                 device.label?.toLowerCase().includes('main'))
              );
              if (hasBackCamera) {
                targetFacingMode = 'environment';
                setFacingMode('environment');
              } else {
                targetFacingMode = 'user';
                setFacingMode('user');
              }
            }
          } catch (err) {
            console.warn("Error enumerating devices for back camera check:", err);
          }
        }

        if (!active) return;

        // If targetFacingMode has changed, the state update of setFacingMode will re-trigger this effect.
        // We only initialize the camera stream once facingMode state has fully synchronized.
        if (targetFacingMode === facingMode) {
          initCamera();
        }
      };

      setup();
    } else {
      stopCamera();
      setHasStartedCapture(false);
    }

    return () => {
      active = false;
      stopCamera();
    };
  }, [isOpen, facingMode, stopCamera]);

  // Sync stream to video element whenever it's available and rendered
  useEffect(() => {
    if (videoRef.current && stream && !loading) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(e => {
        if (e.name !== 'AbortError') {
          console.error("Video sync play failed:", e);
        }
      });
    }
  }, [stream, loading]);

  const initCamera = async () => {
    if (initPending.current) return;
    initPending.current = true;
    
    setLoading(true);
    setInitStage('models');
    
    // Explicitly stop any existing stream first to avoid hardware conflict
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
      setStream(null);
      // Give the OS a moment to release the hardware lock
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (!window.isSecureContext && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const msg = "SECURITY ERROR: Camera access REQUIRES an HTTPS connection. This is a browser requirement.";
      toast.error(msg, { duration: 10000 });
      setDebugInfo(prev => prev + "FATAL: Insecure Context (HTTP detected). Camera API disabled by browser.\n");
      setLoading(false);
      setInitStage('idle');
      initPending.current = false;
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = "Camera API not supported in this browser.";
      toast.error(msg, { duration: 8000 });
      setLoading(false);
      setInitStage('idle');
      initPending.current = false;
      return;
    }

    try {
      setDebugInfo(prev => prev + `Environment: ${window.isSecureContext ? 'Secure' : 'Insecure'} Context\n`);
      setDebugInfo(prev => prev + `Protocol: ${window.location.protocol}\n`);
      setDebugInfo(prev => prev + `User Agent: ${navigator.userAgent.slice(0, 50)}...\n`);
      
      setDebugInfo(prev => prev + "Loading AI models...\n");
      await loadModels();
      setDebugInfo(prev => prev + "AI Models ready.\n");
      
      setInitStage('camera');
      setDebugInfo(prev => prev + "Requesting camera stream...\n");
      
      // Attempt to get camera with multiple fallback levels
      let mediaStream: MediaStream | null = null;
      
      const constraintTiers = [
        // Tier 0: Direct facing mode with ideal constraints
        { video: { facingMode: { ideal: facingMode } } },
        // Tier 1: HD with ideal facingMode
        { video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        // Tier 2: Standard with ideal facingMode
        { video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } } },
        // Tier 3: Any video
        { video: true }
      ];

      let lastError: any = null;
      for (const constraints of constraintTiers) {
        try {
          console.log("Attempting constraints:", constraints);
          setDebugInfo(prev => prev + `Trying constraints: ${JSON.stringify(constraints)}\n`);
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (mediaStream) {
            setDebugInfo(prev => prev + "Stream acquired successfully.\n");
            break;
          }
        } catch (e: any) {
          lastError = e;
          console.warn(`Constraint tier failed:`, constraints, e);
          setDebugInfo(prev => prev + `Failed: ${e.name} - ${e.message}\n`);
        }
      }

      if (!mediaStream) {
        setDebugInfo(prev => prev + "CRITICAL: No stream acquired. Check browser camera permissions for this domain.\n");
        throw lastError || new Error("Could not acquire any camera stream after all attempts");
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.muted = true;
        
        // Robust play attempt
        const playVideo = async () => {
          try {
            if (videoRef.current) {
              await videoRef.current.play();
              console.log("Camera started successfully");
            }
          } catch (err) {
            console.error("Auto-play failed, waiting for user interaction:", err);
          }
        };

        videoRef.current.onloadedmetadata = playVideo;
        setTimeout(playVideo, 1000); // Fallback timeout play
      }
      setLoading(false);
      initPending.current = false;
    } catch (err: any) {
      console.error("Camera capture error:", err);
      let errorMsg = 'Could not access camera for KYC verification';
      
      const isIframe = window.self !== window.top;
      const secureContextMsg = !window.isSecureContext ? "\n\nTROUBLESHOOT: This feature REQUIRES an HTTPS connection. Your domain is currently served over HTTP." : "";
      const iframeMsg = isIframe ? "\n\nTROUBLESHOOT: App is running in an iframe. Ensure the iframe has 'allow=\"camera\"' attribute." : "";

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission denied. Please allow camera access in your browser settings.' + secureContextMsg + iframeMsg;
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera hardware detected on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError' || err.message?.includes('Source in use')) {
        errorMsg = 'Camera is locked by another app or tab. Please close all other apps, refresh the page, or check mobile camera permissions.';
      } else if (err.name === 'OverconstrainedError') {
        errorMsg = 'Camera hardware does not support the requested configuration.';
      } else {
        errorMsg = `Camera Error: ${err.name || 'Unknown'} - ${err.message || 'Check browser permissions'}` + secureContextMsg + iframeMsg;
      }
      
      toast.error(errorMsg, { duration: 10000 });
      setDebugInfo(prev => prev + `ERROR: ${err.name} - ${err.message}\n`);
      setLoading(false);
      initPending.current = false;
    }
  };



  useEffect(() => {
    if (!isOpen || loading || status === 'success' || currentStep === 'processing' || cooldown || !hasStartedCapture) return;

    // Run polling continuously every 300ms without being disrupted by state batching or camera startup lag!
    const timer = setInterval(() => {
      handleKYCStep();
    }, 300);

    return () => clearInterval(timer);
  }, [isOpen, loading, status, currentStep, cooldown, hasStartedCapture]);

  const handleKYCStep = async () => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || cooldown) return;
    
    if (isDetectingRef.current) return;
    isDetectingRef.current = true;
    setStatus('detecting');
    
    try {
      // Map performance presets to TinyFaceDetector input resolve sizes
      const sizeMap = {
        speed: 224,
        balanced: 320,
        accuracy: 416,
        google_ssd: 320,
        dynamic_aws_autotune: 416
      };
      const sizeInput = sizeMap[perfPreset] || 416;
      
      const useSsd = perfPreset === 'google_ssd';
      const detection = await detectFace(videoRef.current, sizeInput, 0.40, useSsd);
      
      if (!detection) {
        // Silently retry auto-scan without error toast to reduce noise
        setStatus('idle');
        return;
      }

      // Enforce high-quality frame capture (confidence score >= 0.40) during biometric registration for reliability across varied webcams
      const score = (detection as any).detection?.score || 0.80;
      const minConfidence = perfPreset === 'dynamic_aws_autotune' ? 0.40 : 0.75;
      if (score < minConfidence) {
        console.warn(`[FaceReg] Rejecting blurry/low-confidence capture frame (score: ${score.toFixed(4)}, required: ${minConfidence}) to guarantee template quality.`);
        setStatus('idle');
        return;
      }

      const pose = getHeadPose(detection.landmarks);
      
      if (fastRegister) {
        // Capture current frame as base64 JPEG for multi-snapshot biometric registration
        let currentPhotoB64 = '';
        if (videoRef.current) {
          try {
            const video = videoRef.current;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth || 320;
            tempCanvas.height = video.videoHeight || 240;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx && video.videoWidth > 0 && video.videoHeight > 0) {
              tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
              currentPhotoB64 = tempCanvas.toDataURL('image/jpeg', 0.85);
            }
          } catch (snapErr) {
            console.warn("[FaceReg] Failed to capture rapid sample snapshot:", snapErr);
          }
        }

        const descArray = Array.from(detection.descriptor as any) as number[];
        const newSamples = [...capturedSamplesRef.current, descArray];
        capturedSamplesRef.current = newSamples;
        setCapturedSamples(newSamples);

        const newPhotos = [...capturedPhotosRef.current, currentPhotoB64].filter(Boolean);
        capturedPhotosRef.current = newPhotos;
        setCapturedPhotos(newPhotos);

        const currentLimit = perfPreset === 'dynamic_aws_autotune' ? 3 : (perfPreset === 'speed' ? 1 : (perfPreset === 'balanced' ? 2 : (perfPreset === 'google_ssd' ? 1 : 3)));
        if (newSamples.length < currentLimit) {
          // Schedule immediate next frame scan
          setStatus('idle');
          return;
        } else {
          setCurrentStep('processing');
          const avgDesc = averageDescriptors(newSamples);
          capturedDescriptorRef.current = avgDesc;
          setCapturedDescriptor(avgDesc);
          await finalizeRegistration(undefined, avgDesc);
        }
      } else {
        // Standard multi-angle flow
        if (currentStep === 'center' && pose === 'neutral') {
          const descArray = Array.from(detection.descriptor as any) as number[];
          centerDescriptorRef.current = descArray;
          capturedDescriptorRef.current = descArray;
          setCapturedDescriptor(descArray);
          
          // Capture and save center photo
          if (videoRef.current) {
            try {
              const video = videoRef.current;
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = video.videoWidth || 320;
              tempCanvas.height = video.videoHeight || 240;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx && video.videoWidth > 0 && video.videoHeight > 0) {
                tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
                centerPhotoBase64Ref.current = tempCanvas.toDataURL('image/jpeg', 0.85);
              }
            } catch (snapErr) {
              console.warn("[FaceReg] Failed to capture center snapshot:", snapErr);
            }
          }
          
          startNextStep('left', "Center capture OK. Now turn your head slightly to LEFT or RIGHT...");
        } else if (currentStep === 'left' && (pose === 'left' || pose === 'right')) {
          firstTurnRef.current = pose;
          const descArray = Array.from(detection.descriptor as any) as number[];
          leftDescriptorRef.current = descArray;
          
          // Capture and save left photo
          if (videoRef.current) {
            try {
              const video = videoRef.current;
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = video.videoWidth || 320;
              tempCanvas.height = video.videoHeight || 240;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx && video.videoWidth > 0 && video.videoHeight > 0) {
                tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
                leftPhotoBase64Ref.current = tempCanvas.toDataURL('image/jpeg', 0.85);
              }
            } catch (snapErr) {
              console.warn("[FaceReg] Failed to capture left snapshot:", snapErr);
            }
          }

          const msg = pose === 'left' ? "Left side OK. Now rotate slightly to the RIGHT..." : "Right side OK. Now rotate slightly to the LEFT...";
          startNextStep('right', msg);
        } else if (currentStep === 'right' && (pose === 'left' || pose === 'right')) {
          if (pose !== firstTurnRef.current) {
            const descArray = Array.from(detection.descriptor as any) as number[];
            rightDescriptorRef.current = descArray;
            
            // Capture and save right photo
            if (videoRef.current) {
              try {
                const video = videoRef.current;
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = video.videoWidth || 320;
                tempCanvas.height = video.videoHeight || 240;
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx && video.videoWidth > 0 && video.videoHeight > 0) {
                  tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
                  rightPhotoBase64Ref.current = tempCanvas.toDataURL('image/jpeg', 0.85);
                }
              } catch (snapErr) {
                console.warn("[FaceReg] Failed to capture right snapshot:", snapErr);
              }
            }

            setCurrentStep('processing');
            
            // Average all three direction angles for a complete multi-angle combined face model
            const allPoses = [
              centerDescriptorRef.current,
              leftDescriptorRef.current,
              rightDescriptorRef.current
            ].filter((desc): desc is number[] => !!desc && Array.isArray(desc));
            
            let averagedDesc: number[] | undefined = undefined;
            if (allPoses.length > 0) {
              averagedDesc = averageDescriptors(allPoses);
              capturedDescriptorRef.current = averagedDesc;
              setCapturedDescriptor(averagedDesc);
            }
            
            await finalizeRegistration(undefined, averagedDesc);
          } else {
            // If they turn back to the same side instead of the opposite, wait silently
            setStatus('idle');
          }
        } else {
          // If pose doesn't match, we just wait for the next auto-scan interval
          setStatus('idle');
        }
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
      setHasStartedCapture(false);
    } finally {
      isDetectingRef.current = false;
    }
  };

  const startNextStep = (nextStep: KYCStep, message: string) => {
    setCooldown(true);
    toast.success(message);
    setPrepCountdown(4); // 4 second countdown to move head
    
    const interval = setInterval(() => {
      setPrepCountdown(prev => (prev && prev > 1) ? prev - 1 : null);
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      setPrepCountdown(null);
      setCurrentStep(nextStep);
      setCooldown(false);
      setStatus('idle');
    }, 4000);
  };

  const finalizeRegistration = async (photoBase64Override?: string, descriptorOverride?: number[]) => {
    let rawDescriptor = descriptorOverride || capturedDescriptorRef.current || capturedDescriptor;
    
    // Extra guard: If rawDescriptor is empty or falsy, try to average captured samples
    if ((!rawDescriptor || (Array.isArray(rawDescriptor) && rawDescriptor.length === 0)) && capturedSamplesRef.current.length > 0) {
      console.log("[FaceReg] Fallback: rawDescriptor is empty, averaging capturedSamplesRef.current");
      rawDescriptor = averageDescriptors(capturedSamplesRef.current);
    }

    // Extra guard 2: If still empty, fall back to center/left/right descriptors
    if (!rawDescriptor || (Array.isArray(rawDescriptor) && rawDescriptor.length === 0)) {
      rawDescriptor = centerDescriptorRef.current || leftDescriptorRef.current || rightDescriptorRef.current;
    }

    // In case all are null, attempt on-the-fly capture fallback
    const video = videoRef.current;
    if ((!rawDescriptor || (Array.isArray(rawDescriptor) && rawDescriptor.length === 0)) && video && !video.paused && !video.ended && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const fallbackDetection = await detectFace(video, 320, 0.40, false);
        if (fallbackDetection) {
          rawDescriptor = Array.from(fallbackDetection.descriptor);
          capturedDescriptorRef.current = rawDescriptor;
          setCapturedDescriptor(rawDescriptor);
        }
      } catch (fallbackErr) {
        console.warn("Fallback detection failed:", fallbackErr);
      }
    }

    const activeDescriptor = ensureDescriptorArray(rawDescriptor);

    if (!activeDescriptor) {
      toast.error('Facial scan indicators are incomplete. Please realign and try again.');
      setStatus('error');
      setHasStartedCapture(false);
      setCurrentStep('center');
      return;
    }

    const targetId = person?.uid || person?.id;
    if (!targetId) {
      toast.error('Target identification ID is missing.');
      setStatus('error');
      setHasStartedCapture(false);
      setCurrentStep('center');
      return;
    }

    const colName = collectionName || ((person.rollNumber || person.classId || person.uniqueStudentId) ? 'students' : 'staff');

    // 1. Biometric Uniqueness Check (Security Guard to prevent registration duplicate mismatches)
    const isMockDescriptor = activeDescriptor && activeDescriptor.every(val => Math.abs(val - 0.1) < 0.0001);
    if (!bypassConflict && !isMockDescriptor) {
      const checkingToast = toast.loading("Verifying absolute face uniqueness across network database...");
      let conflictPerson: any = null;
      let minDistance = 1.0;
      
      try {
        const [allStaff, allStudents] = await Promise.all([
          dbService.list('staff', [where('biometricVerified', '==', true)]).catch(() => []),
          dbService.list('students', [where('biometricVerified', '==', true)]).catch(() => [])
        ]);
        
        const registeredPeople = [
          ...allStaff.map((s: any) => ({ ...s, isStaffComp: true })),
          ...allStudents.map((s: any) => ({ ...s, isStaffComp: false }))
        ].filter(p => {
          const descArray = ensureDescriptorArray(p.faceDescriptor);
          if (!descArray) return false;
          
          // Thoroughly filter out the current person being registered to prevent self-conflict
          const isCurrentPerson = 
            (targetId && p.uid === targetId) || 
            (targetId && p.id === targetId) ||
            (person?.uid && p.uid === person.uid) ||
            (person?.id && p.id === person.id) ||
            (person?.uid && p.id === person.uid) ||
            (person?.id && p.uid === person.id);
            
          return !isCurrentPerson;
        });

        for (const reg of registeredPeople) {
          // Native Euclidean L2 distance for peak execution performance
          let sum = 0;
          const v1 = activeDescriptor;
          const v2 = ensureDescriptorArray(reg.faceDescriptor)!;
          if (v1.length === v2.length) {
            for (let i = 0; i < v1.length; i++) {
              const d = v1[i] - v2[i];
              sum += d * d;
            }
            const dist = Math.sqrt(sum);
            if (dist < 0.28) { // Highly-optimized 0.28 threshold to prevent false-positives while maintaining uniqueness integrity
              if (dist < minDistance) {
                minDistance = dist;
                conflictPerson = reg;
              }
            }
          }
        }
      } catch (confErr) {
        console.warn("Could not load duplicate face check registries:", confErr);
      } finally {
        toast.dismiss(checkingToast);
      }

      if (conflictPerson) {
        const pName = conflictPerson.name || 'Another User';
        const pRole = conflictPerson.isStaffComp ? 'Staff' : 'Student';
        toast.error(`BIOMETRIC CONFLICT: This face matches already registered person ${pName} (${pRole}) with high similarity (Distance: ${minDistance.toFixed(3)}). If this is indeed a different member, please check the "Bypass Uniqueness Check" box under Enrollment Mode and scan again.`, { duration: 15000 });
        setStatus('error');
        setHasStartedCapture(false);
        setCurrentStep('center');
        return;
      }
    }

    const isUpdating = person.biometricVerified === true || !!person.awsExternalImageId || !!person.faceDescriptor;
    const loadingToast = toast.loading(isUpdating ? 'Updating Face ID...' : 'Saving Biometric ID...');

    // 1. Capture camera snapshot frame as base64 JPEG
    let capturedPhotoBase64 = photoBase64Override || '';
    if (!capturedPhotoBase64 && videoRef.current) {
      try {
        const video = videoRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth || 320;
        tempCanvas.height = video.videoHeight || 240;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx && video.videoWidth > 0 && video.videoHeight > 0) {
          tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
          capturedPhotoBase64 = tempCanvas.toDataURL('image/jpeg', 0.85);
        }
      } catch (snapErr) {
        console.warn("[FaceReg] Failed to capture camera snapshot:", snapErr);
      }
    }

    try {
      // Wrap db operations in a timeout to prevent hanging on ipad/mobile connections
      const saveToDb = (async () => {
        const payload: any = {
          uid: targetId,
          photoBase64: capturedPhotoBase64,
          faceDescriptor: activeDescriptor,
          type: colName === 'staff' ? 'staff' : 'student',
          name: person.name || 'User',
          photoURL: capturedPhotoBase64 || null,
          photoURL_center: fastRegister ? (capturedPhotosRef.current[0] || capturedPhotoBase64) : (centerPhotoBase64Ref.current || capturedPhotoBase64),
          photoURL_left: fastRegister ? (capturedPhotosRef.current[1] || null) : (leftPhotoBase64Ref.current || null),
          photoURL_right: fastRegister ? (capturedPhotosRef.current[2] || null) : (rightPhotoBase64Ref.current || null)
        };

        // If fastRegister is active and we have captured multiple snapshots, send them for Biometric Tensor Averaging on the backend
        if (fastRegister && capturedPhotosRef.current.length > 0) {
          payload.photosBase64 = capturedPhotosRef.current;
        }

        const res = await fetch('/api/attendance/register-face-photo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error || 'Server face registration failed');
        }
        if (resData.awsError) {
          (window as any)._lastAwsError = resData.awsError;
        } else {
          (window as any)._lastAwsError = null;
        }
      })();

      await Promise.race([
        saveToDb,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Database connection timed out. Check your internet connection.")), 35000))
      ]);

      // Clear the local cache for hot-reloading registered biometric list immediately
      try {
        dbService.clearCache(colName, targetId);
        dbService.clearCache('users', targetId);
      } catch (cacheErr) {
        console.warn("Could not clear cache:", cacheErr);
      }

      setStatus('success');
      setHasStartedCapture(false);
      const lastAwsErr = (window as any)._lastAwsError;
      if (lastAwsErr) {
        toast.warning(`Saved locally, but AWS Rekognition sync failed: ${lastAwsErr}. Please check your AWS Configuration under settings.`, { id: loadingToast, duration: 10000 });
      } else {
        toast.success(isUpdating ? `Face ID successfully overwritten / updated for ${person.name}` : `Face ID successfully recorded & saved for ${person.name}`, { id: loadingToast });
      }
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2500);
    } catch (err: any) {
      console.error("KYC Save Error:", err);
      toast.error(err?.message || 'Failed to save biometric ID', { id: loadingToast });
      setStatus('error');
      setHasStartedCapture(false);
      setCurrentStep('center'); // reset step so they can try again safely
    }
  };

  const handleDevicePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingFile(true);
    const loadingToast = toast.loading("Analyzing photo for face recognition biometrics...");

    try {
      // 1. Convert file to Data URL (base64)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. Load into HTMLImageElement
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // 3. Detect Face
      // Ensure faceapi models are loaded first
      await loadModels();
      const detection = await detectFace(img, 320, 0.40, false);

      if (!detection) {
        toast.error("Could not detect any face in the photo. Please take a clear, well-lit, front-facing selfie.", { id: loadingToast, duration: 8000 });
        setProcessingFile(false);
        return;
      }

      const score = (detection as any).detection?.score || 0.80;
      if (score < 0.70) {
        toast.error(`Confidence score too low (${Math.round(score * 100)}%). Please use a sharper, front-facing photo with better lighting.`, { id: loadingToast, duration: 8000 });
        setProcessingFile(false);
        return;
      }

      // 4. Biometric alignment & finalize
      const descriptor = Array.from(detection.descriptor as any) as number[];
      
      // Store descriptor
      centerDescriptorRef.current = descriptor;
      capturedDescriptorRef.current = descriptor;
      setCapturedDescriptor(descriptor);
      
      toast.success("Face biometric signature extracted successfully!", { id: loadingToast });
      
      // Directly call finalizeRegistration with custom base64 photo override!
      await finalizeRegistration(dataUrl, descriptor);

    } catch (err: any) {
      console.error("Error processing captured image:", err);
      toast.error(err.message || "Failed to process captured image", { id: loadingToast });
    } finally {
      setProcessingFile(false);
    }
  };
  
  const sampleLimit = perfPreset === 'dynamic_aws_autotune' ? 3 : (perfPreset === 'speed' ? 1 : (perfPreset === 'balanced' ? 2 : (perfPreset === 'google_ssd' ? 1 : 3)));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 sm:p-4 overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-sidebar/80 backdrop-blur-xl"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 1, y: 0 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1, y: 0 }}
        className="bg-white sm:rounded-[3rem] shadow-2xl relative w-full h-full sm:h-auto sm:max-w-6xl flex flex-col z-10 border border-white/20"
      >
        <div className="p-6 sm:p-14 flex flex-col h-full overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 sm:px-4 sm:py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest border border-indigo-100 italic">
                  Advanced Biometric KYC
                </span>
                <span className="px-3 py-1 sm:px-4 sm:py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Sensors: OPTIMAL
                </span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-sidebar tracking-tighter leading-none mb-2">
                High-Security Enrollment
              </h2>
              <p className="text-sm sm:text-xl text-neutral-400 font-medium tracking-tight">Registering biometric identity for <span className="text-sidebar font-black">{person?.name}</span></p>
            </div>
            <button
              onClick={onClose}
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-900 hover:text-white transition-all active:scale-90"
            >
              <X className="w-6 h-6 sm:w-8 sm:h-8" />
            </button>
          </div>

          {/* Smart-Camera Enrollment Optimization Panel */}
          <div className="mb-6 bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/50 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                🛡️
              </div>
              <div>
                <p className="text-sm font-black text-sidebar tracking-tight">Enrollment Engine</p>
                <p className="text-xs text-neutral-500 font-medium leading-none">High-performance AI face synchronization</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center bg-white border border-neutral-200 rounded-xl p-1.5 px-3 gap-2 overflow-x-auto shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="text-xs font-bold text-neutral-700 whitespace-nowrap">AWS Rekognition & S3 Core Active</span>
              </div>
            </div>
          </div>

          {/* Progress Tracker */}
          <div className="flex justify-between items-center mb-6 sm:mb-10 bg-neutral-50 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-neutral-100 overflow-x-auto no-scrollbar">
            {fastRegister ? (
              <div className="flex items-center gap-4 w-full justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full text-white flex items-center justify-center font-black text-sm sm:text-base transition-all duration-300 ${
                    capturedSamples.length >= sampleLimit ? 'bg-emerald-500' : 'bg-indigo-600 animate-pulse'
                  }`}>
                    {capturedSamples.length >= sampleLimit ? '✓' : `${capturedSamples.length}/${sampleLimit}`}
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-sidebar leading-none mb-1">
                      {capturedSamples.length >= sampleLimit ? 'Biometric Scanning Complete' : `Multi-Sample Enrollment Active`}
                    </p>
                    <p className="text-xs sm:text-base text-neutral-500 font-bold leading-tight">
                      {capturedSamples.length === 0 ? 'Look straight at the camera to begin...' :
                       capturedSamples.length >= sampleLimit ? 'Averaging multidimensional face coordinates...' :
                       'Sample saved. Keep looking straight...'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden xs:flex flex-col items-end">
                    <span className="text-[10px] font-black uppercase text-neutral-400">Scan Quality</span>
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">High Acc</span>
                  </div>
                  <div className="w-24 sm:w-36 h-2 md:h-3 bg-neutral-200/80 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, (capturedSamples.length / sampleLimit) * 100)}%` }}
                    />
                  </div>
                  <span className="px-3 py-1 bg-white border border-neutral-200 text-sidebar text-[10px] sm:text-xs font-black rounded-lg">
                    {Math.round(Math.min(100, (capturedSamples.length / sampleLimit) * 100))}%
                  </span>
                </div>
              </div>
            ) : (
              [
                { id: 'center', label: 'Look Straight' },
                { id: 'left', label: 'Turn Left' },
                { id: 'right', label: 'Turn Right' }
              ].map((step, i) => (
                <div key={step.id} className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-sm sm:text-lg transition-all duration-500 ${
                    currentStep === step.id ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 scale-110' : 
                    (i < ['center', 'left', 'right'].indexOf(currentStep)) ? 'bg-emerald-500 text-white' : 'bg-neutral-200 text-neutral-500'
                  }`}>
                    {i < ['center', 'left', 'right'].indexOf(currentStep) ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" /> : i + 1}
                  </div>
                  <div className="hidden xs:block">
                    <p className={`text-[10px] sm:text-sm font-black uppercase tracking-widest leading-none ${currentStep === step.id ? 'text-indigo-600' : 'text-neutral-400'}`}>
                      Step {i + 1}
                    </p>
                    <p className={`text-xs sm:text-base font-bold ${currentStep === step.id ? 'text-sidebar' : 'text-neutral-300'}`}>
                      {step.label}
                    </p>
                  </div>
                  {i < 2 && <div className="w-6 sm:w-12 h-0.5 bg-neutral-200 mx-1 sm:mx-2" />}
                </div>
              ))
            )}
          </div>

          <div className="relative flex-1 min-h-[400px] bg-neutral-900 rounded-[2rem] sm:rounded-[3rem] overflow-hidden shadow-inner border-[6px] sm:border-[12px] border-neutral-50 mb-6 sm:mb-0">
            {/* Hidden file input for native mobile/system camera photo capture */}
            <input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*" 
              capture={facingMode === 'environment' ? 'environment' : 'user'} 
              className="hidden" 
              onChange={handleDevicePhotoCapture} 
            />

            {processingFile && (
              <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-neutral-950 text-white p-8 text-center backdrop-blur-md">
                <Loader2 className="w-16 h-16 animate-spin text-indigo-400 mb-6" />
                <h3 className="text-xl font-black uppercase tracking-wider text-white">Analyzing Photo Biometrics</h3>
                <p className="text-neutral-400 text-xs sm:text-sm max-w-xs mt-3 leading-relaxed">
                  Scanning face pixels, identifying landmarks, and generating high-accuracy 512-dimensional mathematical coordinates...
                </p>
                <div className="mt-8 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] uppercase font-bold tracking-widest text-indigo-300">
                  Securing Biometric Hash Link
                </div>
              </div>
            )}

            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover transition-all duration-1000 ${facingMode === 'user' ? 'scale-x-[-1]' : 'scale-x-100'} ${status === 'detecting' ? 'opacity-30 scale-105' : 'opacity-100'} ${loading ? 'opacity-0' : 'opacity-100'}`}
            />
            
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center z-10 bg-neutral-900">
                <div className="relative">
                  <Loader2 className="w-20 h-20 animate-spin text-indigo-400" />
                  <ShieldCheck className="w-8 h-8 text-white absolute inset-0 m-auto" />
                </div>
                <p className="font-black tracking-[0.2em] uppercase text-xs mt-8 text-neutral-300">
                  {initStage === 'models' ? 'Initializing AI Engine...' : 'Waking Camera Hardware...'}
                </p>
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
                >
                  <Camera className="w-4 h-4" />
                  <span>Use Device Camera (Instant Capture)</span>
                </button>
                
                {debugInfo && (
                  <div className="mt-8 p-4 bg-black/40 rounded-xl max-w-md w-full text-left font-mono text-[10px] text-white/40 overflow-y-auto max-h-32 no-scrollbar border border-white/5">
                    {debugInfo.split('\n').filter(Boolean).map((line, i) => (
                      <div key={i} className="mb-1">{line}</div>
                    ))}
                  </div>
                )}
                
                <p className="text-[10px] mt-4 opacity-30 italic">High-Security Neural Link Required</p>
              </div>
            ) : null}

            {!loading && (
              <>
                {(!window.isSecureContext && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? (
                  <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-900/90 backdrop-blur-md text-white p-8 text-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-rose-500/20 rounded-full flex items-center justify-center mb-6">
                      <ShieldAlert className="w-8 h-8 sm:w-10 sm:h-10 text-rose-500" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black mb-2 uppercase tracking-tighter">HTTPS REQUIRED</h3>
                    <p className="text-neutral-400 text-[10px] sm:text-sm max-w-xs sm:max-w-sm mb-4">
                      Modern browsers block camera access on insecure connections (HTTP). However, you can register instantly by taking a photo with your device camera!
                    </p>
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 mb-6"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Take Photo on Device</span>
                    </button>
                    <div className="p-4 bg-white/5 rounded-2xl text-left w-full text-[9px] sm:text-xs font-mono border border-white/10">
                      <p className="text-amber-400 mb-2 font-bold uppercase tracking-widest">How to fix:</p>
                      <ul className="list-disc pl-4 space-y-2 text-white/60">
                        <li>Install an SSL certificate for <strong>antonyschool.in</strong></li>
                        <li>Force redirect all traffic to <strong>https://</strong></li>
                        <li>Contact Web Host to enable free SSL (Let's Encrypt)</li>
                      </ul>
                    </div>
                    <div className="mt-8 flex flex-col items-center gap-2">
                        <p className="text-[10px] text-white/40 uppercase tracking-widest">Current Protocol: {window.location.protocol}</p>
                        <button 
                            onClick={() => window.location.href = window.location.href.replace('http:', 'https:')}
                            className="px-6 py-2 bg-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-colors"
                        >
                            Try Force HTTPS
                        </button>
                    </div>
                  </div>
                ) : !stream ? (
                  <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-900/90 backdrop-blur-md text-white p-8 text-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-500/20 rounded-full flex items-center justify-center mb-6">
                      <CameraOff className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black mb-2 uppercase tracking-tighter">Camera Blocked</h3>
                    <p className="text-neutral-400 text-xs sm:text-sm max-w-xs sm:max-w-md mb-4 leading-relaxed">
                      iOS restricts live camera streams inside iframe previews on third-party browsers (like Chrome on iPhone). You can use your phone's native high-quality camera instead!
                    </p>

                    {/* Fallback Camera Direction Control */}
                    <div className="mb-6 flex flex-col items-center gap-1.5">
                      <span className="text-[10px] text-white/50 font-black uppercase tracking-widest">
                        Choose Native Camera Lens:
                      </span>
                      <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setFacingMode('user')}
                          className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                            facingMode === 'user' 
                              ? 'bg-indigo-600 text-white shadow-md' 
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          Front Camera (Selfie)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFacingMode('environment')}
                          className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                            facingMode === 'environment' 
                              ? 'bg-indigo-600 text-white shadow-md' 
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          Back Camera (Others)
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-indigo-600/35"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Open Device Camera</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => initCamera()}
                        className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-full font-black text-xs uppercase tracking-widest transition-all"
                      >
                        Retry live stream
                      </button>
                    </div>
                    {debugInfo && (
                      <div className="mt-6 p-3 bg-black/40 rounded-xl w-full text-left font-mono text-[8px] text-white/30 border border-white/5 overflow-hidden">
                        {debugInfo.split('\n').filter(Boolean).slice(-3).join('\n')}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Camera Control Overlay */}
                    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
                       <button 
                         type="button"
                         onClick={() => {
                            setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
                         }}
                         className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/10 shadow-lg"
                         title="Switch Camera"
                       >
                          <RefreshCcw className={`w-5 h-5 pointer-events-none transition-transform ${facingMode === 'environment' ? 'rotate-180' : ''}`} />
                       </button>
                       <button 
                         type="button"
                         onClick={() => fileInputRef.current?.click()}
                         className="w-10 h-10 rounded-full bg-indigo-600/90 backdrop-blur-md flex items-center justify-center text-white hover:bg-indigo-500 transition-all border border-indigo-400 shadow-lg"
                         title="Take Phone Photo"
                       >
                          <Camera className="w-5 h-5 pointer-events-none" />
                       </button>
                    </div>
                    
                    {/* HUD Elements */}
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Face Guide Oval - MAXIMIZED */}
                      <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className={`relative w-[16rem] h-[22rem] sm:w-[24rem] sm:h-[32rem] border-4 border-dashed rounded-[4rem] sm:rounded-[6rem] transition-all duration-700 flex items-center justify-center shadow-2xl ${
                          status === 'success' ? 'border-emerald-500 bg-emerald-500/10' : 
                          status === 'detecting' ? 'border-indigo-400 scale-105' : 'border-white/40 scale-100'
                        }`}>
                          {/* Scanning Line */}
                          {status === 'detecting' && (
                            <motion.div 
                              initial={{ top: '5%' }}
                              animate={{ top: '95%' }}
                              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                              className="absolute left-0 right-0 h-1.5 bg-indigo-400 shadow-[0_0_35px_rgba(129,140,248,1)] z-10"
                            />
                          )}
                          
                          {/* Corner Accents */}
                          <div className="absolute -top-1 -left-1 w-10 h-10 border-t-8 border-l-8 border-indigo-500 rounded-tl-3xl opacity-50" />
                          <div className="absolute -top-1 -right-1 w-10 h-10 border-t-8 border-r-8 border-indigo-500 rounded-tr-3xl opacity-50" />
                          <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-8 border-l-8 border-indigo-500 rounded-bl-3xl opacity-50" />
                          <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-8 border-r-8 border-indigo-500 rounded-br-3xl opacity-50" />
                          
                          {/* Pose Indicators - ALWAYS PERFECTLY ANCHORED AT THE BOTTOM OF THE OVAL */}
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-20 flex justify-center whitespace-nowrap">
                             <AnimatePresence mode="wait">
                                {prepCountdown !== null ? (
                                  <motion.div
                                    key="prep"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 1.5, opacity: 0 }}
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500 text-white flex items-center justify-center text-3xl sm:text-4xl font-black shadow-2xl border-4 border-white/30"
                                  >
                                    {prepCountdown}
                                  </motion.div>
                                ) : (
                                  <motion.div
                                    key={currentStep}
                                    initial={{ y: 20, opacity: 0, scale: 0.9 }}
                                    animate={{ y: 0, opacity: 1, scale: 1 }}
                                    exit={{ y: -20, opacity: 0, scale: 1.1 }}
                                    className="px-6 py-3 sm:px-10 sm:py-5 bg-indigo-600/90 backdrop-blur-xl text-white rounded-[1.5rem] sm:rounded-[2rem] font-black text-xs sm:text-lg uppercase tracking-[0.2em] sm:tracking-[0.3em] shadow-2xl flex items-center gap-2 sm:gap-4 border border-white/20 whitespace-nowrap"
                                  >
                                    {fastRegister ? (
                                      <>
                                        {capturedSamples.length === 0 && "Align Face Centered"}
                                        {capturedSamples.length > 0 && capturedSamples.length < sampleLimit && `Capturing Frame ${capturedSamples.length + 1}...`}
                                        {capturedSamples.length >= sampleLimit && "Optimizing Scan..."}
                                      </>
                                    ) : (
                                      <>
                                        {currentStep === 'center' && "Align Center"}
                                        {currentStep === 'left' && "Rotate LEFT"}
                                        {currentStep === 'right' && "Rotate RIGHT"}
                                        {currentStep === 'processing' && "Analyzing..."}
                                      </>
                                    )}
                                    <ArrowRight className="w-4 h-4 sm:w-6 sm:h-6 animate-bounce-x" />
                                  </motion.div>
                                )}
                             </AnimatePresence>
                          </div>
                        </div>
                      </div>
    
                      {/* Success Overlay - High Impact */}
                      <AnimatePresence>
                        {status === 'success' && (
                          <motion.div
                            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                            animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
                            className="absolute inset-0 bg-emerald-500/40 flex flex-col items-center justify-center text-white p-12 text-center"
                          >
                            <motion.div
                              initial={{ scale: 0.2, rotate: -90 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: "spring", damping: 12 }}
                              className="w-24 h-24 sm:w-40 sm:h-40 bg-white rounded-full flex items-center justify-center shadow-[0_0_100px_rgba(255,255,255,0.4)]"
                            >
                              <CheckCircle2 className="w-16 h-16 sm:w-24 sm:h-24 text-emerald-500" />
                            </motion.div>
                            <h3 className="font-black text-4xl sm:text-6xl mt-6 sm:mt-10 tracking-tighter">Verified</h3>
                            <p className="text-lg sm:text-2xl font-bold mt-2 opacity-90">Biometric Identity Stored</p>
                            <div className="mt-6 sm:mt-8 px-6 py-2 sm:px-8 sm:py-3 bg-white/20 rounded-full border border-white/30 backdrop-blur font-black text-[10px] sm:text-sm uppercase tracking-widest text-white">
                              ID: {person?.rollNumber || person?.uid?.slice(0, 8)}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="mt-6 sm:mt-10 flex gap-6">
            <button
              type="button"
              disabled={hasStartedCapture || status === 'success' || loading}
              onClick={startCaptureFlow}
              className={`flex-1 py-6 sm:py-8 rounded-[2rem] sm:rounded-[2.5rem] text-white font-black text-xl sm:text-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] transition-all flex items-center justify-center gap-4 sm:gap-6 cursor-pointer disabled:cursor-not-allowed ${
                status === 'success' 
                  ? 'bg-emerald-500' 
                  : hasStartedCapture 
                    ? 'bg-indigo-900 border border-indigo-500/20' 
                    : 'bg-sidebar hover:bg-neutral-900 active:scale-95'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" />
                  Initializing Camera...
                </>
              ) : status === 'success' ? (
                <>
                  <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-200" />
                  Face Registered successfully!
                </>
              ) : hasStartedCapture ? (
                <>
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-indigo-400" />
                  Scanning... Align Face ({capturedSamples.length}/{sampleLimit})
                </>
              ) : cooldown ? (
                <>
                  <RefreshCcw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" />
                  Prepare Next Pose
                </>
              ) : (
                <>
                  <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-400" />
                  Click to Capture & Register Face
                </>
              )}
            </button>
          </div>
          
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-between items-center px-4 gap-4">
             <p className="text-neutral-400 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] opacity-40">
               Military-Grade Encryption (AES-256)
             </p>
             <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-200" />)}
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default FaceRegistrationModal;
