import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, CreditCard, Activity, Search, RefreshCw, ToggleLeft, ToggleRight, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { StudentHealthAccount, StudentHealthLedgerEntry } from '../types/index.js';

interface StudentAccountsProps {
  userId: string;
  role: string;
  schoolId: string;
}

export default function StudentAccounts({ userId, role, schoolId }: StudentAccountsProps) {
  const [accounts, setAccounts] = useState<StudentHealthAccount[]>([]);
  const [ledger, setLedger] = useState<StudentHealthLedgerEntry[]>([]);
  const [subTab, setSubTab] = useState<'CARDS' | 'LEDGER'>('CARDS');

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adjustingAccount, setAdjustingAccount] = useState<StudentHealthAccount | null>(null);
  const [newBalance, setNewBalance] = useState('');

  const fetchAccountsAndLedger = async () => {
    setLoading(true);
    try {
      // 1. Fetch Accounts
      const accRes = await fetch('/api/student-health/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({ search })
      });
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData.accounts || []);
      }

      // 2. Fetch Ledger (using /api/student-health/reports endpoint which compiles it for admins)
      const repRes = await fetch('/api/student-health/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({})
      });
      if (repRes.ok) {
        const repData = await repRes.json();
        setLedger(repData.report?.ledger || []);
      }
    } catch (err) {
      toast.error("Could not synchronize accounts database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountsAndLedger();
  }, [userId, role, schoolId, search]);

  const toggleCardEnabled = async (account: StudentHealthAccount) => {
    const isWarden = role === 'HOSTEL_WARDEN' || role === 'WARDEN';
    if (isWarden) {
      toast.error("Access Denied. Wardens holds read-only privileges.");
      return;
    }
    const nextState = !account.healthCardEnabled;
    try {
      const res = await fetch('/api/student-health/accounts/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({
          studentId: account.studentId,
          enabled: nextState,
          schoolId
        })
      });
      if (!res.ok) throw new Error();
      toast.success(`Card ${nextState ? 'Enabled' : 'Disabled'} for ${account.studentName}`);
      fetchAccountsAndLedger();
    } catch (err) {
      toast.error("Failed to alter health card configuration.");
    }
  };

  const handleAdjustBalance = async () => {
    if (!adjustingAccount) return;
    const isWarden = role === 'HOSTEL_WARDEN' || role === 'WARDEN';
    if (isWarden) {
       toast.error("Access Denied. Wardens holds read-only privileges.");
       return;
    }
    if (isNaN(Number(newBalance)) || Number(newBalance) < 0) {
      toast.error("Please insert a valid balance figure.");
      return;
    }

    try {
      const res = await fetch('/api/student-health/accounts/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({
          studentId: adjustingAccount.studentId,
          balance: Number(newBalance),
          schoolId
        })
      });
      if (!res.ok) throw new Error();
      toast.success("Health Card Available Reserves top-up/adjustment completed.");
      setAdjustingAccount(null);
      setNewBalance('');
      fetchAccountsAndLedger();
    } catch (err) {
      toast.error("Modification collapsed.");
    }
  };

  const isWarden = role === 'HOSTEL_WARDEN' || role === 'WARDEN';

  return (
    <div className="space-y-6" id="health-student-accounts-block">
      {/* Tab Switcher */}
      <div className="flex justify-between items-center bg-white border border-zinc-100 rounded-[2rem] p-4 shadow-sm">
        <div className="flex gap-3">
          <button
            onClick={() => setSubTab('CARDS')}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${subTab === 'CARDS' ? 'bg-zinc-100 text-rose-600' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            <CreditCard className="w-4 h-4" /> Cards & accounts
          </button>
          <button
            onClick={() => setSubTab('LEDGER')}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${subTab === 'LEDGER' ? 'bg-zinc-100 text-rose-600' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            <Activity className="w-4 h-4" /> Medical Ledger Entries
          </button>
        </div>

        {subTab === 'CARDS' && (
          <div className="flex items-center gap-2 max-w-xs w-full bg-zinc-50 border border-zinc-100 rounded-xl px-3.5 py-2">
            <Search className="w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search Name/ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs focus:outline-none bg-transparent w-full text-zinc-700 font-medium"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm mt-4 font-medium">Synchronizing database list...</p>
        </div>
      ) : subTab === 'CARDS' ? (
        <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
          <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-rose-500" />
            Health Cards Directory
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Student particulars</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Class & Type</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Health Card State</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400 text-right">Available Balance</th>
                  <th className="pb-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-400 font-bold">No active health accounts found.</td>
                  </tr>
                ) : (
                  accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-50/50">
                      <td className="py-4 font-extrabold text-zinc-800">
                        {a.studentName}
                        <p className="text-[10px] font-bold text-zinc-400 mt-1">ID: {a.studentId}</p>
                      </td>
                      <td className="py-4">
                        <span className="font-semibold text-xs text-zinc-650 block">{a.className} - {a.batchName}</span>
                        <span className={`inline-block mt-1 text-[9px] px-2.5 py-0.5 rounded-full font-black tracking-wider uppercase ${a.studentType === 'HOSTELER' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-sky-50 text-sky-650 border border-sky-100'}`}>
                          {a.studentType}
                        </span>
                      </td>
                      <td className="py-4">
                        <button
                          disabled={isWarden}
                          onClick={() => toggleCardEnabled(a)}
                          className={`flex items-center gap-2 text-xs font-bold ${a.healthCardEnabled ? 'text-emerald-500' : 'text-zinc-400'} disabled:opacity-50`}
                        >
                          {a.healthCardEnabled ? (
                            <>
                              <ToggleRight className="w-7 h-7 text-emerald-500" /> Enabled
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-7 h-7 text-zinc-300" /> Disabled
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-4 font-black text-zinc-800 text-right text-base">
                        ₹{a.currentBalance}
                        <p className="text-[10px] font-bold text-zinc-400 mt-1">Deducted Card: ₹{a.totalDeductedFromCard || 0}</p>
                      </td>
                      <td className="py-4 text-right">
                        {!isWarden && (
                          <button
                            onClick={() => { setAdjustingAccount(a); setNewBalance(String(a.currentBalance)); }}
                            className="p-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 rounded-xl transition-colors inline-flex justify-center items-center"
                            title="Adjust Card available balance"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
          <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-rose-500" />
            General transactions ledger
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Timestamp</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Student ID</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Reference Details</th>
                  <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400 text-right">Debit / Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-400 font-bold">No historical card transactions processed yet.</td>
                  </tr>
                ) : (
                  ledger.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-50/50">
                      <td className="py-4 text-xs font-semibold text-zinc-450">{new Date(l.createdAt).toLocaleDateString()} {new Date(l.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                      <td className="py-4 font-extrabold text-zinc-800">{l.studentId}</td>
                      <td className="py-4 font-medium text-xs text-zinc-600">
                        {l.remarks || "Internal balance ledger debit"}
                        <p className="text-[10px] text-zinc-400 mt-1 font-semibold uppercase tracking-wider">Ref ID: {l.billId || "N/A"}</p>
                      </td>
                      <td className="py-4 font-black text-rose-500 text-right">
                        -₹{l.amount}
                        <p className="text-[10px] text-zinc-450 mt-1 font-bold">Balance: ₹{l.balanceBefore} → ₹{l.balanceAfter}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust balance modal */}
      <AnimatePresence>
        {adjustingAccount && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl relative border border-zinc-100"
            >
              <h4 className="text-base font-black text-zinc-800 uppercase tracking-widest mb-2">Adjust Health Card Balance</h4>
              <p className="text-xs text-zinc-400 mb-6 font-semibold">Allocating available medical reserves for {adjustingAccount.studentName}.</p>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Reserves balance (₹)</label>
                <input
                  type="number"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-full text-sm font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
                />
              </div>

              <div className="flex gap-3 mt-8 justify-end">
                <button
                  onClick={() => setAdjustingAccount(null)}
                  className="px-4 py-2 text-zinc-500 font-extrabold text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjustBalance}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-rose-200"
                >
                  Confirm modification
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
