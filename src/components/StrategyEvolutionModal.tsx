import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  GitCommit,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Sliders,
  TrendingUp,
  FileCode,
  ShieldAlert,
  ArrowRight,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { sound } from '../lib/soundEngine';
import { strategyEvolutionManager } from '../lib/strategyEvolutionManager';
import { StrategyVersionRecord, StrategyEvolutionProposal, TradeRecord } from '../types/trading';

export interface StrategyMutationProposal {
  id: string;
  ruleCategory: string;
  proposedRule: string;
  rationale: string;
  targetSection?: string;
  expectedEdge: string;
  riskMitigation: string;
  timestamp: number;
}

export interface StrategyVersion {
  id: string;
  versionName: string;
  createdAt: number;
  author: string;
  ruleChangesSummary: string;
  trafficAllocation: number; // 0 to 100%
  tradesCount: number;
  winRate: number;
  profitFactor: number;
  isActive: boolean;
}

interface StrategyEvolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProposal: StrategyMutationProposal | null;
  closedTrades?: TradeRecord[];
  onApplyProposal: (proposal: StrategyMutationProposal) => void;
  onRejectProposal: () => void;
  onNotify?: (msg: string) => void;
}

export const StrategyEvolutionModal: React.FC<StrategyEvolutionModalProps> = ({
  isOpen,
  onClose,
  activeProposal,
  closedTrades = [],
  onApplyProposal,
  onRejectProposal,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'proposal' | 'versions' | 'ab_test'>('proposal');
  const [currentScript, setCurrentScript] = useState<string>('');
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [evolutionState, setEvolutionState] = useState(() => strategyEvolutionManager.getState());
  const [allocationA, setAllocationA] = useState(70);

  useEffect(() => {
    return strategyEvolutionManager.subscribe((next) => {
      setEvolutionState(next);
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCurrentScript();
      if (activeProposal) {
        setActiveTab('proposal');
      }
    }
  }, [isOpen, activeProposal]);

  const loadCurrentScript = async () => {
    setIsLoadingScript(true);
    try {
      const res = await fetch('/api/subagent/script');
      if (res.ok) {
        const data = await res.json();
        setCurrentScript(data.content || '');
      }
    } catch (err) {
      console.warn('Failed to load sbagent.md script', err);
    } finally {
      setIsLoadingScript(false);
    }
  };

  if (!isOpen) return null;

  const versions = evolutionState.versions;
  const activeVersion = evolutionState.versions.find((v) => v.version === evolutionState.activeVersion) || evolutionState.versions[0];
  const candidateOrParent = evolutionState.versions[1] || activeVersion;
  const latestCandidateProposal: StrategyEvolutionProposal | undefined = evolutionState.proposals[0];

  const handleApproveMutation = () => {
    if (!activeProposal) return;
    sound.play('trade');
    onApplyProposal(activeProposal);
    onNotify?.('Strategy mutation accepted! sbagent.md hot-reloaded.');
    onClose();
  };

  const handleGenerateRealCandidate = () => {
    sound.play('click');
    const proposal = strategyEvolutionManager.generateBoundedCandidate(closedTrades);
    onNotify?.(
      proposal.riskCheckPassed
        ? `Generated validated candidate ${proposal.candidateVersion}.`
        : `Candidate ${proposal.candidateVersion} rejected by risk filter: ${proposal.riskRejectionReasons.join('; ')}`
    );
  };

  const handlePromoteCandidate = (proposalId: string) => {
    const res = strategyEvolutionManager.promoteProposal(proposalId);
    if (res.ok) {
      sound.play('win');
      onNotify?.(`Promoted strategy version ${res.version?.version}.`);
    } else {
      onNotify?.(res.reason || 'Promotion blocked.');
    }
  };

  const handleRollbackVersion = (ver: StrategyVersionRecord) => {
    sound.play('click');
    const res = strategyEvolutionManager.rollbackToParent(`Manual rollback requested from ${evolutionState.activeVersion} toward ${ver.version}`);
    onNotify?.(
      res.ok
        ? `Rolled back active strategy to ${res.activeVersion}.`
        : `Active baseline ${res.activeVersion} has no parent rollback target.`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
                <span>STRATEGY EVOLUTION HUB</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  sbagent.md
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Self-Improvement Mutation Engine, Human Approval & A/B Version Testing
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sound.play('click');
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-5 text-xs font-mono font-semibold">
          <button
            onClick={() => {
              setActiveTab('proposal');
              sound.play('click');
            }}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'proposal'
                ? 'border-purple-500 text-purple-300 font-bold bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>Active Mutation Proposal</span>
            {activeProposal && (
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('versions');
              sound.play('click');
            }}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'versions'
                ? 'border-purple-500 text-purple-300 font-bold bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Version History ({versions.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('ab_test');
              sound.play('click');
            }}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'ab_test'
                ? 'border-purple-500 text-purple-300 font-bold bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>A/B Traffic Split & Benchmarks</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: ACTIVE MUTATION PROPOSAL */}
          {activeTab === 'proposal' && (
            <div className="space-y-4">
              {activeProposal ? (
                <div className="space-y-4">
                  {/* Alert banner */}
                  <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-purple-200 uppercase tracking-wide font-mono">
                        Human-in-the-Loop Autonomous Proposal
                      </h4>
                      <p className="text-xs text-purple-300/80 mt-1 leading-relaxed">
                        SBAgent analyzed empirical trade data and proposes modifying the strategy configuration.
                        No change is applied to <code>sbagent.md</code> without your explicit authorization.
                      </p>
                    </div>
                  </div>

                  {/* Proposal Metadata Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Rule Category</span>
                      <div className="text-purple-300 font-bold text-sm">{activeProposal.ruleCategory}</div>
                    </div>
                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Expected Mathematical Edge</span>
                      <div className="text-emerald-400 font-semibold">{activeProposal.expectedEdge || '+4.2% Expected Win Rate'}</div>
                    </div>
                  </div>

                  {/* Proposed Markdown Diff Block */}
                  <div className="space-y-2">
                    <label className="text-xs font-mono font-bold text-slate-300 flex items-center justify-between">
                      <span>Concrete Rule Mutation (Diff to sbagent.md)</span>
                      <span className="text-[10px] text-purple-400">Section: {activeProposal.targetSection || 'Section 4'}</span>
                    </label>
                    <div className="p-4 bg-slate-950 border border-purple-500/30 rounded-xl font-mono text-xs text-emerald-300 whitespace-pre-wrap leading-relaxed">
                      {activeProposal.proposedRule}
                    </div>
                  </div>

                  {/* Rationale & Learning Evidence */}
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-1.5">
                    <span className="text-[10px] text-slate-400 uppercase font-bold font-mono">Empirical Rationale</span>
                    <p className="text-slate-300 leading-relaxed font-sans">{activeProposal.rationale}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => {
                        sound.play('click');
                        onRejectProposal();
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold transition-colors"
                    >
                      Reject & Discard
                    </button>
                    <button
                      onClick={handleApproveMutation}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 text-white font-mono font-bold text-xs shadow-lg shadow-purple-600/30 transition-all active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>APPROVE & HOT-RELOAD SBAGENT</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-200 font-mono">
                    Active Strategy: {activeVersion?.version}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md font-mono">
                    Rollout Policy:{' '}
                    <button
                      onClick={() =>
                        strategyEvolutionManager.setRolloutMode(
                          evolutionState.rolloutMode === 'MANUAL_APPROVAL'
                            ? 'AUTO_PROMOTE_SAFE'
                            : 'MANUAL_APPROVAL'
                        )
                      }
                      className="text-purple-300 underline font-bold"
                    >
                      {evolutionState.rolloutMode}
                    </button>
                    . Generate bounded candidate parameters calibrated strictly from closed Deriv outcomes ({closedTrades.length} settled trades).
                  </p>
                  <button
                    onClick={handleGenerateRealCandidate}
                    className="mt-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-mono font-bold transition-all"
                  >
                    Evaluate & Propose Bounded Parameter Candidate
                  </button>

                  {latestCandidateProposal && (
                    <div className="w-full text-left p-4 mt-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">
                          Latest Candidate: {latestCandidateProposal.candidateVersion}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            latestCandidateProposal.riskCheckPassed
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {latestCandidateProposal.riskCheckPassed ? 'RISK VERIFIED' : 'REJECTED BY RISK FILTER'}
                        </span>
                      </div>
                      <p className="text-slate-300 font-sans">{latestCandidateProposal.rationale}</p>
                      {!latestCandidateProposal.riskCheckPassed ? (
                        <div className="text-rose-300 text-[11px]">
                          Blockers: {latestCandidateProposal.riskRejectionReasons.join(' | ')}
                        </div>
                      ) : (
                        !latestCandidateProposal.approved && (
                          <button
                            onClick={() => handlePromoteCandidate(latestCandidateProposal.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs"
                          >
                            Promote {latestCandidateProposal.candidateVersion} to Active
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VERSION HISTORY */}
          {activeTab === 'versions' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400 font-mono flex items-center justify-between">
                <span>Registered versioned strategy snapshots ({versions.length}):</span>
                <button
                  onClick={loadCurrentScript}
                  className="flex items-center gap-1 text-cyan-400 hover:underline"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingScript ? 'animate-spin' : ''}`} />
                  <span>Reload sbagent.md</span>
                </button>
              </div>

              <div className="space-y-3">
                {versions.map((ver) => {
                  const isActive = ver.version === evolutionState.activeVersion;
                  return (
                    <div
                      key={ver.version}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-purple-950/20 border-purple-500/50 shadow-md shadow-purple-950/40'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-100 font-mono">{ver.version}</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-slate-800 text-slate-300">
                            {ver.status}
                          </span>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              ACTIVE LIVE
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(ver.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mb-3">{ver.rationale}</p>
                      {ver.rollbackReason && (
                        <p className="text-[11px] text-amber-300 font-mono mb-2">
                          Rollback Note: {ver.rollbackReason}
                        </p>
                      )}

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs font-mono bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 mb-3">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Settled Trades</span>
                          <span className="font-bold text-slate-200">{ver.metrics.tradesCount}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Win Rate</span>
                          <span className={`font-bold ${ver.metrics.winRate >= 0.55 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {(ver.metrics.winRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Profit Factor</span>
                          <span className="font-bold text-cyan-400">{ver.metrics.profitFactor.toFixed(2)}</span>
                        </div>
                        <div className="hidden sm:block">
                          <span className="text-[10px] text-slate-500 block">Net P&L</span>
                          <span className={`font-bold ${ver.metrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {ver.metrics.netProfit >= 0 ? '+' : ''}${ver.metrics.netProfit.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {isActive && ver.parentVersion && (
                        <button
                          onClick={() => handleRollbackVersion(ver)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                          <span>Rollback to Parent ({ver.parentVersion})</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: BENCHMARK COMPARISON */}
          {activeTab === 'ab_test' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-purple-300 font-mono uppercase tracking-wide flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <span>Version Performance Comparison</span>
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-cyan-400 font-bold">Active Weight Share: {allocationA}%</span>
                    <span className="text-purple-400 font-bold">Shadow Evaluation: {100 - allocationA}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={allocationA}
                    onChange={(e) => setAllocationA(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[activeVersion, candidateOrParent].filter(Boolean).map((ver, idx) => (
                  <div
                    key={`${ver.version}_${idx}`}
                    className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 font-mono"
                  >
                    <div className="flex justify-between items-center">
                      <h5 className="font-bold text-sm text-cyan-300">
                        {idx === 0 ? 'Active Version' : 'Comparison Version'}
                      </h5>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                        {ver.version}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Settled Trades:</span>
                        <span className="text-slate-100 font-bold">{ver.metrics.tradesCount}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Win Rate:</span>
                        <span className="text-slate-100 font-bold">{(ver.metrics.winRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Profit Factor:</span>
                        <span className="text-slate-100 font-bold">{ver.metrics.profitFactor.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Early Exits:</span>
                        <span className="text-slate-100 font-bold">{ver.metrics.earlyExits}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Expectancy / Trade:</span>
                        <span className="text-slate-100 font-bold">
                          {ver.metrics.expectancy >= 0 ? '+' : ''}${ver.metrics.expectancy.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
