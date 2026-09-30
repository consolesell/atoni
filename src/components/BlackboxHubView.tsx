import React from 'react';
import {
  Cpu,
  Activity,
  Zap,
  ShieldCheck,
  Crosshair,
  Lock,
  ArrowRight,
  RefreshCw,
  Sliders,
  Sparkles,
  Layers,
  Flame,
  Radio,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
} from 'lucide-react';
import {
  MarketRegime,
  TechnicalIndicators,
  TradingAgent,
  DecisionResult,
  AgenticMartingaleState,
  HighestWinGateResult,
  MarketStabilityMetrics,
  TrailingStopConfig,
} from '../types/trading';
import { SniperConfluenceResult } from '../types/sniper';
import { sound } from '../lib/soundEngine';

interface BlackboxHubViewProps {
  symbol: string;
  currentPrice: number;
  regime: MarketRegime;
  indicators: TechnicalIndicators | null;
  agents: TradingAgent[];
  decision: DecisionResult | null;
  sniperSetup: SniperConfluenceResult | null;
  highestWinGate: HighestWinGateResult | null;
  marketStability: MarketStabilityMetrics | null;
  martingaleState: AgenticMartingaleState;
  onUpdateMartingaleState: (updates: Partial<AgenticMartingaleState>) => void;
  trailingStopConfig: TrailingStopConfig;
  onUpdateTrailingStopConfig: (config: TrailingStopConfig) => void;
  botEnabled: boolean;
  onToggleBot: () => void;
  balance: number;
  onReplenishVirtualAnchor?: () => void;
  onSelectSymbol?: (symbol: string) => void;
}

