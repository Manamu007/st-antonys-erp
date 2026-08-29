import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Bus, Navigation, Phone, ShieldCheck, MapPin, Clock } from 'lucide-react';
import { motion } from 'motion/react';

const ParentTracking: React.FC = () => {
  const { busId } = useParams<{ busId: string }>();
  const [bus, setBus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'terrain'>('roadmap');

  const getMapUrl = () => {
    const base = "https://www.google.com/maps/embed?pb=";
    const roadmap = "!1m14!1m12!1m3!1d15228.6!2d78.4!3d17.4!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sin";
    const satellite = "!1m14!1m12!1m3!1d15228.6!2d78.4!3d17.4!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e3!3m2!1sen!2sin";
    const terrain = "!1m14!1m12!1m3!1d15228.6!2d78.4!3d17.4!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e2!3m2!1sen!2sin";
    const suffix = "!4v1620000000000!5m2!1sen!2sin";

    if (mapType === 'satellite') return base + satellite + suffix;
    if (mapType === 'terrain') return base + terrain + suffix;
    return base + roadmap + suffix;
  };

  useEffect(() => {
    if (!busId) return;
    
    const unsub = onSnapshot(doc(db, 'buses', busId), (doc) => {
      if (doc.exists()) {
        setBus({ id: doc.id, ...doc.data() });
      }
      setLoading(false);
    }, (error) => {
      console.error("Tracking subscription error:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [busId]);

  if (loading) return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-8">
      <div className="space-y-4 text-center">
        <Bus className="w-12 h-12 text-primary mx-auto animate-bounce" />
        <p className="font-black text-sidebar">Initializing Live Feed...</p>
      </div>
    </div>
  );

  if (!bus) return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-8">
      <div className="bg-white p-8 rounded-[40px] shadow-xl text-center space-y-4 max-w-md w-full border border-neutral-200">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl mx-auto flex items-center justify-center">
          <Navigation className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-black text-sidebar">Journey Not Found</h3>
        <p className="text-neutral-500 font-medium">The tracking link might have expired or the bus is currently offline.</p>
        <button onClick={() => window.location.reload()} className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg">Refresh Status</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
       {/* Mobile Floating Header */}
       <div className="fixed top-4 inset-x-4 z-50 bg-white/80 backdrop-blur-md p-4 rounded-3xl border border-white shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg">
                <Bus className="w-6 h-6" />
             </div>
             <div>
                <h4 className="font-black text-sidebar">Bus {bus.busNumber}</h4>
                <div className="flex items-center gap-1">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                   <span className="text-[10px] font-black uppercase text-green-600">Live Tracking</span>
                </div>
             </div>
          </div>
          <a href={`tel:${bus.driverPhone}`} className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center text-sidebar hover:bg-neutral-200 transition-all">
             <Phone className="w-5 h-5" />
          </a>
       </div>

       {/* Main Map */}
       <div className="flex-1 relative bg-neutral-200">
          <iframe 
            width="100%" 
            height="100%" 
            frameBorder="0" 
            style={{ border: 0 }}
            src={getMapUrl()} 
            allowFullScreen
          />

          {/* Map Controls */}
          <div className="absolute top-24 right-4 flex flex-col gap-2 z-20">
             <button 
               onClick={() => setMapType('roadmap')}
               className={`p-3 rounded-2xl shadow-xl transition-all border-2 ${mapType === 'roadmap' ? 'bg-sidebar text-white border-white' : 'bg-white text-sidebar border-transparent'}`}
             >
               <MapPin className="w-5 h-5" />
             </button>
             <button 
               onClick={() => setMapType('satellite')}
               className={`p-3 rounded-2xl shadow-xl transition-all border-2 ${mapType === 'satellite' ? 'bg-sidebar text-white border-white' : 'bg-white text-sidebar border-transparent'}`}
             >
               <ShieldCheck className="w-5 h-5" />
             </button>
             <button 
               onClick={() => setMapType('terrain')}
               className={`p-3 rounded-2xl shadow-xl transition-all border-2 ${mapType === 'terrain' ? 'bg-sidebar text-white border-white' : 'bg-white text-sidebar border-transparent'}`}
             >
               <Navigation className="w-5 h-5" />
             </button>
          </div>
          
          {/* Animated Marker */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <motion.div 
               animate={{ y: [0, -10, 0] }}
               transition={{ duration: 2, repeat: Infinity }}
               className="pointer-events-auto"
             >
                <div className="flex flex-col items-center">
                   <div className="bg-sidebar text-white px-4 py-1.5 rounded-full shadow-2xl border border-white/20 mb-2 flex items-center gap-2 transform -translate-y-4">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs font-black whitespace-nowrap tracking-widest uppercase">BUS {bus.busNumber}</span>
                   </div>
                   <div className="relative">
                      <div className="w-20 h-20 bg-sidebar text-yellow-400 rounded-[32px] flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-[6px] border-white z-10 relative">
                         <Bus className="w-10 h-10" />
                      </div>
                      {/* Large Pin Tail */}
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-white rotate-45 z-0 rounded-sm" />
                   </div>
                </div>
             </motion.div>
          </div>
       </div>

       {/* Info Panel */}
       <div className="bg-white p-6 md:p-10 rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.05)] space-y-6 relative z-10">
          <div className="w-12 h-1.5 bg-neutral-200 rounded-full mx-auto mb-4" />
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
             <div className="p-4 bg-neutral-50 rounded-2xl space-y-1">
                <p className="text-[10px] font-black text-neutral-400 uppercase">Driver</p>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sidebar truncate mr-1">{bus.driverName}</p>
                  <a href={`tel:${bus.driverPhone}`} className="text-primary hover:text-sidebar transition-colors">
                    <Phone className="w-3 h-3" />
                  </a>
                </div>
             </div>
             {bus.helperName && (
               <div className="p-4 bg-neutral-50 rounded-2xl space-y-1">
                  <p className="text-[10px] font-black text-neutral-400 uppercase">Helper</p>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sidebar truncate mr-1">{bus.helperName}</p>
                    {bus.helperPhone && (
                      <a href={`tel:${bus.helperPhone}`} className="text-primary hover:text-sidebar transition-colors">
                        <Phone className="w-3 h-3" />
                      </a>
                    )}
                  </div>
               </div>
             )}
             <div className="p-4 bg-neutral-50 rounded-2xl space-y-1">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-tight">Status</p>
                <p className="font-bold text-sidebar capitalize">{bus.status}</p>
             </div>
             <div className="p-4 bg-green-50 rounded-2xl space-y-1 border border-green-100">
                <p className="text-[10px] font-black text-green-600 uppercase">Speed</p>
                <p className="font-bold text-green-700">32 km/h</p>
             </div>
             <div className="p-4 bg-primary/5 rounded-2xl space-y-1 border border-primary/10">
                <p className="text-[10px] font-black text-primary uppercase">Security</p>
                <div className="flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-primary" />
                   <span className="font-bold text-primary">Verified Feed</span>
                </div>
             </div>
          </div>

          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h5 className="font-black text-sidebar text-lg">Next Stops</h5>
                <Clock className="w-5 h-5 text-neutral-300" />
             </div>
             <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                {['Rampur', 'Shanthi Nagar', 'Main Road', 'School'].map((stop, i) => (
                  <div key={i} className="flex-shrink-0 flex items-center gap-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                    <div className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center text-primary font-bold">{i+1}</div>
                    <div>
                      <p className="text-xs font-bold text-sidebar">{stop}</p>
                      <p className="text-[10px] text-neutral-400">ETA: {5 + i*8} mins</p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
       </div>
    </div>
  );
};

export default ParentTracking;
