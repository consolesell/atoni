import React, { useState } from 'react';
import {
  Key,
  RefreshCw,
  Copy,
  Check,
  Lock,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { derivWS } from '../lib/derivWS';
import { sound } from '../lib/soundEngine';
import { BalanceFreshness, ConnectionState, DerivAuthMethod } from '../types/trading';

interface DetailedAuthVisualProps {
  isLiveMode: boolean;
  isAuthorized?: boolean;
  onToggleLiveMode: (isReal: boolean) => void;
  balance: number;
  currency: string;
  loginid: string | null;
  onRefreshBalance: () => void;
  isRefreshingBalance?: boolean;
  onOpenTokenModal: () => void;
  latencyMs?: number;
  connectionState?: ConnectionState;
  balanceFreshness?: BalanceFreshness;
  authMethod?: DerivAuthMethod | null;
}

export const DetailedAuthVisual: React.FC<DetailedAuthVisualProps> = ({
  isLiveMode,
  isAuthorized = false,
  onToggleLiveMode,
  balance,
  currency,
  loginid,
  onRefreshBalance,
  isRefreshingBalance = false,
  onOpenTokenModal,
  latencyMs = 38,
  connectionState = 'OFFLINE',
  balanceFreshness = 'UNAVAILABLE',
  authMethod = null,
}) => {
  const credentials = derivWS.getCredentials();
  const [copiedAppId, setCopiedAppId] = useState(false);

  const activeAppId = credentials.appId || '33zsnNh6YJ2HWm30oZZJR';

  const handleCopyAppId = () => {
    navigator.clipboard.writeText(String(activeAppId));
    setCopiedAppId(true);
    sound.play('click');
    setTimeout(() => setCopiedAppId(false), 2000);
  };

  const handleToggle = (targetReal: boolean) => {
    onToggleLiveMode(targetReal);
    sound.play('toggle');
  };

  const authLabel =
    authMethod === 'oauth2_pkce'
      ? 'OAuth 2.0 PKCE (Server Vault)'
      : authMethod === 'pat'
      ? 'PAT Bearer (Server Vault)'
      : authMethod === 'legacy_token'
      ? 'WS v3 Volatile Session'
      : 'Not Connected';

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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-100 font-sans tracking-wide">
                DERIV OPTIONS GATEWAY
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  connectionState === 'ONLINE' && isAuthorized
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : connectionState === 'RECONNECTING' || connectionState === 'CONNECTING'
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    connectionState === 'ONLINE' && isAuthorized
                      ? 'bg-emerald-400'
                      : connectionState === 'RECONNECTING' || connectionState === 'CONNECTING'
                      ? 'bg-cyan-400'
                      : 'bg-amber-400'
                  }`}
                />
                {connectionState} • {latencyMs}ms
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <span>Account:</span>
              <strong className="text-slate-200">
                {loginid || (isAuthorized ? (isLiveMode ? 'REAL_ACCOUNT' : 'DEMO_ACCOUNT') : 'Not Connected')}
              </strong>
              <span>•</span>
              <span
                className={
                  !isAuthorized
                    ? 'text-slate-400 font-bold'
                    : isLiveMode
                    ? 'text-rose-400 font-bold'
                    : 'text-amber-400 font-bold'
                }
              >
                {!isAuthorized ? 'DISCONNECTED' : isLiveMode ? 'REAL MONEY' : 'DEMO ACCOUNT'}
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
            <span>DERIV DEMO</span>
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
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
            <span>Live Account Balance</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300">
              {currency}
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                balanceFreshness === 'LIVE'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : balanceFreshness === 'SYNCING'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
            >
              {balanceFreshness}
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
            title="Connect Deriv account securely"
          >
            <Key className="w-3.5 h-3.5 text-rose-400" />
            <span>DERIV LOG IN</span>
          </button>
        </div>
      </div>

      {/* Non-Secret Authentication & Session Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80 font-mono text-xs">
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

        <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-emerald-400" />
              <span>Session Protection</span>
            </span>
            <span className="text-xs text-slate-200 font-bold truncate max-w-[220px]">
              {authLabel}
            </span>
          </div>
          <ShieldCheck className={`w-4 h-4 ${isAuthorized ? 'text-emerald-400' : 'text-slate-600'}`} />
        </div>
      </div>
    </div>
  );
};
