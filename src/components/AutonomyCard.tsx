import React, { useState } from 'react';
import {
  Cpu,
  Play,
  Square,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  X,
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

  const [configuringPhase, setConfiguringPhase] = useState<'idle' | 'validating' | 'configuring' | 'starting'>('idle');
  const [showMobileErrors, setShowMobileErrors] = useState(false);

  const handlePrimaryClick = () => {
    sound.play('click');
    if (isRunning) {
      onStopAutonomy('user_button');
    } else {
      setConfiguringPhase('validating');
      setTimeout(() => {
        setConfiguringPhase('configuring');
        setTimeout(() => {
          setConfiguringPhase('starting');
          onRunAutonomously();
          setTimeout(() => setConfiguringPhase('idle'), 450);
        }, 220);
      }, 180);
    }
  };

  const errorList = Array.isArray(lastError)
    ? lastError
    : typeof lastError === 'string'
    ? [lastError]
    : [];

  return (
    <>
      {/* =========================================================================
          DESKTOP & TABLET VIEWPORT (≥ 480px): Dedicated Vertical Card in Flow
          ========================================================================= */}
      <div
        className={`hidden min-[480px]:block p-4 rounded-2xl border transition-all duration-300 backdrop-blur-md shadow-xl ${
          isRunning
            ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 border-cyan-500/50 shadow-cyan-950/30'
            : autonomyMode === 'ARMED'
            ? 'bg-slate-900/90 border-amber-500/40 shadow-amber-950/20'
            : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        {/* Configuration Phase Progress Feedback */}
        {configuringPhase !== 'idle' && (
          <div className="mb-3 p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-xs font-mono animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-[10px] text-cyan-300 font-bold mb-1.5">
              <span className="flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
                {configuringPhase === 'validating' && '1/3 VALIDATING DERIV SESSION & RISK CEILINGS...'}
                {configuringPhase === 'configuring' && '2/3 CALIBRATING SBAGENT INDICATOR WEIGHTS & HALF-KELLY...'}
                {configuringPhase === 'starting' && '3/3 STARTING AUTONOMOUS TRADING ENGINE...'}
              </span>
              <span className="text-cyan-400 font-mono shrink-0 ml-1">
                {configuringPhase === 'validating' ? '33%' : configuringPhase === 'configuring' ? '66%' : '100%'}
              </span>
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: configuringPhase === 'validating' ? '33%' : configuringPhase === 'configuring' ? '66%' : '100%',
                }}
              />
            </div>
          </div>
        )}

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
              {/* Status Pill */}
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

          {/* Action Buttons */}
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

        {/* Checklist / Blockers Error Container */}
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

      {/* =========================================================================
          NARROW VIEWPORTS (< 480px): Compact Fixed Horizontal Bar Docked
          Immediately Above MobileExecutionBar with Zero Critical Overlap
          ========================================================================= */}
      <div
        className="block min-[480px]:hidden fixed left-0 right-0 z-30 transition-all duration-200"
        style={{
          bottom: 'var(--mobile-exec-bar-height, 64px)',
        }}
      >
        {/* Mobile Prerequisites Error Sheet Popover (if toggled) */}
        {showMobileErrors && errorList.length > 0 && (
          <div className="mx-2 mb-1 p-2.5 bg-rose-950/95 border border-rose-500/50 rounded-xl shadow-2xl backdrop-blur-md text-[11px] font-mono animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between text-rose-300 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Autonomy Prerequisites ({errorList.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMobileErrors(false)}
                className="text-rose-400 hover:text-white p-0.5"
                aria-label="Dismiss errors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="space-y-0.5 pl-3 list-disc text-rose-200/90 text-[10px]">
              {errorList.map((err, i) => (
                <li key={i} className="leading-tight">{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Thin Configuration Progress Strip during start sequence */}
        {configuringPhase !== 'idle' && (
          <div className="w-full bg-slate-900/95 border-t border-cyan-500/40 px-3 py-1 font-mono text-[10px] text-cyan-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span className="truncate">
                {configuringPhase === 'validating' && '1/3 Validating Session & Risk...'}
                {configuringPhase === 'configuring' && '2/3 Calibrating SBAgent Rules...'}
                {configuringPhase === 'starting' && '3/3 Starting Autonomy...'}
              </span>
            </span>
            <span className="text-cyan-400 font-bold ml-1 shrink-0">
              {configuringPhase === 'validating' ? '33%' : configuringPhase === 'configuring' ? '66%' : '100%'}
            </span>
          </div>
        )}

        {/* Compact Docked Horizontal Bar */}
        <div
          className={`mx-auto px-2.5 py-1.5 border-t backdrop-blur-xl transition-all shadow-[0_-4px_12px_rgba(0,0,0,0.5)] flex items-center justify-between gap-1.5 ${
            isRunning
              ? 'bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/90 border-cyan-500/40'
              : autonomyMode === 'ARMED'
              ? 'bg-slate-950/95 border-amber-500/40'
              : 'bg-slate-950/95 border-slate-800'
          }`}
        >
          {/* Left: Status Dot, Mode Chip, Symbol & Calibrated Stake */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                isRunning
                  ? 'bg-cyan-500 text-slate-950 animate-pulse'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
            </div>

            <div className="flex flex-col min-w-0 font-mono">
              <div className="flex items-center gap-1 leading-none">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isRunning
                      ? 'bg-cyan-400 animate-ping'
                      : autonomyMode === 'ARMED'
                      ? 'bg-amber-400'
                      : 'bg-slate-500'
                  }`}
                />
                <span
                  className={`text-[10px] font-bold uppercase truncate ${
                    isRunning
                      ? 'text-cyan-300'
                      : autonomyMode === 'ARMED'
                      ? 'text-amber-300'
                      : 'text-slate-400'
                  }`}
                >
                  {autonomyMode}
                </span>
                <span className="text-slate-600 text-[9px]">•</span>
                <span className="text-[10px] text-slate-300 font-bold truncate">
                  {sbagentAutonomyGrant ? 'SBAgent' : 'Manual'}
                </span>
              </div>

              <div className="text-[9px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
                <span className="text-white font-semibold truncate">{currentSymbol}</span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-300 shrink-0">
                  ${appliedSettings?.calibratedStake ? appliedSettings.calibratedStake.toFixed(2) : autonomyPreset.risk.maxStake.toFixed(2)}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-purple-300 truncate">
                  {autonomyPreset.allowedSymbols.length} Assets
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions (Prerequisites alert, Configure, Run/Stop) */}
          <div className="flex items-center gap-1 shrink-0">
            {errorList.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMobileErrors(!showMobileErrors)}
                className="h-8 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 text-[10px] font-mono font-bold flex items-center gap-1 active:scale-95 transition-all"
                title="View prerequisite errors"
              >
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>{errorList.length}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sound.play('click');
                onConfigure();
              }}
              disabled={isRunning}
              className="h-8 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-mono text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all disabled:opacity-40"
              title="Configure Autonomy Preset"
            >
              <Sliders className="w-3 h-3 text-cyan-400" />
              <span className="hidden min-[360px]:inline">Config</span>
            </button>

            <button
              type="button"
              onClick={handlePrimaryClick}
              className={`h-8 px-2.5 rounded-lg font-mono font-black text-[10px] tracking-wide transition-all shadow-md flex items-center gap-1 active:scale-95 ${
                isRunning
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-950/40'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-950/40'
              }`}
            >
              {isRunning ? (
                <>
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>STOP</span>
                </>
              ) : (
                <>
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>RUN AUTO</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
