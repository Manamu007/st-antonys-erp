import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Heart, CreditCard, Clock, FileText, TrendingUp, AlertCircle, Sparkles, Search, User, ShieldAlert, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface DashboardOverviewProps {
  userId: string;
  role: string;
  schoolId: string;
  hospitalId: string;
}

export default function DashboardOverview({ userId, role, schoolId, hospitalId }: DashboardOverviewProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recentBills, setRecentBills] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/student-health/dashboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-user-role': role,
            'x-school-id': schoolId,
            'x-hospital-id': hospitalId
          }
        });
        if (!res.ok) throw new Error("Failed to load metrics");
        const data = await res.json();
        setStats(data.stats);

        // Also fetch recent bills for quick view
        const billsRes = await fetch('/api/student-health/bills', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-user-role': role,
            'x-school-id': schoolId,
            'x-hospital-id': hospitalId
          },
          body: JSON.stringify({ userId, role, schoolId, hospitalId })
        });
        if (billsRes.ok) {
          const billsData = await billsRes.json();
          setRecentBills(billsData.bills.slice(0, 5));
        }
      } catch (err) {
        console.error(err);
        toast.error("Could not fetch health overview metrics.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [userId, role, schoolId, hospitalId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm mt-4 font-medium">Syncing overview metrics...</p>
      </div>
    );
  }

  const cards = [
    {
      title: "Total Medical Invoices",
      value: stats?.totalBillsCount || 0,
      icon: FileText,
      color: "bg-blue-50 text-blue-600 border-blue-100",
      description: "Total invoice drafts processed"
    },
    {
      title: "Pending Reviews",
      value: stats?.pendingCount || 0,
      icon: Clock,
      color: "bg-amber-50 text-amber-600 border-amber-100",
      description: "Awaiting administrator validation"
    },
    {
      title: "Approved Claims Amount",
      value: `₹${stats?.totalApprovedAmount || 0}`,
      icon: TrendingUp,
      color: "bg-emerald-50 text-emerald-600 border-emerald-100",
      description: "Value of medical services approved"
    },
    {
      title: "Extra Medical Dues",
      value: `₹${stats?.totalExtraPayable || 0}`,
      icon: AlertCircle,
      color: "bg-rose-50 text-rose-600 border-rose-100",
      description: "Excess amount outstanding"
    }
  ];

  const adminCards = [
    {
      title: "Active Cards Count",
      value: stats?.enabledCardsCount || 0,
      icon: CreditCard,
      color: "bg-indigo-50 text-indigo-600 border-indigo-100",
      description: "Active student health cards"
    },
    {
      title: "Available Card Reserves",
      value: `₹${stats?.totalCardBalance || 0}`,
      icon: Heart,
      color: "bg-purple-50 text-purple-600 border-purple-100",
      description: "Aggregate balance in health ledger"
    }
  ];

  const showAdminStats = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'PRINCIPAL' || role === 'VICE_PRINCIPAL' || role === 'HOSTEL_WARDEN' || role === 'WARDEN' || role === 'ACCOUNTANT';

  return (
    <div className="space-y-8" id="health-dashboard-overview-block">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((c, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`p-6 bg-white border rounded-[2rem] shadow-sm flex items-start gap-4 hover:shadow-md transition-all ${c.color}`}
          >
            <div className="p-3 rounded-2xl bg-white shadow-sm">
              <c.icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 mb-1">{c.title}</p>
              <h3 className="text-2xl font-black text-zinc-800 tracking-tight">{c.value}</h3>
              <p className="text-[11px] font-semibold text-zinc-400 mt-1">{c.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {showAdminStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {adminCards.map((c, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + idx * 0.05 }}
              className={`p-6 bg-white border rounded-[2.5rem] shadow-sm flex items-center gap-5 hover:shadow-md transition-all ${c.color}`}
            >
              <div className="p-4 rounded-[1.5rem] bg-white shadow-sm shrink-0">
                <c.icon className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 mb-1">{c.title}</p>
                <h3 className="text-3xl font-black text-zinc-800 tracking-tight">{c.value}</h3>
                <p className="text-xs font-semibold text-zinc-400 mt-1">{c.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Doctor-specific medical search & clinical overview info */}
      {role === 'DOCTOR' && (
        <MedicalLookupPanel userId={userId} role={role} schoolId={schoolId} hospitalId={hospitalId} />
      )}

      {/* Recent Activity Section */}
      <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
        <h3 className="text-lg font-black text-zinc-800 uppercase tracking-wider mb-6 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" />
          Recent Invoices Stream
        </h3>

        {recentBills.length === 0 ? (
          <div className="text-center py-12 bg-zinc-50 border border-dashed border-zinc-100 rounded-3xl">
            <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 font-bold text-sm">No medical claims created recently.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {recentBills.map((b) => (
              <div key={b.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-3 h-3 rounded-full ${
                    b.status === 'APPROVED' ? 'bg-emerald-500' :
                    b.status === 'REJECTED' ? 'bg-rose-500' : 'bg-amber-500'
                  }`} />
                  <div>
                    <h4 className="font-extrabold text-zinc-800 text-sm truncate">{b.studentName} ({b.className})</h4>
                    <p className="text-xs font-semibold text-zinc-400 mt-0.5">{b.treatmentDescription} @ {b.hospitalName}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-black text-sm text-zinc-800">₹{b.totalAmount}</span>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-0.5">{b.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MedicalLookupPanel({ userId, role, schoolId, hospitalId }: DashboardOverviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentAccount, setStudentAccount] = useState<any>(null);
  const [medicalHistory, setMedicalHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch('/api/student-health/students/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({ query: searchQuery })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.matches || []);
        if (data.matches && data.matches.length > 0) {
          toast.success(`Found ${data.matches.length} matching students.`);
        } else {
          toast.info("No students found with that name.");
        }
      } else {
        throw new Error("Failed query");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to query student registry database.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectStudent = async (student: any) => {
    setSelectedStudent(student);
    setLoadingHistory(true);
    setStudentAccount(null);
    setMedicalHistory([]);
    try {
      // 1. Fetch Account/Ledger state
      const accRes = await fetch('/api/student-health/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({ studentId: student.id })
      });
      if (accRes.ok) {
        const accData = await accRes.json();
        const found = accData.accounts?.find((a: any) => a.studentId === student.id);
        setStudentAccount(found || null);
      }

      // 2. Fetch treatment reports
      const billsRes = await fetch('/api/student-health/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId,
          'x-hospital-id': hospitalId
        },
        body: JSON.stringify({ studentId: student.id })
      });
      if (billsRes.ok) {
        const billsData = await billsRes.json();
        setMedicalHistory(billsData.bills || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not compile complete clinical ledger history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="bg-white border border-zinc-150 rounded-[2.5rem] p-8 shadow-sm space-y-8" id="doctor-clinical-registry-module">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-100 pb-6">
        <div>
          <h3 className="text-lg font-black text-zinc-800 uppercase tracking-wider flex items-center gap-2">
            <User className="w-5 h-5 text-rose-500 animate-pulse" />
            Clinical Registry & Student Medical Lookup
          </h3>
          <p className="text-zinc-400 text-xs mt-1">Search student records, view active medical cards, and fetch diagnostic treatment logs.</p>
        </div>
        
        {/* Search input Form */}
        <form onSubmit={handleSearch} className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student name or class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-250 text-xs font-semibold rounded-2xl outline-none focus:bg-white focus:border-rose-300 focus:ring-4 focus:ring-rose-50 transition-all text-zinc-700 placeholder-zinc-400"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-md cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            {searching ? 'Searching...' : 'Lookup'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Search Results Column */}
        <div className="lg:col-span-4 border-r border-zinc-100 pr-0 lg:pr-8 space-y-4">
          <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Matched Records</h4>
          
          {searchResults.length === 0 ? (
            <div className="text-center py-12 bg-zinc-50 border border-dashed border-zinc-150 rounded-2xl">
              <Search className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-zinc-500 text-xs font-bold">Search registry to load matches</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
              {searchResults.map((student) => {
                const isSelected = selectedStudent?.id === student.id;
                return (
                  <button
                    key={student.id}
                    onClick={() => handleSelectStudent(student)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-1 ${
                      isSelected 
                        ? 'bg-rose-50/50 border-rose-200 shadow-sm' 
                        : 'bg-white border-zinc-200 hover:bg-zinc-50/50'
                    }`}
                  >
                    <span className="font-extrabold text-sm text-zinc-800">{student.name || student.studentName}</span>
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold w-full">
                      <span>Class {student.className} ({student.batchName || 'General'})</span>
                      <span className="text-[10px] uppercase font-bold text-rose-500">{student.studentType || 'Day Scholar'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Clinical Card Detail Column */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedStudent ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-zinc-50 border border-dashed border-zinc-150 rounded-[2.5rem]">
              <Heart className="w-12 h-12 text-zinc-300 mb-3 animate-pulse" />
              <h4 className="font-black text-zinc-700 uppercase tracking-wider text-sm mb-1">Student Card Vault</h4>
              <p className="text-zinc-400 text-xs font-semibold max-w-sm">Select a student from the clinical list on the left to verify active ledgers, check blood categories, and stream case profiles.</p>
            </div>
          ) : loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest animate-pulse">Assembling Clinical Portfolio Index...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Patient Core Summary Card */}
              <div className="bg-zinc-50 border border-zinc-150 rounded-[2rem] p-6 lg:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">Student Medical Portfolio</span>
                    <h3 className="text-xl font-black text-zinc-800 tracking-tight mt-2">{selectedStudent.name || selectedStudent.studentName}</h3>
                    <p className="text-xs text-zinc-400 font-semibold mt-1">Admission Index: <span className="font-bold text-zinc-700">{selectedStudent.admissionNumber || selectedStudent.id}</span></p>
                  </div>
                  
                  {studentAccount ? (
                    <div className="bg-white border border-zinc-200 rounded-2xl px-5 py-3 shadow-sm text-right shrink-0">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Health Card Balance</p>
                      <h4 className="text-xl font-black text-rose-500 mt-1">₹{studentAccount.currentBalance ?? 0}</h4>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mt-0.5">Status: <span className={studentAccount.status === 'ACTIVE' ? 'text-emerald-500' : 'text-rose-500'}>{studentAccount.status ?? 'INACTIVE'}</span></p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 flex items-center gap-2 max-w-xs text-amber-700 text-xs">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>No active health card ledger found for this student.</span>
                    </div>
                  )}
                </div>

                {/* Specific Health Metadata Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-zinc-200">
                  <div className="bg-white p-4 border border-zinc-150 rounded-2xl">
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Enrollment Class</p>
                    <p className="font-bold text-sm text-zinc-800 mt-1">{selectedStudent.className || 'N/A'}</p>
                  </div>
                  <div className="bg-white p-4 border border-zinc-150 rounded-2xl">
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Section/Batch</p>
                    <p className="font-bold text-sm text-zinc-800 mt-1">{selectedStudent.batchName || 'General'}</p>
                  </div>
                  <div className="bg-white p-4 border border-zinc-150 rounded-2xl">
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Student Category</p>
                    <p className="font-bold text-sm text-zinc-800 mt-1 uppercase">{selectedStudent.studentType || 'Day Scholar'}</p>
                  </div>
                  <div className="bg-white p-4 border border-zinc-150 rounded-2xl">
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Blood Type</p>
                    <p className="font-black text-sm text-rose-500 mt-1">{selectedStudent.bloodGroup || 'O+ (Pending)'}</p>
                  </div>
                </div>
              </div>

              {/* Historic Clinical Timeline */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500" />
                  Prescription & Diagnostic Case Timeline ({medicalHistory.length})
                </h4>

                {medicalHistory.length === 0 ? (
                  <div className="text-center py-10 bg-zinc-50 border border-zinc-150 rounded-2xl">
                    <p className="text-zinc-500 text-xs font-semibold">No historic clinic consults available for this student.</p>
                  </div>
                ) : (
                  <div className="relative border-l border-rose-100 pl-6 ml-3 space-y-6">
                    {medicalHistory.map((bill, index) => (
                      <div key={bill.id || index} className="relative">
                        {/* Bullet point on line */}
                        <div className="absolute -left-[30px] top-1.5 w-4 h-4 rounded-full bg-white border-4 border-rose-500 shadow-sm" />
                        
                        <div className="bg-white border border-zinc-150 rounded-2xl p-5 hover:border-zinc-250 transition-all shadow-sm">
                          <div className="flex justify-between items-start flex-wrap gap-2 mb-2">
                            <div>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{new Date(bill.billDate || bill.createdAt).toLocaleDateString()}</p>
                              <h5 className="font-extrabold text-sm text-zinc-800 mt-0.5">{bill.treatmentDescription || 'Consultation treatment'}</h5>
                              <p className="text-xs text-zinc-400 font-semibold mt-0.5">Diagnosed by: <span className="text-zinc-700 font-extrabold">{bill.doctorName || 'Senior Medical Officer'}</span> @ {bill.hospitalName}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-black text-xs px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 block">₹{bill.totalAmount}</span>
                              <span className="text-[9px] font-black uppercase tracking-widest block text-zinc-400 mt-1">{bill.status}</span>
                            </div>
                          </div>

                          {bill.medicines && bill.medicines.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-zinc-100">
                              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Prescribed Medicines</p>
                              <div className="flex flex-wrap gap-1.5">
                                {bill.medicines.map((med: any, i: number) => (
                                  <span key={i} className="text-[11px] font-bold text-zinc-600 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-200">
                                    {med.name} {med.quantity ? `(${med.quantity})` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
