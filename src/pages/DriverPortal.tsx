import React, { useState, useEffect, useRef } from 'react';
import { 
  Bus, 
  Navigation, 
  MapPin, 
  Play, 
  Square, 
  Clock, 
  AlertTriangle,
  User,
  Shield,
  Phone,
  Power,
  Activity,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { SchoolBus, TransportStop } from '../types';
import { format } from 'date-fns';

const DriverPortal: React.FC = () => {
  const { profile, hasPermission, loading: authLoading } = useAuth();
  const [assignedBus, setAssignedBus] = useState<SchoolBus | null>(null);
  const [isTripActive, setIsTripActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [recordingStopId, setRecordingStopId] = useState<string | null>(null);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);

  const recordStopCoordinates = async (stop: TransportStop) => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setRecordingStopId(stop.id);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Update the actual stop in 'stops' collection
          await dbService.update('stops', stop.id, {
            latitude,
            longitude,
            lastRecordedAt: new Date().toISOString(),
            lastRecordedBy: profile?.name || 'Driver'
          });

          // Automatically backup to 'stop_backups' collection
          const backupId = `backup_${stop.id}_${Date.now()}`;
          await dbService.create('stop_backups', backupId, {
            stopId: stop.id,
            villageName: stop.villageName,
            latitude,
            longitude,
            busId: assignedBus?.id || '',
            busNumber: assignedBus?.busNumber || '',
            driverName: profile?.name || 'Driver',
            driverId: profile?.uid || '',
            timestamp: new Date().toISOString()
          });

          toast.success(`Coordinates saved & backed up for ${stop.villageName}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          fetchAssignedBus();
        } catch (error) {
          console.error(error);
          toast.error("Failed to save coordinates");
        } finally {
          setRecordingStopId(null);
        }
      },
      (error) => {
        console.error(error);
        toast.error("Failed to access GPS. Please ensure Location Permissions are enabled.");
        setRecordingStopId(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (!authLoading) {
      fetchAssignedBus();
    }
  }, [profile, authLoading]);

  const fetchAssignedBus = async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // Find bus assigned to this driver
      const buses = await dbService.list('buses') as SchoolBus[];
      
      // Matching can be by UID, or normalized phone numbers
      const normalizedProfilePhone = profile.phone || profile.whatsappNumber || (profile as any).phone || '';
      const cleanProfilePhone = normalizedProfilePhone.replace(/\D/g, '').slice(-10);

      const driverBus = buses.find(b => {
        if (b.driverId === profile.uid || (profile.id && b.driverId === profile.id)) return true;
        
        const cleanBusPhone = (b.driverPhone || '').replace(/\D/g, '').slice(-10);
        if (cleanBusPhone && cleanProfilePhone && cleanBusPhone === cleanProfilePhone) return true;
        
        return false;
      });
      
      if (driverBus) {
        setAssignedBus(driverBus);
        setIsTripActive(driverBus.status === 'on-road');
        
        // Fetch stops for this bus
        const allStops = await dbService.list('stops') as TransportStop[];
        setStops(allStops.filter(s => s.busId === driverBus.id).sort((a, b) => a.order - b.order));
      }
    } catch (error) {
      toast.error("Failed to load assigned bus");
    } finally {
      setLoading(false);
    }
  };

  const startTrip = async () => {
    if (!assignedBus) return;
    
    try {
      await dbService.update('buses', assignedBus.id, { 
        status: 'on-road',
        lastUpdate: new Date().toISOString()
      });
      setIsTripActive(true);
      toast.success("Trip Started! Drive safely.");
      
      // Start tracking
      startTracking();
    } catch (error) {
      toast.error("Failed to start trip");
    }
  };

  const endTrip = async () => {
    if (!assignedBus) return;
    
    try {
      await dbService.update('buses', assignedBus.id, { 
        status: 'active',
        lastUpdate: new Date().toISOString()
      });
      setIsTripActive(false);
      stopTracking();
      toast.info("Trip Completed.");
    } catch (error) {
      toast.error("Failed to complete trip");
    }
  };

  const startTracking = () => {
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    
    // Update location every 10 seconds
    watchdogRef.current = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            setCurrentLocation({ lat: latitude, lng: longitude });
            
            if (assignedBus) {
              await dbService.update('buses', assignedBus.id, {
                currentLat: latitude,
                currentLng: longitude,
                lastUpdate: new Date().toISOString()
              });
            }
          },
          (error) => {
            console.error("Geolocation error:", error);
            toast.error("Please enable GPS for live tracking");
          },
          { enableHighAccuracy: true }
        );
      }
    }, 10000);
  };

  const stopTracking = () => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-8 text-center">
        <Bus className="w-16 h-16 text-yellow-500 animate-bounce mb-4" />
        <p className="text-white font-bold italic tracking-widest uppercase">Initializing Digital Cockpit...</p>
      </div>
    );
  }

  // Security Gate
  if (!hasPermission('driver_portal_view')) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-12 h-12 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Security Alert</h1>
        <p className="text-neutral-400 max-w-xs">Restricted Instance. Your account does not have authorization for Driver Operations.</p>
        <button 
          onClick={() => window.location.href = '/'}
          className="mt-8 px-8 py-4 bg-white text-black font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs"
        >
          Return Home
        </button>
      </div>
    );
  }

  if (!assignedBus) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-12 h-12 text-amber-500" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2 italic">Assignment Required</h1>
        <p className="text-neutral-400 max-w-xs">You are authorized as a Driver, but no active Transport Route is currently mapped to your ID/Phone in the system.</p>
        <div className="mt-8 space-y-4">
           <div className="bg-white/5 p-4 rounded-xl text-neutral-400 text-[10px] font-mono whitespace-pre-wrap text-left border border-white/5">
             UID: {profile?.uid}
             {profile?.phone && `\nPHONE: ${profile?.phone}`}
             {profile?.whatsappNumber && `\nWA: ${profile?.whatsappNumber}`}
           </div>
           <button 
             onClick={() => fetchAssignedBus()}
             className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs"
           >
             Refresh Link
           </button>
           <button 
             onClick={() => window.location.href = '/'}
             className="w-full py-4 bg-white/5 text-white/50 font-black rounded-2xl uppercase tracking-widest text-xs"
           >
             Return Home
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 bg-neutral-900 border-b border-white/5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-yellow-500 rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
            <Bus className="w-7 h-7 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-tight">Bus {assignedBus.busNumber}</h1>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isTripActive ? 'bg-green-500 animate-pulse' : 'bg-neutral-500'}`} />
              {isTripActive ? 'On Road' : 'Standby'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-neutral-500 uppercase">Driver</p>
          <p className="text-sm font-bold">{profile?.name}</p>
        </div>
      </div>

      {/* Main Stats */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
        {/* Status Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-10 rounded-[3rem] border-none shadow-2xl transition-all relative overflow-hidden ${
            isTripActive 
              ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 shadow-emerald-500/20' 
              : 'bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-black'
          }`}
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-24 -mt-24" />
          
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-3 flex items-center gap-2">
              <Activity className="w-3 h-3" /> Telemetry Stream
            </p>
            <h2 className="text-4xl font-black mb-10 tracking-tight leading-none italic">
              {isTripActive ? 'Broadcasting Location' : 'System Standby'}
            </h2>
            
            <div className="flex gap-4">
              {!isTripActive ? (
                <motion.button 
                  whileHover={{ scale: 0.98 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startTrip}
                  className="flex-1 bg-yellow-400 text-black py-6 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 shadow-xl shadow-yellow-400/20"
                >
                  <Play className="w-8 h-8 fill-black" /> ACTIVATE
                </motion.button>
              ) : (
                <motion.button 
                  whileHover={{ scale: 0.98 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={endTrip}
                  className="flex-1 bg-white text-emerald-900 py-6 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 shadow-xl shadow-white/20"
                >
                  <Square className="w-8 h-8 fill-emerald-900" /> DEACTIVATE
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Route Info */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500">Route Map</h3>
            <span className="text-[10px] bg-white/5 px-2 py-1 rounded-full font-bold">{stops.length} Stops</span>
          </div>
          
          <div className="space-y-3">
            {stops.map((stop, idx) => (
              <motion.div 
                key={stop.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-neutral-900/50 border border-white/5 p-4 rounded-3xl flex items-center gap-4 relative"
              >
                <div className="w-10 h-10 rounded-2xl bg-neutral-800 flex items-center justify-center text-xs font-black relative z-10">
                  {idx + 1}
                </div>
                {idx < stops.length - 1 && (
                  <div className="absolute left-9 top-14 w-0.5 h-6 bg-white/5 -translate-x-1/2" />
                )}
                <div className="flex-1">
                  <p className="font-bold">{stop.villageName}</p>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase">
                    <Clock className="w-3 h-3" /> Scheduled Stop
                  </div>
                  {(stop as any).lastRecordedAt && (
                    <div className="text-[9px] text-green-400 font-medium mt-1">
                      GPS Updated: {format(new Date((stop as any).lastRecordedAt), 'MMM dd, HH:mm')} by {(stop as any).lastRecordedBy || 'Driver'}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={recordingStopId === stop.id}
                    onClick={() => recordStopCoordinates(stop)}
                    className={`p-3.5 rounded-2xl flex items-center justify-center gap-1 text-black font-black text-xs uppercase cursor-pointer tracking-wider transition-all scale-100 active:scale-95 ${
                      recordingStopId === stop.id 
                        ? 'bg-neutral-700 text-neutral-400 animate-pulse' 
                        : 'bg-emerald-400 hover:bg-emerald-500 shadow-md shadow-emerald-400/10'
                    }`}
                    title="Record current GPS coordinates for this stop"
                  >
                    <MapPin className="w-5 h-5 shrink-0" />
                    <span className="hidden sm:inline">Record GPS</span>
                  </button>
                  <button 
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`, '_blank')}
                    className="p-3.5 bg-yellow-500 hover:bg-yellow-600 rounded-2xl text-black shadow-md shadow-yellow-500/20 active:scale-90 transition-transform cursor-pointer"
                  >
                    <Navigation className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Emergency Section */}
        <div className="bg-red-950/30 border border-red-500/20 p-6 rounded-[40px]">
          <h4 className="text-xs font-black text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Emergency Assistance
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <button className="bg-red-500 text-white p-4 rounded-3xl font-black text-xs flex items-center justify-center gap-2">
              <Phone className="w-4 h-4" /> Principal
            </button>
            <button className="bg-white/5 text-white p-4 rounded-3xl font-black text-xs flex items-center justify-center gap-2 border border-white/10">
              <Shield className="w-4 h-4" /> Transport
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Floating Navigation for "App" Feel */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black to-transparent pointer-events-none">
        <div className="max-w-md mx-auto bg-neutral-900 border border-white/10 rounded-[32px] p-4 shadow-2xl flex items-center justify-between pointer-events-auto">
          <button className="flex-1 flex flex-col items-center gap-1 text-yellow-500">
            <Bus className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-tighter">My Bus</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-1 text-neutral-500">
            <MapPin className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Nearby</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-1 text-neutral-500">
            <User className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Profile</span>
          </button>
          <button 
             onClick={() => window.location.href = '/'}
             className="flex-1 flex flex-col items-center gap-1 text-red-500"
          >
            <Power className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverPortal;
