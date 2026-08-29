import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useSettings } from '../context/SettingsContext';
import { Youtube, Play, ArrowRight, ExternalLink } from 'lucide-react';

const Gallery = () => {
  const { siteConfig: res } = useSettings();
  const [videos, setVideos] = useState<string[]>([
    'https://www.youtube.com/embed/dQw4w9WgXcQ', // Placeholder
    'https://www.youtube.com/embed/tgbNymZ7vqY', 
    'https://www.youtube.com/embed/9bZkp7q19f0'
  ]);
  const [youtubeLink, setYoutubeLink] = useState('https://youtube.com');

  useEffect(() => {
    if (res) {
      if (res?.socialLinks?.youtube) {
        setYoutubeLink(res.socialLinks.youtube);
      }
      if (res?.galleryVideos?.length > 0) {
        // Convert IDs/URLs to embed format if needed
        const formatted = res.galleryVideos.map((v: string) => {
           if (v.includes('youtube.com/embed/')) return v;
           if (v.includes('youtu.be/')) return `https://www.youtube.com/embed/${v.split('/').pop()}`;
           if (v.includes('watch?v=')) return `https://www.youtube.com/embed/${v.split('v=').pop()?.split('&')[0]}`;
           return `https://www.youtube.com/embed/${v}`;
        });
        setVideos(formatted);
      }
    }
  }, [res]);


  return (
    <div className="pt-32 pb-24 px-6 bg-[#0A0A0A] text-white min-h-screen">
      <div className="max-w-7xl mx-auto space-y-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <span className="text-[#FFD700] text-xs font-black tracking-widest uppercase">Visual Journey</span>
          <h1 className="text-6xl font-bold tracking-tighter">School <span className="italic font-light text-neutral-400">Media</span> Gallery</h1>
        </motion.div>

        {/* Featured Video Box */}
        <div className="relative aspect-video rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl bg-neutral-900 group">
          <iframe 
            src={`${videos[0]}?autoplay=1&mute=1&loop=1&playlist=${videos[0].split('/').pop()}`}
            title="Featured School Video"
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <div className="absolute bottom-10 left-10 p-8 backdrop-blur-xl bg-black/40 border border-white/5 rounded-3xl max-w-md hidden md:block">
             <div className="flex items-center gap-4 mb-4">
               <div className="w-10 h-10 bg-[#FFD700] rounded-full flex items-center justify-center text-black">
                 <Play className="w-5 h-5 fill-current" />
               </div>
               <span className="text-xs font-black uppercase tracking-widest">Featured Presentation</span>
             </div>
             <p className="text-neutral-200 font-medium leading-relaxed">
               Experience life at St. Antony's School through our latest digital showcase. Our campus is alive with learning and innovation.
             </p>
          </div>
        </div>

        {/* Video Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {videos.slice(1).map((video, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="group space-y-4"
            >
              <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/5 bg-neutral-900">
                <iframe 
                  src={video}
                  title={`School Video ${i+1}`}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
              <div className="px-2 flex items-center justify-between">
                <div>
                   <h4 className="font-bold text-lg">Academic Highlight {i + 1}</h4>
                   <p className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Library & Tech Center</p>
                </div>
                <Youtube className="w-5 h-5 text-neutral-600 group-hover:text-red-600 transition-colors" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Call to Active */}
        <div className="bg-[#111111] p-12 rounded-[4rem] text-center border border-white/5 space-y-8">
           <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto text-red-600">
              <Youtube className="w-10 h-10" />
           </div>
           <h2 className="text-4xl font-bold tracking-tight">Stay Connected on <span className="text-red-600 uppercase font-black tracking-tighter">YouTube</span></h2>
           <p className="text-neutral-500 max-w-xl mx-auto font-medium">Subscribe to our channel to get the latest updates on campus events, award ceremonies, and academic workshops.</p>
           <a 
              href={youtubeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-10 py-4 bg-red-600 text-white rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all mx-auto w-fit"
           >
              Visit Official Channel <ExternalLink className="w-4 h-4" />
           </a>
        </div>
      </div>
    </div>
  );
};

export default Gallery;
