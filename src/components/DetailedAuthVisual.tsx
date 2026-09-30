import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Server,
  Activity,
  ArrowRightLeft,
} from 'lucide-react';
import { derivWS } from '../lib/derivWS';
import { sound } from '../lib/soundEngine';

interface DetailedAuthVisualProps {
  isLiveMode: boolean;
  onToggleLiveMode: (isReal: boolean) => void;
  balance: number;
  currency: string;
  loginid: string | null;
  onRefreshBalance: () => void;
  isRefreshingBalance?: boolean;
  onOpenTokenModal: () => void;
  latencyMs?: number;
}

export const DetailedAuthVisual: React.FC<DetailedAuthVisualProps> = ({
  isLiveMode,
  onToggleLiveMode,
  balance,
  currency,
  loginid,
  onRefreshBalance,
  isRefreshingBalance = false,
  onOpenTokenModal,
  latencyMs = 38,
}) => {
  const credentials = derivWS.getCredentials();
  const [showFullToken, setShowFullToken] = useState(false);
  const [copiedAppId, setCopiedAppId] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const activeAppId = credentials.appId || '1089';
  const activeToken = credentials.token || '';

  const handleCopyAppId = () => {
    navigator.clipboard.writeText(String(activeAppId));
    setCopiedAppId(true);
    sound.play('click');
    setTimeout(() => setCopiedAppId(false), 2000);
  };

  const handleCopyToken = () => {
    if (!activeToken) return;
    navigator.clipboard.writeText(activeToken);
    setCopiedToken(true);
    sound.play('click');
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleToggle = (targetReal: boolean) => {
    onToggleLiveMode(targetReal);
    sound.play('toggle');
  };

  return (
    <div
      id="detailed-auth-visual-card"
      className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md font-sans relative overflow-hidden"
    >
      {/* Top Status & Live Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100 font-sans tracking-wide">
                DERIV WEBSOCKET V3
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE • {latencyMs}ms
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <span>Account:</span>
              <strong className="text-slate-200">{loginid || (isLiveMode ? 'CR_LIVE' : 'VRTC_DEMO')}</strong>
              <span>•</span>
              <span className={isLiveMode ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>
                {isLiveMode ? 'REAL MONEY' : 'SIMULATION'}
              </span>
            </div>
          </div>
        </div>

        {/* Smooth Demo/Real Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => handleToggle(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              !isLiveMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>DEMO VIRTUAL</span>
          </button>

          <button
            onClick={() => handleToggle(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              isLiveMode
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm animate-pulse'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>REAL ACCOUNT</span>
          </button>
        </div>
      </div>

      {/* Main Stats: Live Balance & Refresh */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 py-3 items-center">
        {/* Balance Display */}
        <div className="sm:col-span-6 flex flex-col gap-0.5 font-mono">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <span>Live Account Balance</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300">
              {currency}
            </span>
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-black tracking-tight ${
                isLiveMode ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold">{currency}</span>
          </div>
        </div>

        {/* Balance Refresh Button */}
        <div className="sm:col-span-6 flex items-center justify-start sm:justify-end gap-2">
          <button
            onClick={onRefreshBalance}
            disabled={isRefreshingBalance}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/50 rounded-xl font-mono text-xs font-bold transition-all shadow-sm group"
            title="Fetch latest balance from Deriv WebSocket server"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-cyan-400 transition-transform ${
                isRefreshingBalance ? 'animate-spin' : 'group-hover:rotate-180 duration-500'
              }`}
            />
            <span>{isRefreshingBalance ? 'SYNCING...' : 'REFRESH BALANCE'}</span>
          </button>

          <button
            onClick={onOpenTokenModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-rose-600/20 to-red-600/20 hover:from-rose-600/30 hover:to-red-600/30 text-rose-300 border border-rose-500/40 rounded-xl font-mono text-xs font-bold transition-all shadow-sm"
            title="Log in to Deriv without leaving the app"
          >
            <Key className="w-3.5 h-3.5 text-rose-400" />
            <span>DERIV LOG IN</span>
          </button>
        </div>
      </div>

      {/* Authentication & Security Credentials Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80 font-mono text-xs">
        {/* Deriv App ID Display */}
        <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-400 uppercase font-bold">Deriv App ID</span>
            <span className="text-xs text-slate-200 font-bold truncate max-w-[180px]">
              {String(activeAppId)}
            </span>
          </div>
          <button
            onClick={handleCopyAppId}
            className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-lg hover:bg-slate-900 transition-colors"
            title="Copy App ID"
          >
            {copiedAppId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Deriv Token Display */}
        <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-emerald-400" />
              <span>Deriv API Token</span>
            </span>
            <span className="text-xs text-slate-200 font-bold truncate max-w-[180px]">
              {activeToken
                ? showFullToken
                  ? activeToken
                  : `${activeToken.slice(0, 8)}••••••••${activeToken.slice(-6)}`
                : 'None (Simulation Mode)'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {activeToken && (
              <button
                onClick={() => setShowFullToken((prev) => !prev)}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-900 transition-colors"
                title={showFullToken ? 'Hide token' : 'Reveal token'}
              >
                {showFullToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
            {activeToken && (
              <button
                onClick={handleCopyToken}
                className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-lg hover:bg-slate-900 transition-colors"
                title="Copy token"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
