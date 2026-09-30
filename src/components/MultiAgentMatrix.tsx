import React from 'react';
import { TradingAgent, DecisionResult } from '../types/trading';
import { Bot, Trophy, Activity, Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MultiAgentMatrixProps {
  agents: TradingAgent[];
  decision: DecisionResult | null;
}

export const MultiAgentMatrix: React.FC<MultiAgentMatrixProps> = ({ agents, decision }) => {
  const activeAgentName = decision?.agent;
  const compositeSignal = decision?.compositeSignal ?? 0;

  return (
    <div className="flex flex-col gap-4 p-5 bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl backdrop-blur-md">
      {/* Title & Composite Score */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono tracking-wider text-slate-200">
              MULTI-AGENT DELIBERATION MATRIX
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              4 Specialized Algorithmic Agents Consensus Engine
            </span>
          </div>
        </div>

        {/* Composite Consensus Pill */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 font-mono text-xs">
          <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Consensus Score:</span>
          <span
            className={`font-black ${
              compositeSignal > 1.5
                ? 'text-emerald-400'
                : compositeSignal < -1.5
                ? 'text-rose-400'
                : 'text-amber-400'
            }`}
          >
            {compositeSignal > 0 ? `+${compositeSignal.toFixed(2)}` : compositeSignal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Grid of 4 Agents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map((agent) => {
          const isLeading = agent.name === activeAgentName;
          const signal = agent.currentSignal ?? 0;
          const action = agent.recommendedAction ?? 'HOLD';

          return (
            <div
              key={agent.name}
              className={`p-4 rounded-xl border transition-all flex flex-col gap-2.5 ${
                isLeading
                  ? 'bg-gradient-to-br from-cyan-950/30 to-slate-900 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Agent Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isLeading ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {agent.displayName.slice(0, 1)}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                      <span>{agent.displayName}</span>
                      {isLeading && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          <Trophy className="w-2.5 h-2.5" /> LEADING
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Win Rate: <strong className="text-slate-200">{(agent.winRate * 100).toFixed(0)}%</strong> ({agent.trades} trades)
                    </div>
                  </div>
                </div>

                {/* Agent Signal Badge */}
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                    action === 'BUY'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : action === 'SELL'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  {action === 'BUY' ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : action === 'SELL' ? (
                    <TrendingDown className="w-3.5 h-3.5" />
                  ) : (
                    <Minus className="w-3.5 h-3.5" />
                  )}
                  <span>{action}</span>
                </div>
              </div>

              {/* Agent Description */}
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans line-clamp-2">
                {agent.description}
              </p>

              {/* Weights Breakdown */}
              <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-800/60 text-[10px] font-mono text-center">
                <div className="bg-slate-900/60 p-1 rounded">
                  <span className="text-slate-500 block">MA</span>
                  <span className="text-slate-200 font-bold">{agent.weights.ma.toFixed(1)}x</span>
                </div>
                <div className="bg-slate-900/60 p-1 rounded">
                  <span className="text-slate-500 block">MOM</span>
                  <span className="text-slate-200 font-bold">{agent.weights.momentum.toFixed(1)}x</span>
                </div>
                <div className="bg-slate-900/60 p-1 rounded">
                  <span className="text-slate-500 block">RSI</span>
                  <span className="text-slate-200 font-bold">{agent.weights.rsi.toFixed(1)}x</span>
                </div>
                <div className="bg-slate-900/60 p-1 rounded">
                  <span className="text-slate-500 block">BB</span>
                  <span className="text-slate-200 font-bold">{agent.weights.bb.toFixed(1)}x</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
