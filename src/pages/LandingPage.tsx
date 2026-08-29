import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { dbService } from '../services/dbService';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { normalizeUrl } from '../lib/utils';
import { useSettings } from '../context/SettingsContext';
import { 
  ArrowRight,   ArrowUpRight,
  BookOpen,
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Mail,
  Phone,
  MapPin,
  Quote
} from 'lucide-react';

interface SiteConfig {
  hero: { title: string; subtitle: string; backgroundImage: string; ctaText?: string; exploreText?: string };
  about: { prefix: string; title: string; text: string; tagline?: string; gridPhotos: string[]; stats: { value: string; label: string }[] };
   leadership: { name: string; role: string; quote: string; photoUrl: string }[];
  methodology: { title: string; description: string; number: string }[];
  socialLinks: { facebook: string; twitter: string; instagram: string; youtube: string; linkedin?: string };
  cta?: { title: string; description: string; buttonText: string; contactText?: string };
  pillars?: { title: string; subtitle: string; buttonText: string };
  footerDescription?: string;
  footerEmail?: string;
  footerPhone?: string;
  slogan?: string;
  establishedText?: string;
  mapsUrl?: string;
  address?: string;
}

const defaultHeroImage = "https://images.unsplash.com/photo-1523050335391-4b7713d09a1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80";

