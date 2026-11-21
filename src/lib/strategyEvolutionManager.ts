import {
  StrategyEvolutionProposal,
  StrategyParameters,
  StrategyPerformanceMetrics,
  StrategyRolloutMode,
  StrategyVersionRecord,
  TradeRecord,
} from '../types/trading';

const STORAGE_KEY = 'sbatomic_strategy_evolution_v1';

function createEmptyMetrics(): StrategyPerformanceMetrics {
  return {
    tradesCount: 0,
    wins: 0,
    losses: 0,
    earlyExits: 0,
    winRate: 0,
    netProfit: 0,
    grossProfit: 0,
    grossLoss: 0,
    profitFactor: 1.0,
    expectancy: 0,
    maxDrawdownPercent: 0,
    aiAlignmentWinRate: 0,
    regimeBreakdown: {},
    symbolBreakdown: {},
  };
}

export const BASELINE_STRATEGY_PARAMETERS: StrategyParameters = {
  minConfidence: 0.45,
  consensusThreshold: 0.62,
  kellyFractionScale: 0.5,
  maxStakePercent: 0.05,
  rsiOverbought: 70,
  rsiOversold: 30,
  earlyExit: {
    profitTargetPercent: 60,
    profitLockTriggerPercent: 35,
    profitProtectionDrawdownPercent: 40,
    maxLossPercent: 50,
  },
};

export interface CandidateEvaluationPolicy {
  maxAllowedDrawdownPercent: number; // e.g. 12%
  minProfitFactor: number; // e.g. 1.05
  minSampleSize: number; // e.g. 5
  postPromotionDegradationWinRateDrop: number; // e.g. 0.15 (15 pts drop triggers rollback)
  postPromotionMaxConsecutiveLosses: number; // e.g. 4
}

const DEFAULT_POLICY: CandidateEvaluationPolicy = {
  maxAllowedDrawdownPercent: 12.0,
  minProfitFactor: 1.02,
  minSampleSize: 5,
  postPromotionDegradationWinRateDrop: 0.18,
  postPromotionMaxConsecutiveLosses: 4,
};

interface PersistedEvolutionState {
  activeVersion: string;
  rolloutMode: StrategyRolloutMode;
  versions: StrategyVersionRecord[];
  proposals: StrategyEvolutionProposal[];
}

