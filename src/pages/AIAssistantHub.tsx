import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  AlertCircle, 
  Activity, 
  MessageSquare,
  Workflow
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AntonyAiAssistantPage } from '../modules/antonyAiAgent/pages/AntonyAiAssistantPage';
import { AntonyAiHealthPage } from '../modules/antonyAiAgent/pages/AntonyAiHealthPage';
import BotWorkflowBuilder from '../whatsapp_bot_v2/components/BotWorkflowBuilder';

const AIAssistantHub: React.FC = () => {
  const { profile, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'chat' | 'health' | 'chatbot_v2'>('chat');

  // Check general access restrictions first
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

  // Permission boundary check
  if (!hasPermission('ai_assistant_hub_view')) {
    return (
      <div className="h-full flex items-center justify-center p-20 text-center">
        <div className="max-w-md">
          <div className="w-20 h-20 bg-rose-50 rounded-[2.5rem] flex items-center justify-center text-rose-500 mx-auto mb-6">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter italic mb-4">Access Denied</h2>
          <p className="text-neutral-500 font-bold mb-8">
            You do not have the required permissions to access the AI Assistant Hub. Please contact your administrator for access.
          </p>
        </div>
      </div>
    );
  }

  const userRole = (profile?.role || '').toUpperCase();
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL";

  return (
    <div className="h-full space-y-6">
      {/* Sub-routing control tabs (Only shown for admin roles!) */}
      {isAdmin && (
        <div className="flex items-center gap-2 bg-neutral-50 p-2.5 rounded-2xl border border-neutral-100 max-w-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'chat'
                ? 'bg-white text-indigo-600 shadow-xs border border-neutral-100'
                : 'text-neutral-500 hover:text-indigo-600'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI Conversations
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('health')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'health'
                ? 'bg-white text-indigo-600 shadow-xs border border-neutral-100'
                : 'text-neutral-500 hover:text-indigo-600'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            AI System Metrics
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chatbot_v2')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'chatbot_v2'
                ? 'bg-white text-indigo-600 shadow-xs border border-neutral-100'
                : 'text-neutral-500 hover:text-indigo-600'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            WhatsApp Bot V2
          </button>
        </div>
      )}

      {/* Render selected sub-page */}
      {activeTab === 'chat' ? (
        <AntonyAiAssistantPage />
      ) : activeTab === 'health' ? (
        <AntonyAiHealthPage />
      ) : (
        <BotWorkflowBuilder />
      )}
    </div>
  );
};

export default AIAssistantHub;
