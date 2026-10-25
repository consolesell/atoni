import React, { useState } from 'react';
import {
  X,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  TrendingDown,
  Layers,
  Sparkles,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { AutonomyPreset } from '../types/autonomy';
import { DERIV_SYMBOLS } from '../lib/derivSymbols';
import { sound } from '../lib/soundEngine';

interface AutonomyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  preset: AutonomyPreset;
  onSavePreset: (updated: AutonomyPreset) => void;
}

export const AutonomyConfigModal: React.FC<AutonomyConfigModalProps> = ({
  isOpen,
  onClose,
  preset,
  onSavePreset,
}) => {
  const [maxStake, setMaxStake] = useState<number>(preset.risk.maxStake);
  const [sessionDrawdownCap, setSessionDrawdownCap] = useState<number>(preset.risk.sessionDrawdownCap);
  const [maxExposure, setMaxExposure] = useState<number>(preset.risk.maxExposure);
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState<number>(preset.risk.maxConsecutiveLosses);
  const [sizingMode, setSizingMode] = useState<AutonomyPreset['risk']['sizingMode']>(preset.risk.sizingMode);
  const [allowedSymbols, setAllowedSymbols] = useState<string[]>([...preset.allowedSymbols]);
  const [strategyProfile, setStrategyProfile] = useState<string>(preset.strategyProfile);

  if (!isOpen) return null;

  const toggleSymbol = (sym: string) => {
    sound.play('click');
    setAllowedSymbols((prev) => {
      if (prev.includes(sym)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((s) => s !== sym);
      }
      return [...prev, sym];
    });
  };

  const handleSave = () => {
    sound.play('click');
    const updatedPreset: AutonomyPreset = {
      ...preset,
      risk: {
        maxStake: Math.max(0.5, maxStake),
        sessionDrawdownCap: Math.max(1, Math.min(25, sessionDrawdownCap)),
        maxExposure: Math.max(2, maxExposure),
        maxConsecutiveLosses: Math.max(1, maxConsecutiveLosses),
        sizingMode,
      },
      allowedSymbols,
      strategyProfile,
    };
    onSavePreset(updatedPreset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 font-sans">Autonomous Operating Bounds</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 rounded-md">
                  Human Authority Enforced
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Set non-negotiable risk ceilings and rotation universe. SBAgent auto-fills mathematical execution inside these bounds.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.play('click');
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto max-h-[72vh] space-y-5 text-xs font-mono">
          {/* Section 1: Non-Negotiable Risk Ceilings */}
          <div className="space-y-3 p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center gap-2 text-slate-200 font-bold uppercase text-[11px] tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>1. Capital & Risk Ceilings</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Max Stake Ceiling */}
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">
                  MAX STAKE CEILING ($ USD)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.5"
                    max="50"
                    step="0.5"
                    value={maxStake}
                    onChange={(e) => setMaxStake(parseFloat(e.target.value) || 0.5)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-slate-500">MAX</span>
                </div>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Half-Kelly stake will never exceed this cap.
                </span>
              </div>

              {/* Session Drawdown Circuit Breaker */}
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">
                  SESSION DRAWDOWN CAP (% CEILING)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="0.5"
                    value={sessionDrawdownCap}
                    onChange={(e) => setSessionDrawdownCap(parseFloat(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-rose-400 font-bold focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-rose-400/80">% DD</span>
                </div>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Autonomous loop instantly severs if session drawdown hits this level.
                </span>
              </div>

              {/* Total Open Exposure Cap */}
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">
                  MAX OPEN PORTFOLIO EXPOSURE ($ USD)
                </label>
                <input
                  type="number"
                  min="2"
                  max="100"
                  step="1"
                  value={maxExposure}
                  onChange={(e) => setMaxExposure(parseFloat(e.target.value) || 2)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                />
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Combined active contract amount cap across all open positions.
                </span>
              </div>

              {/* Max Consecutive Losses */}
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">
                  CONSECUTIVE LOSS COOLDOWN LIMIT
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={maxConsecutiveLosses}
                  onChange={(e) => setMaxConsecutiveLosses(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none"
                />
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Enforces cooling HOLD period upon consecutive losses.
                </span>
              </div>
            </div>

            {/* Position Sizing Mode */}
            <div className="pt-2 border-t border-slate-900">
              <label className="text-slate-400 text-[10px] block mb-1.5">
                POSITION SIZING ALGORITHM
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'HALF_KELLY', label: 'Half-Kelly (Optimal)', sub: 'Default' },
                  { id: 'CONSERVATIVE_KELLY', label: 'Conservative (0.25x)', sub: 'Low Vol' },
                  { id: 'BASE_FLAT', label: 'Flat Minimum ($1.00)', sub: 'Fixed' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSizingMode(mode.id as any)}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      sizingMode === mode.id
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-[11px] truncate">{mode.label}</div>
                    <div className="text-[9px] text-slate-500">{mode.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Allowed Rotation Symbols */}
          <div className="space-y-3 p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>2. Permitted Market Universe ({allowedSymbols.length} Selected)</span>
              </div>
              <span className="text-[10px] text-slate-500">
                SBAgent only rotates within this list
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
              {DERIV_SYMBOLS.map((sym) => {
                const isSelected = allowedSymbols.includes(sym.symbol);
                return (
                  <button
                    key={sym.symbol}
                    type="button"
                    onClick={() => toggleSymbol(sym.symbol)}
                    className={`px-2 py-1.5 rounded-lg border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px]">{sym.symbol}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-cyan-400' : 'bg-slate-700'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Strategy Profile */}
          <div className="space-y-2 p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center gap-2 text-slate-200 font-bold uppercase text-[11px] tracking-wider">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>3. Strategy Document Governance</span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={strategyProfile}
                onChange={(e) => setStrategyProfile(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono focus:border-cyan-500 focus:outline-none flex-1"
              >
                <option value="sbagent.md-v4.1">sbagent.md (Active Core 4.1 Production)</option>
                <option value="sbagent.md-experimental">sbagent.md (Experimental Adaptive Squeeze)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between font-mono">
          <span className="text-[11px] text-slate-400">
            Saving arm the preset. Autonomy starts only when operator triggers "Run autonomously".
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all"
            >
              Save & Arm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
