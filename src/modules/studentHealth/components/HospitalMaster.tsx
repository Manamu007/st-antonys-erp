import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building, Plus, Edit, Phone, MapPin, User, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { SchoolHospital } from '../types/index.js';

interface HospitalMasterProps {
  userId: string;
  role: string;
  schoolId: string;
}

export default function HospitalMaster({ userId, role, schoolId }: HospitalMasterProps) {
  const [hospitals, setHospitals] = useState<SchoolHospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHosp, setEditingHosp] = useState<SchoolHospital | null>(null);

  // Form Fields
  const [hospName, setHospName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loginUid, setLoginUid] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/student-health/hospitals?schoolId=${schoolId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHospitals(data.hospitals || []);
    } catch (err) {
      toast.error("Failed to load school hospital registries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, [schoolId]);

  const openForm = (hosp: SchoolHospital | null) => {
    if (hosp) {
      setEditingHosp(hosp);
      setHospName(hosp.hospitalName);
      setContact(hosp.contactPerson || '');
      setPhone(hosp.phone || '');
      setAddress(hosp.address || '');
      setLoginUid(hosp.loginUserId || '');
      setStatus(hosp.status);
    } else {
      setEditingHosp({} as any);
      setHospName('');
      setContact('');
      setPhone('');
      setAddress('');
      setLoginUid('');
      setStatus('ACTIVE');
    }
  };

  const handleSave = async () => {
    if (!hospName.trim()) {
      toast.error("Hospital name is required.");
      return;
    }

    try {
      const res = await fetch('/api/student-health/hospitals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId
        },
        body: JSON.stringify({
          id: editingHosp?.id || undefined,
          hospitalName: hospName,
          contactPerson: contact,
          phone,
          address,
          loginUserId: loginUid,
          status,
          schoolId
        })
      });

      if (!res.ok) throw new Error();
      toast.success("School hospital configuration saved successfully!");
      setEditingHosp(null);
      fetchHospitals();
    } catch (err) {
      toast.error("Failed to save hospital master details.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm mt-4 font-medium">Loading hospital parameters directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="health-hospital-master-block">
      <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2">
            <Building className="w-5 h-5 text-rose-500" />
            Hospitals Master Configurations
          </h3>
          <button
            onClick={() => openForm(null)}
            className="flex items-center gap-2 px-5 py-3 bg-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200"
            id="add-hospital-master-btn"
          >
            <Plus className="w-4 h-4" /> Add Associated Hospital
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {hospitals.length === 0 ? (
            <div className="md:col-span-2 text-center py-12 bg-zinc-50 border border-dashed border-zinc-100 rounded-3xl">
              <Building className="w-12 h-12 text-zinc-350 mx-auto mb-3" />
              <p className="text-zinc-500 font-bold text-sm">No associated school hospitals declared.</p>
            </div>
          ) : (
            hospitals.map((h) => (
              <div key={h.id} className="p-6 bg-zinc-50/50 border border-zinc-100 hover:border-rose-100 rounded-[2rem] hover:bg-rose-50/10 transition-all flex justify-between items-start">
                <div className="space-y-3 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${h.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                    <h4 className="font-extrabold text-zinc-800 truncate text-base">{h.hospitalName}</h4>
                  </div>
                  <div className="space-y-1.5 text-xs text-zinc-550 font-semibold">
                    <p className="flex items-center gap-2 text-zinc-500"><User className="w-4 h-4 shrink-0 text-rose-450" /> {h.contactPerson || "Primary Contact"} (Login mapping: {h.loginUserId || "No account mapped"})</p>
                    <p className="flex items-center gap-2 text-zinc-500"><Phone className="w-4 h-4 shrink-0 text-rose-450" /> {h.phone || "No phone added"}</p>
                    <p className="flex items-center gap-2 text-zinc-500"><MapPin className="w-4 h-4 shrink-0 text-rose-450" /> {h.address || "No address added"}</p>
                  </div>
                </div>
                <button
                  onClick={() => openForm(h)}
                  className="p-2 bg-white border border-zinc-150 rounded-xl hover:bg-zinc-100 transition-colors shrink-0 hover:text-rose-500"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Hospital Edit Modal */}
      <AnimatePresence>
        {editingHosp && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative border border-zinc-100 space-y-5"
            >
              <button
                onClick={() => setEditingHosp(null)}
                className="absolute top-6 right-6 p-2 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-base font-black text-zinc-800 uppercase tracking-widest">{editingHosp.id ? "Edit Hospital parameters" : "Declarations for associated Clinical Partner"}</h3>

              <div className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Hospital trade name *</label>
                  <input
                    type="text"
                    value={hospName}
                    onChange={(e) => setHospName(e.target.value)}
                    className="w-full text-sm font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Contact Person</label>
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full text-sm font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Phone</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-sm font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Linking User Account (UID)</label>
                    <input
                      type="text"
                      value={loginUid}
                      onChange={(e) => setLoginUid(e.target.value)}
                      placeholder="e.g., user_uid"
                      className="w-full text-sm font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-sm font-semibold bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2">Hospital Partner state</label>
                  <button
                    type="button"
                    onClick={() => setStatus(status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                    className="flex items-center gap-2.5 font-bold"
                  >
                    {status === 'ACTIVE' ? (
                      <>
                        <ToggleRight className="w-8 h-8 text-emerald-500" /> Active partner
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-8 h-8 text-zinc-300" /> Inactive partner
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setEditingHosp(null)}
                  className="px-4 py-2 text-zinc-500 font-extrabold text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-rose-200"
                >
                  Save parameters
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
