import React, { useState } from 'react';
import { TradingAgent, AgentEvolutionLog } from '../types/trading';
import { GitBranch, Brain, Sparkles, TrendingUp, ShieldCheck, RefreshCw, Zap, Award, ArrowUpRight, History } from 'lucide-react';
import { motion } from 'motion/react';

interface AgentEvolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: TradingAgent[];
  evolutionLogs: AgentEvolutionLog[];
  onTriggerEvolution: () => Promise<void>;
  isEvolving: boolean;
}

export const AgentEvolutionModal: React.FC<AgentEvolutionModalProps> = ({
  isOpen,
  onClose,
  agents,
  evolutionLogs,
  onTriggerEvolution,
  isEvolving,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'logs'>('matrix');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">Multi-Agent Self-Evolution Engine</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-purple-950/80 border border-purple-500/30 text-purple-300 rounded-md">
                  Bayesian Reinforcement
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Agents dynamically adapt their internal indicator weights based on closed trade results
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onTriggerEvolution}
              disabled={isEvolving}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-purple-950/40 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvolving ? 'animate-spin' : ''}`} />
              {isEvolving ? 'Evolving Agents...' : 'Run Evolution Cycle'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'matrix'
                ? 'bg-slate-800 text-purple-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> Evolved Agent Weights
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-purple-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Evolution History Log
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {activeTab === 'matrix' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2.5 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-200">{agent.displayName}</div>
                      <div className="text-[10px] text-slate-400">{agent.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-purple-400">
                        {(agent.winRate * 100).toFixed(1)}% Win Rate
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {agent.wins}W / {agent.trades - agent.wins}L
                      </div>
                    </div>
                  </div>

                  {/* Weights progress */}
                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>MA Weight:</span>
                      <span className="text-slate-200">{(agent.weights.ma * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, agent.weights.ma * 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Momentum:</span>
                      <span className="text-slate-200">{(agent.weights.momentum * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, agent.weights.momentum * 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>RSI Oscillator:</span>
                      <span className="text-slate-200">{(agent.weights.rsi * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, agent.weights.rsi * 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Bollinger Bands:</span>
                      <span className="text-slate-200">{(agent.weights.bb * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, agent.weights.bb * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {evolutionLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl text-xs">
                  No self-evolution cycles recorded yet. Evolution triggers automatically as closed trades accumulate.
                </div>
              ) : (
                evolutionLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-1.5 text-xs font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-300">{log.agentName}</span>
                      <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-sans">{log.reason}</div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <ArrowUpRight className="w-3 h-3" /> Metric: {log.improvementMetric}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            Reinforcement cycles save directly to Firebase Firestore for cross-session continuity.
          </span>
        </div>
      </div>
    </div>
  );
};