const defaultLeaders = [
  { name: "Dr. Alistair Vance", role: "PRINCIPAL", quote: "My vision for St. Antony's is to foster an atmosphere of curiosity where every child feels empowered to ask 'why' and 'how'.", photoUrl: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80" },
  { name: "Prof. Elena Rodriguez", role: "DEAN OF ACADEMICS", quote: "Overseeing our curriculum innovation and teacher training programs with a focus on STEM integration.", photoUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80" },
  { name: "Mr. Robert Chen", role: "HEAD OF FACULTY", quote: "A veteran educator with 30 years of experience, specializing in student counseling and holistic development.", photoUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=800&q=80" }
];

const defaultStats = [
  { value: "70+", label: "YEARS OF LEGACY" },
  { value: "12k+", label: "ALUMNI NETWORK" },
  { value: "50+", label: "AWARDS WON" }
];

const LandingPage = () => {
  const { siteConfig: config, loading } = useSettings();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handlePortalClick = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const socialIcons = [
    { icon: Facebook, href: config?.socialLinks?.facebook, label: 'Facebook' },
    { icon: Twitter, href: config?.socialLinks?.twitter, label: 'Twitter' },
    { icon: Instagram, href: config?.socialLinks?.instagram, label: 'Instagram' },
    { icon: Youtube, href: config?.socialLinks?.youtube, label: 'YouTube' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A] text-white">
        <div className="w-12 h-12 border-4 border-[#FFD700]/20 border-t-[#FFD700] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] text-neutral-100 selection:bg-[#FFD700] selection:text-black font-sans scroll-smooth">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={normalizeUrl(config?.hero?.backgroundImage) || defaultHeroImage} 
            alt="School Exterior" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/70"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/95 via-[#0A0A0A]/40 to-transparent"></div>
        </div>
        
        <div className="relative z-10 max-w-5xl mx-auto text-center space-y-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-6"
          >
            <span className="text-[#FFD700] text-[10px] font-black uppercase tracking-[0.8em] block drop-shadow-md">
              {config?.about?.prefix || "LEGACY OF EXCELLENCE"}
            </span>
            <h1 className="text-7xl md:text-[8rem] font-bold leading-[0.9] tracking-tighter text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
              {config?.hero?.title ? (
                config.hero.title.includes('Visionary') ? (
                  <>Nurturing <span className="font-serif italic font-light text-[#FFD700]">Visionary</span><br />Minds</>
                ) : config.hero.title
              ) : (
                <>Nurturing <span className="font-serif italic font-light text-[#FFD700]">Visionary</span><br />Minds</>
              )}
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 1 }}
            className="text-lg md:text-xl text-neutral-100 font-medium max-w-2xl mx-auto leading-relaxed drop-shadow-md"
          >
            {config?.hero?.subtitle || "Discover the history, people, and methodology that make St. Antony's a beacon of global education."}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8"
          >
            <button 
              onClick={() => document.getElementById('aboutus')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-12 py-5 border border-white/20 hover:border-white text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all bg-black/20 backdrop-blur-md"
            >
              {config?.hero?.exploreText || "Explore Legacy"}
            </button>
            <button 
              onClick={handlePortalClick}
              className="px-12 py-5 bg-[#FFD700] text-black rounded-full text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-all shadow-2xl shadow-[#FFD700]/30 flex items-center gap-3"
            >
              {config?.hero?.ctaText || "Access Portal"} <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* About/Legacy Section */}
      <section id="aboutus" className="py-32 px-6 bg-[#050505]">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-20 items-center">
          <div className="lg:col-span-6 space-y-10">
            <div className="space-y-4">
              <span className="text-[#FFD700] text-[10px] font-black uppercase tracking-widest block">
                {config?.about?.tagline || "ESTABLISHED 1954"}
              </span>
              <h2 className="text-5xl font-bold text-white tracking-tight">
                {config?.about?.title || "A Journey Through Time"}
              </h2>
            </div>
            
            <p className="text-neutral-400 text-lg leading-relaxed font-medium">
              {config?.about?.text || "Founded in the heart of the community over seven decades ago, St. Antony's School began as a humble initiative by a group of visionary educators. Their mission was simple yet profound: to create an environment where academic rigor meets compassionate character building."}
            </p>

            <div className="grid grid-cols-3 gap-12 pt-8 border-t border-white/5">
              {(config?.about?.stats?.length ? config.about.stats : defaultStats).map((stat, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-4xl font-bold text-[#FFD700] tracking-tighter">{stat.value}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div id="gallery" className="lg:col-span-6 relative">
            <div className="grid grid-cols-2 gap-4">
              {config?.about?.gridPhotos?.map((photo, i) => (
                <div key={i} className={`aspect-[4/5] rounded-2xl overflow-hidden ${i % 2 === 0 ? 'mt-8' : 'mb-8'}`}>
                  <img 
                    src={normalizeUrl(photo) || `https://images.unsplash.com/photo-${1500000000000 + i}?auto=format&fit=crop&w=800`} 
                    alt="Activity" 
                    className="w-full h-full object-cover grayscale opacity-80" 
                    referrerPolicy="no-referrer" 
                    loading="lazy"
                  />
                </div>
              )) || [0, 1, 2, 3].map(i => (
                <div key={i} className={`aspect-[4/5] bg-neutral-900 rounded-2xl overflow-hidden ${i % 2 === 0 ? 'mt-8' : 'mb-8'}`} />
              ))}
            </div>
            
            {/* Quote Card */}
            <div className="absolute -bottom-10 -left-10 p-8 bg-[#111111] border border-white/10 rounded-2xl max-w-[320px] shadow-2xl">
              <Quote className="w-8 h-8 text-[#FFD700] mb-4 opacity-50" />
              <p className="text-lg font-bold italic text-white leading-snug">
                "Education is the kindling of a flame, not the filling of a vessel."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Leadership Section */}
      <section id="leadership" className="py-32 px-6">
        <div className="max-w-7xl mx-auto space-y-20">
          <div className="text-center space-y-4">
            <h2 className="text-5xl font-bold text-white tracking-tight">
               Guiding <span className="italic font-light text-[#FFD700]">Lights</span>
            </h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto font-medium">
              Our leadership team brings decades of combined experience in global pedagogy and institutional management.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {(config?.leadership?.length ? config.leadership : defaultLeaders).map((leader, i) => (
              <div key={i} className="bg-[#111111] rounded-[2rem] overflow-hidden border border-white/5 hover:border-[#FFD700]/30 transition-all group">
                <div className="aspect-[4/5] overflow-hidden">
                  <img 
                    src={leader.photoUrl || (leader as any).photo} 
                    alt={leader.name} 
                    className="w-full h-full object-cover grayscale transition-all group-hover:grayscale-0 group-hover:scale-105" 
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <div className="text-[#FFD700] text-[10px] font-black uppercase tracking-widest">{leader.role}</div>
                    <h3 className="text-2xl font-bold text-white">{leader.name}</h3>
                  </div>
                  <p className="text-neutral-400 text-sm italic font-medium leading-relaxed">
                    "{leader.quote}"
                  </p>
                  <div className="flex gap-4 pt-4">
                     <Mail className="w-4 h-4 text-neutral-500 hover:text-white cursor-pointer" />
                     <Youtube className="w-4 h-4 text-neutral-500 hover:text-white cursor-pointer" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Methodology Section */}
      <section id="methodology" className="py-32 px-6 bg-[#050505] rounded-t-[5rem]">
        <div className="max-w-7xl mx-auto space-y-20">
          <div className="space-y-4">
             <h2 className="text-5xl font-bold text-white tracking-tight">
                {config?.pillars?.title ? (
                  config.pillars.title.includes('Method') ? (
                    <>The Antony's <span className="italic font-light text-neutral-400">Method</span></>
                  ) : config.pillars.title
                ) : (
                  <>The Antony's <span className="italic font-light text-neutral-400">Method</span></>
                )}
             </h2>
             <div className="flex flex-col md:flex-row justify-between gap-8 md:items-end">
               <p className="text-neutral-400 text-lg max-w-xl font-medium leading-relaxed">
                 {config?.pillars?.subtitle || "We don't just teach subjects; we cultivate mindsets. Our methodology is built on four core pillars that ensure balanced development."}
               </p>
               <button className="flex items-center gap-3 px-8 py-3 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white text-black transition-all">
                  {config?.pillars?.buttonText || "Download Prospectus"}
               </button>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {(config?.methodology || [
              { title: "Critical Inquiry", number: "01", description: "Encouraging students to question established norms and develop independent thinking patterns." },
              { title: "Collaborative Spirit", number: "02", description: "Project-based learning that emphasizes teamwork, empathy, and leadership skills." },
              { title: "Digital Literacy", number: "03", description: "Integrating cutting-edge technology into every subject to prepare students for a global future." }
            ]).map((pillar: any, i: number) => (
              <div key={i} className="bg-[#111111] p-10 rounded-3xl border border-white/5 space-y-8 relative overflow-hidden group">
                <div className="text-[12rem] font-black absolute -top-12 -right-4 text-white/[0.02] transition-transform group-hover:scale-110">
                  {pillar.number}
                </div>
                <div className="w-12 h-12 bg-[#FFD700]/10 rounded-2xl flex items-center justify-center text-[#FFD700]">
                   <BookOpen className="w-6 h-6" />
                </div>
                <div className="space-y-4 relative z-10">
                  <h3 className="text-2xl font-bold text-white tracking-tight">{pillar.title}</h3>
                  <p className="text-neutral-500 text-sm leading-relaxed font-medium">
                    {pillar.description}
                  </p>
                  <div className="text-[10px] font-black text-[#FFD700] uppercase tracking-[0.4em] pt-4 border-t border-white/5">
                    PILLAR {pillar.number}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="py-48 px-6 bg-[#050505]">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#111111] p-24 rounded-[4rem] text-center space-y-12 relative overflow-hidden border border-white/5 group">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20rem] font-black text-white/[0.01] tracking-tighter transition-all group-hover:scale-110 select-none">
              JOIN
            </div>
            <div className="space-y-6 relative z-10">
              <span className="text-[#FFD700] text-[10px] font-black uppercase tracking-[0.5em]">ADMISSIONS OPEN</span>
              <h2 className="text-6xl md:text-8xl font-bold text-white tracking-tighter leading-none">
                {config?.cta?.title || <>Ready to <span className="italic font-light text-neutral-400">Shape</span> Your <br /> Future?</>}
              </h2>
              <p className="text-neutral-400 text-lg font-medium max-w-xl mx-auto">
                {config?.cta?.description || "Applications for the next academic year are now open. Start your journey towards global excellence today."}
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6 relative z-10">
               <button 
                onClick={() => navigate('/admissions')}
                className="px-12 py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-[0.2em] hover:bg-[#FFD700] transition-all flex items-center gap-4"
               >
                  {config?.cta?.buttonText || "Apply Now"} <ArrowRight className="w-5 h-5" />
               </button>
               <button className="px-12 py-5 bg-transparent border border-white/10 text-white rounded-full font-black text-xs uppercase tracking-[0.2em] hover:bg-white/5 transition-all flex items-center gap-4">
                  {config?.cta?.contactText || "Contact Admissions"}
               </button>
            </div>

            {config?.mapsUrl && config.mapsUrl.includes('/embed') && (
              <div className="mt-20 relative z-10 w-full h-[400px] rounded-[3rem] overflow-hidden border border-white/10">
                <iframe
                  src={config.mapsUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="School Location"
                  className="grayscale opacity-60 invert hover:grayscale-0 hover:invert-0 transition-all duration-700"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 
          FOOTER SECTION moved to PublicLayout.tsx for consistency across all public pages.
      */}
    </div>
  );
};

export default LandingPage;
