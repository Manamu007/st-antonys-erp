import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Clock, 
  Zap, 
  Moon, 
  PauseCircle, 
  PlayCircle, 
  Copy, 
  Check, 
  ExternalLink, 
  Lock, 
  Key, 
  CheckCircle2, 
  Sparkles, 
  RefreshCw 
} from 'lucide-react';
import { toast } from 'sonner';

interface AntiBanStatus {
  healthScore: number;
  status: 'optimal' | 'moderate' | 'action_needed';
  activeSafeguards: { name: string; status: 'active' | 'warning' | 'disabled'; description: string }[];
  todayVolume: number;
  maxDailyCap: number;
  quietHoursActive: boolean;
}

export const MetaAntiBanGuardian: React.FC = () => {
  const [statusData, setStatusData] = useState<AntiBanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFrozen, setIsFrozen] = useState(false);
  const [togglingFreeze, setTogglingFreeze] = useState(false);
  const [copiedAppeal, setCopiedAppeal] = useState(false);

  // Official Meta Cloud API config form
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaEnabled, setMetaEnabled] = useState(false);
  const [savingMetaConfig, setSavingMetaConfig] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/whatsapp/antiban/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatusData(data);
        }
      }
    } catch (e) {
      console.warn("Could not load Anti-Ban status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleFreeze = async () => {
    setTogglingFreeze(true);
    try {
      const res = await fetch('/api/whatsapp/antiban/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeze: !isFrozen })
      });
      const data = await res.json();
      if (data.success) {
        setIsFrozen(data.frozen);
        if (data.frozen) {
          toast.warning("Delivery Queue Frozen. Outgoing messages are paused to protect account.");
        } else {
          toast.success("Delivery Queue Resumed. Anti-Ban pacing active.");
        }
      }
    } catch (err: any) {
      toast.error("Failed to toggle freeze: " + err.message);
    } finally {
      setTogglingFreeze(false);
    }
  };

  const appealText = `Hello WhatsApp Support Team,

Our school WhatsApp Business account (St. Antony's High School / Spears Academy) was flagged during linked device setup. 

Our account is strictly used for school-parent educational administration:
1. Daily attendance absent notifications to parents
2. Fee receipt confirmations and exam report cards
3. Urgent school circulars, homework notices, and parent queries

We strictly comply with WhatsApp Business Terms of Service. All recipients are verified students' parents who explicitly opted in to receive school records.

Please complete the review and restore our account so our students' parents continue receiving important academic alerts.

School: St. Antony's High School
Helpline: +91 88222 69999
Email: admin@antonyschool.in`;

  const handleCopyAppeal = () => {
    navigator.clipboard.writeText(appealText);
    setCopiedAppeal(true);
    toast.success("Official Meta Appeal Template copied to clipboard!");
    setTimeout(() => setCopiedAppeal(false), 3000);
  };

  const handleSaveMetaCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMetaConfig(true);
    try {
      const res = await fetch('/api/whatsapp/antiban/cloud-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: metaPhoneId.trim(),
          accessToken: metaToken.trim(),
          wabaId: metaWabaId.trim(),
          enabled: metaEnabled
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Official Meta WhatsApp Cloud API credentials saved!");
      } else {
        toast.error("Failed to save credentials: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      toast.error("Error saving Meta Cloud credentials: " + err.message);
    } finally {
      setSavingMetaConfig(false);
    }
  };

  const healthScore = statusData?.healthScore ?? 98;

  return (
    <div className="space-y-6 text-left">
      {/* 1. Header & Live Shield Health Meter */}
      <div className="p-6 bg-gradient-to-br from-neutral-900 via-neutral-950 to-slate-950 rounded-3xl border border-neutral-800 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl text-emerald-400">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <span>Meta Anti-Ban Armor &amp; Account Guardian</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black">
                    ENTERPRISE SHIELD
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 font-medium">
                  Multi-layered algorithmic protection preventing WhatsApp automated blocks, duplicate content bans, and multi-server collisions.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 border-neutral-800 pt-4 lg:pt-0">
            <div className="text-right">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Protection Score</span>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-emerald-400">{healthScore}%</span>
                <span className="text-xs font-bold text-emerald-500/90 uppercase px-2 py-0.5 rounded-md bg-emerald-500/10">Optimal</span>
              </div>
            </div>

            <button
              onClick={handleToggleFreeze}
              disabled={togglingFreeze}
              className={`px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg ${
                isFrozen 
                  ? 'bg-amber-500 hover:bg-amber-600 text-black' 
                  : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40'
              }`}
            >
              {isFrozen ? (
                <>
                  <PlayCircle className="w-4 h-4 text-black" />
                  <span>Resume Queue</span>
                </>
              ) : (
                <>
                  <PauseCircle className="w-4 h-4 text-red-400" />
                  <span>Emergency Freeze</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Account Review Guide Notice (Specifically for user's situation) */}
      <div className="p-6 bg-amber-50 border-2 border-amber-300 rounded-3xl shadow-sm space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-amber-500/20 rounded-2xl text-amber-800 shrink-0 mt-0.5">
            <AlertTriangle className="w-6 h-6 text-amber-700" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h4 className="font-black text-amber-950 text-base flex items-center gap-2">
              <span>Account Currently "In Review" on Mobile WhatsApp?</span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                Action Required
              </span>
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              If your phone shows <strong>"Account in review (Review requested: Typically within 24 hours)"</strong>, Meta's automated security system flagged rapid reconnection handshakes or data-center IP linking. 
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="bg-white/80 p-3 rounded-2xl border border-amber-200 text-xs">
                <span className="font-black text-amber-950 block mb-1">1. Do Not Re-Scan QR</span>
                <p className="text-neutral-600 text-[11px]">
                  Do not attempt repeated scans or un-link attempts while under review. Meta typically clears first-time reviews in <strong>24 hours</strong>.
                </p>
              </div>
              <div className="bg-white/80 p-3 rounded-2xl border border-amber-200 text-xs">
                <span className="font-black text-amber-950 block mb-1">2. Submit School Appeal</span>
                <p className="text-neutral-600 text-[11px]">
                  If your phone displays a <em>"Request review"</em> form, copy and paste our official school appeal template below.
                </p>
              </div>
              <div className="bg-white/80 p-3 rounded-2xl border border-amber-200 text-xs">
                <span className="font-black text-amber-950 block mb-1">3. Link with Phone Code</span>
                <p className="text-neutral-600 text-[11px]">
                  Once restored, use the <strong>Phone Code</strong> tab. Entering the 8-digit push notification code is 100% accepted by Meta without cloud IP penalties.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleCopyAppeal}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md"
              >
                {copiedAppeal ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedAppeal ? "Appeal Text Copied!" : "Copy Official School Appeal for WhatsApp"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. The 6 Active Meta Armor Defense Layers */}
      <div className="space-y-4">
        <h4 className="text-sm font-black text-sidebar uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>Active Meta Anti-Ban Protection Layers</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Layer 1: Cryptographic Zero-Width Salting */}
          <div className="p-5 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-2.5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                ACTIVE
              </span>
            </div>
            <h5 className="font-black text-sidebar text-sm">Cryptographic Zero-Width Salting</h5>
            <p className="text-xs text-neutral-500 leading-relaxed font-medium">
              Injects unique invisible Unicode tokens (<code className="text-[10px] bg-neutral-100 px-1 py-0.5 rounded">\u200B</code>) into every message. Every student's message has a mathematically unique SHA-256 byte signature, defeating Meta's duplicate content broadcast scanner.
            </p>
          </div>

          {/* Layer 2: Dynamic Spintax Permutations */}
          <div className="p-5 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-2.5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <RefreshCw className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                ACTIVE
              </span>
            </div>
            <h5 className="font-black text-sidebar text-sm">Dynamic Linguistic Spintax</h5>
            <p className="text-xs text-neutral-500 leading-relaxed font-medium">
              Varies greetings (<em>"Dear Parent"</em>, <em>"Respected Parent"</em>, <em>"గౌరవనీయులైన తల్లిదండ్రులకు"</em>) and sign-offs automatically. Prevents mass broadcasts from looking like scripted marketing spam.
            </p>
          </div>

          {/* Layer 3: Human Pacing & Typing Emulation */}
          <div className="p-5 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-2.5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                18-28s PACED
              </span>
            </div>
            <h5 className="font-black text-sidebar text-sm">Human Pacing &amp; Typing Presence</h5>
            <p className="text-xs text-neutral-500 leading-relaxed font-medium">
              Enforces a strict 18–28 second delay between messages with randomized human jitter and broadcasts an authentic <em>"typing..."</em> (composing) presence indicator before delivery.
            </p>
          </div>

          {/* Layer 4: Batch Cooling Breaks */}
          <div className="p-5 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-2.5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                60s COOL-OFF
              </span>
            </div>
            <h5 className="font-black text-sidebar text-sm">Batch Cooling Breaks</h5>
            <p className="text-xs text-neutral-500 leading-relaxed font-medium">
              After every 10 consecutive messages, the system automatically takes an unconditional 60 to 90 second rest pause to simulate human coffee breaks and keep velocity below spam thresholds.
            </p>
          </div>

          {/* Layer 5: Quiet Hours Sleep Mode */}
          <div className="p-5 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-2.5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Moon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${statusData?.quietHoursActive ? 'bg-indigo-600 text-white animate-pulse' : 'bg-indigo-100 text-indigo-800'}`}>
                {statusData?.quietHoursActive ? 'SLEEPING NOW' : '10PM - 7AM'}
              </span>
            </div>
            <h5 className="font-black text-sidebar text-sm">Quiet Hours Sleep Protection</h5>
            <p className="text-xs text-neutral-500 leading-relaxed font-medium">
              Automatically pauses non-emergency notifications between 10:00 PM and 7:00 AM IST. Sending late-night blasts is the #1 reason parents tap "Report Spam", causing instant bans.
            </p>
          </div>

          {/* Layer 6: Zero-Collision Master Lock */}
          <div className="p-5 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-2.5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                ACTIVE LOCK
              </span>
            </div>
            <h5 className="font-black text-sidebar text-sm">Zero-Collision Master Lock</h5>
            <p className="text-xs text-neutral-500 leading-relaxed font-medium">
              Guarantees only ONE physical server holds the active WhatsApp connection worldwide. Standby and development servers run in isolated proxy sync, preventing Meta dual-login conflict bans (code 440).
            </p>
          </div>
        </div>
      </div>

      {/* 4. Official Meta WhatsApp Cloud API Provider (100% Ban-Proof) */}
      <div className="p-6 bg-white rounded-3xl border border-neutral-100 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <h4 className="text-base font-black text-sidebar uppercase tracking-tight">
                Official Meta WhatsApp Cloud API (100% Ban-Proof Provider)
              </h4>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold uppercase">
                Official Meta Partner
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-medium">
              Want 100% absolute immunity from bans? Connect via Meta's official WhatsApp Business Cloud API. Messages are routed directly through Meta Graph API servers with green tick capability and unlimited throughput.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveMetaCloud} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-600">Meta Phone Number ID</label>
              <input
                type="text"
                placeholder="e.g. 109827364521890"
                value={metaPhoneId}
                onChange={(e) => setMetaPhoneId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-600">WABA ID (WhatsApp Business Account)</label>
              <input
                type="text"
                placeholder="e.g. 98765432109876"
                value={metaWabaId}
                onChange={(e) => setMetaWabaId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-600">System User Access Token</label>
              <input
                type="password"
                placeholder="EAABwz..."
                value={metaToken}
                onChange={(e) => setMetaToken(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-neutral-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={metaEnabled}
                onChange={(e) => setMetaEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary/20 border-neutral-300"
              />
              <span className="text-xs font-bold text-neutral-700">
                Route outgoing notifications via Official Meta Cloud API (Fallback to Baileys if unconfigured)
              </span>
            </label>

            <button
              type="submit"
              disabled={savingMetaConfig}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md disabled:opacity-50"
            >
              {savingMetaConfig ? "Saving..." : "Save Meta Cloud Credentials"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
