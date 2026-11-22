import {
  ACDEResult,
  ASIRESensitivity,
  ASIRESnapshot,
  Candle,
  CorrelationResult,
  DerivDurationUnitCode,
  MarketRegime,
  RotationDecisionResult,
  RotationLearningRecord,
  RotationRequestSource,
  RotationTransitionState,
  SymbolCandidateEvaluation,
  SymbolEligibilityStatus,
  SymbolMarketSnapshot,
  SymbolQuarantineState,
  SymbolRankingBreakdown,
  Tick,
  TradeRecord,
  ASIREPolicyConfig,
} from '../types/trading';
import { IndicatorSettings } from '../types/settings';
import { DEFAULT_ASIRE_POLICY } from '../types/settings';
import { acde, toDerivDurationUnit } from './adaptiveDurationEngine';
import { auditLogger } from './auditLogger';
import { autonomyManager, AutonomyManager, AutonomyRuntimeSnapshot } from './autonomyManager';
import { configurationManager, ConfigurationManager } from './configurationManager';
import { runAlgorithmicDecisionEngine, DEFAULT_AGENTS } from './decisionEngine';
import { getSymbolDetails } from './derivSymbols';
import { derivWS, DerivWebSocketClient } from './derivWS';
import { analyzeAllIndicators } from './indicators';
import { memoryManager, MemoryManager } from './memoryManager';
import { sanitizeForPersistence } from './securitySanitizer';
import { analyzeMarketStability } from './strategicFiltering';

const LEARNING_STORAGE_KEY = 'sbatomic_asire_learning_v1';
const QUARANTINE_STORAGE_KEY = 'sbatomic_asire_quarantine_v1';
const MAX_LEARNING_RECORDS = 150;

export interface SymbolFeedInput {
  symbol: string;
  candles: Candle[];
  ticks?: Tick[];
  lastTickTimestamp?: number;
  granularity?: number;
  brokerAvailable?: boolean;
  contractsSupported?: boolean;
  spreadQuality?: number | null;
  connectionHealthy?: boolean;
  closedTrades?: TradeRecord[];
  openTrades?: TradeRecord[];
  indicatorSettings?: Partial<IndicatorSettings>;
}

export interface RotationBrokerVerifier {
  verifySymbolEligibility: (params: {
    symbol: string;
    contractType?: 'CALL' | 'PUT';
    duration?: number;
    durationUnit?: DerivDurationUnitCode;
    currency?: string;
    maxDataAgeMs?: number;
    verifyProposalQuote?: boolean;
  }) => Promise<{
    eligible: boolean;
    reasons: string[];
    brokerAvailable: boolean;
    contractsSupported: boolean;
    dataFresh: boolean;
    proposalVerified: boolean;
    askPrice?: number;
    payout?: number;
  }>;
  fetchCandlesAsync?: (symbol: string, granularity?: number, count?: number) => Promise<Candle[]>;
  getCachedSymbolCandles?: (symbol: string) => { candles: Candle[]; granularity: number; updatedAt: number } | null;
  getCachedSymbolTick?: (symbol: string) => { epoch: number; quote: number; receivedAt: number } | null;
  isConnected?: () => boolean;
  isAuthorized?: () => boolean;
}

export interface RequestRotationParams {
  source: RotationRequestSource;
  targetSymbol?: string;
  reason?: string;
  requestGeneration?: number;
  candlesBySymbol?: Record<string, Candle[]>;
  closedTrades?: TradeRecord[];
  openTrades?: TradeRecord[];
  verifyProposalQuote?: boolean;
  bypassHysteresisForManual?: boolean;
  onCommitSymbol?: (
    symbol: string,
    context: {
      previousSymbol: string;
      decision: RotationDecisionResult;
      acdeResult: ACDEResult | null;
      candles: Candle[];
      source: RotationRequestSource;
    }
  ) => void | Promise<void>;
  now?: number;
}

export interface RequestRotationOutcome {
  switched: boolean;
  action: RotationDecisionResult['action'];
  previousSymbol: string;
  activeSymbol: string;
  targetSymbol: string | null;
  reason: string;
  blockers: string[];
  rolledBack: boolean;
  acdeResult?: ACDEResult | null;
  decision?: RotationDecisionResult;
}

function clamp01(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.min(1, Math.max(0, val));
}

function normalizeWeights(weights: ASIREPolicyConfig['weights']): ASIREPolicyConfig['weights'] {
  const entries = Object.entries(weights) as Array<[keyof ASIREPolicyConfig['weights'], number]>;
  const sum = entries.reduce((acc, [, v]) => acc + Math.max(0, Number(v) || 0), 0);
  if (sum <= 0) return { ...DEFAULT_ASIRE_POLICY.weights };
  const out = { ...DEFAULT_ASIRE_POLICY.weights };
  for (const [k, v] of entries) {
    out[k] = Math.max(0, Number(v) || 0) / sum;
  }
  return out;
}

function getEffectiveHysteresisThresholds(
  policy: ASIREPolicyConfig,
  sensitivity: ASIRESensitivity
): { minScoreImprovement: number; confirmationsRequired: number } {
  if (sensitivity === 'CONSERVATIVE') {
    return {
      minScoreImprovement: Number((policy.minScoreImprovement * 1.35).toFixed(2)),
      confirmationsRequired: Math.min(6, policy.confirmationEvaluations + 1),
    };
  }
  if (sensitivity === 'RESPONSIVE') {
    return {
      minScoreImprovement: Number(Math.max(2, policy.minScoreImprovement * 0.75).toFixed(2)),
      confirmationsRequired: Math.max(1, policy.confirmationEvaluations - 1),
    };
  }
  return {
    minScoreImprovement: policy.minScoreImprovement,
    confirmationsRequired: policy.confirmationEvaluations,
  };
}

/**
 * Computes genuine synchronized epoch-aligned log-return Pearson correlation and
 * volatility-adjusted correlation between two symbols.
 * Never guesses correlation from naming conventions (`1HZ` vs `R_`).
 */
