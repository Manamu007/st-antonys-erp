import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, Microscope, Music, Globe, Calculator, PenTool } from 'lucide-react';

const AcademicsPage = () => {
  const courses = [
    { icon: Calculator, title: "Mathematics", desc: "Developing strong analytical and problem-solving skills from early stages." },
    { icon: Microscope, title: "Science & Tech", desc: "Hands-on learning in our state-of-the-art laboratories and digital hubs." },
    { icon: Globe, title: "Social Studies", desc: "Understanding the world, its history, and the responsibilities of global citizenship." },
    { icon: PenTool, title: "Languages", desc: "Mastering communication through English, local, and foreign language programs." },
    { icon: Music, title: "Arts & Culture", desc: "Encouraging expression through music, theater, and fine arts." },
    { icon: BookOpen, title: "Library Program", desc: "Fostering a lifelong love for reading and independent research." }
  ];

  return (
    <div className="pt-32 pb-24 px-6 bg-[#0A0A0A] text-white min-h-screen">
      <div className="max-w-7xl mx-auto space-y-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <span className="text-[#FFD700] text-xs font-black tracking-widest uppercase">Curriculum</span>
          <h1 className="text-6xl font-bold tracking-tighter">Academic <span className="italic font-light text-neutral-400">Excellence</span></h1>
          <p className="text-neutral-500 text-lg max-w-2xl mx-auto font-medium">
            Our multi-disciplinary approach ensures that students are prepared for the challenges of tomorrow while staying rooted in traditional values.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {courses.map((course, i) => (
            <motion.div 
              key={i}
              whileHover={{ scale: 1.02 }}
              className="p-10 bg-[#111111] rounded-3xl border border-white/5 space-y-6 group"
            >
              <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-[#FFD700] group-hover:bg-[#FFD700] group-hover:text-black transition-all">
                <course.icon className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold">{course.title}</h3>
              <p className="text-neutral-500 font-medium leading-relaxed">{course.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="bg-[#111111] p-12 rounded-[3rem] border border-white/5 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-6">
            <h2 className="text-4xl font-bold italic tracking-tight">Focus on <span className="text-[#FFD700] uppercase font-black">Innovation</span></h2>
            <p className="text-neutral-400 font-medium leading-relaxed">
              We integrate STEM and project-based learning into every level of our curriculum. Our students don't just learn about the world; they learn how to impact it through technology and sustainable thinking.
            </p>
            <button className="px-8 py-4 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-[#FFD700] transition-all">
              View Syllabus
            </button>
          </div>
          <div className="flex-1">
            <img src="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80" alt="Lab" className="rounded-2xl grayscale" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AcademicsPage;
