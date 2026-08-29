import React from 'react';
import { Bot, AlertTriangle } from 'lucide-react';

export const AntonyAiDisabledNotice: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center max-w-xl mx-auto bg-neutral-50 dark:bg-slate-900 border border-neutral-100 rounded-3xl space-y-6 shadow-sm">
      <div className="relative">
        <div className="w-20 h-20 bg-neutral-200 dark:bg-slate-800 rounded-2.2xl flex items-center justify-center text-neutral-400">
          <Bot className="w-10 h-10" />
        </div>
        <div className="absolute -bottom-1 -right-1 bg-amber-500 rounded-full p-1.5 border-2 border-white dark:border-slate-950 text-white">
          <AlertTriangle className="w-3 h-3" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-black uppercase tracking-tight text-neutral-800 dark:text-neutral-100">
          Antony AI Agent Disabled
        </h3>
        <p className="text-xs font-black uppercase tracking-widest text-indigo-500 mt-1">
          ఆంటోనీ AI ఏజెంట్ నిలిపివేయబడింది
        </p>
      </div>
      <div className="space-y-3 px-4">
        <p className="text-sm font-bold text-neutral-500 leading-relaxed italic">
          "Antony AI Agent has been disabled by your administrator. Please contact the school office if you require assistance."
        </p>
        <p className="text-sm font-bold text-neutral-500 leading-relaxed italic border-t border-neutral-200/50 pt-3">
          "ఆంటోనీ AI ఏజెంట్ మీ అడ్మినిస్ట్రేటర్ ద్వారా నిలిపివేయబడింది. మీకు సహాయం కావాలంటే దయచేసి పాఠశాల కార్యాలయాన్ని సంప్రదించండి."
        </p>
      </div>
    </div>
  );
};
