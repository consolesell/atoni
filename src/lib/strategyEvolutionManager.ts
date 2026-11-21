import {
  DurationPerformanceBucket,
  DurationUnit,
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
    durationBreakdown: {},
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

interface DurationOutcomeEntry {
  timestampMs: number;
  symbol: string;
  strategyId: string;
  strategyVersion: string;
  marketRegime: string;
  direction: string;
  duration: number;
  durationUnit: DurationUnit;
  chartTimeframeSeconds?: number;
  earlyExited: boolean;
  isWin: boolean;
  profit: number;
  amount: number;
}

interface PersistedEvolutionState {
  activeVersion: string;
  rolloutMode: StrategyRolloutMode;
  versions: StrategyVersionRecord[];
  proposals: StrategyEvolutionProposal[];
  durationOutcomes?: DurationOutcomeEntry[];
}

export interface DurationHorizonEvaluation {
  calibrated: boolean;
  uncalibrated: boolean;
  minSampleCount: number;
  totalMatchingTrades: number;
  bestBucket: DurationPerformanceBucket | null;
  buckets: DurationPerformanceBucket[];
  reason: string;
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
      durationOutcomes: [],
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
          durationOutcomes: Array.isArray(parsed.durationOutcomes) ? parsed.durationOutcomes : [],
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

    const reqDur = Number(trade.requestedDuration ?? trade.duration ?? 0);
    const reqUnit: DurationUnit = (trade.requestedDurationUnit ?? trade.durationUnit ?? 'minutes') as DurationUnit;
    const strategyId = trade.durationRecommendation?.strategyId || trade.agent || 'acde_core';
    const earlyExited = Boolean(trade.earlyExited || trade.result === 'SOLD');
    const tfSec = trade.chartTimeframeSeconds;
    const durKey = `${symKey}|${versionKey}|${regimeKey}|${trade.decision || 'UNK'}|${reqDur}${reqUnit}|tf:${tfSec ?? 'na'}|early:${earlyExited}`;

    const existingMap = m.durationBreakdown || {};
    const prevDur: DurationPerformanceBucket = existingMap[durKey] || {
      bucketKey: durKey,
      symbol: symKey,
      strategyId,
      strategyVersion: versionKey,
      marketRegime: regimeKey,
      direction: String(trade.decision || 'UNK'),
      duration: reqDur,
      durationUnit: reqUnit,
      chartTimeframeSeconds: tfSec,
      earlyExitCount: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netProfit: 0,
      avgPnL: 0,
      maxDrawdownPercent: 0,
      expectancy: 0,
      uncalibrated: true,
    };

    const nextTrades = prevDur.trades + 1;
    const nextWins = prevDur.wins + (isWin ? 1 : 0);
    const nextLosses = prevDur.losses + (isWin ? 0 : 1);
    const nextNet = Number((prevDur.netProfit + profit).toFixed(2));
    const nextAvgPnL = Number((nextNet / nextTrades).toFixed(3));
    const nextWinRate = Number((nextWins / nextTrades).toFixed(4));
    const stakeBase = Math.max(0.35, Number(trade.amount || 1));
    const tradeDdPct = profit < 0 ? Number(((Math.abs(profit) / stakeBase) * 100).toFixed(2)) : 0;

    m.durationBreakdown = {
      ...existingMap,
      [durKey]: {
        ...prevDur,
        earlyExitCount: prevDur.earlyExitCount + (earlyExited ? 1 : 0),
        trades: nextTrades,
        wins: nextWins,
        losses: nextLosses,
        winRate: nextWinRate,
        netProfit: nextNet,
        avgPnL: nextAvgPnL,
        expectancy: nextAvgPnL,
        maxDrawdownPercent: Math.max(prevDur.maxDrawdownPercent, tradeDdPct),
        uncalibrated: nextTrades < 8,
      },
    };

    const tsMs = Date.parse(trade.timestamp || '') || Date.now();
    const outcomes = this.state.durationOutcomes ? [...this.state.durationOutcomes] : [];
    outcomes.push({
      timestampMs: tsMs,
      symbol: symKey,
      strategyId,
      strategyVersion: versionKey,
      marketRegime: regimeKey,
      direction: String(trade.decision || 'UNK'),
      duration: reqDur,
      durationUnit: reqUnit,
      chartTimeframeSeconds: tfSec,
      earlyExited,
      isWin,
      profit,
      amount: stakeBase,
    });
    this.state.durationOutcomes = outcomes.slice(-400);

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
   * Evaluates candidate durations chronologically with an out-of-sample split.
   * Explicitly labels small-sample buckets `uncalibrated: true` and never lengthens duration to chase losses.
   */
  public evaluateDurationHorizons(params: {
    symbol?: string;
    strategyVersion?: string;
    strategyId?: string;
    regime?: string;
    direction?: string;
    minSamples?: number;
    outOfSampleRatio?: number;
    closedTrades?: TradeRecord[];
  }): DurationHorizonEvaluation {
    const minSamples = Math.max(3, params.minSamples ?? 8);
    const oosRatio = Math.min(0.45, Math.max(0.15, params.outOfSampleRatio ?? 0.3));

    const sourceEntries: DurationOutcomeEntry[] =
      params.closedTrades && params.closedTrades.length > 0
        ? params.closedTrades
            .filter((t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'SOLD')
            .map((t) => ({
              timestampMs: Date.parse(t.timestamp || '') || Date.now(),
              symbol: t.symbol || 'UNKNOWN',
              strategyId: t.durationRecommendation?.strategyId || t.agent || 'acde_core',
              strategyVersion: t.strategyVersion || this.state.activeVersion,
              marketRegime: t.regime || 'NEUTRAL',
              direction: String(t.decision || 'UNK'),
              duration: Number(t.requestedDuration ?? t.duration ?? 0),
              durationUnit: (t.requestedDurationUnit ?? t.durationUnit ?? 'minutes') as DurationUnit,
              chartTimeframeSeconds: t.chartTimeframeSeconds,
              earlyExited: Boolean(t.earlyExited || t.result === 'SOLD'),
              isWin: Number(t.profit || 0) > 0 || t.result === 'WIN',
              profit: Number(t.profit || 0),
              amount: Math.max(0.35, Number(t.amount || 1)),
            }))
        : [...(this.state.durationOutcomes || [])];

    const filtered = sourceEntries
      .filter((e) => e.duration > 0)
      .filter((e) => !params.symbol || e.symbol === params.symbol)
      .filter((e) => !params.strategyVersion || e.strategyVersion === params.strategyVersion)
      .filter((e) => !params.regime || e.marketRegime === params.regime)
      .filter((e) => !params.direction || e.direction === params.direction)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    if (filtered.length === 0) {
      return {
        calibrated: false,
        uncalibrated: true,
        minSampleCount: minSamples,
        totalMatchingTrades: 0,
        bestBucket: null,
        buckets: [],
        reason: 'No settled duration observations available; using explicit baseline rules (uncalibrated).',
      };
    }

    const groups = new Map<string, DurationOutcomeEntry[]>();
    for (const item of filtered) {
      const key = `${item.symbol}|${item.duration}|${item.durationUnit}|${item.marketRegime}`;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }

    const buckets: DurationPerformanceBucket[] = [];
    for (const [bucketKey, entries] of groups.entries()) {
      entries.sort((a, b) => a.timestampMs - b.timestampMs);
      const n = entries.length;
      const splitIdx = n >= 4 ? Math.max(1, Math.min(n - 1, Math.floor(n * (1 - oosRatio)))) : n;
      const oosEntries = n >= 4 ? entries.slice(splitIdx) : entries;

      const wins = entries.filter((e) => e.isWin).length;
      const netProfit = Number(entries.reduce((s, e) => s + e.profit, 0).toFixed(2));
      const avgPnL = Number((netProfit / n).toFixed(3));

      // Equity drawdown over chronological trade curve
      let running = 0;
      let peak = 0;
      let maxDrop = 0;
      const totalRiskBase = entries.reduce((s, e) => s + e.amount, 0) / n;
      for (const e of entries) {
        running += e.profit;
        if (running > peak) peak = running;
        const drop = peak - running;
        if (drop > maxDrop) maxDrop = drop;
      }
      const maxDdPct = Number(
        Math.min(100, (maxDrop / Math.max(1, totalRiskBase * Math.sqrt(n))) * 100).toFixed(2)
      );

      const oosWins = oosEntries.filter((e) => e.isWin).length;
      const oosNet = oosEntries.reduce((s, e) => s + e.profit, 0);
      const oosExp = Number((oosNet / Math.max(1, oosEntries.length)).toFixed(3));
      const oosWr = Number((oosWins / Math.max(1, oosEntries.length)).toFixed(4));
      const sampleUncalibrated = n < minSamples;

      const first = entries[0];
      buckets.push({
        bucketKey,
        symbol: first.symbol,
        strategyId: params.strategyId || first.strategyId,
        strategyVersion: params.strategyVersion || first.strategyVersion,
        marketRegime: first.marketRegime,
        direction: params.direction || first.direction,
        duration: first.duration,
        durationUnit: first.durationUnit,
        chartTimeframeSeconds: first.chartTimeframeSeconds,
        earlyExitCount: entries.filter((e) => e.earlyExited).length,
        trades: n,
        wins,
        losses: n - wins,
        winRate: Number((wins / n).toFixed(4)),
        netProfit,
        avgPnL,
        expectancy: avgPnL,
        maxDrawdownPercent: maxDdPct,
        uncalibrated: sampleUncalibrated,
        outOfSampleTrades: oosEntries.length,
        outOfSampleWinRate: oosWr,
        outOfSampleExpectancy: oosExp,
      });
    }

    buckets.sort((a, b) => {
      if (a.uncalibrated !== b.uncalibrated) return a.uncalibrated ? 1 : -1;
      const oosDiff = (b.outOfSampleExpectancy ?? b.expectancy) - (a.outOfSampleExpectancy ?? a.expectancy);
      if (Math.abs(oosDiff) > 0.001) return oosDiff;
      return b.winRate - a.winRate;
    });

    const calibratedBuckets = buckets.filter(
      (b) => !b.uncalibrated && (b.outOfSampleExpectancy ?? b.expectancy) > 0 && b.winRate >= 0.5
    );
    const bestBucket = calibratedBuckets[0] || null;
    const uncalibrated = bestBucket === null;

    return {
      calibrated: !uncalibrated,
      uncalibrated,
      minSampleCount: minSamples,
      totalMatchingTrades: filtered.length,
      bestBucket,
      buckets,
      reason: uncalibrated
        ? `Sample count below minimum calibration threshold (${filtered.length} matching / min ${minSamples} per bucket) or no positive OOS edge; labeled uncalibrated and falling back to baseline.`
        : `Calibrated best horizon ${bestBucket.duration} ${bestBucket.durationUnit} (${bestBucket.trades} trades, ${(bestBucket.winRate * 100).toFixed(1)}% WR, OOS exp ${bestBucket.outOfSampleExpectancy?.toFixed(2)}).`,
    };
  }

  /**
   * Evaluates and validates a candidate parameter set against strict bounded safety rules
   * and historical closed trade outcomes. Explicitly rejects loss-recovery / Martingale escalation
   * and post-loss duration lengthening.
   */
  public validateCandidateProposal(params: {
    proposedParameters: StrategyParameters;
    rationale: string;
    closedTrades: TradeRecord[];
    lossRecoveryEscalationRequested?: boolean;
    postLossDurationLengtheningRequested?: boolean;
  }): StrategyEvolutionProposal {
    const active = this.getActiveVersion();
    const rejections: string[] = [];

    if (params.lossRecoveryEscalationRequested) {
      rejections.push('Loss-recovery stake escalation (Martingale doubling) is strictly forbidden.');
    }
    if (params.postLossDurationLengtheningRequested) {
      rejections.push('Lengthening contract duration to chase or recover losses is strictly forbidden.');
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
