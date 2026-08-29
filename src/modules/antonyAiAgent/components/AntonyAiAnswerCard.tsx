import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, ShieldAlert, Sparkles, CheckCircle } from 'lucide-react';
import { AntonyAiResponse } from '../types/antonyAiTypes';

interface AnswerCardProps {
  response: AntonyAiResponse;
  onFeedback?: (type: "HELPFUL" | "UNHELPFUL") => void;
}

export const AntonyAiAnswerCard: React.FC<AnswerCardProps> = ({ response, onFeedback }) => {
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<"HELPFUL" | "UNHELPFUL" | null>(null);

  const handleFeedback = (type: "HELPFUL" | "UNHELPFUL") => {
    setFeedbackSubmitted(type);
    if (onFeedback) {
      onFeedback(type);
    }
  };

  const getConfidenceBadgeColor = (conf: string) => {
    switch (conf) {
      case "HIGH":
        return "bg-emerald-50 text-emerald-600 border-emerald-100";
      case "MEDIUM":
        return "bg-indigo-50 text-indigo-600 border-indigo-100";
      case "LOW":
        return "bg-amber-50 text-amber-600 border-amber-100";
      default:
        return "bg-neutral-50 text-neutral-400 border-neutral-100";
    }
  };

  return (
    <div className="bg-neutral-50 rounded-[2rem] p-6 border border-neutral-150 shadow-sm space-y-4">
      {/* Real Answer Text */}
      <div className="text-sm font-semibold leading-relaxed text-neutral-800 whitespace-pre-wrap">
        {response.answer}
      </div>

      {/* Structured metadata footer */}
      <div className="pt-4 border-t border-neutral-200/50 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">
          <span className="text-neutral-400">Confidence:</span>
          <span className={`px-2.5 py-0.5 rounded-md border font-black ${getConfidenceBadgeColor(response.confidence)}`}>
            {response.confidence}
          </span>

          <span className="text-neutral-300">|</span>
          <span className="text-neutral-400">Permissions Active:</span>
          <span className="px-2 py-0.5 bg-neutral-150 rounded text-neutral-600 border border-neutral-200">
            {response.permissionUsed}
          </span>

          {response.lastUpdated && (
            <>
              <span className="text-neutral-300">|</span>
              <span className="text-neutral-400">
                Last Sync: {new Date(response.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>

        {/* Source cards */}
        {response.sources && response.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Verified Sources:</span>
            {response.sources.map((src, idx) => (
              <span key={idx} className="text-[9px] font-bold text-indigo-600 px-2 py-0.5 bg-indigo-50/50 rounded-md border border-indigo-100/50">
                {src}
              </span>
            ))}
          </div>
        )}

        {/* Dual Actions human confirmation required */}
        {response.needAdminConfirmation && (
          <div className="mt-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl flex items-start gap-2.5 text-amber-700">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 animate-pulse text-amber-500" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 leading-none">Dual-Authorization Required</p>
              <p className="text-[11px] font-bold text-amber-600/80 leading-relaxed mt-1">
                This Draft changes state or handles sensitive administrative details. Antony AI cannot submit is directly. A human principal/administrator must confirm this draft in the pending registry.
              </p>
            </div>
          </div>
        )}

        {/* User Helpfulness feedback triggers */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Was this response helpful?</span>
          <div className="flex items-center gap-1.5">
            {!feedbackSubmitted ? (
              <>
                <button
                  type="button"
                  onClick={() => handleFeedback("HELPFUL")}
                  className="p-2 bg-white hover:bg-emerald-50 text-neutral-400 hover:text-emerald-500 rounded-xl border border-neutral-200 shadow-xs transition-colors shrink-0"
                  title="Thumbs Up"
                >
                  <ThumbsUp className="w-3.5 h-3.5 pointer-events-none" />
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback("UNHELPFUL")}
                  className="p-2 bg-white hover:bg-rose-50 text-neutral-400 hover:text-rose-500 rounded-xl border border-neutral-200 shadow-xs transition-colors shrink-0"
                  title="Thumbs Down"
                >
                  <ThumbsDown className="w-3.5 h-3.5 pointer-events-none" />
                </button>
              </>
            ) : (
              <span className="text-[9px] font-black uppercase text-emerald-600 tracking-widest bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1 animate-pulse">
                <CheckCircle className="w-3 h-3" />
                Saved Feedback
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
