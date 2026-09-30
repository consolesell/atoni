import React from 'react';
import { X, HelpCircle, Sparkles, Bot, Zap, ShieldCheck, TrendingUp, Layers } from 'lucide-react';

interface PlatformHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlatformHelpModal: React.FC<PlatformHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 font-sans">
                sbatomic4.1 User Guide
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Architecture, Multi-Agent Consensus & sbagent Integration
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex flex-col gap-5 font-sans text-xs text-slate-300 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
          {/* Section 1: Overview */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col gap-2">
            <h4 className="font-bold text-sm text-cyan-400 flex items-center gap-2 font-mono">
              <Zap className="w-4 h-4" /> 1. How Rise/Fall Trading Works
            </h4>
            <p>
              Deriv Rise/Fall options pay out if the market price at contract expiry is strictly higher (for Rise/Call) or lower (for Fall/Put) than your entry spot price. Payouts are typically ~95% net on winning contracts.
            </p>
          </div>

          {/* Section 2: Multi-Agent Consensus */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col gap-2">
            <h4 className="font-bold text-sm text-indigo-400 flex items-center gap-2 font-mono">
              <Bot className="w-4 h-4" /> 2. 4-Agent Algorith deliberation
            </h4>
            <p>
              Four mathematical agents continuously evaluate market geometry:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li><strong>Trend Follower:</strong> Emphasizes MA crosses (14/50), persistent directional trends.</li>
              <li><strong>Mean Reversion:</strong> Targets extreme RSI (overbought &gt;70 / oversold &lt;30) and Bollinger Band edges.</li>
              <li><strong>Volatility Scalper:</strong> Exploits ATR expansion bursts and micro-structure tick momentum.</li>
              <li><strong>Balanced Alpha:</strong> Computes weighted consensus score from -10 (extreme bearish) to +10 (extreme bullish).</li>
            </ul>
          </div>

          {/* Section 3: sbagent AI Integration */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col gap-2">
            <h4 className="font-bold text-sm text-cyan-400 flex items-center gap-2 font-mono">
              <Sparkles className="w-4 h-4" /> 3. Server-Side sbagent Intelligence
            </h4>
            <p>
              sbagent analyzes live candlestick sequences, volatility regimes, and multi-timeframe trends to provide:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li><strong>Directional Validation:</strong> Verifies if the mathematical signal holds high win probability (&gt;55%).</li>
              <li><strong>AI Direction Match Gate:</strong> Blocks trades if algorithmic consensus and sbagent disagree.</li>
              <li><strong>Duration Optimization:</strong> Suggests the exact contract duration (5m–60m) best suited for the move speed.</li>
              <li><strong>Post-Trade Debrief:</strong> Generates automated performance debriefs on closed trades.</li>
            </ul>
          </div>

          {/* Section 4: Auto-Bot & Risk Management */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col gap-2">
            <h4 className="font-bold text-sm text-emerald-400 flex items-center gap-2 font-mono">
              <ShieldCheck className="w-4 h-4" /> 4. Safety Guardrails
            </h4>
            <p>
              The built-in risk manager automatically pauses trading if your Daily Loss Limit is reached, if a consecutive loss streak occurs (cooling-off period), or if volatility spikes into erratic regimes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 text-slate-950 font-bold rounded-xl text-xs font-mono transition-all shadow-md shadow-cyan-500/20"
          >
            Got It, Let's Trade
          </button>
        </div>
      </div>
    </div>
  );
};
