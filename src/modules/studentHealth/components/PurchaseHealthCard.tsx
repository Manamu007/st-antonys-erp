import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CreditCard, Search, UserCheck, ShieldAlert, CheckCircle2, ChevronRight, HelpCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { dbService } from '../../../services/dbService';

interface PurchaseHealthCardProps {
  userId: string;
  role: string;
  schoolId: string;
}

interface StudentSearchResult {
  studentId: string;
  studentName: string;
  className: string;
  batchName: string;
  admissionNumber?: string;
  studentType: "HOSTELER" | "DAY_SCHOLAR";
  fatherName?: string;
  phone?: string;
}

export default function PurchaseHealthCard({ userId, role, schoolId }: PurchaseHealthCardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);

  // Purchase Form fields
  const [amount, setAmount] = useState('2000');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  // Hostel Information fields
  const [hostelName, setHostelName] = useState('');
  const [hostelRoom, setHostelRoom] = useState('');
  const [hostelBed, setHostelBed] = useState('');

  const [blocks, setBlocks] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  const [saving, setSaving] = useState(false);
  const [purchasedAccount, setPurchasedAccount] = useState<any | null>(null);

  // Load real-time blocks & students
  useEffect(() => {
    const unsubBlocks = dbService.subscribe('hostel_blocks', [], (data) => {
      setBlocks(data);
      if (data.length > 0 && !hostelName) {
        setHostelName(data[0].name);
      }
    });
    const unsubStudents = dbService.subscribe('students', [], (data) => {
      const relevant = data.filter((s: any) => s.feeType?.toLowerCase() === 'hostel');
      setStudents(relevant);
    });

    return () => {
      unsubBlocks();
      unsubStudents();
    };
  }, [hostelName]);

  // Fetch results when search typing
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
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
          // Filter matching structure mapping
          const matches = (data.matches || []).map((m: any) => ({
            studentId: m.studentId,
            studentName: m.studentName,
            className: m.className,
            batchName: m.batchName,
            admissionNumber: m.admissionNumber || '',
            studentType: m.studentType === 'HOSTELER' ? 'HOSTELER' : 'DAY_SCHOLAR',
            fatherName: m.fatherName || '',
            phone: m.phone || ''
          }));
          setSearchResults(matches);
        }
      } catch (err) {
        console.error("Fuzzy student search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery, userId, role, schoolId]);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      toast.error("Please search and select a student first.");
      return;
    }

    setSaving(true);
    const toastId = toast.loading(`Processing payment of ₹2,000 and allocating to Hostel...`);

    try {
      const res = await fetch('/api/student-health/accounts/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({
          studentId: selectedStudent.studentId,
          amount: 2000,
          paymentMode,
          referenceNumber,
          hostelName: 'St. Antony Hostel',
          hostelRoom: 'Unassigned',
          hostelBed: 'Unassigned',
          remarks
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Purchase processing collapsed.");
      }

      const responseData = await res.json();
      toast.success(responseData.message || "Health Card Purchased and Cadet admitted to Hostel!", { id: toastId });
      setPurchasedAccount(responseData.account);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to finalize card purchase.", { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedStudent(null);
    setSearchQuery('');
    setSearchResults([]);
    setAmount('2000');
    setPaymentMode('UPI');
    setReferenceNumber('');
    setRemarks('');
    setPurchasedAccount(null);
  };

  return (
    <div className="space-y-8" id="purchase-health-card-block">
      {/* Overview Greeting */}
      <div className="bg-gradient-to-br from-indigo-550 to-rose-500 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden" id="purchase-intro-hero card">
        <div className="absolute inset-x-0 bottom-0 top-0 bg-neutral-900/10 backdrop-blur-[1px] pointer-events-none" />
        <div className="relative z-10 space-y-3 max-w-2xl">
          <span className="text-[10px] bg-white/20 border border-white/20 text-white font-black uppercase tracking-widest px-3.5 py-1 rounded-full inline-block">
            Automatic Integration Engine
          </span>
          <h2 className="text-3xl font-black tracking-tight font-sans">Hosteler Health Card Purchase</h2>
          <p className="text-sm font-semibold text-white/90 leading-relaxed">
            Acquire a standard school-subsidized medical health card for your student. The system automatically shifts the student's enrollment status to <strong>Hostel Resident</strong> and registers them in their designated hostel room immediately.
          </p>
        </div>
        <div className="absolute right-8 top-12 opacity-10 pointer-events-none hidden md:block">
          <CreditCard className="w-56 h-56" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {purchasedAccount ? (
          /* Transition Success Card */
          <motion.div
            key="success-card"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white border border-zinc-150 rounded-[2.5rem] p-12 text-center shadow-sm max-w-2xl mx-auto space-y-6"
            id="purchase-success-view"
          >
            <div className="w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-500">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-zinc-800 tracking-tight">Purchase Successful!</h3>
              <p className="text-sm text-zinc-500 font-semibold max-w-md mx-auto">
                The health benefit account has been provisioned and the student is fully registered as an active Hostel Resident.
              </p>
            </div>

            <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-100 text-left space-y-4 max-w-md mx-auto">
              <div className="flex justify-between text-xs font-bold border-b border-zinc-200 pb-3">
                <span className="text-zinc-400 uppercase">Student Particulars</span>
                <span className="text-zinc-800">{selectedStudent?.studentName}</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-b border-zinc-200 pb-3">
                <span className="text-zinc-400 uppercase">Class & Roll</span>
                <span className="text-zinc-800">{selectedStudent?.className} ({selectedStudent?.batchName})</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-b border-zinc-200 pb-3">
                <span className="text-zinc-400 uppercase">Enrollment Shift</span>
                <span className="text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md text-[10px] tracking-wide uppercase font-black">
                  HOSTEL RESIDENT
                </span>
              </div>
              <div className="flex justify-between text-xs font-bold border-b border-zinc-200 pb-3">
                <span className="text-zinc-400 uppercase">Allocated Bed</span>
                <span className="text-zinc-800">{hostelName} / {hostelRoom} ({hostelBed})</span>
              </div>
              <div className="flex justify-between text-xs font-bold pb-1">
                <span className="text-zinc-400 uppercase">Opening Card Reserves</span>
                <span className="text-emerald-500 font-black text-sm">₹{purchasedAccount.currentBalance || amount}</span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-8 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-rose-250 transition-all inline-flex items-center gap-2"
              id="purchase-reset-button"
            >
              <span>Purchase Another benefit Card</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        ) : (
          /* Purchasing flow */
          <motion.div
            key="purchase-flow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Student Search Panel - Column 1 */}
            <div className="lg:col-span-1 bg-white border border-zinc-150 rounded-[2.5rem] p-8 shadow-sm space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-rose-500" />
                  1. Identify Student
                </h3>
                <p className="text-xs text-zinc-400 font-semibold">Select the student purchasing the health card.</p>
              </div>

              {/* Autocomplete Input */}
              <div className="space-y-4 relative">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by student name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={saving}
                    className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-150 rounded-2xl pl-11 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-rose-400 text-zinc-700"
                    id="purchase-student-search-input"
                  />
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />

                  {/* Dropdown Suggestions - Absolute Overlay */}
                  {searchQuery.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 mt-1.5 bg-white border border-zinc-200 shadow-xl rounded-2xl max-h-60 overflow-y-auto scrollbar-thin divide-y divide-zinc-50 z-50">
                      {searching ? (
                        <p className="p-4 text-center text-xs text-zinc-400 font-semibold animate-pulse">Running lookup indexes...</p>
                      ) : searchResults.length === 0 ? (
                        <p className="p-4 text-center text-xs text-zinc-400 font-semibold">No high-confidence student found.</p>
                      ) : (
                        searchResults.map((match) => (
                          <button
                            key={match.studentId}
                            type="button"
                            onClick={() => {
                              setSelectedStudent(match);
                              setSearchQuery('');
                            }}
                            className="w-full text-left p-4 hover:bg-zinc-50 cursor-pointer text-xs flex justify-between items-center transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                          >
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-zinc-800 block text-xs">{match.studentName}</span>
                              <span className="text-[10px] text-zinc-400 block font-semibold">Class: {match.className} - {match.batchName}</span>
                              <span className="text-[9px] text-zinc-300 block font-normal font-mono">ID: {match.studentId}</span>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-1">
                              <span className={`inline-block text-[8px] px-2 py-0.5 rounded-full font-black tracking-wider uppercase ${match.studentType === 'HOSTELER' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {match.studentType === 'HOSTELER' ? 'Hosteler' : 'Day Scholar'}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Student Profile Summary */}
              {selectedStudent ? (
                <motion.div
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-rose-50/40 border border-rose-100 rounded-2xl p-6 space-y-4"
                  id="selected-student-profile-info"
                >
                  <div className="border-b border-rose-100 pb-3">
                    <span className="text-[10px] font-black uppercase text-rose-400 block tracking-widest">Active Selector</span>
                    <h4 className="text-sm font-black text-zinc-800 mt-1">{selectedStudent.studentName}</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 text-xs">
                    <div>
                      <span className="text-zinc-400 font-bold block">Class/Track</span>
                      <span className="text-zinc-700 font-extrabold">{selectedStudent.className} ({selectedStudent.batchName})</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-bold block">Admission No</span>
                      <span className="text-zinc-700 font-extrabold">{selectedStudent.admissionNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-bold block">Father's Name</span>
                      <span className="text-zinc-700 font-extrabold">{selectedStudent.fatherName || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-bold block">Parent Phone</span>
                      <span className="text-zinc-700 font-extrabold">{selectedStudent.phone || 'N/A'}</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-rose-100/50">
                      <span className="text-zinc-400 font-bold block">Residency Type</span>
                      <span className={`inline-block mt-1 text-[9px] px-2.5 py-0.5 rounded-full font-black tracking-wider uppercase ${selectedStudent.studentType === 'HOSTELER' ? 'bg-amber-100 text-amber-700' : 'bg-red-50 text-red-650 border border-red-100'}`}>
                        {selectedStudent.studentType === 'HOSTELER' ? 'Already Hosteler' : 'Day Schooler (Auto-Shifts)'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="border border-dashed border-zinc-200 rounded-2xl py-12 px-6 text-center text-zinc-400">
                  <HelpCircle className="w-8 h-8 mx-auto text-zinc-300 mb-3" />
                  <p className="text-xs font-bold">Please select a student from lookup searches above to initiate the purchase process.</p>
                </div>
              )}
            </div>

            {/* Form & Config Panel - Columns 2 & 3 */}
            <form onSubmit={handlePurchase} className="lg:col-span-2 space-y-8">
              {/* Card Purchase details */}
              <div className="bg-white border border-zinc-150 rounded-[2.5rem] p-8 shadow-sm space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-rose-500" />
                    2. Card Purchase Particulars
                  </h3>
                  <p className="text-xs text-zinc-400 font-semibold">Verify the card setup, balance price, and accounting ledger payment mode.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Card price / Fee Amount</label>
                    <div className="bg-rose-50 border border-rose-150 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black text-rose-950 uppercase tracking-wide block">Standard Health Card Price</span>
                        <span className="text-[10px] font-bold text-rose-500 block">Hostel Admission Fee included</span>
                      </div>
                      <span className="text-sm font-black text-rose-700 bg-white border border-rose-100 rounded-lg px-3 py-1 font-mono">₹2,000</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Payment Mode</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      disabled={saving}
                      className="w-full text-sm font-bold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-1 focus:ring-rose-400 text-zinc-700 font-sans"
                      id="purchase-payment-mode-select"
                    >
                      <option value="UPI">UPI / QR Code Transfer</option>
                      <option value="CASH">Cash Payment</option>
                      <option value="BANK_TRANSFER">Bank Direct Transfer</option>
                      <option value="NET_BANKING">Net Banking</option>
                      <option value="CARD">Credit/Debit Card Terminal</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Transaction Reference ID (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. UPI Ref, Bank reference block..."
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      disabled={saving}
                      className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-rose-400 text-zinc-700"
                      id="purchase-reference-number-input"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">General Purchase remarks (Optional)</label>
                    <textarea
                      placeholder="Enter additional records for the financial audit trail..."
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      disabled={saving}
                      rows={2}
                      className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-rose-400 text-zinc-700"
                      id="purchase-remarks-textarea"
                    />
                  </div>
                </div>

                {/* Info Note */}
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-700 font-semibold space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5 uppercase text-[9px] tracking-widest text-amber-800">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block animate-pulse" />
                    Automatic Hostel Admission Action
                  </p>
                  <p>On successful transaction: The student's fee structure will automatically reset to Hostel Resident. This enables the school bookkeeper to issue hostel term records immediately under Student Fees.</p>
                </div>
              </div>

              {/* Submit panel */}
              <div className="text-right">
                <button
                  type="submit"
                  disabled={saving || !selectedStudent}
                  className="px-8 py-4 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-rose-200 transition-all inline-flex items-center gap-2"
                  id="submit-purchase-button"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Writing allocations...</span>
                    </>
                  ) : (
                    <>
                      <span>💳 Pay Health Card Fee & Admit to Hostel</span>
                      <ArrowRight className="w-4.5 h-4.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
