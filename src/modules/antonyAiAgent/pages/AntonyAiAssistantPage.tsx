import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  AlertCircle, 
  MessageSquare, 
  ArrowRight,
  Plus,
  Users,
  GraduationCap,
  Calendar,
  Settings,
  Activity,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../../context/AuthContext';
import { useSettings } from '../../../context/SettingsContext';
import { antonyAiClient } from '../services/antonyAiClient';
import { AntonyAiAnswerCard } from '../components/AntonyAiAnswerCard';
import { AntonyAiDisabledNotice } from '../components/AntonyAiDisabledNotice';
import { AntonyAiResponse } from '../types/antonyAiTypes';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  responseObj?: AntonyAiResponse; // contains advanced meta
  timestamp: Date;
}

export const AntonyAiAssistantPage: React.FC = () => {
  const { profile, hasPermission } = useAuth();
  const { settings: schoolSettings } = useSettings();

  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const creds = React.useMemo(() => ({
    userId: profile?.uid || profile?.id || 'GUEST_USER',
    role: profile?.role || 'GUEST',
    schoolId: 'st_antonys_school', // standard from erp
    hospitalId: (profile as any)?.hospitalId || ''
  }), [profile]);

  // Load configuration first
  useEffect(() => {
    async function fetchConfig() {
      try {
        const config = await antonyAiClient.getSettings(creds);
        setAiEnabled(config.enabled);
      } catch (e) {
        // Fallback to offline / false
        setAiEnabled(false);
      }
    }
    fetchConfig();
  }, [creds]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const quickPrompts = [
    { text: "Show low attendance students", icon: Users },
    { text: "Pending fees this week?", icon: Calendar },
    { text: "Top performance stats in Class 10?", icon: GraduationCap },
    { text: "What is St. Antony's motto?", icon: Bot }
  ];

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build history payload
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const responseObj = await antonyAiClient.chat(textToSend, history, creds);

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseObj.answer,
        responseObj,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, modelMsg]);
    } catch (error: any) {
      toast.error(error.message || "Failed to query server-side AI Agent.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (logId: string, type: "HELPFUL" | "UNHELPFUL") => {
    try {
      await antonyAiClient.sendFeedback(logId, type, creds);
    } catch (e) {
      console.warn("Feedback fail:", e);
    }
  };

  if (profile?.role === 'receptionist' || profile?.role === 'clerk') {
    return (
      <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-3xl min-h-[50vh] flex flex-col justify-center items-center">
        <AlertCircle className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold mb-2 text-slate-800 dark:text-slate-100">Access Restricted</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm">
          You do not have credentials to view the AI Assistant Hub. Please contact your administrator.
        </p>
      </div>
    );
  }

  if (aiEnabled === false) {
    return (
      <div className="p-12 min-h-[70vh] flex flex-col justify-center">
        <AntonyAiDisabledNotice />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-6">
      {/* Header section with Stats/Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter italic text-neutral-800 dark:text-white">Antony AI Assistant</h1>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Secure Server-Side Private Intelligence ACTIVE
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center bg-neutral-50 p-1.5 rounded-2xl border border-neutral-100">
          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 px-6 py-3 bg-white rounded-xl shadow-xs">
            Conversational Agent (v3.0)
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left Side: Chat Interface */}
        <div className="flex-1 flex flex-col bg-white rounded-[3rem] border border-neutral-100 shadow-xl overflow-hidden">
          <div className="p-8 border-b border-neutral-50 flex items-center justify-between bg-neutral-50/30">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white bg-emerald-500 animate-pulse" />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-tight text-neutral-800">Antony Assistant</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Role: {creds.role} | Realtime Protected
                </p>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setMessages([])}
              className="p-3 text-neutral-400 hover:text-rose-500 transition-colors"
              title="Clear Session"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar scrollbar-hide">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-6 opacity-60">
                <div className="w-20 h-20 bg-neutral-50 rounded-[2rem] flex items-center justify-center text-neutral-400 mb-2">
                  <MessageSquare className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="font-black text-lg uppercase tracking-tighter italic">Secure Intelligence Session</h4>
                  <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest leading-relaxed mt-2">
                    Enter any query or click a quick command below to retrieve authorized, school-isolated data.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full pt-4">
                  {quickPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      disabled={isLoading}
                      onClick={() => handleSend(prompt.text)}
                      className="flex items-center gap-3 p-4 bg-neutral-50 hover:bg-indigo-50 text-neutral-600 hover:text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-transparent hover:border-indigo-100 group"
                    >
                      <prompt.icon className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                      {prompt.text}
                      <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[85%]">
                    {msg.role === 'user' ? (
                      <div className="bg-indigo-600 text-white rounded-[2rem] rounded-tr-none p-5 shadow-sm border border-indigo-700 text-sm font-semibold leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <AntonyAiAnswerCard 
                        response={msg.responseObj || {
                          answer: msg.content,
                          confidence: "MEDIUM",
                          sources: [],
                          permissionUsed: `STANDARD_${creds.role}`,
                          needAdminConfirmation: false,
                          lastUpdated: new Date().toISOString()
                        }}
                        onFeedback={(type) => msg.responseObj && handleFeedback(msg.id, type)}
                      />
                    )}
                    <div className={`mt-2.5 text-[8px] font-black uppercase tracking-[0.2em] px-4 ${msg.role === 'user' ? 'text-right text-neutral-400' : 'text-neutral-400'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex justify-start"
              >
                <div className="bg-neutral-50 rounded-[2rem] rounded-tl-none p-6 border border-neutral-100">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Form write input */}
          <div className="p-8 border-t border-neutral-50 bg-white">
            <div className="flex gap-4 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask school AI agent records..."
                disabled={isLoading}
                className="flex-1 bg-neutral-50 border border-neutral-200 px-8 py-5 rounded-[2rem] text-xs font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all pr-24 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-black text-white p-3 rounded-2xl shadow-xl shadow-indigo-100 transition-all disabled:opacity-50 disabled:grayscale group disabled:cursor-not-allowed text-xs font-black uppercase tracking-widest"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
