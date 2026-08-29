import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../services/dbService';
import { useSettings } from '../context/SettingsContext';
import { normalizeUrl } from '../lib/utils';
import { 
  Mail,
  Phone,
  ArrowUpRight, 
  BookOpen, 
  Facebook, 
  Twitter, 
  Instagram, 
  Linkedin, 
  Youtube,
  X,
  Send,
  Calendar,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';

import { AIAssistant } from './AIAssistant';

const PublicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { siteConfig: config, settings } = useSettings();
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubmittingNewsletter, setIsSubmittingNewsletter] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();


  const handlePortalClick = () => {
    if (user) navigate('/dashboard');
    else navigate('/login');
  };

  const handleNewsletterSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    setIsSubmittingNewsletter(true);
    try {
      await dbService.add('newsletter', { email: newsletterEmail, createdAt: new Date().toISOString() });
      toast.success("Subscribed to newsletter!");
      setNewsletterEmail('');
    } catch (error) {
      toast.error("Failed to subscribe.");
    } finally {
      setIsSubmittingNewsletter(false);
    }
  };

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'About Us', path: '/about' },
    { label: 'Academics', path: '/academics-info' },
    { label: 'Admissions', path: '/admissions' },
    { label: 'Gallery', path: '/gallery' }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-neutral-100 selection:bg-[#FFD700] selection:text-black font-sans scroll-smooth">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="font-black text-2xl tracking-tighter text-[#FFD700] uppercase leading-none">
              St. Antony's <span className="text-white italic">School</span>
            </span>
          </Link>
          
          <div className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              <Link 
                key={item.label} 
                to={item.path} 
                className={`text-[11px] font-bold uppercase tracking-[0.2em] transition-colors relative group ${
                  location.pathname === item.path ? 'text-[#FFD700]' : 'text-neutral-400 hover:text-[#FFD700]'
                }`}
              >
                {item.label}
                {location.pathname === item.path && (
                  <motion.span layoutId="nav-underline" className="absolute -bottom-1 left-0 w-full h-0.5 bg-[#FFD700]" />
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
             <button 
                onClick={() => setIsTourModalOpen(true)}
                className="hidden md:flex items-center gap-2 px-6 py-3 border border-white/20 rounded-full text-[9px] font-black uppercase tracking-[0.2em] hover:bg-white/5 transition-all"
             >
                <BookOpen className="w-3.5 h-3.5" /> Book a Tour
             </button>
             <button 
                onClick={() => setIsEnquiryModalOpen(true)}
                className="flex items-center gap-2 px-8 py-3 bg-[#FFD700] text-black rounded-full text-[9px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-all shadow-xl shadow-[#FFD700]/20"
             >
                Enquire Now
             </button>
             <Link 
                to="/login"
                className="flex items-center justify-center w-11 h-11 bg-white/10 hover:bg-white/20 rounded-full transition-all group"
             >
               <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
             </Link>
           </div>
        </div>
      </nav>

      <main>{children}</main>

      {/* Footer */}
      <footer className="bg-[#050505] pt-32 pb-20 px-6 border-t border-white/5 font-sans overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 mb-16">
            {/* Logo & About Section */}
            <div className="lg:col-span-5 space-y-10">
              <div className="relative group cursor-pointer inline-block" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <div className="flex items-center gap-5">
                  <div className="w-20 h-20 bg-[#FFD700] rounded-[1.5rem] flex items-center justify-center text-black font-black text-4xl shadow-2xl shadow-[#FFD700]/20 group-hover:scale-105 transition-transform overflow-hidden">
                    {settings?.logoUrl ? (
                      <img 
                        src={normalizeUrl(settings.logoUrl)} 
                        alt="School Logo" 
                        className="w-full h-full object-contain p-2"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      'A'
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-3xl font-black text-white tracking-tighter uppercase block leading-none">
                      {settings?.schoolName || 'Antony School'}
                    </span>
                    <span className="text-[#999] text-[11px] font-black uppercase tracking-[0.4em] block">
                      {config?.slogan || 'Legacy of Excellence'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-neutral-500 text-base font-medium leading-relaxed max-w-md">
                  {config?.footerDescription || 'Empowering visionary minds through excellence in education, character building, and digital innovation since 1954. Join our community of lifelong learners.'}
                </p>
                <p className="text-neutral-600 text-[11px] font-black uppercase tracking-widest italic">
                  {config?.establishedText || 'Excellence in education since 2000'}
                </p>
              </div>

              <div className="flex gap-5 pt-4">
                {[
                  { icon: Facebook, href: config?.socialLinks?.facebook },
                  { icon: Twitter, href: config?.socialLinks?.twitter },
                  { icon: Instagram, href: config?.socialLinks?.instagram },
                  { icon: Youtube, href: config?.socialLinks?.youtube },
                  { icon: Linkedin, href: config?.socialLinks?.linkedin }
                ].filter(s => s.href).map((social, i) => (
                  <a 
                    key={i} 
                    href={social.href} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="w-12 h-12 rounded-2xl border border-white/5 flex items-center justify-center text-neutral-400 hover:text-black hover:bg-[#FFD700] hover:border-[#FFD700] transition-all bg-white/5"
                  >
                    <social.icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Links & Contact Grid */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-8">
              {/* Contact Information */}
              <div className="space-y-8">
                <h4 className="text-white font-black text-xs uppercase tracking-[0.3em] pb-4 border-b border-white/5">Contact Us</h4>
                <ul className="space-y-6">
                  <li className="flex items-start gap-4 group">
                    <div className="p-2.5 bg-white/5 rounded-xl text-[#FFD700] group-hover:bg-[#FFD700] group-hover:text-black transition-all">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Email</p>
                      <p className="text-neutral-300 text-sm font-bold">{config?.footerEmail || 'admin@antonyschool.in'}</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4 group">
                    <div className="p-2.5 bg-white/5 rounded-xl text-[#FFD700] group-hover:bg-[#FFD700] group-hover:text-black transition-all">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Phone</p>
                      <p className="text-neutral-300 text-sm font-bold">{config?.footerPhone || '+91 91234 56789'}</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4 group">
                    <div className="p-2.5 bg-white/5 rounded-xl text-[#FFD700] group-hover:bg-[#FFD700] group-hover:text-black transition-all">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Address</p>
                      <p className="text-neutral-300 text-sm font-bold leading-relaxed">
                        {config?.address || "Plot No. 12, Academic District, Jubilee Hills, Hyderabad, Telangana, 500033, India"}
                      </p>
                      <a 
                        href={(config?.mapsUrl && config.mapsUrl.includes('/embed')) ? config.mapsUrl.replace('/embed', '/place') : (config?.mapsUrl || "https://maps.google.com/?q=St.+Antony's+School,+Jubilee+Hills,+Hyderabad")} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[#FFD700] text-[10px] font-black uppercase tracking-widest hover:underline block pt-1"
                      >
                        View on Google Maps
                      </a>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Functional Quick Links */}
              <div className="space-y-8">
                <h4 className="text-white font-black text-xs uppercase tracking-[0.3em] pb-4 border-b border-white/5">Explore</h4>
                <ul className="space-y-4">
                  {[
                    { label: 'Home', path: '/' },
                    { label: 'About History', path: '/#aboutus' },
                    { label: 'Leadership', path: '/#leadership' },
                    { label: 'Methodology', path: '/#methodology' },
                    { label: 'Gallery', path: '/#gallery' },
                    { label: 'Contact', path: '/#contact' }
                  ].map((link) => (
                    <li key={link.label}>
                      <button 
                        onClick={() => {
                          if (link.path.startsWith('/#')) {
                            const id = link.path.substring(2);
                            if (location.pathname === '/') {
                              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                            } else {
                              navigate('/');
                              setTimeout(() => {
                                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                              }, 100);
                            }
                          } else {
                            navigate(link.path);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className="text-neutral-500 text-sm font-bold hover:text-[#FFD700] transition-colors flex items-center gap-2 group"
                      >
                        <div className="w-0.5 h-3 bg-[#FFD700] scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom" />
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Admissions & Info */}
              <div className="space-y-8">
                <h4 className="text-white font-black text-xs uppercase tracking-[0.3em] pb-4 border-b border-white/5">Resources</h4>
                <ul className="space-y-4">
                  {[
                    { label: 'Academics', path: '/academics-info' },
                    { label: 'Prospective Students', path: '/admissions' },
                    { label: 'Student Login', path: '/login' },
                    { label: 'Privacy Policy', path: '/privacy-policy' },
                    { label: 'Refund Policy', path: '/refund-policy' },
                    { label: 'Terms & Conditions', path: '/terms' },
                    { label: 'Fee Structure', path: '/fee-structure' }
                  ].map((link) => (
                    <li key={link.label}>
                      <Link 
                        to={link.path} 
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="text-neutral-500 text-sm font-bold hover:text-[#FFD700] transition-colors flex items-center gap-2 group"
                      >
                        <div className="w-0.5 h-3 bg-[#FFD700] scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom" />
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-neutral-600 text-[10px] font-bold uppercase tracking-[0.4em]">
              © 2026 {settings?.schoolName?.toUpperCase() || "ST. ANTONY'S SCHOOL"} | ALL RIGHTS RESERVED
            </p>
            <div className="text-neutral-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                <span>SSL SECURED CONNECTION</span>
              </div>
              <div className="flex items-center gap-2">
                POWERED BY <span className="text-[#FFD700]">SPEARS FLOW ERP</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {isTourModalOpen && (
          <Modal onClose={() => setIsTourModalOpen(false)} title="Book a Campus Tour">
            <TourForm onSuccess={() => setIsTourModalOpen(false)} />
          </Modal>
        )}
        {isEnquiryModalOpen && (
          <Modal onClose={() => setIsEnquiryModalOpen(false)} title="Admissions Enquiry">
            <EnquiryForm onSuccess={() => setIsEnquiryModalOpen(false)} />
          </Modal>
        )}
      </AnimatePresence>
      <AIAssistant />
    </div>
  );
};

const Modal = ({ children, onClose, title }: { children: React.ReactNode, onClose: () => void, title: string }) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
  >
    <motion.div 
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      className="w-full max-w-lg bg-[#111111] border border-white/10 rounded-[2.5rem] p-10 relative shadow-2xl"
    >
      <button onClick={onClose} className="absolute top-8 right-8 text-neutral-500 hover:text-white">
        <X className="w-6 h-6" />
      </button>
      <div className="space-y-8">
        <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
        {children}
      </div>
    </motion.div>
  </motion.div>
);

const TourForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ parentName: '', studentName: '', email: '', phone: '', preferredDate: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await dbService.add('tours', { ...formData, status: 'pending', createdAt: new Date().toISOString() });
      toast.success("Tour request sent! We'll confirm the date shortly.");
      onSuccess();
    } catch (error) {
      toast.error("Failed to book tour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input required placeholder="Parent Name" value={formData.parentName} onChange={e => setFormData({...formData, parentName: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
          <input required placeholder="Student Name" value={formData.studentName} onChange={e => setFormData({...formData, studentName: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
        </div>
        <input required type="email" placeholder="Email Address" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
        <input required placeholder="Phone Number" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
        <div className="relative">
          <Calendar className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600" />
          <input required type="date" value={formData.preferredDate} onChange={e => setFormData({...formData, preferredDate: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700] flex-row-reverse" />
        </div>
      </div>
      <button disabled={loading} className="w-full py-4 bg-[#FFD700] text-black rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3">
        {loading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send className="w-4 h-4" />} Confirm Request
      </button>
    </form>
  );
};

const EnquiryForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ parentName: '', email: '', phone: '', gradeInterested: '', message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await dbService.add('enquiries', { ...formData, status: 'new', createdAt: new Date().toISOString() });
      toast.success("Enquiry sent successfully!");
      onSuccess();
    } catch (error) {
      toast.error("Failed to send enquiry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <input required placeholder="Parent Name" value={formData.parentName} onChange={e => setFormData({...formData, parentName: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
        <div className="grid grid-cols-2 gap-4">
          <input required type="email" placeholder="Email Address" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
          <input required placeholder="Phone Number" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
        </div>
        <input placeholder="Grade Interested In" value={formData.gradeInterested} onChange={e => setFormData({...formData, gradeInterested: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700]" />
        <textarea rows={3} placeholder="Your Message" value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFD700] resize-none" />
      </div>
      <button disabled={loading} className="w-full py-4 bg-[#FFD700] text-black rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3">
        {loading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send className="w-4 h-4" />} Send Enquiry
      </button>
    </form>
  );
};

export default PublicLayout;