export const BlackboxHubView: React.FC<BlackboxHubViewProps> = ({
  symbol,
  currentPrice,
  regime,
  indicators,
  agents,
  decision,
  sniperSetup,
  highestWinGate,
  marketStability,
  martingaleState,
  onUpdateMartingaleState,
  trailingStopConfig,
  onUpdateTrailingStopConfig,
  botEnabled,
  onToggleBot,
  balance,
  onReplenishVirtualAnchor,
  onSelectSymbol,
}) => {
  const stability = marketStability?.stabilityIndex ?? 82;
  const isStable = marketStability?.isStable ?? true;
  const winProb = highestWinGate?.winProbabilityScore ?? 74;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 bg-slate-950/80 border border-slate-800 rounded-2xl backdrop-blur-xl shadow-2xl">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-cyan-500/30 rounded-2xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3.5 z-10">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/25">
            <Cpu className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight font-sans">
                AUTONOMOUS INTELLIGENCE HUB (BLACKBOX)
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                CORE 4.1 ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Encapsulates High-Speed Data Streams • Strategy Reasoning • Agentic Decisions • Trade Execution
            </p>
          </div>
        </div>

        {/* Master Bot & Anchor Top Actions */}
        <div className="flex items-center gap-2.5 z-10">
          {balance < 2.0 && onReplenishVirtualAnchor && (
            <button
              onClick={() => {
                sound.play('click');
                onReplenishVirtualAnchor();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all animate-pulse"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Replenish Anchor ($10)
            </button>
          )}

          <button
            onClick={onToggleBot}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono font-black text-xs sm:text-sm tracking-wider transition-all shadow-lg ${
              botEnabled
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/25 font-black'
            }`}
          >
            {botEnabled ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>HALT BLACKBOX</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>ENGAGE BLACKBOX</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4 Unified Architecture Pipelines */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* PIPELINE 1: High-Speed Data Streams */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col gap-3 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-cyan-400 font-bold flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              1. DATA STREAMS
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
              OPTIMAL
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Selected Asset:</span>
              <span className="font-bold text-white">{symbol}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Spot Ticker:</span>
              <span className="font-bold text-cyan-300">${currentPrice}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Stream Latency:</span>
              <span className="font-bold text-emerald-400">&lt; 18ms</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Micro Noise Ratio:</span>
              <span className="font-bold text-slate-200">
                {marketStability?.noiseRatio ? `${marketStability.noiseRatio}x` : '1.1x'}
              </span>
            </div>
          </div>
        </div>

        {/* PIPELINE 2: Strategy Reasoning */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col gap-3 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-purple-400 font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              2. STRATEGY REASONING
            </span>
            <span className="text-[10px] text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
              4 AGENTS
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Consensus Action:</span>
              <span className={`font-bold ${decision?.action.includes('BUY') ? 'text-emerald-400' : decision?.action.includes('SELL') ? 'text-rose-400' : 'text-slate-300'}`}>
                {decision?.action || 'EVALUATING'}
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">RSI / Volatility:</span>
              <span className="font-bold text-slate-200">
                {indicators?.rsiNow?.toFixed(1) || '50.0'} / {((indicators?.volatility || 0.003) * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Pattern Signal:</span>
              <span className="font-bold text-amber-300 truncate max-w-[120px]">
                {indicators?.pattern?.pattern?.replace(/_/g, ' ') || 'Geometric scan'}
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Confidence:</span>
              <span className="font-bold text-purple-300">
                {Math.round((decision?.confidence || 0.6) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* PIPELINE 3: Agentic Decisions & Stability Gatekeeper */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col gap-3 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-amber-400 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              3. AGENTIC DECISIONING
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${isStable ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30' : 'text-amber-400 bg-amber-950/60 border-amber-500/30'}`}>
              MSI: {stability}%
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Win Filter Gate:</span>
              <span className={`font-bold ${highestWinGate?.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {highestWinGate?.passed ? 'PASSED (0 Gamble)' : 'FILTERED'}
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Quality Grade:</span>
              <span className="font-bold text-cyan-300">{highestWinGate?.qualityGrade || 'A'} ({winProb}%)</span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Martingale State:</span>
              <span className="font-bold text-amber-300">
                ${martingaleState.currentStake.toFixed(2)} (Step {martingaleState.currentStep}/3)
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Recovery Mode:</span>
              <span className="font-bold text-slate-200">{martingaleState.recoveryMode}</span>
            </div>
          </div>
        </div>

        {/* PIPELINE 4: Execution Engine (Sniper & Profit Lock) */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col gap-3 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-teal-400 font-bold flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" />
              4. TRADE EXECUTION
            </span>
            <span className="text-[10px] text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-500/30">
              SNIPER TSL
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Sniper Confluence:</span>
              <span className={`font-bold ${sniperSetup?.isPrimed ? 'text-emerald-400' : 'text-slate-300'}`}>
                {sniperSetup?.score ?? 70}% {sniperSetup?.isPrimed ? '(PRIMED)' : ''}
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Profit Lock Auto:</span>
              <span className="font-bold text-amber-400">
                {trailingStopConfig.profitLockEnabled ? `ON (${trailingStopConfig.profitLockThresholdPercent ?? 50}%)` : 'OFF'}
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Trailing Stop:</span>
              <span className="font-bold text-cyan-300">
                {trailingStopConfig.enabled ? `${trailingStopConfig.distanceValue} ${trailingStopConfig.distanceType}` : 'OFF'}
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Duration Bound:</span>
              <span className="font-bold text-slate-200">
                {sniperSetup?.recommendedDuration?.label || 'Strict 60s'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panels: Profit Lock Automation & Agentic Martingale Reasoning ($1 Base Stake) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Module 1: Trailing Stop-Loss & Profit Lock Engine Settings */}
        <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                  PROFIT LOCK AUTOMATION
                  <span className="text-[10px] text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">
                    REAL-TIME CREDITING
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Secures open gains directly into main balance when threshold is reached, while trade runs behind trailing stop.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={trailingStopConfig.profitLockEnabled ?? true}
                onChange={(e) => {
                  sound.play('toggle');
                  onUpdateTrailingStopConfig({
                    ...trailingStopConfig,
                    profitLockEnabled: e.target.checked,
                  });
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Threshold Selection */}
          <div className="flex flex-col gap-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">Target Profit Lock Threshold:</span>
              <span className="font-bold text-amber-400">
                {trailingStopConfig.profitLockThresholdPercent ?? 50}% of Max Payout
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs font-mono">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    sound.play('click');
                    onUpdateTrailingStopConfig({
                      ...trailingStopConfig,
                      profitLockThresholdPercent: pct,
                    });
                  }}
                  className={`py-1.5 rounded-lg font-bold border transition-all ${
                    (trailingStopConfig.profitLockThresholdPercent ?? 50) === pct
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 font-mono mt-1">
              • Once open contract reaches {trailingStopConfig.profitLockThresholdPercent ?? 50}%, that exact portion is credited to balance immediately.
            </p>
          </div>
        </div>

        {/* Module 4: Advanced Agentic Martingale Reasoning ($1 Base Stake) */}
        <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                  AGENTIC MARTINGALE REASONING
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/40">
                    $1.00 BASE ANCHOR
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Loss recovery awareness with controlled scaling backed by strict sniper entry confluence.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={martingaleState.enabled}
                onChange={(e) => {
                  sound.play('toggle');
                  onUpdateMartingaleState({ enabled: e.target.checked });
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          {/* Recovery State Metrics */}
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 text-[10px]">Base Stake</span>
              <span className="font-bold text-white">${martingaleState.baseStake.toFixed(2)}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 text-[10px]">Current Stake</span>
              <span className="font-bold text-cyan-300">${martingaleState.currentStake.toFixed(2)}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 text-[10px]">Cycle Drawdown</span>
              <span className={`font-bold ${martingaleState.cumulativeLoss > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${martingaleState.cumulativeLoss.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Tactical Adaptation Cycle Status */}
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-slate-300 font-bold">
                {martingaleState.activeTacticalDeepening
                  ? `Tactical Deepening: Requires ≥${martingaleState.minRecoveryConfluence}% Confluence`
                  : 'Equilibrium Mode: Base $1 Stake Protected'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Recovered: ${martingaleState.recoveredDrawdownAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Market Stability & Highest-Win Prioritization Bar */}
      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-white">Highest-Win Prioritization Engine:</span>
            <span className="text-emerald-400 ml-2">Active (Filters all low-probability gamble setups)</span>
          </div>
        </div>

        {marketStability?.switchRecommended && marketStability.targetStableSymbol && onSelectSymbol && (
          <div className="flex items-center gap-2">
            <span className="text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Noise high on {symbol}
            </span>
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                onSelectSymbol(marketStability.targetStableSymbol!);
              }}
              className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 font-bold transition-all"
            >
              Switch to {marketStability.targetStableSymbol}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
