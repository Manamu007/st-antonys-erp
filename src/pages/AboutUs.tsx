import React from 'react';
import { motion } from 'motion/react';
import { Quote, Award, Users, BookOpen } from 'lucide-react';

const AboutUs = () => {
  return (
    <div className="pt-32 pb-24 px-6 bg-[#0A0A0A] text-white min-h-screen">
      <div className="max-w-7xl mx-auto space-y-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <span className="text-[#FFD700] text-xs font-black tracking-widest uppercase">Our Story</span>
          <h1 className="text-6xl font-bold tracking-tighter">About St. Antony's <span className="italic font-light text-neutral-400">School</span></h1>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            <p className="text-xl text-neutral-400 leading-relaxed font-medium">
              Established in 1954, St. Antony's School has been a cornerstone of educational excellence for over seven decades. From our humble beginnings to our current position as a premier institution, our focus has always remained on holistic development.
            </p>
            <p className="text-neutral-500 leading-relaxed">
              We believe that education extends far beyond the classroom. Our campus is a vibrant ecosystem where creativity, critical thinking, and character building are prioritized alongside academic performance.
            </p>
            <div className="grid grid-cols-2 gap-8 pt-8">
              <div className="space-y-2">
                <div className="text-3xl font-bold text-[#FFD700]">70+</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-600">Years of Legacy</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-[#FFD700]">5000+</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-600">Success Stories</div>
              </div>
            </div>
          </div>
          <div className="relative">
            <img src="https://images.unsplash.com/photo-1541339907198-e08759dfc3ef?auto=format&fit=crop&q=80" alt="School" className="rounded-3xl grayscale opacity-80" />
            <div className="absolute -bottom-10 -left-10 p-8 bg-[#111111] border border-white/10 rounded-2xl max-w-[320px]">
              <Quote className="w-8 h-8 text-[#FFD700] mb-4 opacity-50" />
              <p className="text-lg font-bold italic leading-snug">"Empowering the next generation with values and vision."</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Award, title: "Our Mission", text: "To provide quality education that fosters intellectual growth and character." },
            { icon: Users, title: "Our Vision", text: "To become a global benchmark in holistic and sustainable education." },
            { icon: BookOpen, title: "Our Values", text: "Integrity, Excellence, Community, and Lifelong Learning." }
          ].map((item, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -10 }}
              className="p-10 bg-[#111111] rounded-3xl border border-white/5 space-y-6"
            >
              <div className="w-12 h-12 bg-[#FFD700]/10 rounded-2xl flex items-center justify-center text-[#FFD700]">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold">{item.title}</h3>
              <p className="text-neutral-500 font-medium">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
