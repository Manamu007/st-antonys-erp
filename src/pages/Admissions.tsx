import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, FileText, Send, Calendar, HelpCircle } from 'lucide-react';
import { dbService } from '../services/dbService';
import { toast } from 'sonner';

const Admissions = () => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    parentName: '',
    email: '',
    phone: '',
    gradeInterested: '',
    message: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await dbService.add('enquiries', {
        ...formData,
        status: 'new',
        createdAt: new Date().toISOString()
      });
      toast.success("Enquiry sent successfully! We will contact you soon.");
      setFormData({
        parentName: '',
        email: '',
        phone: '',
        gradeInterested: '',
        message: ''
      });
    } catch (error) {
      toast.error("Failed to send enquiry. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-24 px-6 bg-[#0A0A0A] text-white min-h-screen">
      <div className="max-w-7xl mx-auto space-y-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <span className="text-[#FFD700] text-xs font-black tracking-widest uppercase">Apply Now</span>
          <h1 className="text-6xl font-bold tracking-tighter">Your Future <span className="italic font-light text-neutral-400">Begins Here</span></h1>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-20">
          <div className="space-y-12">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold">Admission Process</h2>
              <div className="space-y-8">
                {[
                  { step: "01", title: "Enquiry & Visit", desc: "Submit an online enquiry or visit our campus for a tour." },
                  { step: "02", title: "Application Submission", desc: "Fill out the official application form with necessary documents." },
                  { step: "03", title: "Assessment", desc: "Student interaction and basic competency evaluation." },
                  { step: "04", title: "Enrollment", desc: "Approval and completion of fee formalities." }
                ].map((s, i) => (
                  <div key={i} className="flex gap-6 group">
                    <div className="text-3xl font-black text-white/10 group-hover:text-[#FFD700] transition-colors">{s.step}</div>
                    <div className="space-y-2">
                      <h4 className="text-lg font-bold">{s.title}</h4>
                      <p className="text-neutral-500 font-medium text-sm">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-[#111111] rounded-3xl border border-white/5 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileText className="text-[#FFD700] w-5 h-5" /> Required Documents
              </h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['Birth Certificate', 'Previous Year Report', 'Transfer Certificate', 'Aadhar Card', '4 Passport Photos', 'Address Proof'].map((doc, i) => (
                  <li key={i} className="flex items-center gap-3 text-neutral-400 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[#FFD700]" /> {doc}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-[#111111] p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFD700]/5 blur-[100px] rounded-full" />
            <div className="relative space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-black uppercase tracking-tight">Admissions Enquiry Form</h2>
                <p className="text-[13px] text-neutral-500 font-bold uppercase tracking-widest">Submit your details and our team will get in touch</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[12px] font-black text-neutral-500 uppercase tracking-widest">Name</label>
                    <input 
                      required
                      value={formData.parentName}
                      onChange={e => setFormData({...formData, parentName: e.target.value})}
                      className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-black text-neutral-500 uppercase tracking-widest">Phone</label>
                    <input 
                      required
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-black text-neutral-500 uppercase tracking-widest">Email Address</label>
                  <input 
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-black text-neutral-500 uppercase tracking-widest">Grade Interested In</label>
                  <input 
                    value={formData.gradeInterested}
                    onChange={e => setFormData({...formData, gradeInterested: e.target.value})}
                    className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-black text-neutral-500 uppercase tracking-widest">How can we help you?</label>
                  <textarea 
                    rows={4}
                    value={formData.message}
                    onChange={e => setFormData({...formData, message: e.target.value})}
                    className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700] resize-none" 
                  />
                </div>
                <button 
                  disabled={loading}
                  className="w-full py-4 bg-[#FFD700] text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:scale-105 transition-all shadow-xl shadow-[#FFD700]/10 flex items-center justify-center gap-3"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Enquiry
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admissions;
