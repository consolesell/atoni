import React from 'react';
import {
  Cpu,
  Play,
  Square,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
} from 'lucide-react';
import { AutonomyMode, AutonomyPreset, AppliedAutonomySettings } from '../types/autonomy';
import { sound } from '../lib/soundEngine';

interface AutonomyCardProps {
  autonomyMode: AutonomyMode;
  sbagentAutonomyGrant: boolean;
  autonomyPreset: AutonomyPreset;
  appliedSettings?: AppliedAutonomySettings | null;
  lastError: string[] | string | null;
  onRunAutonomously: () => void;
  onStopAutonomy: (reason?: string) => void;
  onConfigure: () => void;
  currentSymbol: string;
  balance: number;
}

export const AutonomyCard: React.FC<AutonomyCardProps> = ({
  autonomyMode,
  sbagentAutonomyGrant,
  autonomyPreset,
  appliedSettings,
  lastError,
  onRunAutonomously,
  onStopAutonomy,
  onConfigure,
  currentSymbol,
  balance,
}) => {
  const isRunning = autonomyMode === 'RUNNING';

  const handlePrimaryClick = () => {
    sound.play('click');
    if (isRunning) {
      onStopAutonomy('user_button');
    } else {
      onRunAutonomously();
    }
  };

  const errorList = Array.isArray(lastError)
    ? lastError
    : typeof lastError === 'string'
    ? [lastError]
    : [];

  return (
    <div
      className={`p-4 rounded-2xl border transition-all duration-300 backdrop-blur-md shadow-xl ${
        isRunning
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 border-cyan-500/50 shadow-cyan-950/30'
          : autonomyMode === 'ARMED'
          ? 'bg-slate-900/90 border-amber-500/40 shadow-amber-950/20'
          : 'bg-slate-900/90 border-slate-800'
      }`}
    >
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isRunning
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 animate-pulse'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white font-sans tracking-tight">
                AUTONOMY CONTROL
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">v4.1</span>
            </div>
            {/* Status Pill: autonomyMode + (sbagentAutonomyGrant ? "SBAgent GRANTED" : "SBAgent idle") */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isRunning
                    ? 'bg-cyan-400 animate-ping'
                    : autonomyMode === 'ARMED'
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
                }`}
              />
              <span
                className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                  isRunning
                    ? 'text-cyan-300'
                    : autonomyMode === 'ARMED'
                    ? 'text-amber-300'
                    : 'text-slate-400'
                }`}
              >
                {autonomyMode} • {sbagentAutonomyGrant ? 'SBAgent GRANTED' : 'SBAgent idle'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons: PRIMARY ("Run autonomously" / "Stop autonomy") + SECONDARY ("Configure") */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              sound.play('click');
              onConfigure();
            }}
            disabled={isRunning}
            className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
            title="Configure human risk bounds and rotation universe"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Configure</span>
          </button>

          <button
            onClick={handlePrimaryClick}
            className={`px-4 py-1.5 rounded-xl font-mono font-black text-xs tracking-wider transition-all shadow-md flex items-center gap-2 ${
              isRunning
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-950/50'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-950/40'
            }`}
          >
            {isRunning ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop autonomy</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run autonomously</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mini Active Telemetry Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[10px] font-mono text-slate-400">
        <div>
          <span className="text-slate-500 block">Active Target:</span>
          <span className="font-bold text-white truncate block">{currentSymbol}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Stake Ceiling:</span>
          <span className="font-bold text-cyan-300">
            ${autonomyPreset.risk.maxStake.toFixed(2)} ({autonomyPreset.risk.sizingMode.replace('_', ' ')})
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">DD Protection:</span>
          <span className="font-bold text-rose-400">
            {autonomyPreset.risk.sessionDrawdownCap.toFixed(1)}% Max Cap
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Rotation Universe:</span>
          <span className="font-bold text-purple-300">
            {autonomyPreset.allowedSymbols.length} Assets Selected
          </span>
        </div>
      </div>

      {/* Checklist / Blockers Error Container (show lastError checklist if any) */}
      {errorList.length > 0 && (
        <div className="mt-3 p-3 bg-rose-950/30 border border-rose-500/40 rounded-xl text-xs font-mono space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Autonomy Prerequisites Checklist Unmet:</span>
          </div>
          <ul className="space-y-1 pl-4 list-disc text-rose-300/90 text-[10px]">
            {errorList.map((err, idx) => (
              <li key={idx} className="leading-snug">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Live Self-Configured Plan Summary if Running */}
      {isRunning && appliedSettings && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold truncate">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>SBAgent calibrated: ${appliedSettings.calibratedStake.toFixed(2)} stake • {appliedSettings.calibratedDuration}{appliedSettings.calibratedDurationUnit.charAt(0)} duration</span>
          </div>
          <span className="text-slate-500 shrink-0">Consensus threshold ≥ {Math.round(appliedSettings.consensusThreshold * 100)}%</span>
        </div>
      )}
    </div>
  );
};