export class StrategyEvolutionManager {
  private state: PersistedEvolutionState;
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private listeners: Set<(state: PersistedEvolutionState) => void> = new Set();

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage =
      storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
    this.state = this.load();
  }

  private createBaselineState(): PersistedEvolutionState {
    const baseline: StrategyVersionRecord = {
      version: 'v4.1.0-baseline',
      parentVersion: null,
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      status: 'ACTIVE',
      rationale: 'Calibrated Half-Kelly multi-agent consensus baseline with Deriv early-exit profit protection.',
      parameters: structuredClone(BASELINE_STRATEGY_PARAMETERS),
      metrics: createEmptyMetrics(),
    };
    return {
      activeVersion: baseline.version,
      rolloutMode: 'MANUAL_APPROVAL',
      versions: [baseline],
      proposals: [],
    };
  }

  private load(): PersistedEvolutionState {
    if (!this.storage) return this.createBaselineState();
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return this.createBaselineState();
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.versions) && parsed.versions.length > 0) {
        return {
          activeVersion: parsed.activeVersion || parsed.versions[0].version,
          rolloutMode: parsed.rolloutMode || 'MANUAL_APPROVAL',
          versions: parsed.versions,
          proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
        };
      }
    } catch {
      // fallback to baseline
    }
    return this.createBaselineState();
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore quota errors
    }
  }

  public getState(): PersistedEvolutionState {
    return {
      ...this.state,
      versions: [...this.state.versions],
      proposals: [...this.state.proposals],
    };
  }

  public getActiveVersion(): StrategyVersionRecord {
    return (
      this.state.versions.find((v) => v.version === this.state.activeVersion) ||
      this.state.versions[0]
    );
  }

  public setRolloutMode(mode: StrategyRolloutMode): void {
    this.state.rolloutMode = mode;
    this.persist();
    this.notify();
  }

  /**
   * Attributes a completed trade to its strategy version metrics, including regime & early-exit breakdown.
   */
  public recordCompletedTrade(
    trade: TradeRecord,
    aiAligned = false
  ): { rollbackTriggered: boolean; rollbackReason?: string } {
    if (trade.result !== 'WIN' && trade.result !== 'LOSS' && trade.result !== 'SOLD') {
      return { rollbackTriggered: false };
    }

    const versionKey = trade.strategyVersion || this.state.activeVersion;
    const versionIdx = this.state.versions.findIndex((v) => v.version === versionKey);
    const target =
      versionIdx >= 0 ? this.state.versions[versionIdx] : this.getActiveVersion();

    const m = { ...target.metrics };
    m.tradesCount += 1;
    const profit = Number(trade.profit || 0);
    const isWin = profit > 0 || trade.result === 'WIN';
    if (isWin) {
      m.wins += 1;
      m.grossProfit = Number((m.grossProfit + Math.max(0, profit)).toFixed(2));
    } else {
      m.losses += 1;
      m.grossLoss = Number((m.grossLoss + Math.abs(Math.min(0, profit))).toFixed(2));
    }
    if (trade.result === 'SOLD') {
      m.earlyExits += 1;
    }

    m.netProfit = Number((m.netProfit + profit).toFixed(2));
    m.winRate = m.tradesCount > 0 ? Number((m.wins / m.tradesCount).toFixed(4)) : 0;
    m.profitFactor =
      m.grossLoss > 0 ? Number((m.grossProfit / m.grossLoss).toFixed(2)) : m.grossProfit > 0 ? 5.0 : 1.0;
    m.expectancy = Number((m.netProfit / Math.max(1, m.tradesCount)).toFixed(3));
    if (aiAligned && isWin) {
      m.aiAlignmentWinRate = Number(
        ((m.aiAlignmentWinRate * (m.tradesCount - 1) + 1) / m.tradesCount).toFixed(3)
      );
    }

    const regimeKey = trade.regime || 'NEUTRAL';
    const prevRegime = m.regimeBreakdown[regimeKey] || { trades: 0, wins: 0, netProfit: 0 };
    m.regimeBreakdown = {
      ...m.regimeBreakdown,
      [regimeKey]: {
        trades: prevRegime.trades + 1,
        wins: prevRegime.wins + (isWin ? 1 : 0),
        netProfit: Number((prevRegime.netProfit + profit).toFixed(2)),
      },
    };

    const symKey = trade.symbol || 'UNKNOWN';
    const prevSym = m.symbolBreakdown[symKey] || { trades: 0, wins: 0, netProfit: 0 };
    m.symbolBreakdown = {
      ...m.symbolBreakdown,
      [symKey]: {
        trades: prevSym.trades + 1,
        wins: prevSym.wins + (isWin ? 1 : 0),
        netProfit: Number((prevSym.netProfit + profit).toFixed(2)),
      },
    };

    target.metrics = m;

    // Automatic rollback check if newly promoted strategy degrades materially
    let rollbackTriggered = false;
    let rollbackReason: string | undefined;
    if (
      target.version === this.state.activeVersion &&
      target.parentVersion &&
      m.tradesCount >= DEFAULT_POLICY.minSampleSize
    ) {
      const parent = this.state.versions.find((v) => v.version === target.parentVersion);
      if (parent && parent.metrics.tradesCount >= DEFAULT_POLICY.minSampleSize) {
        const winDrop = parent.metrics.winRate - m.winRate;
        if (winDrop > DEFAULT_POLICY.postPromotionDegradationWinRateDrop || m.profitFactor < 0.72) {
          rollbackReason = `Post-promotion deterioration detected (${(m.winRate * 100).toFixed(1)}% WR, PF ${m.profitFactor.toFixed(2)} vs parent ${(parent.metrics.winRate * 100).toFixed(1)}%). Automatically rolled back to ${parent.version}.`;
          this.rollbackToParent(rollbackReason);
          rollbackTriggered = true;
        }
      }
    }

    this.persist();
    this.notify();
    return { rollbackTriggered, rollbackReason };
  }

  /**
   * Evaluates and validates a candidate parameter set against strict bounded safety rules
   * and historical closed trade outcomes. Explicitly rejects loss-recovery / Martingale escalation.
   */
  public validateCandidateProposal(params: {
    proposedParameters: StrategyParameters;
    rationale: string;
    closedTrades: TradeRecord[];
    lossRecoveryEscalationRequested?: boolean;
  }): StrategyEvolutionProposal {
    const active = this.getActiveVersion();
    const rejections: string[] = [];

    if (params.lossRecoveryEscalationRequested) {
      rejections.push('Loss-recovery stake escalation (Martingale doubling) is strictly forbidden.');
    }

    const p = params.proposedParameters;
    if (p.maxStakePercent > 0.08 || p.maxStakePercent < 0.01) {
      rejections.push(`Proposed maxStakePercent (${(p.maxStakePercent * 100).toFixed(1)}%) outside safe 1%–8% bounds.`);
    }
    if (p.kellyFractionScale > 0.5 || p.kellyFractionScale < 0.1) {
      rejections.push(`Proposed Kelly scale (${p.kellyFractionScale}) outside safe 0.10–0.50 Half-Kelly cap.`);
    }
    if (p.minConfidence < 0.35 || p.minConfidence > 0.9) {
      rejections.push(`Proposed minConfidence (${p.minConfidence}) outside safe 0.35–0.90 range.`);
    }

    // Evaluate against historical settled trades
    const settled = params.closedTrades.filter(
      (t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'SOLD'
    );
    const filtered = settled.filter((t) => (t.confidence ?? 0.6) >= p.minConfidence);
    const wins = filtered.filter((t) => (t.profit || 0) > 0 || t.result === 'WIN');
    const losses = filtered.filter((t) => !((t.profit || 0) > 0 || t.result === 'WIN'));
    const grossProfit = wins.reduce((acc, t) => acc + Math.max(0, t.profit || 0), 0);
    const grossLoss = losses.reduce((acc, t) => acc + Math.abs(Math.min(0, t.profit || 0)), 0);
    const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 3.0 : 1.0;

    // Estimate max drawdown across filtered sequence
    let peak = 0;
    let running = 0;
    let maxDrop = 0;
    for (const t of filtered) {
      running += t.profit || 0;
      if (running > peak) peak = running;
      const drop = peak - running;
      if (drop > maxDrop) maxDrop = drop;
    }
    const simulatedMaxDD = Math.min(100, Number((maxDrop * 2).toFixed(2)));

    if (settled.length >= DEFAULT_POLICY.minSampleSize) {
      if (filtered.length < Math.min(3, DEFAULT_POLICY.minSampleSize)) {
        rejections.push('Proposed confidence filter leaves too few historical trades for reliable evaluation.');
      } else if (pf < DEFAULT_POLICY.minProfitFactor && wins.length <= losses.length) {
        rejections.push(`Historical Profit Factor (${pf.toFixed(2)}) below minimum ${DEFAULT_POLICY.minProfitFactor.toFixed(2)}.`);
      }
      if (simulatedMaxDD > DEFAULT_POLICY.maxAllowedDrawdownPercent) {
        rejections.push(`Simulated drawdown (${simulatedMaxDD.toFixed(1)}%) exceeds ${DEFAULT_POLICY.maxAllowedDrawdownPercent}% ceiling.`);
      }
    }

    const baseWinRate = active.metrics.tradesCount > 0 ? active.metrics.winRate : 0.55;
    const candidateWinRate = filtered.length > 0 ? wins.length / filtered.length : baseWinRate;

    const candidateNumber = this.state.versions.length;
    const proposal: StrategyEvolutionProposal = {
      id: `evo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      candidateVersion: `v4.1.${candidateNumber}`,
      baseVersion: active.version,
      createdAt: Date.now(),
      rationale: params.rationale,
      proposedParameters: p,
      expectedWinRateDelta: Number(((candidateWinRate - baseWinRate) * 100).toFixed(1)),
      expectedProfitFactor: Number(pf.toFixed(2)),
      simulatedMaxDrawdownPercent: simulatedMaxDD,
      riskCheckPassed: rejections.length === 0,
      riskRejectionReasons: rejections,
    };

    this.state.proposals.unshift(proposal);
    if (this.state.proposals.length > 25) {
      this.state.proposals = this.state.proposals.slice(0, 25);
    }

    if (proposal.riskCheckPassed && this.state.rolloutMode === 'AUTO_PROMOTE_SAFE') {
      this.promoteProposal(proposal.id);
    } else {
      this.persist();
      this.notify();
    }

    return proposal;
  }

  /**
   * Generates a bounded optimization candidate from empirical closed trades.
   */
  public generateBoundedCandidate(closedTrades: TradeRecord[]): StrategyEvolutionProposal {
    const active = this.getActiveVersion();
    const settled = closedTrades.filter(
      (t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'SOLD'
    );
    const losses = settled.filter((t) => (t.profit || 0) <= 0);
    const avgLossConf =
      losses.length > 0
        ? losses.reduce((a, t) => a + (t.confidence || 0.55), 0) / losses.length
        : active.parameters.minConfidence;

    const nextMinConf = Number(
      Math.min(0.75, Math.max(0.4, Math.max(active.parameters.minConfidence, avgLossConf + 0.04))).toFixed(2)
    );
    const nextConsensus = Number(
      Math.min(0.78, Math.max(0.55, active.parameters.consensusThreshold + (losses.length > settled.length / 2 ? 0.03 : 0))).toFixed(2)
    );

    const proposedParameters: StrategyParameters = {
      ...active.parameters,
      minConfidence: nextMinConf,
      consensusThreshold: nextConsensus,
      earlyExit: {
        ...active.parameters.earlyExit,
        profitLockTriggerPercent: Math.max(25, active.parameters.earlyExit.profitLockTriggerPercent - 5),
      },
    };

    return this.validateCandidateProposal({
      proposedParameters,
      rationale: `Tightened minConfidence to ${Math.round(nextMinConf * 100)}% and profit protection trigger to +${proposedParameters.earlyExit.profitLockTriggerPercent}% from ${settled.length} closed trades.`,
      closedTrades,
    });
  }

  public promoteProposal(proposalId: string): { ok: boolean; version?: StrategyVersionRecord; reason?: string } {
    const proposal = this.state.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      return { ok: false, reason: 'Strategy evolution proposal not found.' };
    }
    if (!proposal.riskCheckPassed) {
      return {
        ok: false,
        reason: `Cannot promote unsafe proposal: ${proposal.riskRejectionReasons.join('; ')}`,
      };
    }

    const currentActive = this.getActiveVersion();
    if (currentActive.status === 'ACTIVE') {
      currentActive.status = 'RETIRED';
      currentActive.retiredAt = new Date().toISOString();
    }

    const newVersion: StrategyVersionRecord = {
      version: proposal.candidateVersion,
      parentVersion: currentActive.version,
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      status: 'ACTIVE',
      rationale: proposal.rationale,
      parameters: structuredClone(proposal.proposedParameters),
      metrics: createEmptyMetrics(),
    };

    proposal.approved = true;
    this.state.versions.unshift(newVersion);
    this.state.activeVersion = newVersion.version;
    this.persist();
    this.notify();
    return { ok: true, version: newVersion };
  }

  public rollbackToParent(reason: string): { ok: boolean; activeVersion: string } {
    const current = this.getActiveVersion();
    if (!current.parentVersion) {
      return { ok: false, activeVersion: current.version };
    }
    const parent = this.state.versions.find((v) => v.version === current.parentVersion);
    if (!parent) {
      return { ok: false, activeVersion: current.version };
    }

    current.status = 'ROLLED_BACK';
    current.retiredAt = new Date().toISOString();
    current.rollbackReason = reason;

    parent.status = 'ACTIVE';
    parent.activatedAt = new Date().toISOString();
    this.state.activeVersion = parent.version;

    this.persist();
    this.notify();
    return { ok: true, activeVersion: parent.version };
  }

  public subscribe(listener: (state: PersistedEvolutionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getState();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const strategyEvolutionManager = new StrategyEvolutionManager();
