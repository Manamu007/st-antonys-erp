import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, BookOpen, Check, X, Calendar, User, Eye, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { StudentHealthBill } from '../types/index.js';

interface AdminApprovalsProps {
  userId: string;
  role: string;
  schoolId: string;
}

export default function AdminApprovals({ userId, role, schoolId }: AdminApprovalsProps) {
  const [bills, setBills] = useState<StudentHealthBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<StudentHealthBill | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchPendingBills = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/student-health/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({ status: 'PENDING_ADMIN_REVIEW' })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBills(data.bills || []);
    } catch (err) {
      toast.error("Failed to fetch pending bills list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingBills();
  }, [userId, role, schoolId]);

  const handleApprove = async (billId: string) => {
    try {
      const res = await fetch(`/api/student-health/bills/${billId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({ userId, role, schoolId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Approval transaction failed");
      }
      toast.success("Medical claim successfully approved and ledger values adjusted.");
      setSelectedBill(null);
      fetchPendingBills();
    } catch (err: any) {
      toast.error(err.message || "Approval attempt failed.");
    }
  };

  const handleReject = async (billId: string) => {
    if (!rejectReason) {
      toast.error("Please supply a rejection reason.");
      return;
    }
    try {
      const res = await fetch(`/api/student-health/bills/${billId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({ reason: rejectReason })
      });
      if (!res.ok) throw new Error();
      toast.success("Invoicing claim was returned to hospital with feedback.");
      setRejectId(null);
      setRejectReason('');
      setSelectedBill(null);
      fetchPendingBills();
    } catch (err) {
      toast.error("Rejection attempt crashed.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm mt-4 font-medium">Loading claims await review...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="health-admin-approvals-block">
      <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
        <h3 className="text-lg font-black text-zinc-800 uppercase tracking-widest mb-6 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
          Awaiting Review Queue
        </h3>

        {bills.length === 0 ? (
          <div className="text-center py-16 bg-zinc-50 border border-dashed border-zinc-100 rounded-3xl">
            <Check className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 font-bold text-sm">Perfect! No medical claims awaiting administrator review.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Student Profile</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Class & Type</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Hospital & Treat</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400 text-right">valuation</th>
                  <th className="pb-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-55 hover:divide-zinc-100">
                {bills.map((b) => (
                  <tr key={b.id} className="hover:bg-zinc-50/55 transition-colors">
                    <td className="py-4 font-extrabold text-zinc-800">
                      {b.studentName}
                      <p className="text-[10px] font-semibold text-zinc-400 mt-1">Adm: {b.admissionNumber || "N/A"}</p>
                    </td>
                    <td className="py-4">
                      <span className="font-bold text-xs text-zinc-600 block">{b.className} - {b.batchName}</span>
                      <span className={`inline-block mt-1 text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider ${b.studentType === 'HOSTELER' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                        {b.studentType}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="font-extrabold text-xs text-zinc-800 block truncate max-w-[200px]">{b.treatmentDescription}</span>
                      <span className="text-[11px] font-bold text-zinc-400 block mt-0.5">{b.hospitalName}</span>
                    </td>
                    <td className="py-4 text-emerald-500 font-black text-right text-base">
                      ₹{b.totalAmount}
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => setSelectedBill(b)}
                        className="px-4 py-2 bg-zinc-100 hover:bg-rose-50 hover:text-rose-600 rounded-xl text-zinc-600 font-extrabold text-xs tracking-wider uppercase transition-all"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bill Overview Detail Modal */}
      <AnimatePresence>
        {selectedBill && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[85vh] overflow-y-auto hidden-scrollbar p-8 shadow-2xl relative border border-zinc-100"
            >
              <button
                onClick={() => setSelectedBill(null)}
                className="absolute top-6 right-6 p-2 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                {/* Visual section */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-zinc-800 tracking-tight">Invoice Review Panel</h3>
                    <p className="text-xs text-zinc-400 mt-1">Uploaded by {selectedBill.hospitalName}</p>
                  </div>

                  {selectedBill.imageUrl ? (
                    <div className="border border-zinc-150 rounded-[2rem] overflow-hidden bg-zinc-50">
                      <img 
                        src={selectedBill.imageUrl} 
                        alt="Hospital invoice" 
                        className="w-full h-80 object-contain mx-auto"
                      />
                    </div>
                  ) : (
                    <div className="h-80 border-2 border-dashed border-zinc-200 rounded-[2rem] bg-zinc-50 flex flex-col items-center justify-center text-zinc-400">
                      <AlertCircle className="w-12 h-12 mb-3" />
                      <p className="text-sm font-bold">No receipt image attached.</p>
                    </div>
                  )}
                </div>

                {/* Properties section */}
                <div className="space-y-6">
                  <div className="p-6 bg-zinc-50 border border-zinc-100 rounded-[2rem] space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-450">Matched Student Profile</h4>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-800">{selectedBill.studentName}</h4>
                        <p className="text-xs text-zinc-400 font-bold mt-0.5">{selectedBill.className} - {selectedBill.batchName} ({selectedBill.studentType})</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Treatment</span>
                      <p className="font-extrabold text-sm text-zinc-700 mt-0.5 truncate">{selectedBill.treatmentDescription}</p>
                    </div>
                    <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Attended Doctor</span>
                      <p className="font-extrabold text-sm text-zinc-700 mt-0.5 truncate">{selectedBill.doctorName || "N/A"}</p>
                    </div>
                  </div>

                  <div className="border border-zinc-100 rounded-3xl p-6">
                    <h5 className="font-black text-xs uppercase tracking-widest text-zinc-700 mb-3 pb-2 border-b border-zinc-100">Valuation breakdown</h5>
                    <div className="space-y-2 text-sm">
                      <div className="justify-between flex text-zinc-500 font-medium">
                        <span>Consultation fee:</span>
                        <span className="font-bold text-zinc-750">₹{selectedBill.doctorFee || 0}</span>
                      </div>
                      <div className="justify-between flex text-zinc-500 font-medium">
                        <span>Medicines:</span>
                        <span className="font-bold text-zinc-750">₹{selectedBill.medicineAmount || 0}</span>
                      </div>
                      <div className="justify-between flex text-zinc-500 font-medium">
                        <span>Lab evaluation:</span>
                        <span className="font-bold text-zinc-750">₹{selectedBill.labFee || 0}</span>
                      </div>
                      <div className="justify-between flex text-zinc-500 font-medium">
                        <span>Other details:</span>
                        <span className="font-bold text-zinc-750">₹{selectedBill.otherCharges || 0}</span>
                      </div>
                      <div className="justify-between flex border-t border-zinc-100 pt-3 text-rose-500 font-black text-lg">
                        <span>Total amount:</span>
                        <span>₹{selectedBill.totalAmount || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  {rejectId === selectedBill.id ? (
                    <div className="space-y-3">
                      <textarea
                        placeholder="State feedback/reason to decline clinical claim..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl p-4 focus:outline-none placeholder-zinc-400 min-h-[80px]"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setRejectId(null); setRejectReason(''); }}
                          className="px-4 py-2 text-zinc-500 font-extrabold text-xs uppercase tracking-wider"
                        >
                          Keep pending
                        </button>
                        <button
                          onClick={() => handleReject(selectedBill.id)}
                          className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-200"
                        >
                          Confirm decline
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <button
                        onClick={() => setRejectId(selectedBill.id)}
                        className="flex-1 py-4.5 bg-zinc-100 hover:bg-rose-50 text-zinc-600 hover:text-rose-600 font-black text-xs uppercase tracking-widest rounded-2xl transition-all"
                      >
                        Decline claim
                      </button>
                      <button
                        onClick={() => handleApprove(selectedBill.id)}
                        className="flex-1 py-4.5 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" /> Approve & debit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
