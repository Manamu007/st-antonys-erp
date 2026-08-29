import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, X, Bot, User, Loader2, Sparkles, Minus } from 'lucide-react';
import { antonyAiClient } from '../modules/antonyAiAgent/services/antonyAiClient';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'model';
  content: string;
}

export const AIAssistant = () => {
  const { profile } = useAuth();
  
  const [isRenderable, setIsRenderable] = useState<boolean | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hello! I am Antony, your AI assistant. How can I help you with St. Antony's School today?" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const creds = React.useMemo(() => ({
    userId: profile?.uid || profile?.id || 'GUEST_USER',
    role: profile?.role || 'GUEST',
    schoolId: 'st_antonys_school',
    hospitalId: (profile as any)?.hospitalId || ''
  }), [profile]);

  // Load configuration on mount to decide if floating widget should render
  useEffect(() => {
    async function checkWidgetAvailability() {
      try {
        const config = await antonyAiClient.getSettings(creds);
        // Widget is only renderable if enabled globally AND allowed floating widget!
        const allowed = config.enabled === true && config.allowFloatingWidget === true;
        setIsRenderable(allowed);
      } catch (err) {
        setIsRenderable(false);
      }
    }
    checkWidgetAvailability();
  }, [creds, isOpen]); // refresh on open to reload correct setting toggles!

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Convert history for the secure backend chat
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const res = await antonyAiClient.chat(userMessage, history, creds);
      
      setMessages(prev => [...prev, { role: 'model', content: res.answer }]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect to AI Agent. Please try again later.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // If settings say AI is off or floating widget is off, do not display!
  if (isRenderable === false || isRenderable === null) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? '80px' : '600px'
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[400px] max-w-[calc(100vw-48px)] bg-white rounded-[2rem] shadow-2xl border border-neutral-100 overflow-hidden mb-4 flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="p-5 bg-sidebar text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Antony AI Agent</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Real-time Ready</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                  {messages.map((m, i) => (
                    <motion.div
                      initial={{ opacity: 0, x: m.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={i}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                          m.role === 'user' ? 'bg-neutral-100' : 'bg-primary/10 text-primary'
                        }`}>
                          {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                        <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                          m.role === 'user' 
                          ? 'bg-primary text-white font-medium rounded-tr-none shadow-md shadow-primary/10' 
                          : 'bg-neutral-50 text-neutral-700 font-medium rounded-tl-none border border-neutral-100'
                        }`}>
                          {m.content}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex gap-3 max-w-[85%]">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center animate-bounce">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 rounded-tl-none">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSend} className="p-4 border-t border-neutral-50 bg-neutral-50/50">
                  <div className="relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask Antony anything..."
                      className="w-full pl-6 pr-14 py-4 bg-white border border-neutral-200 rounded-2xl focus:border-primary outline-none text-sm font-medium text-neutral-900 transition-all shadow-sm"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-primary text-white rounded-xl hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-primary/20"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-center text-neutral-400 mt-3 font-bold uppercase tracking-widest">
                    AI Agent may provide information based on school knowledge base
                  </p>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
        className="pointer-events-auto w-16 h-16 bg-sidebar rounded-full shadow-2xl flex items-center justify-center relative overflow-hidden group border-4 border-white"
      >
        <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-10 transition-opacity" />
        <div className="absolute -right-1 -top-1 w-6 h-6 bg-primary rounded-full border-4 border-white flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-white animate-pulse" />
        </div>
        {!isOpen ? (
          <Bot className="w-8 h-8 text-white" />
        ) : (
          <MessageSquare className="w-8 h-8 text-white" />
        )}
      </motion.button>
    </div>
  );
};
