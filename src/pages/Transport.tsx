import React, { useEffect, useState, useMemo } from 'react';
import { where } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { 
  Bus, 
  MapPin, 
  User, 
  Phone, 
  Navigation,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Search,
  Plus,
  Coins,
  Settings,
  Activity,
  History,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  BellRing,
  Edit,
  Trash2,
  Database,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { SchoolBus, TransportStop, UserProfile, FeeStructure } from '../types';
import { format } from 'date-fns';

const Transport: React.FC = () => {
  const { hasPermission, profile, isParent, isStudent } = useAuth();
  const [activeTab, setActiveTab] = useState<'transport' | 'routes' | 'live' | 'history' | 'backup'>('transport');
  const [stopBackups, setStopBackups] = useState<any[]>([]);
  const [busesViewMode, setBusesViewMode] = useState<'list' | 'grid'>('list');
  const [stopsViewMode, setStopsViewMode] = useState<'list' | 'grid'>('list');
  const [expandedBusId, setExpandedBusId] = useState<string | null>(null);

  // Sorting and view states
  const [busSortField, setBusSortField] = useState<'busNumber' | 'routeName' | 'driverName' | 'status'>('busNumber');
  const [busSortDirection, setBusSortDirection] = useState<'asc' | 'desc'>('asc');
  const [stopSortField, setStopSortField] = useState<'order' | 'villageName' | 'bus' | 'fee'>('bus');
  const [stopSortDirection, setStopSortDirection] = useState<'asc' | 'desc'>('asc');
  const [viewingAllottedVillagesBus, setViewingAllottedVillagesBus] = useState<SchoolBus | null>(null);
  
  const [requestLoading, setRequestLoading] = useState(false);
  const [showCustomPhone, setShowCustomPhone] = useState(false);
  const [customPhone, setCustomPhone] = useState('');

  const handleRequestWhatsAppLink = async () => {
    if (!profile?.uid) {
      toast.error("User profile is not fully initialized.");
      return;
    }
    
    setRequestLoading(true);
    try {
      const response = await fetch('/api/transport/request-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: profile.uid,
          customPhone: customPhone ? customPhone : undefined
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request tracking link');
      }
      
      toast.success(`Success! Live tracking link sent over WhatsApp to ${data.recipient}`);
      setShowCustomPhone(false);
      setCustomPhone('');
    } catch (error: any) {
      toast.error(error.message || "An unexpected error occurred");
    } finally {
      setRequestLoading(false);
    }
  };

  if (!hasPermission('transport_view') && !hasPermission('portal_student_view_transport')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm text-center">
        <Bus className="w-12 h-12 text-sidebar/30 mb-4" />
        <h2 className="text-xl font-black text-sidebar uppercase tracking-tight">Access Restricted</h2>
        <p className="text-neutral-500 text-sm max-w-xs mt-2 font-medium">You don't have permission to view transport modules. Contact admin.</p>
      </div>
    );
  }
  const [buses, setBuses] = useState<SchoolBus[]>([]);
  const [stops, setStops] = useState<TransportStop[]>([]);

  // Robust driver assigned bus check
  const isDriverAssignedBus = (bus: SchoolBus) => {
    if (!profile) return false;
    if (profile.role !== 'driver') return false;
    if (bus.driverId === profile.uid || (profile.id && bus.driverId === profile.id)) return true;
    
    const normalizedProfilePhone = profile.phone || profile.whatsappNumber || (profile as any).phone || '';
    const cleanProfilePhone = normalizedProfilePhone.replace(/\D/g, '').slice(-10);
    
    const cleanBusPhone = (bus.driverPhone || '').replace(/\D/g, '').slice(-10);
    if (cleanBusPhone && cleanProfilePhone && cleanBusPhone === cleanProfilePhone) return true;
    
    return false;
  };

  // Computed Sorted Buses
  const sortedBuses = useMemo(() => {
    let sourceBuses = buses;
    if (profile?.role === 'driver') {
      const assigned = buses.filter(b => isDriverAssignedBus(b));
      if (assigned.length > 0) {
        sourceBuses = assigned;
      } else {
        sourceBuses = buses; // Fallback: show all buses if none matches specifically, preventing a blank screen
      }
    }
    return [...sourceBuses].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      
      if (busSortField === 'busNumber') {
        valA = a.busNumber || '';
        valB = b.busNumber || '';
        return busSortDirection === 'asc' 
          ? valA.localeCompare(valB, undefined, { numeric: true }) 
          : valB.localeCompare(valA, undefined, { numeric: true });
      } else if (busSortField === 'routeName') {
        valA = (a as any).routeName || '';
        valB = (b as any).routeName || '';
      } else if (busSortField === 'driverName') {
        valA = a.driverName || '';
        valB = b.driverName || '';
      } else if (busSortField === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      }
      
      if (busSortDirection === 'asc') {
        return String(valA).localeCompare(String(valB));
      } else {
        return String(valB).localeCompare(String(valA));
      }
    });
  }, [buses, busSortField, busSortDirection, profile]);

  // Computed Sorted Stops
  const sortedStops = useMemo(() => {
    let sourceStops = stops;
    if (profile?.role === 'driver') {
      const driverBus = buses.find(b => isDriverAssignedBus(b));
      if (driverBus) {
        sourceStops = stops.filter(s => (s as any).busId === driverBus.id);
      } else {
        sourceStops = stops; // Fallback: show all stops if no assigned bus is found, preventing blank screen
      }
    }
    return [...sourceStops].sort((a, b) => {
      if (stopSortField === 'order') {
        const valA = a.order || 0;
        const valB = b.order || 0;
        return stopSortDirection === 'asc' ? valA - valB : valB - valA;
      } else if (stopSortField === 'villageName') {
        const valA = a.villageName || '';
        const valB = b.villageName || '';
        return stopSortDirection === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else if (stopSortField === 'fee') {
        const valA = a.fee || 0;
        const valB = b.fee || 0;
        return stopSortDirection === 'asc' ? valA - valB : valB - valA;
      } else if (stopSortField === 'bus') {
        const aBus = buses.find(b => b.id === (a as any).busId);
        const bBus = buses.find(b => b.id === (b as any).busId);
        
        if (stopSortDirection === 'asc') {
          if (aBus && !bBus) return -1;
          if (!aBus && bBus) return 1;
          if (!aBus && !bBus) return 0;
        } else {
          if (aBus && !bBus) return 1;
          if (!aBus && bBus) return -1;
          if (!aBus && !bBus) return 0;
        }

        const valA = aBus?.busNumber || '';
        const valB = bBus?.busNumber || '';
        return stopSortDirection === 'asc' 
          ? valA.localeCompare(valB, undefined, { numeric: true }) 
          : valB.localeCompare(valA, undefined, { numeric: true });
      }
      return 0;
    });
  }, [stops, buses, stopSortField, stopSortDirection, profile]);

  const handleBusSort = (field: 'busNumber' | 'routeName' | 'driverName' | 'status') => {
    if (busSortField === field) {
      setBusSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setBusSortField(field);
      setBusSortDirection('asc');
    }
  };

  const handleStopSort = (field: 'order' | 'villageName' | 'bus' | 'fee') => {
    if (stopSortField === field) {
      setStopSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStopSortField(field);
      setStopSortDirection('asc');
    }
  };
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [newBus, setNewBus] = useState<Partial<SchoolBus & { routeName: string }>>({
    busNumber: '',
    routeName: '',
    driverName: '',
    driverPhone: '',
    driverId: '',
    helperName: '',
    helperPhone: '',
    helperId: '',
    status: 'active'
  });

  const [newStop, setNewStop] = useState<Partial<TransportStop>>({
    villageName: '',
    busId: '',
    fee: 0,
    latitude: 0,
    longitude: 0,
    order: 0
  });

  const handleSaveBus = async () => {
    if (!newBus.busNumber || !newBus.driverName || !newBus.driverPhone) {
      toast.error("Please fill in basic bus details");
      return;
    }

    try {
      if (selectedBus && buses.find(b => b.id === selectedBus)) {
        await dbService.update('buses', selectedBus, newBus);
        toast.success("Bus updated successfully");
      } else {
        const busId = `${newBus.busNumber}_${(newBus.routeName || 'NoRoute').trim().replace(/\s+/g, '_')}`;
        await dbService.create('buses', busId, newBus);
        toast.success("Bus added successfully");
      }
      setIsBusModalOpen(false);
      setSelectedBus(null);
      setNewBus({
        busNumber: '',
        routeName: '',
        driverName: '',
        driverPhone: '',
        driverId: '',
        helperName: '',
        helperPhone: '',
        helperId: '',
        status: 'active'
      });
      fetchData();
    } catch (error) {
      toast.error("Failed to save bus");
    }
  };

  const handleSaveStop = async () => {
    if (!newStop.villageName || !newStop.busId) {
      toast.error("Please select a village and assign a bus");
      return;
    }

    try {
      if (selectedStop) {
        await dbService.update('stops', selectedStop, newStop);
        toast.success("Stop updated successfully");
      } else {
        const stopId = `stop_${Date.now()}`;
        await dbService.create('stops', stopId, newStop);
        toast.success("Stop added successfully");
      }
      setIsStopModalOpen(false);
      setSelectedStop(null);
      setNewStop({
        villageName: '',
        busId: '',
        fee: 0,
        latitude: 0,
        longitude: 0,
        order: 0
      });
      fetchData();
    } catch (error) {
      toast.error("Failed to save stop");
    }
  };

  const handleDeleteStop = async (id: string) => {
    if (!confirm("Are you sure you want to delete this stop?")) return;
    try {
      await dbService.delete('stops', id);
      toast.success("Stop deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete stop");
    }
  };

  const handleStartSimulation = async (busId: string) => {
    const busStops = stops.filter(s => (s as any).busId === busId).sort((a, b) => a.order - b.order);
    if (busStops.length === 0) {
      toast.error("No stops configured for this bus.");
      return;
    }

    setIsSimulating(true);
    toast.info("Starting journey simulation...");

    for (const stop of busStops) {
      // Update location
      await dbService.update('buses', busId, {
        currentLat: stop.latitude,
        currentLng: stop.longitude,
        status: 'on-road',
        lastUpdate: new Date().toISOString()
      });

      // Trigger server-side WhatsApp alert
      try {
        await fetch('/api/transport/alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ busId, stopId: stop.id })
        });
        toast.success(`Approaching ${stop.villageName} - Alert Sent!`);
      } catch (err) {
        console.error("Simulation alert error:", err);
      }

      await new Promise(r => setTimeout(r, 4000));
    }

    setIsSimulating(false);
    toast.success("Simulation completed successfully.");
    fetchData();
  };

  useEffect(() => {
    const unsubBuses = dbService.subscribe('buses', [], (data) => {
      setBuses(data as SchoolBus[]);
      setLoading(false);
    });

    const unsubStops = dbService.subscribe('stops', [], (data) => {
      setStops(data as TransportStop[]);
    });

    const unsubBackups = dbService.subscribe('stop_backups', [], (data) => {
      setStopBackups(data || []);
    });

    // One-time fetches for metadata (roles, subjects, staff)
    const fetchMetadata = async () => {
      try {
        const roles = await dbService.list('roles');
        const defaultRoles = ['teacher', 'accountant', 'clerk', 'admin', 'principal', 'vice_principal', 'staff', 'driver', 'attendant', 'helper', 'aya', 'coordinator', 'front_office', 'receptionist'];
        const staffRoles = Array.from(new Set([...defaultRoles, ...roles.filter((r: any) => !r.isDeleted).map((r: any) => r.id)])).slice(0, 30);

        const [driversData, staffData, feeData] = await Promise.all([
          dbService.list('staff', [where('role', '==', 'driver')]),
          dbService.list('staff', [where('role', 'in', staffRoles)]),
          dbService.list('feeStructures')
        ]);

        setDrivers(driversData as UserProfile[]);
        setStaff(staffData as UserProfile[]);
        setFeeStructures((feeData as FeeStructure[]).filter(f => f.type === 'transport'));
        
        // Only fetch students if needed or use search
        const studentsData = await dbService.list('students');
        const transportStudents = studentsData.filter(s => s.transportStopId != null);
        setStudents(transportStudents as UserProfile[]);

      } catch (error) {
        console.error("Error fetching transport metadata:", error);
      }
    };
    
    fetchMetadata();

    return () => {
      unsubBuses();
      unsubStops();
      unsubBackups();
    };
  }, []);

  const fetchData = () => {
    // legacy fetchData kept as empty if called by old handlers, 
    // but subscriptions handle the main data now
  };

  const getBusTheme = (busId: string | undefined | null) => {
    const themes = [
      {
        bg: 'bg-emerald-50/70 border-emerald-200/60 text-emerald-900 hover:bg-emerald-100/50',
        busBg: 'bg-emerald-50/40 hover:bg-emerald-50/80 border-emerald-200/50',
        tag: 'bg-emerald-100 text-emerald-800 border border-emerald-200/50',
        dot: 'bg-emerald-500',
        header: 'text-emerald-950 font-black',
        btn: 'hover:bg-emerald-200/50 text-emerald-700 bg-white border border-emerald-300/40 shadow-sm',
        text: 'text-emerald-700',
        iconBg: 'bg-emerald-100/80 text-emerald-700 border border-emerald-200/50',
        gradient: 'from-emerald-500/10 to-teal-500/5',
        gradientHover: 'group-hover:from-emerald-500/20 group-hover:to-teal-500/10'
      },
      {
        bg: 'bg-indigo-50/70 border-indigo-200/60 text-indigo-900 hover:bg-indigo-100/50',
        busBg: 'bg-indigo-50/40 hover:bg-indigo-50/80 border-indigo-200/50',
        tag: 'bg-indigo-100 text-indigo-800 border border-indigo-200/50',
        dot: 'bg-indigo-500',
        header: 'text-indigo-950 font-black',
        btn: 'hover:bg-indigo-200/50 text-indigo-700 bg-white border border-indigo-300/40 shadow-sm',
        text: 'text-indigo-700',
        iconBg: 'bg-indigo-100/80 text-indigo-700 border border-indigo-200/50',
        gradient: 'from-indigo-500/10 to-blue-500/5',
        gradientHover: 'group-hover:from-indigo-500/20 group-hover:to-blue-500/10'
      },
      {
        bg: 'bg-amber-50/70 border-amber-200/60 text-amber-900 hover:bg-amber-100/50',
        busBg: 'bg-amber-50/40 hover:bg-amber-50/80 border-amber-200/50',
        tag: 'bg-amber-100 text-amber-850 border border-amber-200/50',
        dot: 'bg-amber-500',
        header: 'text-amber-950 font-black',
        btn: 'hover:bg-amber-200/50 text-amber-700 bg-white border border-amber-300/40 shadow-sm',
        text: 'text-amber-700',
        iconBg: 'bg-amber-100/80 text-amber-800 border border-amber-200/50',
        gradient: 'from-amber-500/10 to-orange-500/5',
        gradientHover: 'group-hover:from-amber-500/20 group-hover:to-orange-500/10'
      },
      {
        bg: 'bg-rose-50/70 border-rose-200/60 text-rose-900 hover:bg-rose-100/50',
        busBg: 'bg-rose-50/40 hover:bg-rose-50/80 border-rose-200/50',
        tag: 'bg-rose-100 text-rose-800 border border-rose-200/50',
        dot: 'bg-rose-500',
        header: 'text-rose-950 font-black',
        btn: 'hover:bg-rose-200/50 text-rose-700 bg-white border border-rose-300/40 shadow-sm',
        text: 'text-rose-700',
        iconBg: 'bg-rose-100/80 text-rose-700 border border-rose-200/50',
        gradient: 'from-rose-500/10 to-pink-500/5',
        gradientHover: 'group-hover:from-rose-500/20 group-hover:to-pink-500/10'
      },
      {
        bg: 'bg-sky-50/70 border-sky-200/60 text-sky-900 hover:bg-sky-100/50',
        busBg: 'bg-sky-50/40 hover:bg-sky-50/80 border-sky-200/50',
        tag: 'bg-sky-100 text-sky-800 border border-sky-200/50',
        dot: 'bg-sky-500',
        header: 'text-sky-950 font-black',
        btn: 'hover:bg-sky-200/50 text-sky-700 bg-white border border-sky-300/40 shadow-sm',
        text: 'text-sky-700',
        iconBg: 'bg-sky-100/80 text-sky-750 border border-sky-200/50',
        gradient: 'from-sky-500/10 to-indigo-500/5',
        gradientHover: 'group-hover:from-sky-500/20 group-hover:to-indigo-500/10'
      },
      {
        bg: 'bg-purple-50/70 border-purple-200/60 text-purple-900 hover:bg-purple-100/50',
        busBg: 'bg-purple-50/40 hover:bg-purple-50/80 border-purple-200/50',
        tag: 'bg-purple-100 text-purple-800 border border-purple-200/50',
        dot: 'bg-purple-500',
        header: 'text-purple-950 font-black',
        btn: 'hover:bg-purple-200/50 text-purple-700 bg-white border border-purple-300/40 shadow-sm',
        text: 'text-purple-700',
        iconBg: 'bg-purple-100/80 text-purple-750 border border-purple-200/50',
        gradient: 'from-purple-500/10 to-fuchsia-500/5',
        gradientHover: 'group-hover:from-purple-500/20 group-hover:to-fuchsia-500/10'
      },
      {
        bg: 'bg-teal-50/70 border-teal-200/60 text-teal-900 hover:bg-teal-100/50',
        busBg: 'bg-teal-50/40 hover:bg-teal-50/80 border-teal-200/50',
        tag: 'bg-teal-100 text-teal-800 border border-teal-200/50',
        dot: 'bg-teal-500',
        header: 'text-teal-950 font-black',
        btn: 'hover:bg-teal-200/50 text-teal-700 bg-white border border-teal-300/40 shadow-sm',
        text: 'text-teal-700',
        iconBg: 'bg-teal-100/80 text-teal-700 border border-teal-200/50',
        gradient: 'from-teal-500/10 to-emerald-500/5',
        gradientHover: 'group-hover:from-teal-500/20 group-hover:to-emerald-500/10'
      },
      {
        bg: 'bg-fuchsia-50/70 border-fuchsia-200/60 text-fuchsia-900 hover:bg-fuchsia-100/50',
        busBg: 'bg-fuchsia-50/40 hover:bg-fuchsia-50/80 border-fuchsia-200/50',
        tag: 'bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200/50',
        dot: 'bg-fuchsia-500',
        header: 'text-fuchsia-950 font-black',
        btn: 'hover:bg-fuchsia-200/50 text-fuchsia-700 bg-white border border-fuchsia-300/40 shadow-sm',
        text: 'text-fuchsia-700',
        iconBg: 'bg-fuchsia-100/80 text-fuchsia-700 border border-fuchsia-200/50',
        gradient: 'from-fuchsia-500/10 to-rose-500/5',
        gradientHover: 'group-hover:from-fuchsia-500/20 group-hover:to-rose-500/10'
      },
      {
        bg: 'bg-orange-50/70 border-orange-200/60 text-orange-900 hover:bg-orange-100/50',
        busBg: 'bg-orange-50/40 hover:bg-orange-50/80 border-orange-200/50',
        tag: 'bg-orange-100 text-orange-850 border border-orange-200/50',
        dot: 'bg-orange-500',
        header: 'text-orange-950 font-black',
        btn: 'hover:bg-orange-200/50 text-orange-700 bg-white border border-orange-300/40 shadow-sm',
        text: 'text-orange-700',
        iconBg: 'bg-orange-100/80 text-orange-700 border border-orange-200/50',
        gradient: 'from-orange-500/10 to-amber-500/5',
        gradientHover: 'group-hover:from-orange-500/20 group-hover:to-amber-500/10'
      },
      {
        bg: 'bg-cyan-50/70 border-cyan-200/60 text-cyan-900 hover:bg-cyan-100/50',
        busBg: 'bg-cyan-50/40 hover:bg-cyan-50/80 border-cyan-200/50',
        tag: 'bg-cyan-100 text-cyan-800 border border-cyan-200/50',
        dot: 'bg-cyan-500',
        header: 'text-cyan-950 font-black',
        btn: 'hover:bg-cyan-200/50 text-cyan-700 bg-white border border-cyan-300/40 shadow-sm',
        text: 'text-cyan-700',
        iconBg: 'bg-cyan-100/80 text-cyan-700 border border-cyan-200/50',
        gradient: 'from-cyan-500/10 to-sky-500/5',
        gradientHover: 'group-hover:from-cyan-500/20 group-hover:to-sky-500/10'
      },
      {
        bg: 'bg-lime-50/70 border-lime-200/60 text-lime-900 hover:bg-lime-100/50',
        busBg: 'bg-lime-50/40 hover:bg-lime-50/80 border-lime-200/50',
        tag: 'bg-lime-100 text-lime-800 border border-lime-200/50',
        dot: 'bg-lime-500',
        header: 'text-lime-950 font-black',
        btn: 'hover:bg-lime-200/50 text-lime-700 bg-white border border-lime-300/40 shadow-sm',
        text: 'text-lime-700',
        iconBg: 'bg-lime-100/80 text-lime-700 border border-lime-200/50',
        gradient: 'from-lime-500/10 to-emerald-500/5',
        gradientHover: 'group-hover:from-lime-500/20 group-hover:to-emerald-500/10'
      },
      {
        bg: 'bg-yellow-50/70 border-yellow-200/60 text-yellow-905 hover:bg-yellow-100/50',
        busBg: 'bg-yellow-50/40 hover:bg-yellow-50/80 border-yellow-200/50',
        tag: 'bg-yellow-100 text-yellow-800 border border-yellow-200/50',
        dot: 'bg-yellow-500',
        header: 'text-yellow-950 font-black',
        btn: 'hover:bg-yellow-200/50 text-yellow-700 bg-white border border-yellow-300/40 shadow-sm',
        text: 'text-yellow-700',
        iconBg: 'bg-yellow-100/80 text-yellow-750 border border-yellow-200/50',
        gradient: 'from-yellow-500/10 to-amber-500/5',
        gradientHover: 'group-hover:from-yellow-500/20 group-hover:to-amber-500/10'
      }
    ];

    if (!busId) {
      return {
        bg: 'bg-neutral-50/70 border-neutral-200/60 text-neutral-900 hover:bg-neutral-100/50',
        busBg: 'bg-neutral-50/40 border-neutral-200/50 hover:bg-neutral-100/30',
        tag: 'bg-neutral-100 text-neutral-800 border border-neutral-200/50',
        dot: 'bg-neutral-400',
        header: 'text-neutral-900 font-extrabold',
        btn: 'hover:bg-neutral-200/50 text-neutral-700 bg-white border border-neutral-300/40 shadow-sm',
        text: 'text-neutral-500',
        iconBg: 'bg-neutral-100/80 text-neutral-600 border border-neutral-200/50',
        gradient: 'from-neutral-500/5 to-neutral-500/5',
        gradientHover: 'group-hover:from-neutral-500/10 group-hover:to-neutral-500/10'
      };
    }

    let hash = 0;
    const cleanId = String(busId).trim();
    for (let i = 0; i < cleanId.length; i++) {
      hash = cleanId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % themes.length;
    return themes[index];
  };

  // Transport View
  const TransportView = () => {
    const [busSearch, setBusSearch] = useState('');

    const filteredBuses = useMemo(() => {
      if (!busSearch) return sortedBuses;
      const q = busSearch.toLowerCase();
      return sortedBuses.filter(bus => 
        (bus.busNumber || '').toLowerCase().includes(q) ||
        ((bus as any).routeName || '').toLowerCase().includes(q) ||
        (bus.driverName || '').toLowerCase().includes(q)
      );
    }, [sortedBuses, busSearch]);

    return (
      <div className="space-y-6">
        {/* Personalized Header for Parents/Students */}
        {(isParent || isStudent) && profile?.transportBusId && (
          <section className="bg-gradient-to-br from-sidebar to-indigo-900 p-8 rounded-[40px] text-white shadow-2xl relative overflow-hidden group mb-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -mr-32 -mt-32 group-hover:bg-primary/20 transition-all duration-700" />
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
              <div className="w-24 h-24 bg-white/10 rounded-[32px] backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-inner">
                <Bus className="w-12 h-12 text-primary" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-3xl font-black italic tracking-tighter uppercase mb-2">FAMILY BUS TRACKING</h3>
                <div className="flex flex-wrap justify-center md:justify-start gap-4">
                  <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-md">
                     <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                     <span className="text-xs font-black uppercase tracking-widest">Bus {buses.find(b => b.id === profile.transportBusId)?.busNumber || 'Assigned'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-md">
                     <User className="w-4 h-4 text-primary" />
                     <span className="text-xs font-black uppercase tracking-widest">{buses.find(b => b.id === profile.transportBusId)?.driverName || 'Loading Driver...'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-md">
                     <Phone className="w-4 h-4 text-emerald-400" />
                     <span className="text-xs font-black uppercase tracking-widest">{buses.find(b => b.id === profile.transportBusId)?.driverPhone || '---'}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 shrink-0 w-full md:w-auto">
                <button 
                  onClick={() => setActiveTab('live')}
                  className="px-6 py-4 bg-primary text-white rounded-2xl font-black uppercase text-xs tracking-wider shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-center whitespace-nowrap opacity-100 cursor-pointer"
                >
                  Track Live Location
                </button>
                <button 
                  disabled={requestLoading}
                  onClick={handleRequestWhatsAppLink}
                  className="px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider shadow-xl shadow-emerald-600/10 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-white shrink-0" />
                  {requestLoading ? 'Sending...' : 'Get WA Link'}
                </button>
              </div>
            </div>

            {/* Custom phone toggle for personalized link request */}
            <div className="mt-6 pt-4 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <p className="text-xs text-white/70 font-medium">
                Want the tracking link on another student/parent WhatsApp mobile?
              </p>
              <div className="flex items-center gap-2">
                {showCustomPhone ? (
                  <>
                    <input
                      type="tel"
                      placeholder="Enter WhatsApp mobile"
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      className="bg-white/10 text-white placeholder-white/40 text-xs px-3 py-2 rounded-xl focus:outline-none border border-white/20 focus:border-white w-48 font-mono"
                    />
                    <button
                      onClick={handleRequestWhatsAppLink}
                      disabled={requestLoading}
                      className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => { setShowCustomPhone(false); setCustomPhone(''); }}
                      className="text-white/60 hover:text-white text-xs font-bold font-mono px-2 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowCustomPhone(true)}
                    className="text-xs text-yellow-400 hover:text-yellow-300 font-black tracking-wide uppercase flex items-center gap-1 cursor-pointer"
                  >
                    Specify Alternative Mobile
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Unified Buses List Card */}
        <div className="bg-white p-6 sm:p-8 rounded-[36px] border border-neutral-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-sidebar uppercase tracking-tight flex items-center gap-2">
                <Bus className="w-6 h-6 text-indigo-600 animate-pulse" />
                <span>Bus Routes &amp; Sequence Directory</span>
              </h3>
              <p className="text-xs text-neutral-500 font-medium font-sans">
                Expand any bus route item to view detailed stop sequences, fees, driver profiles, and helper assignments.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search buses, routes..."
                  value={busSearch}
                  onChange={(e) => setBusSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary/50 w-full sm:w-56 bg-neutral-50/50"
                />
              </div>

              {hasPermission('transport_manage') && profile?.role !== 'driver' && profile?.role !== 'clerk' && (
                <button 
                  onClick={() => setIsBusModalOpen(true)}
                  className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold hover:bg-sidebar transition-all shadow-lg shadow-primary/20 flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Bus
                </button>
              )}
            </div>
          </div>

          {filteredBuses.length === 0 ? (
            <div className="p-10 border border-neutral-150 rounded-2xl bg-neutral-50/50 text-center text-neutral-450 italic text-xs font-bold font-mono">
              No matching buses or route schedules found.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBuses.map((bus) => {
                const isExpanded = expandedBusId === bus.id;
                const theme = getBusTheme(bus.id);
                const busStops = stops.filter(s => (s as any).busId === bus.id).sort((a,b) => (a.order || 0) - (b.order || 0));

                return (
                  <div 
                    key={`bus-list-item-${bus.id}`}
                    className={`rounded-2xl border transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md ${theme.busBg} ${isExpanded ? 'ring-1 ring-primary/20 scale-[1.01]' : ''}`}
                  >
                    {/* Collapsed Header click zone */}
                    <div 
                      onClick={() => setExpandedBusId(isExpanded ? null : bus.id)}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                          <Bus className="w-6 h-6" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-black text-base uppercase tracking-tight ${theme.header}`}>
                              Bus {bus.busNumber}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              bus.status === 'active' ? 'bg-green-100 text-green-700 font-mono' : 
                              bus.status === 'on-road' ? 'bg-blue-105 text-blue-800 font-mono' : 'bg-red-100 text-red-700 font-mono'
                            }`}>
                              {bus.status}
                            </span>
                          </div>
                          
                          <p className="text-xs text-neutral-550 font-bold uppercase tracking-widest leading-none">
                            Route: <span className={`font-black uppercase text-xs ${theme.text}`}>{(bus as any).routeName || 'No Main Route Name'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Brief Metadata Row */}
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-neutral-500">
                        <div className="flex items-center gap-1.5 font-bold">
                          <User className="w-4 h-4 text-primary shrink-0" />
                          <span>Driver: <strong className="text-neutral-800">{bus.driverName}</strong></span>
                        </div>
                        {bus.helperName && (
                          <div className="flex items-center gap-1.5 font-bold hidden md:flex">
                            <User className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Helper: <strong className="text-neutral-800">{bus.helperName}</strong></span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 font-bold">
                          <MapPin className="w-4 h-4 text-indigo-505 shrink-0" />
                          <span>Stops: <strong className="text-neutral-800">{busStops.length} villages</strong></span>
                        </div>

                        {/* Expand Chevron Icon toggle */}
                        <div className="text-neutral-400 hover:text-neutral-600 ml-2">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable details area */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-neutral-200/50 pt-5 bg-white/60 space-y-6">
                        {/* Driver & Attendant Contact cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`p-4 rounded-xl border bg-white/80 shadow-inner flex items-center justify-between gap-4 ${theme.bg}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                                <User className="w-5 h-5" />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[10px] text-neutral-400 uppercase font-black tracking-widest leading-none">Primary Driver</p>
                                <p className="text-sm font-black text-sidebar leading-none">{bus.driverName}</p>
                                <p className="text-xs text-neutral-500 font-mono leading-none">{bus.driverPhone}</p>
                              </div>
                            </div>
                            <a 
                              href={`tel:${bus.driverPhone}`} 
                              className={`p-2.5 rounded-lg border flex items-center justify-center shadow-sm hover:scale-[1.03] transition-all text-xs font-semibold ${theme.btn}`}
                            >
                              <Phone className="w-3.5 h-3.5 text-primary" />
                            </a>
                          </div>

                          <div className={`p-4 rounded-xl border bg-white/80 shadow-inner flex items-center justify-between gap-4 ${theme.bg}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-neutral-100 text-neutral-500 border border-neutral-150`}>
                                <User className="w-5 h-5" />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[10px] text-neutral-400 uppercase font-black tracking-widest leading-none">Helper / Attendant</p>
                                <p className="text-sm font-black text-sidebar leading-none">{bus.helperName || '---'}</p>
                                <p className="text-xs text-neutral-500 font-mono leading-none">{bus.helperPhone || 'No contact'}</p>
                              </div>
                            </div>
                            {bus.helperPhone && (
                              <a 
                                href={`tel:${bus.helperPhone}`} 
                                className="p-2.5 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 rounded-lg flex items-center justify-center shadow-sm hover:scale-[1.03] transition-all"
                              >
                                <Phone className="w-3.5 h-3.5 text-neutral-500" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Chronological Stop Sequence Map */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-black uppercase text-neutral-500 tracking-widest flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-primary" />
                            <span>Sequence of Stops &amp; Fee Matrix</span>
                          </h4>

                          {busStops.length === 0 ? (
                            <div className="p-6 text-center border border-dashed border-neutral-200 rounded-xl bg-white/40 font-mono text-xs text-neutral-400 italic">
                              No village stops have been sequenced for this bus route.
                            </div>
                          ) : (
                            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-100">
                              {busStops.map((stop, sIdx) => (
                                <div key={stop.id} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white/40 rounded-xl border border-neutral-200/50 hover:bg-white/80 transition-all duration-200">
                                  {/* bullet node */}
                                  <div className={`absolute -left-6 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border bg-white flex items-center justify-center z-10 ${theme.bg}`}>
                                    <span className="text-[8px] font-black">{sIdx + 1}</span>
                                  </div>

                                  <div className="space-y-1 min-w-[200px]">
                                    <h5 className="text-sm font-black text-sidebar break-words">{stop.villageName}</h5>
                                    <p className="text-[10px] text-neutral-400 font-mono">GPS Lat/Lng: {stop.latitude?.toFixed(4)}, {stop.longitude?.toFixed(4)}</p>
                                  </div>

                                  <div className="flex items-center gap-4 justify-between sm:justify-end">
                                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-100/80 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm">
                                      <Coins className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>₹{stop.fee} <span className="text-[9px] font-normal text-emerald-600/70">/mo</span></span>
                                    </div>

                                    <div className="flex gap-1.5 shrink-0">
                                      <button 
                                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`, '_blank')}
                                        className="p-1.5 bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50 rounded-lg transition-all shadow-sm cursor-pointer"
                                        title="Show on Google Maps"
                                      >
                                        <Navigation className="w-3.5 h-3.5" />
                                      </button>
                                      {hasPermission('transport_manage') && profile?.role !== 'driver' && profile?.role !== 'clerk' && (
                                        <>
                                          <button 
                                            onClick={() => {
                                              setSelectedStop(stop.id);
                                              setNewStop({...stop});
                                              setIsStopModalOpen(true);
                                            }}
                                            className="p-1.5 bg-white border border-neutral-200 text-primary hover:bg-neutral-50 hover:border-indigo-200 rounded-lg transition-all shadow-sm cursor-pointer"
                                            title="Edit Stop parameters"
                                          >
                                            <Edit className="w-3.5 h-3.5" />
                                          </button>
                                          <button 
                                            onClick={() => handleDeleteStop(stop.id)}
                                            className="p-1.5 bg-white border border-rose-100 text-rose-500 hover:bg-rose-50 rounded-lg transition-all shadow-sm cursor-pointer"
                                            title="Remove Stop"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Accordion Footer Action Tools */}
                        <div className="flex flex-wrap items-center justify-between border-t border-neutral-200/50 pt-4 gap-4">
                          <div className="flex items-center gap-2">
                            {bus.status === 'on-road' && (
                              <button
                                onClick={() => {
                                  setActiveTab('live');
                                }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                              >
                                <Navigation className="w-3.5 h-3.5 animate-bounce" />
                                <span>Track On Map</span>
                              </button>
                            )}                             {hasPermission('transport_manage') && profile?.role !== 'driver' && profile?.role !== 'clerk' && (
                              <button 
                                disabled={isSimulating}
                                onClick={() => handleStartSimulation(bus.id)}
                                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-250 text-neutral-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-neutral-200 shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                <Activity className="w-3.5 h-3.5 text-primary" />
                                <span>Simulate Route GPS</span>
                              </button>
                            )}
                          </div>

                          {/* Settings configure for Admin */}
                          {hasPermission('transport_manage') && profile?.role !== 'driver' && profile?.role !== 'clerk' && (
                            <button 
                              onClick={() => {
                                setSelectedBus(bus.id);
                                setNewBus(bus);
                                setIsBusModalOpen(true);
                              }}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${theme.btn}`}
                              title="Edit main settings of this vehicle"
                            >
                              <Settings className="w-4 h-4 text-neutral-600" />
                              <span>Edit Bus Settings</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Routes & Fees Matrix
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'terrain'>('roadmap');

  const getMapUrl = () => {
    const base = "https://www.google.com/maps/embed?pb=";
    // Standard roadmap
    const roadmap = "!1m14!1m12!1m3!1d15228.6!2d78.4!3d17.4!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sin";
    // Satellite
    const satellite = "!1m14!1m12!1m3!1d15228.6!2d78.4!3d17.4!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e3!3m2!1sen!2sin";
    // Terrain
    const terrain = "!1m14!1m12!1m3!1d15228.6!2d78.4!3d17.4!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e2!3m2!1sen!2sin";
    
    const suffix = "!4v1620000000000!5m2!1sen!2sin";

    if (mapType === 'satellite') return base + satellite + suffix;
    if (mapType === 'terrain') return base + terrain + suffix;
    return base + roadmap + suffix;
  };  const RoutesView = () => {
    // Filter unassigned stops
    const unassignedStops = stops
      .filter(s => {
        const assignedBus = buses.find(b => b.id === (s as any).busId);
        return !assignedBus;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    return (
      <div className="space-y-10">
        {/* Banner with controls */}
        <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-neutral-200 overflow-hidden relative shadow-sm">
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <h3 className="text-3xl sm:text-4xl font-black text-sidebar tracking-tight flex items-center gap-3">
                <MapPin className="w-8 h-8 text-primary" />
                Village Route & Fee Matrix
              </h3>
              <p className="text-neutral-500 font-medium max-w-xl text-sm sm:text-base leading-relaxed">
                Configure geographic stops, assign them bus-wise to establish real-time journey maps, and declare distance-based monthly fees.
              </p>
            </div>
            {profile?.role !== 'driver' && profile?.role !== 'clerk' && hasPermission('transport_manage') && (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button 
                  onClick={() => setIsStopModalOpen(true)}
                  className="bg-primary text-white px-8 py-4 rounded-[20px] font-black hover:bg-sidebar transition-all flex items-center gap-2 shadow-lg shadow-primary/20 text-sm whitespace-nowrap"
                >
                  <Plus className="w-5 h-5" />
                  Add Village Stop
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b-2 border-indigo-500 text-[13px] font-extrabold uppercase text-white shadow-md select-none">
                  <th onClick={() => handleStopSort('bus')} className="px-6 py-4 rounded-tl-2xl cursor-pointer hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span>SNo/Order</span>
                      {stopSortField === 'bus' ? (
                        stopSortDirection === 'asc' ? <ArrowUp className="w-4 h-4 text-primary" /> : <ArrowDown className="w-4 h-4 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-neutral-400 opacity-60 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                  <th onClick={() => handleStopSort('villageName')} className="px-6 py-4 cursor-pointer hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span>Village Name</span>
                      {stopSortField === 'villageName' ? (
                        stopSortDirection === 'asc' ? <ArrowUp className="w-4 h-4 text-primary" /> : <ArrowDown className="w-4 h-4 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-neutral-400 opacity-60 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 select-none">
                    <span>Route Name</span>
                  </th>
                  <th onClick={() => handleStopSort('fee')} className="px-6 py-4 cursor-pointer hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span>Transport Fee (Monthly)</span>
                      {stopSortField === 'fee' ? (
                        stopSortDirection === 'asc' ? <ArrowUp className="w-4 h-4 text-primary" /> : <ArrowDown className="w-4 h-4 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-neutral-400 opacity-60 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4">Geolocation Coordinates</th>
                  <th className="px-6 py-4 text-right rounded-tr-2xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-150 text-xs font-bold text-neutral-700">
                {sortedStops.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-405 font-medium">
                      No village stops configured yet. Use the "Add Village Stop" button to define geographic stations.
                    </td>
                  </tr>
                ) : (
                  sortedStops.map((stop, idx) => {
                    const assignedBus = buses.find(b => b.id === (stop as any).busId);
                    const theme = getBusTheme(assignedBus?.id);
                    return (
                      <tr key={stop.id} className={`${theme.busBg} hover:brightness-95 transition-all duration-200 border-b border-neutral-200/40`}>
                        <td className="px-6 py-4">
                          <span className={`text-[11px] font-mono font-black bg-white/60 px-2.5 py-1.5 rounded border shadow-sm ${theme.text} ${theme.bg}`}>
                            {assignedBus ? `${assignedBus.busNumber}` : '--'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${theme.dot}`} />
                            <span className={`text-sm font-black uppercase tracking-tight ${theme.header}`}>{stop.villageName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {assignedBus ? (
                            <span className={`font-black uppercase truncate max-w-[200px] text-xs ${theme.text}`}>
                              {(assignedBus as any).routeName || 'No Main Route'}
                            </span>
                          ) : (
                            <span className="bg-neutral-105 border border-neutral-200 text-neutral-500 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider font-mono">
                              Unassigned Stop
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-sidebar font-extrabold text-sm">
                            <Coins className="w-4 h-4 text-emerald-600" />
                            <span>₹{stop.fee}</span>
                            <span className="text-[10px] font-normal text-neutral-400">/month</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-neutral-500 font-mono text-[11px]">
                          {stop.latitude?.toFixed(4) || '0.0000'}, {stop.longitude?.toFixed(4) || '0.0000'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button 
                              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`, '_blank')}
                              className="p-2 bg-neutral-50 border border-neutral-200 text-neutral-500 hover:bg-neutral-100 rounded-xl transition-all"
                              title="Open in Google Maps"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                            </button>
                            {profile?.role !== 'driver' && profile?.role !== 'clerk' && hasPermission('transport_manage') && (
                              <>
                                <button 
                                  onClick={() => {
                                    setSelectedStop(stop.id);
                                    setNewStop({...stop});
                                    setIsStopModalOpen(true);
                                  }}
                                  className="p-2 bg-neutral-50 border border-neutral-200 text-primary hover:bg-indigo-50 hover:border-indigo-200 rounded-xl transition-all"
                                  title="Edit Stop"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteStop(stop.id)}
                                  className="p-2 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 rounded-xl transition-all"
                                  title="Delete Stop"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Live Tracking View
  const LiveTrackingView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Sidebar: Active Transport */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-[32px] border border-neutral-200">
          <h3 className="text-lg font-black text-sidebar mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-500" />
            Live Transport
          </h3>
          <div className="space-y-4">
            {buses.filter(b => {
              if (isStudent || isParent) {
                return b.status === 'on-road' && b.id === profile?.transportBusId;
              }
              if (profile?.role === 'driver') {
                return isDriverAssignedBus(b);
              }
              return b.status === 'on-road';
            }).map(bus => (
              <div key={bus.id} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 hover:border-primary/30 transition-all cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-black text-sidebar">Bus {bus.busNumber}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${bus.status === 'on-road' ? 'bg-green-100 text-green-700' : 'bg-neutral-105 text-neutral-500'}`}>
                    {bus.status === 'on-road' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Driver</p>
                  <p className="text-xs font-bold text-neutral-700">{bus.driverName}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button 
                    disabled={isSimulating}
                    onClick={() => handleStartSimulation(bus.id)}
                    className="flex-1 bg-white border border-neutral-200 p-2 rounded-xl text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                  >
                    <Navigation className="w-4 h-4 mx-auto" />
                  </button>
                  <button className="flex-1 bg-white border border-neutral-200 p-2 rounded-xl text-green-600 hover:bg-green-600 hover:text-white transition-all">
                    <MessageSquare className="w-4 h-4 mx-auto" />
                  </button>
                </div>
              </div>
            ))}
            {buses.filter(b => {
              if (isStudent || isParent) {
                return b.status === 'on-road' && b.id === profile?.transportBusId;
              }
              if (profile?.role === 'driver') {
                return isDriverAssignedBus(b);
              }
              return b.status === 'on-road';
            }).length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-300">
                  <Navigation className="w-8 h-8" />
                </div>
                <p className="text-sm font-medium text-neutral-400">No buses on road currently.</p>
              </div>
            )}
          </div>
        </div>

        {/* Proximity Alert Controls (Admin Simulation) */}
        {hasPermission('transport_manage') && profile?.role !== 'driver' && profile?.role !== 'clerk' && (
          <div className="bg-primary/5 p-6 rounded-[32px] border border-primary/20 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <BellRing className="w-6 h-6" />
              <span className="font-black">Alert Simulation</span>
            </div>
            <p className="text-xs text-primary/70 font-medium">Test WhatsApp proximity alerts for specific stops.</p>
            <button 
              onClick={() => toast.promise(new Promise(res => setTimeout(res, 2000)), {
                loading: 'Checking proximity...',
                success: 'Proximity Alert Sent to 42 Parents!',
                error: 'Failed to send alerts'
              })}
              className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-sidebar transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" />
              Trigger Proximity
            </button>
          </div>
        )}
      </div>

      {/* Main Map View */}
      <div className="lg:col-span-3 bg-white rounded-[40px] border border-neutral-200 overflow-hidden min-h-[600px] relative flex flex-col">
        <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
               <Navigation className="w-5 h-5" />
             </div>
             <div>
               <h4 className="font-black text-sidebar">Live Interactive Transport Map</h4>
               <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Real-time GPS Tracking</p>
             </div>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={() => setMapType('roadmap')}
               className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${mapType === 'roadmap' ? 'bg-sidebar text-white ring-2 ring-sidebar ring-offset-2' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
             >
               Standard
             </button>
             <button 
               onClick={() => setMapType('satellite')}
               className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${mapType === 'satellite' ? 'bg-sidebar text-white ring-2 ring-sidebar ring-offset-2' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
             >
               Satellite
             </button>
             <button 
               onClick={() => setMapType('terrain')}
               className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${mapType === 'terrain' ? 'bg-sidebar text-white ring-2 ring-sidebar ring-offset-2' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
             >
               Terrain
             </button>
          </div>
        </div>
        
        <div className="flex-1 relative bg-neutral-100 overflow-hidden">
          {/* High Fidelity Mock Map */}
          <div className="absolute inset-0 grayscale opacity-40 hover:grayscale-0 transition-all duration-700">
             <iframe 
               width="100%" 
               height="100%" 
               frameBorder="0" 
               style={{ border: 0 }}
               src={getMapUrl()} 
               allowFullScreen
             />
          </div>
          
          {/* Live Markers Simulation */}
          <div className="absolute inset-0 pointer-events-none">
             {buses.filter(b => {
               const activeGps = b.status === 'on-road' && b.currentLat && b.currentLng;
               if (profile?.role === 'driver') {
                 return activeGps && isDriverAssignedBus(b);
               }
               return activeGps;
             }).map((bus, idx) => (
                <motion.div 
                  key={bus.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute pointer-events-auto cursor-pointer group"
                  style={{ 
                    left: `${((Number(bus.currentLng) - 78.4) * 5000 + 400) % 800}px`, 
                    top: `${((Number(bus.currentLat) - 17.4) * 5000 + 300) % 600}px` 
                  }}
                >
                    <div className="flex flex-col items-center">
                      <div className="bg-sidebar text-white px-3 py-1 rounded-sm shadow-xl border border-white/20 mb-1 flex items-center gap-1.5 -translate-y-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black whitespace-nowrap">BUS {bus.busNumber}</span>
                      </div>
                      <div className="relative">
                        <div className="w-12 h-12 bg-sidebar text-yellow-400 rounded-xl flex items-center justify-center shadow-2xl border-[3px] border-white z-10 relative">
                          <Bus className="w-6 h-6" />
                        </div>
                        {/* Sharp Pin Tail */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 z-0" />
                      </div>
                    </div>
                </motion.div>
             ))}

             {/* Fallback Simulation if no real buses on road */}
             {profile?.role !== 'driver' && buses.filter(b => b.status === 'on-road').length === 0 && (
               <>
                 <motion.div 
                   animate={{ x: [100, 300, 500, 200], y: [100, 400, 200, 100] }}
                   transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                   className="pointer-events-auto"
                 >
                   <div className="relative group flex flex-col items-center">
                     <div className="bg-sidebar text-white px-3 py-1 rounded-sm shadow-xl border border-white/20 mb-1 flex items-center gap-1.5 -translate-x-1/2">
                       <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                       <span className="text-[10px] font-black whitespace-nowrap uppercase tracking-tighter">BUS 01</span>
                     </div>
                     <div className="relative -translate-x-1/2">
                       <div className="w-12 h-12 bg-sidebar text-yellow-400 rounded-xl flex items-center justify-center shadow-2xl border-[3px] border-white z-10 relative">
                         <Bus className="w-6 h-6" />
                       </div>
                       <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 z-0" />
                     </div>
                   </div>
                 </motion.div>

                 <motion.div 
                   animate={{ x: [600, 400, 800, 600], y: [300, 500, 400, 300] }}
                   transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
                   className="pointer-events-auto"
                 >
                   <div className="relative group flex flex-col items-center">
                     <div className="bg-sidebar text-white px-3 py-1 rounded-sm shadow-xl border border-white/20 mb-1 flex items-center gap-1.5 -translate-x-1/2">
                       <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                       <span className="text-[10px] font-black whitespace-nowrap uppercase tracking-tighter">VAN 05</span>
                     </div>
                     <div className="relative -translate-x-1/2">
                       <div className="w-12 h-12 bg-sidebar text-yellow-400 rounded-xl flex items-center justify-center shadow-2xl border-[3px] border-white z-10 relative">
                         <Bus className="w-6 h-6" />
                       </div>
                       <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 z-0" />
                     </div>
                   </div>
                 </motion.div>
               </>
             )}
          </div>

          {/* Controls Overlay */}
          <div className="absolute bottom-6 right-6 flex flex-col gap-2">
            <button className="w-12 h-12 bg-white rounded-2xl shadow-xl border border-neutral-100 flex items-center justify-center text-sidebar hover:bg-neutral-50 transition-all">
              <Plus className="w-5 h-5" />
            </button>
            <button className="w-12 h-12 bg-white rounded-2xl shadow-xl border border-neutral-100 flex items-center justify-center text-sidebar hover:bg-neutral-50 transition-all">
              <Navigation className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const BackupView = () => {
    const [searchBackupQuery, setSearchBackupQuery] = useState('');

    const filteredBackups = useMemo(() => {
      const sorted = [...stopBackups].sort((a,b) => {
        return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
      });
      if (!searchBackupQuery) return sorted;
      const q = searchBackupQuery.toLowerCase();
      return sorted.filter(b => 
        (b.villageName || '').toLowerCase().includes(q) ||
        (b.driverName || '').toLowerCase().includes(q) ||
        (b.busNumber || '').toLowerCase().includes(q)
      );
    }, [searchBackupQuery]);

    const handleExportCSV = () => {
      if (filteredBackups.length === 0) {
        toast.info("No records to export.");
        return;
      }
      
      const csvHeaders = ["Backup ID", "Stop ID", "Village Name", "Latitude", "Longitude", "Bus Number", "Driver Name", "Timestamp"];
      const csvRows = filteredBackups.map(b => [
        `"${b.id || ''}"`,
        `"${b.stopId || ''}"`,
        `"${(b.villageName || '').replace(/"/g, '""')}"`,
        b.latitude,
        b.longitude,
        `"${b.busNumber || ''}"`,
        `"${(b.driverName || 'Driver').replace(/"/g, '""')}"`,
        `"${b.timestamp || ''}"`
      ]);

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + [csvHeaders.join(","), ...csvRows.map(r => r.join(","))].join("\r\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Village_GPS_Backups_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV backup successfully exported!");
    };

    const handleExportJSON = () => {
      if (filteredBackups.length === 0) {
        toast.info("No records to export.");
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredBackups, null, 2));
      const link = document.createElement("a");
      link.setAttribute("href", dataStr);
      link.setAttribute("download", `Village_GPS_Backups_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("JSON backup successfully exported!");
    };

    const handleRestoreStop = async (backup: any) => {
      if (!confirm(`Are you sure you want to restore the coordinates for "${backup.villageName}" to Latitude: ${backup.latitude}, Longitude: ${backup.longitude}?`)) {
        return;
      }

      try {
        await dbService.update('stops', backup.stopId, {
          latitude: backup.latitude,
          longitude: backup.longitude,
          lastRestoredAt: new Date().toISOString()
        });
        toast.success(`Successfully restored live coordinates of "${backup.villageName}"!`);
      } catch (err) {
        toast.error("Failed to restore coordinates to active stop.");
        console.error(err);
      }
    };

    return (
      <div className="space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-r from-sidebar via-indigo-950 to-sidebar p-8 rounded-[36px] text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest bg-white/5 py-1.5 px-3 rounded-full border border-white/5 self-start">
               <Database className="w-4 h-4 text-primary" /> GPS Backup Audit Ledger
            </div>
            <h3 className="text-3xl font-black italic tracking-tighter uppercase">GEO-TRACKING ARCHIVE</h3>
            <p className="text-neutral-400 text-xs font-medium">
              This repository contains verified coordinates recorded live on-the-road by the school bus drivers. Restore archived pinpoints back to active stops, or export coordinate datasets.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <button 
              onClick={handleExportCSV}
              className="px-5 py-3.5 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black uppercase text-[11px] tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button 
              onClick={handleExportJSON}
              className="px-5 py-3.5 bg-white hover:bg-neutral-100 text-sidebar border border-neutral-200 rounded-2xl font-black uppercase text-[11px] tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Database className="w-4 h-4" /> Export JSON
            </button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by Village, Driver, or Bus..."
              className="w-full pl-12 pr-4 py-3.5 bg-neutral-50 rounded-2xl font-bold text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={searchBackupQuery}
              onChange={(e) => setSearchBackupQuery(e.target.value)}
            />
          </div>
          <div className="text-xs text-neutral-400 font-extrabold whitespace-nowrap self-end sm:self-center">
            Showing {filteredBackups.length} of {stopBackups.length} archived GPS pins
          </div>
        </div>

        {/* Backups Table */}
        <div className="bg-white rounded-[32px] border border-neutral-200 shadow-sm overflow-hidden">
          {filteredBackups.length === 0 ? (
            <div className="p-16 text-center space-y-4">
              <div className="w-16 h-16 bg-neutral-50 rounded-2xl mx-auto flex items-center justify-center text-neutral-300">
                <Database className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-black text-sidebar">No backup coordinates loaded yet</h4>
              <p className="text-neutral-400 text-sm max-w-sm mx-auto font-medium">When drivers record coordinates in the driver mobile cockpit, the location details will stream and backup here instantly.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50/50 border-b border-neutral-200 text-neutral-400 text-[10px] font-black uppercase tracking-wider">
                    <th className="px-6 py-4">Village Name</th>
                    <th className="px-6 py-4">Stop ID</th>
                    <th className="px-6 py-4">GPS Coordinates</th>
                    <th className="px-6 py-4">Recorded By</th>
                    <th className="px-6 py-4">Bus / Route</th>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredBackups.map((backup) => {
                    const theme = getBusTheme(backup.busId);
                    return (
                      <tr key={backup.id} className="hover:bg-neutral-55 transition-all text-sm font-semibold text-neutral-700">
                        <td className="px-6 py-4 font-black text-sidebar uppercase">{backup.villageName}</td>
                        <td className="px-6 py-4 font-mono text-xs text-neutral-400">{backup.stopId}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 font-mono text-xs text-indigo-600 bg-indigo-50/30 border border-indigo-100 px-2.5 py-1 rounded-lg w-max">
                            <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{backup.latitude?.toFixed(6)}, {backup.longitude?.toFixed(6)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-extrabold">{backup.driverName || 'Driver'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${theme.tag}`}>
                            Bus {backup.busNumber}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-neutral-400">
                          {backup.timestamp ? format(new Date(backup.timestamp), 'MMM dd, yyyy HH:mm:ss') : '---'}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button 
                            onClick={() => window.open(`https://www.google.com/maps?q=${backup.latitude},${backup.longitude}`, '_blank')}
                            className="p-2 hover:bg-neutral-50 rounded-xl transition-all border border-neutral-200 text-neutral-500 shadow-sm cursor-pointer"
                            title="Open in Google Maps"
                          >
                            <Navigation className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleRestoreStop(backup)}
                            className="px-3 py-1.5 hover:bg-emerald-50 rounded-xl border border-emerald-200/60 text-emerald-700 font-extrabold text-xs transition-all shadow-sm cursor-pointer"
                            title="Restore coordinates back to live stop"
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-black text-sidebar flex items-center gap-4">
             <div className="p-3 bg-primary/10 rounded-2xl text-primary">
               <Bus className="w-10 h-10" />
             </div>
             Transport Intelligence
          </h2>
          <p className="text-sm font-medium text-neutral-500 max-w-xl">
            Complete transport management with real-time GPS tracking, automated WhatsApp alerts, and distance-based fee automation.
          </p>
        </div>

        <div className="flex bg-white p-2 rounded-[24px] border border-neutral-200 shadow-sm self-start md:self-center">
          {[
            { id: 'transport', icon: Bus, label: 'Transport' },
            { id: 'routes', icon: MapPin, label: 'Villages & Fees' },
            { id: 'live', icon: Navigation, label: 'Live Tracking' },
            { id: 'backup', icon: Database, label: 'Stop Backups' },
            { id: 'history', icon: History, label: 'Logs' }
          ].filter(tab => {
            if (isStudent || isParent) {
              return tab.id === 'transport' || tab.id === 'live';
            }
            if (profile?.role === 'driver') {
              return tab.id === 'transport' || tab.id === 'routes' || tab.id === 'live';
            }
            return true;
          }).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all ${
                activeTab === tab.id 
                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                : 'text-neutral-400 hover:text-sidebar'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
           key={activeTab}
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: -10 }}
           transition={{ duration: 0.2 }}
        >
          {activeTab === 'transport' && <TransportView />}
          {activeTab === 'routes' && <RoutesView />}
          {activeTab === 'live' && <LiveTrackingView />}
          {activeTab === 'backup' && <BackupView />}
          {activeTab === 'history' && (
             <div className="bg-white p-12 rounded-[40px] border border-neutral-200 text-center space-y-4">
                <div className="w-20 h-20 bg-neutral-100 rounded-3xl mx-auto flex items-center justify-center text-neutral-300">
                  <History className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-sidebar">Journey History</h3>
                <p className="text-neutral-500 font-medium max-w-md mx-auto">Track path history, fuel consumption, and parent notification logs here.</p>
             </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Route Stops / Allotted Villages Popup Modal */}
      {viewingAllottedVillagesBus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-sidebar/80 backdrop-blur-sm" 
            onClick={() => setViewingAllottedVillagesBus(null)} 
          />
          <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            {(() => {
              const bus = viewingAllottedVillagesBus;
              const theme = getBusTheme(bus.id);
              const busStops = stops.filter(s => (s as any).busId === bus.id).sort((a,b) => (a.order || 0) - (b.order || 0));
              return (
                <>
                  <div className={`p-6 sm:p-8 border-b flex items-start justify-between ${theme.busBg}`}>
                    <div className="flex items-center gap-4">
                      <div className={`p-4 rounded-2xl shadow-md ${theme.iconBg}`}>
                        <Bus className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className={`text-2xl font-black ${theme.header}`}>Bus {bus.busNumber} Stops</h3>
                        <p className={`text-xs font-black uppercase tracking-wide mt-0.5 ${theme.text}`}>
                          Route: {(bus as any).routeName || 'Unspecified Route'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setViewingAllottedVillagesBus(null)}
                      className="p-2 hover:bg-neutral-200/50 rounded-full transition-colors text-neutral-500 hover:text-neutral-900"
                    >
                      <Plus className="w-6 h-6 rotate-45" />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
                    <div className="flex items-center justify-between text-xs text-neutral-500 font-bold border-b border-neutral-100 pb-3">
                      <span>{busStops.length} Allotted Villages in Schedule</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        Driver: <strong className="text-sidebar font-extrabold">{bus.driverName}</strong>
                      </span>
                    </div>

                    {busStops.length > 0 ? (
                      <div className="relative pl-6 border-l-2 border-dashed border-indigo-200/60 ml-4 space-y-6">
                        {busStops.map((stop, idx) => {
                          return (
                            <div key={`stop-step-${stop.id}`} className="relative group">
                              {/* Step circle marker */}
                              <div className={`absolute -left-[35px] top-1.5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black shadow-sm ${theme.iconBg}`}>
                                {idx + 1}
                              </div>
                              
                              <div className={`p-4 rounded-2xl border transition-all hover:bg-neutral-50/50 ${theme.busBg}`}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="space-y-0.5">
                                    <h4 className={`text-sm font-black uppercase tracking-tight ${theme.header}`}>
                                      {stop.villageName}
                                    </h4>
                                    <p className="text-[10px] text-neutral-400 font-mono">
                                      GPS: {stop.latitude?.toFixed(5)}, {stop.longitude?.toFixed(5)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 bg-white/80 px-2.5 py-1 rounded-lg border border-neutral-200/60 shadow-sm text-[11px] font-black text-neutral-700">
                                      <Coins className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>₹{stop.fee}</span>
                                    </div>
                                    <button 
                                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`, '_blank')}
                                      className="p-1.5 bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-100 rounded-lg transition-all"
                                      title="Open in maps"
                                    >
                                      <Navigation className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 space-y-2">
                        <MapPin className="w-8 h-8 text-neutral-300 mx-auto animate-bounce" />
                        <p className="text-sm font-semibold text-neutral-500">No villages allotted for this bus route yet.</p>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex justify-end gap-3 rounded-b-[40px]">
              <button 
                onClick={() => setViewingAllottedVillagesBus(null)}
                className="px-6 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-700 font-bold rounded-xl text-xs transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {isBusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-sidebar/80 backdrop-blur-sm" onClick={() => {
              setIsBusModalOpen(false);
            setSelectedBus(null);
            setNewBus({
              busNumber: '',
              routeName: '',
              driverName: '',
              driverPhone: '',
              driverId: '',
              helperName: '',
              helperPhone: '',
              helperId: '',
              status: 'active'
            });
          }} />
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl relative z-10 p-8 space-y-6">
             <h3 className="text-2xl font-black text-sidebar">{selectedBus ? 'Edit Bus' : 'Register New Bus'}</h3>
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-neutral-400">Bus Number</label>
                     <input 
                       type="text" 
                       className="w-full p-4 bg-neutral-100 border-none rounded-2xl font-bold" 
                       placeholder="e.g. 01" 
                       value={newBus.busNumber}
                       onChange={(e) => setNewBus({...newBus, busNumber: e.target.value})}
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-neutral-400">Route Name</label>
                     <input 
                       type="text" 
                       className="w-full p-4 bg-neutral-100 border-none rounded-2xl font-bold" 
                       placeholder="e.g. North Loop" 
                       value={newBus.routeName}
                       onChange={(e) => setNewBus({...newBus, routeName: e.target.value})}
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-neutral-400">Status</label>
                     <select 
                       className="w-full p-4 bg-neutral-100 border-none rounded-2xl font-bold"
                       value={newBus.status}
                       onChange={(e) => setNewBus({...newBus, status: e.target.value as any})}
                     >
                       <option key="status-active" value="active">Active</option>
                       <option key="status-onroad" value="on-road">On Road</option>
                       <option key="status-maint" value="maintenance">Maintenance</option>
                     </select>
                  </div>
                </div>
                
                <div className="p-4 bg-blue-50/50 rounded-3xl border border-blue-100 space-y-4">
                   <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-1">Driver Details</p>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-neutral-400">Name</label>
                         <select 
                           className="w-full p-3 bg-white border border-blue-100 rounded-xl font-bold text-sm" 
                           value={newBus.driverId || ''}
                           onChange={(e) => {
                             const selectedDriver = staff.find(d => d.uid === e.target.value);
                             if (selectedDriver) {
                               setNewBus({
                                 ...newBus, 
                                 driverId: selectedDriver.uid,
                                 driverName: selectedDriver.name,
                                 driverPhone: selectedDriver.whatsappNumber || selectedDriver.phone || ''
                               });
                             } else {
                               setNewBus({...newBus, driverId: '', driverName: '', driverPhone: ''});
                             }
                           }}
                         >
                           <option key="default-driver" value="">Select Driver</option>
                           {staff.filter(s => s.role === 'driver').map((d, idx) => (
                             <option key={d.uid || `driver-${d.name}-${idx}`} value={d.uid}>{d.name}</option>
                           ))}
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-neutral-400">Phone</label>
                         <input 
                           type="text" 
                           className="w-full p-3 bg-white border border-blue-100 rounded-xl font-bold text-sm" 
                           placeholder="Phone Number" 
                           value={newBus.driverPhone || ''}
                           onChange={(e) => setNewBus({...newBus, driverPhone: e.target.value})}
                         />
                      </div>
                   </div>
                </div>

                <div className="p-4 bg-neutral-50 rounded-3xl border border-neutral-200 space-y-4">
                   <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Helper Details</p>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-neutral-400">Name</label>
                         <select 
                           className="w-full p-3 bg-white border border-neutral-200 rounded-xl font-bold text-sm" 
                           value={newBus.helperId || ''}
                           onChange={(e) => {
                             const selectedHelper = staff.find(s => s.uid === e.target.value);
                             if (selectedHelper) {
                               setNewBus({
                                 ...newBus, 
                                 helperId: selectedHelper.uid,
                                 helperName: selectedHelper.name,
                                 helperPhone: selectedHelper.whatsappNumber || selectedHelper.phone || ''
                               });
                             } else {
                               setNewBus({...newBus, helperId: '', helperName: '', helperPhone: ''});
                             }
                           }}
                         >
                           <option key="default-helper" value="">Select Helper</option>
                           {staff.filter(s => s.role === 'helper').map((s, idx) => (
                             <option key={s.uid || `staff-helper-${s.name}-${idx}`} value={s.uid}>{s.name}</option>
                           ))}
                         </select>
                      </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-bold text-neutral-400">Phone</label>
                          <input 
                            type="text" 
                            className="w-full p-3 bg-white border border-neutral-200 rounded-xl font-bold text-sm" 
                            placeholder="Phone Number" 
                            value={newBus.helperPhone || ''}
                            onChange={(e) => setNewBus({...newBus, helperPhone: e.target.value})}
                          />
                       </div>
                    </div>
                 </div>
              </div>
              <div className="flex gap-4 pt-4">
                 <button className="flex-1 py-4 font-black text-neutral-400 hover:bg-neutral-100 rounded-2xl" onClick={() => {
                   setIsBusModalOpen(false);
                   setSelectedBus(null);
                   setNewBus({
                     busNumber: '',
                     driverName: '',
                     driverPhone: '',
                     driverId: '',
                     helperName: '',
                     helperPhone: '',
                     helperId: '',
                     status: 'active'
                   });
                 }}>Cancel</button>
                 <button 
                  onClick={handleSaveBus}
                  className="flex-1 bg-primary text-white py-4 font-black rounded-2xl shadow-lg shadow-primary/20"
                 >
                   {selectedBus ? 'Update' : 'Save Bus'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Stop Modal */}
      {isStopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-sidebar/80 backdrop-blur-sm" onClick={() => {
              setIsStopModalOpen(false);
              setSelectedStop(null);
              setNewStop({
                villageName: '',
                busId: '',
                fee: 0,
                latitude: 0,
                longitude: 0,
                order: 0
              });
           }} />
           <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl relative z-10 p-8 space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black text-sidebar">{selectedStop ? 'Edit Stop' : 'Configure Village Stop'}</h3>
                <MapPin className="w-8 h-8 text-primary/20" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-neutral-400">Village Name (from Fees)</label>
                       <select 
                         className="w-full p-4 bg-neutral-100 border-none rounded-2xl font-bold appearance-none"
                         value={newStop.villageName}
                         onChange={(e) => {
                           const village = e.target.value;
                           const struct = feeStructures.find(s => s.name === village);
                           setNewStop({
                             ...newStop,
                             villageName: village,
                             fee: struct ? struct.total : (newStop.fee || 0)
                           });
                         }}
                       >
                         <option key="default-village" value="">Select Village</option>
                         {feeStructures.map((s, idx) => (
                           <option key={s.id || `fee-${s.name}-${idx}`} value={s.name}>{s.name} (₹{s.total})</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-neutral-400">Transport Fee (Monthly)</label>
                       <div className="relative">
                          <input 
                            type="number" 
                            className="w-full p-4 pl-12 bg-neutral-100 border-none rounded-2xl font-bold" 
                            placeholder="500" 
                            value={newStop.fee}
                            onChange={(e) => setNewStop({...newStop, fee: Number(e.target.value)})}
                          />
                          <Coins className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-neutral-400">Assign to Bus</label>
                       <select 
                         className="w-full p-4 bg-neutral-100 border-none rounded-2xl font-bold appearance-none"
                         value={newStop.busId}
                         onChange={(e) => setNewStop({...newStop, busId: e.target.value})}
                       >
                          <option key="default-bus" value="">Select Bus</option>
                          {buses.map((b, idx) => (
                            <option key={b.id || `bus-select-${b.busNumber}-${idx}`} value={b.id}>Bus {b.busNumber} - {b.driverName}</option>
                          ))}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-neutral-400">Display Order</label>
                       <input 
                        type="number" 
                        className="w-full p-4 bg-neutral-100 border-none rounded-2xl font-bold" 
                        placeholder="e.g. 1" 
                        value={newStop.order}
                        onChange={(e) => setNewStop({...newStop, order: Number(e.target.value)})}
                      />
                    </div>
                 </div>
                 
                 <div className="space-y-4">
                    <div className="p-6 bg-neutral-50 rounded-3xl border border-neutral-100 space-y-4">
                       <p className="text-xs font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                         <Navigation className="w-4 h-4 text-primary" />
                         Geolocation Data
                       </p>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-neutral-400">Latitude</label>
                             <input 
                               type="number" 
                               step="any"
                               className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold" 
                               placeholder="17.1234" 
                               value={newStop.latitude}
                               onChange={(e) => setNewStop({...newStop, latitude: Number(e.target.value)})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-neutral-400">Longitude</label>
                             <input 
                               type="number" 
                               step="any"
                               className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold" 
                               placeholder="78.5678" 
                               value={newStop.longitude}
                               onChange={(e) => setNewStop({...newStop, longitude: Number(e.target.value)})}
                             />
                          </div>
                       </div>
                       <div className="bg-white p-4 rounded-2xl border border-neutral-200 text-[10px] text-neutral-400 font-medium">
                         Tips: These coordinates are used to trigger the "5-minute away" WhatsApp alert to parents.
                       </div>
                       <button 
                        onClick={() => {
                          if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition((pos) => {
                              setNewStop({...newStop, latitude: pos.coords.latitude, longitude: pos.coords.longitude});
                              toast.success("Location captured!");
                            });
                          } else {
                            toast.error("Geolocation not supported");
                          }
                        }}
                        className="w-full bg-sidebar text-white py-3 rounded-xl font-bold text-xs hover:bg-primary transition-all"
                       >
                         Capture Current Loc.
                       </button>
                    </div>
                 </div>
              </div>

              <div className="flex gap-4">
                 <button 
                  className="flex-1 py-4 font-black text-neutral-400 hover:bg-neutral-100 rounded-2xl" 
                  onClick={() => {
                    setIsStopModalOpen(false);
                    setSelectedStop(null);
                    setNewStop({
                      villageName: '',
                      busId: '',
                      fee: 0,
                      latitude: 0,
                      longitude: 0,
                      order: 0
                    });
                  }}
                >
                  Discard
                </button>
                 <button 
                  onClick={handleSaveStop}
                  className="flex-1 bg-primary text-white py-4 font-black rounded-2xl shadow-xl shadow-primary/20"
                >
                  {selectedStop ? 'Update Stop' : 'Save Stop Configuration'}
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Transport;
