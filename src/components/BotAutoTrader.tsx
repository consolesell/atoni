import React from 'react';
import {
  Bot,
  ShieldCheck,
  Zap,
  Sliders,
  Sparkles,
  AlertTriangle,
  Play,
  Square,
  Activity,
} from 'lucide-react';
import { BotState, AgenticMartingaleState, HighestWinGateResult, MarketStabilityMetrics } from '../types/trading';
import { sound } from '../lib/soundEngine';

interface BotAutoTraderProps {
  botState: BotState;
  onUpdateBotState: (updates: Partial<BotState>) => void;
  logs: { time: string; message: string; type: 'info' | 'success' | 'warn' | 'error' }[];
  onClearLogs: () => void;
  martingaleState?: AgenticMartingaleState;
  onUpdateMartingaleState?: (updates: Partial<AgenticMartingaleState>) => void;
  highestWinGate?: HighestWinGateResult | null;
  marketStability?: MarketStabilityMetrics | null;
}

export const BotAutoTrader: React.FC<BotAutoTraderProps> = ({
  botState,
  onUpdateBotState,
  logs,
  onClearLogs,
  martingaleState,
  onUpdateMartingaleState,
  highestWinGate,
  marketStability,
}) => {
  const toggleBot = () => {
    sound.play('toggle');
    onUpdateBotState({ enabled: !botState.enabled });
  };

  const handlePresetSelect = (preset: BotState['preset']) => {
    sound.play('click');
    if (preset === 'ultra_safe') {
      onUpdateBotState({
        preset,
        minConfidence: 0.65,
        aiDirectionMatchRequired: true,
        maxConsecutiveLosses: 3,
        maxDailyLoss: 15,
      });
    } else if (preset === 'balanced') {
      onUpdateBotState({
        preset,
        minConfidence: 0.45,
        aiDirectionMatchRequired: true,
        maxConsecutiveLosses: 5,
        maxDailyLoss: 30,
      });
    } else {
      // Aggressive
      onUpdateBotState({
        preset,
        minConfidence: 0.35,
        aiDirectionMatchRequired: false,
        maxConsecutiveLosses: 7,
        maxDailyLoss: 60,
      });
    }
  };

  return (
    <div className="flex flex-col gap-5 p-5 bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl backdrop-blur-md">
      {/* Top Banner with Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-xl flex items-center justify-center transition-all ${
              botState.enabled
                ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/25 animate-pulse'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-100 font-sans tracking-wide">
                AUTOMATED TRADING ENGINE
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  botState.enabled
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {botState.enabled ? 'ACTIVE & EVALUATING' : 'STOPPED'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Multi-agent algorithmic consensus + sbagent AI direction arbiter
            </p>
          </div>
        </div>

        {/* Big Start / Stop Button */}
        <button
          onClick={toggleBot}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono font-black text-xs sm:text-sm tracking-wider transition-all shadow-lg ${
            botState.enabled
              ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25'
          }`}
        >
          {botState.enabled ? (
            <>
              <Square className="w-4 h-4" />
              <span>STOP BOT</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>ACTIVATE AUTO-BOT</span>
            </>
          )}
        </button>
      </div>

      {/* Preset Profiles */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Strategy Risk Preset</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => handlePresetSelect('ultra_safe')}
            className={`p-3 rounded-xl border text-left font-mono transition-all ${
              botState.preset === 'ultra_safe'
                ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-md'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="font-bold text-xs text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Ultra-Safe
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Min Conf: 65% • Strict AI Match</div>
          </button>

          <button
            type="button"
            onClick={() => handlePresetSelect('balanced')}
            className={`p-3 rounded-xl border text-left font-mono transition-all ${
              botState.preset === 'balanced'
                ? 'bg-cyan-950/40 border-cyan-500/60 text-white shadow-md'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="font-bold text-xs text-cyan-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> Balanced Alpha
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Min Conf: 45% • AI Validation</div>
          </button>

          <button
            type="button"
            onClick={() => handlePresetSelect('aggressive_scalper')}
            className={`p-3 rounded-xl border text-left font-mono transition-all ${
              botState.preset === 'aggressive_scalper'
                ? 'bg-amber-950/40 border-amber-500/60 text-white shadow-md'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="font-bold text-xs text-amber-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> High Frequency
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Min Conf: 35% • Scalp Momentum</div>
          </button>
        </div>
      </div>

      {/* Advanced Parameters: Confidence Gate & AI Match Gate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
        {/* Confidence Floor Slider */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300">Minimum Execution Confidence Gate:</span>
            <span className="font-bold text-cyan-400">
              {Math.round(botState.minConfidence * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.85"
            step="0.05"
            value={botState.minConfidence}
            onChange={(e) => onUpdateBotState({ minConfidence: parseFloat(e.target.value) })}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>30% (Frequent)</span>
            <span>50% (Standard)</span>
            <span>85% (Ultra Selective)</span>
          </div>
        </div>

        {/* AI Direction Match Gate Checkbox */}
        <div className="flex flex-col justify-center gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-mono text-slate-200">
            <input
              type="checkbox"
              checked={botState.aiDirectionMatchRequired}
              onChange={(e) => onUpdateBotState({ aiDirectionMatchRequired: e.target.checked })}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-950"
            />
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Require sbagent AI Direction Agreement
            </span>
          </label>
          <p className="text-[11px] text-slate-400 leading-tight font-sans pl-6">
            When enabled, trades execute only if both the multi-agent algorithmic engine AND sbagent AI agree on Rise vs Fall direction.
          </p>
        </div>
      </div>

      {/* Safety Risk Guardrails */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-slate-400">Max Daily Loss Stop ($)</span>
          <input
            type="number"
            min="5"
            max="500"
            value={botState.maxDailyLoss}
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              if (!isNaN(num) && num > 0) {
                onUpdateBotState({ maxDailyLoss: num });
              }
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-bold outline-none"
          />
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-slate-400">Loss Streak Pause</span>
          <input
            type="number"
            min="2"
            max="10"
            value={botState.maxConsecutiveLosses}
            onChange={(e) => {
              const num = parseInt(e.target.value);
              if (!isNaN(num) && num >= 1) {
                onUpdateBotState({ maxConsecutiveLosses: num });
              }
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-bold outline-none"
          />
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-slate-400">Max Daily Trades</span>
          <input
            type="number"
            min="10"
            max="500"
            value={botState.maxDailyTrades}
            onChange={(e) => {
              const num = parseInt(e.target.value);
              if (!isNaN(num) && num >= 1) {
                onUpdateBotState({ maxDailyTrades: num });
              }
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-bold outline-none"
          />
        </div>
      </div>

      {/* Advanced Agentic Martingale & Highest-Win Filter Status */}
      {martingaleState && (
        <div className="p-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/25 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-slate-200 font-bold">
              Martingale Recovery Anchor ($1.00 Base):
            </span>
            <span className="text-cyan-300 font-black">
              ${martingaleState.currentStake.toFixed(2)} (Step {martingaleState.currentStep}/{martingaleState.maxSteps})
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              {martingaleState.recoveryMode}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Highest-Win Gate:</span>
            <span className={`font-bold ${highestWinGate?.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
              {highestWinGate?.passed ? `PASSED (${highestWinGate.winProbabilityScore}%)` : 'SELECTIVE FILTER'}
            </span>
          </div>
        </div>
      )}

      {/* Live Execution Activity Logs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 font-bold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Live Execution Stream
          </span>
          <button
            onClick={onClearLogs}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline"
          >
            Clear Stream
          </button>
        </div>

        <div className="h-36 overflow-y-auto bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-[11px] flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic text-center my-auto">
              Listening to market ticks and decision cycles...
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-slate-500 shrink-0">[{log.time}]</span>
                <span
                  className={
                    log.type === 'success'
                      ? 'text-emerald-400'
                      : log.type === 'error'
                      ? 'text-rose-400'
                      : log.type === 'warn'
                      ? 'text-amber-400'
                      : 'text-slate-300'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