export function computeSynchronizedCorrelation(params: {
  symbolA: string;
  candlesA: Candle[];
  symbolB: string;
  candlesB: Candle[];
  minSamples?: number;
  granularitySec?: number;
  now?: number;
}): CorrelationResult {
  const now = params.now ?? Date.now();
  const minSamples = params.minSamples ?? 15;
  const gran = Math.max(1, params.granularitySec ?? 60);

  if (params.symbolA === params.symbolB) {
    return {
      pair: [params.symbolA, params.symbolB],
      status: 'HIGH',
      pearsonCorrelation: 1,
      volatilityAdjustedCorrelation: 1,
      overlappingSamples: Math.max(0, (params.candlesA?.length || 1) - 1),
      confidence: 1,
      computedAt: now,
      reason: 'Identical symbol self-correlation = 1.00.',
    };
  }

  const normalizeBarSeries = (candles: Candle[]) => {
    const byBucket = new Map<number, number>();
    for (const c of candles || []) {
      if (!Number.isFinite(c?.epoch) || !Number.isFinite(c?.close) || c.close <= 0) continue;
      const bucket = Math.floor(c.epoch / gran) * gran;
      byBucket.set(bucket, c.close);
    }
    return byBucket;
  };

  const mapA = normalizeBarSeries(params.candlesA);
  const mapB = normalizeBarSeries(params.candlesB);

  const sharedEpochs = Array.from(mapA.keys())
    .filter((ep) => mapB.has(ep))
    .sort((a, b) => a - b);

  const returnsA: number[] = [];
  const returnsB: number[] = [];

  for (let i = 1; i < sharedEpochs.length; i++) {
    const prevEp = sharedEpochs[i - 1];
    const currEp = sharedEpochs[i];
    // Reject huge timestamp gaps (> 3x granularity) so stale stitches don't fabricate correlation
    if (currEp - prevEp > gran * 3) continue;

    const pA0 = mapA.get(prevEp)!;
    const pA1 = mapA.get(currEp)!;
    const pB0 = mapB.get(prevEp)!;
    const pB1 = mapB.get(currEp)!;
    if (pA0 > 0 && pA1 > 0 && pB0 > 0 && pB1 > 0) {
      returnsA.push(Math.log(pA1 / pA0));
      returnsB.push(Math.log(pB1 / pB0));
    }
  }

  const n = returnsA.length;
  if (n < minSamples) {
    return {
      pair: [params.symbolA, params.symbolB],
      status: 'UNKNOWN',
      pearsonCorrelation: null,
      volatilityAdjustedCorrelation: null,
      overlappingSamples: n,
      confidence: clamp01(n / minSamples),
      computedAt: now,
      reason: `Insufficient synchronized log-return samples (${n}/${minSamples}); correlation marked UNKNOWN.`,
    };
  }

  const meanA = returnsA.reduce((s, v) => s + v, 0) / n;
  const meanB = returnsB.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = returnsA[i] - meanA;
    const db = returnsB[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  if (varA <= 1e-16 || varB <= 1e-16) {
    return {
      pair: [params.symbolA, params.symbolB],
      status: 'UNKNOWN',
      pearsonCorrelation: null,
      volatilityAdjustedCorrelation: null,
      overlappingSamples: n,
      confidence: 0,
      computedAt: now,
      reason: 'Zero variance detected in synchronized returns; correlation cannot be determined reliably.',
    };
  }

  const pearson = Math.max(-1, Math.min(1, cov / Math.sqrt(varA * varB)));

  // Exponentially weighted (recent-volatility-adjusted) correlation over same aligned return series
  const lambda = 0.9;
  let wSum = 0;
  let wCov = 0;
  let wVarA = 0;
  let wVarB = 0;
  for (let i = 0; i < n; i++) {
    const age = n - 1 - i;
    const w = Math.pow(lambda, age);
    const da = returnsA[i] - meanA;
    const db = returnsB[i] - meanB;
    wSum += w;
    wCov += w * da * db;
    wVarA += w * da * da;
    wVarB += w * db * db;
  }
  const volAdj =
    wSum > 0 && wVarA > 1e-16 && wVarB > 1e-16
      ? Math.max(-1, Math.min(1, wCov / Math.sqrt(wVarA * wVarB)))
      : pearson;

  const absCorr = Math.abs(pearson);
  const status: CorrelationResult['status'] =
    absCorr >= 0.7 ? 'HIGH' : absCorr >= 0.35 ? 'MODERATE' : 'LOW';

  return {
    pair: [params.symbolA, params.symbolB],
    status,
    pearsonCorrelation: Number(pearson.toFixed(4)),
    volatilityAdjustedCorrelation: Number(volAdj.toFixed(4)),
    overlappingSamples: n,
    confidence: clamp01(n / Math.max(minSamples * 2, 30)),
    computedAt: now,
    reason: `Synchronized correlation over ${n} aligned bars: r=${pearson.toFixed(2)} (vol-adj=${volAdj.toFixed(2)}).`,
  };
}

export class SymbolIntelligenceEngine {
  private autonomy: AutonomyManager;
  private configManager: ConfigurationManager;
  private broker: RotationBrokerVerifier;
  private memory: MemoryManager;
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private isPurchaseLockedFn: () => boolean;

  private activeSymbol = '1HZ10V';
  private transitionState: RotationTransitionState = 'IDLE';
  private pendingTargetSymbol: string | null = null;
  private transitionGeneration = 0;

  private lastRotationAt = 0;
  private lastRotationReason: string | null = null;
  private rotationsThisSession = 0;
  private lastEvaluatedAt = 0;

  private candidatesBySymbol = new Map<string, SymbolCandidateEvaluation>();
  private lastDecision: RotationDecisionResult | null = null;
  private confirmationStreak: { symbol: string; count: number } = { symbol: '', count: 0 };
  private quarantines = new Map<string, SymbolQuarantineState>();
  private learningRecords: RotationLearningRecord[] = [];
  private listeners = new Set<(snapshot: ASIRESnapshot) => void>();

  constructor(deps?: {
    autonomy?: AutonomyManager;
    configManager?: ConfigurationManager;
    broker?: RotationBrokerVerifier;
    memory?: MemoryManager;
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
    isPurchaseLocked?: () => boolean;
  }) {
    this.autonomy = deps?.autonomy ?? autonomyManager;
    this.configManager = deps?.configManager ?? configurationManager;
    this.broker = deps?.broker ?? derivWS;
    this.memory = deps?.memory ?? memoryManager;
    this.storage =
      deps?.storage !== undefined
        ? deps.storage
        : typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : null;
    this.isPurchaseLockedFn = deps?.isPurchaseLocked ?? (() => false);

    this.activeSymbol = this.configManager.getSnapshot().general.defaultSymbol || '1HZ10V';
    this.loadPersistedState();

    // Immediately abort any pending verification if autonomy stops, pauses, errors, or drops to MANUAL_ONLY
    this.autonomy.subscribe((snap: AutonomyRuntimeSnapshot) => {
      if (
        snap.lifecycle === 'OFF' ||
        snap.lifecycle === 'STOPPING' ||
        snap.lifecycle === 'PAUSED' ||
        snap.lifecycle === 'ERROR' ||
        snap.executionMode === 'MANUAL_ONLY'
      ) {
        if (this.transitionState === 'PENDING_VERIFICATION') {
          this.abortPendingTransitions(`autonomy_${snap.lifecycle.toLowerCase()}`);
        }
      }
    });
  }

  public setPurchaseLockChecker(fn: () => boolean): void {
    this.isPurchaseLockedFn = fn;
  }

  public setBrokerVerifier(broker: RotationBrokerVerifier): void {
    this.broker = broker;
  }

  public getActiveSymbol(): string {
    return this.activeSymbol;
  }

  public setActiveSymbol(symbol: string): void {
    if (symbol && this.activeSymbol !== symbol) {
      this.activeSymbol = symbol;
      this.notify();
    }
  }

  public getTransitionState(): RotationTransitionState {
    return this.transitionState;
  }

  public isTransitionBlockingPurchases(_symbol?: string): { blocked: boolean; reason?: string } {
    if (this.transitionState === 'PENDING_VERIFICATION') {
      return {
        blocked: true,
        reason: `ASIRE symbol rotation to ${this.pendingTargetSymbol || 'candidate'} is pending verification; purchase locked until transition settles.`,
      };
    }
    return { blocked: false };
  }

  public abortPendingTransitions(reason = 'aborted'): void {
    this.transitionGeneration += 1;
    const wasPending = this.transitionState === 'PENDING_VERIFICATION';
    const prevTarget = this.pendingTargetSymbol;
    this.transitionState = 'IDLE';
    this.pendingTargetSymbol = null;
    this.confirmationStreak = { symbol: '', count: 0 };
    if (wasPending) {
      auditLogger.record({
        type: 'SYMBOL_ROTATION',
        symbol: prevTarget || this.activeSymbol,
        action: 'ASIRE_TRANSITION_ABORTED',
        reason: `Pending ASIRE rotation to ${prevTarget || 'unknown'} aborted (${reason}); remaining on ${this.activeSymbol}.`,
      });
      this.notify();
    }
  }

  public resetSessionCounters(): void {
    this.rotationsThisSession = 0;
    this.lastRotationAt = 0;
    this.confirmationStreak = { symbol: '', count: 0 };
    this.transitionState = 'IDLE';
    this.pendingTargetSymbol = null;
    this.notify();
  }

  public clearQuarantine(symbol: string): void {
    const existing = this.quarantines.get(symbol);
    if (existing) {
      this.quarantines.delete(symbol);
      this.persistState();
      this.notify();
    }
  }

  public recordSymbolFailure(symbol: string, reason: string, now = Date.now()): SymbolQuarantineState {
    const policy = this.getEffectivePolicy();
    const prev = this.quarantines.get(symbol) || {
      symbol,
      quarantined: false,
      failureCount: 0,
      quarantinedAt: null,
      recoverAt: null,
    };

    const nextCount = prev.failureCount + 1;
    const threshold = Math.max(2, policy.quarantineFailureThreshold);
    const shouldQuarantine = nextCount >= threshold;
    const nextState: SymbolQuarantineState = {
      symbol,
      quarantined: shouldQuarantine,
      failureCount: nextCount,
      quarantinedAt: shouldQuarantine ? now : prev.quarantinedAt,
      recoverAt: shouldQuarantine ? now + policy.quarantineDurationMs : prev.recoverAt,
      lastFailureAt: now,
      reason,
    };

    this.quarantines.set(symbol, nextState);
    this.persistState();

    if (shouldQuarantine) {
      auditLogger.record({
        type: 'RISK_SHIELD',
        symbol,
        action: 'ASIRE_SYMBOL_QUARANTINED',
        reason: `Symbol ${symbol} quarantined after ${nextCount} failures (${reason}). Recovering after ${Math.round(policy.quarantineDurationMs / 1000)}s.`,
      });
    }
    this.notify();
    return nextState;
  }

  private getEffectivePolicy(): ASIREPolicyConfig {
    const cfg = this.configManager.getSnapshot();
    const base = cfg.asire || DEFAULT_ASIRE_POLICY;
    return {
      ...DEFAULT_ASIRE_POLICY,
      ...base,
      weights: normalizeWeights(base.weights || DEFAULT_ASIRE_POLICY.weights),
    };
  }

  public getAllowedSymbols(): string[] {
    const cfg = this.configManager.getSnapshot();
    const list = cfg.autonomy?.allowedSymbols || [];
    return Array.from(new Set(list.filter((s) => typeof s === 'string' && s.trim().length > 0)));
  }

  /**
   * Computes a comprehensive, zero-hallucination MarketSnapshot for any symbol
   * using real candles & existing analytics engines.
   */
  public buildMarketSnapshot(
    input: SymbolFeedInput,
    options?: {
      activeSymbolCandles?: Candle[];
      activeSymbolName?: string;
      granularitySec?: number;
      now?: number;
    }
  ): SymbolMarketSnapshot {
    const now = options?.now ?? Date.now();
    const policy = this.getEffectivePolicy();
    const details = getSymbolDetails(input.symbol);
    const candles = Array.isArray(input.candles) ? input.candles : [];
    const latestCandle = candles[candles.length - 1];
    const tickEpochMs = input.lastTickTimestamp
      ? input.lastTickTimestamp < 1_000_000_000_000
        ? input.lastTickTimestamp * 1000
        : input.lastTickTimestamp
      : 0;
    const candleEpochMs = latestCandle?.epoch
      ? latestCandle.epoch < 1_000_000_000_000
        ? latestCandle.epoch * 1000
        : latestCandle.epoch
      : 0;

    const latestTsMs = Math.max(tickEpochMs, candleEpochMs);
    const dataFreshnessMs = latestTsMs > 0 ? Math.max(0, now - latestTsMs) : Number.MAX_SAFE_INTEGER;
    const connectionHealthy = input.connectionHealthy ?? (this.broker.isConnected ? this.broker.isConnected() : true);
    const dataAvailable = candles.length >= 20 && Number.isFinite(latestCandle?.close) && latestCandle.close > 0;
    const isDataFresh = dataAvailable && latestTsMs > 0 && dataFreshnessMs <= policy.maxDataAgeMs;

    if (!dataAvailable) {
      return {
        symbol: input.symbol,
        displayName: details.displayName,
        latestPrice: latestCandle?.close || 0,
        tickTimestamp: tickEpochMs || candleEpochMs,
        candleTimestamp: candleEpochMs,
        candleCount: candles.length,
        dataFreshnessMs,
        isDataFresh: false,
        realizedVolatility: 0,
        baselineVolatility: 0,
        volatilityAcceleration: 1,
        marketRegime: {
          type: 'INSUFFICIENT_DATA',
          confidence: 0,
        },
        trendDirection: 'NEUTRAL',
        trendStrength: 0,
        momentumPersistence: 0,
        rsiNow: null,
        bollingerBandwidth: 0,
        supportLevel: null,
        resistanceLevel: null,
        supportProximity: null,
        resistanceProximity: null,
        candlePattern: { pattern: 'NONE', strength: 0, signal: 'NEUTRAL' },
        priceActionQuality: 0,
        signalStability: 0,
        directionalConsistency: 0,
        mtfAgreement: 0,
        strategyConfidence: 0,
        recommendedAction: 'HOLD',
        spreadQuality: input.spreadQuality ?? null,
        connectionHealthy,
        dataAvailable: false,
        stabilityIndex: 0,
        acdeResult: null,
        correlationWithActive: null,
      };
    }

    const indicators = analyzeAllIndicators(candles, input.ticks || [], input.indicatorSettings);
    const regime: MarketRegime = indicators.regime;
    const decision = runAlgorithmicDecisionEngine(
      candles,
      indicators,
      DEFAULT_AGENTS,
      0.35,
      0,
      {
        symbol: input.symbol,
        chartTimeframeSeconds: input.granularity ?? 60,
        governance: this.configManager.getSnapshot().durationGovernance,
      }
    );

    const stability = analyzeMarketStability(
      input.symbol,
      candles,
      indicators,
      regime,
      this.getAllowedSymbols()
    );

    const acdeResult = acde.computeMarketAwareDuration({
      symbol: input.symbol,
      contractType: decision.action === 'SELL' ? 'PUT' : 'CALL',
      candles,
      indicators,
      regime,
      confidence: decision.confidence,
      chartTimeframeSeconds: input.granularity ?? 60,
      strategyId: decision.agent || 'asire_scanner',
      governance: this.configManager.getSnapshot().durationGovernance,
      now,
    });

    const latestPrice = indicators.currentPrice;
    const volProfile = acdeResult.volatilityProfile;
    const bb = indicators.bbNow;
    const bbWidth =
      bb && bb.upper !== null && bb.lower !== null && bb.middle && bb.middle > 0
        ? (bb.upper - bb.lower) / bb.middle
        : 0;

    // Rolling support & resistance levels (last 30 bars)
    const srWindow = candles.slice(-Math.min(30, candles.length));
    const supportLevel = Math.min(...srWindow.map((c) => c.low));
    const resistanceLevel = Math.max(...srWindow.map((c) => c.high));
    const supportProximity =
      latestPrice > 0 ? Number((Math.abs(latestPrice - supportLevel) / latestPrice).toFixed(5)) : null;
    const resistanceProximity =
      latestPrice > 0 ? Number((Math.abs(resistanceLevel - latestPrice) / latestPrice).toFixed(5)) : null;

    // Momentum persistence: fraction of recent 6 closes moving in same net direction
    const momSlice = candles.slice(-7);
    let sameDir = 0;
    const netDelta = momSlice[momSlice.length - 1].close - momSlice[0].close;
    const netSign = netDelta >= 0 ? 1 : -1;
    for (let i = 1; i < momSlice.length; i++) {
      const step = momSlice[i].close - momSlice[i - 1].close;
      if ((step > 0 && netSign > 0) || (step < 0 && netSign < 0)) sameDir++;
    }
    const momentumPersistence = clamp01(sameDir / Math.max(1, momSlice.length - 1));

    // Price action quality: inverse of excessive wick noise + clean body ratio
    const paSlice = candles.slice(-10);
    let bodyRatioSum = 0;
    for (const c of paSlice) {
      const range = Math.max(1e-9, c.high - c.low);
      bodyRatioSum += Math.abs(c.close - c.open) / range;
    }
    const priceActionQuality = clamp01(bodyRatioSum / Math.max(1, paSlice.length));

    // Signal stability & directional consistency
    const mtfAgreement = clamp01(indicators.mtfAnalysis?.consistency ?? 0.5);
    const directionalConsistency = clamp01(
      (momentumPersistence * 0.5 + mtfAgreement * 0.5)
    );
    const signalStability = clamp01(
      (stability.stabilityIndex / 100) * 0.6 + (regime.confidence || 0.5) * 0.4
    );

    const trendDirection: SymbolMarketSnapshot['trendDirection'] =
      regime.type.includes('UPTREND')
        ? 'BULLISH'
        : regime.type.includes('DOWNTREND')
        ? 'BEARISH'
        : indicators.mtfAnalysis?.direction || 'NEUTRAL';

    let correlationWithActive: CorrelationResult | null = null;
    if (
      options?.activeSymbolCandles &&
      options.activeSymbolName &&
      options.activeSymbolName !== input.symbol
    ) {
      correlationWithActive = computeSynchronizedCorrelation({
        symbolA: options.activeSymbolName,
        candlesA: options.activeSymbolCandles,
        symbolB: input.symbol,
        candlesB: candles,
        minSamples: policy.minCorrelationSamples,
        granularitySec: options.granularitySec ?? input.granularity ?? 60,
        now,
      });
    }

    return {
      symbol: input.symbol,
      displayName: details.displayName,
      latestPrice,
      tickTimestamp: tickEpochMs || candleEpochMs,
      candleTimestamp: candleEpochMs,
      candleCount: candles.length,
      dataFreshnessMs,
      isDataFresh,
      realizedVolatility: volProfile.realizedVolatility,
      baselineVolatility: volProfile.baselineRealizedVolatility,
      volatilityAcceleration: volProfile.volatilityAcceleration,
      marketRegime: regime,
      trendDirection,
      trendStrength: clamp01(regime.confidence || 0.5),
      momentumPersistence: Number(momentumPersistence.toFixed(3)),
      rsiNow: indicators.rsiNow,
      bollingerBandwidth: Number(bbWidth.toFixed(5)),
      supportLevel,
      resistanceLevel,
      supportProximity,
      resistanceProximity,
      candlePattern: indicators.pattern,
      priceActionQuality: Number(priceActionQuality.toFixed(3)),
      signalStability: Number(signalStability.toFixed(3)),
      directionalConsistency: Number(directionalConsistency.toFixed(3)),
      mtfAgreement: Number(mtfAgreement.toFixed(3)),
      strategyConfidence: clamp01(decision.confidence),
      recommendedAction:
        decision.action === 'STRONG BUY'
          ? 'BUY'
          : decision.action === 'STRONG SELL'
          ? 'SELL'
          : decision.action,
      spreadQuality: input.spreadQuality ?? null,
      connectionHealthy,
      dataAvailable,
      stabilityIndex: stability.stabilityIndex,
      acdeResult,
      correlationWithActive,
    };
  }

  /**
   * Separates strict broker/data eligibility verification from quantitative ranking.
   */
  public evaluateEligibility(params: {
    symbol: string;
    snapshot: SymbolMarketSnapshot | null;
    allowedSymbols: string[];
    brokerAvailable?: boolean;
    contractsSupported?: boolean;
    now?: number;
  }): { status: SymbolEligibilityStatus; eligible: boolean; reasons: string[]; quarantine: SymbolQuarantineState | null } {
    const now = params.now ?? Date.now();
    const reasons: string[] = [];

    // Expire elapsed quarantines cleanly
    const existingQ = this.quarantines.get(params.symbol) || null;
    let activeQuarantine = existingQ;
    if (existingQ && existingQ.quarantined && existingQ.recoverAt && now >= existingQ.recoverAt) {
      activeQuarantine = {
        ...existingQ,
        quarantined: false,
        failureCount: Math.max(0, existingQ.failureCount - 1),
        reason: 'Quarantine cooldown elapsed; awaiting clean verification.',
      };
      this.quarantines.set(params.symbol, activeQuarantine);
      this.persistState();
    }

    if (!params.allowedSymbols.includes(params.symbol)) {
      reasons.push(`Symbol ${params.symbol} is outside configured allowedSymbols.`);
      return { status: 'DISALLOWED_UNIVERSE', eligible: false, reasons, quarantine: activeQuarantine };
    }

    if (activeQuarantine?.quarantined) {
      const remSec = activeQuarantine.recoverAt ? Math.max(1, Math.ceil((activeQuarantine.recoverAt - now) / 1000)) : 0;
      reasons.push(`Symbol ${params.symbol} is quarantined (${activeQuarantine.reason || 'repeated failures'}; ${remSec}s left).`);
      return { status: 'QUARANTINED', eligible: false, reasons, quarantine: activeQuarantine };
    }

    if (params.brokerAvailable === false) {
      reasons.push(`Broker reported ${params.symbol} unavailable or suspended.`);
      return { status: 'UNAVAILABLE_BROKER', eligible: false, reasons, quarantine: activeQuarantine };
    }

    if (params.contractsSupported === false) {
      reasons.push(`Target contract type is not supported on ${params.symbol}.`);
      return { status: 'CONTRACT_UNSUPPORTED', eligible: false, reasons, quarantine: activeQuarantine };
    }

    if (!params.snapshot || !params.snapshot.dataAvailable || params.snapshot.candleCount < 20) {
      reasons.push(`Insufficient market candle stream for ${params.symbol}.`);
      return { status: 'DATA_UNAVAILABLE', eligible: false, reasons, quarantine: activeQuarantine };
    }

    if (!params.snapshot.connectionHealthy || !params.snapshot.isDataFresh) {
      reasons.push(
        !params.snapshot.connectionHealthy
          ? `WebSocket connection unhealthy for ${params.symbol}.`
          : `Market data for ${params.symbol} is stale (${Math.round(params.snapshot.dataFreshnessMs / 1000)}s old).`
      );
      return { status: 'STALE_DATA', eligible: false, reasons, quarantine: activeQuarantine };
    }

    return {
      status: 'ELIGIBLE',
      eligible: true,
      reasons: [],
      quarantine: activeQuarantine,
    };
  }

  /**
   * Computes measurable 11-factor candidate breakdown & 0..100 ranking score.
   * Applies out-of-sample chronological validation before trusting historical symbol edge.
   */
  public rankCandidate(params: {
    symbol: string;
    snapshot: SymbolMarketSnapshot;
    closedTrades?: TradeRecord[];
    openTrades?: TradeRecord[];
    policy?: ASIREPolicyConfig;
    now?: number;
  }): { breakdown: SymbolRankingBreakdown; overallScore: number } {
    const now = params.now ?? Date.now();
    const policy = params.policy ?? this.getEffectivePolicy();
    const w = normalizeWeights(policy.weights);
    const snap = params.snapshot;

    const signalQuality = clamp01(
      snap.recommendedAction === 'HOLD' ? snap.strategyConfidence * 0.55 : snap.strategyConfidence
    );
    const directionalAgreement = clamp01(
      snap.directionalConsistency * 0.55 + snap.mtfAgreement * 0.45
    );
    const stabilityScore = clamp01(snap.stabilityIndex / 100);

    // Sweet-spot volatility acceleration near 0.7..1.6; extreme spikes/dead zones penalized
    const va = snap.volatilityAcceleration || 1;
    const volatilitySuitability =
      va > 2.3 ? 0.25 : va > 1.75 ? 0.5 : va < 0.35 ? 0.45 : 0.85;

    const strategyCompatibility = clamp01(
      snap.recommendedAction === 'HOLD'
        ? 0.4
        : snap.strategyConfidence * 0.7 + snap.priceActionQuality * 0.3
    );

    // Chronological out-of-sample expectancy evaluation from settled trades
    const symbolTrades = (params.closedTrades || [])
      .filter((t) => t.symbol === params.symbol && t.result && t.result !== 'PENDING')
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    let historicalExpectancy = 0.5;
    let recentPerformance = 0.5;

    if (symbolTrades.length >= policy.minHistoricalSamplesForTrust) {
      const splitIdx = Math.max(1, Math.floor(symbolTrades.length * 0.7));
      const inSample = symbolTrades.slice(0, splitIdx);
      const outOfSample = symbolTrades.slice(splitIdx);

      const calcExp = (arr: TradeRecord[]) => {
        if (arr.length === 0) return 0;
        const avgStake = arr.reduce((s, t) => s + Math.max(0.35, t.amount || 1), 0) / arr.length;
        const avgPnl = arr.reduce((s, t) => s + (t.profit || 0), 0) / arr.length;
        return avgPnl / Math.max(0.35, avgStake);
      };

      const isExp = calcExp(inSample);
      const oosExp = outOfSample.length > 0 ? calcExp(outOfSample) : isExp;
      // Only trust historical alpha when out-of-sample expectancy aligns cleanly with in-sample sign
      const oosValid = (isExp >= 0 && oosExp >= -0.05) || (isExp < 0 && oosExp < 0);
      if (oosValid) {
        historicalExpectancy = clamp01(0.5 + oosExp * 0.5);
      } else {
        // In-sample overfit rejected -> dampened toward neutral 0.5
        historicalExpectancy = clamp01(0.5 + oosExp * 0.2);
      }

      const recentSlice = symbolTrades.slice(-Math.min(5, symbolTrades.length));
      const recentWins = recentSlice.filter((t) => t.result === 'WIN' || (t.profit || 0) > 0).length;
      recentPerformance = clamp01(recentWins / recentSlice.length);
    }

    // Also include verified learning outcomes after rotation if out-of-sample threshold met
    const learnForSym = this.learningRecords.filter(
      (r) => r.nextSymbol === params.symbol && r.followedByTrade && r.contractOutcome
    );
    if (learnForSym.length >= policy.minHistoricalSamplesForTrust) {
      const splitL = Math.floor(learnForSym.length * 0.7);
      const oosLearn = learnForSym.slice(splitL);
      const oosWins = oosLearn.filter((r) => r.contractOutcome === 'WIN').length;
      const oosWinRate = oosLearn.length > 0 ? oosWins / oosLearn.length : 0.5;
      historicalExpectancy = clamp01(historicalExpectancy * 0.7 + oosWinRate * 0.3);
    }

    // Data freshness (1.0 when <= 10s, linear decay down to 0 at maxDataAgeMs)
    const freshRatio = snap.isDataFresh
      ? clamp01(1 - snap.dataFreshnessMs / Math.max(15_000, policy.maxDataAgeMs))
      : 0;
    const dataFreshness = snap.spreadQuality !== null ? clamp01(freshRatio * 0.8 + snap.spreadQuality * 0.2) : freshRatio;

    // Risk exposure & open-position correlation guard
    const openOnSymbol = (params.openTrades || []).filter(
      (t) => t.symbol === params.symbol && t.result === 'PENDING'
    ).length;
    let riskExposure = clamp01(1 - openOnSymbol * 0.28);
    if (snap.correlationWithActive?.status === 'HIGH' && params.symbol !== this.activeSymbol) {
      // Discourage rotating into a symbol already >0.70 correlated with current open exposure on active symbol
      const openActive = (params.openTrades || []).some(
        (t) => t.symbol === this.activeSymbol && t.result === 'PENDING'
      );
      if (openActive) {
        riskExposure = clamp01(riskExposure - 0.25);
      }
    }

    // Regime compatibility
    let regimeCompatibility = 0.55;
    if (snap.marketRegime.type === 'STRONG_UPTREND' || snap.marketRegime.type === 'STRONG_DOWNTREND') {
      regimeCompatibility = 0.9;
    } else if (snap.marketRegime.type === 'UPTREND' || snap.marketRegime.type === 'DOWNTREND') {
      regimeCompatibility = 0.78;
    } else if (snap.marketRegime.type === 'CONSOLIDATION') {
      regimeCompatibility = 0.52;
    } else if (snap.marketRegime.type === 'HIGH_VOLATILITY') {
      regimeCompatibility = 0.36;
    } else if (snap.marketRegime.type === 'INSUFFICIENT_DATA') {
      regimeCompatibility = 0.1;
    }

    // Duration compatibility via ACDE
    const durationCompatibility = snap.acdeResult
      ? snap.acdeResult.action === 'HOLD'
        ? 0.25
        : clamp01((snap.acdeResult.recommendation?.confidence ?? 60) / 100)
      : 0.5;

    const evidenceScore = clamp01(
      (dataFreshness * 0.4 + signalQuality * 0.3 + directionalAgreement * 0.3)
    );

    const weighted =
      signalQuality * w.signalQuality +
      directionalAgreement * w.directionalAgreement +
      stabilityScore * w.stabilityScore +
      volatilitySuitability * w.volatilitySuitability +
      strategyCompatibility * w.strategyCompatibility +
      historicalExpectancy * w.historicalExpectancy +
      recentPerformance * w.recentPerformance +
      dataFreshness * w.dataFreshness +
      riskExposure * w.riskExposure +
      regimeCompatibility * w.regimeCompatibility +
      durationCompatibility * w.durationCompatibility;

    const overallScore = Number(Math.min(100, Math.max(0, weighted * 100)).toFixed(2));

    // Unused variable guard check using `now` silently kept in signature for deterministic testing
    void now;

    return {
      breakdown: {
        signalQuality: Number(signalQuality.toFixed(3)),
        directionalAgreement: Number(directionalAgreement.toFixed(3)),
        stabilityScore: Number(stabilityScore.toFixed(3)),
        volatilitySuitability: Number(volatilitySuitability.toFixed(3)),
        strategyCompatibility: Number(strategyCompatibility.toFixed(3)),
        historicalExpectancy: Number(historicalExpectancy.toFixed(3)),
        recentPerformance: Number(recentPerformance.toFixed(3)),
        dataFreshness: Number(dataFreshness.toFixed(3)),
        riskExposure: Number(riskExposure.toFixed(3)),
        regimeCompatibility: Number(regimeCompatibility.toFixed(3)),
        durationCompatibility: Number(durationCompatibility.toFixed(3)),
        evidenceScore: Number(evidenceScore.toFixed(3)),
        historicalSamples: symbolTrades.length,
      },
      overallScore,
    };
  }

  /**
   * Scans the permitted market universe (`allowedSymbols`) without changing activeSymbol yet.
   * Updates `candidatesBySymbol` and evaluates current rotation decision.
   */
  public evaluateUniverse(params: {
    feeds: Record<string, SymbolFeedInput>;
    activeSymbol?: string;
    closedTrades?: TradeRecord[];
    openTrades?: TradeRecord[];
    granularitySec?: number;
    now?: number;
  }): {
    candidates: SymbolCandidateEvaluation[];
    decision: RotationDecisionResult;
  } {
    const now = params.now ?? Date.now();
    if (params.activeSymbol) {
      this.activeSymbol = params.activeSymbol;
    }

    const allowedSymbols = this.getAllowedSymbols();
    const policy = this.getEffectivePolicy();
    const activeFeed = params.feeds[this.activeSymbol];
    const activeCandles = activeFeed?.candles || [];

    const allSymbols = Array.from(
      new Set([this.activeSymbol, ...allowedSymbols, ...Object.keys(params.feeds)])
    );

    const evaluations: SymbolCandidateEvaluation[] = [];
    for (const sym of allSymbols) {
      const feed = params.feeds[sym] || { symbol: sym, candles: [] };
      const snap = this.buildMarketSnapshot(
        {
          ...feed,
          closedTrades: params.closedTrades ?? feed.closedTrades,
          openTrades: params.openTrades ?? feed.openTrades,
        },
        {
          activeSymbolCandles: activeCandles,
          activeSymbolName: this.activeSymbol,
          granularitySec: params.granularitySec ?? feed.granularity ?? 60,
          now,
        }
      );

      const elig = this.evaluateEligibility({
        symbol: sym,
        snapshot: snap,
        allowedSymbols,
        brokerAvailable: feed.brokerAvailable,
        contractsSupported: feed.contractsSupported,
        now,
      });

      const { breakdown, overallScore } = this.rankCandidate({
        symbol: sym,
        snapshot: snap,
        closedTrades: params.closedTrades ?? feed.closedTrades,
        openTrades: params.openTrades ?? feed.openTrades,
        policy,
        now,
      });

      const evaluation: SymbolCandidateEvaluation = {
        symbol: sym,
        eligibilityStatus: elig.status,
        eligible: elig.eligible,
        rejectionReasons: elig.reasons,
        ranking: breakdown,
        overallScore: elig.eligible ? overallScore : Math.min(overallScore, 35),
        recommendedAction: snap.recommendedAction,
        acdeDuration: snap.acdeResult
          ? {
              value: snap.acdeResult.duration,
              unit: snap.acdeResult.unit,
              approved: snap.acdeResult.action !== 'HOLD',
            }
          : null,
        quarantine: elig.quarantine,
        snapshot: snap,
        evaluatedAt: now,
      };
      this.candidatesBySymbol.set(sym, evaluation);
      evaluations.push(evaluation);
    }

    // Sort: eligible first by overallScore descending, then ineligible descending
    evaluations.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.overallScore - a.overallScore;
    });

    const decision = this.evaluateRotationDecision({
      activeSymbol: this.activeSymbol,
      candidates: evaluations,
      autonomySnapshot: this.autonomy.getSnapshot(),
      policy,
      now,
    });

    this.lastDecision = decision;
    this.lastEvaluatedAt = now;
    this.notify();

    return { candidates: evaluations, decision };
  }

  /**
   * Pure decision logic implementing hysteresis, cooldowns, confirmation streaks,
   * governance locks, and minimum data quality thresholds.
   */
  public evaluateRotationDecision(params: {
    activeSymbol: string;
    candidates: SymbolCandidateEvaluation[];
    autonomySnapshot: AutonomyRuntimeSnapshot;
    policy?: ASIREPolicyConfig;
    now?: number;
  }): RotationDecisionResult {
    const now = params.now ?? Date.now();
    const policy = params.policy ?? this.getEffectivePolicy();
    const blockers: string[] = [];

    const activeEval = params.candidates.find((c) => c.symbol === params.activeSymbol) || null;
    const currentScore = activeEval?.overallScore ?? 0;

    const eligibleAlternatives = params.candidates.filter(
      (c) => c.eligible && c.symbol !== params.activeSymbol
    );
    const bestAlt = eligibleAlternatives[0] || null;
    const targetScore = bestAlt?.overallScore ?? null;
    const scoreDelta = bestAlt ? Number((bestAlt.overallScore - currentScore).toFixed(2)) : 0;

    const elapsedSec = this.lastRotationAt > 0 ? Math.floor((now - this.lastRotationAt) / 1000) : policy.cooldownSeconds;
    const cooldownRemainingSeconds = this.lastRotationAt > 0
      ? Math.max(0, policy.cooldownSeconds - elapsedSec)
      : 0;

    const { minScoreImprovement, confirmationsRequired } = getEffectiveHysteresisThresholds(
      policy,
      policy.sensitivity
    );

    // 1. Governance check
    const auto = params.autonomySnapshot;
    if (auto.executionMode === 'MANUAL_ONLY') {
      blockers.push('Execution mode is MANUAL_ONLY.');
    }
    if (auto.lifecycle !== 'ACTIVE') {
      blockers.push(`Autonomy lifecycle is ${auto.lifecycle}.`);
    }
    if (!auto.permissions.allowSymbolRotation) {
      blockers.push('Autonomous symbol rotation permission (allowSymbolRotation) is disabled.');
    }
    if (!policy.enabled) {
      blockers.push('ASIRE rotation policy is disabled.');
    }

    if (blockers.length > 0) {
      this.confirmationStreak = { symbol: '', count: 0 };
      return {
        action: 'BLOCKED',
        currentSymbol: params.activeSymbol,
        targetSymbol: bestAlt?.symbol ?? null,
        currentScore,
        targetScore,
        scoreDelta,
        confirmationsCount: 0,
        confirmationsRequired,
        cooldownRemainingSeconds,
        rotationsThisSession: this.rotationsThisSession,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: blockers[0],
        blockers,
        correlation: bestAlt?.snapshot?.correlationWithActive ?? null,
        evaluatedAt: now,
      };
    }

    // 2. Session rotation cap
    if (this.rotationsThisSession >= policy.maxRotationsPerSession) {
      return {
        action: 'HOLD',
        currentSymbol: params.activeSymbol,
        targetSymbol: bestAlt?.symbol ?? null,
        currentScore,
        targetScore,
        scoreDelta,
        confirmationsCount: 0,
        confirmationsRequired,
        cooldownRemainingSeconds,
        rotationsThisSession: this.rotationsThisSession,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: `Session rotation limit reached (${this.rotationsThisSession}/${policy.maxRotationsPerSession}).`,
        blockers: ['MAX_ROTATIONS_REACHED'],
        correlation: bestAlt?.snapshot?.correlationWithActive ?? null,
        evaluatedAt: now,
      };
    }

    // 3. No eligible alternative with sufficient data quality
    if (!bestAlt) {
      this.confirmationStreak = { symbol: '', count: 0 };
      return {
        action: 'HOLD',
        currentSymbol: params.activeSymbol,
        targetSymbol: null,
        currentScore,
        targetScore: null,
        scoreDelta: 0,
        confirmationsCount: 0,
        confirmationsRequired,
        cooldownRemainingSeconds,
        rotationsThisSession: this.rotationsThisSession,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: 'No eligible alternative symbol passed broker & data quality verification (HOLD).',
        blockers: ['NO_ELIGIBLE_TARGET'],
        correlation: null,
        evaluatedAt: now,
      };
    }

    const targetEvidence = bestAlt.ranking.evidenceScore;
    if (targetEvidence < policy.minDataQualityThreshold) {
      this.confirmationStreak = { symbol: '', count: 0 };
      return {
        action: 'HOLD',
        currentSymbol: params.activeSymbol,
        targetSymbol: bestAlt.symbol,
        currentScore,
        targetScore,
        scoreDelta,
        confirmationsCount: 0,
        confirmationsRequired,
        cooldownRemainingSeconds,
        rotationsThisSession: this.rotationsThisSession,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: `Candidate ${bestAlt.symbol} evidence/data quality (${(targetEvidence * 100).toFixed(0)}%) below ${(policy.minDataQualityThreshold * 100).toFixed(0)}% threshold (HOLD).`,
        blockers: ['LOW_DATA_QUALITY'],
        correlation: bestAlt.snapshot?.correlationWithActive ?? null,
        evaluatedAt: now,
      };
    }

    // 4. Cooldown guard (unless active symbol itself is quarantined/broker-unavailable)
    const activeBroken =
      activeEval &&
      (activeEval.eligibilityStatus === 'QUARANTINED' ||
        activeEval.eligibilityStatus === 'UNAVAILABLE_BROKER' ||
        activeEval.eligibilityStatus === 'CONTRACT_UNSUPPORTED');

    if (cooldownRemainingSeconds > 0 && !activeBroken) {
      return {
        action: 'HOLD',
        currentSymbol: params.activeSymbol,
        targetSymbol: bestAlt.symbol,
        currentScore,
        targetScore,
        scoreDelta,
        confirmationsCount: this.confirmationStreak.symbol === bestAlt.symbol ? this.confirmationStreak.count : 0,
        confirmationsRequired,
        cooldownRemainingSeconds,
        rotationsThisSession: this.rotationsThisSession,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: `Rotation cooldown active (${cooldownRemainingSeconds}s remaining before switch allowed).`,
        blockers: ['COOLDOWN_ACTIVE'],
        correlation: bestAlt.snapshot?.correlationWithActive ?? null,
        evaluatedAt: now,
      };
    }

    // 5. Score margin & confirmation hysteresis
    const meetsDelta = scoreDelta >= minScoreImprovement || Boolean(activeBroken);
    if (!meetsDelta) {
      this.confirmationStreak = { symbol: '', count: 0 };
      return {
        action: 'STAY',
        currentSymbol: params.activeSymbol,
        targetSymbol: bestAlt.symbol,
        currentScore,
        targetScore,
        scoreDelta,
        confirmationsCount: 0,
        confirmationsRequired,
        cooldownRemainingSeconds: 0,
        rotationsThisSession: this.rotationsThisSession,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: `Staying on ${params.activeSymbol} (${currentScore.toFixed(1)}): best candidate ${bestAlt.symbol} delta (+${scoreDelta.toFixed(1)}) < +${minScoreImprovement} required.`,
        blockers: [],
        correlation: bestAlt.snapshot?.correlationWithActive ?? null,
        evaluatedAt: now,
      };
    }

    const nextCount =
      this.confirmationStreak.symbol === bestAlt.symbol
        ? this.confirmationStreak.count + 1
        : 1;
    this.confirmationStreak = { symbol: bestAlt.symbol, count: nextCount };

    if (nextCount < confirmationsRequired && !activeBroken) {
      return {
        action: 'STAY',
        currentSymbol: params.activeSymbol,
        targetSymbol: bestAlt.symbol,
        currentScore,
        targetScore,
        scoreDelta,
        confirmationsCount: nextCount,
        confirmationsRequired,
        cooldownRemainingSeconds: 0,
        rotationsThisSession: this.rotationsThisSession,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: `Candidate ${bestAlt.symbol} leading by +${scoreDelta.toFixed(1)} pts (confirmation ${nextCount}/${confirmationsRequired}).`,
        blockers: ['AWAITING_CONFIRMATION'],
        correlation: bestAlt.snapshot?.correlationWithActive ?? null,
        evaluatedAt: now,
      };
    }

    return {
      action: 'SWITCH',
      currentSymbol: params.activeSymbol,
      targetSymbol: bestAlt.symbol,
      currentScore,
      targetScore,
      scoreDelta,
      confirmationsCount: nextCount,
      confirmationsRequired,
      cooldownRemainingSeconds: 0,
      rotationsThisSession: this.rotationsThisSession,
      maxRotationsPerSession: policy.maxRotationsPerSession,
      reason: activeBroken
        ? `Emergency verified switch from ${params.activeSymbol} (${activeEval?.eligibilityStatus}) to ${bestAlt.symbol} (score ${bestAlt.overallScore.toFixed(1)}).`
        : `Confirmed switch from ${params.activeSymbol} (${currentScore.toFixed(1)}) to ${bestAlt.symbol} (${bestAlt.overallScore.toFixed(1)}, +${scoreDelta.toFixed(1)} pts, ${nextCount}/${confirmationsRequired} confirmations).`,
      blockers: [],
      correlation: bestAlt.snapshot?.correlationWithActive ?? null,
      evaluatedAt: now,
    };
  }

  /**
   * Authoritative manual symbol override.
   * Independent of `allowSymbolRotation` and hysteresis cooldowns, cleanly cancels
   * any pending autonomous verification, and leaves open-contract streams untouched.
   */
  public requestManualOverride(
    symbol: string,
    onCommitSymbol?: (symbol: string) => void
  ): { switched: boolean; previousSymbol: string; activeSymbol: string } {
    const prev = this.activeSymbol;
    if (!symbol) {
      return { switched: false, previousSymbol: prev, activeSymbol: prev };
    }
    this.abortPendingTransitions('manual_symbol_override');
    this.activeSymbol = symbol;
    this.confirmationStreak = { symbol: '', count: 0 };
    if (onCommitSymbol) {
      onCommitSymbol(symbol);
    }
    this.memory.upsert({
      category: 'OPERATIONAL',
      trustSource: 'USER_DECISION',
      key: 'asire_last_manual_override',
      title: `Manual Symbol Override → ${symbol}`,
      summary: `Operator manually selected ${symbol} (replacing ${prev}); ASIRE hysteresis reset.`,
      symbol,
    });
    this.notify();
    return { switched: prev !== symbol, previousSymbol: prev, activeSymbol: symbol };
  }

  /**
   * ONE AUTHORITATIVE ROTATION CONTROLLER.
   * Every autonomous switch request (SCANNER, MARKET_STABILITY, SUBAGENT_MD, GEMINI_AI, LOCAL_AI, COPILOT)
   * must enter through this verified, generation-guarded transition gate.
   */
  public async requestAutonomousRotation(
    params: RequestRotationParams
  ): Promise<RequestRotationOutcome> {
    const now = params.now ?? Date.now();
    const prevSymbol = this.activeSymbol;
    const autoSnap = this.autonomy.getSnapshot();
    const policy = this.getEffectivePolicy();
    const allowedSymbols = this.getAllowedSymbols();

    if (params.source === 'MANUAL') {
      const res = this.requestManualOverride(
        params.targetSymbol || prevSymbol,
        params.onCommitSymbol ? (sym) => void params.onCommitSymbol!(sym, {
          previousSymbol: prevSymbol,
          decision: this.lastDecision || {
            action: 'SWITCH',
            currentSymbol: prevSymbol,
            targetSymbol: sym,
            currentScore: 0,
            targetScore: null,
            scoreDelta: 0,
            confirmationsCount: 1,
            confirmationsRequired: 1,
            cooldownRemainingSeconds: 0,
            rotationsThisSession: this.rotationsThisSession,
            maxRotationsPerSession: policy.maxRotationsPerSession,
            reason: params.reason || 'Manual selection',
            blockers: [],
            evaluatedAt: now,
          },
          acdeResult: null,
          candles: params.candlesBySymbol?.[sym] || [],
          source: 'MANUAL',
        }) : undefined
      );
      return {
        switched: res.switched,
        action: 'SWITCH',
        previousSymbol: prevSymbol,
        activeSymbol: res.activeSymbol,
        targetSymbol: res.activeSymbol,
        reason: 'Manual symbol override applied.',
        blockers: [],
        rolledBack: false,
      };
    }

    // 1. Central Autonomy Governance Check
    if (
      typeof params.requestGeneration === 'number' &&
      !this.autonomy.isGenerationCurrent(params.requestGeneration)
    ) {
      const reason = `Stale autonomous generation (${params.requestGeneration} != ${autoSnap.generation}); rotation cancelled.`;
      return {
        switched: false,
        action: 'BLOCKED',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: params.targetSymbol ?? null,
        reason,
        blockers: [reason],
        rolledBack: false,
      };
    }

    if (autoSnap.executionMode === 'MANUAL_ONLY') {
      const reason = `Autonomous rotation from ${params.source} blocked: executionMode is MANUAL_ONLY.`;
      return {
        switched: false,
        action: 'BLOCKED',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: params.targetSymbol ?? null,
        reason,
        blockers: [reason],
        rolledBack: false,
      };
    }

    if (autoSnap.lifecycle !== 'ACTIVE') {
      const reason = `Autonomous rotation from ${params.source} blocked: autonomy lifecycle is ${autoSnap.lifecycle}.`;
      return {
        switched: false,
        action: 'BLOCKED',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: params.targetSymbol ?? null,
        reason,
        blockers: [reason],
        rolledBack: false,
      };
    }

    if (!autoSnap.permissions.allowSymbolRotation) {
      const reason = `Autonomous rotation from ${params.source} blocked: allowSymbolRotation is disabled.`;
      return {
        switched: false,
        action: 'BLOCKED',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: params.targetSymbol ?? null,
        reason,
        blockers: [reason],
        rolledBack: false,
      };
    }

    if (!policy.enabled) {
      const reason = 'ASIRE autonomous rotation policy is disabled.';
      return {
        switched: false,
        action: 'BLOCKED',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: params.targetSymbol ?? null,
        reason,
        blockers: [reason],
        rolledBack: false,
      };
    }

    if (this.isPurchaseLockedFn()) {
      const reason = 'Purchase execution is currently in flight or pending reconciliation; rotation deferred.';
      return {
        switched: false,
        action: 'HOLD',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: params.targetSymbol ?? null,
        reason,
        blockers: ['PURCHASE_IN_FLIGHT'],
        rolledBack: false,
      };
    }

    if (this.transitionState === 'PENDING_VERIFICATION') {
      const reason = `Another symbol transition (${this.pendingTargetSymbol}) is already pending verification.`;
      return {
        switched: false,
        action: 'HOLD',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: params.targetSymbol ?? null,
        reason,
        blockers: ['TRANSITION_PENDING'],
        rolledBack: false,
      };
    }

    // 2. Resolve & verify target candidate against allowed universe and cooldowns
    const requestedTarget = params.targetSymbol?.trim() || null;
    if (requestedTarget && requestedTarget === prevSymbol) {
      return {
        switched: false,
        action: 'STAY',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: requestedTarget,
        reason: `${requestedTarget} is already the active symbol.`,
        blockers: [],
        rolledBack: false,
      };
    }

    if (requestedTarget && !allowedSymbols.includes(requestedTarget)) {
      const reason = `Requested symbol "${requestedTarget}" is outside operator permitted universe (${allowedSymbols.join(', ')}).`;
      auditLogger.record({
        type: 'HOLD_DECISION',
        symbol: requestedTarget,
        action: 'ASIRE_ROTATION_REJECTED_UNIVERSE',
        reason,
      });
      return {
        switched: false,
        action: 'BLOCKED',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: requestedTarget,
        reason,
        blockers: [reason],
        rolledBack: false,
      };
    }

    // Check cooldown & session rotation limit
    if (this.rotationsThisSession >= policy.maxRotationsPerSession) {
      const reason = `Max rotations per session reached (${this.rotationsThisSession}/${policy.maxRotationsPerSession}).`;
      return {
        switched: false,
        action: 'HOLD',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: requestedTarget,
        reason,
        blockers: ['MAX_ROTATIONS_REACHED'],
        rolledBack: false,
      };
    }

    const cooldownElapsed = this.lastRotationAt > 0 ? Math.floor((now - this.lastRotationAt) / 1000) : policy.cooldownSeconds;
    const cooldownRemaining = this.lastRotationAt > 0 ? Math.max(0, policy.cooldownSeconds - cooldownElapsed) : 0;
    if (cooldownRemaining > 0) {
      const reason = `ASIRE rotation cooldown active (${cooldownRemaining}s remaining).`;
      return {
        switched: false,
        action: 'HOLD',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: requestedTarget,
        reason,
        blockers: ['COOLDOWN_ACTIVE'],
        rolledBack: false,
      };
    }

    // Pick best eligible target if caller did not name one
    let targetSymbol = requestedTarget;
    if (!targetSymbol) {
      const eligibleAlts = Array.from(this.candidatesBySymbol.values())
        .filter((c) => c.eligible && c.symbol !== prevSymbol)
        .sort((a, b) => b.overallScore - a.overallScore);
      targetSymbol = eligibleAlts[0]?.symbol || null;
    }

    if (!targetSymbol) {
      const reason = 'No verified eligible target symbol available for rotation (HOLD).';
      return {
        switched: false,
        action: 'HOLD',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol: null,
        reason,
        blockers: ['NO_ELIGIBLE_TARGET'],
        rolledBack: false,
      };
    }

    // Quarantine check before async verification
    const preElig = this.evaluateEligibility({
      symbol: targetSymbol,
      snapshot: this.candidatesBySymbol.get(targetSymbol)?.snapshot || {
        symbol: targetSymbol,
        displayName: targetSymbol,
        latestPrice: 1,
        tickTimestamp: now,
        candleTimestamp: now,
        candleCount: 25,
        dataFreshnessMs: 0,
        isDataFresh: true,
        realizedVolatility: 0.002,
        baselineVolatility: 0.002,
        volatilityAcceleration: 1,
        marketRegime: { type: 'NEUTRAL', confidence: 0.5 },
        trendDirection: 'NEUTRAL',
        trendStrength: 0.5,
        momentumPersistence: 0.5,
        rsiNow: 50,
        bollingerBandwidth: 0.01,
        supportLevel: null,
        resistanceLevel: null,
        supportProximity: null,
        resistanceProximity: null,
        candlePattern: { pattern: 'NONE', strength: 0, signal: 'NEUTRAL' },
        priceActionQuality: 0.5,
        signalStability: 0.5,
        directionalConsistency: 0.5,
        mtfAgreement: 0.5,
        strategyConfidence: 0.5,
        recommendedAction: 'HOLD',
        spreadQuality: null,
        connectionHealthy: true,
        dataAvailable: true,
        stabilityIndex: 60,
      },
      allowedSymbols,
      now,
    });

    if (preElig.status === 'QUARANTINED') {
      const reason = preElig.reasons[0] || `Target ${targetSymbol} is quarantined.`;
      return {
        switched: false,
        action: 'BLOCKED',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol,
        reason,
        blockers: preElig.reasons,
        rolledBack: false,
      };
    }

    // 3. Enter Safe Two-Phase Transition: PENDING_VERIFICATION
    const captureAutonomyGen = autoSnap.generation;
    const captureTransGen = ++this.transitionGeneration;
    this.transitionState = 'PENDING_VERIFICATION';
    this.pendingTargetSymbol = targetSymbol;
    this.notify();

    try {
      // Phase A: Broker eligibility verification (active_symbols, contracts_for, fresh candles, optional proposal)
      const brokerCheck = await this.broker.verifySymbolEligibility({
        symbol: targetSymbol,
        contractType: 'CALL',
        maxDataAgeMs: policy.maxDataAgeMs,
        verifyProposalQuote: params.verifyProposalQuote,
      });

      // Re-check Stop / Pause / Manual override right after async broker await
      if (
        captureTransGen !== this.transitionGeneration ||
        !this.autonomy.isGenerationCurrent(captureAutonomyGen) ||
        this.autonomy.getLifecycle() !== 'ACTIVE' ||
        this.autonomy.getExecutionMode() === 'MANUAL_ONLY' ||
        !this.autonomy.getSnapshot().permissions.allowSymbolRotation
      ) {
        this.transitionState = 'ROLLED_BACK';
        this.pendingTargetSymbol = null;
        this.transitionState = 'IDLE';
        this.notify();
        return {
          switched: false,
          action: 'BLOCKED',
          previousSymbol: prevSymbol,
          activeSymbol: prevSymbol,
          targetSymbol,
          reason: 'Rotation cancelled mid-verification due to autonomy stop/pause/override.',
          blockers: ['AUTONOMY_REVOKED_MID_TRANSITION'],
          rolledBack: true,
        };
      }

      if (!brokerCheck.eligible) {
        const failReason = brokerCheck.reasons.join(' | ') || `Broker verification failed for ${targetSymbol}.`;
        this.recordSymbolFailure(targetSymbol, failReason, Date.now());
        this.transitionState = 'ROLLED_BACK';
        this.pendingTargetSymbol = null;
        this.notify();
        this.transitionState = 'IDLE';
        this.notify();
        auditLogger.record({
          type: 'HOLD_DECISION',
          symbol: targetSymbol,
          action: 'ASIRE_ROTATION_ROLLED_BACK',
          reason: `Verification failed for ${targetSymbol}: ${failReason}. Rolled back cleanly to ${prevSymbol}.`,
        });
        return {
          switched: false,
          action: 'HOLD',
          previousSymbol: prevSymbol,
          activeSymbol: prevSymbol,
          targetSymbol,
          reason: failReason,
          blockers: brokerCheck.reasons,
          rolledBack: true,
        };
      }

      // Phase B: Acquire target candles & recompute fresh snapshot + ACDE duration on target symbol
      let targetCandles = params.candlesBySymbol?.[targetSymbol];
      if ((!targetCandles || targetCandles.length < 20) && this.broker.getCachedSymbolCandles) {
        targetCandles = this.broker.getCachedSymbolCandles(targetSymbol)?.candles;
      }
      if ((!targetCandles || targetCandles.length < 20) && this.broker.fetchCandlesAsync) {
        targetCandles = await this.broker.fetchCandlesAsync(targetSymbol, 60, 120);
      }

      if (
        captureTransGen !== this.transitionGeneration ||
        !this.autonomy.isGenerationCurrent(captureAutonomyGen) ||
        this.autonomy.getLifecycle() !== 'ACTIVE'
      ) {
        this.transitionState = 'IDLE';
        this.pendingTargetSymbol = null;
        this.notify();
        return {
          switched: false,
          action: 'BLOCKED',
          previousSymbol: prevSymbol,
          activeSymbol: prevSymbol,
          targetSymbol,
          reason: 'Rotation aborted after candle fetch because autonomy is no longer active.',
          blockers: ['AUTONOMY_REVOKED_MID_TRANSITION'],
          rolledBack: true,
        };
      }

      if (!targetCandles || targetCandles.length < 20) {
        const failReason = `Insufficient verified candles (${targetCandles?.length || 0}/20) on ${targetSymbol} after switch check.`;
        this.recordSymbolFailure(targetSymbol, failReason, Date.now());
        this.transitionState = 'IDLE';
        this.pendingTargetSymbol = null;
        this.notify();
        return {
          switched: false,
          action: 'HOLD',
          previousSymbol: prevSymbol,
          activeSymbol: prevSymbol,
          targetSymbol,
          reason: failReason,
          blockers: ['DATA_UNAVAILABLE'],
          rolledBack: true,
        };
      }

      const prevCandles =
        params.candlesBySymbol?.[prevSymbol] ||
        (this.broker.getCachedSymbolCandles ? this.broker.getCachedSymbolCandles(prevSymbol)?.candles : undefined) ||
        [];

      const cachedTick = this.broker.getCachedSymbolTick ? this.broker.getCachedSymbolTick(targetSymbol) : null;
      const targetSnap = this.buildMarketSnapshot(
        {
          symbol: targetSymbol,
          candles: targetCandles,
          lastTickTimestamp: cachedTick?.receivedAt ?? cachedTick?.epoch,
          brokerAvailable: brokerCheck.brokerAvailable,
          contractsSupported: brokerCheck.contractsSupported,
          connectionHealthy: this.broker.isConnected ? this.broker.isConnected() : true,
          closedTrades: params.closedTrades,
          openTrades: params.openTrades,
        },
        {
          activeSymbolCandles: prevCandles,
          activeSymbolName: prevSymbol,
          now: Date.now(),
        }
      );

      // Recompute ACDE strictly on the new target symbol's volatility & regime
      const recomputedAcde = targetSnap.acdeResult;
      if (!targetSnap.isDataFresh || (recomputedAcde && recomputedAcde.action === 'HOLD' && targetCandles.length < 20)) {
        const failReason = `Target ${targetSymbol} failed fresh snapshot/ACDE verification (${recomputedAcde?.holdReason || 'stale data'}).`;
        this.recordSymbolFailure(targetSymbol, failReason, Date.now());
        this.transitionState = 'IDLE';
        this.pendingTargetSymbol = null;
        this.notify();
        return {
          switched: false,
          action: 'HOLD',
          previousSymbol: prevSymbol,
          activeSymbol: prevSymbol,
          targetSymbol,
          reason: failReason,
          blockers: ['STALE_OR_ACDE_HOLD'],
          rolledBack: true,
        };
      }

      // Compute final ranking comparison for learning & audit record
      const targetRank = this.rankCandidate({
        symbol: targetSymbol,
        snapshot: targetSnap,
        closedTrades: params.closedTrades,
        openTrades: params.openTrades,
        policy,
        now: Date.now(),
      });
      const prevScore = this.candidatesBySymbol.get(prevSymbol)?.overallScore ?? 50;
      const finalDecision: RotationDecisionResult = {
        action: 'SWITCH',
        currentSymbol: prevSymbol,
        targetSymbol,
        currentScore: prevScore,
        targetScore: targetRank.overallScore,
        scoreDelta: Number((targetRank.overallScore - prevScore).toFixed(2)),
        confirmationsCount: Math.max(1, this.confirmationStreak.count),
        confirmationsRequired: policy.confirmationEvaluations,
        cooldownRemainingSeconds: 0,
        rotationsThisSession: this.rotationsThisSession + 1,
        maxRotationsPerSession: policy.maxRotationsPerSession,
        reason: params.reason || `Verified ASIRE switch to ${targetSymbol} (score ${targetRank.overallScore.toFixed(1)}).`,
        blockers: [],
        correlation: targetSnap.correlationWithActive ?? null,
        evaluatedAt: Date.now(),
      };

      // Commit the symbol transition atomically
      this.activeSymbol = targetSymbol;
      this.lastRotationAt = Date.now();
      this.lastRotationReason = finalDecision.reason;
      this.rotationsThisSession += 1;
      this.lastDecision = finalDecision;
      this.confirmationStreak = { symbol: '', count: 0 };
      this.transitionState = 'IDLE';
      this.pendingTargetSymbol = null;

      // Clear any soft pre-quarantine failure count on successful verified switch
      const q = this.quarantines.get(targetSymbol);
      if (q && !q.quarantined && q.failureCount > 0) {
        this.quarantines.delete(targetSymbol);
      }

      // Record learning entry for post-trade evaluation
      const learnEntry: RotationLearningRecord = {
        id: `rot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: this.lastRotationAt,
        source: params.source,
        previousSymbol: prevSymbol,
        nextSymbol: targetSymbol,
        previousScore: prevScore,
        nextScore: targetRank.overallScore,
        scoreDelta: finalDecision.scoreDelta,
        reason: finalDecision.reason,
        regime: targetSnap.marketRegime.type,
        strategyVersion: this.configManager.getSnapshot().activeStrategyVersion,
        durationRecommendation: recomputedAcde?.recommendation ?? null,
        confidence: Math.round(targetSnap.strategyConfidence * 100),
        followedByTrade: false,
        correlationAtSwitch: targetSnap.correlationWithActive ?? null,
      };
      this.learningRecords.unshift(learnEntry);
      if (this.learningRecords.length > MAX_LEARNING_RECORDS) {
        this.learningRecords = this.learningRecords.slice(0, MAX_LEARNING_RECORDS);
      }
      this.persistState();

      if (params.onCommitSymbol) {
        await params.onCommitSymbol(targetSymbol, {
          previousSymbol: prevSymbol,
          decision: finalDecision,
          acdeResult: recomputedAcde ?? null,
          candles: targetCandles,
          source: params.source,
        });
      }

      auditLogger.record({
        type: 'SYMBOL_ROTATION',
        symbol: targetSymbol,
        action: `ASIRE_SWITCH_${params.source}`,
        reason: `${finalDecision.reason} [ACDE: ${recomputedAcde ? `${recomputedAcde.duration} ${recomputedAcde.unit}` : 'baseline'}, Corr: ${targetSnap.correlationWithActive?.status || 'UNKNOWN'}]`,
        consensusScore: Math.round(targetRank.overallScore),
      });

      this.memory.upsert({
        category: 'OPERATIONAL',
        trustSource: 'VERIFIED_FACT',
        key: `asire_rotation_${this.lastRotationAt}`,
        title: `ASIRE Switch: ${prevSymbol} → ${targetSymbol}`,
        summary: `${finalDecision.reason}. Recomputed ACDE=${recomputedAcde?.duration ?? '?'}${recomputedAcde?.unit ?? ''}.`,
        symbol: targetSymbol,
        regime: targetSnap.marketRegime.type,
      });

      this.notify();
      return {
        switched: true,
        action: 'SWITCH',
        previousSymbol: prevSymbol,
        activeSymbol: targetSymbol,
        targetSymbol,
        reason: finalDecision.reason,
        blockers: [],
        rolledBack: false,
        acdeResult: recomputedAcde ?? null,
        decision: finalDecision,
      };
    } catch (err: any) {
      const msg = String(err?.message || err || 'Rotation verification exception');
      this.recordSymbolFailure(targetSymbol, msg, Date.now());
      this.transitionState = 'IDLE';
      this.pendingTargetSymbol = null;
      this.notify();
      return {
        switched: false,
        action: 'HOLD',
        previousSymbol: prevSymbol,
        activeSymbol: prevSymbol,
        targetSymbol,
        reason: `Rotation verification error: ${msg}. Rolled back cleanly to ${prevSymbol}.`,
        blockers: [msg],
        rolledBack: true,
      };
    }
  }

  /**
   * Links settled trade outcomes back to the most recent unlinked rotation to that symbol,
   * enabling out-of-sample learning verification without touching risk caps or allowedSymbols.
   */
  public recordTradeSettlement(trade: TradeRecord): void {
    if (!trade || trade.result === 'PENDING') return;
    const tradeTs = Date.parse(trade.timestamp || '');
    const targetRec = this.learningRecords.find(
      (r) =>
        r.nextSymbol === trade.symbol &&
        !r.followedByTrade &&
        (!Number.isFinite(tradeTs) || tradeTs >= r.timestamp - 5000)
    );
    if (!targetRec) return;

    const outcome: RotationLearningRecord['contractOutcome'] = trade.earlyExited
      ? 'SOLD'
      : trade.result === 'WIN'
      ? 'WIN'
      : 'LOSS';
    targetRec.followedByTrade = true;
    targetRec.tradeId = trade.id;
    targetRec.contractOutcome = outcome;
    targetRec.actualHoldingMs = trade.actualHoldingMs;
    targetRec.pnl = trade.profit;
    targetRec.outcomeDelta = Number(((trade.profit || 0) / Math.max(0.35, trade.amount || 1)).toFixed(3));
    this.persistState();
    this.notify();
  }

  public getLearningRecords(): RotationLearningRecord[] {
    return [...this.learningRecords];
  }

  public getSnapshot(): ASIRESnapshot {
    const policy = this.getEffectivePolicy();
    const now = Date.now();
    const elapsedSec = this.lastRotationAt > 0 ? Math.floor((now - this.lastRotationAt) / 1000) : policy.cooldownSeconds;
    const cooldownRemainingSeconds = this.lastRotationAt > 0
      ? Math.max(0, policy.cooldownSeconds - elapsedSec)
      : 0;

    const quarantinedObj: Record<string, SymbolQuarantineState> = {};
    for (const [k, v] of this.quarantines.entries()) {
      quarantinedObj[k] = { ...v };
    }

    const candidates = Array.from(this.candidatesBySymbol.values()).sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.overallScore - a.overallScore;
    });

    const followed = this.learningRecords.filter((r) => r.followedByTrade);
    const wins = followed.filter((r) => r.contractOutcome === 'WIN' || (r.pnl ?? 0) > 0).length;
    const netPnL = followed.reduce((s, r) => s + (r.pnl ?? 0), 0);

    return {
      enabled: policy.enabled,
      transitionState: this.transitionState,
      pendingTargetSymbol: this.pendingTargetSymbol,
      activeSymbol: this.activeSymbol,
      lastDecision: this.lastDecision,
      candidates,
      quarantinedSymbols: quarantinedObj,
      rotationsThisSession: this.rotationsThisSession,
      cooldownRemainingSeconds,
      lastRotationAt: this.lastRotationAt,
      lastRotationReason: this.lastRotationReason,
      lastEvaluatedAt: this.lastEvaluatedAt,
      policy,
      learningSummary: {
        totalRotations: this.learningRecords.length,
        followedTrades: followed.length,
        winRateAfterRotation: followed.length > 0 ? Number(((wins / followed.length) * 100).toFixed(1)) : 0,
        netPnLAfterRotation: Number(netPnL.toFixed(2)),
      },
    };
  }

  public subscribe(listener: (snapshot: ASIRESnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private loadPersistedState(): void {
    if (!this.storage) return;
    try {
      const rawLearn = this.storage.getItem(LEARNING_STORAGE_KEY);
      if (rawLearn) {
        const parsed = JSON.parse(rawLearn);
        if (Array.isArray(parsed)) {
          this.learningRecords = parsed.slice(0, MAX_LEARNING_RECORDS);
        }
      }
      const rawQuar = this.storage.getItem(QUARANTINE_STORAGE_KEY);
      if (rawQuar) {
        const parsedQ = JSON.parse(rawQuar);
        if (parsedQ && typeof parsedQ === 'object') {
          for (const [k, v] of Object.entries(parsedQ)) {
            if (v && typeof v === 'object') {
              this.quarantines.set(k, v as SymbolQuarantineState);
            }
          }
        }
      }
    } catch {
      // Ignore corrupt persisted cache
    }
  }

  private persistState(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        LEARNING_STORAGE_KEY,
        JSON.stringify(sanitizeForPersistence(this.learningRecords))
      );
      const qObj: Record<string, SymbolQuarantineState> = {};
      for (const [k, v] of this.quarantines.entries()) {
        qObj[k] = v;
      }
      this.storage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(sanitizeForPersistence(qObj)));
    } catch {
      // Ignore quota errors
    }
  }
}

export const symbolIntelligenceEngine = new SymbolIntelligenceEngine();
