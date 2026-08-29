import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building, Users, ShieldCheck, Home, Bell, Phone, CheckCircle2, XCircle, Search, 
  MapPin, Clock, Calendar as CalendarIcon, MessageSquare, Utensils, Camera, Download,
  Plus, Trash2, Edit, Printer
} from 'lucide-react';
import Papa from 'papaparse';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { toast } from 'sonner';
import { where } from 'firebase/firestore';
import SmartKioskModal from '../components/SmartKioskModal';
import { safeStorage as localStorage } from '../lib/safeStorage';

export default function Hostel() {
  const { hasPermission, profile, isStudent } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [students, setStudents] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [outings, setOutings] = useState<any[]>([]);
  
  useEffect(() => {
    if (hasPermission('hostel_view') || hasPermission('portal_student_view_hostel')) {
      const loadStatic = async () => {
        try {
          const [busRes, cRes, bRes] = await Promise.all([
            dbService.list('buses'),
            dbService.list('classes'),
            dbService.list('batches')
          ]);
          setBuses(busRes);
          setClasses(cRes);
          setBatches(bRes);
        } catch (e) {
          console.error("Error loading static hostel data", e);
        }
      };
      
      loadStatic();
  
      // Subscriptions for real-time updates
      const unsubHostelStudents = dbService.subscribe('students', [], (data) => {
        // Filter in memory for hostel residents OR dropped students
        const relevant = data.filter((s:any) => s.feeType?.toLowerCase() === 'hostel' || (s.hostelDropDate && s.hostelDropDate !== ""));
        setStudents(relevant);
      });
  
      const unsubBlocks = dbService.subscribe('hostel_blocks', [], (data) => {
        setBlocks(data);
      });
      
      const unsubRooms = dbService.subscribe('hostel_rooms', [], (data) => {
        setRooms(data);
      });
  
      const unsubOutings = dbService.subscribe('hostel_outings', [], (data) => {
        const sorted = data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setOutings(sorted);
      });
  
      return () => {
        unsubHostelStudents();
        unsubBlocks();
        unsubRooms();
        unsubOutings();
      };
    }
  }, [hasPermission, isStudent]);
  
  // Guard access
  if (!hasPermission('hostel_view') && !hasPermission('portal_student_view_hostel')) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-8 text-center h-full">
        <Building className="w-16 h-16 text-neutral-300 mb-4" />
        <h2 className="text-2xl font-black text-neutral-800 tracking-tight">Access Denied</h2>
        <p className="text-neutral-500 mt-2">You do not have permission to view the Hostel Management module.</p>
      </div>
    );
  }
  
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Building, desc: 'Overview & Stats' },
    { id: 'blocks', label: 'Blocks & Capacity', icon: Building, desc: 'Manage Capacity' },
    { id: 'students', label: 'Allocations', icon: Users, desc: 'Manage Beds' },
    { id: 'outings', label: 'Outings & Leaves', icon: Home, desc: 'Manage Requests' },
    { id: 'attendance', label: 'Attendance', icon: ShieldCheck, desc: 'Daily Check-in' },
    { id: 'mess', label: 'Mess Menu', icon: Utensils, desc: 'Food Timetable' },
    { id: 'inactive', label: 'Dropped', icon: XCircle, desc: 'Dropped Students' },
  ];
  
  const isAccountant = profile?.role === 'accountant';
  const isClerk = profile?.role === 'clerk';
  const visibleTabs = tabs.filter(tab => {
    if (isStudent) {
      return ['dashboard', 'outings', 'mess'].includes(tab.id);
    }
    if (isAccountant) {
      return ['dashboard', 'blocks', 'students', 'inactive'].includes(tab.id);
    }
    if (isClerk) {
      return ['dashboard', 'students', 'inactive'].includes(tab.id);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-neutral-50/50">
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-neutral-900 flex items-center gap-3">
                <Building className="w-8 h-8 text-primary" />
                Hostel Management
              </h1>
              <p className="text-neutral-500 mt-1 font-medium">Manage rooms, student allocations, outings, and mess operations.</p>
            </div>
          </div>
          
          <div className="flex overflow-x-auto hide-scrollbar gap-2 mt-8 pb-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-base whitespace-nowrap transition-all flex-shrink-0
                    ${isActive 
                      ? 'bg-primary text-white shadow-md shadow-primary/20' 
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 border border-transparent'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          {activeTab === 'dashboard' && <HostelDashboard students={students} blocks={blocks} outings={outings} classes={classes} batches={batches} />}
          {activeTab === 'blocks' && <HostelBlocks blocks={blocks} students={students} />}
          {activeTab === 'students' && <HostelStudents students={students} classes={classes} batches={batches} blocks={blocks} rooms={rooms} />}
          {!isAccountant && activeTab === 'outings' && <HostelOutings students={students} buses={buses} classes={classes} batches={batches} outings={outings} />}
          {!isAccountant && activeTab === 'attendance' && <HostelAttendance students={students} classes={classes} batches={batches} />}
          {!isAccountant && activeTab === 'mess' && <HostelMess />}
          {activeTab === 'inactive' && <HostelInactiveStudents students={students} classes={classes} batches={batches} />}
        </div>
      </div>
    </div>
  );
}

// Sub-components
function HostelInactiveStudents({ students, classes, batches }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const { hasPermission, profile } = useAuth();
  const canManage = profile?.role === 'admin' || profile?.role === 'clerk' || hasPermission('hostel_manage') || hasPermission('hostel_students_manage');
  
  const droppedStudents = students.filter((s: any) => s.hostelDropDate && s.hostelDropDate !== "" && s.feeType?.toLowerCase() !== 'hostel');
  const filteredStudents = droppedStudents.filter((s: any) => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.admissionNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.village?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.city?.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a: any, b: any) => {
    const dateA = a.hostelDropDate ? new Date(a.hostelDropDate).getTime() : 0;
    const dateB = b.hostelDropDate ? new Date(b.hostelDropDate).getTime() : 0;
    return dateB - dateA;
  });

  const handleRejoinHostel = async (student: any) => {
    if (!canManage) {
        toast.error("You don't have permission to manage hostel allocations.");
        return;
    }
    
    const userId = student.id || student.uid;
    if (!userId) {
        toast.error("Student ID missing. Please refresh.");
        return;
    }

    // Force lowercase status check
    const currentStatus = (student.status || 'active').toLowerCase();
    const needsStatusUpdate = currentStatus !== 'active';
    
    const confirmMsg = needsStatusUpdate 
      ? `Rejoin ${student.name} to hostel? Their status will be set to ACTIVE.`
      : `Rejoin ${student.name} to hostel?`;

    if (!window.confirm(confirmMsg)) return;

    const toastId = toast.loading(`Rejoining ${student.name} to hostel...`);
    try {
        const updates: any = {
            feeType: 'hostel',
            hostelDropDate: "", // Clear drop date
            hostelLeftReason: "",
            updatedAt: new Date().toISOString()
        };

        if (needsStatusUpdate) {
            updates.status = 'active';
        }

        // Use update for partial modification
        await dbService.update('students', userId, updates);
        
        toast.success(`${student.name} rejoined hostel successfully. They are now in the Allocations tab.`, { id: toastId });
    } catch (error: any) {
        console.error("Error rejoining student: ", error);
        toast.error(`Error rejoining ${student.name}: ${error.message || 'Unknown error'}`, { id: toastId });
    }
  };

  const handleDeleteHistory = async (student: any) => {
    if (!canManage) {
        toast.error("Permission denied");
        return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete the hostel history for ${student.name}? This will remove them from this list.`)) return;
    
    const toastId = toast.loading("Deleting history...");
    try {
        const userId = student.id || student.uid;
        await dbService.update('students', userId, {
            hostelDropDate: "",
            hostelLeftReason: "",
            updatedAt: new Date().toISOString()
        });
        toast.success("History deleted", { id: toastId });
    } catch (e: any) {
        toast.error("Failed to delete: " + e.message, { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-neutral-800 tracking-tight flex items-center gap-2">
            <XCircle className="w-7 h-7 text-rose-500" />
            Dropped From Hostel ({droppedStudents.length})
          </h2>
          <p className="text-base text-neutral-500">History of students who left the hostel accommodation.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input 
            type="text"
            placeholder="Search by name, ID, village..."
            className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl outline-none focus:border-rose-500 text-base"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredStudents.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-left font-mono text-lg text-neutral-600">
            <thead className="bg-neutral-50 font-bold border-b border-neutral-100 uppercase tracking-widest text-sm">
              <tr>
                <th className="py-5 px-6 md:px-8">Student Info</th>
                <th className="py-5 px-6">Class/Batch</th>
                <th className="py-5 px-6">Last Known Room</th>
                <th className="py-5 px-6">Drop Date</th>
                <th className="py-5 px-6">Address</th>
                <th className="py-5 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredStudents.map((student: any) => {
                const cls = classes.find((c: any) => c.id === student.classId)?.name || 'N/A';
                const batch = batches.find((b: any) => b.id === student.batchId)?.name || 'N/A';
                const docId = student.id || student.uid;
                return (
                  <tr key={docId} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-5 px-6 md:px-8">
                      <div>
                        <span className="font-bold text-neutral-900 text-2xl">{student.name}</span>
                        <div className="flex gap-2 items-center text-base text-neutral-500 mt-1">
                          <span>{student.admissionNumber || 'No ID'}</span>
                          <span>•</span>
                          <span className="capitalize">{student.gender || 'Unknown'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <span className="font-bold text-neutral-800">{cls}</span>
                      <span className="text-neutral-500 text-base ml-1">{batch}</span>
                    </td>
                    <td className="py-5 px-6">
                      <div className="text-base">
                        <p className="font-bold text-neutral-700">{student.hostelName || 'N/A'}</p>
                        <p className="text-neutral-500">Room: {student.hostelRoom || 'N/A'} • Bed: {student.hostelBed || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex items-center gap-2 text-rose-600 font-bold">
                        <Clock className="w-4 h-4" />
                        {new Date(student.hostelDropDate).toLocaleDateString(undefined, { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                    </td>
                    <td className="py-5 px-6 text-base">
                      {student.village || student.city || student.address || 'N/A'}
                    </td>
                    <td className="py-5 px-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleRejoinHostel(student)}
                          className="px-4 py-2 text-sm font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors border border-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Rejoin
                        </button>
                        <button 
                          onClick={() => handleDeleteHistory(student)}
                          className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-colors border border-rose-100"
                          title="Delete History"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {student.status !== 'active' && (
                        <span className="text-[10px] text-rose-400 font-bold uppercase mt-1 block tracking-tight">Student Inactive</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-16 text-center flex flex-col items-center justify-center">
          <XCircle className="w-16 h-16 text-neutral-200 mb-6" />
          <h3 className="text-2xl font-bold text-neutral-800">No dropped students found</h3>
          <p className="text-neutral-500 max-w-md mt-4 text-base leading-relaxed">When a student is dropped from the hostel allocations, they will appear here automatically.</p>
        </div>
      )}
    </div>
  );
}

// Sub-components
function HostelDashboard({ students, blocks, outings, classes = [], batches = [] }: any) {
  const { isStudent, profile } = useAuth();
  const studentUid = profile?.uid || profile?.id;
  const currentStudent = isStudent 
    ? (students || []).find((s: any) => s.uid === studentUid || s.id === studentUid) || profile 
    : null;

  // Calculate real-time stats (for admin/staff view)
  const today = new Date().toISOString().split('T')[0];
  const totalCapacity = blocks.reduce((acc: number, block: any) => acc + (Number(block.capacity) || 0), 0);
  const occupiedBeds = students.filter((s: any) => s.feeType?.toLowerCase() === 'hostel' && (s.status?.toLowerCase() === 'active' || !s.status)).length;
  const availableBeds = Math.max(0, totalCapacity - occupiedBeds);

  const activeOutings = (outings || []).filter((o: any) => o.status === 'approved');
  
  const onLeaveCount = new Set(
    activeOutings
      .filter((o: any) => o.startDate <= today && (!o.endDate || o.endDate >= today))
      .map((o: any) => o.studentId)
  ).size;

  const overdueCount = activeOutings.filter((o: any) => o.endDate && o.endDate < today).length;

  const [selectedDetail, setSelectedDetail] = useState<'occupied' | 'leave' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Lists for detail views
  const occupiedList = students.filter((s: any) => s.feeType?.toLowerCase() === 'hostel' && (s.status?.toLowerCase() === 'active' || !s.status));

  // List of three blocks with a unique dark color mapping (do not use for other modules)
  const blockColors = React.useMemo(() => {
    // Unique list of hostelNames (blocks)
    const blockNamesSet = new Set<string>();
    // First gather from blocks list
    (blocks || []).forEach((b: any) => {
      if (b.name) blockNamesSet.add(b.name.trim());
    });
    // Gather from occupancies as safe fallback
    occupiedList.forEach((s: any) => {
      if (s.hostelName) blockNamesSet.add(s.hostelName.trim());
    });

    const uniqueBlocks = Array.from(blockNamesSet);

    // Three blocks dark color systems.
    // Each system has colors that apply to the student names, block badge, row and text details cleanly.
    // Palettes are beautifully selected dark, sophisticated colors:
    // Block 1: Deep Sapphire / Indigo (indigo)
    // Block 2: Deep Forest Green (emerald)
    // Block 3: Deep Maroon / Plum / Crimson (rose)
    const palettes = [
      {
        text: 'text-indigo-950 font-black',
        lightText: 'text-indigo-900/80 font-bold',
        subtext: 'text-indigo-650 font-medium',
        bg: 'bg-indigo-50/70',
        badge: 'bg-indigo-900 border-indigo-950/20 text-indigo-50',
        border: 'border-indigo-150',
        rowHover: 'hover:bg-indigo-50/40 border-l-4 border-l-indigo-600'
      },
      {
        text: 'text-emerald-950 font-black',
        lightText: 'text-emerald-900/80 font-bold',
        subtext: 'text-emerald-650 font-medium',
        bg: 'bg-emerald-50/70',
        badge: 'bg-emerald-900 border-emerald-950/20 text-emerald-50',
        border: 'border-emerald-150',
        rowHover: 'hover:bg-emerald-50/40 border-l-4 border-l-emerald-600'
      },
      {
        text: 'text-rose-950 font-black',
        lightText: 'text-rose-900/80 font-bold',
        subtext: 'text-rose-650 font-medium',
        bg: 'bg-rose-50/70',
        badge: 'bg-rose-900 border-rose-950/30 text-rose-50',
        border: 'border-rose-150',
        rowHover: 'hover:bg-rose-50/40 border-l-4 border-l-rose-600'
      }
    ];

    const mapping: Record<string, typeof palettes[0]> = {};
    uniqueBlocks.forEach((name, idx) => {
      mapping[name] = palettes[idx % palettes.length];
    });

    return { mapping, defaultPalette: {
      text: 'text-neutral-950 font-bold',
      lightText: 'text-neutral-700 font-medium',
      subtext: 'text-neutral-500 font-normal',
      bg: 'bg-neutral-50',
      badge: 'bg-neutral-800 border-neutral-300 text-white',
      border: 'border-neutral-150',
      rowHover: 'hover:bg-neutral-50/40'
    } };
  }, [blocks, occupiedList]);
  
  const leaveOutingList = React.useMemo(() => {
    const activeOutingsList = (outings || []).filter((o: any) => o.status === 'approved');
    const onLeaveStudentIds = new Set(
      activeOutingsList
        .filter((o: any) => o.startDate <= today && (!o.endDate || o.endDate >= today))
        .map((o: any) => o.studentId)
    );
    
    return students
      .filter((s: any) => onLeaveStudentIds.has(s.uid || s.id))
      .map((s: any) => {
        const studentId = s.uid || s.id;
        const activeOuting = activeOutingsList.find((o: any) => o.studentId === studentId && o.startDate <= today && (!o.endDate || o.endDate >= today));
        return {
          ...s,
          activeOuting
        };
      });
  }, [students, outings, today]);

  const filteredOccupied = occupiedList.filter((s: any) => {
    const query = searchQuery.toLowerCase();
    return (
      s.name?.toLowerCase().includes(query) ||
      s.admissionNumber?.toLowerCase().includes(query) ||
      s.hostelName?.toLowerCase().includes(query) ||
      s.hostelRoom?.toLowerCase().includes(query) ||
      s.hostelBed?.toLowerCase().includes(query) ||
      s.village?.toLowerCase().includes(query) ||
      s.city?.toLowerCase().includes(query)
    );
  });

  const sortedOccupiedList = React.useMemo(() => {
    return [...filteredOccupied].sort((a: any, b: any) => {
      const blockA = (a.hostelName || '').toLowerCase().trim();
      const blockB = (b.hostelName || '').toLowerCase().trim();
      if (blockA !== blockB) {
        return blockA.localeCompare(blockB);
      }
      // Within same block, sort by student name
      const nameA = (a.name || '').toLowerCase().trim();
      const nameB = (b.name || '').toLowerCase().trim();
      return nameA.localeCompare(nameB);
    });
  }, [filteredOccupied]);

  const filteredLeave = leaveOutingList.filter((s: any) => {
    const query = searchQuery.toLowerCase();
    return (
      s.name?.toLowerCase().includes(query) ||
      s.admissionNumber?.toLowerCase().includes(query) ||
      s.hostelName?.toLowerCase().includes(query) ||
      s.hostelRoom?.toLowerCase().includes(query) ||
      s.hostelBed?.toLowerCase().includes(query) ||
      s.activeOuting?.type?.toLowerCase().includes(query) ||
      s.activeOuting?.destination?.toLowerCase().includes(query) ||
      s.activeOuting?.reason?.toLowerCase().includes(query)
    );
  });

  if (isStudent && currentStudent) {
    const studentOutings = (outings || []).filter((o: any) => o.studentId === studentUid);
    const activeStudentOuting = studentOutings.find((o: any) => o.status === 'approved' || o.status === 'pending');

    return (
      <div className="space-y-6">
        {/* Banner Card */}
        <div className="bg-gradient-to-r from-neutral-950 to-neutral-800 p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="flex gap-4 items-center relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center font-black text-3xl text-primary border border-white/10">
              {currentStudent.name?.charAt(0)}
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-primary font-black font-mono">Verified Boarder</p>
              <h2 className="text-3xl font-black tracking-tight">{currentStudent.name}</h2>
              <p className="text-sm text-neutral-300">Admission No: {currentStudent.admissionNumber || 'N/A'}</p>
            </div>
          </div>
          <span className="px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-black uppercase tracking-widest shrink-0">
            Hostel Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Hostel Room Details */}
          <div className="md:col-span-2 bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
            <h3 className="text-lg font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Building className="w-5 h-5 text-primary" /> Room & Accommodation Particulars
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Hostel Block</span>
                <p className="text-lg font-bold text-neutral-800 mt-1">{currentStudent.hostelName || 'Not Allocated Yet'}</p>
              </div>

              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Room Number</span>
                <p className="text-lg font-bold text-neutral-800 mt-1">{currentStudent.hostelRoom || 'Not Allocated Yet'}</p>
              </div>

              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Bed Allocation</span>
                <p className="text-lg font-bold text-neutral-800 mt-1">{currentStudent.hostelBed || 'Not Allocated Yet'}</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between text-sm py-2 border-b border-neutral-100">
                <span className="text-neutral-500 font-medium">Class / Section</span>
                <span className="font-bold text-neutral-800">{currentStudent.className || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-neutral-100">
                <span className="text-neutral-500 font-medium">Batch</span>
                <span className="font-bold text-neutral-800">{currentStudent.batchName || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-neutral-100">
                <span className="text-neutral-500 font-medium font-bold">Father Name</span>
                <span className="font-bold text-neutral-800">{currentStudent.fatherName || currentStudent.parentName || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-sm py-2">
                <span className="text-neutral-500 font-medium">Emergency Phone</span>
                <span className="font-bold text-neutral-800">{currentStudent.whatsappNumber || currentStudent.parentPhone || currentStudent.phone || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Quick Outing Summary Status */}
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col justify-between space-y-6">
            <div>
              <h3 className="text-lg font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2 border-b border-neutral-100 pb-3">
                <Home className="w-5 h-5 text-indigo-500" /> Active Outing Status
              </h3>
              
              {activeStudentOuting ? (
                <div className="mt-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700">
                      {activeStudentOuting.status}
                    </span>
                    <span className="text-xs text-neutral-400 font-bold">{activeStudentOuting.type}</span>
                  </div>
                  <p className="text-sm text-neutral-600 font-medium">
                    Destination: <span className="font-bold text-neutral-800">{activeStudentOuting.destination}</span>
                  </p>
                  <p className="text-[11px] text-neutral-400 font-medium">
                    Dates: {activeStudentOuting.startDate} {activeStudentOuting.endDate ? `to ${activeStudentOuting.endDate}` : ''}
                  </p>
                </div>
              ) : (
                <div className="mt-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-100 text-center py-8">
                  <CheckCircle2 className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-sm text-neutral-600 font-bold">Inside Campus</p>
                  <p className="text-xs text-neutral-400 mt-1">No active holiday or outing found.</p>
                </div>
              )}
            </div>

            <div className="bg-orange-50/50 border border-orange-100 p-4 rounded-2xl space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-orange-600">Gate Pass Note</span>
              <p className="text-xs text-orange-800 font-medium">Please generate an outing request inside the "Outings & Leaves" tab to request exit clearance.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { id: 'capacity', label: 'Total Capacity', value: totalCapacity.toString(), icon: Building, color: 'text-blue-600', bg: 'bg-blue-50', clickable: false },
          { id: 'occupied', label: 'Occupied Beds', value: occupiedBeds.toString(), icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', clickable: true },
          { id: 'available', label: 'Available Beds', value: availableBeds.toString(), icon: CheckCircle2, color: 'text-orange-600', bg: 'bg-orange-50', clickable: false },
          { id: 'leave', label: 'On Leave/Outing', value: onLeaveCount.toString(), icon: Home, color: 'text-purple-600', bg: 'bg-purple-50', clickable: true }
        ].map((stat, i) => {
          const isSelected = selectedDetail === stat.id;
          const isClickable = stat.clickable;
          return (
            <div 
              key={i} 
              onClick={() => {
                if (isClickable) {
                  setSelectedDetail(prev => prev === stat.id ? null : (stat.id as any));
                  setSearchQuery('');
                }
              }}
              className={`bg-white p-6 rounded-2xl border transition-all ${
                isClickable 
                  ? 'cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-95' 
                  : ''
              } ${
                isSelected 
                  ? stat.id === 'occupied' 
                    ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/10' 
                    : 'ring-2 ring-purple-500 border-purple-500 bg-purple-50/20'
                  : 'border-neutral-200 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5 flex-wrap">
                    {stat.label}
                    {isClickable && (
                      <span className="text-[10px] lowercase font-semibold text-primary"> (click to view)</span>
                    )}
                  </p>
                  <h3 className="text-4xl font-black text-neutral-900 tracking-tight mt-2">{stat.value}</h3>
                </div>
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {overdueCount > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-800 font-bold">
          <Clock className="w-6 h-6 text-rose-600" />
          <span>Attention: {overdueCount} student(s) have not checked back in after their leave end date.</span>
        </div>
      )}
      
      {selectedDetail ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-100 pb-4">
            <div>
              <h3 className="text-2xl font-black text-neutral-950 flex items-center gap-2">
                {selectedDetail === 'occupied' ? (
                  <>
                    <Users className="w-7 h-7 text-emerald-600" />
                    Occupied Bed Boarders ({filteredOccupied.length})
                  </>
                ) : (
                  <>
                    <Home className="w-7 h-7 text-purple-600" />
                    Hostel Residents on Leave/Outing ({filteredLeave.length})
                  </>
                )}
              </h3>
              <p className="text-sm text-neutral-500 mt-1">
                {selectedDetail === 'occupied' 
                  ? 'Detailed roster of all students currently allocated a bed in the hostel.' 
                  : 'Roster of active, approved outings and logs for students currently away.'}
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder={selectedDetail === 'occupied' ? "Search by name, ID, block, room..." : "Search by name, destination, route..."}
                  className="w-full pl-9 pr-4 py-2 border border-neutral-250 rounded-xl text-sm outline-none focus:border-primary bg-neutral-50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="px-4 py-2 text-sm font-bold bg-neutral-150 hover:bg-neutral-200 text-neutral-700 rounded-xl transition-all border border-neutral-200 flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4 text-neutral-500" />
                Reset View
              </button>
            </div>
          </div>

          {selectedDetail === 'occupied' ? (
            sortedOccupiedList.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-left font-mono text-sm text-neutral-600">
                  <thead className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-xs tracking-wider text-neutral-500">
                    <tr>
                      <th className="py-4 px-5">Student Info</th>
                      <th className="py-4 px-5">Hostel Accommodation</th>
                      <th className="py-4 px-5">Home Area / Village</th>
                      <th className="py-4 px-5">Parent Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {sortedOccupiedList.map((student: any) => {
                      const id = student.uid || student.id;
                      const palette = blockColors.mapping[student.hostelName?.trim()] || blockColors.defaultPalette;
                      const cls = classes.find((c: any) => c.id === student.classId)?.name || student.className || 'N/A';
                      const batch = batches.find((b: any) => b.id === student.batchId)?.name || student.batchName || 'N/A';
                      
                      return (
                        <tr key={id} className={`transition-all duration-150 border-b ${palette.border} ${palette.rowHover}`}>
                          <td className="py-4 px-5">
                            <div className={`text-base font-black ${palette.text}`}>{student.name}</div>
                            <div className={`text-xs mt-0.5 ${palette.subtext} font-bold`}>
                              ID: {student.admissionNumber || 'N/A'} • <span className="capitalize">{student.gender || 'N/A'}</span>
                            </div>
                            <div className={`text-xs mt-1.5 font-sans ${palette.lightText}`}>
                              Class: <span className="font-extrabold">{cls}</span> • Batch: <span className="font-extrabold">{batch}</span>
                            </div>
                          </td>
                          <td className="py-4 px-5">
                            <span className={`inline-block px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg border ${palette.badge}`}>
                              {student.hostelName || 'N/A'}
                            </span>
                            <div className={`text-xs font-bold mt-2 ${palette.lightText}`}>
                              Room: {student.hostelRoom || 'N/A'} • Bed: {student.hostelBed || 'N/A'}
                            </div>
                          </td>
                          <td className={`py-4 px-5 font-sans font-semibold text-sm ${palette.lightText}`}>
                            {student.village || student.city || student.address || 'N/A'}
                          </td>
                          <td className="py-4 px-5">
                            <div className={`font-mono font-bold text-sm ${palette.text}`}>
                              {student.whatsappNumber || student.phone || 'N/A'}
                            </div>
                            {student.fatherName && (
                              <div className={`text-xs mt-1 font-sans font-semibold ${palette.subtext}`}>
                                Father: {student.fatherName}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 flex flex-col items-center justify-center">
                <Users className="w-12 h-12 text-neutral-300 mb-2" />
                <p className="text-neutral-500 font-medium">No active occupied boarders match your search filter.</p>
              </div>
            )
          ) : (
            filteredLeave.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-left font-mono text-sm text-neutral-600">
                  <thead className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-xs tracking-wider text-neutral-500">
                    <tr>
                      <th className="py-4 px-5">Student Info</th>
                      <th className="py-4 px-5">Accommodation</th>
                      <th className="py-4 px-5">Leave / Outing Details</th>
                      <th className="py-4 px-5">Duration / Dates</th>
                      <th className="py-4 px-5">Leave Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {filteredLeave.map((student: any) => {
                      const id = student.uid || student.id;
                      const o = student.activeOuting;
                      return (
                        <tr key={id} className="hover:bg-neutral-50/40 transition-colors">
                          <td className="py-4 px-5">
                            <div className="font-bold text-neutral-950 text-base">{student.name}</div>
                            <div className="text-xs text-neutral-400 mt-0.5">ID: {student.admissionNumber || 'N/A'} • <span className="capitalize">{student.gender || 'N/A'}</span></div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-bold text-neutral-800">{student.hostelName || 'N/A'}</div>
                            <div className="text-xs text-neutral-500 font-medium">Room: {student.hostelRoom || 'N/A'}</div>
                          </td>
                          <td className="py-4 px-5">
                            <span className="px-2.5 py-0.5 shrink-0 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700">
                              {o?.type || 'Approved Leave'}
                            </span>
                            <div className="text-xs text-neutral-700 font-bold mt-1">Destination: {o?.destination || student.village || 'Home'}</div>
                          </td>
                          <td className="py-4 px-5 font-sans">
                            <div className="text-sm font-bold text-neutral-800">{o?.startDate || 'N/A'} to {o?.endDate || 'N/A'}</div>
                            <div className="text-xs text-neutral-400 mt-0.5">Gate pass time: {o?.time || 'N/A'}</div>
                          </td>
                          <td className="py-4 px-5 font-sans">
                            <p className="text-xs text-neutral-650 italic bg-neutral-50 p-2 rounded-lg border border-neutral-100 max-w-sm">{o?.reason || 'Approved leave/outing clearance.'}</p>
                            <div className="text-[10px] text-neutral-400 mt-1 font-mono">Emergency: {o?.parentPhone || student.whatsappNumber || 'N/A'}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 flex flex-col items-center justify-center">
                <Home className="w-12 h-12 text-neutral-300 mb-2" />
                <p className="text-neutral-500 font-medium">No hostel boarders currently on leave/outing match your search filter.</p>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200 flex flex-col items-center justify-center min-h-[300px]">
          <Building className="w-16 h-16 text-neutral-200 mb-4" />
          <h3 className="text-2xl font-bold text-neutral-800">Dashboard Metrics</h3>
          <p className="text-neutral-500 max-w-sm text-center mt-2">More charts and analytics for hostel operations will be populated here as data grows.</p>
        </div>
      )}
    </div>
  );
}

function HostelStudents({ students, classes, batches, blocks, rooms = [] }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const { hasPermission, profile } = useAuth();
  const canManage = profile?.role === 'admin' || profile?.role === 'clerk' || hasPermission('hostel_manage') || hasPermission('hostel_students_manage');

  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [roomDetails, setRoomDetails] = useState({ hostelName: '', room: '', bed: '' });
  const [isCreatingNewRoom, setIsCreatingNewRoom] = useState(false);
  const [customRoomValue, setCustomRoomValue] = useState('');

  const existingRoomsInBlock = React.useMemo(() => {
    if (!roomDetails.hostelName) return [];
    
    // 1. Get from rooms collection (hostel_rooms)
    const filterBlockId = blocks.find((b: any) => b.name === roomDetails.hostelName)?.id;
    const fromRoomsCollection = (rooms || [])
        .filter((r: any) => 
            r.blockName === roomDetails.hostelName || 
            r.hostelName === roomDetails.hostelName || 
            (filterBlockId && r.blockId === filterBlockId)
        )
        .map((r: any) => r.name || r.roomNumber || r.roomNo || r.roomName || r.room || '')
        .filter(Boolean);

    // 2. Get from students currently assigned
    const fromStudents = (students || [])
        .filter((s: any) => s.hostelName === roomDetails.hostelName && s.hostelRoom)
        .map((s: any) => s.hostelRoom);

    // Combine them, deduplicate, and sort
    const allRooms = Array.from(new Set([...fromRoomsCollection, ...fromStudents]));
    return allRooms.sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [roomDetails.hostelName, rooms, students, blocks]);

  const hostelStudents = students.filter((s: any) => s.feeType?.toLowerCase() === 'hostel' && (s.status?.toLowerCase() === 'active' || !s.status));
  const filteredStudents = hostelStudents.filter((s: any) => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.hostelName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.hostelRoom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.admissionNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.village?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportStudents = () => {
    const dataToExport = hostelStudents.map((s: any) => {
      const cls = classes.find((c: any) => c.id === s.classId)?.name || '';
      const batch = batches.find((b: any) => b.id === s.batchId)?.name || '';
      
      return {
        ...s,
        ClassName: cls,
        BatchName: batch,
      };
    });

    if (dataToExport.length === 0) {
      toast.error('No hostel students found to export');
      return;
    }

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `hostel_students_detailed_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Hostel students exported successfully (All fields included)');
  };

  const handleDropStudent = async (student: any) => {
    if (!canManage) {
        toast.error("You don't have permission to manage hostel allocations.");
        return;
    }

    const docId = student.id || student.uid;
    if (!docId) {
        toast.error("Student identity not found. Please refresh the page.");
        return;
    }

    if (window.confirm(`Are you sure you want to drop ${student.name} from the hostel? This will change them to a Day scholar and remove their current room allocation.`)) {
        const toastId = toast.loading(`Dropping ${student.name} from hostel...`);
        try {
            await dbService.update('students', docId, {
                feeType: 'day_schooler',
                hostelName: '',
                hostelRoom: '',
                hostelBed: '',
                hostelDropDate: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            toast.success(`${student.name} dropped from hostel successfully. Check the "Dropped" tab for history.`, { id: toastId });
        } catch (error: any) {
            console.error("Error dropping student: ", error);
            toast.error(`Failed to drop student: ${error.message || 'Unknown error'}`, { id: toastId });
        }
    }
  };

  const handleSaveAllocation = async () => {
     if (!editingStudent) return;
     const docId = editingStudent.id || editingStudent.uid;
     if (!docId) {
         toast.error("Student ID missing. Cannot save allocation.");
         return;
     }

     try {
       await dbService.update('students', docId, {
           hostelName: roomDetails.hostelName,
           hostelRoom: roomDetails.room,
           hostelBed: roomDetails.bed,
           feeType: 'hostel',
           hostelDropDate: "", // Clear any previous drop date
           updatedAt: new Date().toISOString()
       });
       toast.success("Hostel bed allocated successfully");
       setEditingStudent(null);
       setIsCreatingNewRoom(false);
       setCustomRoomValue('');
     } catch (error) {
       console.error("Error assigning room/bed: ", error);
       toast.error("Failed to assign room/bed");
     }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-neutral-800">Hostel Allocations ({hostelStudents.length})</h2>
          <p className="text-base text-neutral-500">
            Students with valid hostel configuration in their profile. <br />
            <span className="text-base italic text-blue-600 bg-blue-50 px-2 rounded">Tip: To assign a student to the hostel, edit their profile in the Students module and set "Fee Type" to "Hostel Resident".</span>
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input 
              type="text"
              placeholder="Search by name, ID, village or room..."
              className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl outline-none focus:border-primary text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={exportStudents}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-600 font-bold border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-colors whitespace-nowrap text-base shadow-sm"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
        </div>
      </div>

      {filteredStudents.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-left font-mono text-lg text-neutral-600">
            <thead className="bg-neutral-50 font-bold border-b border-neutral-100 uppercase tracking-widest text-base">
              <tr>
                <th className="py-5 px-6 md:px-8">Student Info</th>
                <th className="py-5 px-6">Class/Batch</th>
                <th className="py-5 px-6">Village/City</th>
                <th className="py-5 px-6">Room/Bed</th>
                <th className="py-5 px-6">Parent Contact</th>
                <th className="py-5 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredStudents.map((student: any) => {
                const cls = classes.find((c: any) => c.id === student.classId)?.name || 'N/A';
                const batch = batches.find((b: any) => b.id === student.batchId)?.name || 'N/A';
                return (
                  <tr key={student.uid} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-5 px-6 md:px-8">
                      <div>
                        <span className="font-bold text-neutral-900 text-2xl">{student.name}</span>
                        <div className="flex gap-2 items-center text-base text-neutral-500 mt-1">
                          <span>{student.admissionNumber || 'No ID'}</span>
                          <span>•</span>
                          <span className="capitalize">{student.gender || 'Unknown'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <span className="font-bold text-neutral-800">{cls}</span>
                      <span className="text-neutral-500 text-base ml-1">{batch}</span>
                    </td>
                    <td className="py-5 px-6">
                      <span className="font-bold text-neutral-700">{student.village || student.city || 'N/A'}</span>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <Building className="w-5 h-5 text-emerald-500" />
                            <span className="font-bold text-emerald-700">{student.hostelName || 'No Hostel specified'}</span>
                        </div>
                        {(student.hostelRoom || student.hostelBed) && (
                            <div className="text-base">
                                Room: <span className="font-bold">{student.hostelRoom || 'N/A'}</span> • Bed: <span className="font-bold">{student.hostelBed || 'N/A'}</span>
                            </div>
                        )}
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex flex-col">
                        <span className="font-bold">{student.parentName || student.fatherName || 'Unknown Parent'}</span>
                        <span className="text-base text-neutral-500 flex items-center gap-1 mt-1"><Phone className="w-5 h-5" /> {student.whatsappNumber || student.contact || 'No Contact'}</span>
                      </div>
                    </td>
                    <td className="py-5 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                           <button 
                               onClick={() => {
                                   setEditingStudent(student);
                                   setIsCreatingNewRoom(false);
                                   setCustomRoomValue('');
                                   setRoomDetails({ 
                                       hostelName: student.hostelName || (blocks.length > 0 ? blocks[0].name : ''),
                                       room: student.hostelRoom || '', 
                                       bed: student.hostelBed || '' 
                                   });
                               }}
                               className="px-4 py-2 text-base font-bold bg-neutral-100 text-neutral-600 hover:bg-primary hover:text-white rounded-lg transition-colors"
                           >
                               Assign Bed
                           </button>
                           <button 
                               onClick={() => handleDropStudent(student)}
                               title="Drop from Hostel"
                               className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors inline-block"
                           >
                               <XCircle className="w-6 h-6" />
                           </button>
                        </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-16 text-center flex flex-col items-center justify-center">
          <Users className="w-16 h-16 text-neutral-200 mb-6" />
          <h3 className="text-2xl font-bold text-neutral-800">No hostel allocations found</h3>
          <p className="text-neutral-500 max-w-md mt-4 text-base leading-relaxed">Create and allocate students to hostels in the student management profile. Ensure their Fee Type is set to "Hostel Resident".</p>
        </div>
      )}

      {editingStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
                  <h3 className="text-2xl font-bold mb-6">Assign Room & Bed for {editingStudent.name}</h3>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Hostel Building / Block</label>
                          <select 
                              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                              value={roomDetails.hostelName}
                              onChange={(e) => {
                                  setRoomDetails({ ...roomDetails, hostelName: e.target.value, room: '', bed: '' });
                              }}
                          >
                              <option value="">Select Block</option>
                              {blocks.map((block: any) => (
                                  <option key={block.id} value={block.name}>{block.name} (Cap: {block.capacity})</option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Room Number / Name</label>
                          {existingRoomsInBlock.length > 0 ? (
                              <div className="space-y-3">
                                  <select 
                                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                                      value={isCreatingNewRoom ? '__new_room__' : roomDetails.room}
                                      onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === '__new_room__') {
                                              setIsCreatingNewRoom(true);
                                              setRoomDetails({ ...roomDetails, room: '', bed: '' });
                                          } else {
                                              setIsCreatingNewRoom(false);
                                              setRoomDetails({ ...roomDetails, room: val, bed: '' });
                                          }
                                      }}
                                  >
                                      <option value="">Select Room</option>
                                      {existingRoomsInBlock.map((rm: string) => (
                                          <option key={rm} value={rm}>{rm}</option>
                                      ))}
                                      <option value="__new_room__" className="text-primary font-bold">+ Create New Room...</option>
                                  </select>
                                  
                                  {isCreatingNewRoom && (
                                      <div className="relative">
                                          <input 
                                              type="text" 
                                              placeholder="Enter new room name (e.g. 101)"
                                              className="w-full px-4 py-3 bg-neutral-50 border border-primary/40 rounded-xl outline-none focus:border-primary font-bold animate-in fade-in duration-200"
                                              value={customRoomValue}
                                              onChange={(e) => {
                                                  setCustomRoomValue(e.target.value);
                                                  setRoomDetails({ ...roomDetails, room: e.target.value, bed: '' });
                                              }}
                                          />
                                          <button
                                              type="button"
                                              onClick={() => {
                                                  setIsCreatingNewRoom(false);
                                                  setCustomRoomValue('');
                                                  setRoomDetails({ ...roomDetails, room: '', bed: '' });
                                              }}
                                              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-rose-500 font-bold hover:underline"
                                          >
                                              Use List
                                          </button>
                                      </div>
                                  )}
                              </div>
                          ) : (
                              <div>
                                  <input 
                                      type="text" 
                                      placeholder="e.g. 101, 102"
                                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                                      value={roomDetails.room}
                                      onChange={(e) => setRoomDetails({...roomDetails, room: e.target.value, bed: ''})}
                                  />
                                  <p className="text-xs text-neutral-400 mt-1 uppercase font-bold">Type room number to see available beds</p>
                              </div>
                          )}
                      </div>
                      <div>
                          <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Select Available Bed</label>
                          <select 
                              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold disabled:opacity-50"
                              value={roomDetails.bed}
                              disabled={!roomDetails.hostelName || !roomDetails.room}
                              onChange={(e) => setRoomDetails({...roomDetails, bed: e.target.value})}
                          >
                              <option value="">Select Bed</option>
                              {(() => {
                                  const selectedBlock = blocks.find((b: any) => b.name === roomDetails.hostelName);
                                  if (!selectedBlock) return null;
                                  
                                  // Find all occupied beds in this block and room
                                  const occupiedBeds = students
                                    .filter((s: any) => 
                                        s.hostelName === roomDetails.hostelName && 
                                        s.hostelRoom === roomDetails.room &&
                                        s.uid !== editingStudent.uid // Exclude current student if they are already in this room
                                    )
                                    .map((s: any) => s.hostelBed);

                                  // Assuming beds are numbered 1 to block capacity for simplicity, 
                                  // or just 10 beds per room if not otherwise specified.
                                  // Let's offer beds 1-20 per room as a reasonable default if specific room capacity isn't defined.
                                  const maxBeds = 20; 
                                  const availableBeds = [];
                                  for (let i = 1; i <= maxBeds; i++) {
                                      const bedNum = `Bed ${i}`;
                                      if (!occupiedBeds.includes(bedNum)) {
                                          availableBeds.push(bedNum);
                                      }
                                  }
                                  
                                  return availableBeds.map(bed => (
                                      <option key={bed} value={bed}>{bed}</option>
                                  ));
                              })()}
                          </select>
                      </div>
                  </div>

                  <div className="flex gap-3 justify-end mt-8">
                     <button 
                         onClick={() => setEditingStudent(null)}
                         className="px-6 py-2.5 rounded-xl font-bold text-neutral-600 hover:bg-neutral-100"
                     >
                         Cancel
                     </button>
                     <button 
                         onClick={handleSaveAllocation}
                         className="px-6 py-2.5 rounded-xl font-bold bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
                     >
                         Save Allocation
                     </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

function HostelOutings({ students, buses, classes, batches, outings }: any) {
  const [showKiosk, setShowKiosk] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const { hasPermission, profile, isStudent } = useAuth();
  const { settings } = useSettings();
  const studentUid = profile?.uid || profile?.id;
  const canManage = hasPermission('hostel_manage') || hasPermission('hostel_outing_manage') || hasPermission('hostel_students_manage');

  // Thermal print integration state variables
  const [printingPermission, setPrintingPermission] = useState<{ student: any; permission: any } | null>(null);
  const [printQueue, setPrintQueue] = useState<{ student: any; permission: any }[]>([]);
  const [printPaperSize, setPrintPaperSize] = useState<'2in' | '3in' | 'a5'>(() => {
    return (localStorage.getItem('hostel_print_paper_size') as any) || '3in';
  });
  const [showPrinterHint, setShowPrinterHint] = useState(false);
  const [previewPermission, setPreviewPermission] = useState<{ student: any; permission: any } | null>(null);

  const handlePaperSizeChange = (size: '2in' | '3in' | 'a5') => {
    setPrintPaperSize(size);
    localStorage.setItem('hostel_print_paper_size', size);
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintingPermission(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // Sequential 3-inch/2-inch thermal printer automation queue
  useEffect(() => {
    if (!printingPermission && printQueue.length > 0) {
      const nextPrint = printQueue[0];
      setPrintQueue(prev => prev.slice(1));
      setPrintingPermission(nextPrint);
      
      const timer = setTimeout(() => {
        try {
          window.print();
          console.log(`[Printer] Automatically sent print for hostel student: ${nextPrint.student?.name}`);
        } catch (printErr) {
          console.warn("Print dialog launch failed:", printErr);
        }
        
        // Mobile / Iframe fallback: reset state after 5 seconds
        const fallbackId = setTimeout(() => {
          setPrintingPermission(prev => {
            if (prev && prev.student?.uid === nextPrint.student?.uid) {
              console.log("[Printer] Fallback cleared printingPermission");
              return null;
            }
            return prev;
          });
        }, 5000);
        
        return () => clearTimeout(fallbackId);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [printingPermission, printQueue]);

  const handlePrintSlip = (student: any, outing: any) => {
    const isKiosk = outing.reason === 'Kiosk Facial Approval' || outing.type === 'Facial Approval Outing';
    setPreviewPermission({
      student,
      permission: {
        id: outing.id || `outing_${Date.now()}`,
        studentId: student.uid,
        date: outing.startDate || new Date().toISOString().split('T')[0],
        time: outing.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        type: 'hostel_outpass',
        reason: outing.reason || 'Hostel Outpass Approval',
        grantedBy: isKiosk ? 'Smart Kiosk Facerec' : (profile?.name || profile?.uid || 'Warden Admin')
      }
    });
  };

  const getAuthorizedByName = (grantedId: string) => {
    if (grantedId === 'Smart Kiosk Facerec' || grantedId === 'Kiosk') return 'Smart Kiosk Facerec';
    return grantedId || 'Hostel Warden / Guard';
  };

  const handleDeleteOuting = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this outing record?")) return;
    try {
      await dbService.delete('hostel_outings', id);
      toast.success("Outing record deleted");
    } catch (e) {
      toast.error("Failed to delete record");
    }
  };

  const [newReq, setNewReq] = useState({
    studentId: '',
    type: 'Weekend Leave',
    destination: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    reason: '',
    transportBusId: ''
  });

  useEffect(() => {
    if (isStudent && studentUid && showNewRequest) {
      setNewReq(prev => ({
        ...prev,
        studentId: studentUid,
        destination: profile?.village || profile?.city || profile?.address || ''
      }));
    }
  }, [isStudent, studentUid, showNewRequest, profile]);

  const handleAction = async (id: string, status: string, student: any) => {
    try {
      await dbService.update('hostel_outings', id, { 
        status, 
        updatedAt: new Date().toISOString() 
      });
      
      const actionText = status === 'approved' ? 'Approved' : 'Rejected';
      toast.success(`Request ${actionText} successfully`);

      if (status === 'approved') {
        const cls = classes.find((c: any) => c.id === student.classId)?.name || '';
        const msg = `*Outing Approved:*\nStudent: ${student.name}\nType: ${student.type}\nDate: ${student.startDate} to ${student.endDate}\nDestination: ${student.destination}`;
        
        if (student.parentPhone && student.parentPhone !== 'N/A') {
          const res = await whatsappService.sendMessage(student.parentPhone, msg, {
            studentId: student.studentId || student.uid || 'unknown_student',
            outingId: id,
            templateType: 'hostel_outing_permission',
            messageType: 'outing_notice',
            eventType: 'hostel_outing_permission',
            priority: 0,
            source: 'hostel_outing_permission',
            date: student.startDate || new Date().toISOString().split('T')[0],
            forceSend: false
          });
          
          if (res && res.skipped) {
            if (res.error === 'missing_phone') {
              toast.success("Outing request approved, but parent phone was missing.");
            } else if (res.error === 'invalid_phone') {
              toast.success("Outing request approved, but parent phone was invalid.");
            } else {
              toast.success("Outing request approved (similar parent notification already sent).");
            }
          } else {
            toast.info("Notification sent to parent");
          }
        }
      }
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleCreateRequest = async () => {
    if (!newReq.studentId || !newReq.destination || !newReq.reason) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const student = students.find((s: any) => s.uid === newReq.studentId);
      if (!student) return;

      const cls = classes.find((c: any) => c.id === student.classId)?.name || '';
      const batch = batches.find((b: any) => b.id === student.batchId)?.name || '';

      await (dbService as any).add('hostel_outings', {
        ...newReq,
        studentName: student.name,
        className: `${cls} ${batch}`,
        parentPhone: student.whatsappNumber || student.phone || 'N/A',
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      toast.success("Outing request created successfully");
      setShowNewRequest(false);
      setNewReq({
        studentId: '',
        type: 'Weekend Leave',
        destination: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        reason: '',
        transportBusId: ''
      });
    } catch (error) {
      toast.error("Failed to create request");
    }
  };

  const processFacialOuting = async (person: any) => {
    setShowKiosk(false);
    toast.loading(`Processing outing for ${person.name}...`, { id: 'outing-process' });
    try {
      const cls = classes.find((c: any) => c.id === person.classId)?.name || 'Unknown Class';
      const batch = batches.find((b: any) => b.id === person.batchId)?.name || '';
      const dest = person.address || person.village || 'Home';
      let busDriver = 'N/A';
      
      let driverPhone = '';
      if (person.transportBusId) {
        const bus = buses.find((b: any) => b.id === person.transportBusId);
        if (bus) {
          busDriver = `${bus.driverName || 'Driver'} (Bus ${bus.busNumber || '#'})`;
          if (bus.driverPhone) driverPhone = bus.driverPhone;
        }
      }

      const outingId = `kiosk_${Date.now()}`;
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const startDateStr = new Date().toISOString().split('T')[0];

      const newOutingData = {
        studentId: person.uid,
        studentName: person.name,
        className: `${cls} ${batch}`,
        type: 'Facial Approval Outing',
        destination: dest,
        busDriver: busDriver,
        status: 'approved',
        startDate: startDateStr,
        endDate: startDateStr,
        parentPhone: person.whatsappNumber || person.phone || 'N/A',
        reason: 'Kiosk Facial Approval',
        time: timeStr,
        createdAt: new Date().toISOString()
      };

      await (dbService as any).add('hostel_outings', newOutingData);

      if (person.whatsappNumber) {
        const message = `*Outing Approved (Facial):*\n${person.name} has been approved to leave the hostel.\nDestination: ${dest}.`;
        const res = await whatsappService.sendMessage(person.whatsappNumber, message, {
          studentId: person.uid || 'unknown_student',
          outingId: outingId,
          templateType: 'hostel_outing_permission',
          messageType: 'outing_notice',
          eventType: 'hostel_outing_permission',
          priority: 0,
          source: 'hostel_outing_permission_kiosk',
          date: startDateStr,
          forceSend: false
        });

        if (res && res.skipped) {
          if (res.error === 'missing_phone') {
            toast.success(`Outing approved automatically for ${person.name}, but parent phone was missing.`, { id: 'outing-process' });
          } else if (res.error === 'invalid_phone') {
            toast.success(`Outing approved automatically for ${person.name}, but parent phone was invalid.`, { id: 'outing-process' });
          } else {
            toast.success(`Outing approved automatically for ${person.name} (duplicate notification blocked).`, { id: 'outing-process' });
          }
        } else {
          toast.success(`Outing approved automatically and parent notified.`, { id: 'outing-process' });
        }
      } else {
        toast.success(`Outing approved automatically.`, { id: 'outing-process' });
      }

      // Automatically queue printing for the student outpass
      const appOutpass = {
        id: outingId,
        studentId: person.uid,
        date: startDateStr,
        time: timeStr,
        type: 'hostel_outpass',
        reason: 'Kiosk Facial Approval',
        grantedBy: 'Smart Kiosk Facerec'
      };

      setPrintQueue(prev => [...prev, { student: person, permission: appOutpass }]);
      setPreviewPermission({ student: person, permission: appOutpass });
    } catch (error) {
      toast.error(`Error processing outing`, { id: 'outing-process' });
    }
  };

  const handleReturn = async (id: string, name: string) => {
    try {
      await dbService.update('hostel_outings', id, { 
        status: 'returned', 
        actualReturnAt: new Date().toISOString(),
        updatedAt: new Date().toISOString() 
      });
      toast.success(`${name} marked as returned to hostel`);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const filteredOutings = outings.filter((o: any) => {
    if (isStudent && o.studentId !== studentUid) {
      return false;
    }
    const matchesSearch = o.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          o.destination?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {showKiosk && (
          <SmartKioskModal
            isOpen={showKiosk}
            onClose={() => setShowKiosk(false)}
            people={students}
            mode="student_permission"
            onIdentifySuccess={processFacialOuting}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-neutral-800">Outing & Leave Requests</h2>
          <p className="text-neutral-500">Manage and track student movements in real-time.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {!isStudent && (
            <div className="relative flex-1 md:w-64">
               <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
               <input 
                 type="text"
                 placeholder="Search requests..."
                 className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-xl outline-none focus:border-primary"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
          )}
          {!isStudent && (
            <button 
              onClick={() => setShowKiosk(true)}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center gap-2 shadow-sm"
            >
              <Camera className="w-4 h-4" /> Kiosk
            </button>
          )}
          <button 
            onClick={() => setShowNewRequest(true)}
            className="px-4 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Request
          </button>
          
          {(profile?.role === 'admin' || hasPermission('hostel_manage')) && filteredOutings.length > 0 && (
            <button 
              onClick={async () => {
                if (window.confirm(`Are you sure you want to delete ALL ${filteredOutings.length} outings in the current view?`)) {
                  try {
                    await dbService.deleteBatch('hostel_outings', filteredOutings.map((o: any) => o.id));
                    toast.success("Outings deleted successfully");
                  } catch (e) {
                    toast.error("Failed to delete outings");
                  }
                }
              }}
              className="px-4 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 flex items-center gap-2 border border-red-100"
              title="Delete All in current view"
            >
              <Trash2 className="w-4 h-4" /> Delete All
            </button>
          )}
        </div>
      </div>

      {/* Thermal Printer Settings Bar */}
      {!isStudent && (
        <div className="bg-white p-4 rounded-2xl border border-neutral-200 flex flex-wrap gap-4 items-center justify-between no-print mb-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Printer className="w-5 h-5" />
            </span>
            <div className="text-left">
              <h4 className="font-bold text-sm text-neutral-800">Thermal Slip Settings</h4>
              <p className="text-[11px] text-neutral-400">Configure outpass slips for mobile or desktop printers</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">Paper Size:</span>
            <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50 shrink-0">
              {(['2in', '3in', 'a5'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => handlePaperSizeChange(size)}
                  className={`px-3 py-1 text-xs font-bold rounded-md uppercase transition-all ${
                    printPaperSize === size
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {size === '2in' ? '2" (58mm)' : size === '3in' ? '3" (80mm)' : 'A5 Laser'}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowPrinterHint(true)}
              className="px-3 py-1.5 border border-neutral-200 text-neutral-650 hover:text-neutral-800 rounded-lg text-xs font-bold bg-white transition-colors cursor-pointer"
            >
              Warden Printing Setup Guide
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pb-2 overflow-x-auto">
        {['all', 'pending', 'approved', 'returned', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold capitalize transition-colors border ${
              filterStatus === status 
                ? 'bg-neutral-900 text-white border-neutral-900' 
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filteredOutings.length > 0 ? filteredOutings.map((request: any) => {
          const isOverdue = request.status === 'approved' && request.endDate && request.endDate < today;
          return (
            <div key={request.id} className={`bg-white p-6 rounded-2xl shadow-sm border ${isOverdue ? 'border-rose-300 bg-rose-50/30' : 'border-neutral-200'}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex gap-4 items-start">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isOverdue ? 'bg-rose-100' : 'bg-neutral-100'}`}>
                    <span className={`font-black text-2xl ${isOverdue ? 'text-rose-600' : 'text-neutral-600'}`}>{request.studentName?.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-neutral-900">{request.studentName}</h3>
                      {isOverdue && (
                        <span className="flex items-center gap-1 text-xs font-black text-rose-600 uppercase bg-rose-100 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-base text-neutral-500">{request.className} • {request.type}</p>
                    
                    <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-base text-neutral-600">
                      <span className={`flex items-center gap-1.5 font-bold ${isOverdue ? 'text-rose-700' : ''}`}>
                        <CalendarIcon className="w-4 h-4 text-neutral-400" /> {request.startDate} {request.endDate ? `to ${request.endDate}` : ''}
                      </span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-neutral-400" /> {request.destination}</span>
                    </div>
                    
                    <div className="mt-3 p-3 bg-neutral-50 rounded-lg text-base border border-neutral-100">
                      <p><span className="font-bold text-neutral-700">Reason:</span> {request.reason}</p>
                      <div className="flex gap-4 mt-2">
                        <span className="flex items-center gap-1.5 font-bold text-neutral-600"><Phone className="w-4 h-4 text-emerald-500" /> {request.parentPhone}</span>
                      </div>
                      {request.status === 'returned' && (
                        <div className="mt-2 text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Returned on {new Date(request.actualReturnAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end justify-between self-stretch shrink-0">
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider
                    ${request.status === 'pending' ? 'bg-orange-100 text-orange-700' : ''}
                    ${request.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : ''}
                    ${request.status === 'returned' ? 'bg-blue-100 text-blue-700' : ''}
                    ${request.status === 'rejected' ? 'bg-rose-100 text-rose-700' : ''}
                  `}>
                    {request.status}
                  </span>
                  
                  <div className="flex gap-2 mt-4">
                    {request.status === 'pending' && canManage && (
                      <>
                        <button onClick={() => handleAction(request.id, 'rejected', request)} className="px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-sm transition-colors">
                          Reject
                        </button>
                        <button onClick={() => handleAction(request.id, 'approved', request)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-emerald-200">
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                      </>
                    )}

                    {request.status === 'approved' && canManage && (
                      <>
                        <button
                          onClick={() => {
                            const student = students.find((s: any) => s.uid === request.studentId);
                            if (student) {
                              handlePrintSlip(student, request);
                            } else {
                              handlePrintSlip({
                                name: request.studentName,
                                uid: request.studentId,
                                classId: '',
                                batchId: '',
                                phone: request.parentPhone || 'N/A'
                              }, request);
                            }
                          }}
                          className="px-4 py-2 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 shadow-sm"
                          title="Print Outpass Slip"
                        >
                          <Printer className="w-4 h-4" /> Print Pass
                        </button>
                        <button 
                          onClick={() => handleReturn(request.id, request.studentName)} 
                          className={`px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center gap-2
                            ${isOverdue 
                              ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200 animate-pulse' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                            }`}
                        >
                          <ShieldCheck className="w-4 h-4" /> 
                          {isOverdue ? 'Confirm Overdue Return' : 'Mark as Returned'}
                        </button>
                      </>
                    )}

                    {canManage && (
                      <button 
                        onClick={() => handleDeleteOuting(request.id)}
                        className="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-colors border border-red-100"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="bg-white p-12 rounded-2xl border border-neutral-200 border-dashed text-center">
            <Home className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
            <p className="text-neutral-500 font-bold">No outing requests found matching criteria.</p>
          </div>
        )}
      </div>


      {showNewRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-3xl font-black text-neutral-900 tracking-tight">New Outing Request</h3>
              <button onClick={() => setShowNewRequest(false)} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                <XCircle className="w-6 h-6 text-neutral-400" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-1 block">Student</label>
                {isStudent ? (
                  <div className="w-full px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-700 font-bold">
                    {profile?.name} ({classes.find((c:any) => c.id === profile?.classId)?.name || ''})
                  </div>
                ) : (
                  <select 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                    value={newReq.studentId}
                    onChange={(e) => {
                      const studentId = e.target.value;
                      const student = students.find((s: any) => s.uid === studentId);
                      setNewReq({
                        ...newReq, 
                        studentId,
                        destination: student ? (student.village || student.city || student.address || '') : ''
                      });
                    }}
                  >
                    <option value="">Select Resident</option>
                    {students.filter((s:any) => s.feeType?.toLowerCase() === 'hostel' && (s.status?.toLowerCase() === 'active' || !s.status)).map((s:any) => (
                      <option key={s.uid} value={s.uid}>{s.name} ({classes.find((c:any) => c.id === s.classId)?.name || ''})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-1 block">Request Type</label>
                <select 
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                  value={newReq.type}
                  onChange={(e) => setNewReq({...newReq, type: e.target.value})}
                >
                  <option value="Weekend Leave">Weekend Leave</option>
                  <option value="Medical Outing">Medical Outing</option>
                  <option value="Family Function">Family Function</option>
                  <option value="Holiday">Vacation/Holiday</option>
                  <option value="General Outing">General Outing</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-1 block">Destination</label>
                <input 
                  type="text" 
                  placeholder="Village/City/Address"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                  value={newReq.destination}
                  onChange={(e) => setNewReq({...newReq, destination: e.target.value})}
                />
              </div>

              <div>
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-1 block">Start Date</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                  value={newReq.startDate}
                  onChange={(e) => setNewReq({...newReq, startDate: e.target.value})}
                />
              </div>

              <div>
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-1 block">End Date (Optional)</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                  value={newReq.endDate}
                  onChange={(e) => setNewReq({...newReq, endDate: e.target.value})}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-1 block">Reason for Request</label>
                <textarea 
                  rows={3}
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                  placeholder="Detailed reason..."
                  value={newReq.reason}
                  onChange={(e) => setNewReq({...newReq, reason: e.target.value})}
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => setShowNewRequest(false)}
                className="flex-1 py-4 rounded-2xl font-black text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateRequest}
                className="flex-[2] py-4 rounded-2xl font-black bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* On-Screen Outpass Permission Slip Preview Modal */}
      <AnimatePresence>
        {previewPermission && (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-800 text-white rounded-[2.5rem] max-w-sm w-full p-6 shadow-2xl border border-neutral-700/60 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-neutral-700 pb-3">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-neutral-100">permission slip preview</h3>
                    <p className="text-[9px] text-neutral-400 font-bold uppercase">Device Connection &amp; Layout Review</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewPermission(null)}
                  className="p-1.5 hover:bg-neutral-700 rounded-full transition-colors text-neutral-400 hover:text-neutral-200 cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Live Preview Paper Selector Segment */}
              <div className="flex items-center justify-between bg-neutral-900/50 p-2.5 rounded-2xl border border-neutral-700">
                <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Layout Preset:</span>
                <div className="flex bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                  {(['2in', '3in', 'a5'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handlePaperSizeChange(size)}
                      className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer ${
                        printPaperSize === size 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {size === '2in' ? '2" Slip' : size === '3in' ? '3" Slip' : 'A5 Sheet'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Styled Ticket Preview Mock on Screen */}
              <div className="flex justify-center bg-neutral-900 p-6 rounded-[2rem] border border-neutral-700/50 overflow-hidden relative min-h-[300px]">
                <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
                
                {/* Simulated Slip */}
                <div 
                  className="bg-white text-black p-3.5 font-sans shadow-xl rounded-md transition-all text-left flex flex-col justify-between select-none"
                  style={{
                    width: printPaperSize === '2in' ? '1.9in' : printPaperSize === '3in' ? '76.2mm' : '138mm', 
                    height: printPaperSize === '2in' ? 'auto' : printPaperSize === '3in' ? '80mm' : '195mm', 
                    fontSize: printPaperSize === '2in' ? '9px' : printPaperSize === '3in' ? '10.5px' : '13px',
                    lineHeight: printPaperSize === '2in' ? '1.2' : printPaperSize === '3in' ? '1.35' : '1.5',
                  }}
                >
                  <div className="flex flex-col justify-between h-full w-full">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1 w-full text-left">
                      {settings.logoUrl && (
                        <img 
                          src={settings.logoUrl} 
                          className="w-8 h-8 object-contain shrink-0" 
                          alt="Logo" 
                          referrerPolicy="no-referrer" 
                        />
                      )}
                      <div className="flex flex-col justify-center min-w-0">
                        <p className="font-sans font-black uppercase tracking-tight text-neutral-900 leading-none text-[10px]">
                          {settings.schoolName || "St. Antony's School"}
                        </p>
                        <p className="font-sans font-black text-[7.5px] uppercase tracking-wider text-indigo-600 leading-none mt-1">
                          HOSTEL PASS
                        </p>
                      </div>
                    </div>

                    {/* Date/Time Row */}
                    <div className="flex justify-between text-[8px] text-neutral-500 pb-1 mb-1">
                      <span>DATE: {previewPermission.permission.date}</span>
                      <span className="font-bold">TIME: {previewPermission.permission.time}</span>
                    </div>

                    {/* Body Info with Photo */}
                    <div className="flex gap-2 items-start justify-between flex-1 min-h-0 w-full">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div>
                          <span className="text-neutral-400 text-[7px] uppercase block leading-none">Student Name</span>
                          <span className="font-sans font-black uppercase block leading-tight text-neutral-900 text-[10.5px] truncate">{previewPermission.student.name}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-[7px] uppercase block leading-none">Father Name</span>
                          <span className="font-sans font-bold uppercase block text-neutral-800 text-[8.5px] truncate">{previewPermission?.student?.fatherName || previewPermission?.student?.motherName || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 w-full">
                          <div>
                            <span className="text-neutral-400 text-[7px] uppercase block leading-none">Class &amp; Sect</span>
                            <span className="font-bold block text-neutral-700 text-[8.5px] truncate">
                              {classes.find((c: any) => c.id === previewPermission?.student?.classId)?.name || 'N/A'} - {batches.find((b: any) => b.id === previewPermission?.student?.batchId)?.name || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-400 text-[7px] uppercase block leading-none">Roll / Adm ID</span>
                            <span className="block text-neutral-600 font-bold text-[8px] truncate">
                              R: {previewPermission?.student?.rollNumber || 'N/A'} / A: {previewPermission?.student?.admissionNumber || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Photo */}
                      <div className="shrink-0">
                        {(previewPermission?.student?.presentPhotoURL || previewPermission?.student?.photoURL || previewPermission?.student?.photoUrl) ? (
                          <img 
                            src={previewPermission?.student?.presentPhotoURL || previewPermission?.student?.photoURL || previewPermission?.student?.photoUrl} 
                            alt={previewPermission?.student?.name} 
                            className="w-10 h-12 object-cover rounded border border-neutral-300 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-12 bg-neutral-150 border border-dashed border-neutral-300 rounded flex flex-col items-center justify-center text-[7px] text-neutral-400 font-bold uppercase text-center leading-none select-none shrink-0">
                            <span>No</span>
                            <span>Photo</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="mt-1 pt-1 w-full">
                      <span className="text-neutral-400 text-[7px] uppercase block leading-none">Authorization Reason</span>
                      <p className="italic text-[8.5px] font-medium leading-normal text-neutral-700 line-clamp-2">{previewPermission.permission.reason || 'Authorized Outpass Outward'}</p>
                    </div>

                    {/* Approved By & Footer info */}
                    <div className="flex justify-between items-end mt-1 pt-1 w-full">
                      <div>
                        <span className="text-neutral-400 text-[7px] uppercase block leading-none">Granted By</span>
                        <span className="font-black text-[8px] uppercase text-neutral-850 block">{getAuthorizedByName(previewPermission.permission.grantedBy)}</span>
                      </div>
                      <div className="text-[7.5px] font-bold text-neutral-500 uppercase tracking-tight text-right leading-none">
                        * THANK YOU ST. ANTONY'S SCHOOL *
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Configure, Print, Close */}
              <div className="flex flex-col gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    window.focus();
                    window.print();
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[11px] uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-indigo-100 shrink-0" />
                  Give Command to Printer
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPrinterHint(true);
                      setPreviewPermission(null);
                    }}
                    className="py-2.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border border-neutral-600 text-center cursor-pointer"
                  >
                    Setup Guide
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPermission(null)}
                    className="py-2.5 bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-neutral-200 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all text-center cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Printer Setup Instructions Modal */}
      {showPrinterHint && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-100 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-500" />
                Periperi 3" Printer Guide
              </h3>
              <button 
                onClick={() => setShowPrinterHint(false)}
                className="p-1.5 hover:bg-neutral-100 rounded-full transition-colors text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 text-xs text-neutral-600 font-sans leading-relaxed">
              <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 text-indigo-800 font-medium">
                This school ERP web application generates raw ESC/POS-compatible 3-inch thermal permission slips (80mm width) directly from your screen layout. Follow the device instructions below.
              </div>

              <div className="space-y-2">
                <p className="font-bold text-indigo-600 uppercase tracking-wider text-[10px]">📱 Mobile & iPad / iOS Integration</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Turn on Bluetooth/Wi-Fi:</strong> Ensure your Periperi thermal printer is switched on and connected to your device.</li>
                  <li><strong>Recommended App (Android):</strong> Install the free <em>Escrow ESC/POS Print Service</em> or <em>RawBT</em> app to bridge Chrome print commands directly to Bluetooth.</li>
                  <li><strong>Recommended App (iOS / iPad):</strong> Use <em>Print n Share</em> or standard AirPrint thermal adapters.</li>
                  <li>Select active paper size as <strong>80mm x Receipt</strong> or <strong>3 inch</strong> width inside the print dialog.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-emerald-600 uppercase tracking-wider text-[10px]">💻 Desktop (Windows / macOS) Integration</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Install the manufacturer thermal printer driver (XP-80, POS-80, or Periperi driver).</li>
                  <li>Open the web system, select <strong>"Print"</strong>, and choose your thermal printer from the destination list.</li>
                  <li>Under <strong>More Settings</strong>:
                    <ul className="list-circle pl-4 mt-1 space-y-1">
                      <li>Set <strong>Paper Size</strong> to <strong>80mm * 297mm</strong> (or 3-inch standard roll).</li>
                      <li>Set <strong>Margins</strong> to <strong>None</strong> or <strong>Minimal</strong>.</li>
                      <li>Uncheck <strong>Headers and Footers</strong> to prevent web links from printing.</li>
                    </ul>
                  </li>
                </ul>
              </div>
            </div>

            <button 
              onClick={() => setShowPrinterHint(false)}
              className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all cursor-pointer"
            >
              I understand
            </button>
          </div>
        </div>
      )}

      {/* 2-inch, 3-inch, and A5 Student Permission Slip Printer Stylesheet & Container */}
      <style>{`
        @media screen {
          .thermal-print-container {
            display: none !important;
          }
        }
        @media print {
          /* Hide absolute everything on the screen first */
          body * {
            visibility: hidden !important;
          }
          /* Make only the thermal print container and all its descendents visible */
          .thermal-print-container,
          .thermal-print-container * {
            visibility: visible !important;
          }
          /* Position absolutely at top-left with zero margins to fit receipt paper perfectly */
          .thermal-print-container {
            display: flex !important;
            flex-direction: column !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            background: white !important;
            color: black !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            transform-origin: top left !important;
            
            ${printPaperSize === '2in' ? `
              width: 1.9in !important;
              max-width: 1.9in !important;
              padding: 2px !important;
              font-family: 'Courier New', Courier, monospace !important;
              font-size: 8.5px !important;
              line-height: 1.2 !important;
            ` : ''}
            
            ${printPaperSize === '3in' ? `
              width: 76.2mm !important;
              max-width: 76.2mm !important;
              height: 80mm !important;
              max-height: 80mm !important;
              padding: 3mm 4mm !important;
              font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important;
              font-size: 10.5px !important;
              line-height: 1.35 !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
            ` : ''}

            ${printPaperSize === 'a5' ? `
              width: 138mm !important;
              max-width: 138mm !important;
              min-height: 195mm !important;
              padding: 10mm !important;
              font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important;
              font-size: 13px !important;
              line-height: 1.5 !important;
              border: 1px solid #000000;
              border-radius: 8px;
            ` : ''}
          }
          
          @page {
            ${printPaperSize === '2in' ? `
              size: 58mm auto;
              margin: 0;
            ` : ''}
            ${printPaperSize === '3in' ? `
              size: 76.2mm 80mm;
              margin: 0;
            ` : ''}
            ${printPaperSize === 'a5' ? `
              size: A5 portrait;
              margin: 4mm;
            ` : ''}
          }

          /* Ensure images and borders print properly */
          img {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .border-dashed {
            border-style: dashed !important;
          }
        }
      `}</style>

      {/* Actual Raw Thermal Print Output Container (Only visible during print mode) */}
      {(printingPermission || previewPermission) && (() => {
        const currentPrint = printingPermission || previewPermission;
        if (!currentPrint) return null;
        return (
          <div className="thermal-print-container">
            {/* School Header & Card container styled to match preview exactly */}
            <div className="flex flex-col justify-between h-full w-full bg-white text-black text-left font-sans select-none">
              
              {/* Header */}
              <div className="flex items-center gap-2 mb-1 w-full text-left">
                {settings.logoUrl && (
                  <img 
                    src={settings.logoUrl} 
                    className={`object-contain shrink-0 ${
                      printPaperSize === '2in' ? 'w-6 h-6' : printPaperSize === '3in' ? 'w-8 h-8' : 'w-14 h-14'
                    }`} 
                    alt="Logo" 
                    referrerPolicy="no-referrer" 
                  />
                )}
                <div className="flex flex-col justify-center min-w-0">
                  <p className={`font-sans font-black uppercase tracking-tight text-neutral-900 leading-none ${
                    printPaperSize === '2in' ? 'text-[8.5px]' : printPaperSize === '3in' ? 'text-[10px]' : 'text-lg'
                  }`}>
                    {settings.schoolName || "St. Antony's School"}
                  </p>
                  <p className={`font-sans font-black uppercase tracking-wider text-indigo-600 leading-none mt-1 ${
                    printPaperSize === '2in' ? 'text-[6.5px]' : printPaperSize === '3in' ? 'text-[7.5px]' : 'text-[11px]'
                  }`}>
                    HOSTEL PASS
                  </p>
                </div>
              </div>

              {/* Date/Time Row */}
              <div className={`flex justify-between text-neutral-500 pb-1 mb-1 border-neutral-200 ${
                printPaperSize === '2in' ? 'text-[7px]' : printPaperSize === '3in' ? 'text-[8px]' : 'text-sm'
              }`}>
                <span>DATE: {currentPrint.permission.date}</span>
                <span className="font-bold">TIME: {currentPrint.permission.time}</span>
              </div>

              {/* Body Info with Photo */}
              <div className="flex gap-2 items-start justify-between flex-1 min-h-0 w-full">
                <div className={`flex-1 min-w-0 ${
                  printPaperSize === '2in' ? 'space-y-0.5' : printPaperSize === '3in' ? 'space-y-1' : 'space-y-3'
                }`}>
                  <div>
                    <span className="text-neutral-400 uppercase block leading-none" style={{ fontSize: printPaperSize === '3in' ? '7px' : '9px' }}>Student Name</span>
                    <span className={`font-sans font-black uppercase block leading-tight text-neutral-900 truncate ${
                      printPaperSize === '2in' ? 'text-[9px]' : printPaperSize === '3in' ? 'text-[10.5px]' : 'text-xl'
                    }`}>{currentPrint.student.name}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 uppercase block leading-none" style={{ fontSize: printPaperSize === '3in' ? '7px' : '9px' }}>Father Name</span>
                    <span className={`font-sans font-bold uppercase block text-neutral-800 truncate ${
                      printPaperSize === '2in' ? 'text-[8px]' : printPaperSize === '3in' ? 'text-[8.5px]' : 'text-sm'
                    }`}>{currentPrint?.student?.fatherName || currentPrint?.student?.motherName || 'N/A'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 w-full">
                    <div>
                      <span className="text-neutral-400 uppercase block leading-none" style={{ fontSize: printPaperSize === '3in' ? '7px' : '9px' }}>Class &amp; Sect</span>
                      <span className={`font-bold block text-neutral-700 truncate ${
                        printPaperSize === '2in' ? 'text-[8px]' : printPaperSize === '3in' ? 'text-[8.5px]' : 'text-sm'
                      }`}>
                        {classes.find((c: any) => c.id === currentPrint?.student?.classId)?.name || 'N/A'} - {batches.find((b: any) => b.id === currentPrint?.student?.batchId)?.name || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 uppercase block leading-none" style={{ fontSize: printPaperSize === '3in' ? '7px' : '9px' }}>Roll / Adm ID</span>
                      <span className={`block text-neutral-600 font-bold truncate ${
                        printPaperSize === '2in' ? 'text-[7.5px]' : printPaperSize === '3in' ? 'text-[8px]' : 'text-sm'
                      }`}>
                        R: {currentPrint?.student?.rollNumber || 'N/A'} / A: {currentPrint?.student?.admissionNumber || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Photo */}
                <div className="shrink-0">
                  {(currentPrint?.student?.presentPhotoURL || currentPrint?.student?.photoURL || currentPrint?.student?.photoUrl) ? (
                    <img 
                      src={currentPrint?.student?.presentPhotoURL || currentPrint?.student?.photoURL || currentPrint?.student?.photoUrl} 
                      alt={currentPrint?.student?.name} 
                      className={`object-cover rounded border border-neutral-300 shrink-0 ${
                        printPaperSize === '2in' ? 'w-8 h-10' : printPaperSize === '3in' ? 'w-10 h-12' : 'w-24 h-28'
                      }`}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={`bg-neutral-100 border border-dashed border-neutral-300 rounded flex flex-col items-center justify-center text-neutral-400 font-bold uppercase text-center leading-none select-none shrink-0 ${
                      printPaperSize === '2in' ? 'w-8 h-10 text-[6px]' : printPaperSize === '3in' ? 'w-10 h-12 text-[7px]' : 'w-24 h-28 text-xs'
                    }`}>
                      <span>No</span>
                      <span>Photo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="mt-1 pt-1 w-full">
                <span className="text-neutral-400 uppercase block leading-none" style={{ fontSize: printPaperSize === '3in' ? '7px' : '9px' }}>Authorization Reason</span>
                <p className={`italic font-medium leading-normal text-neutral-700 ${
                  printPaperSize === '2in' ? 'text-[8px] line-clamp-1' : printPaperSize === '3in' ? 'text-[8.5px] line-clamp-2' : 'text-sm mt-1'
                }`}>{currentPrint.permission.reason || 'Authorized Outpass Outward'}</p>
              </div>

              {/* Approved By & Footer info */}
              <div className="flex justify-between items-end mt-1 pt-1 w-full">
                <div>
                  <span className="text-neutral-400 uppercase block leading-none" style={{ fontSize: printPaperSize === '3in' ? '7px' : '9px' }}>Granted By</span>
                  <span className={`font-black uppercase text-neutral-850 block ${
                    printPaperSize === '2in' ? 'text-[7.5px]' : printPaperSize === '3in' ? 'text-[8px]' : 'text-xs'
                  }`}>{getAuthorizedByName(currentPrint.permission.grantedBy)}</span>
                </div>
                <div className={`font-black text-neutral-500 uppercase tracking-tight text-right leading-none ${
                  printPaperSize === '2in' ? 'text-[6.5px]' : printPaperSize === '3in' ? 'text-[7.5px]' : 'text-xs'
                }`}>
                  * THANK YOU ST. ANTONY'S SCHOOL *
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

function HostelAttendance({ students, classes, batches }: any) {
  const [showKiosk, setShowKiosk] = useState(false);
  const [recentScans, setRecentScans] = useState<any[]>([]);

  const handleFacialAttendance = async (person: any) => {
    setShowKiosk(false);
    toast.success(`Hostel attendance marked successfully for ${person.name}`);
    
    const cls = classes.find((c: any) => c.id === person.classId)?.name || 'Class';
    const batch = batches.find((b: any) => b.id === person.batchId)?.name || '';

    setRecentScans(prev => [{
      id: Date.now(),
      name: person.name,
      class: `${cls} ${batch}`,
      time: new Date().toLocaleTimeString(),
      status: 'Present'
    }, ...prev]);
  };

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {showKiosk && (
          <SmartKioskModal
            isOpen={showKiosk}
            onClose={() => setShowKiosk(false)}
            people={students}
            mode="staff_attendance" // using this mode to just trigger simple success without creating outing
            onIdentifySuccess={handleFacialAttendance}
          />
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
        <div className="flex items-center gap-4">
          <ShieldCheck className="w-12 h-12 text-primary" />
          <div>
            <h3 className="text-2xl font-bold text-neutral-800">Daily Hostel Attendance</h3>
            <p className="text-neutral-500">Take roll call quickly via facial recognition.</p>
          </div>
        </div>
        <button 
          onClick={() => setShowKiosk(true)}
          className="px-6 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center gap-3 text-lg"
        >
          <Camera className="w-6 h-6" /> Kiosk Roll Call
        </button>
      </div>

      {recentScans.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100">
            <h4 className="font-bold text-neutral-800">Recent Roll Call (Today)</h4>
          </div>
          <table className="w-full text-left font-mono text-base text-neutral-600">
            <thead className="bg-neutral-50 font-bold">
              <tr>
                <th className="py-2 px-4">Time</th>
                <th className="py-2 px-4">Student</th>
                <th className="py-2 px-4">Class</th>
                <th className="py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentScans.map(scan => (
                <tr key={scan.id} className="border-t border-neutral-100">
                  <td className="py-2 px-4">{scan.time}</td>
                  <td className="py-2 px-4 font-bold text-neutral-900">{scan.name}</td>
                  <td className="py-2 px-4">{scan.class}</td>
                  <td className="py-2 px-4 text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {scan.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HostelMess() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hostel_mess_manage');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [menu, setMenu] = useState<Record<string, { breakfast: string, lunch: string, snacks: string, dinner: string }>>({
    Monday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Tuesday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Wednesday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Thursday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Friday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Saturday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Sunday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const data = await dbService.get('hostel_mess', 'weekly_menu');
        if (data && data.menu) {
          setMenu(data.menu);
        }
      } catch (error) {
        console.error("Failed to load mess menu", error);
      } finally {
        setLoading(false);
      }
    };
    loadMenu();
  }, []);

  const handleSave = async () => {
    try {
      setLoading(true);
      // Using dbService.set which internally uses setDoc with { merge: true }
      // This handles both initial creation and subsequent updates for antony-database1
      await dbService.set('hostel_mess', 'weekly_menu', { 
        menu, 
        updatedAt: new Date().toISOString() 
      });
      toast.success("Hostel mess menu updated successfully");
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save menu", error);
      toast.error("Failed to save menu");
    } finally {
      setLoading(false);
    }
  };

  const handleMenuChange = (day: string, meal: string, value: string) => {
    setMenu(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [meal]: value
      }
    }));
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-neutral-100 rounded-2xl w-full"></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
        <div className="flex items-center gap-4">
          <Utensils className="w-12 h-12 text-primary" />
          <div>
            <h3 className="text-2xl font-bold text-neutral-800">Mess Timetable & Menu</h3>
            <p className="text-neutral-500">Manage daily breakfast, lunch, snacks, and dinner menus.</p>
          </div>
        </div>
        
        {canManage && (
          <div className="flex items-center gap-3">
             {isEditing ? (
               <>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border border-neutral-200 text-neutral-600 bg-white font-bold rounded-xl hover:bg-neutral-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    className="px-6 py-2 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                  >
                    Save Changes
                  </button>
               </>
             ) : (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2 bg-primary text-white font-black rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  Edit Menu
                </button>
             )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left font-mono text-base min-w-[800px]">
          <thead className="bg-neutral-50 font-bold text-neutral-500 uppercase tracking-widest text-sm border-b border-neutral-100">
            <tr>
              <th className="py-4 px-6 w-32">Day</th>
              <th className="py-4 px-4 w-1/4">Breakfast</th>
              <th className="py-4 px-4 w-1/4">Lunch</th>
              <th className="py-4 px-4 w-1/4">Snacks</th>
              <th className="py-4 px-4 w-1/4">Dinner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {days.map(day => (
              <tr key={day} className="hover:bg-neutral-50/50 transition-colors">
                <td className="py-4 px-6 font-bold text-neutral-800">{day}</td>
                {meals.map((meal) => (
                  <td key={meal} className="py-4 px-4">
                    {isEditing ? (
                      <textarea
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-primary resize-none text-base bg-neutral-50 focus:bg-white transition-colors"
                        value={menu[day]?.[meal as keyof typeof menu[string]] || ''}
                        onChange={(e) => handleMenuChange(day, meal, e.target.value)}
                        placeholder={`Enter ${meal}...`}
                        rows={3}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-neutral-600">
                        {menu[day]?.[meal as keyof typeof menu[string]] || <span className="text-neutral-300 italic">Not specified</span>}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HostelBlocks({ blocks, students }: any) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hostel_manage') || hasPermission('hostel_blocks_manage');
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [newBlock, setNewBlock] = useState({ name: '', capacity: 0, description: '' });

  const getOccupiedCount = (blockName: string) => {
    return students.filter((s: any) => s.hostelName === blockName && s.feeType?.toLowerCase() === 'hostel' && (s.status?.toLowerCase() === 'active' || !s.status)).length;
  };

  const handleSaveBlock = async () => {
    if (!newBlock.name || newBlock.capacity <= 0) {
      toast.error("Please provide block name and capacity");
      return;
    }

    try {
      if (editingBlock) {
        await dbService.update('hostel_blocks', editingBlock.id, {
          ...newBlock,
          updatedAt: new Date().toISOString()
        });
        toast.success("Block updated successfully");
      } else {
        await dbService.add('hostel_blocks', {
          ...newBlock,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        toast.success("Block created successfully");
      }
      setIsAddingBlock(false);
      setEditingBlock(null);
      setNewBlock({ name: '', capacity: 0, description: '' });
    } catch (error) {
      console.error("Error saving block:", error);
      toast.error("Failed to save block");
    }
  };

  const handleDeleteBlock = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this block?")) {
      try {
        await dbService.delete('hostel_blocks', id);
        toast.success("Block deleted successfully");
      } catch (error) {
        console.error("Error deleting block:", error);
        toast.error("Failed to delete block");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-neutral-800">Hostel Blocks & Capacity</h2>
          <p className="text-base text-neutral-500">Define hostel buildings and their total bed capacities.</p>
        </div>
        {canManage && (
          <button 
            onClick={() => {
              setEditingBlock(null);
              setNewBlock({ name: '', capacity: 0, description: '' });
              setIsAddingBlock(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            Add New Block
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {blocks.map((block: any) => (
          <div key={block.id} className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Building className="w-6 h-6 text-blue-600" />
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      setEditingBlock(block);
                      setNewBlock({ name: block.name, capacity: block.capacity, description: block.description || '' });
                      setIsAddingBlock(true);
                    }}
                    className="p-2 text-neutral-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteBlock(block.id)}
                    className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
            <h3 className="text-2xl font-black text-neutral-900">{block.name}</h3>
            <div className="flex flex-col gap-1 mt-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-neutral-400" />
                <span className="text-lg font-bold text-neutral-600">
                  {getOccupiedCount(block.name)} / {block.capacity} Beds Occupied
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden mt-1">
                <div 
                  className={`h-full transition-all duration-500 ${
                    getOccupiedCount(block.name) >= block.capacity ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (getOccupiedCount(block.name) / block.capacity) * 100)}%` }}
                />
              </div>
            </div>
            {block.description && (
              <p className="text-neutral-500 mt-3 text-base leading-relaxed">{block.description}</p>
            )}
          </div>
        ))}
        {blocks.length === 0 && (
          <div className="md:col-span-3 bg-neutral-50/50 border-2 border-dashed border-neutral-200 rounded-3xl p-12 text-center">
            <Building className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-500">No hostel blocks created yet</h3>
            <p className="text-neutral-400 mt-1">Start by adding a new block to manage your hostel capacity.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAddingBlock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-2xl font-bold mb-6">{editingBlock ? 'Edit' : 'Create'} Hostel Block</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Block Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. A-Block, Girls Hostel"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                    value={newBlock.name}
                    onChange={(e) => setNewBlock({...newBlock, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Total Bed Capacity</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 50"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary font-bold"
                    value={newBlock.capacity || ''}
                    onChange={(e) => setNewBlock({...newBlock, capacity: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Description (Optional)</label>
                  <textarea 
                    placeholder="Brief details about the block..."
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary resize-none"
                    rows={3}
                    value={newBlock.description}
                    onChange={(e) => setNewBlock({...newBlock, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-8">
                <button 
                  onClick={() => setIsAddingBlock(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-neutral-600 hover:bg-neutral-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveBlock}
                  className="px-6 py-2.5 rounded-xl font-bold bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20 transition-colors"
                >
                  {editingBlock ? 'Update' : 'Save'} Block
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Used for basic iconography in the UI
function BusIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}
